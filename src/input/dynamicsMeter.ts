import type { DynamicLevel } from '../chart/types';
import type { Point } from '../tracking/oneEuroFilter';

export type DynamicsReading = {
  /** 최근 시간 창 동안 손이 그린 궤적 크기 (화면 높이 기준) */
  amplitude: number;
  /** 0~1 연속 세기 */
  level: number;
  dynamic: DynamicLevel;
};

export type DynamicsMeter = {
  update: (input: { time: number; point: Point }) => DynamicsReading;
  clear: () => void;
};

/** 셈여림 = 지휘 동작의 크기. 크게 저으면 f, 작게 저으면 p */
export const createDynamicsMeter = ({
  window,
  mfFrom,
  fFrom,
  minAmplitude,
  maxAmplitude,
}: {
  window: number;
  mfFrom: number;
  fFrom: number;
  minAmplitude: number;
  maxAmplitude: number;
}): DynamicsMeter => {
  let samples: { time: number; point: Point }[] = [];

  return {
    update: ({ time, point }) => {
      if (samples.length > 0 && time < samples[samples.length - 1].time) samples = [];
      samples.push({ time, point });
      while (samples.length > 0 && samples[0].time < time - window) samples.shift();

      const xs = samples.map((s) => s.point.x);
      const ys = samples.map((s) => s.point.y);
      // 좌우 동작은 위아래보다 조금 덜 쳐줌 (지휘는 위아래가 주 동작)
      const amplitude = Math.max(Math.max(...ys) - Math.min(...ys), (Math.max(...xs) - Math.min(...xs)) * 0.8);
      const level = Math.min(1, Math.max(0, (amplitude - minAmplitude) / (maxAmplitude - minAmplitude)));
      const dynamic: DynamicLevel = amplitude < mfFrom ? 'p' : amplitude < fFrom ? 'mf' : 'f';

      return { amplitude, level, dynamic };
    },
    clear: () => {
      samples = [];
    },
  };
};
