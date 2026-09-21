/**
 * 데모 곡 생성: 베토벤 「환희의 송가」(공개 도메인)를 작은 오케스트라용으로 직접 편곡한 MIDI.
 * 채보 자동 생성이 모든 메카닉을 만들어내도록 구성을 짰음.
 *
 *   마디 0-1   현악 패드만 길게 (p)           → hold
 *   마디 2-9   바이올린 선율 + 첼로 (mf)       → 현악 cue (왼쪽)
 *   마디 10-17 플루트 솔로, 반주 작게 (p)      → 목관 cue (가운데)
 *   마디 18-25 투티: 호른·팀파니 합류 (f)      → 금관 cue (오른쪽)
 *   마디 26-27 마지막 화음 길게                → hold + cutoff
 *
 * 실행: pnpm demo-midi
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { Midi } from '../src/lib/tonejsMidi';

const BPM = 100;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const OUT_DIR = 'public/songs/ode-to-joy';

type Step = [midi: number, beats: number];

// 8마디 선율 (D장조)
const MELODY: Step[][] = [
  [[66, 1], [66, 1], [67, 1], [69, 1]],
  [[69, 1], [67, 1], [66, 1], [64, 1]],
  [[62, 1], [62, 1], [64, 1], [66, 1]],
  [[66, 1.5], [64, 0.5], [64, 2]],
  [[66, 1], [66, 1], [67, 1], [69, 1]],
  [[69, 1], [67, 1], [66, 1], [64, 1]],
  [[62, 1], [62, 1], [64, 1], [66, 1]],
  [[64, 1.5], [62, 0.5], [62, 2]],
];

type Chord = 'D' | 'A';
// 마디마다 [앞 2박 화음, 뒤 2박 화음]
const HARMONY: [Chord, Chord][] = [
  ['D', 'D'], ['A', 'A'], ['D', 'D'], ['A', 'A'],
  ['D', 'D'], ['A', 'A'], ['D', 'D'], ['A', 'D'],
];
const PAD_VOICING: Record<Chord, number[]> = { D: [62, 66, 69], A: [61, 64, 69] };
const BASS: Record<Chord, [number, number]> = { D: [50, 45], A: [45, 52] };
const TIMPANI: Record<Chord, number> = { D: 50, A: 45 };

const midi = new Midi();
midi.name = '환희의 송가';
midi.header.setTempo(BPM);
midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });

const addTrack = ({ name, program, channel }: { name: string; program: number; channel: number }) => {
  const track = midi.addTrack();
  track.name = name;
  track.channel = channel;
  track.instrument.number = program;
  return track;
};

const violin = addTrack({ name: 'Violin', program: 40, channel: 0 });
const pad = addTrack({ name: 'Strings', program: 48, channel: 1 });
const cello = addTrack({ name: 'Cello', program: 42, channel: 2 });
const flute = addTrack({ name: 'Flute', program: 73, channel: 3 });
const horn = addTrack({ name: 'Horn', program: 60, channel: 4 });
const timpani = addTrack({ name: 'Timpani', program: 47, channel: 5 });

type Track = ReturnType<typeof addTrack>;

const add = ({ track, midi: pitch, time, beats, velocity }: { track: Track; midi: number; time: number; beats: number; velocity: number }) =>
  track.addNote({ midi: pitch, time, duration: beats * BEAT * 0.98, velocity: velocity / 127 });

const playMelody = ({ track, fromBar, transpose, velocity }: { track: Track; fromBar: number; transpose: number; velocity: number }) =>
  MELODY.forEach((steps, barIdx) => {
    let beat = 0;
    for (const [pitch, beats] of steps) {
      add({ track, midi: pitch + transpose, time: (fromBar + barIdx) * BAR + beat * BEAT, beats, velocity });
      beat += beats;
    }
  });

const playAccompaniment = ({ fromBar, velocity, withTimpani }: { fromBar: number; velocity: number; withTimpani: boolean }) =>
  HARMONY.forEach(([first, second], barIdx) => {
    const barTime = (fromBar + barIdx) * BAR;
    const halves: [Chord, number][] = first === second ? [[first, 4]] : [[first, 2], [second, 2]];
    let beat = 0;
    for (const [chord, beats] of halves) {
      for (const pitch of PAD_VOICING[chord]) add({ track: pad, midi: pitch, time: barTime + beat * BEAT, beats, velocity: velocity - 10 });
      beat += beats;
    }
    const [c1, c2] = [first, second];
    add({ track: cello, midi: BASS[c1][0], time: barTime, beats: 2, velocity });
    add({ track: cello, midi: c1 === c2 ? BASS[c1][1] : BASS[c2][0], time: barTime + 2 * BEAT, beats: 2, velocity });
    if (withTimpani) {
      add({ track: timpani, midi: TIMPANI[c1], time: barTime, beats: 1, velocity });
      add({ track: timpani, midi: TIMPANI[c2], time: barTime + 2 * BEAT, beats: 1, velocity: velocity - 15 });
    }
  });

// 마디 0-1: 도입 패드
for (const pitch of PAD_VOICING.D) add({ track: pad, midi: pitch, time: 0, beats: 8, velocity: 45 });

// 마디 2-9: 바이올린 선율
playMelody({ track: violin, fromBar: 2, transpose: 12, velocity: 72 });
playAccompaniment({ fromBar: 2, velocity: 70, withTimpani: false });

// 마디 10-17: 플루트 솔로
playMelody({ track: flute, fromBar: 10, transpose: 12, velocity: 50 });
playAccompaniment({ fromBar: 10, velocity: 44, withTimpani: false });

// 마디 18-25: 투티 (호른을 가장 크게 해서 큐가 금관으로 가도록)
playMelody({ track: violin, fromBar: 18, transpose: 12, velocity: 96 });
playMelody({ track: flute, fromBar: 18, transpose: 24, velocity: 90 });
playMelody({ track: horn, fromBar: 18, transpose: 0, velocity: 108 });
playAccompaniment({ fromBar: 18, velocity: 100, withTimpani: true });

// 마디 26-27: 마지막 화음
const finalTime = 26 * BAR;
const finalChord: [Track, number[]][] = [
  [violin, [74, 78]],
  [pad, [62, 66, 69, 74]],
  [cello, [38, 50]],
  [flute, [86]],
  [horn, [57, 62]],
  [timpani, [50]],
];
for (const [track, pitches] of finalChord) {
  for (const pitch of pitches) add({ track, midi: pitch, time: finalTime, beats: 8, velocity: 110 });
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/song.mid`, midi.toArray());
console.log(`wrote ${OUT_DIR}/song.mid`);
