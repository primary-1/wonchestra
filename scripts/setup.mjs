// 설치 후 준비: MediaPipe wasm을 public으로 복사하고, 손 인식 모델이 없으면 받아둠
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';

const MODEL_PATH = 'public/models/hand_landmarker.task';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task';

mkdirSync('public/mediapipe', { recursive: true });
cpSync('node_modules/@mediapipe/tasks-vision/wasm', 'public/mediapipe/wasm', { recursive: true });

if (!existsSync(MODEL_PATH)) {
  mkdirSync('public/models', { recursive: true });
  console.log('손 인식 모델 받는 중…');
  const response = await fetch(MODEL_URL);
  if (!response.ok) throw new Error(`모델 다운로드 실패: ${response.status}`);
  writeFileSync(MODEL_PATH, Buffer.from(await response.arrayBuffer()));
}
