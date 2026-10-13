# NIGI Looping Pro

Aplikasi desktop profesional untuk studio pengulangan (seamless looping) video dan audio, dirancang untuk platform Windows x64 dengan antarmuka modern yang terinspirasi oleh CapCut Desktop dan didukung oleh integrasi FFmpeg & FFprobe lokal.

---

## 🌟 Fitur Utama

1. **Antarmuka Studio CapCut-Style (100% Bahasa Indonesia)**:
   - Skema warna gelap profesional (*Charcoal Canvas* `#15171B`, panel `#1D2026`, aksen *Vibrant Orange* `#FF9859`, dan *Active Teal* `#42D6C5`).
   - Monitor pratinjau real-time dengan kontrol playback, frame-step (+1/-1 frame), volume master, dan visualisasi seam loop.
   - Panel bin media dengan pembacaan metadata mendalam (resolusi, framerate, durasi, codec, audio channel).

2. **Timeline Multi-Track Presisi Frame**:
   - Track Video Utama, Track Video Overlay, dan Track Audio Latar.
   - Snapping pintar, ripple/gap handling, pemotongan (*split/cut* pada playhead), pemangkasan (*in/out trim*), serta undo/redo tak terbatas (*history stack*).

3. **Mesin Pengulangan Mulus (*Seamless Looping Engine*)**:
   - Perhitungan matematis eksak: durasi target dihitung dengan rumus:
     $$\text{Durasi} = n \cdot L - (n - 1) \cdot O$$
     di mana $L$ adalah durasi klip dan $O$ adalah durasi crossfade overlap.
   - Mode transisi:
     - **Crossfade (Dissolve)**: Transisi mulus antar pengulangan video & audio.
     - **Reverse / Boomerang (Ping-Pong)**: Pembalikan maju-mundur mulus.
     - **Direct Concatenation**: Pengulangan langsung tanpa overlap.
   - Pilihan kurva transisi: Linear, Ease-In, Ease-Out, Ease-InOut.
   - Pratinjau sambungan instan (*instant seam preview* 4 detik) untuk memeriksa kehalusan loop sebelum ekspor penuh.

4. **Mesin Ekspor Fleksibel & Antrean Latar Belakang**:
   - Format kontainer: MP4, MOV, MKV, WebM, GIF, MP3, WAV.
   - Pilihan Preset Resolusi: Ikuti Sumber, 16:9 (1080p, 4K), 9:16 (Story/Reels/TikTok), 1:1 (Square), 4:5, 4:3, 3:2, dan Kustom (otomatis genap YUV420p).
   - Mode Target Ekspor: Berdasarkan Durasi Total (menit/detik) atau Jumlah Pengulangan Tetap.
   - Pilihan Enkoder Hardware & Software:
     - Software: libx264, libx265, libvpx-vp9.
     - Hardware Acceleration: NVIDIA NVENC (`h264_nvenc`), Intel QuickSync (`h264_qsv`), AMD AMF (`h264_amf`).
   - Monitor progres real-time dengan parsing FFmpeg pipe standar, estimasi waktu tersisa, dan tombol pembatalan aman.

5. **Protokol Media Khusus Berkecepatan Tinggi**:
   - Menggunakan skema `nigi-media://` dengan dukungan HTTP Range Request (206 Partial Content) untuk penjelajahan (*scrubbing*) video instan tanpa buffer lag, serta penanganan path Windows berkarakter spasi dan Unicode.

6. **Manajemen Proyek (.nigiloop)**:
   - Format proyek JSON terstruktur dengan migrasi skema versi v1, pencatatan riwayat proyek terkini, dan autosave.

---

## 🖥️ Persyaratan Sistem

- **Sistem Operasi**: Windows 10 atau Windows 11 (64-bit x64).
- **Node.js**: v20.x atau v22.x LTS (Proyek divalidasi pada Node.js v22.22.2 LTS).
- **RAM**: Minimal 4 GB (disarankan 8 GB atau lebih untuk rendering 4K).
- **Ruang Disk**: Minimal 500 MB untuk aplikasi dan binary pendukung.

---

## 🚀 Panduan Pengembang (Development)

### 1. Instalasi Dependensi
```bash
npm install
```

### 2. Membuat Media Uji Coba (Fixtures)
Proyek menyediakan generator klip uji coba sintetis untuk pengujian offline:
```bash
npm run fixtures
```
Klip uji coba akan dibuat di folder `tests/fixtures/`:
- `sample with spaces.mp4` (Video berdurasi 3 detik dengan audio nada sinus)
- `short_loop.mp4` (Video berdurasi 2 detik)
- `ambient_audio.mp3` (Audio stereo 44.1 kHz)

### 3. Menjalankan Mode Pengembangan (Hot Reload)
```bash
npm run dev
```

### 4. Menjalankan Pemeriksaan Kode (Linting & TypeScript)
```bash
npm run typecheck
npm run lint
```

---

## 🧪 Pengujian Otomatis

Proyek dilengkapi dengan pengujian unit domain murni dan pengujian integrasi FFmpeg nyata:

```bash
# Menjalankan seluruh pengujian (Unit + Integrasi)
npm run test

# Menjalankan pengujian unit saja
npm run test:unit

# Menjalankan pengujian integrasi FFmpeg nyata saja
npm run test:integration
```

Daftar suite pengujian:
- `tests/unit/time.test.ts`: Format timecode `HH:MM:SS:FF`, konversi detik/frame rate rasional.
- `tests/unit/aspect.test.ts`: Perhitungan dimensi rasio aspek & sanitasi kelipatan genap YUV420p.
- `tests/unit/timeline.test.ts`: Immutability operasi timeline, snapping, cut/split, penataan track.
- `tests/unit/loopMath.test.ts`: Logika durasi eksak crossfade overlap dan pemotongan segmen head/tile/tail.
- `tests/unit/render.test.ts`: Perencana argumen FFmpeg (Direct sequence, Complex crossfade filtergraph).
- `tests/unit/project.test.ts`: Serialisasi, validasi skema v1, dan migrasi dokumen `.nigiloop`.
- `tests/integration/probe.test.ts`: Ekstraksi metadata file riil berkarakter spasi menggunakan ffprobe.
- `tests/integration/export.test.ts`: Eksekusi ekspor nyata video sequence dan seamless crossfade loop berdurasi 8 detik.

---

## 📦 Pengemasan & Rilis Windows (Packaging)

Aplikasi menggunakan `electron-builder` dengan penyertaan binary mandiri `ffmpeg.exe` dan `ffprobe.exe` ke dalam `resources/bin/` sehingga aplikasi tidak membutuhkan instalasi FFmpeg global dari pengguna.

### Membangun Folder Portabel / Unpacked:
```bash
npm run dist:dir
```
Hasil eksekusi dapat ditemukan pada:
`release/win-unpacked/NIGI Looping Pro.exe`

### Membangun Installer Windows NSIS (.exe):
```bash
npm run dist
```
File installer setup akan dihasilkan pada folder `release/NIGI Looping Pro Setup 1.0.1.exe`.

---

## 📜 Lisensi & Atribusi Binary

- **NIGI Looping Pro**: Hak Cipta © 2026 Nigi Studio.
- **FFmpeg & FFprobe**: Disediakan melalui paket `ffmpeg-static` dan `ffprobe-static` yang dikompilasi di bawah lisensi GNU General Public License (GPL) v3.0 / LGPL v2.1.
- Detail lisensi third-party dapat dilihat pada dokumentasi dependensi masing-masing penyedia.
