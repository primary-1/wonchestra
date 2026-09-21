export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];

/** 화면을 세로로 3등분한 파트 구역 (플레이어가 보는 화면 기준) */
export type Zone = 'left' | 'center' | 'right';

export type DynamicLevel = 'p' | 'mf' | 'f';

export const DYNAMIC_LEVELS: readonly DynamicLevel[] = ['p', 'mf', 'f'];

type NoteBase = {
  id: number;
  /** 곡 시작 기준 초 */
  time: number;
  /** 이 노트가 등장하는 난이도들 */
  difficulties: Difficulty[];
};

export type BeatNote = NoteBase & {
  type: 'beat';
  /** 마디 안에서 몇 번째 박인지 (1부터) */
  beatInBar: number;
};

export type DynamicsNote = NoteBase & {
  type: 'dynamics';
  endTime: number;
  level: DynamicLevel;
};

export type CueNote = NoteBase & {
  type: 'cue';
  zone: Zone;
  /** 큐를 받는 트랙 인덱스들. 큐를 놓치면 이 트랙들이 작게 들림 */
  tracks: number[];
  label: string;
};

export type CutoffNote = NoteBase & {
  type: 'cutoff';
};

export type HoldNote = NoteBase & {
  type: 'hold';
  endTime: number;
};

export type TargetNote = NoteBase & {
  type: 'target';
  /** 화면 기준 0~1 좌표 (거울 모드 화면에서 보이는 위치) */
  x: number;
  y: number;
  beatInBar: number;
};

export type ChartNote = BeatNote | DynamicsNote | CueNote | CutoffNote | HoldNote | TargetNote;

export type ChartNoteType = ChartNote['type'];

export type ChartTrack = {
  index: number;
  name: string;
  /** GM 프로그램 번호 (0~127) */
  program: number;
  zone: Zone;
};

export type Chart = {
  version: 1;
  title: string;
  bpm: number;
  beatsPerBar: number;
  duration: number;
  tracks: ChartTrack[];
  notes: ChartNote[];
};

export const isNoteInDifficulty = ({ note, difficulty }: { note: ChartNote; difficulty: Difficulty }) =>
  note.difficulties.includes(difficulty);
