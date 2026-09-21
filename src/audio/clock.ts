/**
 * 지금 스피커에서 나오고 있는 소리의 AudioContext 시각.
 * currentTime은 "앞으로 만들 소리" 기준이라 출력 지연만큼 빠름. 판정은 들리는 소리 기준이어야 함.
 */
export const heardTime = ({ ctx }: { ctx: AudioContext }) => {
  const ts = ctx.getOutputTimestamp?.();
  if (ts?.contextTime !== undefined && ts.performanceTime !== undefined && ts.performanceTime > 0) {
    return ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
  }
  return ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
};
