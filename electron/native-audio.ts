import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { SAMPLE_RATE, CHANNELS, CHUNK_FRAMES, CHUNK_FLOATS, RING_CHUNKS, RING_FLOATS } from './audio-constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const audify: any = require('audify');
const RtAudio = audify.RtAudio;
const RtAudioApi = audify.RtAudioApi;

interface StemPCM {
  left: Float32Array;
  right: Float32Array;
  length: number;
  volume: number;
  muted: boolean;
  soloed: boolean;
}

interface SpeakerState {
  worker: Worker;
  ringBuffer: SharedArrayBuffer;
  controlBuffer: SharedArrayBuffer;
  ringView: Float32Array;
  controlView: Int32Array;
  localWritePos: number;
  deviceName: string;
  stems: Set<string>;
}

export class NativeAudioPlayer {
  private speakers = new Map<string, SpeakerState>();
  private stems = new Map<string, StemPCM>();
  private playing = false;
  private position = 0;
  private totalLength = 0;
  private looping = false;
  private nextMixFrame = 0;
  private playStartOffset = 0;
  private mixTimer: ReturnType<typeof setInterval> | null = null;
  private positionTimer: ReturnType<typeof setInterval> | null = null;
  private bufferState: 'idle' | 'buffering' | 'ready' = 'idle';
  private bufferingStartTime = 0;
  private onPositionUpdate: ((pos: number, dur: number) => void) | null = null;
  private onPlaybackEnd: (() => void) | null = null;
  private onPlaybackStart: (() => void) | null = null;
  private onBufferStateUpdate: ((state: 'idle' | 'buffering' | 'ready', elapsedSec: number) => void) | null = null;

  getDevices(): { index: number; name: string; outputChannels: number; isDefault: boolean }[] {
    const rt = new RtAudio(RtAudioApi.WINDOWS_WASAPI);
    const devices = rt.getDevices();
    const defaultOut = rt.getDefaultOutputDevice();
    return devices
      .map((d: { name: string; outputChannels: number }, i: number) => ({
        index: i,
        name: d.name,
        outputChannels: d.outputChannels,
        isDefault: i === defaultOut,
      }))
      .filter((d: { outputChannels: number }) => d.outputChannels > 0);
  }

  private speakerOpenCount = 0;

  openSpeaker(speakerId: string, deviceName: string): Promise<boolean> {
    this.closeSpeaker(speakerId);

    const staggerMs = this.speakerOpenCount * 10;
    this.speakerOpenCount++;

    return new Promise<boolean>((resolve) => {
      setTimeout(() => {
        const ringBuffer = new SharedArrayBuffer(RING_FLOATS * 4);
        const controlBuffer = new SharedArrayBuffer(4 * 4);
        const ringView = new Float32Array(ringBuffer);
        const controlView = new Int32Array(controlBuffer);

        const workerPath = path.join(__dirname, 'audio-worker.js');
        const worker = new Worker(workerPath, {
          workerData: { deviceName, ringBuffer, controlBuffer, speakerId },
        });

        const sp: SpeakerState = {
          worker, ringBuffer, controlBuffer, ringView, controlView,
          localWritePos: 0, deviceName, stems: new Set(),
        };
        this.speakers.set(speakerId, sp);

        const timeout = setTimeout(() => {
          console.error(`[native-audio] Timeout opening speaker ${speakerId}`);
          resolve(false);
        }, 5000);

        worker.on('message', (msg: { type: string; device?: string; message?: string }) => {
          if (msg.type === 'opened') {
            clearTimeout(timeout);
            console.log(`[native-audio] Worker opened ${speakerId} → ${msg.device}`);
            resolve(true);
          } else if (msg.type === 'error') {
            clearTimeout(timeout);
            console.error(`[native-audio] Worker error ${speakerId}: ${msg.message}`);
            this.speakers.delete(speakerId);
            resolve(false);
          }
        });

        worker.on('error', (err) => {
          clearTimeout(timeout);
          console.error(`[native-audio] Worker crashed ${speakerId}:`, err);
          this.speakers.delete(speakerId);
          resolve(false);
        });

        worker.on('exit', (code) => {
          if (code !== 0) {
            console.log(`[native-audio] Worker exited ${speakerId} code ${code}`);
          }
        });
      }, staggerMs);
    });
  }

  closeSpeaker(speakerId: string): void {
    const sp = this.speakers.get(speakerId);
    if (!sp) return;
    try { sp.worker.postMessage({ type: 'close' }); } catch {}
    setTimeout(() => { try { sp.worker.terminate(); } catch {} }, 1000);
    this.speakers.delete(speakerId);
  }

  loadStem(stemId: string, leftData: Float32Array, rightData: Float32Array): void {
    this.stems.set(stemId, {
      left: leftData,
      right: rightData,
      length: leftData.length,
      volume: 1,
      muted: false,
      soloed: false,
    });
    this.recalcTotalLength();
  }

  unloadStem(stemId: string): void {
    this.stems.delete(stemId);
    for (const sp of this.speakers.values()) {
      sp.stems.delete(stemId);
    }
    this.recalcTotalLength();
  }

  assignStem(stemId: string, speakerId: string): void {
    for (const sp of this.speakers.values()) {
      sp.stems.delete(stemId);
    }
    const sp = this.speakers.get(speakerId);
    if (sp) sp.stems.add(stemId);
  }

  setStemVolume(stemId: string, volume: number): void {
    const stem = this.stems.get(stemId);
    if (stem) stem.volume = volume;
  }

  setStemMuted(stemId: string, muted: boolean): void {
    const stem = this.stems.get(stemId);
    if (stem) stem.muted = muted;
  }

  setStemSoloed(stemId: string, soloed: boolean): void {
    const stem = this.stems.get(stemId);
    if (stem) stem.soloed = soloed;
  }

  setLooping(looping: boolean): void {
    this.looping = looping;
  }

  setOnPositionUpdate(cb: (pos: number, dur: number) => void): void {
    this.onPositionUpdate = cb;
  }

  setOnPlaybackEnd(cb: () => void): void {
    this.onPlaybackEnd = cb;
  }

  setOnPlaybackStart(cb: () => void): void {
    this.onPlaybackStart = cb;
  }

  setOnBufferStateUpdate(cb: (state: 'idle' | 'buffering' | 'ready', elapsedSec: number) => void): void {
    this.onBufferStateUpdate = cb;
  }

  getBufferState(): 'idle' | 'buffering' | 'ready' {
    return this.bufferState;
  }

  play(fromPositionSec?: number): void {
    if (this.playing) return;
    if (fromPositionSec !== undefined) {
      this.position = Math.floor(fromPositionSec * SAMPLE_RATE);
    }

    this.bufferState = 'buffering';
    this.bufferingStartTime = performance.now();
    this.nextMixFrame = this.position;
    this.playStartOffset = this.position;

    for (const sp of this.speakers.values()) {
      sp.ringView.fill(0);
      Atomics.store(sp.controlView, 0, 0);
      Atomics.store(sp.controlView, 1, 0);
      Atomics.store(sp.controlView, 2, 0);
      sp.localWritePos = 0;
    }

    this.preMix(RING_CHUNKS);

    for (const sp of this.speakers.values()) {
      Atomics.store(sp.controlView, 0, 1);
    }

    this.startMixLoop();
    this.startBufferingTimer();
    this.onBufferStateUpdate?.('buffering', 0);

    setTimeout(() => {
      if (this.bufferState === 'buffering') {
        this.bufferState = 'idle';
        this.playing = true;
        this.stopBufferingTimer();
        const elapsed = (performance.now() - this.bufferingStartTime) / 1000;
        console.log(`[native-audio] Buffered in ${elapsed.toFixed(1)}s, playing`);
        this.onBufferStateUpdate?.('idle', 0);
        this.onPlaybackStart?.();
        this.startPositionTimer();
      }
    }, 3000);
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    this.bufferState = 'idle';
    this.position = this.getReadPositionSamples();

    for (const sp of this.speakers.values()) {
      Atomics.store(sp.controlView, 0, 0);
    }

    this.stopMixLoop();
    this.stopPositionTimer();
    this.stopBufferingTimer();

    for (const sp of this.speakers.values()) {
      try { sp.worker.postMessage({ type: 'flush' }); } catch {}
    }
  }

  stop(): void {
    this.playing = false;
    this.bufferState = 'idle';
    this.position = 0;

    for (const sp of this.speakers.values()) {
      Atomics.store(sp.controlView, 0, 0);
    }

    this.stopMixLoop();
    this.stopPositionTimer();
    this.stopBufferingTimer();
    this.onBufferStateUpdate?.('idle', 0);

    for (const sp of this.speakers.values()) {
      try { sp.worker.postMessage({ type: 'flush' }); } catch {}
    }
  }

  seek(positionSec: number): void {
    for (const sp of this.speakers.values()) {
      Atomics.store(sp.controlView, 0, 0);
    }

    this.position = Math.floor(positionSec * SAMPLE_RATE);
    this.nextMixFrame = this.position;

    for (const sp of this.speakers.values()) {
      sp.ringView.fill(0);
      Atomics.store(sp.controlView, 1, 0);
      Atomics.store(sp.controlView, 2, 0);
      sp.localWritePos = 0;
    }

    if (this.playing) {
      this.preMix(RING_CHUNKS);
      this.playStartOffset = this.position;

      for (const sp of this.speakers.values()) {
        Atomics.store(sp.controlView, 0, 1);
      }
    }
  }

  getPosition(): number {
    if (!this.playing) return this.position / SAMPLE_RATE;
    return this.getReadPositionSamples() / SAMPLE_RATE;
  }

  getDuration(): number {
    return this.totalLength / SAMPLE_RATE;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  dispose(): void {
    this.stop();
    for (const [id] of this.speakers) {
      this.closeSpeaker(id);
    }
    this.stems.clear();
  }

  private getReadPositionSamples(): number {
    if (!this.playing) return this.position;
    let minRead = Infinity;
    for (const sp of this.speakers.values()) {
      const readPos = Atomics.load(sp.controlView, 2);
      if (readPos < minRead) minRead = readPos;
    }
    if (minRead === Infinity) return this.position;
    const pos = this.playStartOffset + minRead * CHUNK_FRAMES;
    return Math.min(pos, this.totalLength);
  }

  private recalcTotalLength(): void {
    let max = 0;
    for (const stem of this.stems.values()) {
      if (stem.length > max) max = stem.length;
    }
    this.totalLength = max;
  }

  private preMix(maxChunks: number): void {
    const anySoloed = [...this.stems.values()].some(s => s.soloed);

    for (let c = 0; c < maxChunks; c++) {
      if (this.nextMixFrame >= this.totalLength) {
        if (this.looping) {
          this.nextMixFrame = 0;
        } else {
          return;
        }
      }

      for (const sp of this.speakers.values()) {
        const ringOffset = (sp.localWritePos % RING_CHUNKS) * CHUNK_FLOATS;
        const end = ringOffset + CHUNK_FLOATS;

        sp.ringView.fill(0, ringOffset, end);

        for (const stemId of sp.stems) {
          const stem = this.stems.get(stemId);
          if (!stem || stem.muted) continue;
          if (anySoloed && !stem.soloed) continue;

          const vol = stem.volume;
          for (let f = 0; f < CHUNK_FRAMES; f++) {
            const idx = this.nextMixFrame + f;
            if (idx >= stem.length) break;
            sp.ringView[ringOffset + f * 2] += stem.left[idx] * vol;
            sp.ringView[ringOffset + f * 2 + 1] += stem.right[idx] * vol;
          }
        }

        for (let i = ringOffset; i < end; i++) {
          if (sp.ringView[i] > 1) sp.ringView[i] = 1;
          else if (sp.ringView[i] < -1) sp.ringView[i] = -1;
        }

        sp.localWritePos++;
        Atomics.store(sp.controlView, 1, sp.localWritePos);
      }

      this.nextMixFrame += CHUNK_FRAMES;
    }
  }

  private startMixLoop(): void {
    this.stopMixLoop();
    this.mixTimer = setInterval(() => {
      if (!this.playing && this.bufferState === 'idle') return;

      let minBuffered = RING_CHUNKS;
      for (const sp of this.speakers.values()) {
        const readPos = Atomics.load(sp.controlView, 2);
        const buffered = sp.localWritePos - readPos;
        if (buffered < minBuffered) minBuffered = buffered;
      }

      const toMix = RING_CHUNKS - minBuffered;
      if (toMix > 0) this.preMix(toMix);

      if (this.playing && this.nextMixFrame >= this.totalLength && !this.looping) {
        let allDone = true;
        for (const sp of this.speakers.values()) {
          if (Atomics.load(sp.controlView, 2) < sp.localWritePos) {
            allDone = false;
            break;
          }
        }
        if (allDone) {
          this.playing = false;
          this.position = 0;
          for (const sp of this.speakers.values()) {
            Atomics.store(sp.controlView, 0, 0);
          }
          this.stopMixLoop();
          this.stopPositionTimer();
          this.onPlaybackEnd?.();
        }
      }
    }, 20);
  }

  private stopMixLoop(): void {
    if (this.mixTimer) {
      clearInterval(this.mixTimer);
      this.mixTimer = null;
    }
  }

  private bufferingTimer: ReturnType<typeof setInterval> | null = null;

  private startBufferingTimer(): void {
    this.stopBufferingTimer();
    this.bufferingTimer = setInterval(() => {
      if (this.bufferState !== 'buffering') return;
      const elapsed = (performance.now() - this.bufferingStartTime) / 1000;
      this.onBufferStateUpdate?.('buffering', elapsed);
    }, 100);
  }

  private stopBufferingTimer(): void {
    if (this.bufferingTimer) {
      clearInterval(this.bufferingTimer);
      this.bufferingTimer = null;
    }
  }

  private startPositionTimer(): void {
    this.stopPositionTimer();
    this.positionTimer = setInterval(() => {
      if (!this.playing) return;
      this.onPositionUpdate?.(this.getPosition(), this.getDuration());
    }, 50);
  }

  private stopPositionTimer(): void {
    if (this.positionTimer) {
      clearInterval(this.positionTimer);
      this.positionTimer = null;
    }
  }
}
