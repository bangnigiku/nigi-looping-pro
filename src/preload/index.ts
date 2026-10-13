import { contextBridge, ipcRenderer } from 'electron';
import type { NigiApi } from './api';

const api: NigiApi = {
  // App info
  getInfo: () => ipcRenderer.invoke('app:getInfo'),
  checkFfmpeg: () => ipcRenderer.invoke('app:checkFfmpeg'),

  // Settings & external links
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // Media
  openMediaDialog: () => ipcRenderer.invoke('media:openDialog'),
  inspectMediaFile: (filePath: string) => ipcRenderer.invoke('media:inspectFile', filePath),
  generatePreviewProxy: (filePath: string) => ipcRenderer.invoke('media:generateProxy', filePath),
  onProxyProgress: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, update: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callback(update as any);
    };
    ipcRenderer.on('media:proxyProgress', handler);
    return () => {
      ipcRenderer.removeListener('media:proxyProgress', handler);
    };
  },

  // Project
  newProject: (title) => ipcRenderer.invoke('project:new', title),
  openProject: (filePath) => ipcRenderer.invoke('project:open', filePath),
  saveProject: (project, filePath) => ipcRenderer.invoke('project:save', project, filePath),
  getRecentProjects: () => ipcRenderer.invoke('project:getRecents'),

  // Export
  chooseExportLocation: (defaultName, container) =>
    ipcRenderer.invoke('export:chooseOutputLocation', defaultName, container),
  startExport: (request) => ipcRenderer.invoke('export:start', request),
  cancelExport: (jobId) => ipcRenderer.invoke('export:cancel', jobId),
  openExportFolder: (outputPath) => ipcRenderer.invoke('export:openFolder', outputPath),
  playExportFile: (outputPath) => ipcRenderer.invoke('export:playFile', outputPath),
  onExportProgress: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, job: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callback(job as any);
    };
    ipcRenderer.on('export:progress', handler);
    return () => {
      ipcRenderer.removeListener('export:progress', handler);
    };
  },
  checkFileExists: (filePath) => ipcRenderer.invoke('fs:exists', filePath),

  // Loop
  generateLoopPreview: (project) => ipcRenderer.invoke('loop:generatePreview', project),
  analyzeSeam: (request) => ipcRenderer.invoke('loop:analyzeSeam', request),

  // Diagnostics
  logDiagnostic: (event, data) => ipcRenderer.invoke('diagnostics:log', event, data),
  getDiagnostics: () => ipcRenderer.invoke('diagnostics:get'),
  getDiagnosticLogPath: () => ipcRenderer.invoke('diagnostics:getLogPath'),

  // Window
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isWindowMaximized: () => ipcRenderer.invoke('window:isMaximized'),
};

contextBridge.exposeInMainWorld('nigiApi', api);
