import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { AudioEngine } from '@/lib/audio-engine';
import type { ChannelState } from '@/lib/audio-engine';
import type { Speaker, MixerState, ChannelMixerState, EQBandSettings } from '@/types';

import { api } from '@/lib/api';
import { useAudioDevices } from '@/hooks/useAudioDevices';

interface AudioEngineContextValue {
  engine: AudioEngine;
  speakers: Speaker[];
  channels: Map<string, ChannelState>;
  connectionStatus: Map<string, boolean>;
  batteryLevels: Map<string, number>;
  mixerState: MixerState;
  mixerExpanded: boolean;
  setMixerExpanded: (expanded: boolean) => void;
  setVolume: (speakerId: string, value: number) => void;
  setMasterVolume: (value: number) => void;
  toggleMute: (speakerId: string) => void;
  toggleSolo: (speakerId: string) => void;
  setEQ: (speakerId: string, bandIndex: number, settings: Partial<EQBandSettings>) => void;
  playTestTone: (speakerId: string, index: number) => Promise<void>;
  refreshSpeakers: () => Promise<void>;
}

const AudioEngineCtx = createContext<AudioEngineContextValue | null>(null);

export function useAudioEngine() {
  const ctx = useContext(AudioEngineCtx);
  if (!ctx) throw new Error('useAudioEngine must be used within AudioEngineProvider');
  return ctx;
}

export function AudioEngineProvider({ children }: { children: React.ReactNode }) {
  const engineRef = useRef<AudioEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new AudioEngine();
  }
  const engine = engineRef.current;

  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [mixerExpanded, setMixerExpanded] = useState(false);
  const [mixerState, setMixerState] = useState<MixerState>({ masterVolume: 1, channels: [] });
  const [batteryLevels, setBatteryLevels] = useState<Map<string, number>>(new Map());
  const { devices } = useAudioDevices();

  const connectionStatus = new Map<string, boolean>();
  for (const s of speakers) {
    const connected = devices.some(d => d.deviceId === s.deviceId || d.label === s.deviceLabel);
    connectionStatus.set(s.id, connected);
  }

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistMixer = useCallback((state: MixerState) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      api.mixer.save(state).catch(() => {});
    }, 1000);
  }, []);

  const syncMixerState = useCallback(() => {
    const channels: ChannelMixerState[] = [];
    for (const ch of engine.channels.values()) {
      channels.push({
        speakerId: ch.speakerId,
        volume: ch.volume,
        muted: ch.muted,
        soloed: ch.soloed,
        eq: ch.eqSettings.map(b => ({ ...b })),
        compressorEnabled: ch.compressorEnabled,
      });
    }
    const state = { masterVolume: engine.masterVolume, channels };
    setMixerState(state);
    persistMixer(state);
  }, [engine, persistMixer]);

  const refreshSpeakers = useCallback(async () => {
    const config = await api.speakers.get();
    const seen = new Set<string>();
    const dedupedSpeakers = config.speakers.filter(s => {
      if (seen.has(s.deviceLabel)) return false;
      seen.add(s.deviceLabel);
      return true;
    });
    if (dedupedSpeakers.length < config.speakers.length) {
      api.speakers.update({ speakers: dedupedSpeakers, updatedAt: new Date().toISOString() }).catch(() => {});
    }
    setSpeakers(dedupedSpeakers);

    const existingIds = new Set(engine.channels.keys());
    for (const speaker of dedupedSpeakers) {
      const currentDevice = devices.find(d => d.deviceId === speaker.deviceId)
        ?? devices.find(d => d.label === speaker.deviceLabel);
      const deviceId = currentDevice?.deviceId ?? speaker.deviceId;
      if (!existingIds.has(speaker.id)) {
        engine.createChannel(speaker.id, deviceId);
      }
      existingIds.delete(speaker.id);
    }
    for (const orphanId of existingIds) {
      engine.removeChannel(orphanId);
    }

    engine.startKeepAlive();

    try {
      const saved = await api.mixer.get();
      if (saved.masterVolume !== undefined) {
        engine.setMasterVolume(saved.masterVolume);
      }
      for (const ch of saved.channels) {
        const channel = engine.channels.get(ch.speakerId);
        if (!channel) continue;
        engine.setVolume(ch.speakerId, ch.volume);
        engine.setMute(ch.speakerId, ch.muted);
        engine.setSolo(ch.speakerId, ch.soloed);
        ch.eq.forEach((band, i) => engine.setEQ(ch.speakerId, i, band));
      }
    } catch {}

    syncMixerState();
  }, [engine, syncMixerState]);

  const pollBattery = useCallback(async () => {
    if (!window.electronAPI?.getBtBattery) return;
    try {
      const data = await window.electronAPI.getBtBattery();
      const levels = new Map<string, number>();
      for (const entry of data) {
        const speaker = speakers.find(s => s.deviceLabel === entry.endpointName);
        if (speaker) {
          levels.set(speaker.id, entry.battery);
        }
      }
      setBatteryLevels(levels);
    } catch {}
  }, [speakers]);

  useEffect(() => {
    refreshSpeakers();
    return () => {
      engine.dispose();
    };
  }, []);

  useEffect(() => {
    if (speakers.length === 0) return;
    pollBattery();
    const interval = setInterval(pollBattery, 60000);
    return () => clearInterval(interval);
  }, [speakers, pollBattery]);

  const setVolume = useCallback((speakerId: string, value: number) => {
    engine.setVolume(speakerId, value);
    syncMixerState();
  }, [engine, syncMixerState]);

  const setMasterVolume = useCallback((value: number) => {
    engine.setMasterVolume(value);
    syncMixerState();
  }, [engine, syncMixerState]);

  const toggleMute = useCallback((speakerId: string) => {
    engine.toggleMute(speakerId);
    syncMixerState();
  }, [engine, syncMixerState]);

  const toggleSolo = useCallback((speakerId: string) => {
    engine.toggleSolo(speakerId);
    syncMixerState();
  }, [engine, syncMixerState]);

  const setEQ = useCallback((speakerId: string, bandIndex: number, settings: Partial<EQBandSettings>) => {
    engine.setEQ(speakerId, bandIndex, settings);
    syncMixerState();
  }, [engine, syncMixerState]);

  const playTestTone = useCallback(async (speakerId: string, index: number) => {
    await engine.playTestTone(speakerId, index);
  }, [engine]);

  return (
    <AudioEngineCtx.Provider value={{
      engine,
      speakers,
      channels: engine.channels,
      connectionStatus,
      batteryLevels,
      mixerState,
      mixerExpanded,
      setMixerExpanded,
      setVolume,
      setMasterVolume,
      toggleMute,
      toggleSolo,
      setEQ,
      playTestTone,
      refreshSpeakers,
    }}>
      {children}
    </AudioEngineCtx.Provider>
  );
}
