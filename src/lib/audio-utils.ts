const FREQUENCIES = [440, 554, 659, 880];

export async function playTestTone(deviceId: string, speakerNumber: number = 0): Promise<void> {
  const freq = FREQUENCIES[speakerNumber % FREQUENCIES.length];
  const duration = 1;

  const ctx = new AudioContext({ sinkId: deviceId } as AudioContextOptions);

  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.value = freq;

  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
  gain.gain.setValueAtTime(0.3, ctx.currentTime + duration - 0.1);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  oscillator.start();
  oscillator.stop(ctx.currentTime + duration);

  return new Promise((resolve) => {
    setTimeout(() => {
      ctx.close();
      resolve();
    }, duration * 1000 + 100);
  });
}
