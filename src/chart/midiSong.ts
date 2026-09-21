import { Midi } from '../lib/tonejsMidi';
import type { Song } from './song';

/** MIDI 파일을 채보용 곡 데이터로 변환. 템포는 첫 템포 하나만 씀 (고정 템포 게임) */
export const songFromMidi = ({ data, title }: { data: ArrayBuffer | Uint8Array; title?: string }): Song => {
  const midi = new Midi(data);
  const bpm = midi.header.tempos[0]?.bpm ?? 120;
  const beatsPerBar = midi.header.timeSignatures[0]?.timeSignature[0] ?? 4;

  return {
    title: title ?? midi.name ?? 'Untitled',
    bpm,
    beatsPerBar,
    tracks: midi.tracks
      .filter((track) => track.notes.length > 0)
      .map((track, index) => ({
        name: track.name || track.instrument.name || `Track ${index + 1}`,
        program: track.instrument.number,
        isDrum: track.instrument.percussion,
        notes: track.notes.map((note) => ({
          midi: note.midi,
          time: note.time,
          duration: note.duration,
          velocity: Math.round(note.velocity * 127),
        })),
      })),
  };
};
