import { Soundfont } from 'smplr';
import { CONFIG } from '../config';
import { soundfontNameForProgram } from '../chart/instruments';
import type { Song } from '../chart/song';
import { heardTime } from './clock';
import { playClick } from './sfx';

type ScheduledNote = { track: number; midi: number; time: number; duration: number; velocity: number };

export const createOrchestra = async ({
  ctx,
  song,
  onProgress,
}: {
  ctx: AudioContext;
  song: Song;
  onProgress?: (progress: { loaded: number; total: number }) => void;
}) => {
  const compressor = ctx.createDynamicsCompressor();
  compressor.connect(ctx.destination);
  const master = ctx.createGain();
  master.connect(compressor);

  const trackGains = song.tracks.map(() => {
    const gain = ctx.createGain();
    gain.connect(master);
    return gain;
  });

  let loaded = 0;
  const instruments = await Promise.all(
    song.tracks.map(async (track, i) => {
      const instrument = Soundfont(ctx, {
        instrument: track.isDrum ? 'synth_drum' : soundfontNameForProgram({ program: track.program }),
        kit: 'MusyngKite',
        destination: trackGains[i],
      });
      await instrument.ready;
      onProgress?.({ loaded: ++loaded, total: song.tracks.length });
      return instrument;
    }),
  );

  const notes: ScheduledNote[] = song.tracks
    .flatMap((track, i) => track.notes.map((n) => ({ ...n, track: i })))
    .sort((a, b) => a.time - b.time);

  let startTime = 0;
  let cursor = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  const scheduleAhead = () => {
    const horizon = ctx.currentTime + CONFIG.audio.lookahead;
    while (cursor < notes.length && startTime + notes[cursor].time < horizon) {
      const note = notes[cursor++];
      instruments[note.track].start({
        note: note.midi,
        velocity: note.velocity,
        time: Math.max(ctx.currentTime, startTime + note.time),
        duration: note.duration,
      });
    }
  };

  return {
    /** leadIn초 뒤에 곡 시작. 그 사이 박마다 메트로놈 */
    start: ({ leadIn, beat, beatsPerBar }: { leadIn: number; beat: number; beatsPerBar: number }) => {
      startTime = ctx.currentTime + leadIn;
      cursor = 0;
      // 이전 판에서 예약된 볼륨 변화를 지우고 초기화 (같은 곡 다시 하기)
      for (const gain of [...trackGains, master]) {
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setValueAtTime(1, ctx.currentTime);
      }
      const clicks = Math.round(leadIn / beat);
      for (let k = 0; k < clicks; k++) {
        playClick({ ctx, time: startTime - (clicks - k) * beat, accent: (clicks - k) % beatsPerBar === 0 });
      }
      scheduleAhead();
      timer = setInterval(scheduleAhead, 25);
    },
    stop: () => {
      if (timer) clearInterval(timer);
      timer = null;
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      instruments.forEach((inst) => inst.stop());
    },
    /** 들리는 소리 기준 곡 시간 (초). 카운트인 동안은 음수 */
    songTime: () => heardTime({ ctx }) - startTime,
    setTrackLevel: ({ tracks, level }: { tracks: number[]; level: number }) => {
      for (const t of tracks) trackGains[t]?.gain.setTargetAtTime(level, ctx.currentTime, 0.08);
    },
    /** 셈여림 0~1 → 전체 볼륨 */
    setDynamicsLevel: ({ level }: { level: number }) => {
      const { minMasterLevel } = CONFIG.audio;
      master.gain.setTargetAtTime(minMasterLevel + (1 - minMasterLevel) * level, ctx.currentTime, 0.15);
    },
  };
};

export type Orchestra = Awaited<ReturnType<typeof createOrchestra>>;
