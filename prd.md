# MASTER PROMPT: BUILD NIGI LOOPING PRO FROM SCRATCH

## 1. ROLE AND MISSION

Act as a senior desktop application engineer, video-processing engineer, UI/UX designer, and QA engineer.

Build a complete, production-oriented Windows desktop application called **NIGI Looping Pro**, developed from scratch.

The application specializes in creating seamless looping videos and audio. Its primary objective is to help users repeat short videos, music visualizers, nature footage, ambient scenes, and other media with transitions that are difficult to notice.

This must be a REAL, FUNCTIONAL DESKTOP APPLICATION, not a static prototype, UI mockup, or collection of nonfunctional buttons.

Do not stop after designing the interface. Implement the actual functionality, connect every interactive control, test the application, fix errors, and document the final result.

If an advanced feature cannot be implemented completely in one pass, prioritize a reliable working implementation and clearly identify the remaining limitations.

## 2. PRODUCT IDENTITY

Application name: NIGI Looping Pro

Publisher / brand: Nigi Studio

Tagline: "Make Every Loop Feel Continuous."

Product description:
A professional desktop video and audio looping studio that helps users create natural, seamless, repeatable media.

Primary platform: Windows 10 and Windows 11, 64-bit.

The architecture should allow future macOS and Linux builds.

Target users:
- Music creators and independent musicians
- YouTube creators
- TikTok, Instagram Reels, and Shorts creators
- Lo-fi, ambience, rain, nature, and relaxation video creators
- Users producing long-duration background videos
- Creators who need looping audio or visual assets

The app must prioritize local media processing and protect user files.

## 3. REQUIRED TECHNOLOGY STACK

Use a stable, compatible, actively maintained stack.

- Electron for the desktop shell.
- React for the UI.
- TypeScript with strict type checking.
- Vite for development and renderer bundling.
- CSS Modules or a well-organized custom CSS architecture.
- FFmpeg and FFprobe for media processing, metadata inspection, transcoding, filtering, and export.
- Electron native dialog APIs for selecting files and output folders.
- HTML5 video and audio elements for playback where suitable.
- Canvas or SVG for the audio waveform and timeline visualization.
- A lightweight state management approach using React hooks and context, or a small maintained state library if necessary.
- Vitest for unit tests.
- Playwright or an appropriate Electron-compatible test approach for integration and UI tests.

Use npm as the package manager.

Avoid unnecessary dependencies, abandoned packages, and deprecated FFmpeg wrappers. Invoke FFmpeg using Node.js child_process.spawn with argument arrays rather than shell-concatenated command strings.

Do not use shell execution patterns that allow filenames to become executable commands.

Use maintained, compatible package versions and commit the lockfile.

Do not automatically run npm audit fix --force.

Use a secure Electron configuration:
- contextIsolation: true
- nodeIntegration: false
- sandbox: true where compatible
- A narrowly scoped preload bridge
- Explicit IPC channel validation
- No unrestricted Node.js access from the renderer
- No remote code execution
- No unnecessary external network requests

Do not expose unrestricted filesystem access to the renderer.

## 4. VISUAL DESIGN DIRECTION

Take inspiration from the professional workflow and spatial organization of CapCut Desktop, but create an original Nigi Studio visual identity.

Do not copy CapCut logos, proprietary assets, exact branding, or trademarked interface graphics.

Design language:
- Premium professional video editor
- Dark charcoal workspace
- Deep navy undertones
- Subtle borders and restrained shadows
- Orange primary action buttons
- Cyan or teal playback indicators
- Compact, readable typography
- Precise spacing and alignment
- Minimal decorative gradients
- Clear visual hierarchy
- High information density without clutter

Suggested palette:
- Main background: #15171B
- Panel background: #1D2026
- Secondary surface: #252A32
- Border: #343A44
- Primary text: #F4F6F8
- Secondary text: #9AA4B2
- Nigi orange: #FF9859
- Active teal: #42D6C5
- Error: #F06464
- Success: #5BD69B

Use Lucide icons through a compatible React icon package.

Use tooltips for icon-only buttons.

Maintain consistent spacing, accessible contrast, keyboard focus states, hover states, disabled states, and loading indicators.

The application must adapt to typical Windows laptop and desktop resolutions, including 1366x768, 1600x900, and 1920x1080.

Do not allow essential controls to disappear outside the viewport. Use responsive panel sizing, scrolling where appropriate, and resizable workspace panels if practical.

## 5. MAIN APPLICATION LAYOUT

Build a complete editor workspace inspired by a professional desktop NLE.

### A. Top application bar

Include:
- Nigi Studio logo or original Nigi monogram
- Project title
- Project save status
- Undo and redo
- Import media
- Export
- Application window controls
- A compact project menu

Project states:
- Saved
- Unsaved changes
- Saving
- Save failed

Do not claim that a project is saved until the save operation succeeds.

### B. Left media panel

Provide tabs:
- Media
- Audio
- Text
- Transitions
- Effects

The Media tab must support:
- Import video
- Import audio
- Multiple-file selection
- Drag-and-drop import
- Media thumbnails
- File names
- Duration
- Resolution
- Frame rate where available
- Audio track presence
- Search and filtering
- Remove from project
- Relink missing media where practical

Display an informative empty state when no media has been imported.

Imported media must remain available in the project bin even when it has not yet been placed on the timeline.

The Audio tab should display imported audio files and provide a way to add them to the timeline.

The Text tab may offer simple text overlays if implemented without compromising the core editing workflow.

Transitions must provide working options, not merely decorative cards.

### C. Center preview monitor

This is a critical component.

Create a large, stable preview monitor with:
- Correct video aspect ratio
- Letterboxing or pillarboxing when needed
- Play and pause
- Seek bar
- Current timecode
- Total duration
- Frame-step controls where practical
- Volume and mute
- Fullscreen preview
- Fit to window
- 50%, 75%, 100%, and Fit zoom options where practical
- Aspect-ratio display
- Playback error reporting

Support common video formats accepted by the installed FFmpeg build.

Use the original source dimensions for the initial preview unless the user chooses another canvas ratio.

IMPORTANT:
The preview must use the actual imported media source, not a hardcoded demonstration image.

Do not render the same video simultaneously through overlapping video elements.

Do not recreate or reset the video element on every React render.

Preserve playback position when unrelated settings change.

The Play button must start playback. Pause must stop playback. The seek bar must update the playback position. Media errors must be visible and actionable.

Use object URLs or another appropriate local preview strategy with correct cleanup, or a secure local-media protocol. Handle spaces, Unicode characters, and special characters in file paths.

If a codec is unsupported by the browser preview, explain the limitation and offer an appropriate proxy or preview-transcoding path.

Do not silently claim that every FFmpeg-supported codec is natively playable by HTML5 video.

### D. Timeline editor

Build a functional timeline, not a static illustration.

Required elements:
- Time ruler
- Playhead
- Video track
- Audio track
- Clip blocks
- Clip thumbnails where practical
- Audio waveform where practical
- Horizontal zoom
- Horizontal scrolling
- Timeline duration
- Snap-to-edge option
- Track visibility or mute controls where appropriate
- Select clip
- Move clip
- Trim clip start and end
- Split clip at playhead
- Delete selected clip
- Undo and redo

For the first implementation, support at least one video track and one audio track.

Represent timeline positions using seconds or integer media ticks internally. Avoid accumulating floating-point timing errors.

Timeline changes must update the project state and preview.

Moving, trimming, splitting, or deleting a clip must change the actual export timeline, not just the appearance of the clip block.

If a feature is not yet implemented, disable it and explain why. Do not leave a clickable control that silently does nothing.

### E. Right inspector panel

Create two tabs: Project and Detail.

The Project tab contains looping and export settings.

The Detail tab displays properties of the selected clip.

Project settings:
- Output aspect ratio
- Output resolution
- Frame rate
- Target duration
- Video crossfade duration
- Audio crossfade duration
- Audio crossfade toggle
- Seamless loop preview toggle
- Export quality
- Video codec
- Audio codec
- Output folder

Clip detail settings:
- File name
- Source duration
- Source resolution
- Source frame rate
- Clip start
- Clip end
- Timeline position
- Volume
- Mute
- Video fit mode

All settings must have validation, sensible limits, and clear units.

### F. Bottom timeline toolbar

Include working controls for:
- Add track where supported
- Split clip
- Delete clip
- Undo
- Redo
- Snap
- Zoom in
- Zoom out
- Fit timeline to content

Use keyboard shortcuts where appropriate:
- Space: play/pause
- Ctrl+Z: undo
- Ctrl+Shift+Z: redo
- Delete: remove selected clip
- Ctrl+S: save project
- Ctrl+O: open project
- Ctrl+I: import media
- Ctrl+E: open export workflow

Avoid shortcuts that trigger while the user is typing in a text field.

## 6. ASPECT RATIO SYSTEM

Implement real aspect-ratio controls for the preview canvas and exported output.

Required presets:
- Follow source
- 16:9 landscape
- 9:16 portrait
- 1:1 square
- 4:5 portrait feed
- 4:3
- 3:2
- Custom width and height

Suggested output resolutions:
- 1920x1080 for 16:9
- 1080x1920 for 9:16
- 1080x1080 for 1:1
- 1080x1350 for 4:5
- 1440x1080 for 4:3
- 1620x1080 for 3:2

Allow custom resolution within safe technical limits.

Changing the aspect ratio must immediately update the preview canvas.

The exported video must use the selected ratio and resolution.

Offer three fit modes:
1. Fit: preserve the entire image and fill unused areas with a selected background.
2. Fill: cover the canvas, cropping excess image area.
3. Stretch: stretch to fill the canvas, with a clear warning that the image may be distorted.

Default to Fit to prevent unintended cropping.

Allow a background choice such as black, a custom solid color, or a blurred background if practical.

When Follow Source is selected, derive the output dimensions from the source or timeline settings.

Do not simply resize the preview CSS while exporting the original source dimensions. The selected settings must reach the FFmpeg export pipeline.

## 7. CORE FEATURE: SMART SEAMLESS LOOP ENGINE

This is the application's defining feature.

Users must be able to create a loop from one clip or multiple clips and specify the final duration.

Example:
A 10-second source clip should be capable of producing a 150-second output by repeating its content and blending the transitions.

### A. Loop generation

Support:
- Repeat source clip
- Repeat a selected timeline sequence
- Specify total output duration
- Calculate repetition count automatically
- Account for overlap introduced by crossfades
- Produce the requested duration within the selected frame-rate tolerance
- Handle the final partial repetition correctly
- Preview the intended loop before export

Do not calculate duration as source duration multiplied by repetition count when crossfades shorten the combined timeline.

Use the correct relationship between source duration, overlap duration, and repetition count.

Do not create a filter graph that consumes unbounded memory or generates an unlimited number of repetitions.

Validate input duration and maximum repetition count.

### B. Video crossfade

Implement video transitions with FFmpeg filters.

Allow the user to select a crossfade duration, with sensible bounds based on the source duration.

Provide a preview of the transition.

Make sure the filter graph handles:
- Frame-rate normalization
- Timestamp normalization
- Resolution normalization
- Pixel format
- Audio stream presence or absence
- Short clips
- Very short crossfade settings
- Last-segment duration
- Correct output timestamps

Do not use invalid filter offsets or negative durations.

### C. Audio crossfade

Implement a real audio crossfade using appropriate FFmpeg audio filters, such as acrossfade where applicable.

Support:
- Audio crossfade on/off
- Configurable transition duration
- Sample-rate normalization
- Channel-layout normalization where necessary
- Consistent output loudness options
- Peak protection or limiting where practical
- Clips without audio
- Separate external audio tracks

Avoid clicks and sudden volume changes where possible.

Explain that a crossfade can soften a transition but cannot guarantee a perceptually invisible loop for every source.

### D. Smart seam analysis

Implement a first practical version of automatic seam detection.

For video:
- Sample candidate frames near the beginning and end of the source.
- Compare visual features or image similarity.
- Rank promising start/end frame pairs.
- Provide a manual override for the selected seam.
- Use temporal consistency where practical to avoid choosing a visually similar but motion-incompatible pair.

For audio:
- Analyze candidate audio windows near the beginning and end.
- Measure waveform continuity and signal energy.
- Detect potential clicks or large amplitude discontinuities.
- Rank promising seam candidates.
- Allow manual adjustment and listening preview.

Provide a confidence score or qualitative label such as Low, Medium, or High.

Clearly label the result as a heuristic estimate, not a guarantee.

Do not claim to perform advanced AI analysis unless an actual model is implemented.

### E. Loop preview

Create a working A/B preview mode.

- Preview the original source.
- Preview the proposed loop transition.
- Replay the transition repeatedly.
- Allow the user to adjust the seam and crossfade duration.
- Keep preview state synchronized with project settings.
- Do not permanently modify source files.

Where practical, generate a short temporary preview render rather than relying only on CSS or fake transitions.

Use temporary files with predictable cleanup.

## 8. EXPORT ENGINE

Implement a reliable FFmpeg export workflow.

Required export settings:
- MP4 container
- H.264 video
- AAC audio
- Output resolution
- Output frame rate
- Video bitrate or quality preset
- Audio bitrate
- Optional audio normalization
- Output filename
- Output folder

Provide sensible quality presets:
- Draft
- Balanced
- High quality
- Custom

Use an appropriate H.264 quality strategy such as CRF when using a compatible software encoder.

If hardware acceleration is available, treat it as an optional capability, not a requirement.

Export interface:
- Export summary
- Estimated duration where possible
- Progress percentage when reliably available
- Elapsed time
- Cancel export
- Error details
- Open output folder
- Play completed export
- Export success confirmation

Parse FFmpeg progress through a supported progress output mechanism such as -progress pipe:1.

Do not fabricate progress percentages or display 100% before the output has been finalized.

Disable conflicting operations while exporting.

On cancellation, terminate the child process and clean up partial output safely.

Write output to a temporary filename and rename it after a successful finalization when practical.

Check the output file and process exit code before reporting success.

Do not overwrite an existing file without user confirmation.

## 9. PROJECT MANAGEMENT

Implement:
- New project
- Open project
- Save project
- Save project as
- Recent projects
- Project title
- Unsaved-change indicator
- Missing-media warning
- Relink media

Use a documented JSON project format.

The project must preserve:
- Timeline clips
- Source file references
- Clip in/out points
- Timeline positions
- Aspect ratio
- Resolution
- Frame rate
- Loop settings
- Audio settings
- Export settings

Do not store large video files inside the JSON project.

Use versioned project schemas and provide a safe migration strategy for future versions.

## 10. MEDIA PROCESSING ARCHITECTURE

Separate the application into clear modules.

Suggested structure:

src/
  main/
    main.ts
    window.ts
    ipc/
      media.ipc.ts
      project.ipc.ts
      export.ipc.ts
    services/
      ffmpeg.service.ts
      ffprobe.service.ts
      media.service.ts
      loop.service.ts
      export.service.ts
      project.service.ts
  preload/
    index.ts
    api.ts
  renderer/
    src/
      app/
      components/
        AppHeader/
        MediaBin/
        PreviewMonitor/
        Timeline/
        Inspector/
        ExportDialog/
      features/
        media/
        playback/
        timeline/
        aspect-ratio/
        seamless-loop/
        export/
        project/
      hooks/
      services/
      store/
      styles/
      types/
      utils/
  tests/
    unit/
    integration/
    fixtures/
  scripts/
  docs/

This is a suggested organization, not a requirement to reproduce every empty folder.

Keep business logic out of large React components.

Define TypeScript interfaces for:
- MediaAsset
- TimelineClip
- TimelineTrack
- ProjectDocument
- LoopSettings
- AspectRatioSettings
- ExportSettings
- ExportJob
- MediaMetadata

Expose typed, narrowly scoped functions through the preload bridge.

Use IPC for media metadata, FFmpeg jobs, project file operations, and export progress.

Do not run long FFmpeg jobs on the renderer thread.

Use a job manager that can report progress, cancellation, errors, and completion.

Ensure each export job has a unique identifier.

Prevent two concurrent exports from accidentally sharing the same temporary files.

## 11. PERFORMANCE AND RELIABILITY

The application must remain responsive while importing large files and exporting long videos.

Requirements:
- Do not load an entire video into JavaScript memory.
- Stream FFmpeg output.
- Use thumbnails and waveform caches.
- Generate previews at appropriate resolution.
- Cancel obsolete preview jobs.
- Avoid excessive React re-renders during playback.
- Avoid rebuilding the entire timeline on every playhead update.
- Handle long filenames and Unicode paths.
- Validate paths and output destinations.
- Clean up object URLs, temporary files, and child processes.
- Handle missing FFmpeg binaries with an actionable error.
- Handle missing source files.
- Handle unsupported codecs.
- Handle insufficient disk space when detectable.
- Handle invalid filter graphs.
- Handle unexpected FFmpeg termination.
- Prevent the application from reporting success when an export fails.

Package FFmpeg and FFprobe appropriately for the Windows release, subject to licensing requirements, or provide a clear setup mechanism if the user must supply them.

Document the FFmpeg version and any relevant licensing obligations.

## 12. ACCESSIBILITY AND USABILITY

Use Indonesian as the default UI language.

Keep the code structured so English localization can be added later.

All controls must have:
- Clear labels or tooltips
- Disabled states when unavailable
- Loading states when processing
- Error states when an operation fails
- Success feedback after completion

Use dialogs for destructive actions.

Use confirmation when replacing files.

Add keyboard navigation and visible focus states.

Provide concise, actionable error messages in Indonesian.

Example:
"Video gagal dimuat. Periksa lokasi file atau coba format MP4 dengan codec H.264."

Never show a generic success message when the underlying operation has not completed.

## 13. SECURITY AND DEPENDENCY QUALITY

Before implementation:
1. Inspect the project environment.
2. Select compatible dependency versions.
3. Review maintenance status for critical packages.
4. Avoid deprecated packages when maintained alternatives exist.
5. Review the Electron security checklist.
6. Create a lockfile.

After implementation:
1. Run npm install.
2. Run type checking.
3. Run linting.
4. Run unit tests.
5. Run a production build.
6. Run npm audit.
7. Investigate critical and high vulnerabilities.
8. Fix issues without blindly forcing major-version upgrades.
9. Document unresolved issues.

Do not hide audit findings or claim zero vulnerabilities without verifying the actual results.

## 14. REQUIRED IMPLEMENTATION MILESTONES

Work in the following order.

### Milestone 1: Functional foundation
- Build the Electron app.
- Create the final workspace layout.
- Implement secure IPC.
- Implement media import.
- Read media metadata through FFprobe.
- Implement actual preview playback.
- Implement working Play/Pause, seek, mute, and aspect-ratio preview.
- Verify that the app launches and can import a real video.

### Milestone 2: Timeline
- Implement timeline state.
- Add video and audio tracks.
- Add clips.
- Implement playhead synchronization.
- Implement moving, trimming, splitting, and deleting clips.
- Implement undo and redo.
- Make the preview follow timeline position.

### Milestone 3: Export
- Build the FFmpeg command and filter graph.
- Implement output ratio, fit modes, resolution, frame rate, and quality.
- Implement real progress reporting.
- Implement cancellation and cleanup.
- Export and play a real output file.

### Milestone 4: Seamless looping
- Implement repeat count calculation.
- Implement video crossfade.
- Implement audio crossfade.
- Account for overlap in total duration.
- Implement loop preview.
- Add seam analysis and manual seam selection.

### Milestone 5: Project management
- Implement project save/open.
- Implement missing-media recovery.
- Add recent projects and unsaved-change warnings.

### Milestone 6: Hardening and release
- Add automated tests.
- Test failure paths.
- Fix accessibility and layout issues.
- Audit dependencies.
- Build a Windows installer.
- Test the installed application independently from development mode.
- Write complete installation and usage documentation.

Do not move on from a milestone while its core acceptance criteria remain broken. You may build later UI components in parallel, but clearly separate implemented features from placeholders.

## 15. ACCEPTANCE TESTS

The application is not complete until these workflows have been tested.

TEST A: Import
- Import an MP4 file with spaces in its filename.
- Confirm that the media appears in the media bin.
- Confirm that duration, resolution, and audio availability are displayed.

TEST B: Playback
- Play and pause the source.
- Seek to the middle.
- Mute and unmute.
- Confirm that the displayed timecode is correct.
- Confirm that playback continues when unrelated inspector settings change.

TEST C: Aspect ratio
- Switch between 16:9, 9:16, 1:1, and Follow Source.
- Confirm that the preview updates immediately.
- Export a test video in each selected ratio.
- Verify actual output dimensions using FFprobe.

TEST D: Timeline
- Add a clip.
- Move the clip.
- Trim its beginning and end.
- Split it.
- Delete one segment.
- Undo and redo.
- Confirm that the exported sequence matches the visible timeline.

TEST E: Looping
- Use a short source clip with known duration.
- Set a longer target duration.
- Enable video crossfade.
- Enable audio crossfade.
- Preview the transition.
- Export the result.
- Confirm that duration matches the target within a documented tolerance.
- Listen for clicks and abrupt changes.
- Inspect the beginning-to-end transition visually.

TEST F: Export failures
- Cancel an export.
- Use a missing source file.
- Use an invalid output destination.
- Confirm that failures are reported and partial files are handled safely.

TEST G: Project persistence
- Save a project.
- Close the application.
- Reopen the project.
- Confirm that timeline clips and settings are restored.

TEST H: Windows release
- Build the installer.
- Install the application.
- Launch it outside the development terminal.
- Import media and complete a real export.

For every test, report:
- Pass
- Fail
- Not tested
- Relevant evidence or error details

Never mark a test as passed merely because its UI element exists.

## 16. DELIVERABLES

Deliver:
1. Complete source code.
2. package.json and lockfile.
3. TypeScript configuration.
4. Electron security configuration.
5. Working media import and preview.
6. Working timeline editing.
7. Functional looping engine.
8. Functional aspect-ratio and export pipeline.
9. Project save/open.
10. Unit and integration tests.
11. README.md in Indonesian.
12. Windows build instructions.
13. Windows installer when the environment supports building it.
14. Dependency audit report.
15. Feature status matrix.
16. Known limitations.
17. Architecture documentation.

Use real implementations wherever possible.

Do not replace difficult functions with alert("Coming soon"), fake progress bars, dummy media, or hardcoded export success.

## 17. FINAL EXECUTION INSTRUCTIONS

Start by inspecting the current workspace and confirming the operating environment.

If the current folder contains an old Nigi Loping Pro implementation, do not blindly overwrite useful files. Create a clean project structure or a new branch and preserve the old version until the new application passes basic tests.

Then:
1. Present a concise implementation plan.
2. Build the working foundation.
3. Implement and test each milestone.
4. Fix build and runtime errors.
5. Continue through the milestones without stopping after the UI.
6. Build the Windows installer if possible.
7. Provide exact commands for installation, development, testing, and packaging.
8. Report what works, what has been verified, and what remains incomplete.

If a command fails, inspect the actual error and resolve it. Do not repeatedly run the same failed command without changing the cause.

If a capability depends on an external binary, package, model, or system permission, identify the dependency and implement a clear fallback or setup instruction.

Final objective:

Deliver a real, stable, modern Windows desktop application called NIGI Looping Pro that makes professional looping accessible through a clean editor interface and a reliable local video-processing engine.

The most important success criterion is not how impressive the interface looks. It is whether a user can import a real video, preview it, edit its timeline, create a convincing loop, export the correct output, and reopen the saved project without losing work.

## WAJIB: LOKALISASI BAHASA INDONESIA

Seluruh antarmuka pengguna NIGI Looping Pro WAJIB menggunakan Bahasa Indonesia sebagai bahasa utama dan bahasa bawaan aplikasi.

Ketentuan:
1. Semua menu, tombol, tab, label, tooltip, dialog, notifikasi, pesan error, pengaturan, status proses, dan panduan pengguna harus menggunakan Bahasa Indonesia yang natural, jelas, dan konsisten.
2. Jangan mencampur Bahasa Indonesia dan Bahasa Inggris pada teks UI, kecuali untuk istilah teknis, nama format, nama codec, nama protokol, atau istilah produk yang memang lazim digunakan.
3. Nama merek dan produk seperti NIGI Looping Pro, Nigi Studio, FFmpeg, MP4, H.264, AAC, dan FPS tidak perlu diterjemahkan.
4. Istilah teknis yang ditampilkan kepada pengguna harus diterjemahkan jika padanan Indonesianya mudah dipahami.
5. Gunakan istilah UI berikut secara konsisten:

- Media → Media
- Import Media → Impor Media
- Export → Ekspor
- Preview → Pratinjau
- Live Preview → Pratinjau Langsung
- Timeline → Linimasa
- Inspector → Panel Properti
- Project → Proyek
- Settings → Pengaturan
- Audio → Audio
- Video Crossfade → Transisi Silang Video
- Audio Crossfade → Transisi Silang Audio
- Aspect Ratio → Rasio Aspek
- Follow Source → Ikuti Sumber
- Fit → Sesuaikan
- Fill → Penuhi Bingkai
- Stretch → Regangkan
- Play → Putar
- Pause → Jeda
- Seek → Geser Posisi
- Duration → Durasi
- Output Duration → Durasi Hasil
- Resolution → Resolusi
- Frame Rate → Laju Bingkai
- Quality → Kualitas
- Cancel → Batalkan
- Save → Simpan
- Save As → Simpan Sebagai
- Open Project → Buka Proyek
- New Project → Proyek Baru
- Undo → Urungkan
- Redo → Ulangi
- Split Clip → Pisahkan Klip
- Delete Clip → Hapus Klip
- Processing → Sedang Diproses
- Exporting → Sedang Mengekspor
- Export Complete → Ekspor Selesai
- Export Failed → Ekspor Gagal
- Missing Media → Media Tidak Ditemukan
- Loop Preview → Pratinjau Pengulangan
- Seamless Loop → Pengulangan Mulus
- Smart Seam Finder → Pencari Sambungan Cerdas

6. Pesan error harus menggunakan Bahasa Indonesia yang menjelaskan masalah dan solusi yang dapat dilakukan pengguna.

Contoh:
- "Video gagal dimuat. Periksa lokasi berkas atau coba format MP4 dengan codec H.264."
- "Ekspor gagal. Periksa ruang penyimpanan dan lokasi berkas tujuan, lalu coba kembali."
- "Media sumber tidak ditemukan. Pilih lokasi berkas yang benar untuk menghubungkan kembali media."
- "Ekspor dibatalkan. Berkas sementara yang tidak diperlukan sedang dibersihkan."

7. Dialog konfirmasi, peringatan, dan notifikasi harus menggunakan Bahasa Indonesia.

Contoh:
- "Simpan perubahan sebelum menutup proyek?"
- "Berkas dengan nama tersebut sudah ada. Apakah Anda ingin menggantinya?"
- "Ekspor selesai. Video berhasil disimpan ke folder tujuan."

8. Semua halaman kosong, onboarding, tooltip, dokumentasi pengguna, dan panduan penggunaan juga harus menggunakan Bahasa Indonesia.

9. Nama variabel, nama fungsi, tipe TypeScript, API, pesan log pengembang, serta komentar teknis di source code boleh menggunakan Bahasa Inggris. Ketentuan Bahasa Indonesia berlaku untuk seluruh teks yang ditampilkan kepada pengguna.

10. Buat sistem pengelolaan teks UI terpusat, misalnya `src/renderer/src/locales/id.ts`, agar label tidak tersebar sebagai string hardcoded di berbagai komponen.

11. Bahasa Indonesia harus aktif secara default sejak aplikasi pertama kali dibuka. Jangan meminta pengguna memilih bahasa terlebih dahulu.

12. Sediakan arsitektur yang memungkinkan bahasa Inggris ditambahkan di masa depan, tetapi jangan menambahkan pemilih bahasa yang belum memiliki implementasi nyata.

13. Tambahkan pengujian untuk memastikan teks UI utama, dialog, status ekspor, dan pesan error menggunakan Bahasa Indonesia.

14. Jangan mengubah istilah pada log teknis FFmpeg yang diperlukan untuk diagnosis, tetapi tampilkan penjelasan berbahasa Indonesia kepada pengguna ketika terjadi kesalahan.

Kriteria penerimaan:
Aplikasi dianggap memenuhi persyaratan bahasa jika pengguna dapat menjalankan alur kerja utama dari impor media, pratinjau, pengeditan linimasa, pengaturan pengulangan, hingga ekspor tanpa menemukan teks antarmuka berbahasa Inggris yang tidak diperlukan.