interface DesktopSource {
  id: string;
  name: string;
  thumbnail: string;
}

interface ElectronAPI {
  getDesktopSources: () => Promise<DesktopSource[]>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
