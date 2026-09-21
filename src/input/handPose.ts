import type { Landmark } from '../tracking/landmarks';

export type HandPose = 'open' | 'fist' | 'point' | 'other';

type FingerState = 'extended' | 'curled' | 'half';

/** [PIP, TIP] 번호: 검지, 중지, 약지, 새끼 */
const FINGERS: [number, number][] = [
  [6, 8],
  [10, 12],
  [14, 16],
  [18, 20],
];

const distance = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/**
 * 손목에서 손끝까지 거리를 손목에서 둘째 마디까지 거리와 비교.
 * 뻗으면 손끝이 훨씬 멀고, 접으면 손끝이 오히려 가까워짐. 손 크기·회전과 무관하게 동작.
 */
const fingerState = ({ world, pip, tip }: { world: Landmark[]; pip: number; tip: number }): FingerState => {
  const ratio = distance(world[0], world[tip]) / distance(world[0], world[pip]);
  if (ratio > 1.12) return 'extended';
  if (ratio < 1.0) return 'curled';
  return 'half';
};

/** world: MediaPipe worldLandmarks (손 중심 기준 미터 단위 3D 좌표) */
export const classifyHandPose = ({ world }: { world: Landmark[] }): HandPose => {
  const [index, ...rest] = FINGERS.map(([pip, tip]) => fingerState({ world, pip, tip }));
  const states = [index, ...rest];
  const extended = states.filter((s) => s === 'extended').length;
  const curled = states.filter((s) => s === 'curled').length;

  if (extended === 4) return 'open';
  if (extended === 0 && curled >= 3) return 'fist';
  if (index === 'extended' && !rest.includes('extended') && rest.filter((s) => s === 'curled').length >= 2) {
    return 'point';
  }
  return 'other';
};

/** 한두 프레임 튀는 인식 결과를 걸러냄 */
export const createPoseStabilizer = ({ stableFrames }: { stableFrames: number }) => {
  let stable: HandPose = 'other';
  let candidate: HandPose = 'other';
  let count = 0;

  return {
    update: ({ pose }: { pose: HandPose }): HandPose => {
      if (pose === candidate) count++;
      else {
        candidate = pose;
        count = 1;
      }
      if (count >= stableFrames) stable = candidate;
      return stable;
    },
    reset: () => {
      stable = 'other';
      candidate = 'other';
      count = 0;
    },
  };
};
