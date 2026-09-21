import type { CONFIG } from '../config';
import type { ChartNote, ChartNoteType, DynamicLevel, Zone } from '../chart/types';
import type { HandPose } from '../input/handPose';
import type { Point } from '../tracking/oneEuroFilter';

export type Judgment = 'perfect' | 'good' | 'miss';

/** 한 프레임의 입력. time은 지연 보정이 끝난 곡 시간 */
export type JudgeInput = {
  time: number;
  /** 이번 프레임에 찍힌 박 시각들 */
  beats: number[];
  rightPalm: Point | null;
  leftPose: HandPose | null;
  leftPointer: Point | null;
  dynamic: DynamicLevel | null;
};

export type JudgeEvent = {
  noteId: number;
  type: ChartNoteType;
  judgment: Judgment;
  score: number;
  /** 박자 노트: 입력 시각 - 노트 시각 (양수면 늦음) */
  offset?: number;
};

type Tally = Record<Judgment, number>;

export type JudgeSummary = {
  score: number;
  maxScore: number;
  /** 지금까지 판정된 노트들의 만점 합 (진행 중 정확도용) */
  judgedMaxScore: number;
  combo: number;
  maxCombo: number;
  counts: Record<ChartNoteType, Tally>;
};

type Config = typeof CONFIG;

const SPAN_TYPES: ChartNoteType[] = ['hold', 'dynamics'];

export const zoneOf = ({ x }: { x: number }): Zone => (x < 1 / 3 ? 'left' : x < 2 / 3 ? 'center' : 'right');

const emptyCounts = (): Record<ChartNoteType, Tally> => {
  const tally = () => ({ perfect: 0, good: 0, miss: 0 });
  return { beat: tally(), target: tally(), cue: tally(), cutoff: tally(), hold: tally(), dynamics: tally() };
};

export const createJudge = ({ notes, config, aspect }: { notes: ChartNote[]; config: Config; aspect: number }) => {
  const { judge: j, score: points } = config;
  const pending = new Set(notes.map((n) => n.id));
  const byId = new Map(notes.map((n) => [n.id, n]));
  /** 타겟: 원 안에 들어왔던 가장 작은 시간 오차 */
  const targetBest = new Map<number, number>();
  /** 구간 노트: [조건을 만족한 시간, 지난 시간] */
  const spans = new Map<number, { inside: number; total: number }>();
  const counts = emptyCounts();
  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  let lastTime: number | null = null;

  const perfectScore = ({ note }: { note: ChartNote }) =>
    note.type === 'hold' || note.type === 'dynamics' ? points.span : points[note.type].perfect;
  const maxScore = notes.reduce((sum, note) => sum + perfectScore({ note }), 0);
  let judgedMaxScore = 0;

  const finalize = ({ note, judgment, score: gained, offset }: { note: ChartNote; judgment: Judgment; score: number; offset?: number }): JudgeEvent => {
    pending.delete(note.id);
    counts[note.type][judgment]++;
    score += gained;
    judgedMaxScore += perfectScore({ note });
    if (!SPAN_TYPES.includes(note.type)) {
      combo = judgment === 'miss' ? 0 : combo + 1;
      maxCombo = Math.max(maxCombo, combo);
    }
    return { noteId: note.id, type: note.type, judgment, score: gained, ...(offset === undefined ? {} : { offset }) };
  };

  const discrete = ({ note, perfect }: { note: ChartNote & { type: 'beat' | 'target' | 'cue' | 'cutoff' }; perfect: boolean }) => {
    const judgment: Judgment = perfect ? 'perfect' : 'good';
    return { judgment, score: points[note.type][judgment] };
  };

  const pendingOf = <T extends ChartNoteType>(type: T) =>
    [...pending].map((id) => byId.get(id)!).filter((n): n is Extract<ChartNote, { type: T }> => n.type === type);

  const update = (input: JudgeInput): JudgeEvent[] => {
    const { time } = input;
    const dt = lastTime === null ? 0 : Math.min(0.1, Math.max(0, time - lastTime));
    lastTime = time;
    const events: JudgeEvent[] = [];

    // 박: 각 입력 박을 가장 가까운 대기 중 박 노트에 매칭
    for (const beatTime of input.beats) {
      const nearest = pendingOf('beat')
        .filter((n) => Math.abs(beatTime - n.time) <= j.good)
        .sort((a, b) => Math.abs(beatTime - a.time) - Math.abs(beatTime - b.time))[0];
      if (!nearest) continue;
      const offset = beatTime - nearest.time;
      events.push(finalize({ note: nearest, ...discrete({ note: nearest, perfect: Math.abs(offset) <= j.perfect }), offset }));
    }

    // 타겟: 판정 창 안에서 오른손이 원 안에 있으면 기록, perfect면 바로 확정
    if (input.rightPalm) {
      const palm = input.rightPalm;
      for (const note of pendingOf('target')) {
        const offset = time - note.time;
        if (Math.abs(offset) > j.good) continue;
        const dist = Math.hypot((palm.x - note.x) * aspect, palm.y - note.y);
        if (dist > j.targetRadius) continue;
        const best = Math.min(targetBest.get(note.id) ?? Infinity, Math.abs(offset));
        targetBest.set(note.id, best);
        if (best <= j.perfect) events.push(finalize({ note, ...discrete({ note, perfect: true }) }));
      }
    }

    // 큐: 왼손 검지로 해당 구역을 가리킴
    if (input.leftPose === 'point' && input.leftPointer) {
      const zone = zoneOf({ x: input.leftPointer.x });
      for (const note of pendingOf('cue')) {
        const offset = time - note.time;
        if (Math.abs(offset) > j.cueWindow || note.zone !== zone) continue;
        events.push(finalize({ note, ...discrete({ note, perfect: Math.abs(offset) <= j.cuePerfect }) }));
      }
    }

    // 컷오프: 왼손 주먹
    if (input.leftPose === 'fist') {
      for (const note of pendingOf('cutoff')) {
        const offset = time - note.time;
        if (Math.abs(offset) > j.cutoffWindow) continue;
        events.push(finalize({ note, ...discrete({ note, perfect: Math.abs(offset) <= j.cutoffPerfect }) }));
      }
    }

    // 구간 노트: 유지 시간 누적, 끝나면 비율로 판정
    for (const note of [...pendingOf('hold'), ...pendingOf('dynamics')]) {
      if (time < note.time) continue;
      const span = spans.get(note.id) ?? { inside: 0, total: 0 };
      spans.set(note.id, span);
      if (time < note.endTime) {
        const ok = note.type === 'hold' ? input.leftPose === 'open' : input.dynamic === note.level;
        span.total += dt;
        if (ok) span.inside += dt;
        continue;
      }
      const ratio = span.total > 0 ? span.inside / span.total : 0;
      const judgment: Judgment = ratio >= j.spanPerfect ? 'perfect' : ratio >= j.spanGood ? 'good' : 'miss';
      events.push(finalize({ note, judgment, score: Math.round(points.span * ratio) }));
    }

    // 판정 창이 지난 노트 정리
    const windows: Partial<Record<ChartNoteType, number>> = { beat: j.good, target: j.good, cue: j.cueWindow, cutoff: j.cutoffWindow };
    for (const id of [...pending]) {
      const note = byId.get(id)!;
      const window = windows[note.type];
      if (window === undefined || time <= note.time + window) continue;
      const best = note.type === 'target' ? targetBest.get(id) : undefined;
      if (note.type === 'target' && best !== undefined) {
        events.push(finalize({ note, ...discrete({ note, perfect: best <= j.perfect }) }));
      } else {
        events.push(finalize({ note, judgment: 'miss', score: 0 }));
      }
    }

    return events;
  };

  return {
    update,
    isPending: ({ noteId }: { noteId: number }) => pending.has(noteId),
    spanRatio: ({ noteId }: { noteId: number }) => {
      const span = spans.get(noteId);
      return span && span.total > 0 ? span.inside / span.total : null;
    },
    summary: (): JudgeSummary => ({ score, maxScore, judgedMaxScore, combo, maxCombo, counts }),
  };
};

export type Judge = ReturnType<typeof createJudge>;
