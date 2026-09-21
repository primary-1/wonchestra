import { beforeEach, describe, expect, it } from 'vitest';
import { createDynamicsMeter, type DynamicsMeter } from '../../src/input/dynamicsMeter';

const FPS = 30;

const feed = ({
  meter,
  amplitude,
  from = 0,
  duration = 1.2,
}: {
  meter: DynamicsMeter;
  amplitude: number;
  from?: number;
  duration?: number;
}) => {
  let reading = meter.update({ time: from, point: { x: 0.6, y: 0.5 } });
  for (let i = 1; i <= duration * FPS; i++) {
    const time = from + i / FPS;
    reading = meter.update({ time, point: { x: 0.6, y: 0.5 + (amplitude / 2) * Math.sin(time * 10) } });
  }
  return reading;
};

describe('dynamicsMeter', () => {
  let meter: DynamicsMeter;

  beforeEach(() => {
    meter = createDynamicsMeter({ window: 1, mfFrom: 0.1, fFrom: 0.22, minAmplitude: 0.03, maxAmplitude: 0.32 });
  });

  it.each([
    { amplitude: 0.05, dynamic: 'p' },
    { amplitude: 0.15, dynamic: 'mf' },
    { amplitude: 0.3, dynamic: 'f' },
  ])('궤적 크기 $amplitude → $dynamic', ({ amplitude, dynamic }) => {
    const reading = feed({ meter, amplitude });

    expect(reading.dynamic).toBe(dynamic);
    expect(reading.amplitude).toBeCloseTo(amplitude, 1);
  });

  it('연속 세기는 0~1로 잘린다', () => {
    expect(feed({ meter, amplitude: 0.01 }).level).toBe(0);
    meter.clear();
    expect(feed({ meter, amplitude: 0.6 }).level).toBe(1);
  });

  it('시간 창 밖의 큰 동작은 잊는다', () => {
    feed({ meter, amplitude: 0.3 });
    const reading = feed({ meter, amplitude: 0.02, from: 1.3, duration: 1.5 });

    expect(reading.dynamic).toBe('p');
  });
});
