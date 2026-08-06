/**
 * `{placeholder}` handling for fill-in-the-blank prompt templates.
 *
 * One module owns the pattern so the authoring UI, the Video Script picker, and
 * the planner all agree on what "still has a blank in it" means. The guard is
 * the point: a prompt with an uncompiled placeholder must never reach a paid
 * generation, because `{style}` would be sent to the provider verbatim.
 *
 * The pattern is deliberately narrow — `{` + identifier + `}` — so JSON prompt
 * bodies (`{"species": ...}`) and prose braces are never mistaken for blanks.
 */

const PLACEHOLDER_PATTERN = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

/** Unique placeholder names in first-appearance order. */
export function extractPlaceholders(text: string): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    if (!found.includes(match[1])) found.push(match[1]);
  }
  return found;
}

/** `camera_move` -> "Camera move"; `t1` -> "T1". Used for the small field labels. */
export function placeholderLabel(name: string): string {
  const words = name.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Substitutes the supplied values. A missing or blank value leaves the token in
 * place on purpose: an unfilled blank has to stay visible to the guard rather
 * than silently collapsing into an empty string mid-sentence.
 */
export function compilePromptText(text: string, values: Record<string, string | undefined>): string {
  if (!text) return "";
  return text.replace(PLACEHOLDER_PATTERN, (token, name: string) => {
    const value = values[name];
    return typeof value === "string" && value.trim() ? value.trim() : token;
  });
}

/** Placeholders still present after compilation. Empty means the prompt is ready. */
export function uncompiledPlaceholders(text: string): string[] {
  return extractPlaceholders(text);
}

/** True when every blank has been filled. */
export function isPromptCompiled(text: string): boolean {
  return extractPlaceholders(text).length === 0;
}

/**
 * Human-readable blocker for a prompt that still has blanks, or null when it is
 * ready. Callers show this and refuse to enqueue.
 */
export function promptPlaceholderIssue(text: string): string | null {
  const pending = extractPlaceholders(text);
  if (!pending.length) return null;
  const list = pending.map((name) => `{${name}}`).join(", ");
  return pending.length === 1
    ? `Fill in ${list} before this prompt can generate.`
    : `Fill in ${pending.length} remaining blanks (${list}) before this prompt can generate.`;
}

/** Same blocker, named for a specific prompt record, for list-level warnings. */
export function promptRecordPlaceholderIssue(id: string, text: string): string | null {
  const issue = promptPlaceholderIssue(text);
  return issue ? `${id}: ${issue}` : null;
}

/**
 * Deletes one `{name}` blank because the user decided they don't need that
 * variable, then tidies the wound: doubled spaces, a comma left hanging
 * against punctuation, an empty parenthesis, or a dangling dash at the end of
 * a beat line all collapse so the sentence stays readable.
 */
export function removePlaceholder(text: string, name: string): string {
  if (!text) return "";
  let next = text.split(`{${name}}`).join("");
  next = next
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/,\s*([,.;:!?])/g, "$1")
    .replace(/(^|\n)[ \t]*[,;:][ \t]*/g, "$1")
    .replace(/[ \t]*[—–-][ \t]*(?=\n|$)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n");
  return next;
}
