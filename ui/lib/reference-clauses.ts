/**
 * Inline reference clauses — putting the role tokens where the model reads them.
 *
 * The reference role map (see `buildReferenceCue`) is real and correct, but it is
 * appended AFTER the prompt as a `Reference roles:` block. For a JSON prompt that
 * means the model receives a serialized object followed by loose prose, and the
 * prose loses. Operators read that as "it ignores my reference images".
 *
 * So the clause goes where the prompt already talks about that subject: a
 * character reference lands in the subject description, a pose reference in the
 * position field, an environment reference in `environment`. In a natural-language
 * prompt there are no fields, so the clauses join as one trailing sentence.
 *
 * NOT YET WIRED — deliberately. The authoritative compose happens server-side in
 * `run-plan.ts`, but `normalizedReferences` there reduces references to a
 * `string[]` of image values: the ROLES never cross the wire, only the prose cue
 * does. Wiring this needs the run-plan payload to carry `[{ token, role }]` so
 * every prompt path (typed, library, combo) composes the same way. Applying it
 * client-side alone would cover typed prompts only, and preview would disagree
 * with what actually generates — worse than not applying it at all.
 *
 * Rules that keep this safe to run on EVERY generation, once wired:
 *   - idempotent: a token already present anywhere in the prompt is never added
 *     again, so a hand-placed @char wins and re-composing does not stack clauses;
 *   - non-destructive: an existing value is appended to, never replaced;
 *   - total: an unparseable prompt, a missing path, or an unexpected shape falls
 *     back rather than throwing — prompt composition must not be able to fail.
 */

import { normalizeReferenceRole, referenceTargetToken } from "@/lib/reference-roles";
import type { ReferenceImage, ReferenceRole } from "@/lib/types";

type ClauseSpec = {
  /** Where the clause belongs in a JSON prompt. */
  path: readonly string[];
  /** The clause itself, given the reference's token. */
  text: (token: string) => string;
};

/**
 * Paths follow the prompt object this repo actually produces
 * (`buildComboPromptObject`): subjects[0].{description,position}, plus top-level
 * style / environment / composition.
 */
const ROLE_CLAUSES: Record<ReferenceRole, ClauseSpec> = {
  character: {
    path: ["subjects", "0", "description"],
    text: (token) => `identity, silhouette and costume matching ${token}`
  },
  pose: {
    path: ["subjects", "0", "position"],
    text: (token) => `posed and framed as ${token}`
  },
  environment: {
    path: ["environment"],
    text: (token) => `environment matching ${token}`
  },
  style: {
    path: ["style"],
    text: (token) => `rendered in the style of ${token}`
  },
  loose: {
    path: ["composition"],
    text: (token) => `secondary detail cues from ${token}`
  }
};

/** Emission order, so a prompt reads subject → pose → world → look. */
const ROLE_ORDER: ReferenceRole[] = ["character", "pose", "environment", "style", "loose"];

export type ReferenceClause = {
  role: ReferenceRole;
  token: string;
  text: string;
  path: readonly string[];
};

/**
 * One clause per populated reference, deduplicated by token. A reference with no
 * image value is not a reference yet, and contributes nothing.
 */
export function referenceClauses(references: ReferenceImage[] | undefined): ReferenceClause[] {
  if (!Array.isArray(references)) return [];
  const seenTokens = new Set<string>();
  const clauses: ReferenceClause[] = [];

  references.forEach((reference, index) => {
    if (!reference?.value) return;
    const role = normalizeReferenceRole(reference.role, index);
    const token = referenceTargetToken(reference, index);
    if (!token || seenTokens.has(token)) return;
    seenTokens.add(token);
    const spec = ROLE_CLAUSES[role];
    if (!spec) return;
    clauses.push({ role, token, text: spec.text(token), path: spec.path });
  });

  return clauses.sort((left, right) => ROLE_ORDER.indexOf(left.role) - ROLE_ORDER.indexOf(right.role));
}

function appendClause(existing: unknown, clause: string) {
  if (typeof existing !== "string" || !existing.trim()) return clause;
  return /[;,.]\s*$/.test(existing.trim()) ? `${existing.trim()} ${clause}` : `${existing.trim()}; ${clause}`;
}

/**
 * Writes the clause at `path`, creating intermediate plain objects only when the
 * whole ancestry is already object-shaped. Anything unexpected (an array where an
 * object belongs, a number leaf) is refused so a hand-authored prompt is never
 * mangled — the caller then routes that clause to the fallback list.
 */
function writeAtPath(root: Record<string, unknown>, path: readonly string[], clause: string): boolean {
  if (!path.length) return false;
  let cursor: any = root;

  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    const next = cursor[key];
    if (next === undefined || next === null) {
      // Only invent a container when the next segment tells us which kind.
      cursor[key] = /^\d+$/.test(path[index + 1]) ? [] : {};
    } else if (typeof next !== "object") {
      return false;
    }
    cursor = cursor[key];
  }

  const leaf = path[path.length - 1];
  const current = cursor[leaf];
  if (current !== undefined && current !== null && typeof current !== "string") return false;
  cursor[leaf] = appendClause(current, clause);
  return true;
}

/** Joins clauses into the trailing sentence a natural-language prompt gets. */
export function naturalClauseSentence(clauses: ReferenceClause[]): string {
  if (!clauses.length) return "";
  return `${clauses.map((clause) => clause.text).join(", ")}.`;
}

/**
 * Applies clauses to a prompt, choosing the spot by prompt shape: fields for a
 * JSON prompt, a trailing sentence for a natural one. Returns the prompt
 * unchanged when there is nothing to add.
 */
export function applyReferenceClauses(promptText: string, references: ReferenceImage[] | undefined): string {
  const clauses = referenceClauses(references);
  if (!clauses.length) return promptText;

  // Idempotence: a token already in the prompt was placed deliberately (or by a
  // previous compose) and is left alone.
  const pending = clauses.filter((clause) => !promptText.includes(clause.token));
  if (!pending.length) return promptText;

  let parsed: unknown;
  try {
    parsed = JSON.parse(promptText);
  } catch {
    parsed = null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    const sentence = naturalClauseSentence(pending);
    const base = promptText.trim();
    if (!base) return sentence;
    return /[.!?]$/.test(base) ? `${base} ${sentence}` : `${base}. ${sentence}`;
  }

  const next = JSON.parse(JSON.stringify(parsed)) as Record<string, unknown>;
  const unplaced: ReferenceClause[] = [];
  for (const clause of pending) {
    if (!writeAtPath(next, clause.path, clause.text)) unplaced.push(clause);
  }

  // A clause with nowhere structural to go still has to reach the model.
  if (unplaced.length) {
    const existing = Array.isArray(next.reference_roles) ? (next.reference_roles as unknown[]) : [];
    next.reference_roles = [...existing, ...unplaced.map((clause) => clause.text)];
  }

  return JSON.stringify(next, null, 2);
}
