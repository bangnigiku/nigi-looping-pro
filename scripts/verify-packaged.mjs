import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';

const exePath = path.resolve('release/win-unpacked/NIGI Looping Pro.exe');
console.log('1. Checking executable path:');
console.log('   Path:', exePath);
console.log('   Exists:', fs.existsSync(exePath));
if (fs.existsSync(exePath)) {
  console.log('   Size:', (fs.statSync(exePath).size / 1024 / 1024).toFixed(2), 'MB');
}

console.log('\n2. Extracting icon associated with executable via Windows Shell API:');
const psCommand = `Add-Type -AssemblyName System.Drawing; $ico = [System.Drawing.Icon]::ExtractAssociatedIcon('${exePath.replace(/'/g, "''")}'); Write-Output "$($ico.Width)x$($ico.Height)"`;
const psOutput = execSync(`powershell -NoProfile -Command "${psCommand}"`).toString().trim();
console.log('   Windows Shell Icon Resolution:', psOutput);

console.log('\n3. Verifying extra resources in distribution folder:');
const resourcesDir = path.resolve('release/win-unpacked/resources');
const brandingDir = path.join(resourcesDir, 'assets/branding');
console.log('   resources/assets/branding exists:', fs.existsSync(brandingDir));
if (fs.existsSync(brandingDir)) {
  const files = fs.readdirSync(brandingDir);
  console.log('   Files in resources/assets/branding:', files.join(', '));
}

console.log('\n4. Executable smoke test (launching and closing after 4s):');
const proc = spawn(exePath, [], {
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
  stdio: 'pipe',
});

let outputData = '';
proc.stdout?.on('data', (d) => { outputData += d.toString(); });
proc.stderr?.on('data', (d) => { outputData += d.toString(); });

setTimeout(() => {
  console.log('   Process PID:', proc.pid);
  console.log('   Exiting smoke test cleanly...');
  proc.kill('SIGTERM');
  setTimeout(() => {
    try { proc.kill('SIGKILL'); } catch {}
    console.log('   Smoke test complete. Output received:', outputData.length, 'chars');
    process.exit(0);
  }, 1000);
}, 4000);
