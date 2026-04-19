declare global {
  interface DesktopSource {
    id: string;
    name: string;
    type: 'screen' | 'window';
  }

  interface ElectronAPI {
    getDesktopSources: () => Promise<DesktopSource[]>;
  }

  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
