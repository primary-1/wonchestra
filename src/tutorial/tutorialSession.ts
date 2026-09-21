import { heardTime } from '../audio/clock';
import { playClick, playSuccess } from '../audio/sfx';
import { createConductor, type ConductorFrame } from '../input/conductor';
import type { TutorialRenderer } from '../render/tutorialRenderer';
import type { HandTracker } from '../tracking/handTracker';
import type { Point } from '../tracking/oneEuroFilter';
import type { SessionSettings } from '../game/session';
import { createTutorial, TUTORIAL_STEPS, type TutorialEffect } from './steps';

const TRAIL_SECONDS = 0.5;
/** 메트로놈 클릭을 미리 예약해 두는 시간 (초) */
const CLICK_LOOKAHEAD = 0.2;

export type TutorialResult = { completed: boolean; latency: number; swapHands: boolean };

export const startTutorial = ({
  ctx,
  tracker,
  video,
  renderer,
  settings,
  onSettingsChange,
  onEnd,
}: {
  ctx: AudioContext;
  tracker: HandTracker;
  video: HTMLVideoElement;
  renderer: TutorialRenderer;
  settings: SessionSettings;
  /** 튜토리얼이 좌우 손·지연 보정을 바꾸면 불림 (저장용) */
  onSettingsChange: () => void;
  onEnd: (result: TutorialResult) => void;
}) => {
  const tutorial = createTutorial({ steps: TUTORIAL_STEPS });
  const conductor = createConductor();
  const aspect = (video.videoWidth || 16) / (video.videoHeight || 9);
  const trail: { point: Point; time: number }[] = [];
  let frame: ConductorFrame | null = null;
  let lastVideoTime = -1;
  let lastIndex = 0;
  let celebratedIndex = -1;
  /** 이미 예약한 메트로놈 박 번호 */
  let scheduledBeat = -1;
  let raf = 0;
  let stopped = false;

  const applyEffects = ({ effects }: { effects: TutorialEffect[] }) => {
    for (const effect of effects) {
      if (effect.type === 'swapHands') settings.swapHands = !settings.swapHands;
      if (effect.type === 'latency') settings.latency = effect.value;
    }
    if (effects.length > 0) onSettingsChange();
  };

  const scheduleMetronome = ({ start, period, time }: { start: number; period: number; time: number }) => {
    // 오디오 시계 T에 예약한 소리는 heardTime이 T일 때 들림
    while (start + (scheduledBeat + 1) * period < time + CLICK_LOOKAHEAD) {
      scheduledBeat++;
      const at = start + scheduledBeat * period;
      if (at >= ctx.currentTime) playClick({ ctx, time: at, accent: scheduledBeat % 4 === 0 });
    }
  };

  const tick = () => {
    if (stopped) return;
    const time = heardTime({ ctx });

    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      frame = conductor.update({ time, hands: tracker.detect({ video, swapHands: settings.swapHands }) });
      if (frame.right) trail.push({ point: frame.right.palm, time });
    } else if (frame) {
      frame = { ...frame, beats: [] };
    }
    while (trail.length > 0 && time - trail[0].time > TRAIL_SECONDS) trail.shift();

    const state = tutorial.update({
      time,
      aspect,
      right: frame?.right ? { palm: frame.right.palm } : null,
      left: frame?.left ? { pose: frame.left.pose, pointer: frame.left.pointer } : null,
      beats: frame?.beats ?? [],
      dynamic: frame?.dynamics?.dynamic ?? null,
    });
    applyEffects(state);

    if (state.index !== lastIndex) {
      lastIndex = state.index;
      scheduledBeat = -1;
    }
    if (state.view?.metronome && !state.celebrating) scheduleMetronome({ ...state.view.metronome, time });
    // 단계마다 통과 순간에 한 번만 "띠링"
    if (state.celebrating && celebratedIndex !== state.index) {
      celebratedIndex = state.index;
      playSuccess({ ctx });
    }

    if (state.finished) {
      stop();
      onEnd({ completed: true, latency: settings.latency, swapHands: settings.swapHands });
      return;
    }

    renderer.render({ time, video, frame, trail: trail.map((t) => t.point), tutorial: state });
    raf = requestAnimationFrame(tick);
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
  };

  raf = requestAnimationFrame(tick);
  return {
    stop,
    skip: () => tutorial.skip(),
  };
};

export type TutorialSession = ReturnType<typeof startTutorial>;
