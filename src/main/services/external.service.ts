import { shell } from 'electron';
import type { OpenExternalResult } from '../../shared/types';
import { logDiagnostic } from './diagnostic.service';

/**
 * Hostnames the renderer is allowed to open in the user's default browser.
 * Anything else is rejected in the main process.
 */
export const EXTERNAL_HOST_ALLOWLIST: readonly string[] = [
  'instagram.com',
  'www.instagram.com',
  'tiktok.com',
  'www.tiktok.com',
  'github.com',
  'www.github.com',
  'saweria.co',
  'www.saweria.co',
];

export function validateExternalUrl(input: unknown): OpenExternalResult & { url?: string } {
  if (typeof input !== 'string' || input.length > 2048) {
    return { ok: false, errorCode: 'INVALID_URL' };
  }
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return { ok: false, errorCode: 'INVALID_URL' };
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    return { ok: false, errorCode: 'INVALID_URL' };
  }
  if (!EXTERNAL_HOST_ALLOWLIST.includes(parsed.hostname.toLowerCase())) {
    return { ok: false, errorCode: 'DOMAIN_NOT_ALLOWED' };
  }
  return { ok: true, url: parsed.toString() };
}

export async function openExternalSafe(input: unknown): Promise<OpenExternalResult> {
  const check = validateExternalUrl(input);
  if (!check.ok || !check.url) {
    logDiagnostic('EXTERNAL_URL_REJECTED', { url: String(input).slice(0, 200), reason: check.errorCode });
    return { ok: false, errorCode: check.errorCode };
  }
  try {
    await shell.openExternal(check.url);
    return { ok: true };
  } catch (err) {
    logDiagnostic('EXTERNAL_URL_OPEN_FAILED', {
      url: check.url,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, errorCode: 'OPEN_FAILED' };
  }
}
