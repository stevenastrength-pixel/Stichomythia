declare global {
  interface DesktopSource {
    id: string;
    name: string;
    type: 'screen' | 'window';
  }

  interface BtBatteryInfo {
    endpointName: string;
    battery: number;
  }

  interface NativeAudioAPI {
    getDevices: () => Promise<{ index: number; name: string; outputChannels: number; isDefault: boolean }[]>;
    openSpeaker: (speakerId: string, deviceName: string) => Promise<boolean>;
    closeSpeaker: (speakerId: string) => Promise<void>;
    loadStem: (stemId: string, left: ArrayBuffer, right: ArrayBuffer) => Promise<void>;
    unloadStem: (stemId: string) => Promise<void>;
    assignStem: (stemId: string, speakerId: string) => Promise<void>;
    setStemVolume: (stemId: string, volume: number) => Promise<void>;
    setStemMuted: (stemId: string, muted: boolean) => Promise<void>;
    setStemSoloed: (stemId: string, soloed: boolean) => Promise<void>;
    play: (fromPosition?: number) => Promise<void>;
    pause: () => Promise<void>;
    stop: () => Promise<void>;
    seek: (position: number) => Promise<void>;
    setLooping: (looping: boolean) => Promise<void>;
    getState: () => Promise<{ playing: boolean; position: number; duration: number }>;
    onPosition: (cb: (pos: number, dur: number) => void) => () => void;
    onEnded: (cb: () => void) => () => void;
    onStarted: (cb: () => void) => () => void;
    onBufferState: (cb: (state: 'idle' | 'buffering' | 'ready', elapsed: number) => void) => () => void;
  }

  interface ElectronAPI {
    getDesktopSources: () => Promise<DesktopSource[]>;
    getBtBattery: () => Promise<BtBatteryInfo[]>;
    selectFolder: () => Promise<string | null>;
    nativeAudio: NativeAudioAPI;
  }

  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
