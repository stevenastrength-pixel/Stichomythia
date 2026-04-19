const FREQUENCIES = [440, 554, 659, 880];

export async function playTestTone(deviceId: string, speakerNumber: number = 0): Promise<void> {
  const freq = FREQUENCIES[speakerNumber % FREQUENCIES.length];
  const duration = 1;

  const audio = new Audio();
  try {
    await audio.setSinkId(deviceId);
  } catch (err) {
    console.warn('setSinkId failed for test tone:', err);
  }

  const ctx = new AudioContext();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.value = freq;
  gain.gain.value = 0.3;

  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
  gain.gain.setValueAtTime(0.3, ctx.currentTime + duration - 0.1);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

  oscillator.connect(gain);

  const dest = ctx.createMediaStreamDestination();
  gain.connect(dest);

  audio.srcObject = dest.stream;
  await audio.play();

  oscillator.start();
  oscillator.stop(ctx.currentTime + duration);

  return new Promise((resolve) => {
    setTimeout(() => {
      audio.pause();
      audio.srcObject = null;
      ctx.close();
      resolve();
    }, duration * 1000 + 100);
  });
}
