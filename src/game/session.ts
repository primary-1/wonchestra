import { CONFIG } from '../config';
import { isNoteInDifficulty, type Chart, type Difficulty } from '../chart/types';
import type { Orchestra } from '../audio/orchestra';
import { createConductor, type ConductorFrame } from '../input/conductor';
import type { Popup, Renderer } from '../render/renderer';
import type { HandTracker } from '../tracking/handTracker';
import type { Point } from '../tracking/oneEuroFilter';
import { createJudge, type JudgeEvent, type JudgeSummary } from './judge';

export type SessionSettings = {
  difficulty: Difficulty;
  /** 초 */
  latency: number;
  swapHands: boolean;
  debug: boolean;
};

const TRAIL_SECONDS = 0.5;
const RECENT_BEATS = 8;
const END_PADDING = 1.5;

export const startSession = ({
  chart,
  orchestra,
  tracker,
  video,
  renderer,
  settings,
  onEnd,
}: {
  chart: Chart;
  orchestra: Orchestra;
  tracker: HandTracker;
  video: HTMLVideoElement;
  renderer: Renderer;
  /** 게임 중 키로 바뀌므로 매 프레임 읽음 */
  settings: SessionSettings;
  onEnd: (summary: JudgeSummary) => void;
}) => {
  const notes = chart.notes.filter((note) => isNoteInDifficulty({ note, difficulty: settings.difficulty }));
  const aspect = (video.videoWidth || 16) / (video.videoHeight || 9);
  const judge = createJudge({ notes, config: CONFIG, aspect });
  const conductor = createConductor();
  const beat = 60 / chart.bpm;
  const leadIn = beat * chart.beatsPerBar * CONFIG.game.countInBars;

  const popups: Popup[] = [];
  const trail: { point: Point; time: number }[] = [];
  const beatOffsets: number[] = [];
  const noteById = new Map(notes.map((n) => [n.id, n]));
  let frame: ConductorFrame | null = null;
  let lastVideoTime = -1;
  let raf = 0;
  let stopped = false;

  orchestra.start({ leadIn, beat, beatsPerBar: chart.beatsPerBar });

  const popupAt = ({ event }: { event: JudgeEvent }): Point => {
    const note = noteById.get(event.noteId)!;
    const anchors = renderer.anchors();
    if (note.type === 'target') return renderer.toScreen(note);
    if (note.type === 'cue') return anchors.zone(note.zone);
    if (note.type === 'dynamics') return anchors.dynamics;
    if (note.type === 'beat') return anchors.beat;
    return anchors.left;
  };

  const handleEvents = ({ events, now }: { events: JudgeEvent[]; now: number }) => {
    for (const event of events) {
      const note = noteById.get(event.noteId)!;
      if (note.type === 'cue') {
        orchestra.setTrackLevel({ tracks: note.tracks, level: event.judgment === 'miss' ? CONFIG.audio.missedCueLevel : 1 });
      }
      if (event.offset !== undefined) {
        beatOffsets.push(event.offset);
        if (beatOffsets.length > RECENT_BEATS) beatOffsets.shift();
      }
      popups.push({
        text: renderer.judgmentText[event.judgment],
        color: renderer.judgmentColor[event.judgment],
        at: popupAt({ event }),
        born: now,
      });
    }
    while (popups.length > 0 && now - popups[0].born > 1000) popups.shift();
  };

  const tick = (now: number) => {
    if (stopped) return;
    const songTime = orchestra.songTime();
    const inputTime = songTime - settings.latency;

    // 새 카메라 프레임이 있을 때만 인식 (카메라는 보통 30fps, 화면은 60fps)
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const hands = tracker.detect({ video, swapHands: settings.swapHands });
      frame = conductor.update({ time: inputTime, hands });
      if (frame.right) {
        trail.push({ point: frame.right.palm, time: inputTime });
        if (frame.dynamics) orchestra.setDynamicsLevel({ level: frame.dynamics.level });
      }
    } else if (frame) {
      // 같은 프레임의 박을 두 번 세지 않도록
      frame = { ...frame, beats: [] };
    }
    while (trail.length > 0 && inputTime - trail[0].time > TRAIL_SECONDS) trail.shift();

    const events = judge.update({
      time: inputTime,
      beats: frame?.beats ?? [],
      rightPalm: frame?.right?.palm ?? null,
      leftPose: frame?.left?.pose ?? null,
      leftPointer: frame?.left?.pointer ?? null,
      dynamic: frame?.dynamics?.dynamic ?? null,
    });
    handleEvents({ events, now });

    const summary = judge.summary();
    const recentOffset = beatOffsets.length > 0 ? beatOffsets.reduce((a, b) => a + b, 0) / beatOffsets.length : null;
    renderer.render({
      time: songTime,
      video,
      frame,
      chart,
      notes,
      judge,
      popups,
      trail: trail.map((t) => t.point),
      now,
      hud: {
        score: summary.score,
        combo: summary.combo,
        accuracy: summary.judgedMaxScore > 0 ? summary.score / summary.judgedMaxScore : 1,
        difficulty: settings.difficulty,
        latencyMs: Math.round(settings.latency * 1000),
        beatOffsetMs: recentOffset === null ? null : Math.round(recentOffset * 1000),
        countIn: songTime < 0 ? Math.ceil(-songTime / beat) : null,
        debug: settings.debug,
      },
    });

    if (songTime > chart.duration + END_PADDING) {
      stop();
      onEnd(judge.summary());
      return;
    }
    raf = requestAnimationFrame(tick);
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    orchestra.stop();
  };

  raf = requestAnimationFrame(tick);
  return { stop };
};

export type Session = ReturnType<typeof startSession>;
