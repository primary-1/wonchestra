import { CONFIG } from '../config';
import type { Chart, ChartNote, CueNote, Zone } from '../chart/types';
import type { Judge, Judgment } from '../game/judge';
import { zoneOf } from '../game/judge';
import type { ConductorFrame } from '../input/conductor';
import type { Point } from '../tracking/oneEuroFilter';
import { COLORS, ZONE_LABEL, type Stage } from './stage';

const JUDGMENT_TEXT: Record<Judgment, string> = { perfect: 'PERFECT', good: 'GOOD', miss: 'MISS' };

/** 노트가 판정선까지 오는 동안 보여주는 시간 (초) */
const LANE_LOOKAHEAD = 2.5;
const TARGET_APPROACH = 1.2;
const CUE_APPROACH = 2.5;
const POPUP_LIFE = 0.7;

export type Popup = { text: string; color: string; at: Point; born: number };

export type Hud = {
  score: number;
  combo: number;
  accuracy: number;
  difficulty: string;
  latencyMs: number;
  /** 최근 박 평균 오차 (ms, 양수면 늦음) */
  beatOffsetMs: number | null;
  countIn: number | null;
  debug: boolean;
};

export type RenderInput = {
  time: number;
  video: HTMLVideoElement;
  frame: ConductorFrame | null;
  chart: Chart;
  notes: ChartNote[];
  judge: Judge;
  popups: Popup[];
  trail: Point[];
  hud: Hud;
  now: number;
};

/** 게임 화면 */
export const createRenderer = ({ stage }: { stage: Stage }) => {
  const { g, text, toScreen } = stage;

  const laneGeometry = () => {
    const { width, height } = stage.size();
    const laneH = 64;
    const beatY = height - laneH / 2 - 16;
    const leftY = beatY - laneH - 8;
    const hitX = Math.max(90, width * 0.12);
    const pxPerSec = (width - hitX - 40) / LANE_LOOKAHEAD;
    return { laneH, beatY, leftY, hitX, pxPerSec };
  };

  const drawZones = ({ time, notes, judge, frame }: Pick<RenderInput, 'time' | 'notes' | 'judge' | 'frame'>) => {
    const pointing = frame?.left?.pose === 'point' ? zoneOf({ x: frame.left.pointer.x }) : null;
    const cues = notes.filter(
      (n): n is CueNote =>
        n.type === 'cue' && judge.isPending({ noteId: n.id }) && n.time - time < CUE_APPROACH && time - n.time < CONFIG.judge.cueWindow,
    );
    for (const cue of cues) {
      stage.drawCueZone({ zone: cue.zone, progress: Math.min(1, 1 - (cue.time - time) / CUE_APPROACH), label: `${cue.label} 큐!` });
    }
    stage.drawZones({ pointing });
  };

  const drawTargets = ({ time, notes, judge }: Pick<RenderInput, 'time' | 'notes' | 'judge'>) => {
    for (const note of notes) {
      if (note.type !== 'target' || !judge.isPending({ noteId: note.id })) continue;
      const until = note.time - time;
      if (until > TARGET_APPROACH || until < -CONFIG.judge.good) continue;
      stage.drawTarget({
        point: note,
        label: String(note.beatInBar),
        // 다가오는 링: 노트 시각에 원과 딱 겹침
        approach: Math.max(0, until) * 2.2,
        alpha: Math.min(1, 1 - until / TARGET_APPROACH + 0.2),
      });
    }
  };

  const drawLanes = ({ time, notes, judge, frame }: Pick<RenderInput, 'time' | 'notes' | 'judge' | 'frame'>) => {
    const { width } = stage.size();
    const { laneH, beatY, leftY, hitX, pxPerSec } = laneGeometry();
    const xAt = (t: number) => hitX + (t - time) * pxPerSec;

    g.fillStyle = COLORS.lane;
    g.fillRect(0, beatY - laneH / 2, width, laneH);
    g.fillRect(0, leftY - laneH / 2, width, laneH);
    text({ value: '오른손 박', x: 12, y: beatY, size: 13, color: COLORS.right, weight: 600 });
    text({ value: '왼손', x: 12, y: leftY, size: 13, color: COLORS.left, weight: 600 });

    // 판정선: 박이 찍히면 번쩍
    const flash = frame && frame.beats.length > 0;
    g.strokeStyle = flash ? COLORS.perfect : COLORS.text;
    g.lineWidth = flash ? 6 : 3;
    g.beginPath();
    g.moveTo(hitX, leftY - laneH / 2);
    g.lineTo(hitX, beatY + laneH / 2);
    g.stroke();

    for (const note of notes) {
      const end = note.type === 'hold' ? note.endTime : note.time;
      if (end < time - 0.3 || note.time > time + LANE_LOOKAHEAD) continue;
      const pending = judge.isPending({ noteId: note.id });
      const x = xAt(note.time);

      if (note.type === 'beat' && pending) {
        const r = note.beatInBar === 1 ? 17 : 11;
        g.fillStyle = note.beatInBar === 1 ? COLORS.right : 'rgba(79, 209, 255, 0.7)';
        g.beginPath();
        g.arc(x, beatY, r, 0, Math.PI * 2);
        g.fill();
        if (note.beatInBar === 1) text({ value: '1', x, y: beatY, size: 14, align: 'center', color: '#0b0820' });
      }
      if (note.type === 'hold') {
        const x1 = xAt(note.endTime);
        g.fillStyle = 'rgba(255, 107, 214, 0.35)';
        g.fillRect(Math.max(x, 0), leftY - 16, Math.max(0, x1 - Math.max(x, 0)), 32);
        text({ value: '✋ 유지', x: Math.max(x + 8, hitX + 8), y: leftY, size: 16 });
      }
      if (note.type === 'cutoff' && pending) text({ value: '✊', x, y: leftY, size: 30, align: 'center' });
      if (note.type === 'cue' && pending) {
        text({ value: '👉', x, y: leftY, size: 26, align: 'center' });
        text({ value: ZONE_LABEL[note.zone], x, y: leftY - 26, size: 12, align: 'center', color: COLORS.left });
      }
    }
  };

  const drawHoldStatus = ({ time, notes, judge, frame }: Pick<RenderInput, 'time' | 'notes' | 'judge' | 'frame'>) => {
    const hold = notes.find((n) => n.type === 'hold' && time >= n.time && time < n.endTime && judge.isPending({ noteId: n.id }));
    if (!hold) return;
    const { width, height } = stage.size();
    const holding = frame?.left?.pose === 'open';
    const cx = width * 0.18;
    const cy = height * 0.42;
    text({ value: holding ? '✋ 좋아, 유지!' : '✋ 왼손 펴서 들기', x: cx, y: cy, size: 28, align: 'center', color: holding ? COLORS.perfect : COLORS.left });
    stage.progressBar({ x: cx - 90, y: cy + 28, w: 180, ratio: judge.spanRatio({ noteId: hold.id }) ?? 0, color: COLORS.left });
  };

  const drawDynamics = ({ time, notes, judge, frame }: Pick<RenderInput, 'time' | 'notes' | 'judge' | 'frame'>) => {
    const current = notes.find((n) => n.type === 'dynamics' && time >= n.time && time < n.endTime);
    const next = notes.find((n) => n.type === 'dynamics' && n.time > time && n.time - time < 3);
    if (!current && !next) return;

    const goal = current?.type === 'dynamics' ? current.level : null;
    const meter = stage.drawDynamicsMeter({
      amplitude: frame?.dynamics?.amplitude ?? 0,
      goal,
      matched: goal !== null && frame?.dynamics?.dynamic === goal,
    });
    if (current?.type === 'dynamics') {
      const ratio = judge.spanRatio({ noteId: current.id });
      text({ value: `목표 ${current.level}`, x: meter.x, y: meter.top - 30, size: 16, align: 'center' });
      if (ratio !== null) text({ value: `${Math.round(ratio * 100)}%`, x: meter.x, y: meter.bottom + 26, size: 13, align: 'center', color: COLORS.dim });
    }
    if (next?.type === 'dynamics') text({ value: `곧 ${next.level}`, x: meter.x, y: meter.top - 54, size: 14, align: 'center', color: COLORS.perfect });
  };

  const drawPopups = ({ popups, now }: Pick<RenderInput, 'popups' | 'now'>) => {
    for (const popup of popups) {
      const age = (now - popup.born) / 1000;
      if (age > POPUP_LIFE) continue;
      g.globalAlpha = 1 - age / POPUP_LIFE;
      text({ value: popup.text, x: popup.at.x, y: popup.at.y - age * 40, size: 24, align: 'center', color: popup.color });
      g.globalAlpha = 1;
    }
  };

  const drawHud = ({ hud, frame }: Pick<RenderInput, 'hud' | 'frame'>) => {
    const { width, height } = stage.size();
    text({ value: hud.score.toLocaleString(), x: 24, y: 40, size: 34 });
    text({ value: `${(hud.accuracy * 100).toFixed(1)}%`, x: 24, y: 76, size: 16, color: COLORS.dim });
    if (hud.combo > 1) text({ value: `${hud.combo} COMBO`, x: 24, y: 104, size: 20, color: COLORS.perfect });

    const offset = hud.beatOffsetMs === null ? '—' : `${hud.beatOffsetMs > 0 ? '+' : ''}${hud.beatOffsetMs}ms`;
    text({ value: hud.difficulty.toUpperCase(), x: width - 24, y: 40, size: 18, align: 'right', color: COLORS.perfect });
    text({ value: `지연 보정 ${hud.latencyMs}ms  [ ]`, x: width - 24, y: 66, size: 13, align: 'right', color: COLORS.dim, weight: 500 });
    text({ value: `박 평균 오차 ${offset}`, x: width - 24, y: 86, size: 13, align: 'right', color: COLORS.dim, weight: 500 });

    if (!frame?.right) {
      text({ value: '오른손이 안 보여요', x: width / 2, y: height * 0.12, size: 20, align: 'center', color: COLORS.miss });
    }
    if (hud.countIn !== null) {
      text({ value: String(hud.countIn), x: width / 2, y: height * 0.42, size: 120, align: 'center', color: COLORS.perfect });
      text({ value: '오른손으로 박을 저어 보세요', x: width / 2, y: height * 0.42 + 90, size: 20, align: 'center' });
    }
    if (hud.debug) {
      const lines = [
        `왼손 포즈: ${frame?.left?.pose ?? '-'}`,
        `동작 크기: ${frame?.dynamics?.amplitude.toFixed(3) ?? '-'} (${frame?.dynamics?.dynamic ?? '-'})`,
        `오른손: ${frame?.right ? `${frame.right.palm.x.toFixed(2)}, ${frame.right.palm.y.toFixed(2)}` : '-'}`,
      ];
      lines.forEach((line, i) => text({ value: line, x: 24, y: 140 + i * 20, size: 13, color: COLORS.dim, weight: 500 }));
    }
  };

  return {
    render: (input: RenderInput) => {
      stage.beginFrame(input);
      drawZones(input);
      drawTargets(input);
      stage.drawHands(input);
      drawLanes(input);
      drawHoldStatus(input);
      drawDynamics(input);
      drawPopups(input);
      drawHud(input);
    },
    toScreen,
    /** 판정 팝업 위치 계산용 */
    anchors: () => {
      const { width, height } = stage.size();
      const { beatY, leftY, hitX } = laneGeometry();
      return {
        beat: { x: hitX, y: beatY - 50 },
        left: { x: hitX + 40, y: leftY - 50 },
        dynamics: { x: width - 80, y: height * 0.68 },
        zone: (zone: Zone) => ({ x: toScreen({ x: ({ left: 1, center: 3, right: 5 } as const)[zone] / 6, y: 0 }).x, y: height * 0.36 }),
      };
    },
    judgmentText: JUDGMENT_TEXT,
    judgmentColor: { perfect: COLORS.perfect, good: COLORS.good, miss: COLORS.miss } as Record<Judgment, string>,
  };
};

export type Renderer = ReturnType<typeof createRenderer>;
