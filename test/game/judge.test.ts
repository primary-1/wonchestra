import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config';
import type { ChartNote, Difficulty } from '../../src/chart/types';
import { createJudge, type JudgeInput } from '../../src/game/judge';

const ALL: Difficulty[] = ['easy', 'normal', 'hard'];
const FPS = 60;

const idle = ({ time }: { time: number }): JudgeInput => ({
  time,
  beats: [],
  rightPalm: null,
  leftPose: null,
  leftPointer: null,
  dynamic: null,
});

/** from~to 초 동안 매 프레임 입력을 넣음. input으로 프레임별 입력을 덮어씀 */
const play = ({
  judge,
  from = 0,
  to,
  input = () => ({}),
}: {
  judge: ReturnType<typeof createJudge>;
  from?: number;
  to: number;
  input?: (time: number) => Partial<JudgeInput>;
}) => {
  const events = [];
  for (let i = Math.round(from * FPS); i <= Math.round(to * FPS); i++) {
    const time = i / FPS;
    events.push(...judge.update({ ...idle({ time }), ...input(time) }));
  }
  return events;
};

const makeJudge = ({ notes }: { notes: ChartNote[] }) => createJudge({ notes, config: CONFIG, aspect: 16 / 9 });

describe('judge', () => {
  describe('beat', () => {
    const notes: ChartNote[] = [
      { id: 0, type: 'beat', time: 1, beatInBar: 1, difficulties: ALL },
      { id: 1, type: 'beat', time: 2, beatInBar: 2, difficulties: ALL },
      { id: 2, type: 'beat', time: 3, beatInBar: 3, difficulties: ALL },
    ];

    it('가장 가까운 박 노트를 오차에 따라 판정하고, 박을 안 치면 miss', () => {
      const judge = makeJudge({ notes });
      const beatAt: Record<number, number> = { 60: 1.03, 120: 2.12 };
      const events = play({ judge, to: 4, input: (time) => ({ beats: beatAt[Math.round(time * FPS)] ? [beatAt[Math.round(time * FPS)]] : [] }) });

      expect(events.map((e) => [e.noteId, e.judgment])).toEqual([
        [0, 'perfect'],
        [1, 'good'],
        [2, 'miss'],
      ]);
      expect(events[0].offset).toBeCloseTo(0.03);
    });

    it('노트와 먼 박은 무시하고, 한 박으로 두 노트를 판정하지 않는다', () => {
      const judge = makeJudge({ notes });
      const events = play({ judge, to: 1.5, input: (time) => ({ beats: time === 0.5 ? [0.5] : time === 1 ? [1, 1.01] : [] }) });

      expect(events.map((e) => [e.noteId, e.judgment])).toEqual([[0, 'perfect']]);
    });

    it('콤보는 맞히면 오르고 miss면 끊긴다', () => {
      const judge = makeJudge({ notes });
      play({ judge, to: 4, input: (time) => ({ beats: time === 1 || time === 2 ? [time] : [] }) });

      expect(judge.summary()).toMatchObject({ combo: 0, maxCombo: 2, score: 600, maxScore: 900 });
    });
  });

  describe('target', () => {
    const notes: ChartNote[] = [{ id: 0, type: 'target', time: 1, x: 0.7, y: 0.6, beatInBar: 1, difficulties: ALL }];

    it('노트 시각에 오른손이 원 안에 있으면 perfect', () => {
      const judge = makeJudge({ notes });
      const events = play({ judge, to: 2, input: (time) => ({ rightPalm: time > 0.95 ? { x: 0.71, y: 0.61 } : { x: 0.2, y: 0.2 } }) });

      expect(events).toEqual([expect.objectContaining({ noteId: 0, judgment: 'perfect' })]);
    });

    it('조금 이르게만 들어왔다 나가면 good', () => {
      const judge = makeJudge({ notes });
      const events = play({ judge, to: 2, input: (time) => ({ rightPalm: time > 0.88 && time < 0.91 ? { x: 0.7, y: 0.6 } : { x: 0.2, y: 0.2 } }) });

      expect(events).toEqual([expect.objectContaining({ noteId: 0, judgment: 'good' })]);
    });

    it('원 밖이면 miss', () => {
      const judge = makeJudge({ notes });
      const events = play({ judge, to: 2, input: () => ({ rightPalm: { x: 0.3, y: 0.6 } }) });

      expect(events).toEqual([expect.objectContaining({ noteId: 0, judgment: 'miss' })]);
    });
  });

  describe('cue · cutoff', () => {
    const notes: ChartNote[] = [
      { id: 0, type: 'cue', time: 1, zone: 'right', tracks: [2], label: 'Horn', difficulties: ALL },
      { id: 1, type: 'cutoff', time: 3, difficulties: ALL },
    ];

    it('해당 구역을 가리키면 cue 성공, 주먹을 쥐면 cutoff 성공', () => {
      const judge = makeJudge({ notes });
      const events = play({
        judge,
        to: 4,
        input: (time) => ({
          leftPose: time > 0.9 && time < 1.2 ? 'point' : time > 2.95 ? 'fist' : 'open',
          leftPointer: { x: 0.8, y: 0.4 },
        }),
      });

      expect(events.map((e) => [e.noteId, e.judgment])).toEqual([
        [0, 'perfect'],
        [1, 'perfect'],
      ]);
    });

    it('다른 구역을 가리키거나 주먹을 안 쥐면 miss', () => {
      const judge = makeJudge({ notes });
      const events = play({ judge, to: 4, input: () => ({ leftPose: 'point', leftPointer: { x: 0.1, y: 0.4 } }) });

      expect(events.map((e) => [e.noteId, e.judgment])).toEqual([
        [0, 'miss'],
        [1, 'miss'],
      ]);
    });
  });

  describe('hold · dynamics (구간 노트)', () => {
    it('구간 동안 유지한 비율로 판정하고 점수를 준다', () => {
      const judge = makeJudge({
        notes: [
          { id: 0, type: 'hold', time: 0, endTime: 1, difficulties: ALL },
          { id: 1, type: 'dynamics', time: 1, endTime: 2, level: 'f', difficulties: ALL },
        ],
      });
      const events = play({
        judge,
        to: 2.5,
        input: (time) => ({ leftPose: time < 0.9 ? 'open' : 'other', dynamic: time < 1.6 ? 'f' : 'mf' }),
      });

      expect(events.map((e) => [e.noteId, e.judgment])).toEqual([
        [0, 'perfect'],
        [1, 'good'],
      ]);
      expect(events[0].score).toBeGreaterThanOrEqual(440);
      expect(events[1].score).toBeCloseTo(300, -1);
    });

    it('진행 중인 구간의 유지 비율을 보여준다', () => {
      const judge = makeJudge({ notes: [{ id: 0, type: 'hold', time: 0, endTime: 2, difficulties: ALL }] });
      play({ judge, to: 1, input: (time) => ({ leftPose: time < 0.5 ? 'open' : 'other' }) });

      expect(judge.spanRatio({ noteId: 0 })).toBeCloseTo(0.5, 1);
    });

    it('구간 노트는 콤보에 영향을 주지 않는다', () => {
      const judge = makeJudge({
        notes: [
          { id: 0, type: 'beat', time: 0.5, beatInBar: 1, difficulties: ALL },
          { id: 1, type: 'hold', time: 0, endTime: 1, difficulties: ALL },
        ],
      });
      play({ judge, to: 2, input: (time) => ({ beats: time === 0.5 ? [0.5] : [] }) });

      expect(judge.summary()).toMatchObject({ combo: 1 });
    });
  });
});
