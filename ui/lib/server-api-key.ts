import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export type ApiKeySource = "request" | "env:BFL_API_KEY" | "env:FLUX_API_KEY" | "macos-keychain" | "missing";

export type ApiKeyStatus = {
  configured: boolean;
  source: ApiKeySource;
  browserOverrideAllowed: boolean;
  keychain: {
    available: boolean;
    configured: boolean;
    canWrite: boolean;
    service: string;
  };
};

const KEYCHAIN_SERVICE = process.env.BFL_KEYCHAIN_SERVICE?.trim() || "BFL Dashboard FLUX API Key";
const KEYCHAIN_ACCOUNT =
  process.env.BFL_KEYCHAIN_ACCOUNT?.trim() || process.env.USER?.trim() || process.env.LOGNAME?.trim() || "local-user";

function isMacOs() {
  return process.platform === "darwin";
}

function envApiKey() {
  const bflKey = process.env.BFL_API_KEY?.trim();
  if (bflKey) return { apiKey: bflKey, source: "env:BFL_API_KEY" as const };
  const fluxKey = process.env.FLUX_API_KEY?.trim();
  if (fluxKey) return { apiKey: fluxKey, source: "env:FLUX_API_KEY" as const };
  return null;
}

function assertUsableApiKey(value: unknown) {
  if (typeof value !== "string") throw new Error("API key must be a string.");
  const apiKey = value.trim();
  if (apiKey.length < 12) throw new Error("API key looks too short.");
  return apiKey;
}

async function runSecurity(args: string[]) {
  return execFile("/usr/bin/security", args, {
    timeout: 10_000,
    maxBuffer: 32 * 1024
  });
}

export function keychainConfig() {
  return {
    available: isMacOs(),
    service: KEYCHAIN_SERVICE
  };
}

export async function hasMacOsKeychainApiKey() {
  if (!isMacOs()) return false;
  try {
    await runSecurity(["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT]);
    return true;
  } catch {
    return false;
  }
}

export async function readMacOsKeychainApiKey() {
  if (!isMacOs()) return "";
  try {
    const { stdout } = await runSecurity(["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT, "-w"]);
    return stdout.trim();
  } catch {
    return "";
  }
}

export async function writeMacOsKeychainApiKey(value: unknown) {
  if (!isMacOs()) throw new Error("macOS Keychain storage is only available on macOS.");
  const apiKey = assertUsableApiKey(value);
  await runSecurity([
    "add-generic-password",
    "-U",
    "-s",
    KEYCHAIN_SERVICE,
    "-a",
    KEYCHAIN_ACCOUNT,
    "-l",
    KEYCHAIN_SERVICE,
    "-D",
    "application password",
    "-j",
    "Local FLUX API key for the BFL Dashboard. The dashboard never returns the raw key.",
    "-w",
    apiKey
  ]);
}

export async function deleteMacOsKeychainApiKey() {
  if (!isMacOs()) throw new Error("macOS Keychain storage is only available on macOS.");
  try {
    await runSecurity(["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT]);
    return true;
  } catch {
    return false;
  }
}

export async function resolveApiKeyWithSource(bodyKey?: string) {
  const requestKey = bodyKey?.trim();
  if (requestKey) return { apiKey: requestKey, source: "request" as const };

  const fromEnv = envApiKey();
  if (fromEnv) return fromEnv;

  const keychainKey = await readMacOsKeychainApiKey();
  if (keychainKey) return { apiKey: keychainKey, source: "macos-keychain" as const };

  return { apiKey: "", source: "missing" as const };
}

export async function apiKeyStatus(): Promise<ApiKeyStatus> {
  const fromEnv = envApiKey();
  const keychainConfigured = await hasMacOsKeychainApiKey();
  return {
    configured: Boolean(fromEnv || keychainConfigured),
    source: fromEnv?.source || (keychainConfigured ? "macos-keychain" : "missing"),
    browserOverrideAllowed: true,
    keychain: {
      ...keychainConfig(),
      configured: keychainConfigured,
      canWrite: isMacOs()
    }
  };
}
