/** MIDI 라이브러리와 무관한, 채보 생성용 곡 데이터 */
export type SongNote = {
  midi: number;
  /** 초 */
  time: number;
  /** 초 */
  duration: number;
  /** 0~127 */
  velocity: number;
};

export type SongTrack = {
  name: string;
  program: number;
  isDrum: boolean;
  notes: SongNote[];
};

export type Song = {
  title: string;
  bpm: number;
  beatsPerBar: number;
  tracks: SongTrack[];
};

export const songDuration = ({ song }: { song: Song }) =>
  Math.max(0, ...song.tracks.flatMap((track) => track.notes.map((note) => note.time + note.duration)));
