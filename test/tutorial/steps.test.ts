import { describe, expect, it } from 'vitest';
import type { StepDef, TutorialInput } from '../../src/tutorial/steps';
import { STEP_BY_ID, TUTORIAL_STEPS, createTutorial } from '../../src/tutorial/steps';

const FPS = 30;

const input = ({ time, ...rest }: Partial<TutorialInput> & { time: number }): TutorialInput => ({
  time,
  aspect: 16 / 9,
  right: null,
  left: null,
  beats: [],
  dynamic: null,
  ...rest,
});

/** 한 단계를 from~to초 동안 프레임마다 돌리고 마지막 결과와 모인 효과를 돌려줌 */
const runStep = ({
  step,
  from = 0,
  to,
  frame = () => ({}),
}: {
  step: StepDef;
  from?: number;
  to: number;
  frame?: (time: number) => Partial<TutorialInput>;
}) => {
  const runner = step.create();
  const effects = [];
  let last = runner.update(input({ time: from, ...frame(from) }));
  effects.push(...last.effects);
  for (let i = Math.round(from * FPS) + 1; i <= Math.round(to * FPS) && !last.done; i++) {
    const time = i / FPS;
    last = runner.update(input({ time, ...frame(time) }));
    effects.push(...last.effects);
  }
  return { last, effects };
};

const bothHands = { right: { palm: { x: 0.7, y: 0.5 } }, left: { pose: 'other' as const, pointer: { x: 0.3, y: 0.5 } } };

describe('튜토리얼 단계', () => {
  it('단계 순서는 손 → 박 → 박자 → 셈여림 → 타겟 → 큐 → 홀드 → 컷오프', () => {
    expect(TUTORIAL_STEPS.map((s) => s.id)).toEqual(['hands', 'beats', 'tempo', 'dynamics', 'targets', 'cue', 'hold', 'cutoff']);
  });

  describe('hands', () => {
    it('두 손이 1초 보이면 통과', () => {
      expect(runStep({ step: STEP_BY_ID.hands, to: 1.2, frame: () => bothHands }).last.done).toBe(true);
    });

    it('한 손만 보이면 통과하지 않는다', () => {
      expect(runStep({ step: STEP_BY_ID.hands, to: 2, frame: () => ({ right: bothHands.right }) }).last.done).toBe(false);
    });

    it('오른손이 화면 왼쪽에 있으면 좌우 뒤집기를 한 번만 요청한다', () => {
      const swapped = { right: { palm: { x: 0.3, y: 0.5 } }, left: { pose: 'other' as const, pointer: { x: 0.7, y: 0.5 } } };
      const { last, effects } = runStep({ step: STEP_BY_ID.hands, to: 2, frame: () => swapped });

      expect(effects).toEqual([{ type: 'swapHands' }]);
      expect(last.done).toBe(false);
    });
  });

  describe('beats', () => {
    it('박 4번이면 통과하고 진행률이 오른다', () => {
      const { last } = runStep({
        step: STEP_BY_ID.beats,
        to: 3,
        frame: (time) => ({ ...bothHands, beats: [0.5, 1, 1.5, 2].includes(time) ? [time] : [] }),
      });

      expect(last).toMatchObject({ done: true, progress: 1 });
    });
  });

  describe('tempo', () => {
    it('메트로놈 박에 일정하게 늦으면 그만큼 지연 보정을 제안한다', () => {
      const runner = STEP_BY_ID.tempo.create();
      const first = runner.update(input({ time: 0, ...bothHands }));
      const { start, period } = first.metronome!;
      let last = first;
      const effects = [];
      for (let k = 0; k < 8; k++) {
        const beat = start + k * period + 0.1;
        last = runner.update(input({ time: beat + 0.01, ...bothHands, beats: [beat] }));
        effects.push(...last.effects);
      }

      expect(last.done).toBe(true);
      expect(effects).toEqual([{ type: 'latency', value: expect.closeTo(0.1, 3) }]);
    });

    it('메트로놈 시작 전이나 박에서 먼 입력은 세지 않는다', () => {
      const runner = STEP_BY_ID.tempo.create();
      const { start, period } = runner.update(input({ time: 0 })).metronome!;
      runner.update(input({ time: start - 0.5, beats: [start - 0.5] }));
      const last = runner.update(input({ time: start + period * 0.5, beats: [start + period * 0.5] }));

      expect(last.progress).toBe(0);
    });
  });

  describe('dynamics', () => {
    it('f를 2초, 그다음 p를 2초 유지하면 통과', () => {
      const { last } = runStep({
        step: STEP_BY_ID.dynamics,
        to: 5,
        frame: (time) => ({ ...bothHands, dynamic: time < 2.1 ? 'f' : 'p' }),
      });

      expect(last.done).toBe(true);
    });

    it('p부터 해도 f를 먼저 채워야 한다', () => {
      const { last } = runStep({ step: STEP_BY_ID.dynamics, to: 3, frame: () => ({ ...bothHands, dynamic: 'p' }) });

      expect(last).toMatchObject({ done: false, dynamicGoal: 'f', progress: 0 });
    });
  });

  describe('targets', () => {
    it('보이는 타겟을 차례로 터치하면 통과', () => {
      const runner = STEP_BY_ID.targets.create();
      let view = runner.update(input({ time: 0 }));
      for (let i = 0; i < 3; i++) {
        expect(view.done).toBe(false);
        view = runner.update(input({ time: i + 1, right: { palm: view.target! } }));
      }

      expect(view.done).toBe(true);
    });
  });

  describe('cue', () => {
    it('빛나는 구역을 0.3초 가리키면 다음 구역으로, 3번이면 통과', () => {
      const runner = STEP_BY_ID.cue.create();
      let view = runner.update(input({ time: 0 }));
      const zoneX = { left: 0.15, center: 0.5, right: 0.85 };
      let time = 0;
      const zones = [];
      while (!view.done && time < 10) {
        zones.push(view.zone);
        const x = zoneX[view.zone!];
        for (let i = 0; i < 12; i++) {
          time += 1 / FPS;
          view = runner.update(input({ time, left: { pose: 'point', pointer: { x, y: 0.5 } } }));
        }
      }

      expect(view.done).toBe(true);
      expect(new Set(zones).size).toBe(3);
    });
  });

  describe('hold', () => {
    it('손바닥을 2초 연속 펴야 통과하고, 끊기면 처음부터', () => {
      const broken = runStep({
        step: STEP_BY_ID.hold,
        to: 3,
        frame: (time) => ({ left: { pose: time > 1.5 && time < 1.7 ? 'other' : 'open', pointer: { x: 0.3, y: 0.5 } } }),
      });
      expect(broken.last.done).toBe(false);

      const kept = runStep({ step: STEP_BY_ID.hold, to: 2.5, frame: () => ({ left: { pose: 'open', pointer: { x: 0.3, y: 0.5 } } }) });
      expect(kept.last.done).toBe(true);
    });
  });

  describe('cutoff', () => {
    it('주먹을 쥐면 통과', () => {
      const { last } = runStep({
        step: STEP_BY_ID.cutoff,
        to: 1,
        frame: (time) => ({ left: { pose: time > 0.5 ? 'fist' : 'open', pointer: { x: 0.3, y: 0.5 } } }),
      });

      expect(last.done).toBe(true);
    });
  });
});

describe('createTutorial', () => {
  const cutoffOnly = [STEP_BY_ID.cutoff, STEP_BY_ID.cutoff];
  const fist = { left: { pose: 'fist' as const, pointer: { x: 0.3, y: 0.5 } } };

  it('통과하면 잠깐 축하한 뒤 다음 단계로, 마지막 단계 뒤엔 끝', () => {
    const tutorial = createTutorial({ steps: cutoffOnly });

    expect(tutorial.update(input({ time: 0, ...fist }))).toMatchObject({ index: 0, celebrating: true, finished: false });
    expect(tutorial.update(input({ time: 0.5, ...fist }))).toMatchObject({ index: 0, celebrating: true });
    expect(tutorial.update(input({ time: 1, ...fist }))).toMatchObject({ index: 1, celebrating: true });
    expect(tutorial.update(input({ time: 2, ...fist }))).toMatchObject({ finished: true });
  });

  it('건너뛰면 바로 다음 단계', () => {
    const tutorial = createTutorial({ steps: cutoffOnly });
    tutorial.skip();

    expect(tutorial.update(input({ time: 0 }))).toMatchObject({ index: 1, celebrating: false });
  });
});
