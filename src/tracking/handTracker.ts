import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { Landmark } from './landmarks';

export type HandSide = 'left' | 'right';

export type TrackedHand = {
  /** 플레이어 기준 실제 손 */
  side: HandSide;
  /** 거울 화면 기준 0~1 좌표 (x를 뒤집어 둠) */
  landmarks: Landmark[];
  /** 손 중심 기준 미터 단위 3D 좌표 (포즈 판별용) */
  world: Landmark[];
};

export const createHandTracker = async ({ wasmPath, modelPath }: { wasmPath: string; modelPath: string }) => {
  const fileset = await FilesetResolver.forVisionTasks(wasmPath);
  const landmarker = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: modelPath, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  let lastTimestamp = 0;

  /**
   * swapHands: 좌우가 반대로 잡힐 때 뒤집기.
   * 웹캠 원본 프레임을 넣었을 때 라벨이 플레이어의 실제 손과 일치하는 걸 실측으로 확인함
   * (tasks-vision 1.0.1). 카메라에 따라 다르면 H 키로 뒤집음.
   */
  const detect = ({ video, swapHands }: { video: HTMLVideoElement; swapHands: boolean }): TrackedHand[] => {
    // detectForVideo는 타임스탬프가 반드시 증가해야 함
    const timestamp = Math.max(performance.now(), lastTimestamp + 1);
    lastTimestamp = timestamp;
    const result = landmarker.detectForVideo(video, timestamp);

    const hands = result.landmarks.map((landmarks, i) => {
      const label = result.handedness[i]?.[0]?.categoryName;
      const isRight = (label === 'Right') !== swapHands;
      return {
        side: (isRight ? 'right' : 'left') as HandSide,
        landmarks: landmarks.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })),
        world: result.worldLandmarks[i] ?? [],
      };
    });

    // 두 손이 같은 쪽으로 잡히면 화면 위치로 나눔 (거울 화면에서 오른손이 오른쪽)
    if (hands.length === 2 && hands[0].side === hands[1].side) {
      const [a, b] = hands;
      const aIsRight = a.landmarks[0].x > b.landmarks[0].x;
      a.side = aIsRight ? 'right' : 'left';
      b.side = aIsRight ? 'left' : 'right';
    }
    return hands;
  };

  return { detect, close: () => landmarker.close() };
};

export type HandTracker = Awaited<ReturnType<typeof createHandTracker>>;
