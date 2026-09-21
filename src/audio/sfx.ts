/** 메트로놈 "딱" */
export const playClick = ({ ctx, time, accent }: { ctx: AudioContext; time: number; accent: boolean }) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = accent ? 1760 : 1320;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.3, time + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.08);
  osc.connect(gain).connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.1);
};

/** 단계 통과 "띠링" (도-미-솔) */
export const playSuccess = ({ ctx }: { ctx: AudioContext }) => {
  [523.25, 659.25, 783.99].forEach((frequency, i) => {
    const time = ctx.currentTime + i * 0.07;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.2, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.4);
  });
};
