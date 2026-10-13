import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { EditorProvider, useEditor } from '../../src/renderer/src/context/EditorContext';
import { createEmptyProject } from '../../src/shared/project';
import { removeAsset, addClip, sequenceDuration } from '../../src/shared/timeline';
import type { MediaAsset } from '../../src/shared/types';

describe('Preview Reset & Media Cleanup Audit', () => {
  const createMockAsset = (id: string, name: string, durationMs = 10000): MediaAsset => ({
    id,
    name,
    path: `/videos/${name}`,
    kind: 'video',
    importedAt: new Date().toISOString(),
    metadata: {
      durationMs,
      formatName: 'mov,mp4',
      sizeBytes: 2048,
      hasVideo: true,
      hasAudio: true,
      width: 1920,
      height: 1080,
      previewLikelyUnsupported: false,
    },
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <EditorProvider>{children}</EditorProvider>
  );

  // Scenario 1: Impor satu video, lalu hapus video tersebut
  it('Scenario 1: imports one video, then deletes it -> clears assets, selection, and preview', () => {
    const { result } = renderHook(() => useEditor(), { wrapper });
    const asset1 = createMockAsset('asset-1', 'clip1.mp4', 5000);

    act(() => {
      result.current.addAsset(asset1);
    });

    expect(result.current.project.assets).toHaveLength(1);
    expect(result.current.selectedAssetId).toBe('asset-1');

    // Simulate loop preview was also active on this video
    act(() => {
      result.current.setLoopPreview('nigi-media://load?path=temp_loop.mp4', 5000, 2500);
    });
    expect(result.current.playback.loopPreviewMode).toBe(true);

    // Delete the only asset
    act(() => {
      result.current.deleteAsset('asset-1');
    });

    // Verification: Everything must be completely cleared and reset
    expect(result.current.project.assets).toHaveLength(0);
    expect(result.current.selectedAssetId).toBeNull();
    expect(result.current.playback.loopPreviewMode).toBe(false);
    expect(result.current.playback.loopPreviewUrl).toBeNull();
    expect(result.current.playback.isPlaying).toBe(false);
    expect(result.current.playback.currentTimeMs).toBe(0);
  });

  // Scenario 2: Impor tiga video, lalu hapus video yang sedang aktif
  it('Scenario 2: imports 3 videos, deletes the currently active one -> switches active selection and clamps/updates state', () => {
    const { result } = renderHook(() => useEditor(), { wrapper });
    const a1 = createMockAsset('asset-1', 'clip1.mp4', 6000);
    const a2 = createMockAsset('asset-2', 'clip2.mp4', 8000);
    const a3 = createMockAsset('asset-3', 'clip3.mp4', 4000);

    act(() => {
      result.current.addAsset(a1);
      result.current.addAsset(a2);
      result.current.addAsset(a3);
      result.current.setSelectedAssetId('asset-2');
    });

    expect(result.current.project.assets).toHaveLength(3);
    expect(result.current.selectedAssetId).toBe('asset-2');

    // Delete currently active video
    act(() => {
      result.current.deleteAsset('asset-2');
    });

    expect(result.current.project.assets).toHaveLength(2);
    // Active selection switches to next available asset (asset-1)
    expect(result.current.selectedAssetId).toBe('asset-1');
    expect(result.current.project.assets.some((a: MediaAsset) => a.id === 'asset-2')).toBe(false);
  });

  // Scenario 3: Hapus seluruh media satu per satu
  it('Scenario 3: deletes all media one by one until empty -> properly reaches clean empty state', () => {
    const { result } = renderHook(() => useEditor(), { wrapper });
    const a1 = createMockAsset('asset-1', 'clip1.mp4', 5000);
    const a2 = createMockAsset('asset-2', 'clip2.mp4', 7000);

    act(() => {
      result.current.addAsset(a1);
      result.current.addAsset(a2);
    });

    expect(result.current.project.assets).toHaveLength(2);

    // Delete first
    act(() => {
      result.current.deleteAsset('asset-1');
    });
    expect(result.current.project.assets).toHaveLength(1);
    expect(result.current.selectedAssetId).toBe('asset-2');

    // Delete second
    act(() => {
      result.current.deleteAsset('asset-2');
    });
    expect(result.current.project.assets).toHaveLength(0);
    expect(result.current.selectedAssetId).toBeNull();
    expect(result.current.playback.isPlaying).toBe(false);
    expect(result.current.playback.currentTimeMs).toBe(0);
    expect(result.current.playback.loopPreviewMode).toBe(false);
  });

  // Scenario 4: Hapus seluruh media saat playback berlangsung
  it('Scenario 4: deletes all media while playback is running -> stops playback immediately and resets time to 0', () => {
    const { result } = renderHook(() => useEditor(), { wrapper });
    const a1 = createMockAsset('asset-1', 'clip1.mp4', 10000);

    act(() => {
      result.current.addAsset(a1);
      result.current.addClipToTimeline('asset-1');
      result.current.setCurrentTimeMs(3500);
      result.current.setIsPlaying(true);
    });

    expect(result.current.playback.isPlaying).toBe(true);
    expect(result.current.playback.currentTimeMs).toBe(3500);

    // Delete media while playing
    act(() => {
      result.current.deleteAllAssets();
    });

    expect(result.current.project.assets).toHaveLength(0);
    expect(result.current.project.clips).toHaveLength(0);
    expect(result.current.playback.isPlaying).toBe(false);
    expect(result.current.playback.currentTimeMs).toBe(0);
    expect(result.current.selectedAssetId).toBeNull();
    expect(result.current.selectedClipId).toBeNull();
  });

  // Scenario 5: Hapus media ketika proses loading preview / generation epoch
  it('Scenario 5: deletes media during preview loading -> increments previewEpoch to invalidate late async results', () => {
    const { result } = renderHook(() => useEditor(), { wrapper });
    const a1 = createMockAsset('asset-1', 'clip1.mp4', 5000);

    act(() => {
      result.current.addAsset(a1);
    });

    const initialEpoch = result.current.previewEpoch;

    act(() => {
      result.current.deleteAsset('asset-1');
    });

    // previewEpoch must have bumped to guarantee any late async proxy/probe response is discarded
    expect(result.current.previewEpoch).toBeGreaterThan(initialEpoch);
  });

  // Scenario 6: Hapus media, kemudian impor video baru
  it('Scenario 6: deletes media, then imports a new video -> correctly reinitializes clean preview without ghost state', () => {
    const { result } = renderHook(() => useEditor(), { wrapper });
    const oldAsset = createMockAsset('old-asset', 'old.mp4', 4000);
    const newAsset = createMockAsset('new-asset', 'new.mp4', 12000);

    act(() => {
      result.current.addAsset(oldAsset);
      result.current.addClipToTimeline('old-asset');
    });

    // Wipe all media
    act(() => {
      result.current.deleteAllAssets();
    });

    expect(result.current.project.assets).toHaveLength(0);
    expect(result.current.playback.currentTimeMs).toBe(0);

    // Import new video
    act(() => {
      result.current.addAsset(newAsset);
    });

    expect(result.current.project.assets).toHaveLength(1);
    expect(result.current.selectedAssetId).toBe('new-asset');
    expect(result.current.playback.isPlaying).toBe(false);
  });

  // Scenario 7: Hapus klip timeline tanpa menghapus sumber media dari Media Bin
  it('Scenario 7: deletes timeline clip without deleting source media from bin -> bin retains asset, timeline resets duration', () => {
    const { result } = renderHook(() => useEditor(), { wrapper });
    const a1 = createMockAsset('asset-1', 'clip1.mp4', 8000);

    act(() => {
      result.current.addAsset(a1);
      result.current.addClipToTimeline('asset-1');
    });

    expect(result.current.project.clips).toHaveLength(1);
    const clipId = result.current.project.clips[0]!.id;

    // Delete clip from timeline
    act(() => {
      result.current.deleteClip(clipId);
    });

    // Verification:
    // 1. Media Bin still has the asset
    expect(result.current.project.assets).toHaveLength(1);
    expect(result.current.project.assets[0]!.id).toBe('asset-1');
    // 2. Timeline clips is now empty
    expect(result.current.project.clips).toHaveLength(0);
    expect(result.current.selectedClipId).toBeNull();
    // 3. Playhead reset to 0 since timeline is empty
    expect(result.current.playback.currentTimeMs).toBe(0);
  });

  // Scenario 8: Hapus media yang digunakan oleh beberapa klip timeline
  it('Scenario 8: deletes media used by multiple timeline clips -> removes all referenced clips while preserving others', () => {
    const { result } = renderHook(() => useEditor(), { wrapper });
    const a1 = createMockAsset('asset-1', 'videoA.mp4', 5000);
    const a2 = createMockAsset('asset-2', 'videoB.mp4', 7000);

    act(() => {
      result.current.addAsset(a1);
      result.current.addAsset(a2);
      // Add clip of A, clip of B, another clip of A
      result.current.addClipToTimeline('asset-1');
      result.current.addClipToTimeline('asset-2');
      result.current.addClipToTimeline('asset-1');
    });

    expect(result.current.project.clips).toHaveLength(3);
    const clipsOfA = result.current.project.clips.filter((c: any) => c.assetId === 'asset-1');
    expect(clipsOfA).toHaveLength(2);

    // Select one of A's clips
    act(() => {
      result.current.setSelectedClipId(clipsOfA[0]!.id);
    });

    // Delete asset-1
    act(() => {
      result.current.deleteAsset('asset-1');
    });

    // Verification:
    expect(result.current.project.assets).toHaveLength(1);
    expect(result.current.project.assets[0]!.id).toBe('asset-2');
    // Only clip from asset-2 remains
    expect(result.current.project.clips).toHaveLength(1);
    expect(result.current.project.clips[0]!.assetId).toBe('asset-2');
    // Selected clip was deleted, so selectedClipId is null
    expect(result.current.selectedClipId).toBeNull();
  });

  describe('PreviewMonitor Component DOM State', () => {
    it('renders empty placeholder and disabled controls when no media exists', async () => {
      const { PreviewMonitor } = await import('../../src/renderer/src/components/PreviewMonitor/PreviewMonitor');
      const { render, screen } = await import('@testing-library/react');

      const { container } = render(
        <EditorProvider>
          <PreviewMonitor />
        </EditorProvider>
      );

      // Video element must NOT exist
      const videoEl = container.querySelector('video');
      expect(videoEl).toBeNull();

      // Empty state text must be present
      expect(screen.getByText('Tidak ada media pada linimasa atau bin')).toBeDefined();

      // Timecode must be 00:00:00:00 / 0:00.0
      expect(screen.getByText('00:00:00:00')).toBeDefined();
      expect(screen.getByText('/ 0:00.0')).toBeDefined();

      // Play button must be disabled
      const playBtn = screen.getByTitle('Putar (Spasi)');
      expect((playBtn as HTMLButtonElement).disabled).toBe(true);
    });
  });
});
