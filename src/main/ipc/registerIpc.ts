import fs from 'node:fs';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import type {
  AppInfo,
  ExportRequest,
  ProjectDocument,
  ProxyJobUpdate,
  SeamAnalysisRequest,
} from '../../shared/types';
import { checkFfmpegStatus } from '../services/ffmpeg.service';
import {
  cancelExportJob,
  openExportDestination,
  playExportFile,
  startExport,
} from '../services/export.service';
import { analyzeSeamCandidates, generateLoopPreview } from '../services/loop.service';
import {
  generatePreviewProxy,
  inspectAndImportFile,
  openMediaFilesDialog,
} from '../services/media.service';
import {
  createNewProject,
  getRecentProjects,
  openProjectFromFile,
  saveProjectToFile,
} from '../services/project.service';
import {
  getDiagnosticLogPath,
  getRecentDiagnostics,
  logDiagnostic,
} from '../services/diagnostic.service';
import { getSettings, updateSettings } from '../services/settings.service';
import { openExternalSafe } from '../services/external.service';

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  // Diagnostics
  ipcMain.handle('diagnostics:log', (_event, eventName: string, data: Record<string, unknown>) => {
    logDiagnostic(eventName, data);
  });

  ipcMain.handle('diagnostics:get', () => {
    return getRecentDiagnostics();
  });

  ipcMain.handle('diagnostics:getLogPath', () => {
    return getDiagnosticLogPath();
  });
  // App info & system
  ipcMain.handle('app:getInfo', (): AppInfo => {
    return {
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron ?? 'unknown',
      packaged: app.isPackaged,
    };
  });

  ipcMain.handle('app:checkFfmpeg', async () => {
    return checkFfmpegStatus();
  });

  // Settings (persisted in userData/app-settings.json)
  ipcMain.handle('settings:get', async () => {
    return getSettings();
  });

  ipcMain.handle('settings:update', async (_event, patch: unknown) => {
    return updateSettings(patch);
  });

  // External links: validated against an https hostname allowlist in main process
  ipcMain.handle('shell:openExternal', async (_event, url: unknown) => {
    return openExternalSafe(url);
  });

  // Media
  ipcMain.handle('media:openDialog', async () => {
    return openMediaFilesDialog();
  });

  ipcMain.handle('media:inspectFile', async (_event, filePath: string) => {
    return inspectAndImportFile(filePath);
  });

  ipcMain.handle('media:generateProxy', async (_event, filePath: string) => {
    return generatePreviewProxy(filePath, (update: ProxyJobUpdate) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('media:proxyProgress', update);
      }
    });
  });

  // Project
  ipcMain.handle('project:new', (_event, title?: string) => {
    return createNewProject(title);
  });

  ipcMain.handle('project:open', async (_event, filePath?: string) => {
    return openProjectFromFile(filePath);
  });

  ipcMain.handle('project:save', async (_event, project: ProjectDocument, filePath?: string) => {
    return saveProjectToFile(project, filePath);
  });

  ipcMain.handle('project:getRecents', async () => {
    return getRecentProjects();
  });

  // Export
  ipcMain.handle('export:chooseOutputLocation', async (_event, defaultName: string, container: string) => {
    const ext = container.toLowerCase();
    const filterMap: Record<string, { name: string; extensions: string[] }> = {
      mp4: { name: 'Video MP4 (H.264/AAC)', extensions: ['mp4'] },
      mov: { name: 'Video QuickTime (MOV)', extensions: ['mov'] },
      mkv: { name: 'Video Matroska (MKV)', extensions: ['mkv'] },
      webm: { name: 'Video WebM (VP9/Opus)', extensions: ['webm'] },
      gif: { name: 'Animasi GIF', extensions: ['gif'] },
      mp3: { name: 'Audio MP3', extensions: ['mp3'] },
      wav: { name: 'Audio WAV (PCM)', extensions: ['wav'] },
      m4a: { name: 'Audio M4A (AAC)', extensions: ['m4a'] },
    };

    const targetFilter = filterMap[ext] ?? { name: `Berkas ${ext.toUpperCase()}`, extensions: [ext] };

    const res = await dialog.showSaveDialog(mainWindow, {
      title: 'Pilih Lokasi Simpan Ekspor',
      defaultPath: `${defaultName}.${ext}`,
      filters: [
        targetFilter,
        { name: 'Semua Berkas (*.*)', extensions: ['*'] },
      ],
    });
    if (res.canceled || !res.filePath) return null;
    return res.filePath;
  });

  ipcMain.handle('export:start', async (_event, request: ExportRequest) => {
    return startExport(request, (job) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('export:progress', job);
      }
    });
  });

  ipcMain.handle('export:cancel', (_event, jobId: string) => {
    return cancelExportJob(jobId);
  });

  ipcMain.handle('export:openFolder', (_event, outputPath: string) => {
    openExportDestination(outputPath);
  });

  ipcMain.handle('export:playFile', (_event, outputPath: string) => {
    playExportFile(outputPath);
  });

  ipcMain.handle('fs:exists', (_event, filePath: string) => {
    return fs.existsSync(filePath);
  });

  // Loop
  ipcMain.handle('loop:generatePreview', async (_event, project: ProjectDocument) => {
    return generateLoopPreview(project);
  });

  ipcMain.handle('loop:analyzeSeam', async (_event, req: SeamAnalysisRequest) => {
    return analyzeSeamCandidates(req);
  });

  // Window control
  ipcMain.handle('window:minimize', () => {
    mainWindow.minimize();
  });

  ipcMain.handle('window:maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.handle('window:close', () => {
    mainWindow.close();
  });

  ipcMain.handle('window:isMaximized', () => {
    return mainWindow.isMaximized();
  });
}
