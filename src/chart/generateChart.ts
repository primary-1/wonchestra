import { zoneForProgram } from './instruments';
import { songDuration, type Song, type SongNote } from './song';
import type {
  BeatNote,
  Chart,
  ChartNote,
  CueNote,
  CutoffNote,
  Difficulty,
  DynamicLevel,
  DynamicsNote,
  HoldNote,
  TargetNote,
  Zone,
} from './types';

const EPS = 1e-6;
const ALL: Difficulty[] = ['easy', 'normal', 'hard'];
const NORMAL_UP: Difficulty[] = ['normal', 'hard'];
const HARD: Difficulty[] = ['hard'];

/** 쉬었다 들어올 때 큐를 만드는 최소 쉼 (마디) */
const CUE_MIN_REST_BARS = 2;
/** 셈여림 구간 최소 길이 (마디) */
const DYNAMICS_MIN_BARS = 2;
/** hold로 보는 최소 길이 (박) */
const HOLD_MIN_BEATS = 3;

/** 거울 화면 기준 오른손 지휘 도형 위치. 1박 아래, 안쪽(화면 가운데 쪽), 바깥쪽, 위 */
const PATTERN_POINTS: Record<number, { x: number; y: number }[]> = {
  2: [
    { x: 0.68, y: 0.72 },
    { x: 0.68, y: 0.32 },
  ],
  3: [
    { x: 0.68, y: 0.72 },
    { x: 0.84, y: 0.58 },
    { x: 0.68, y: 0.32 },
  ],
  4: [
    { x: 0.68, y: 0.72 },
    { x: 0.52, y: 0.58 },
    { x: 0.84, y: 0.58 },
    { x: 0.68, y: 0.32 },
  ],
};

type Draft<T extends ChartNote> = Omit<T, 'id'>;

const levelForVelocity = ({ velocity }: { velocity: number }): DynamicLevel => {
  if (velocity < 60) return 'p';
  if (velocity < 88) return 'mf';
  return 'f';
};

const makeBeats = ({ duration, beat, beatsPerBar }: { duration: number; beat: number; beatsPerBar: number }) => {
  const beats: Draft<BeatNote>[] = [];
  for (let i = 0; i * beat < duration - EPS; i++) {
    const beatInBar = (i % beatsPerBar) + 1;
    beats.push({ type: 'beat', time: i * beat, beatInBar, difficulties: beatInBar === 1 ? ALL : NORMAL_UP });
  }
  return beats;
};

const makeCues = ({ song, beat, bar }: { song: Song; beat: number; bar: number }) => {
  const entries: { time: number; track: number; zone: Zone }[] = [];

  song.tracks.forEach((track, index) => {
    const zone = zoneForProgram({ program: track.program, isDrum: track.isDrum });
    const notes = [...track.notes].sort((a, b) => a.time - b.time);
    let soundingUntil: number | null = null;

    for (const note of notes) {
      const isEntry =
        soundingUntil === null ? note.time >= beat - EPS : note.time - soundingUntil >= CUE_MIN_REST_BARS * bar - EPS;
      if (isEntry) entries.push({ time: note.time, track: index, zone });
      soundingUntil = Math.max(soundingUntil ?? 0, note.time + note.duration);
    }
  });

  entries.sort((a, b) => a.time - b.time);

  // 다음 한 마디 동안 그 트랙이 얼마나 크게 연주하는지
  const loudnessAfter = ({ track, time }: { track: number; time: number }) =>
    song.tracks[track].notes
      .filter((n) => n.time >= time - EPS && n.time < time + bar - EPS)
      .reduce((sum, n) => sum + n.velocity, 0);

  const cues: Draft<CueNote>[] = [];
  let i = 0;
  while (i < entries.length) {
    const start = entries[i].time;
    const cluster = [];
    while (i < entries.length && entries[i].time - start < beat - EPS) cluster.push(entries[i++]);

    const loudnessByZone = new Map<Zone, number>();
    for (const entry of cluster) {
      const prev = loudnessByZone.get(entry.zone) ?? 0;
      loudnessByZone.set(entry.zone, prev + loudnessAfter({ track: entry.track, time: entry.time }));
    }
    const [zone] = [...loudnessByZone.entries()].sort((a, b) => b[1] - a[1])[0];
    const tracks = [...new Set(cluster.filter((e) => e.zone === zone).map((e) => e.track))].sort((a, b) => a - b);

    cues.push({
      type: 'cue',
      time: start,
      zone,
      tracks,
      label: tracks.map((t) => song.tracks[t].name).join(', '),
      difficulties: NORMAL_UP,
    });
  }
  return cues;
};

const makeDynamics = ({ notes, duration, bar }: { notes: SongNote[]; duration: number; bar: number }) => {
  const barCount = Math.ceil(duration / bar - EPS);
  const barLevels: (DynamicLevel | null)[] = Array.from({ length: barCount }, (_, b) => {
    const inBar = notes.filter((n) => n.time >= b * bar - EPS && n.time < (b + 1) * bar - EPS);
    if (inBar.length === 0) return null;
    return levelForVelocity({ velocity: inBar.reduce((sum, n) => sum + n.velocity, 0) / inBar.length });
  });

  // 빈 마디는 앞 마디(없으면 뒤 마디) 세기를 따라감
  const firstKnown = barLevels.find((l) => l !== null) ?? 'mf';
  let last: DynamicLevel = firstKnown;
  const levels = barLevels.map((l) => (last = l ?? last));

  type Span = { from: number; to: number; level: DynamicLevel };
  const mergeSame = (spans: Span[]) =>
    spans.reduce<Span[]>((acc, span) => {
      const prev = acc.at(-1);
      if (prev && prev.level === span.level) prev.to = span.to;
      else acc.push({ ...span });
      return acc;
    }, []);

  let spans = mergeSame(levels.map((level, b) => ({ from: b, to: b + 1, level })));

  // 짧은 구간은 앞 구간(첫 구간이면 뒤 구간)에 흡수
  for (let idx = 0; idx < spans.length && spans.length > 1; ) {
    const span = spans[idx];
    if (span.to - span.from >= DYNAMICS_MIN_BARS) {
      idx++;
      continue;
    }
    const neighbor = idx > 0 ? spans[idx - 1] : spans[idx + 1];
    span.level = neighbor.level;
    spans = mergeSame(spans);
    idx = 0;
  }

  return spans.map<Draft<DynamicsNote>>((span) => ({
    type: 'dynamics',
    time: span.from * bar,
    endTime: Math.min(span.to * bar, duration),
    level: span.level,
    difficulties: NORMAL_UP,
  }));
};

const makeHolds = ({ notes, duration, beat }: { notes: SongNote[]; duration: number; beat: number }) => {
  const onsets = [...new Set(notes.map((n) => n.time))].sort((a, b) => a - b);
  const holds: Draft<HoldNote>[] = [];

  onsets.forEach((onset, idx) => {
    const nextOnset = onsets[idx + 1] ?? duration;
    const soundingUntil = Math.max(
      ...notes.filter((n) => n.time <= onset + EPS).map((n) => n.time + n.duration),
    );
    const end = Math.min(nextOnset, soundingUntil);
    if (end - onset >= HOLD_MIN_BEATS * beat - EPS) {
      holds.push({ type: 'hold', time: onset, endTime: end, difficulties: HARD });
    }
  });
  return holds;
};

const makeTargets = ({ duration, bar, beat, beatsPerBar }: { duration: number; bar: number; beat: number; beatsPerBar: number }) => {
  const points = PATTERN_POINTS[beatsPerBar] ?? Array.from({ length: beatsPerBar }, () => PATTERN_POINTS[4][0]);
  const targets: Draft<TargetNote>[] = [];

  for (let b = 1; (b + 1) * bar <= duration + EPS; b++) {
    const difficulties = b % 4 === 2 ? ALL : b % 4 === 0 ? HARD : null;
    if (!difficulties) continue;
    points.forEach((point, i) => {
      targets.push({ type: 'target', time: b * bar + i * beat, ...point, beatInBar: i + 1, difficulties });
    });
  }
  return targets;
};

/** 왼손 노트(hold/cutoff)와 1박 이내로 겹치는 cue는 hard에서 뺀다 */
const resolveLeftHandConflicts = ({
  cues,
  holds,
  cutoffs,
  beat,
}: {
  cues: Draft<CueNote>[];
  holds: Draft<HoldNote>[];
  cutoffs: Draft<CutoffNote>[];
  beat: number;
}) =>
  cues.map((cue) => {
    const nearHold = holds.some((h) => cue.time > h.time - beat - EPS && cue.time < h.endTime + beat - EPS);
    const nearCutoff = cutoffs.some((c) => Math.abs(cue.time - c.time) < beat - EPS);
    if (!nearHold && !nearCutoff) return cue;
    return { ...cue, difficulties: cue.difficulties.filter((d) => d !== 'hard') };
  });

export const generateChart = ({ song }: { song: Song }): Chart => {
  const beat = 60 / song.bpm;
  const bar = beat * song.beatsPerBar;
  const duration = songDuration({ song });
  const allNotes = song.tracks.flatMap((t) => t.notes);

  const holds = makeHolds({ notes: allNotes, duration, beat });
  const cutoffs: Draft<CutoffNote>[] = duration > 0 ? [{ type: 'cutoff', time: duration, difficulties: HARD }] : [];
  const cues = resolveLeftHandConflicts({ cues: makeCues({ song, beat, bar }), holds, cutoffs, beat });

  const drafts: Draft<ChartNote>[] = [
    ...makeBeats({ duration, beat, beatsPerBar: song.beatsPerBar }),
    ...makeDynamics({ notes: allNotes, duration, bar }),
    ...cues,
    ...holds,
    ...cutoffs,
    ...makeTargets({ duration, bar, beat, beatsPerBar: song.beatsPerBar }),
  ];

  const notes = drafts
    .map((draft, order) => ({ draft, order }))
    .sort((a, b) => a.draft.time - b.draft.time || a.order - b.order)
    .map(({ draft }, id) => ({ ...draft, id }) as ChartNote);

  return {
    version: 1,
    title: song.title,
    bpm: song.bpm,
    beatsPerBar: song.beatsPerBar,
    duration,
    tracks: song.tracks.map((track, index) => ({
      index,
      name: track.name,
      program: track.program,
      zone: zoneForProgram({ program: track.program, isDrum: track.isDrum }),
    })),
    notes,
  };
};
