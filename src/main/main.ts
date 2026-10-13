import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, net, protocol } from 'electron';
import { logDiagnostic } from './services/diagnostic.service';
import { createMainWindow } from './window';

// Must register scheme before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'nigi-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
      corsEnabled: true,
    },
  },
]);

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const wins = BrowserWindow.getAllWindows();
    if (wins.length > 0) {
      const win = wins[0];
      if (win?.isMinimized()) win.restore();
      win?.focus();
    }
  });

  app.whenReady().then(() => {
    // Set consistent App User Model ID on Windows for taskbar identity
    app.setAppUserModelId('com.nigistudio.nigilopingpro');

    // Register protocol to safely stream local media with Range headers support
    protocol.handle('nigi-media', async (request) => {
      const reqUrl = request.url;
      try {
        const urlObj = new URL(reqUrl);
        let targetPath = urlObj.searchParams.get('path');

        if (!targetPath) {
          // Fallback for legacy pathname-based URLs (e.g. nigi-media://file/<path>)
          let decoded = decodeURIComponent(urlObj.pathname);
          // In Windows, /C:/path or \C:\path should strip the leading slash
          if (/^[/\\][a-zA-Z]:/.test(decoded)) {
            decoded = decoded.slice(1);
          }
          targetPath = decoded;
        }

        const filePath = path.normalize(targetPath);
        const exists = fs.existsSync(filePath);

        if (!exists) {
          logDiagnostic('PROTOCOL_FILE_NOT_FOUND', {
            requestUrl: reqUrl,
            resolvedPath: filePath,
          });
          return new Response(`Berkas tidak ditemukan: ${filePath}`, {
            status: 404,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }

        const fileUrl = pathToFileURL(filePath).toString();
        const response = await net.fetch(fileUrl, {
          headers: request.headers,
        });

        logDiagnostic('PROTOCOL_FETCH_SUCCESS', {
          requestUrl: reqUrl,
          resolvedPath: filePath,
          status: response.status,
          hasRangeHeader: Boolean(request.headers.get('range')),
        });

        return response;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logDiagnostic('PROTOCOL_FETCH_ERROR', {
          requestUrl: reqUrl,
          error: errMsg,
        });
        return new Response(`Gagal memuat media: ${errMsg}`, {
          status: 500,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    });

    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
