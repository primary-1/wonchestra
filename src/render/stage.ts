import { CONFIG } from '../config';
import type { DynamicLevel, Zone } from '../chart/types';
import type { ConductorFrame } from '../input/conductor';
import type { Landmark } from '../tracking/landmarks';
import type { Point } from '../tracking/oneEuroFilter';

export const COLORS = {
  right: '#4fd1ff',
  left: '#ff6bd6',
  perfect: '#ffd166',
  good: '#7bdff2',
  miss: '#ff5c7a',
  text: '#f5f3ff',
  dim: 'rgba(245, 243, 255, 0.45)',
  lane: 'rgba(12, 10, 30, 0.72)',
};

export const ZONE_LABEL: Record<Zone, string> = { left: '현악', center: '목관 · 타악', right: '금관' };

const ZONES: Zone[] = ['left', 'center', 'right'];

const HAND_BONES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

/** 게임과 튜토리얼이 같이 쓰는 캔버스 그리기 도구 */
export const createStage = ({ canvas }: { canvas: HTMLCanvasElement }) => {
  const g = canvas.getContext('2d')!;
  let width = 0;
  let height = 0;
  /** 비디오 정규화 좌표 → 화면 픽셀 (cover 맞춤) */
  let view = { x: 0, y: 0, w: 1, h: 1 };

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);

  const toScreen = (p: Point): Point => ({ x: view.x + p.x * view.w, y: view.y + p.y * view.h });

  const text = ({ value, x, y, size, color = COLORS.text, align = 'left', weight = 700 }: {
    value: string; x: number; y: number; size: number; color?: string; align?: CanvasTextAlign; weight?: number;
  }) => {
    g.font = `${weight} ${size}px "Pretendard", "Apple SD Gothic Neo", system-ui, sans-serif`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.fillStyle = color;
    g.fillText(value, x, y);
  };

  /** maxWidth에 맞춰 줄을 나눠 그림. 그린 줄 수를 돌려줌 */
  const paragraph = ({ value, x, y, maxWidth, size, lineHeight = size * 1.5, color = COLORS.text, align = 'center', weight = 500 }: {
    value: string; x: number; y: number; maxWidth: number; size: number; lineHeight?: number; color?: string; align?: CanvasTextAlign; weight?: number;
  }) => {
    g.font = `${weight} ${size}px "Pretendard", "Apple SD Gothic Neo", system-ui, sans-serif`;
    const lines: string[] = [];
    let line = '';
    for (const word of value.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && g.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    lines.forEach((l, i) => text({ value: l, x, y: y + i * lineHeight, size, color, align, weight }));
    return lines.length;
  };

  /** 화면을 지우고 거울 모드 카메라 영상을 어둡게 깔기 */
  const beginFrame = ({ video }: { video: HTMLVideoElement }) => {
    const vw = video.videoWidth || 16;
    const vh = video.videoHeight || 9;
    const scale = Math.max(width / vw, height / vh);
    view = { w: vw * scale, h: vh * scale, x: (width - vw * scale) / 2, y: (height - vh * scale) / 2 };

    g.clearRect(0, 0, width, height);
    g.save();
    g.translate(width, 0);
    g.scale(-1, 1);
    g.drawImage(video, width - view.x - view.w, view.y, view.w, view.h);
    g.restore();
    g.fillStyle = 'rgba(8, 6, 24, 0.6)';
    g.fillRect(0, 0, width, height);
  };

  const zoneBounds = ({ zone }: { zone: Zone }) => {
    const i = ZONES.indexOf(zone);
    return { x0: toScreen({ x: i / 3, y: 0 }).x, x1: toScreen({ x: (i + 1) / 3, y: 0 }).x };
  };

  /** 세 파트 구역: 구분선, 이름, 가리키는 구역 강조 */
  const drawZones = ({ pointing }: { pointing: Zone | null }) => {
    ZONES.forEach((zone, i) => {
      const { x0, x1 } = zoneBounds({ zone });
      if (pointing === zone) {
        g.fillStyle = 'rgba(255, 107, 214, 0.12)';
        g.fillRect(x0, 0, x1 - x0, height);
      }
      if (i > 0) {
        g.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x0, 0);
        g.lineTo(x0, height);
        g.stroke();
      }
      text({ value: ZONE_LABEL[zone], x: (x0 + x1) / 2, y: 28, size: 15, align: 'center', color: COLORS.dim, weight: 500 });
    });
  };

  /** 큐를 기다리는 구역: 아래에서 차오르는 빛 + 원형 진행 표시 */
  const drawCueZone = ({ zone, progress, label }: { zone: Zone; progress: number; label: string }) => {
    const { x0, x1 } = zoneBounds({ zone });
    const grad = g.createLinearGradient(0, height, 0, height * (1 - progress));
    grad.addColorStop(0, `rgba(255, 107, 214, ${0.35 * progress})`);
    grad.addColorStop(1, 'rgba(255, 107, 214, 0)');
    g.fillStyle = grad;
    g.fillRect(x0, 0, x1 - x0, height);

    const cx = (x0 + x1) / 2;
    const cy = height * 0.22;
    g.strokeStyle = COLORS.left;
    g.lineWidth = 4;
    g.beginPath();
    g.arc(cx, cy, 46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    g.stroke();
    text({ value: '👉', x: cx, y: cy, size: 38, align: 'center' });
    text({ value: label, x: cx, y: cy + 74, size: 26, align: 'center', color: COLORS.left });
  };

  /** 타겟 원. approach는 다가오는 링 크기 (0이면 원과 딱 겹침, null이면 링 없음) */
  const drawTarget = ({ point, label, approach, alpha = 1 }: { point: Point; label: string; approach: number | null; alpha?: number }) => {
    const radius = CONFIG.judge.targetRadius * view.h;
    const p = toScreen(point);
    g.globalAlpha = alpha;
    g.fillStyle = 'rgba(79, 209, 255, 0.18)';
    g.strokeStyle = COLORS.right;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(p.x, p.y, radius, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    if (approach !== null) {
      g.lineWidth = 2;
      g.beginPath();
      g.arc(p.x, p.y, radius * (1 + approach), 0, Math.PI * 2);
      g.stroke();
    }
    text({ value: label, x: p.x, y: p.y, size: radius * 0.8, align: 'center' });
    g.globalAlpha = 1;
  };

  const drawHand = ({ landmarks, color }: { landmarks: Landmark[]; color: string }) => {
    const pts = landmarks.map(toScreen);
    g.strokeStyle = color;
    g.lineWidth = 3;
    g.globalAlpha = 0.85;
    for (const [a, b] of HAND_BONES) {
      g.beginPath();
      g.moveTo(pts[a].x, pts[a].y);
      g.lineTo(pts[b].x, pts[b].y);
      g.stroke();
    }
    g.fillStyle = color;
    for (const p of pts) {
      g.beginPath();
      g.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  };

  /** 두 손 뼈대 + 오른손 손바닥 점 + 궤적 */
  const drawHands = ({ frame, trail }: { frame: ConductorFrame | null; trail: Point[] }) => {
    if (trail.length > 1) {
      g.strokeStyle = COLORS.right;
      g.lineCap = 'round';
      for (let i = 1; i < trail.length; i++) {
        const a = toScreen(trail[i - 1]);
        const b = toScreen(trail[i]);
        g.globalAlpha = i / trail.length;
        g.lineWidth = 2 + (6 * i) / trail.length;
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    if (frame?.right) {
      drawHand({ landmarks: frame.right.landmarks, color: COLORS.right });
      const palm = toScreen(frame.right.palm);
      g.fillStyle = COLORS.right;
      g.beginPath();
      g.arc(palm.x, palm.y, 9, 0, Math.PI * 2);
      g.fill();
    }
    if (frame?.left) drawHand({ landmarks: frame.left.landmarks, color: COLORS.left });
  };

  /** 오른쪽 세로 셈여림 미터. goal 칸을 노랗게 칠함 */
  const drawDynamicsMeter = ({ amplitude, goal, matched }: { amplitude: number; goal: DynamicLevel | null; matched: boolean }) => {
    const { dynamics: cfg } = CONFIG;
    const barX = width - 46;
    const top = height * 0.2;
    const bottom = height * 0.62;
    const yFor = (amp: number) => bottom - (Math.min(amp, cfg.maxAmplitude) / cfg.maxAmplitude) * (bottom - top);
    const band: Record<DynamicLevel, [number, number]> = { p: [0, cfg.mfFrom], mf: [cfg.mfFrom, cfg.fFrom], f: [cfg.fFrom, cfg.maxAmplitude] };

    g.fillStyle = COLORS.lane;
    g.fillRect(barX - 14, top - 10, 28, bottom - top + 20);
    if (goal) {
      const [lo, hi] = band[goal];
      g.fillStyle = 'rgba(255, 209, 102, 0.3)';
      g.fillRect(barX - 14, yFor(hi), 28, yFor(lo) - yFor(hi));
    }
    for (const level of ['p', 'mf', 'f'] as const) {
      const [lo, hi] = band[level];
      text({ value: level, x: barX - 22, y: (yFor(lo) + yFor(hi)) / 2, size: 15, align: 'right', color: COLORS.dim, weight: 600 });
    }
    g.fillStyle = matched ? COLORS.perfect : COLORS.right;
    g.fillRect(barX - 8, yFor(amplitude), 16, bottom - yFor(amplitude));
    return { x: barX, top, bottom };
  };

  const progressBar = ({ x, y, w, ratio, color }: { x: number; y: number; w: number; ratio: number; color: string }) => {
    g.fillStyle = 'rgba(255,255,255,0.15)';
    g.fillRect(x, y, w, 8);
    g.fillStyle = color;
    g.fillRect(x, y, w * Math.min(1, Math.max(0, ratio)), 8);
  };

  return {
    g,
    size: () => ({ width, height }),
    toScreen,
    text,
    paragraph,
    beginFrame,
    drawZones,
    drawCueZone,
    drawTarget,
    drawHands,
    drawDynamicsMeter,
    progressBar,
  };
};

export type Stage = ReturnType<typeof createStage>;
