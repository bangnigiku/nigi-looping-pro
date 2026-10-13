import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import { registerIpcHandlers } from './ipc/registerIpc';
import { openExternalSafe } from './services/external.service';

let mainWindow: BrowserWindow | null = null;

function getAppIcon(): string | undefined {
  const candidates = [
    path.join(__dirname, '../../assets/branding/logo-app.ico'),
    path.join(app.getAppPath(), 'assets/branding/logo-app.ico'),
    path.join(process.resourcesPath, 'assets/branding/logo-app.ico'),
    path.join(__dirname, '../../assets/branding/logo-app.png'),
    path.join(app.getAppPath(), 'assets/branding/logo-app.png'),
    path.join(process.resourcesPath, 'assets/branding/logo-app.png'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function createMainWindow(): BrowserWindow {
  const isDev = !app.isPackaged;
  const iconPath = getAppIcon();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'NIGI Looping Pro',
    icon: iconPath,
    backgroundColor: '#15171B',
    frame: false, // Custom CapCut-inspired titlebar
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Node APIs accessed via main IPC through preload
      spellcheck: false,
    },
    show: false,
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
    if (isDev && process.env.ELECTRON_OPEN_DEVTOOLS) {
      mainWindow?.webContents.openDevTools({ mode: 'detach' });
    }
  });

  // Handle external link clicks securely (allowlisted https hosts only)
  mainWindow.webContents.setWindowOpenHandler((details) => {
    void openExternalSafe(details.url);
    return { action: 'deny' };
  });

  // Register all IPC handlers
  registerIpcHandlers(mainWindow);

  // Load app URL or built html
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}
