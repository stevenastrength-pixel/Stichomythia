import { parentPort, workerData } from 'worker_threads';
import { createRequire } from 'module';
import { SAMPLE_RATE, CHANNELS, CHUNK_FRAMES, CHUNK_FLOATS, RING_CHUNKS } from './audio-constants.js';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const audify: any = require('audify');
const RtAudio = audify.RtAudio;
const RtAudioFormat = audify.RtAudioFormat;
const RtAudioApi = audify.RtAudioApi;

interface WorkerInit {
  deviceName: string;
  ringBuffer: SharedArrayBuffer;
  controlBuffer: SharedArrayBuffer;
  speakerId: string;
}

const { deviceName, ringBuffer, controlBuffer, speakerId } = workerData as WorkerInit;

const ring = new Float32Array(ringBuffer);
const control = new Int32Array(controlBuffer);
// control[0] = playing (0/1)
// control[1] = writePos (chunk index — main thread increments)
// control[2] = readPos (chunk index — this worker increments)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let rt: any = null;
let timer: ReturnType<typeof setInterval> | null = null;
const silenceBuf = Buffer.alloc(CHUNK_FRAMES * CHANNELS * 4);

function openDevice(): boolean {
  try {
    rt = new RtAudio(RtAudioApi.WINDOWS_WASAPI);
    const devices = rt.getDevices();
    const idx = devices.findIndex((d: { name: string }) =>
      d.name === deviceName || d.name.includes(deviceName) || deviceName.includes(d.name)
    );
    if (idx === -1) {
      parentPort?.postMessage({ type: 'error', message: `Device not found: ${deviceName}` });
      return false;
    }
    rt.openStream(
      { deviceId: idx, nChannels: CHANNELS, firstChannel: 0 },
      null,
      RtAudioFormat.RTAUDIO_FLOAT32,
      SAMPLE_RATE,
      CHUNK_FRAMES,
      `stichomythia-${speakerId}`,
      null,
      null,
    );
    rt.start();
    parentPort?.postMessage({ type: 'opened', device: devices[idx].name });
    return true;
  } catch (err) {
    parentPort?.postMessage({ type: 'error', message: String(err) });
    return false;
  }
}

function pump(): void {
  if (!rt) return;

  const playing = Atomics.load(control, 0);
  if (playing === 0) {
    try { rt.write(silenceBuf); } catch {}
    return;
  }

  const writePos = Atomics.load(control, 1);
  const readPos = Atomics.load(control, 2);

  if (readPos >= writePos) {
    try { rt.write(silenceBuf); } catch {}
    return;
  }

  const ringOffset = (readPos % RING_CHUNKS) * CHUNK_FLOATS;
  const chunk = new Float32Array(CHUNK_FLOATS);
  chunk.set(ring.subarray(ringOffset, ringOffset + CHUNK_FLOATS));
  const buf = Buffer.from(chunk.buffer);
  try { rt.write(buf); } catch {}
  Atomics.store(control, 2, readPos + 1);
}

if (openDevice()) {
  timer = setInterval(pump, 45);
}

parentPort?.on('message', (msg: { type: string }) => {
  if (msg.type === 'flush') {
    if (!rt) return;
    Atomics.store(control, 0, 0);
    for (let i = 0; i < 30; i++) {
      try { rt.write(silenceBuf); } catch { break; }
    }
    parentPort?.postMessage({ type: 'flushed' });
  } else if (msg.type === 'close') {
    if (timer) clearInterval(timer);
    try { rt?.closeStream(); } catch {}
    process.exit(0);
  }
});
