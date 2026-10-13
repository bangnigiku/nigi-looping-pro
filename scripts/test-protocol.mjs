import { app, BrowserWindow, net, protocol } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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

app.whenReady().then(async () => {
  protocol.handle('nigi-media', async (request) => {
    try {
      const urlObj = new URL(request.url);
      let targetPath = urlObj.searchParams.get('path');

      if (!targetPath) {
        let decoded = decodeURIComponent(urlObj.pathname);
        if (/^[/\\][a-zA-Z]:/.test(decoded)) {
          decoded = decoded.slice(1);
        }
        targetPath = decoded;
      }

      const filePath = path.normalize(targetPath);
      if (!fs.existsSync(filePath)) {
        return new Response('File not found', { status: 404 });
      }

      const fileUrl = pathToFileURL(filePath).toString();
      return await net.fetch(fileUrl, {
        headers: request.headers,
      });
    } catch (err) {
      return new Response(String(err), { status: 500 });
    }
  });

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      webSecurity: true,
    },
  });

  // Test 1: File with spaces in path
  const fileWithSpaces = path.resolve('tests/fixtures/sample with spaces.mp4');
  const url1 = `nigi-media://load?path=${encodeURIComponent(fileWithSpaces)}`;

  // Test 2: External file on C: drive
  const cDriveFile = path.join(os.tmpdir(), 'test_ext_video.mp4');
  if (!fs.existsSync(cDriveFile)) {
    fs.copyFileSync(path.resolve('tests/fixtures/short_loop.mp4'), cDriveFile);
  }
  const url2 = `nigi-media://load?path=${encodeURIComponent(cDriveFile)}`;

  // Test 3: Legacy pathname fallback
  const url3 = `nigi-media://file/${encodeURIComponent(fileWithSpaces.replace(/\\/g, '/'))}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <body>
        <video id="v1" src="${url1}"></video>
        <video id="v2" src="${url2}"></video>
        <video id="v3" src="${url3}"></video>
        <script>
          let passes = 0;
          function checkPass(name) {
            console.log('PASS: ' + name);
            passes++;
            if (passes === 3) {
              console.log('ALL_PROTOCOL_TESTS_PASSED');
            }
          }
          const v1 = document.getElementById('v1');
          v1.onloadedmetadata = () => checkPass('spaces_in_path');
          v1.onerror = (e) => console.error('FAIL v1:', v1.error);

          const v2 = document.getElementById('v2');
          v2.onloadedmetadata = () => checkPass('c_drive_external');
          v2.onerror = (e) => console.error('FAIL v2:', v2.error);

          const v3 = document.getElementById('v3');
          v3.onloadedmetadata = () => checkPass('legacy_pathname_fallback');
          v3.onerror = (e) => console.error('FAIL v3:', v3.error);
        </script>
      </body>
    </html>
  `;

  win.webContents.on('console-message', (e, level, msg) => {
    console.log('[CONSOLE]', msg);
    if (msg.includes('ALL_PROTOCOL_TESTS_PASSED')) {
      setTimeout(() => app.quit(), 200);
    }
  });

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  setTimeout(() => {
    console.log('Timeout reached');
    app.quit();
  }, 5000);
});
