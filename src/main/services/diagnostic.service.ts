import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export interface DiagnosticLogEntry {
  timestamp: string;
  isPackaged: boolean;
  event: string;
  data: Record<string, unknown>;
}

let logFilePath: string | null = null;

export function getDiagnosticLogPath(): string {
  if (logFilePath) return logFilePath;
  try {
    const dir = path.join(app.getPath('userData'), 'logs');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    logFilePath = path.join(dir, 'nigi-diagnostics.log');
    return logFilePath;
  } catch {
    const fallbackDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(fallbackDir)) {
      fs.mkdirSync(fallbackDir, { recursive: true });
    }
    logFilePath = path.join(fallbackDir, 'nigi-diagnostics.log');
    return logFilePath;
  }
}

export function logDiagnostic(event: string, data: Record<string, unknown>): void {
  const entry: DiagnosticLogEntry = {
    timestamp: new Date().toISOString(),
    isPackaged: Boolean(app && app.isPackaged),
    event,
    data,
  };

  const line = JSON.stringify(entry) + '\n';
  const targetFile = getDiagnosticLogPath();

  try {
    fs.appendFileSync(targetFile, line, 'utf-8');
  } catch (err) {
    console.warn('[diagnostics] Failed to write log:', err);
  }
}

export function getRecentDiagnostics(limit = 100): DiagnosticLogEntry[] {
  const targetFile = getDiagnosticLogPath();
  if (!fs.existsSync(targetFile)) return [];

  try {
    const content = fs.readFileSync(targetFile, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const recent = lines.slice(-limit);
    return recent.map((l) => JSON.parse(l) as DiagnosticLogEntry);
  } catch {
    return [];
  }
}
