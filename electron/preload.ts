import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),
  getBtBattery: () => ipcRenderer.invoke('get-bt-battery'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),

  nativeAudio: {
    getDevices: () => ipcRenderer.invoke('native-audio:get-devices'),
    openSpeaker: (speakerId: string, deviceName: string) =>
      ipcRenderer.invoke('native-audio:open-speaker', speakerId, deviceName),
    closeSpeaker: (speakerId: string) =>
      ipcRenderer.invoke('native-audio:close-speaker', speakerId),
    loadStem: (stemId: string, left: ArrayBuffer, right: ArrayBuffer) =>
      ipcRenderer.invoke('native-audio:load-stem', stemId, left, right),
    unloadStem: (stemId: string) =>
      ipcRenderer.invoke('native-audio:unload-stem', stemId),
    assignStem: (stemId: string, speakerId: string) =>
      ipcRenderer.invoke('native-audio:assign-stem', stemId, speakerId),
    setStemVolume: (stemId: string, volume: number) =>
      ipcRenderer.invoke('native-audio:set-stem-volume', stemId, volume),
    setStemMuted: (stemId: string, muted: boolean) =>
      ipcRenderer.invoke('native-audio:set-stem-muted', stemId, muted),
    setStemSoloed: (stemId: string, soloed: boolean) =>
      ipcRenderer.invoke('native-audio:set-stem-soloed', stemId, soloed),
    play: (fromPosition?: number) =>
      ipcRenderer.invoke('native-audio:play', fromPosition),
    pause: () => ipcRenderer.invoke('native-audio:pause'),
    stop: () => ipcRenderer.invoke('native-audio:stop'),
    seek: (position: number) => ipcRenderer.invoke('native-audio:seek', position),
    setLooping: (looping: boolean) => ipcRenderer.invoke('native-audio:set-looping', looping),
    getState: () => ipcRenderer.invoke('native-audio:get-state') as Promise<{ playing: boolean; position: number; duration: number }>,
    onPosition: (cb: (pos: number, dur: number) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, pos: number, dur: number) => cb(pos, dur);
      ipcRenderer.on('native-audio:position', handler);
      return () => ipcRenderer.removeListener('native-audio:position', handler);
    },
    onEnded: (cb: () => void) => {
      const handler = () => cb();
      ipcRenderer.on('native-audio:ended', handler);
      return () => ipcRenderer.removeListener('native-audio:ended', handler);
    },
    onStarted: (cb: () => void) => {
      const handler = () => cb();
      ipcRenderer.on('native-audio:started', handler);
      return () => ipcRenderer.removeListener('native-audio:started', handler);
    },
    onBufferState: (cb: (state: 'idle' | 'buffering' | 'ready', elapsed: number) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, state: 'idle' | 'buffering' | 'ready', elapsed: number) => cb(state, elapsed);
      ipcRenderer.on('native-audio:buffer-state', handler);
      return () => ipcRenderer.removeListener('native-audio:buffer-state', handler);
    },
  },
});
