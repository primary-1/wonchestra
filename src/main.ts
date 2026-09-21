import { CONFIG } from './config';
import { createOrchestra, type Orchestra } from './audio/orchestra';
import { songFromMidi } from './chart/midiSong';
import { DIFFICULTIES, type Chart, type ChartNoteType, type Difficulty } from './chart/types';
import type { JudgeSummary } from './game/judge';
import { startSession, type Session, type SessionSettings } from './game/session';
import { createRenderer } from './render/renderer';
import { createStage } from './render/stage';
import { createTutorialRenderer } from './render/tutorialRenderer';
import { createHandTracker, type HandTracker } from './tracking/handTracker';
import { startTutorial, type TutorialSession } from './tutorial/tutorialSession';

type SongEntry = { id: string; title: string; midi: string };
type LoadedSong = { chart: Chart; orchestra: Orchestra };

const SETTINGS_KEY = 'wonchestra.settings';
const TUTORIAL_DONE_KEY = 'wonchestra.tutorialDone';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const video = $<HTMLVideoElement>('camera');
const menu = $('menu');
const result = $('result');
const songSelect = $<HTMLSelectElement>('song');
const startButton = $<HTMLButtonElement>('start');
const tutorialButton = $<HTMLButtonElement>('tutorial');
const status = $('status');
const stage = createStage({ canvas: $<HTMLCanvasElement>('stage') });
const renderer = createRenderer({ stage });
const tutorialRenderer = createTutorialRenderer({ stage });

const loadSettings = (): SessionSettings => {
  const defaults: SessionSettings = { difficulty: 'normal', latency: CONFIG.game.defaultLatency, swapHands: false, debug: false };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}'), debug: false };
  } catch {
    return defaults;
  }
};

const saveSettings = () => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // 저장이 막혀 있어도 게임은 됨
  }
};

const settings = loadSettings();
let audioCtx: AudioContext | null = null;
let tracker: HandTracker | null = null;
let session: Session | null = null;
let tutorialSession: TutorialSession | null = null;
let lastSongId: string | null = null;
const loadedSongs = new Map<string, LoadedSong>();

const setStatus = ({ message, isError = false }: { message: string; isError?: boolean }) => {
  status.textContent = message;
  status.classList.toggle('error', isError);
};

const renderDifficulty = () => {
  for (const button of document.querySelectorAll<HTMLButtonElement>('#difficulty button')) {
    button.classList.toggle('active', button.dataset.value === settings.difficulty);
  }
};

const loadSongList = async () => {
  const songs: SongEntry[] = await fetch('/songs/index.json').then((r) => r.json());
  songSelect.innerHTML = songs.map((s) => `<option value="${s.id}" data-midi="${s.midi}">${s.title}</option>`).join('');
};

const ensureCamera = async () => {
  if (video.srcObject) return;
  setStatus({ message: '카메라 켜는 중…' });
  video.srcObject = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
    audio: false,
  });
  await video.play();
};

const ensureTracker = async () => {
  if (tracker) return tracker;
  setStatus({ message: '손 인식 모델 불러오는 중…' });
  tracker = await createHandTracker({ wasmPath: '/mediapipe/wasm', modelPath: '/models/hand_landmarker.task' });
  return tracker;
};

const readFlag = ({ key }: { key: string }) => {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
};

const writeFlag = ({ key }: { key: string }) => {
  try {
    localStorage.setItem(key, '1');
  } catch {
    // 저장이 막혀 있어도 게임은 됨
  }
};

/** 오디오 + 카메라 + 손 인식 준비 (게임·튜토리얼 공통) */
const prepareInput = async () => {
  audioCtx ??= new AudioContext({ latencyHint: 'interactive' });
  await audioCtx.resume();
  await ensureCamera();
  const handTracker = await ensureTracker();
  return { ctx: audioCtx, tracker: handTracker };
};

const describeError = ({ error }: { error: unknown }) =>
  error instanceof DOMException && error.name === 'NotAllowedError'
    ? '카메라 권한이 필요해요. 주소창에서 카메라를 허용해 주세요.'
    : `시작하지 못했어요: ${error instanceof Error ? error.message : String(error)}`;

const ensureSong = async ({ ctx, id }: { ctx: AudioContext; id: string }) => {
  const cached = loadedSongs.get(id);
  if (cached) return cached;

  const midiFile = songSelect.selectedOptions[0]?.dataset.midi ?? 'song.mid';
  setStatus({ message: '곡 불러오는 중…' });
  const [chart, midiData] = await Promise.all([
    fetch(`/songs/${id}/chart.json`).then((r) => r.json() as Promise<Chart>),
    fetch(`/songs/${id}/${midiFile}`).then((r) => r.arrayBuffer()),
  ]);
  const orchestra = await createOrchestra({
    ctx,
    song: songFromMidi({ data: midiData }),
    onProgress: ({ loaded, total }) => setStatus({ message: `악기 소리 불러오는 중… (${loaded}/${total})` }),
  });
  const song = { chart, orchestra };
  loadedSongs.set(id, song);
  return song;
};

const RANKS: [number, string][] = [
  [0.95, 'S'],
  [0.85, 'A'],
  [0.7, 'B'],
  [0.5, 'C'],
  [0, 'D'],
];

const TYPE_LABEL: Record<ChartNoteType, string> = {
  beat: '박자',
  target: '타겟',
  dynamics: '셈여림',
  cue: '파트 큐',
  hold: '홀드',
  cutoff: '컷오프',
};

const showResult = ({ chart, summary }: { chart: Chart; summary: JudgeSummary }) => {
  const accuracy = summary.maxScore > 0 ? summary.score / summary.maxScore : 0;
  $('result-title').textContent = chart.title;
  $('rank').textContent = RANKS.find(([min]) => accuracy >= min)![1];
  $('result-score').textContent = `${summary.score.toLocaleString()}점 · ${(accuracy * 100).toFixed(1)}% · 최대 ${summary.maxCombo} 콤보`;

  const rows = (Object.keys(TYPE_LABEL) as ChartNoteType[])
    .map((type) => ({ type, tally: summary.counts[type] }))
    .filter(({ tally }) => tally.perfect + tally.good + tally.miss > 0)
    .map(({ type, tally }) => `<tr><td>${TYPE_LABEL[type]}</td><td>${tally.perfect}</td><td>${tally.good}</td><td>${tally.miss}</td></tr>`)
    .join('');
  $('result-table').innerHTML = `<tr><th></th><th>Perfect</th><th>Good</th><th>Miss</th></tr>${rows}`;

  result.classList.remove('hidden');
};

const play = async () => {
  const id = songSelect.value;
  if (!id) return;
  startButton.disabled = true;
  try {
    const { ctx, tracker: handTracker } = await prepareInput();
    const { chart, orchestra } = await ensureSong({ ctx, id });

    setStatus({ message: '' });
    menu.classList.add('hidden');
    result.classList.add('hidden');
    lastSongId = id;
    session = startSession({
      chart,
      orchestra,
      tracker: handTracker,
      video,
      renderer,
      settings,
      onEnd: (summary) => {
        session = null;
        showResult({ chart, summary });
      },
    });
  } catch (error) {
    console.error(error);
    setStatus({ message: describeError({ error }), isError: true });
    menu.classList.remove('hidden');
  } finally {
    startButton.disabled = false;
  }
};

const playTutorial = async () => {
  tutorialButton.disabled = true;
  try {
    const { ctx, tracker: handTracker } = await prepareInput();
    setStatus({ message: '' });
    menu.classList.add('hidden');
    result.classList.add('hidden');
    tutorialSession = startTutorial({
      ctx,
      tracker: handTracker,
      video,
      renderer: tutorialRenderer,
      settings,
      onSettingsChange: saveSettings,
      onEnd: ({ latency }) => {
        tutorialSession = null;
        writeFlag({ key: TUTORIAL_DONE_KEY });
        menu.classList.remove('hidden');
        setStatus({ message: `튜토리얼 완료! 지연 보정을 ${Math.round(latency * 1000)}ms로 맞췄어요. 이제 곡을 골라 시작해 보세요.` });
      },
    });
  } catch (error) {
    console.error(error);
    setStatus({ message: describeError({ error }), isError: true });
    menu.classList.remove('hidden');
  } finally {
    tutorialButton.disabled = false;
  }
};

const quitToMenu = () => {
  session?.stop();
  session = null;
  tutorialSession?.stop();
  tutorialSession = null;
  result.classList.add('hidden');
  menu.classList.remove('hidden');
};

$('difficulty').addEventListener('click', (event) => {
  const value = (event.target as HTMLElement).dataset.value as Difficulty | undefined;
  if (!value || !DIFFICULTIES.includes(value)) return;
  settings.difficulty = value;
  saveSettings();
  renderDifficulty();
});

startButton.addEventListener('click', play);
tutorialButton.addEventListener('click', playTutorial);
$('retry').addEventListener('click', () => {
  if (lastSongId) songSelect.value = lastSongId;
  play();
});
$('back').addEventListener('click', quitToMenu);

window.addEventListener('keydown', (event) => {
  if (event.key === '[' || event.key === ']') {
    const step = event.key === '[' ? -0.01 : 0.01;
    settings.latency = Math.round(Math.min(0.4, Math.max(0, settings.latency + step)) * 1000) / 1000;
    saveSettings();
  }
  if (event.key === 'h' || event.key === 'H') {
    settings.swapHands = !settings.swapHands;
    saveSettings();
  }
  if (event.key === 'd' || event.key === 'D') settings.debug = !settings.debug;
  if (event.key === 'Escape' && (session || tutorialSession)) quitToMenu();
  if (event.key === 'ArrowRight') tutorialSession?.skip();
});

// 탭이 숨겨지면 화면 갱신이 멈춰서 음악만 흐르고 판정이 다 놓침 → 판을 끝냄
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && (session || tutorialSession)) quitToMenu();
});

renderDifficulty();
if (!readFlag({ key: TUTORIAL_DONE_KEY })) setStatus({ message: '처음이라면 튜토리얼부터 해보세요. 손 인식과 지연 보정도 같이 맞춰줘요.' });
loadSongList().catch((error) => setStatus({ message: `곡 목록을 못 불러왔어요: ${error}`, isError: true }));
