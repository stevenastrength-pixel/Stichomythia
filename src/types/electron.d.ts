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

  interface ElectronAPI {
    getDesktopSources: () => Promise<DesktopSource[]>;
    getBtBattery: () => Promise<BtBatteryInfo[]>;
  }

  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
