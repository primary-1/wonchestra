import { zoneOf } from '../game/judge';
import type { ConductorFrame } from '../input/conductor';
import type { Point } from '../tracking/oneEuroFilter';
import type { TutorialFrame } from '../tutorial/steps';
import { COLORS, ZONE_LABEL, type Stage } from './stage';

export type TutorialRenderInput = {
  /** 오디오 시계 (메트로놈 깜빡임용) */
  time: number;
  video: HTMLVideoElement;
  frame: ConductorFrame | null;
  trail: Point[];
  tutorial: TutorialFrame;
};

const HAND_LABEL = {
  right: { text: '오른손', color: COLORS.right },
  left: { text: '왼손', color: COLORS.left },
  both: { text: '두 손', color: COLORS.perfect },
} as const;

/** 튜토리얼 화면: 카메라 + 손 + 단계별 도우미 + 상단 단계 카드 */
export const createTutorialRenderer = ({ stage }: { stage: Stage }) => {
  const { g, text } = stage;

  const drawStepHelpers = ({ time, frame, tutorial }: TutorialRenderInput) => {
    const { step, view } = tutorial;
    if (!step || !view) return;
    const { width, height } = stage.size();

    if (step.id === 'cue' && view.zone) {
      stage.drawCueZone({ zone: view.zone, progress: 1, label: `${ZONE_LABEL[view.zone]} 가리키기` });
    }
    if (step.id === 'cue' || step.id === 'hands') {
      stage.drawZones({ pointing: frame?.left?.pose === 'point' ? zoneOf({ x: frame.left.pointer.x }) : null });
    }
    if (step.id === 'targets' && view.target && !view.done) {
      stage.drawTarget({ point: view.target, label: String(Math.round(view.progress * 3) + 1), approach: null });
    }
    if (step.id === 'dynamics' && view.dynamicGoal) {
      const meter = stage.drawDynamicsMeter({
        amplitude: frame?.dynamics?.amplitude ?? 0,
        goal: view.dynamicGoal,
        matched: frame?.dynamics?.dynamic === view.dynamicGoal,
      });
      text({ value: `목표 ${view.dynamicGoal}`, x: meter.x, y: meter.top - 30, size: 16, align: 'center' });
    }
    if (step.id === 'tempo' && view.metronome) {
      // 메트로놈 박마다 커졌다 줄어드는 원
      const { start, period } = view.metronome;
      const sinceBeat = time < start ? null : (time - start) % period;
      const pulse = sinceBeat === null ? 0 : Math.max(0, 1 - sinceBeat / 0.25);
      const cx = width / 2;
      const cy = height * 0.58;
      g.fillStyle = `rgba(255, 209, 102, ${0.15 + 0.6 * pulse})`;
      g.beginPath();
      g.arc(cx, cy, 36 + 24 * pulse, 0, Math.PI * 2);
      g.fill();
      if (sinceBeat === null) text({ value: '준비…', x: cx, y: cy, size: 18, align: 'center' });
      // 내 박이 찍히면 판정선처럼 번쩍
      if (frame && frame.beats.length > 0) {
        g.strokeStyle = COLORS.right;
        g.lineWidth = 6;
        g.beginPath();
        g.arc(cx, cy, 80, 0, Math.PI * 2);
        g.stroke();
      }
    }
    if (step.id === 'beats' && frame && frame.beats.length > 0 && frame.right) {
      const p = stage.toScreen(frame.right.palm);
      g.strokeStyle = COLORS.perfect;
      g.lineWidth = 5;
      g.beginPath();
      g.arc(p.x, p.y, 40, 0, Math.PI * 2);
      g.stroke();
    }
  };

  const drawCard = ({ tutorial }: TutorialRenderInput) => {
    const { step, view, index, total, celebrating } = tutorial;
    if (!step) return;
    const { width } = stage.size();
    const cardW = Math.min(620, width - 32);
    const x = (width - cardW) / 2;
    const y = 56;
    const cardH = 196;

    g.fillStyle = 'rgba(18, 14, 44, 0.88)';
    g.strokeStyle = celebrating ? COLORS.perfect : 'rgba(255, 255, 255, 0.12)';
    g.lineWidth = celebrating ? 3 : 1;
    g.beginPath();
    g.roundRect(x, y, cardW, cardH, 18);
    g.fill();
    g.stroke();

    const hand = HAND_LABEL[step.hand];
    text({ value: `${index + 1} / ${total}`, x: x + 24, y: y + 28, size: 14, color: COLORS.dim, weight: 600 });
    text({ value: hand.text, x: x + cardW - 24, y: y + 28, size: 14, align: 'right', color: hand.color, weight: 700 });
    text({ value: celebrating ? '잘했어요! ✨' : step.title, x: width / 2, y: y + 62, size: 28, align: 'center', color: celebrating ? COLORS.perfect : COLORS.text });
    stage.paragraph({ value: step.instruction, x: width / 2, y: y + 100, maxWidth: cardW - 48, size: 15, color: COLORS.dim });
    stage.progressBar({ x: x + 24, y: y + cardH - 26, w: cardW - 48, ratio: view?.progress ?? 0, color: hand.color });
    if (view?.hint) text({ value: view.hint, x: width / 2, y: y + cardH + 24, size: 16, align: 'center', color: COLORS.perfect });
  };

  const drawFooter = () => {
    const { width, height } = stage.size();
    text({ value: '→ 건너뛰기 · Esc 나가기', x: width / 2, y: height - 24, size: 13, align: 'center', color: COLORS.dim, weight: 500 });
  };

  return {
    render: (input: TutorialRenderInput) => {
      stage.beginFrame(input);
      drawStepHelpers(input);
      stage.drawHands(input);
      drawCard(input);
      drawFooter();
    },
  };
};

export type TutorialRenderer = ReturnType<typeof createTutorialRenderer>;
