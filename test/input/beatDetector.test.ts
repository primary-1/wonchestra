import { beforeEach, describe, expect, it } from 'vitest';
import { createBeatDetector, type BeatDetector } from '../../src/input/beatDetector';

const FPS = 30;
const PERIOD = 0.6;

/** 박마다 바닥을 찍고 튀어오르는 지휘 궤적. y는 아래로 갈수록 커짐 */
const conductingY = ({ time, amplitude = 0.2 }: { time: number; amplitude?: number }) =>
  0.6 - amplitude * Math.abs(Math.sin((Math.PI * time) / PERIOD));

const run = ({ detector, duration, y }: { detector: BeatDetector; duration: number; y: (time: number) => number }) => {
  const beats: number[] = [];
  for (let i = 0; i <= duration * FPS; i++) {
    const time = i / FPS;
    const beat = detector.update({ time, y: y(time) });
    if (beat !== null) beats.push(beat);
  }
  return beats;
};

describe('beatDetector', () => {
  let detector: BeatDetector;

  beforeEach(() => {
    detector = createBeatDetector({ minDownSpeed: 0.45, minDownDistance: 0.035, refractory: 0.2 });
  });

  it('궤적의 바닥점마다 박을 찍는다 (한 프레임 오차 이내)', () => {
    const beats = run({ detector, duration: 3.1, y: (time) => conductingY({ time }) });

    expect(beats).toHaveLength(5);
    beats.forEach((beat, i) => expect(Math.abs(beat - PERIOD * (i + 1))).toBeLessThan(1 / FPS));
  });

  it.each([
    { name: '작은 떨림', y: (time: number) => 0.5 + 0.004 * Math.sin(time * 40) },
    { name: '느린 흔들림', y: (time: number) => 0.5 + 0.03 * Math.sin(time * 2) },
  ])('$name 은 박으로 치지 않는다', ({ y }) => {
    expect(run({ detector, duration: 3, y })).toEqual([]);
  });

  it('reset 후에는 이전 움직임을 잊는다', () => {
    run({ detector, duration: 0.5, y: (time) => conductingY({ time }) });
    detector.reset();

    expect(detector.update({ time: 1, y: 0.4 })).toBeNull();
  });
});
