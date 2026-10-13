import fs from 'node:fs';
import path from 'node:path';
import { app, dialog } from 'electron';
import {
  createEmptyProject,
  parseProject,
  PROJECT_FILE_EXTENSION,
  serializeProject,
} from '../../shared/project';
import type { OpenProjectResult, ProjectDocument, RecentProject, SaveProjectResult } from '../../shared/types';

function getRecentProjectsPath(): string {
  return path.join(app.getPath('userData'), 'recent-projects.json');
}

export async function getRecentProjects(): Promise<RecentProject[]> {
  try {
    const file = getRecentProjectsPath();
    if (!fs.existsSync(file)) return [];
    const raw = await fs.promises.readFile(file, 'utf8');
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter((p) => p && typeof p.path === 'string' && fs.existsSync(p.path));
  } catch {
    return [];
  }
}

export async function addRecentProject(projPath: string, title: string): Promise<void> {
  try {
    const existing = await getRecentProjects();
    const updated = [
      { path: projPath, title, openedAt: new Date().toISOString() },
      ...existing.filter((p) => p.path !== projPath),
    ].slice(0, 10);
    await fs.promises.writeFile(getRecentProjectsPath(), JSON.stringify(updated, null, 2), 'utf8');
  } catch {
    // ignore
  }
}

export async function saveProjectToFile(project: ProjectDocument, targetPath?: string): Promise<SaveProjectResult> {
  let finalPath = targetPath;
  if (!finalPath) {
    const res = await dialog.showSaveDialog({
      title: 'Simpan Proyek NIGI Looping Pro',
      defaultPath: `${project.title || 'Proyek'}.${PROJECT_FILE_EXTENSION}`,
      filters: [{ name: 'Nigi Loop Project', extensions: [PROJECT_FILE_EXTENSION] }],
    });
    if (res.canceled || !res.filePath) {
      return { ok: false, canceled: true };
    }
    finalPath = res.filePath;
  }

  try {
    const updated = {
      ...project,
      updatedAt: new Date().toISOString(),
    };
    const content = serializeProject(updated);
    await fs.promises.writeFile(finalPath, content, 'utf8');
    await addRecentProject(finalPath, updated.title);
    return { ok: true, path: finalPath };
  } catch (err: unknown) {
    return {
      ok: false,
      errorCode: 'SAVE_FAILED',
      errorDetail: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function openProjectFromFile(chosenPath?: string): Promise<OpenProjectResult> {
  let target = chosenPath;
  if (!target) {
    const res = await dialog.showOpenDialog({
      title: 'Buka Proyek NIGI Looping Pro',
      filters: [{ name: 'Nigi Loop Project', extensions: [PROJECT_FILE_EXTENSION, 'json'] }],
      properties: ['openFile'],
    });
    if (res.canceled || !res.filePaths.length) {
      return { ok: false, canceled: true };
    }
    target = res.filePaths[0];
  }

  if (!target || !fs.existsSync(target)) {
    return {
      ok: false,
      errorCode: 'FILE_NOT_FOUND',
      errorDetail: 'Berkas proyek tidak ditemukan.',
    };
  }

  try {
    const content = await fs.promises.readFile(target, 'utf8');
    const project = parseProject(content);
    await addRecentProject(target, project.title);
    return { ok: true, path: target, project };
  } catch (err: unknown) {
    return {
      ok: false,
      errorCode: 'PARSE_FAILED',
      errorDetail: err instanceof Error ? err.message : String(err),
    };
  }
}

export function createNewProject(title?: string): ProjectDocument {
  return createEmptyProject(title);
}
