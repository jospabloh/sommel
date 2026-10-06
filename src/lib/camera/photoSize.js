// Pure helpers for the anti PIN-sharing photo (no imports, tested in Deno).

/** Width of the stored photo; ~8 KB as JPEG at quality 0.6. */
export const PHOTO_WIDTH = 240;
export const PHOTO_QUALITY = 0.6;
/** Same cap as the server (_security.ts MAX_PHOTO_CHARS). */
export const MAX_PHOTO_CHARS = 80_000;

/** Output size keeping the aspect ratio, never upscaling. */
export function scaledSize(width, height, maxWidth = PHOTO_WIDTH) {
  if (!(width > 0) || !(height > 0)) return null;
  const w = Math.min(width, maxWidth);
  return { width: Math.round(w), height: Math.round((height * w) / width) };
}

/** The data URL to send, or null when it is empty or too big. */
export function photoToSend(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return null;
  return dataUrl.length <= MAX_PHOTO_CHARS ? dataUrl : null;
}
