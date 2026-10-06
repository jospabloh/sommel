// Front camera for the anti PIN-sharing photo. Only turns on while `enabled`
// (the admin asked for a photo for this person); stops the moment it is not
// needed. A missing or denied camera never blocks: the server raises an alert.
import { useCallback, useEffect, useRef, useState } from 'react';
import { PHOTO_QUALITY, photoToSend, scaledSize } from './photoSize';

export function usePhotoCapture(enabled) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [status, setStatus] = useState('off'); // off | starting | live | unavailable

  useEffect(() => {
    if (!enabled) {
      setStatus('off');
      return undefined;
    }
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unavailable');
      return undefined;
    }
    setStatus('starting');
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play?.().catch(() => {});
        }
        setStatus('live');
      })
      .catch(() => {
        if (!cancelled) setStatus('unavailable');
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [enabled]);

  // The <video> may mount after the stream arrives: attach it then.
  useEffect(() => {
    const video = videoRef.current;
    if (status === 'live' && video && streamRef.current && video.srcObject !== streamRef.current) {
      video.srcObject = streamRef.current;
      video.play?.().catch(() => {});
    }
  });

  /** A small JPEG data URL of the current frame, or null. */
  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || status !== 'live') return null;
    const size = scaledSize(video.videoWidth, video.videoHeight);
    if (!size) return null;
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const g = canvas.getContext('2d');
    if (!g) return null;
    g.drawImage(video, 0, 0, size.width, size.height);
    try {
      return photoToSend(canvas.toDataURL('image/jpeg', PHOTO_QUALITY));
    } catch {
      return null;
    }
  }, [status]);

  return { videoRef, status, capture };
}
