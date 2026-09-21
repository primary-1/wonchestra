/** 게임 튜닝 값 모음. 플레이해보면서 조절하는 값들 */
export const CONFIG = {
  tracking: {
    /** One Euro 필터: 낮을수록 떨림이 줄지만 반응이 느려짐 */
    minCutoff: 1.2,
    /** 높을수록 빠른 움직임에서 지연이 줄어듦 */
    beta: 8,
  },
  beat: {
    /** 박으로 인정할 최소 하강 속도 (화면 높이/초) */
    minDownSpeed: 0.45,
    /** 박으로 인정할 최소 하강 거리 (화면 높이) */
    minDownDistance: 0.035,
    /** 박 사이 최소 간격 (초) */
    refractory: 0.2,
  },
  dynamics: {
    /** 동작 크기를 재는 시간 창 (초) */
    window: 1.0,
    /** 이보다 작으면 p, 다음 값보다 작으면 mf, 그 이상 f (화면 높이 기준 궤적 크기) */
    mfFrom: 0.1,
    fFrom: 0.22,
    /** 연속 세기 0~1로 바꿀 때 범위 */
    minAmplitude: 0.03,
    maxAmplitude: 0.32,
  },
  pose: {
    /** 같은 포즈가 이만큼 연속 프레임이어야 확정 */
    stableFrames: 3,
  },
  judge: {
    perfect: 0.07,
    good: 0.15,
    cueWindow: 0.4,
    cuePerfect: 0.2,
    cutoffWindow: 0.25,
    cutoffPerfect: 0.12,
    /** 타겟 반지름 (화면 높이 기준) */
    targetRadius: 0.09,
    /** 구간형 노트(hold, dynamics)에서 perfect/good이 되는 유지 비율 */
    spanPerfect: 0.8,
    spanGood: 0.5,
  },
  score: {
    beat: { perfect: 300, good: 100 },
    target: { perfect: 300, good: 100 },
    cue: { perfect: 500, good: 300 },
    cutoff: { perfect: 500, good: 300 },
    span: 500,
  },
  audio: {
    /** 큐를 놓친 파트 볼륨 */
    missedCueLevel: 0.3,
    /** 셈여림 0일 때 전체 볼륨 (1일 때 1) */
    minMasterLevel: 0.3,
    lookahead: 0.15,
  },
  game: {
    /** 카메라 + 인식 지연 기본값 (초). 출력 지연은 오디오 시계가 따로 보정 */
    defaultLatency: 0.08,
    /** 곡 시작 전 카운트인 마디 수 */
    countInBars: 2,
  },
} as const;
