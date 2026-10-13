import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// 1. Validate source file
const sourceLogoPath = path.join(projectRoot, 'logo_NigiLooping.png');
const brandingDir = path.join(projectRoot, 'assets', 'branding');
const publicDir = path.join(projectRoot, 'public');

console.log('========================================================');
console.log('   NIGI LOOPING PRO - APP ICON & BRANDING GENERATOR     ');
console.log('========================================================\n');

if (!fs.existsSync(sourceLogoPath)) {
  console.error(`[ERROR] Sumber logo resmi tidak ditemukan di: ${sourceLogoPath}`);
  console.error('[ERROR] Proses dihentikan. Jangan membuat logo pengganti tiruan.');
  process.exit(1);
}

const sourceStats = fs.statSync(sourceLogoPath);
if (sourceStats.size === 0) {
  console.error(`[ERROR] File logo kosong: ${sourceLogoPath}`);
  process.exit(1);
}

console.log(`[1/8] Memvalidasi file sumber: ${sourceLogoPath}`);
console.log(`      Ukuran file: ${(sourceStats.size / 1024).toFixed(1)} KB`);

// 2. Parse PNG and check alpha channel & bounds
const fileBuf = fs.readFileSync(sourceLogoPath);

// Check PNG signature: 89 50 4E 47 0D 0A 1A 0A
const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
if (!fileBuf.subarray(0, 8).equals(pngSig)) {
  console.error('[ERROR] File sumber bukan format PNG yang valid.');
  process.exit(1);
}

let offset = 8;
let width = 0;
let height = 0;
let bitDepth = 0;
let colorType = 0;
const idatChunks = [];

while (offset < fileBuf.length) {
  const length = fileBuf.readUInt32BE(offset);
  const type = fileBuf.toString('ascii', offset + 4, offset + 8);
  const data = fileBuf.subarray(offset + 8, offset + 8 + length);
  offset += 12 + length;

  if (type === 'IHDR') {
    width = data.readUInt32BE(0);
    height = data.readUInt32BE(4);
    bitDepth = data[8];
    colorType = data[9];
  } else if (type === 'IDAT') {
    idatChunks.push(data);
  } else if (type === 'IEND') {
    break;
  }
}

console.log(`[2/8] Analisis header PNG:`);
console.log(`      Dimensi: ${width}x${height} px`);
console.log(`      Bit Depth: ${bitDepth}`);
console.log(`      Color Type: ${colorType} (${colorType === 6 ? 'RGBA with Alpha' : 'Non-RGBA'})`);

if (colorType !== 6 || bitDepth !== 8) {
  console.error('[ERROR] Logo sumber harus 32-bit RGBA dengan alpha channel.');
  process.exit(1);
}

// 3. Decompress IDAT and calculate visual bounding box
const decompressed = zlib.inflateSync(Buffer.concat(idatChunks));
const bytesPerPixel = 4;
const stride = 1 + width * bytesPerPixel;
const rawRgba = Buffer.alloc(width * height * bytesPerPixel);

let minX = width, maxX = -1, minY = height, maxY = -1;
let semiTransparentCount = 0;
let fullyOpaqueCount = 0;

for (let y = 0; y < height; y++) {
  const rowStart = y * stride;
  const filterType = decompressed[rowStart];
  const scanline = decompressed.subarray(rowStart + 1, rowStart + stride);

  for (let x = 0; x < width; x++) {
    const pxIdx = (y * width + x) * 4;
    for (let c = 0; c < 4; c++) {
      const cur = scanline[x * 4 + c];
      const left = x > 0 ? rawRgba[pxIdx - 4 + c] : 0;
      const up = y > 0 ? rawRgba[((y - 1) * width + x) * 4 + c] : 0;
      const upLeft = (x > 0 && y > 0) ? rawRgba[((y - 1) * width + (x - 1)) * 4 + c] : 0;

      let rawVal = 0;
      switch (filterType) {
        case 0: rawVal = cur; break;
        case 1: rawVal = (cur + left) & 0xff; break;
        case 2: rawVal = (cur + up) & 0xff; break;
        case 3: rawVal = (cur + Math.floor((left + up) / 2)) & 0xff; break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          const pr = (pa <= pb && pa <= pc) ? left : (pb <= pc ? up : upLeft);
          rawVal = (cur + pr) & 0xff;
          break;
        }
        default: rawVal = cur; break;
      }
      rawRgba[pxIdx + c] = rawVal;
    }

    const a = rawRgba[pxIdx + 3];
    if (a > 0) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      if (a === 255) fullyOpaqueCount++;
      else semiTransparentCount++;
    }
  }
}

const visualWidth = maxX - minX + 1;
const visualHeight = maxY - minY + 1;
const leftMargin = minX;
const rightMargin = width - 1 - maxX;
const topMargin = minY;
const bottomMargin = height - 1 - maxY;

console.log(`[3/8] Analisis Bounding Box Visual:`);
console.log(`      Visual Box: [X: ${minX}..${maxX}, Y: ${minY}..${maxY}]`);
console.log(`      Dimensi Simbol: ${visualWidth}x${visualHeight} px (rasio: ${(visualWidth / visualHeight).toFixed(4)})`);
console.log(`      Margin Transparan Sumber: Kiri=${leftMargin}px, Kanan=${rightMargin}px, Atas=${topMargin}px, Bawah=${bottomMargin}px`);
console.log(`      Piksel Opaque: ${fullyOpaqueCount.toLocaleString()}`);
console.log(`      Piksel Semi-transparan (antialiasing): ${semiTransparentCount.toLocaleString()}`);

// 4. Determine FFmpeg binary for high-quality Lanczos resampling
const ffmpegBinary = path.join(projectRoot, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
if (!fs.existsSync(ffmpegBinary)) {
  console.error(`[ERROR] FFmpeg tidak ditemukan di ${ffmpegBinary}`);
  process.exit(1);
}

// Ensure output directories exist
fs.mkdirSync(brandingDir, { recursive: true });
fs.mkdirSync(publicDir, { recursive: true });

// Target square canvas: 1024x1024
// Symbol target scale: 84% of canvas = ~860 px width
const canvasSize = 1024;
const targetSymbolWidth = 860;
const targetSymbolHeight = Math.round((visualHeight * targetSymbolWidth) / visualWidth); // 758 px
const padX = Math.round((canvasSize - targetSymbolWidth) / 2); // 82 px
const padY = Math.round((canvasSize - targetSymbolHeight) / 2); // 133 px

console.log(`\n[4/8] Normalisasi Logo ke Kanvas Persegi Transparan (${canvasSize}x${canvasSize}):`);
console.log(`      Ukuran Simbol Ternormalisasi: ${targetSymbolWidth}x${targetSymbolHeight} px (~84% lebar kanvas)`);
console.log(`      Padding Transparan: Horizontal=${padX}px tiap sisi, Vertikal=${padY}px tiap sisi`);
console.log(`      Pusat Visual: Seimbang di titik tengah (${canvasSize/2}, ${canvasSize/2})`);

const normalizedPngPath = path.join(brandingDir, 'logo-app.png');
const publicPngPath = path.join(publicDir, 'logo-app.png');
const rendererAssetsDir = path.join(projectRoot, 'src', 'renderer', 'src', 'assets');
const rendererPngPath = path.join(rendererAssetsDir, 'logo-app.png');
const brandingSourceCopy = path.join(brandingDir, 'logo_NigiLooping.png');

fs.mkdirSync(rendererAssetsDir, { recursive: true });

// Copy original to branding dir without modifying source
if (!fs.existsSync(brandingSourceCopy) || fs.statSync(brandingSourceCopy).size !== fs.statSync(sourceLogoPath).size) {
  fs.copyFileSync(sourceLogoPath, brandingSourceCopy);
  console.log(`      Disalin ke: ${brandingSourceCopy}`);
}

// Generate normalized 1024x1024 PNG using FFmpeg with exact crop, lanczos scale, and pad
const filterGraph = `crop=${visualWidth}:${visualHeight}:${minX}:${minY},scale=${targetSymbolWidth}:${targetSymbolHeight}:flags=lanczos,pad=${canvasSize}:${canvasSize}:${padX}:${padY}:color=0x00000000`;

execFileSync(ffmpegBinary, [
  '-y',
  '-i', sourceLogoPath,
  '-vf', filterGraph,
  '-pix_fmt', 'rgba',
  normalizedPngPath
], { stdio: 'pipe' });

// Also copy to public directory for Vite and renderer assets directory
fs.copyFileSync(normalizedPngPath, publicPngPath);
fs.copyFileSync(normalizedPngPath, rendererPngPath);
console.log(`      Hasil PNG tersimpan: ${normalizedPngPath}`);
console.log(`      Disalin ke Vite public: ${publicPngPath}`);
console.log(`      Disalin ke Renderer assets: ${rendererPngPath}`);

// 5. Generate Multi-Resolution Frames for Windows ICO
console.log('\n[5/8] Membuat Frame Multi-Resolusi untuk Windows ICO:');
const icoSizes = [256, 128, 64, 48, 32, 24, 16];
const framePngBuffers = [];

for (const size of icoSizes) {
  const framePath = path.join(brandingDir, `_temp_${size}.png`);
  execFileSync(ffmpegBinary, [
    '-y',
    '-i', normalizedPngPath,
    '-vf', `scale=${size}:${size}:flags=lanczos`,
    '-pix_fmt', 'rgba',
    framePath
  ], { stdio: 'pipe' });

  const buf = fs.readFileSync(framePath);
  framePngBuffers.push({ size, buffer: buf });
  fs.unlinkSync(framePath);
  console.log(`      - Frame ${size}x${size} px (${(buf.length / 1024).toFixed(2)} KB, PNG 32-bit RGBA)`);
}

// 6. Build Multi-Resolution Windows ICO
console.log('\n[6/8] Mengemas Windows ICO Multi-Resolusi...');
const icoPath = path.join(brandingDir, 'logo-app.ico');

// Header: 6 bytes
// 0-1: Reserved (0)
// 2-3: Type (1 = ICO)
// 4-5: Count of images
const count = framePngBuffers.length;
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(count, 4);

// Directory Entries: 16 bytes each
let currentOffset = 6 + count * 16;
const entries = [];
for (const item of framePngBuffers) {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(item.size === 256 ? 0 : item.size, 0); // Width (0 for 256)
  entry.writeUInt8(item.size === 256 ? 0 : item.size, 1); // Height (0 for 256)
  entry.writeUInt8(0, 2); // Color count (0 = >=8bpp)
  entry.writeUInt8(0, 3); // Reserved
  entry.writeUInt16LE(1, 4); // Color planes
  entry.writeUInt16LE(32, 6); // Bits per pixel
  entry.writeUInt32LE(item.buffer.length, 8); // Size of image data
  entry.writeUInt32LE(currentOffset, 12); // Offset to image data

  entries.push(entry);
  currentOffset += item.buffer.length;
}

const icoBuffer = Buffer.concat([
  header,
  ...entries,
  ...framePngBuffers.map((item) => item.buffer)
]);

fs.writeFileSync(icoPath, icoBuffer);
console.log(`      File ICO tersimpan: ${icoPath} (${(icoBuffer.length / 1024).toFixed(1)} KB)`);

// 7. Generate Preview Sheet (logo-preview.png)
console.log('\n[7/8] Membuat Lembar Pratinjau (logo-preview.png)...');
const previewPath = path.join(brandingDir, 'logo-preview.png');
// We create a preview with dark background showing the 1024px logo and smaller resolutions
execFileSync(ffmpegBinary, [
  '-y',
  '-i', normalizedPngPath,
  '-vf', 'scale=512:512:flags=lanczos,pad=600:600:44:44:color=0x15171B',
  previewPath
], { stdio: 'pipe' });
console.log(`      Lembar pratinjau tersimpan: ${previewPath}`);

// 8. Validate Generated Assets
console.log('\n[8/8] Memvalidasi Aset:');
const icoCheckBuf = fs.readFileSync(icoPath);
if (icoCheckBuf.readUInt16LE(0) !== 0 || icoCheckBuf.readUInt16LE(2) !== 1) {
  console.error('[ERROR] Header ICO tidak valid.');
  process.exit(1);
}
const icoCheckCount = icoCheckBuf.readUInt16LE(4);
if (icoCheckCount !== icoSizes.length) {
  console.error(`[ERROR] Jumlah frame ICO tidak cocok (ditemukan ${icoCheckCount}, diharapkan ${icoSizes.length})`);
  process.exit(1);
}

for (let i = 0; i < icoCheckCount; i++) {
  const entryOffset = 6 + i * 16;
  const w = icoCheckBuf.readUInt8(entryOffset) || 256;
  const h = icoCheckBuf.readUInt8(entryOffset + 1) || 256;
  const bpp = icoCheckBuf.readUInt16LE(entryOffset + 6);
  const dataSize = icoCheckBuf.readUInt32LE(entryOffset + 8);
  const dataOffset = icoCheckBuf.readUInt32LE(entryOffset + 12);

  // Check PNG signature of embedded frame
  const frameSig = icoCheckBuf.subarray(dataOffset, dataOffset + 8);
  const isValidPng = frameSig.equals(pngSig);

  if (!isValidPng) {
    console.error(`[ERROR] Frame ${w}x${h} tidak memiliki signature PNG yang valid!`);
    process.exit(1);
  }
  console.log(`      [OK] Frame ${w}x${h} @ ${bpp}bpp (Ukuran: ${dataSize} bytes, Offset: ${dataOffset})`);
}

console.log('\n========================================================');
console.log('   SEMUA ASET BRANDING & IKON BERHASIL DIGENERATE!      ');
console.log('========================================================\n');
