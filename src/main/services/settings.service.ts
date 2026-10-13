import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { AppSettings } from '../../shared/types';

/**
 * Persistent app preferences, stored as JSON in Electron's userData directory
 * (same convention as recent-projects.json). Survives app restarts and reboots.
 */

export const DEFAULT_SETTINGS: AppSettings = {
  showWelcomeOnStartup: true,
};

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'app-settings.json');
}

/** Keep only known keys with correct types; fall back to defaults otherwise. */
export function sanitizeSettings(raw: unknown): AppSettings {
  const result: AppSettings = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.showWelcomeOnStartup === 'boolean') {
      result.showWelcomeOnStartup = obj.showWelcomeOnStartup;
    }
  }
  return result;
}

export async function getSettings(): Promise<AppSettings> {
  try {
    const file = getSettingsPath();
    if (!fs.existsSync(file)) return { ...DEFAULT_SETTINGS };
    const raw = await fs.promises.readFile(file, 'utf8');
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function updateSettings(patch: unknown): Promise<AppSettings> {
  const current = await getSettings();
  const merged = sanitizeSettings({
    ...current,
    ...(patch && typeof patch === 'object' ? patch : {}),
  });
  const file = getSettingsPath();
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  // Write to a temp file then rename to avoid a half-written settings file.
  const tmp = `${file}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(merged, null, 2), 'utf8');
  await fs.promises.rename(tmp, file);
  return merged;
}
