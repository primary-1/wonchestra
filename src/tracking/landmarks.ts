import type { Point } from './oneEuroFilter';

export type Landmark = { x: number; y: number; z: number };

/** MediaPipe 손 랜드마크 번호 */
export const LM = {
  wrist: 0,
  indexMcp: 5,
  indexTip: 8,
  middleMcp: 9,
  ringMcp: 13,
  pinkyMcp: 17,
} as const;

/** 손바닥 중심: 손목 + 네 손가락 뿌리의 평균. 손가락보다 덜 흔들려서 박자 추적에 씀 */
export const palmCenter = ({ landmarks }: { landmarks: Landmark[] }): Point => {
  const ids: number[] = [LM.wrist, LM.indexMcp, LM.middleMcp, LM.ringMcp, LM.pinkyMcp];
  return {
    x: ids.reduce((sum, i) => sum + landmarks[i].x, 0) / ids.length,
    y: ids.reduce((sum, i) => sum + landmarks[i].y, 0) / ids.length,
  };
};
