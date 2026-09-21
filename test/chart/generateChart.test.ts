import { describe, expect, it } from 'vitest';
import { generateChart } from '../../src/chart/generateChart';
import type { Song, SongNote, SongTrack } from '../../src/chart/song';
import type { ChartNote, CueNote, DynamicsNote, HoldNote, TargetNote } from '../../src/chart/types';

// 120 BPM, 4/4 → 1박 0.5초, 1마디 2초
const BEAT = 0.5;
const BAR = 2;

const note = ({ time, duration = BEAT, velocity = 80, midi = 60 }: Partial<SongNote> & { time: number }): SongNote => ({
  midi,
  time,
  duration,
  velocity,
});

/** from~to 마디 동안 매 박마다 음을 치는 트랙 노트 */
const everyBeat = ({ fromBar, toBar, velocity = 80 }: { fromBar: number; toBar: number; velocity?: number }) =>
  Array.from({ length: (toBar - fromBar) * 4 }, (_, i) => note({ time: fromBar * BAR + i * BEAT, velocity }));

const track = ({ name = 't', program = 40, notes }: { name?: string; program?: number; notes: SongNote[] }): SongTrack => ({
  name,
  program,
  isDrum: false,
  notes,
});

const song = ({ tracks }: { tracks: SongTrack[] }): Song => ({ title: 'test', bpm: 120, beatsPerBar: 4, tracks });

const ofType = <T extends ChartNote['type']>({ notes, type }: { notes: ChartNote[]; type: T }) =>
  notes.filter((n): n is Extract<ChartNote, { type: T }> => n.type === type);

describe('generateChart', () => {
  describe('기본 정보', () => {
    it('곡 길이, 템포, 트랙 구역을 채운다', () => {
      const chart = generateChart({
        song: song({ tracks: [track({ name: 'Violin', program: 40, notes: everyBeat({ fromBar: 0, toBar: 2 }) })] }),
      });

      expect(chart).toMatchObject({ version: 1, title: 'test', bpm: 120, beatsPerBar: 4, duration: 4 });
      expect(chart.tracks).toEqual([{ index: 0, name: 'Violin', program: 40, zone: 'left' }]);
    });

    it('노트는 시간순이고 id가 0부터 순서대로 붙는다', () => {
      const chart = generateChart({ song: song({ tracks: [track({ notes: everyBeat({ fromBar: 0, toBar: 8 }) })] }) });

      const times = chart.notes.map((n) => n.time);
      expect(times).toEqual([...times].sort((a, b) => a - b));
      expect(chart.notes.map((n) => n.id)).toEqual(chart.notes.map((_, i) => i));
    });
  });

  describe('beat', () => {
    it('모든 박에 노트를 만들고, 첫 박만 easy에도 나온다', () => {
      const chart = generateChart({ song: song({ tracks: [track({ notes: everyBeat({ fromBar: 0, toBar: 2 }) })] }) });
      const beats = ofType({ notes: chart.notes, type: 'beat' });

      expect(beats.map((b) => b.time)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
      expect(beats.map((b) => b.beatInBar)).toEqual([1, 2, 3, 4, 1, 2, 3, 4]);
      expect(beats[0].difficulties).toEqual(['easy', 'normal', 'hard']);
      expect(beats[1].difficulties).toEqual(['normal', 'hard']);
    });
  });

  describe('cue', () => {
    it('2마디 이상 쉬다 들어오는 트랙에 큐를 만든다', () => {
      const chart = generateChart({
        song: song({
          tracks: [
            track({ name: 'Strings', program: 48, notes: everyBeat({ fromBar: 0, toBar: 6 }) }),
            track({ name: 'Horn', program: 60, notes: everyBeat({ fromBar: 3, toBar: 6 }) }),
          ],
        }),
      });

      expect(ofType({ notes: chart.notes, type: 'cue' })).toEqual([
        expect.objectContaining<Partial<CueNote>>({ time: 3 * BAR, zone: 'right', tracks: [1], label: 'Horn' }),
      ]);
    });

    it('곡 시작부터 나오는 트랙과 짧게 쉬었다 들어오는 트랙은 큐가 없다', () => {
      const chart = generateChart({
        song: song({
          tracks: [
            track({ notes: everyBeat({ fromBar: 0, toBar: 2 }) }),
            track({ notes: [...everyBeat({ fromBar: 0, toBar: 1 }), ...everyBeat({ fromBar: 2, toBar: 3 })] }),
          ],
        }),
      });

      expect(ofType({ notes: chart.notes, type: 'cue' })).toEqual([]);
    });

    it('같은 박에 여러 파트가 들어오면 다음 마디가 가장 큰 구역 하나만 남긴다', () => {
      const chart = generateChart({
        song: song({
          tracks: [
            track({ name: 'Pad', program: 48, notes: everyBeat({ fromBar: 0, toBar: 6 }) }),
            track({ name: 'Violin', program: 40, notes: everyBeat({ fromBar: 3, toBar: 6, velocity: 50 }) }),
            track({ name: 'Horn', program: 60, notes: everyBeat({ fromBar: 3, toBar: 6, velocity: 100 }) }),
            track({ name: 'Trumpet', program: 56, notes: everyBeat({ fromBar: 3, toBar: 6, velocity: 90 }) }),
          ],
        }),
      });

      expect(ofType({ notes: chart.notes, type: 'cue' })).toEqual([
        expect.objectContaining<Partial<CueNote>>({ zone: 'right', tracks: [2, 3], label: 'Horn, Trumpet' }),
      ]);
    });
  });

  describe('dynamics', () => {
    it('마디별 세기를 묶어 구간을 만든다', () => {
      const chart = generateChart({
        song: song({
          tracks: [
            track({
              notes: [
                ...everyBeat({ fromBar: 0, toBar: 2, velocity: 40 }),
                ...everyBeat({ fromBar: 2, toBar: 4, velocity: 75 }),
                ...everyBeat({ fromBar: 4, toBar: 6, velocity: 110 }),
              ],
            }),
          ],
        }),
      });

      expect(ofType({ notes: chart.notes, type: 'dynamics' })).toEqual([
        expect.objectContaining<Partial<DynamicsNote>>({ time: 0, endTime: 4, level: 'p' }),
        expect.objectContaining<Partial<DynamicsNote>>({ time: 4, endTime: 8, level: 'mf' }),
        expect.objectContaining<Partial<DynamicsNote>>({ time: 8, endTime: 12, level: 'f' }),
      ]);
    });

    it('2마디보다 짧은 구간은 앞 구간에 합친다', () => {
      const chart = generateChart({
        song: song({
          tracks: [
            track({
              notes: [
                ...everyBeat({ fromBar: 0, toBar: 2, velocity: 40 }),
                ...everyBeat({ fromBar: 2, toBar: 3, velocity: 110 }),
                ...everyBeat({ fromBar: 3, toBar: 5, velocity: 40 }),
              ],
            }),
          ],
        }),
      });

      expect(ofType({ notes: chart.notes, type: 'dynamics' })).toEqual([
        expect.objectContaining<Partial<DynamicsNote>>({ time: 0, endTime: 10, level: 'p' }),
      ]);
    });
  });

  describe('hold · cutoff', () => {
    it('3박 이상 새 음 없이 울리는 구간은 hold, 곡 끝은 cutoff (hard 전용)', () => {
      const chart = generateChart({
        song: song({
          tracks: [track({ notes: [...everyBeat({ fromBar: 0, toBar: 1 }), note({ time: BAR, duration: 2 * BAR })] })],
        }),
      });

      expect(ofType({ notes: chart.notes, type: 'hold' })).toEqual([
        expect.objectContaining<Partial<HoldNote>>({ time: BAR, endTime: 3 * BAR, difficulties: ['hard'] }),
      ]);
      expect(ofType({ notes: chart.notes, type: 'cutoff' })).toEqual([
        expect.objectContaining({ time: 3 * BAR, difficulties: ['hard'] }),
      ]);
    });

    it('hold와 1박 이내로 겹치는 cue는 hard에서 빠진다', () => {
      const chart = generateChart({
        song: song({
          tracks: [
            track({ name: 'Pad', program: 48, notes: [note({ time: 0, duration: 2 * BAR })] }),
            track({ name: 'Horn', program: 60, notes: everyBeat({ fromBar: 2, toBar: 4 }) }),
          ],
        }),
      });

      expect(ofType({ notes: chart.notes, type: 'hold' })).toHaveLength(1);
      expect(ofType({ notes: chart.notes, type: 'cue' })).toEqual([
        expect.objectContaining<Partial<CueNote>>({ time: 2 * BAR, difficulties: ['normal'] }),
      ]);
    });
  });

  describe('target', () => {
    it('4/4 지휘 도형 위치에 한 마디씩 타겟을 놓는다', () => {
      const chart = generateChart({ song: song({ tracks: [track({ notes: everyBeat({ fromBar: 0, toBar: 9 }) })] }) });
      const targets = ofType({ notes: chart.notes, type: 'target' });

      // 2·6번 마디(0부터)는 모든 난이도, 4·8번 마디는 hard 전용
      expect(targets.filter((t) => t.difficulties.includes('easy')).map((t) => t.time)).toEqual([
        4, 4.5, 5, 5.5, 12, 12.5, 13, 13.5,
      ]);
      expect(targets.filter((t) => !t.difficulties.includes('easy')).map((t) => t.time)).toEqual([
        8, 8.5, 9, 9.5, 16, 16.5, 17, 17.5,
      ]);

      const [down, inward, outward, up] = targets.slice(0, 4) as TargetNote[];
      expect(inward.x).toBeLessThan(down.x);
      expect(outward.x).toBeGreaterThan(down.x);
      expect(up.y).toBeLessThan(down.y);
    });
  });
});
