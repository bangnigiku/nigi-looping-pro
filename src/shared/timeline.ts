import { newId } from './project';
import type { MediaAsset, ProjectDocument, TimelineClip, TimelineTrack } from './types';

export const MIN_CLIP_MS = 100;

export function clipDuration(c: TimelineClip): number {
  return c.outMs - c.inMs;
}

export function clipEnd(c: TimelineClip): number {
  return c.startMs + clipDuration(c);
}

export function getAsset(doc: ProjectDocument, assetId: string): MediaAsset | undefined {
  return doc.assets.find((a) => a.id === assetId);
}

export function getTrack(doc: ProjectDocument, trackId: string): TimelineTrack | undefined {
  return doc.tracks.find((t) => t.id === trackId);
}

export function getClip(doc: ProjectDocument, clipId: string | null | undefined): TimelineClip | undefined {
  if (!clipId) return undefined;
  return doc.clips.find((c) => c.id === clipId);
}

export function clipsOnTrack(doc: ProjectDocument, trackId: string): TimelineClip[] {
  return doc.clips.filter((c) => c.trackId === trackId).sort((a, b) => a.startMs - b.startMs);
}

/** Total timeline length: end of the last clip on any track. */
export function sequenceDuration(doc: ProjectDocument): number {
  let end = 0;
  for (const c of doc.clips) end = Math.max(end, clipEnd(c));
  return end;
}

export function trackAccepts(track: TimelineTrack, asset: MediaAsset): boolean {
  return track.kind === 'video' ? asset.metadata.hasVideo : asset.metadata.hasAudio;
}

export function clipAt(doc: ProjectDocument, trackId: string, timeMs: number): TimelineClip | undefined {
  return doc.clips.find((c) => c.trackId === trackId && timeMs >= c.startMs && timeMs < clipEnd(c));
}

/**
 * Maps global timeline time to the source file time within a clip.
 * Clamps to [clip.inMs, clip.outMs].
 */
export function globalTimeToClipSourceMs(clip: TimelineClip, globalTimeMs: number): number {
  const offset = globalTimeMs - clip.startMs;
  return Math.min(clip.outMs, Math.max(clip.inMs, clip.inMs + offset));
}

/**
 * Finds the active video clip across video tracks at global time `timeMs`.
 * Prioritizes overlay track (track-video-2) over main video track (track-video-1).
 */
export function activeVideoClipAt(doc: ProjectDocument, timeMs: number): TimelineClip | null {
  // Check overlay first
  const overlay = clipAt(doc, 'track-video-2', timeMs);
  if (overlay) return overlay;
  // Then check main track
  return clipAt(doc, 'track-video-1', timeMs) ?? null;
}

/**
 * Finds the next clip on any track that begins after globalTimeMs.
 */
export function nextClipAfter(doc: ProjectDocument, globalTimeMs: number): TimelineClip | null {
  const upcoming = doc.clips
    .filter((c) => c.startMs > globalTimeMs)
    .sort((a, b) => a.startMs - b.startMs);
  return upcoming[0] ?? null;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function canPlace(doc: ProjectDocument, trackId: string, startMs: number, durMs: number, ignoreId?: string): boolean {
  if (startMs < 0) return false;
  return !doc.clips.some((c) => c.trackId === trackId && c.id !== ignoreId && overlaps(startMs, startMs + durMs, c.startMs, clipEnd(c)));
}

/**
 * Finds the free position closest to `desired` where a clip of `durMs` fits on the track.
 * Candidate positions are the desired spot, and the edges of every other clip.
 */
export function nearestFreeStart(doc: ProjectDocument, trackId: string, desired: number, durMs: number, ignoreId?: string): number {
  const d = Math.max(0, Math.round(desired));
  if (canPlace(doc, trackId, d, durMs, ignoreId)) return d;
  const others = doc.clips.filter((c) => c.trackId === trackId && c.id !== ignoreId);
  const candidates = new Set<number>([0]);
  for (const c of others) {
    candidates.add(clipEnd(c));
    candidates.add(c.startMs - durMs);
  }
  let best = Number.POSITIVE_INFINITY;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const cand of candidates) {
    if (cand < 0 || !canPlace(doc, trackId, cand, durMs, ignoreId)) continue;
    const dist = Math.abs(cand - d);
    if (dist < bestDist) {
      bestDist = dist;
      best = cand;
    }
  }
  if (Number.isFinite(best)) return best;
  // Fallback: append after the last clip.
  return others.reduce((m, c) => Math.max(m, clipEnd(c)), 0);
}

export function trackEnd(doc: ProjectDocument, trackId: string): number {
  return doc.clips.filter((c) => c.trackId === trackId).reduce((m, c) => Math.max(m, clipEnd(c)), 0);
}

function withClips(doc: ProjectDocument, clips: TimelineClip[]): ProjectDocument {
  return { ...doc, clips };
}

function replaceClip(doc: ProjectDocument, clip: TimelineClip): ProjectDocument {
  return withClips(
    doc,
    doc.clips.map((c) => (c.id === clip.id ? clip : c)),
  );
}

export class TimelineError extends Error {
  constructor(public readonly code: 'track-incompatible' | 'clip-not-found' | 'invalid-range' | 'asset-not-found') {
    super(code);
  }
}

/** Adds an asset to a track. When `startMs` is omitted the clip is appended at the end of the track. */
export function addClip(
  doc: ProjectDocument,
  assetId: string,
  trackId: string,
  startMs?: number,
): { doc: ProjectDocument; clip: TimelineClip } {
  const asset = getAsset(doc, assetId);
  const track = getTrack(doc, trackId);
  if (!asset) throw new TimelineError('asset-not-found');
  if (!track || !trackAccepts(track, asset)) throw new TimelineError('track-incompatible');
  const dur = Math.round(asset.metadata.durationMs);
  if (dur < MIN_CLIP_MS) throw new TimelineError('invalid-range');
  const desired = startMs ?? trackEnd(doc, trackId);
  const start = nearestFreeStart(doc, trackId, desired, dur);
  const clip: TimelineClip = {
    id: newId('clip'),
    assetId,
    trackId,
    startMs: start,
    inMs: 0,
    outMs: dur,
    volume: 1,
    muted: false,
    fitMode: doc.settings.defaultFitMode,
  };
  return { doc: withClips(doc, [...doc.clips, clip]), clip };
}

export function moveClip(doc: ProjectDocument, clipId: string, desiredStart: number, targetTrackId?: string): ProjectDocument {
  const clip = getClip(doc, clipId);
  if (!clip) throw new TimelineError('clip-not-found');
  const trackId = targetTrackId ?? clip.trackId;
  if (trackId !== clip.trackId) {
    const track = getTrack(doc, trackId);
    const asset = getAsset(doc, clip.assetId);
    if (!track || !asset || !trackAccepts(track, asset)) throw new TimelineError('track-incompatible');
  }
  const start = nearestFreeStart(doc, trackId, desiredStart, clipDuration(clip), clipId);
  return replaceClip(doc, { ...clip, startMs: start, trackId });
}

function neighbours(doc: ProjectDocument, clip: TimelineClip): { prevEnd: number; nextStart: number } {
  let prevEnd = 0;
  let nextStart = Number.POSITIVE_INFINITY;
  for (const c of doc.clips) {
    if (c.trackId !== clip.trackId || c.id === clip.id) continue;
    if (clipEnd(c) <= clip.startMs) prevEnd = Math.max(prevEnd, clipEnd(c));
    else if (c.startMs >= clipEnd(clip)) nextStart = Math.min(nextStart, c.startMs);
  }
  return { prevEnd, nextStart };
}

/** Moves the left edge of a clip to `newStartMs` on the timeline, adjusting the source in point. */
export function trimClipStart(doc: ProjectDocument, clipId: string, newStartMs: number): ProjectDocument {
  const clip = getClip(doc, clipId);
  if (!clip) throw new TimelineError('clip-not-found');
  const { prevEnd } = neighbours(doc, clip);
  const end = clipEnd(clip);
  // Bounds: cannot reveal before source 0, cannot overlap previous clip, keep min length.
  const minStart = Math.max(prevEnd, clip.startMs - clip.inMs);
  const maxStart = end - MIN_CLIP_MS;
  const start = Math.round(Math.min(maxStart, Math.max(minStart, newStartMs)));
  const delta = start - clip.startMs;
  return replaceClip(doc, { ...clip, startMs: start, inMs: clip.inMs + delta });
}

/** Moves the right edge of a clip to `newEndMs` on the timeline, adjusting the source out point. */
export function trimClipEnd(doc: ProjectDocument, clipId: string, newEndMs: number): ProjectDocument {
  const clip = getClip(doc, clipId);
  if (!clip) throw new TimelineError('clip-not-found');
  const asset = getAsset(doc, clip.assetId);
  if (!asset) throw new TimelineError('asset-not-found');
  const { nextStart } = neighbours(doc, clip);
  const maxEnd = Math.min(nextStart, clip.startMs + (asset.metadata.durationMs - clip.inMs));
  const minEnd = clip.startMs + MIN_CLIP_MS;
  const end = Math.round(Math.min(maxEnd, Math.max(minEnd, newEndMs)));
  return replaceClip(doc, { ...clip, outMs: clip.inMs + (end - clip.startMs) });
}

/** Splits a clip at a timeline position. Returns null if the position is too close to an edge. */
export function splitClip(doc: ProjectDocument, clipId: string, atMs: number): { doc: ProjectDocument; left: TimelineClip; right: TimelineClip } | null {
  const clip = getClip(doc, clipId);
  if (!clip) throw new TimelineError('clip-not-found');
  const at = Math.round(atMs);
  if (at - clip.startMs < MIN_CLIP_MS || clipEnd(clip) - at < MIN_CLIP_MS) return null;
  const splitSource = clip.inMs + (at - clip.startMs);
  const left: TimelineClip = { ...clip, outMs: splitSource };
  const right: TimelineClip = { ...clip, id: newId('clip'), startMs: at, inMs: splitSource };
  const clips = doc.clips.flatMap((c) => (c.id === clipId ? [left, right] : [c]));
  let next = withClips(doc, clips);
  if (next.settings.loop.clipId === clipId) {
    next = { ...next, settings: { ...next.settings, loop: { ...next.settings.loop, clipId: left.id } } };
  }
  return { doc: next, left, right };
}

export function deleteClip(doc: ProjectDocument, clipId: string): ProjectDocument {
  const next = withClips(
    doc,
    doc.clips.filter((c) => c.id !== clipId),
  );
  if (next.settings.loop.clipId === clipId) {
    return { ...next, settings: { ...next.settings, loop: { ...next.settings.loop, clipId: null } } };
  }
  return next;
}

export function updateClip(doc: ProjectDocument, clipId: string, patch: Partial<Pick<TimelineClip, 'volume' | 'muted' | 'fitMode'>>): ProjectDocument {
  const clip = getClip(doc, clipId);
  if (!clip) throw new TimelineError('clip-not-found');
  return replaceClip(doc, { ...clip, ...patch });
}

/** Sets exact source in/out points (used by inspector and seam finder). Keeps start position; resolves overlap. */
export function setClipRange(doc: ProjectDocument, clipId: string, inMs: number, outMs: number): ProjectDocument {
  const clip = getClip(doc, clipId);
  if (!clip) throw new TimelineError('clip-not-found');
  const asset = getAsset(doc, clip.assetId);
  if (!asset) throw new TimelineError('asset-not-found');
  const i = Math.round(Math.max(0, Math.min(inMs, asset.metadata.durationMs - MIN_CLIP_MS)));
  const o = Math.round(Math.min(asset.metadata.durationMs, Math.max(i + MIN_CLIP_MS, outMs)));
  const updated = { ...clip, inMs: i, outMs: o };
  const base = replaceClip(doc, updated);
  const start = nearestFreeStart(base, clip.trackId, clip.startMs, o - i, clipId);
  return replaceClip(base, { ...updated, startMs: start });
}

/** Removes an asset and every clip that references it. */
export function removeAsset(doc: ProjectDocument, assetId: string): ProjectDocument {
  const removedClipIds = new Set(doc.clips.filter((c) => c.assetId === assetId).map((c) => c.id));
  const loopClip = doc.settings.loop.clipId;
  return {
    ...doc,
    assets: doc.assets.filter((a) => a.id !== assetId),
    clips: doc.clips.filter((c) => c.assetId !== assetId),
    settings:
      loopClip && removedClipIds.has(loopClip) ? { ...doc.settings, loop: { ...doc.settings.loop, clipId: null } } : doc.settings,
  };
}

/** Returns the snapped time if within threshold of any target, otherwise the input. */
export function snapTime(time: number, targets: number[], thresholdMs: number): { time: number; snapped: boolean; target?: number } {
  let best: number | undefined;
  let bestDist = thresholdMs;
  for (const t of targets) {
    const d = Math.abs(t - time);
    if (d <= bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best === undefined ? { time, snapped: false } : { time: best, snapped: true, target: best };
}

/** Snap targets: timeline origin, playhead, and every clip edge except the excluded clip. */
export function snapTargets(doc: ProjectDocument, playheadMs: number, excludeClipId?: string): number[] {
  const targets = [0, playheadMs];
  for (const c of doc.clips) {
    if (c.id === excludeClipId) continue;
    targets.push(c.startMs, clipEnd(c));
  }
  return targets;
}
