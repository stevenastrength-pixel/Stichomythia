import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { fork } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;

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

app.on('ready', async () => {
  await startServer();
  createWindow();
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  app.quit();
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
