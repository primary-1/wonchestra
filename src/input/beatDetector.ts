/**
 * 지휘의 박(ictus) 찾기: 손이 충분히 빠르게, 충분히 멀리 내려오다가 위로 방향을 바꾸는 순간.
 * 화면 좌표라 y는 아래로 갈수록 커짐.
 */
export type BeatDetector = {
  /** 박이 찍혔으면 그 시각(바닥점 시각), 아니면 null */
  update: (input: { time: number; y: number }) => number | null;
  reset: () => void;
};

export const createBeatDetector = ({
  minDownSpeed,
  minDownDistance,
  refractory,
}: {
  minDownSpeed: number;
  minDownDistance: number;
  refractory: number;
}): BeatDetector => {
  let prev: { time: number; y: number } | null = null;
  let prevVelocity = 0;
  let strokeTopY = 0;
  let peakDownSpeed = 0;
  let lastBeat = -Infinity;

  return {
    update: ({ time, y }) => {
      if (!prev || time <= prev.time) {
        prev = { time, y };
        prevVelocity = 0;
        return null;
      }

      const velocity = (y - prev.y) / (time - prev.time);
      let beat: number | null = null;

      if (velocity > 0) {
        // 내려가기 시작한 순간의 높이를 기억
        if (prevVelocity <= 0) {
          strokeTopY = prev.y;
          peakDownSpeed = 0;
        }
        peakDownSpeed = Math.max(peakDownSpeed, velocity);
      } else if (prevVelocity > 0) {
        // 방향 전환: 바로 전 샘플이 바닥
        const distance = prev.y - strokeTopY;
        const isStrong = peakDownSpeed >= minDownSpeed && distance >= minDownDistance;
        if (isStrong && prev.time - lastBeat >= refractory) {
          beat = prev.time;
          lastBeat = beat;
        }
        peakDownSpeed = 0;
      }

      prevVelocity = velocity;
      prev = { time, y };
      return beat;
    },
    reset: () => {
      prev = null;
      prevVelocity = 0;
      peakDownSpeed = 0;
      lastBeat = -Infinity;
    },
  };
};
