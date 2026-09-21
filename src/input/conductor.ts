import { CONFIG } from '../config';
import { LM, palmCenter, type Landmark } from '../tracking/landmarks';
import { createPointFilter, type Point } from '../tracking/oneEuroFilter';
import type { TrackedHand } from '../tracking/handTracker';
import { createBeatDetector } from './beatDetector';
import { createDynamicsMeter, type DynamicsReading } from './dynamicsMeter';
import { classifyHandPose, createPoseStabilizer, type HandPose } from './handPose';

export type ConductorFrame = {
  time: number;
  right: { palm: Point; landmarks: Landmark[] } | null;
  left: { pose: HandPose; pointer: Point; landmarks: Landmark[] } | null;
  beats: number[];
  dynamics: DynamicsReading | null;
};

/** 손을 이만큼 못 찾으면 필터·박자 상태를 초기화 (초) */
const LOST_RESET = 0.3;

/** 손 트래킹 결과를 지휘 입력(박, 셈여림, 왼손 포즈)으로 바꿈 */
export const createConductor = () => {
  const { tracking, beat, dynamics, pose } = CONFIG;
  const rightFilter = createPointFilter(tracking);
  const leftFilter = createPointFilter(tracking);
  const beatDetector = createBeatDetector(beat);
  const dynamicsMeter = createDynamicsMeter(dynamics);
  const poseStabilizer = createPoseStabilizer(pose);
  let rightSeenAt = -Infinity;
  let leftSeenAt = -Infinity;
  let lastDynamics: DynamicsReading | null = null;

  const update = ({ time, hands }: { time: number; hands: TrackedHand[] }): ConductorFrame => {
    const rightHand = hands.find((h) => h.side === 'right');
    const leftHand = hands.find((h) => h.side === 'left');
    const frame: ConductorFrame = { time, right: null, left: null, beats: [], dynamics: lastDynamics };

    if (rightHand) {
      if (time - rightSeenAt > LOST_RESET) {
        rightFilter.reset();
        beatDetector.reset();
        dynamicsMeter.clear();
      }
      rightSeenAt = time;
      const palm = rightFilter.filter({ point: palmCenter({ landmarks: rightHand.landmarks }), time });
      const beatTime = beatDetector.update({ time, y: palm.y });
      if (beatTime !== null) frame.beats.push(beatTime);
      lastDynamics = dynamicsMeter.update({ time, point: palm });
      frame.dynamics = lastDynamics;
      frame.right = { palm, landmarks: rightHand.landmarks };
    }

    if (leftHand) {
      if (time - leftSeenAt > LOST_RESET) {
        leftFilter.reset();
        poseStabilizer.reset();
      }
      leftSeenAt = time;
      const rawPose = leftHand.world.length === 21 ? classifyHandPose({ world: leftHand.world }) : 'other';
      frame.left = {
        pose: poseStabilizer.update({ pose: rawPose }),
        pointer: leftFilter.filter({ point: leftHand.landmarks[LM.indexTip], time }),
        landmarks: leftHand.landmarks,
      };
    }

    return frame;
  };

  return { update };
};

export type Conductor = ReturnType<typeof createConductor>;
