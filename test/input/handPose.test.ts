import { describe, expect, it } from 'vitest';
import { classifyHandPose, createPoseStabilizer } from '../../src/input/handPose';
import type { Landmark } from '../../src/tracking/landmarks';

type FingerState = 'up' | 'curl';

/** 손목을 원점에 두고 손가락이 위(+y)로 뻗은 가짜 3D 손 */
const makeHand = ({ index, middle, ring, pinky }: Record<'index' | 'middle' | 'ring' | 'pinky', FingerState>) => {
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  lm[1] = { x: -0.03, y: 0.02, z: 0 };
  lm[2] = { x: -0.045, y: 0.04, z: 0 };
  lm[3] = { x: -0.055, y: 0.055, z: 0 };
  lm[4] = { x: -0.06, y: 0.07, z: 0 };

  const fingers: [number, number, FingerState][] = [
    [5, -0.02, index],
    [9, 0, middle],
    [13, 0.02, ring],
    [17, 0.04, pinky],
  ];
  for (const [base, x, state] of fingers) {
    lm[base] = { x, y: 0.08, z: 0 };
    if (state === 'up') {
      lm[base + 1] = { x, y: 0.11, z: 0 };
      lm[base + 2] = { x, y: 0.13, z: 0 };
      lm[base + 3] = { x, y: 0.15, z: 0 };
    } else {
      lm[base + 1] = { x, y: 0.1, z: -0.02 };
      lm[base + 2] = { x, y: 0.085, z: -0.035 };
      lm[base + 3] = { x, y: 0.07, z: -0.03 };
    }
  }
  return lm;
};

describe('classifyHandPose', () => {
  it.each([
    { name: '손바닥 펴기', fingers: { index: 'up', middle: 'up', ring: 'up', pinky: 'up' }, pose: 'open' },
    { name: '주먹', fingers: { index: 'curl', middle: 'curl', ring: 'curl', pinky: 'curl' }, pose: 'fist' },
    { name: '검지 가리키기', fingers: { index: 'up', middle: 'curl', ring: 'curl', pinky: 'curl' }, pose: 'point' },
    { name: '브이', fingers: { index: 'up', middle: 'up', ring: 'curl', pinky: 'curl' }, pose: 'other' },
  ] as const)('$name → $pose', ({ fingers, pose }) => {
    expect(classifyHandPose({ world: makeHand(fingers) })).toBe(pose);
  });
});

describe('createPoseStabilizer', () => {
  it('같은 포즈가 정해진 프레임만큼 이어져야 바뀐다', () => {
    const stabilizer = createPoseStabilizer({ stableFrames: 3 });

    expect(stabilizer.update({ pose: 'fist' })).toBe('other');
    expect(stabilizer.update({ pose: 'fist' })).toBe('other');
    expect(stabilizer.update({ pose: 'fist' })).toBe('fist');
    expect(stabilizer.update({ pose: 'open' })).toBe('fist');
    expect(stabilizer.update({ pose: 'fist' })).toBe('fist');
  });
});
