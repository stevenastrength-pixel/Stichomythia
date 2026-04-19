import { useState, useEffect, useCallback } from 'react';

export function useAudioDevices() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      let allDevices = await navigator.mediaDevices.enumerateDevices();
      let outputs = allDevices.filter(d => d.kind === 'audiooutput');

      if (outputs.length > 0 && outputs.every(d => !d.label)) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(t => t.stop());
          allDevices = await navigator.mediaDevices.enumerateDevices();
          outputs = allDevices.filter(d => d.kind === 'audiooutput');
        } catch {}
      }

      setDevices(outputs);
    } catch (err) {
      console.error('Failed to enumerate audio devices:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    navigator.mediaDevices.addEventListener('devicechange', refresh);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refresh);
  }, [refresh]);

  return { devices, refresh, loading };
}
