/**
 * One Euro Filter: 천천히 움직일 땐 떨림을 강하게 깎고, 빠르게 움직일 땐 덜 깎아서 지연을 줄이는 필터.
 * https://gery.casiez.net/1euro/
 */
const smoothingFactor = ({ dt, cutoff }: { dt: number; cutoff: number }) => {
  const r = 2 * Math.PI * cutoff * dt;
  return r / (r + 1);
};

export type OneEuroFilter = {
  filter: (input: { value: number; time: number }) => number;
  reset: () => void;
};

export const createOneEuroFilter = ({
  minCutoff,
  beta,
  dCutoff = 1,
}: {
  minCutoff: number;
  beta: number;
  dCutoff?: number;
}): OneEuroFilter => {
  let prevTime: number | null = null;
  let prevValue = 0;
  let prevDerivative = 0;

  return {
    filter: ({ value, time }) => {
      if (prevTime === null || time <= prevTime) {
        prevTime = time;
        prevValue = value;
        prevDerivative = 0;
        return value;
      }
      const dt = time - prevTime;
      const derivative = (value - prevValue) / dt;
      const aD = smoothingFactor({ dt, cutoff: dCutoff });
      const smoothedDerivative = aD * derivative + (1 - aD) * prevDerivative;

      const cutoff = minCutoff + beta * Math.abs(smoothedDerivative);
      const a = smoothingFactor({ dt, cutoff });
      const smoothed = a * value + (1 - a) * prevValue;

      prevTime = time;
      prevValue = smoothed;
      prevDerivative = smoothedDerivative;
      return smoothed;
    },
    reset: () => {
      prevTime = null;
    },
  };
};

export type Point = { x: number; y: number };

export const createPointFilter = ({ minCutoff, beta }: { minCutoff: number; beta: number }) => {
  const fx = createOneEuroFilter({ minCutoff, beta });
  const fy = createOneEuroFilter({ minCutoff, beta });
  return {
    filter: ({ point, time }: { point: Point; time: number }): Point => ({
      x: fx.filter({ value: point.x, time }),
      y: fy.filter({ value: point.y, time }),
    }),
    reset: () => {
      fx.reset();
      fy.reset();
    },
  };
};
