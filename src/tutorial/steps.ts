import { CONFIG } from '../config';
import type { DynamicLevel, Zone } from '../chart/types';
import { zoneOf } from '../game/judge';
import type { HandPose } from '../input/handPose';
import type { Point } from '../tracking/oneEuroFilter';

/** 튜토리얼 한 프레임 입력. time은 오디오 시계(들리는 소리 기준) 초 */
export type TutorialInput = {
  time: number;
  aspect: number;
  right: { palm: Point } | null;
  left: { pose: HandPose; pointer: Point } | null;
  beats: number[];
  dynamic: DynamicLevel | null;
};

export type TutorialEffect = { type: 'swapHands' } | { type: 'latency'; value: number };

export type StepUpdate = {
  done: boolean;
  /** 0~1 */
  progress: number;
  effects: TutorialEffect[];
  /** 단계 카드 아래에 보여줄 한 줄 */
  hint?: string;
  target?: Point;
  zone?: Zone;
  dynamicGoal?: DynamicLevel;
  /** 이 시각부터 period 간격으로 메트로놈을 울려 달라는 요청 */
  metronome?: { start: number; period: number };
};

export type StepRunner = { update: (input: TutorialInput) => StepUpdate };

export type StepId = 'hands' | 'beats' | 'tempo' | 'dynamics' | 'targets' | 'cue' | 'hold' | 'cutoff';

export type StepDef = {
  id: StepId;
  title: string;
  instruction: string;
  hand: 'right' | 'left' | 'both';
  create: () => StepRunner;
};

/** 프레임 사이 시간. 첫 프레임이거나 끊겼다 돌아오면 0 */
const createDeltaClock = () => {
  let last: number | null = null;
  return ({ time }: { time: number }) => {
    const dt = last === null ? 0 : Math.min(0.1, Math.max(0, time - last));
    last = time;
    return dt;
  };
};

const update = (partial: Partial<StepUpdate> & { progress: number }): StepUpdate => ({
  done: partial.progress >= 1,
  effects: [],
  ...partial,
});

const handsStep: StepDef = {
  id: 'hands',
  title: '두 손을 보여주세요',
  instruction: '카메라에 두 손바닥이 다 보이게 들어요. 오른손은 하늘색, 왼손은 분홍색으로 보여요.',
  hand: 'both',
  create: () => {
    const deltaOf = createDeltaClock();
    const NEED = 1;
    const SWAP_AFTER = 0.5;
    let visible = 0;
    let swappedFor = 0;
    let swapRequested = false;

    return {
      update: (input) => {
        const dt = deltaOf(input);
        if (!input.right || !input.left) {
          return update({ progress: visible / NEED, hint: input.right ? '왼손도 보여주세요' : input.left ? '오른손도 보여주세요' : undefined });
        }
        // 거울 화면에서 오른손은 오른쪽에 있어야 함. 반대로 잡히면 좌우 설정을 뒤집음
        const swapped = input.right.palm.x < input.left.pointer.x - 0.1;
        if (swapped) {
          swappedFor += dt;
          visible = 0;
          if (swappedFor >= SWAP_AFTER && !swapRequested) {
            swapRequested = true;
            return update({ progress: 0, effects: [{ type: 'swapHands' }], hint: '좌우가 반대로 잡혀서 바로잡았어요' });
          }
          return update({ progress: 0 });
        }
        swappedFor = 0;
        visible += dt;
        return update({ progress: Math.min(1, visible / NEED) });
      },
    };
  },
};

const beatsStep: StepDef = {
  id: 'beats',
  title: '박을 찍어요',
  instruction: '오른손을 위로 들었다가 아래로 "툭" 떨어뜨리고 튕겨 올려요. 바닥에서 튕기는 순간이 한 박이에요.',
  hand: 'right',
  create: () => {
    const NEED = 4;
    let count = 0;
    return {
      update: (input) => {
        count += input.beats.length;
        return update({ progress: Math.min(1, count / NEED), hint: `${Math.min(count, NEED)} / ${NEED}` });
      },
    };
  },
};

const tempoStep: StepDef = {
  id: 'tempo',
  title: '메트로놈에 맞춰 찍어요',
  instruction: '"딱" 소리에 맞춰 박을 찍어요. 여기서 잰 오차로 화면 지연을 자동으로 맞춰요.',
  hand: 'right',
  create: () => {
    const NEED = 8;
    const BPM = 90;
    const LEAD = 1;
    const MAX_OFFSET = 0.3;
    const period = 60 / BPM;
    let start: number | null = null;
    const offsets: number[] = [];
    let finished = false;

    return {
      update: (input) => {
        start ??= input.time + LEAD;
        const metronome = { start, period };
        if (finished) return update({ progress: 1, metronome });

        for (const beat of input.beats) {
          const k = Math.round((beat - start) / period);
          const offset = beat - (start + k * period);
          if (k < 0 || Math.abs(offset) > MAX_OFFSET) continue;
          offsets.push(offset);
        }

        const progress = Math.min(1, offsets.length / NEED);
        const mean = offsets.length > 0 ? offsets.reduce((a, b) => a + b, 0) / offsets.length : null;
        const hint = mean === null ? undefined : `평균 ${mean >= 0 ? '+' : ''}${Math.round(mean * 1000)}ms`;
        if (progress < 1) return update({ progress, metronome, hint });

        finished = true;
        // 중앙값: 한두 번 크게 빗나간 박에 흔들리지 않게
        const sorted = [...offsets].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        const value = Math.round(Math.min(0.3, Math.max(0, median)) * 1000) / 1000;
        return update({ progress, metronome, hint: `지연 보정 ${Math.round(value * 1000)}ms로 맞췄어요`, effects: [{ type: 'latency', value }] });
      },
    };
  },
};

const dynamicsStep: StepDef = {
  id: 'dynamics',
  title: '크게, 그리고 작게',
  instruction: '크게 저으면 f(세게), 작게 저으면 p(여리게)예요. 오른쪽 막대가 목표 칸에 들어가게 해요.',
  hand: 'right',
  create: () => {
    const deltaOf = createDeltaClock();
    const NEED = 2;
    const held: Record<'f' | 'p', number> = { f: 0, p: 0 };
    return {
      update: (input) => {
        const dt = deltaOf(input);
        const goal: 'f' | 'p' = held.f < NEED ? 'f' : 'p';
        if (input.dynamic === goal) held[goal] = Math.min(NEED, held[goal] + dt);
        const progress = (held.f + held.p) / (NEED * 2);
        const nextGoal: 'f' | 'p' = held.f < NEED ? 'f' : 'p';
        return update({ progress, dynamicGoal: nextGoal, hint: nextGoal === 'f' ? '크~게 저어요' : '이번엔 작~게 저어요' });
      },
    };
  },
};

const TARGET_POINTS: Point[] = [
  { x: 0.68, y: 0.72 },
  { x: 0.52, y: 0.5 },
  { x: 0.84, y: 0.4 },
];

const targetsStep: StepDef = {
  id: 'targets',
  title: '원을 터치해요',
  instruction: '게임에선 링이 원에 닿는 순간 오른손을 원 안에 두면 돼요. 지금은 타이밍 없이 원에 손바닥만 가져가 봐요.',
  hand: 'right',
  create: () => {
    let index = 0;
    return {
      update: (input) => {
        const target = TARGET_POINTS[index];
        if (input.right) {
          const dist = Math.hypot((input.right.palm.x - target.x) * input.aspect, input.right.palm.y - target.y);
          if (dist <= CONFIG.judge.targetRadius) index++;
        }
        const progress = index / TARGET_POINTS.length;
        return update({ progress, target: TARGET_POINTS[Math.min(index, TARGET_POINTS.length - 1)], hint: `${index} / ${TARGET_POINTS.length}` });
      },
    };
  },
};

const CUE_ZONES: Zone[] = ['right', 'left', 'center'];

const cueStep: StepDef = {
  id: 'cue',
  title: '파트에 큐를 줘요',
  instruction: '빛나는 구역을 왼손 검지로 가리켜요. 현악은 왼쪽, 목관·타악은 가운데, 금관은 오른쪽이에요.',
  hand: 'left',
  create: () => {
    const deltaOf = createDeltaClock();
    const NEED = 0.3;
    let index = 0;
    let pointing = 0;
    return {
      update: (input) => {
        const dt = deltaOf(input);
        const zone = CUE_ZONES[index];
        const onZone = input.left?.pose === 'point' && zoneOf({ x: input.left.pointer.x }) === zone;
        pointing = onZone ? pointing + dt : 0;
        if (pointing >= NEED) {
          index++;
          pointing = 0;
        }
        const hint = input.left && input.left.pose !== 'point' ? '검지만 펴서 가리켜요' : undefined;
        return update({
          progress: index / CUE_ZONES.length,
          zone: CUE_ZONES[Math.min(index, CUE_ZONES.length - 1)],
          hint,
        });
      },
    };
  },
};

const holdStep: StepDef = {
  id: 'hold',
  title: '손바닥으로 유지해요',
  instruction: '길게 끄는 음에선 왼손 손바닥을 쫙 펴서 들고 있어요. 2초 동안 유지!',
  hand: 'left',
  create: () => {
    const deltaOf = createDeltaClock();
    const NEED = 2;
    let held = 0;
    return {
      update: (input) => {
        const dt = deltaOf(input);
        held = input.left?.pose === 'open' ? held + dt : 0;
        return update({ progress: Math.min(1, held / NEED) });
      },
    };
  },
};

const cutoffStep: StepDef = {
  id: 'cutoff',
  title: '주먹으로 끝내요',
  instruction: '곡이 끝날 때 왼손을 꽉 쥐면 오케스트라가 딱 멈춰요.',
  hand: 'left',
  create: () => ({
    update: (input) => update({ progress: input.left?.pose === 'fist' ? 1 : 0 }),
  }),
};

export const TUTORIAL_STEPS: StepDef[] = [handsStep, beatsStep, tempoStep, dynamicsStep, targetsStep, cueStep, holdStep, cutoffStep];

export const STEP_BY_ID = Object.fromEntries(TUTORIAL_STEPS.map((s) => [s.id, s])) as Record<StepId, StepDef>;

export type TutorialFrame = {
  finished: boolean;
  index: number;
  total: number;
  step: StepDef | null;
  view: StepUpdate | null;
  /** 통과 직후 잠깐 보여주는 "잘했어요" 상태 */
  celebrating: boolean;
  effects: TutorialEffect[];
};

/** 단계들을 순서대로 진행. 통과하면 celebrate초 뒤 다음 단계 */
export const createTutorial = ({ steps, celebrate = 0.8 }: { steps: StepDef[]; celebrate?: number }) => {
  let index = 0;
  let runner: StepRunner | null = steps[0]?.create() ?? null;
  let doneAt: number | null = null;
  let lastView: StepUpdate | null = null;

  const advance = () => {
    index++;
    runner = index < steps.length ? steps[index].create() : null;
    doneAt = null;
    lastView = null;
  };

  const frame = (partial: Partial<TutorialFrame>): TutorialFrame => ({
    finished: runner === null,
    index,
    total: steps.length,
    step: steps[index] ?? null,
    view: lastView,
    celebrating: false,
    effects: [],
    ...partial,
  });

  return {
    update: (input: TutorialInput): TutorialFrame => {
      if (doneAt !== null && input.time - doneAt >= celebrate) advance();
      if (!runner) return frame({ finished: true });
      if (doneAt !== null) return frame({ celebrating: true });

      const view = runner.update(input);
      lastView = view;
      if (view.done) doneAt = input.time;
      return frame({ view, celebrating: view.done, effects: view.effects });
    },
    skip: () => {
      if (runner) advance();
    },
  };
};

export type Tutorial = ReturnType<typeof createTutorial>;
