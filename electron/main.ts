import { app, BrowserWindow, shell, ipcMain, desktopCapturer, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { fork, execFile } from 'child_process';
import { NativeAudioPlayer } from './native-audio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;
const nativeAudio = new NativeAudioPlayer();

let mainWindow: BrowserWindow | null = null;
let serverProcess: ReturnType<typeof fork> | null = null;

function startServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const serverPath = isDev
      ? path.join(__dirname, '..', 'server', 'index.ts')
      : path.join(process.resourcesPath, 'server', 'index.cjs');

    const execArgv = isDev ? ['--import', 'tsx'] : [];

    serverProcess = fork(serverPath, [], {
      cwd: isDev ? path.join(__dirname, '..') : process.resourcesPath,
      execArgv,
      env: {
        ...process.env,
        NODE_ENV: isDev ? 'development' : 'production',
        ELECTRON_APP: 'true',
        RESOURCES_PATH: isDev ? '' : process.resourcesPath,
      },
      stdio: 'pipe',
    });

    serverProcess.stdout?.on('data', (data: Buffer) => {
      const msg = data.toString();
      console.log('[server]', msg);
      if (msg.includes('running on')) resolve();
    });

    serverProcess.stderr?.on('data', (data: Buffer) => {
      console.error('[server]', data.toString());
    });

    serverProcess.on('error', (err) => {
      console.error('[server] fork error:', err);
      reject(err);
    });

    serverProcess.on('exit', (code) => {
      console.error('[server] exited with code:', code);
    });

    setTimeout(resolve, 5000);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0B0F19',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0B0F19',
      symbolColor: '#8a8f98',
      height: 36,
    },
    title: 'Stichomythia',
    icon: isDev
      ? path.join(__dirname, '..', 'build', 'icon.ico')
      : path.join(process.resourcesPath, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: isDev
        ? path.join(__dirname, '..', 'dist-electron', 'preload.js')
        : path.join(__dirname, 'preload.js'),
    },
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadURL('http://localhost:3001');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const JUNK_WINDOWS = [
  'SOUI_DUMMY_WND',
  'Default IME',
  'MSCTFIME UI',
  'Windows Input Experience',
  'Program Manager',
  'Microsoft Text Input Application',
  'CiceroUIWndFrame',
];

ipcMain.handle('get-desktop-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 1, height: 1 },
  });

  return sources
    .filter(s => {
      if (s.id.startsWith('screen:')) return true;
      if (JUNK_WINDOWS.some(j => s.name.includes(j))) return false;
      if (s.name.trim() === '') return false;
      return true;
    })
    .map(s => ({
      id: s.id,
      name: s.id.startsWith('screen:') ? 'Entire System Audio' : s.name,
      type: s.id.startsWith('screen:') ? 'screen' as const : 'window' as const,
    }));
});

ipcMain.handle('get-bt-battery', async () => {
  return new Promise<{ endpointName: string; battery: number }[]>((resolve) => {
    const psScript = `
$results = @()
$containerBattery = @{}
$hfDevices = Get-PnpDevice -FriendlyName '*Hands-Free AG*' -Status OK -ErrorAction SilentlyContinue
foreach ($d in $hfDevices) {
  $bat = Get-PnpDeviceProperty -InstanceId $d.InstanceId -KeyName '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2' -ErrorAction SilentlyContinue
  if ($bat -and $bat.Type -ne 'Empty') {
    $mac = ''
    if ($d.InstanceId -match '([0-9A-Fa-f]{12})_C') { $mac = $Matches[1] }
    if ($mac) {
      $btDev = Get-PnpDevice -Class Bluetooth -Status OK -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -like "*$mac*" -and $_.InstanceId -like 'BTHENUM\\DEV_*' }
      if ($btDev) {
        $cid = Get-PnpDeviceProperty -InstanceId $btDev.InstanceId -KeyName 'DEVPKEY_Device_ContainerId' -ErrorAction SilentlyContinue
        if ($cid -and $cid.Data) { $containerBattery[$cid.Data.ToString()] = [int]$bat.Data }
      }
    }
  }
}
$endpoints = Get-PnpDevice -Class AudioEndpoint -Status OK -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -like 'Headphones (*' }
foreach ($ep in $endpoints) {
  $cid = Get-PnpDeviceProperty -InstanceId $ep.InstanceId -KeyName 'DEVPKEY_Device_ContainerId' -ErrorAction SilentlyContinue
  if ($cid -and $cid.Data -and $containerBattery.ContainsKey($cid.Data.ToString())) {
    $results += [PSCustomObject]@{ endpointName=$ep.FriendlyName; battery=$containerBattery[$cid.Data.ToString()] }
  }
}
$results | ConvertTo-Json -Compress
`;
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript], { timeout: 15000 }, (err, stdout) => {
      if (err) { resolve([]); return; }
      try {
        const trimmed = stdout.trim();
        if (!trimmed) { resolve([]); return; }
        const parsed = JSON.parse(trimmed);
        resolve(Array.isArray(parsed) ? parsed : [parsed]);
      } catch {
        resolve([]);
      }
    });
  });
});

ipcMain.handle('select-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Audio Folder',
  });
  return result.canceled ? null : result.filePaths[0] || null;
});

// Native audio IPC
ipcMain.handle('native-audio:get-devices', () => {
  return nativeAudio.getDevices();
});

ipcMain.handle('native-audio:open-speaker', (_e, speakerId: string, deviceName: string) => {
  return nativeAudio.openSpeaker(speakerId, deviceName);
});

ipcMain.handle('native-audio:close-speaker', (_e, speakerId: string) => {
  nativeAudio.closeSpeaker(speakerId);
});

ipcMain.handle('native-audio:load-stem', (_e, stemId: string, leftBuf: ArrayBuffer, rightBuf: ArrayBuffer) => {
  nativeAudio.loadStem(stemId, new Float32Array(leftBuf), new Float32Array(rightBuf));
});

ipcMain.handle('native-audio:unload-stem', (_e, stemId: string) => {
  nativeAudio.unloadStem(stemId);
});

ipcMain.handle('native-audio:assign-stem', (_e, stemId: string, speakerId: string) => {
  nativeAudio.assignStem(stemId, speakerId);
});

ipcMain.handle('native-audio:set-stem-volume', (_e, stemId: string, volume: number) => {
  nativeAudio.setStemVolume(stemId, volume);
});

ipcMain.handle('native-audio:set-stem-muted', (_e, stemId: string, muted: boolean) => {
  nativeAudio.setStemMuted(stemId, muted);
});

ipcMain.handle('native-audio:set-stem-soloed', (_e, stemId: string, soloed: boolean) => {
  nativeAudio.setStemSoloed(stemId, soloed);
});

ipcMain.handle('native-audio:play', (_e, fromPosition?: number) => {
  nativeAudio.play(fromPosition);
});

ipcMain.handle('native-audio:pause', () => {
  nativeAudio.pause();
});

ipcMain.handle('native-audio:stop', () => {
  nativeAudio.stop();
});

ipcMain.handle('native-audio:seek', (_e, position: number) => {
  nativeAudio.seek(position);
});

ipcMain.handle('native-audio:set-looping', (_e, looping: boolean) => {
  nativeAudio.setLooping(looping);
});

ipcMain.handle('native-audio:get-state', () => {
  return {
    playing: nativeAudio.isPlaying(),
    position: nativeAudio.getPosition(),
    duration: nativeAudio.getDuration(),
  };
});

function setupNativeAudioCallbacks() {
  nativeAudio.setOnPositionUpdate((pos, dur) => {
    mainWindow?.webContents.send('native-audio:position', pos, dur);
  });
  nativeAudio.setOnPlaybackEnd(() => {
    mainWindow?.webContents.send('native-audio:ended');
  });
  nativeAudio.setOnPlaybackStart(() => {
    mainWindow?.webContents.send('native-audio:started');
  });
  nativeAudio.setOnBufferStateUpdate((state, elapsed) => {
    mainWindow?.webContents.send('native-audio:buffer-state', state, elapsed);
  });
}

app.on('ready', async () => {
  await startServer();
  createWindow();
  setupNativeAudioCallbacks();
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  app.quit();
});

app.on('before-quit', () => {
  nativeAudio.dispose();
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
