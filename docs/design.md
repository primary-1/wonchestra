# Wonchestra 설계

웹캠 손 트래킹으로 오케스트라를 지휘하는 리듬게임.

## 결정 사항

| 항목 | 결정 |
|---|---|
| 트래킹 | MediaPipe Hands (`@mediapipe/tasks-vision` HandLandmarker, VIDEO 모드, 손 2개) |
| 소리 | MIDI(`@tonejs/midi`) + GM 사운드폰트(`smplr` Soundfont, MusyngKite) |
| 템포 | 고정 템포 + 판정. 음악은 플레이어를 따라오지 않음 |
| 게임 구조 | 한 곡 안에 모든 메카닉을 섞음. 난이도가 오를수록 섞이는 메카닉이 늘어남 |
| 채보 | MIDI에서 자동 생성 → `chart.json`으로 저장 → 손으로 수정 가능 |
| 곡 | 공개 도메인 곡(데모: 베토벤 「환희의 송가」)을 스크립트로 직접 편곡한 MIDI |

## 손 역할

실제 지휘자처럼 나눔.

- 오른손: 박자(1번), 셈여림(3번), 타겟(6번)
- 왼손: 파트 큐(4번, 가리키기), 컷오프/홀드(5번, 주먹/손바닥)

## 메카닉과 판정

| 노트 | 입력 | 판정 |
|---|---|---|
| `beat` | 오른손이 내려오다 방향을 바꾸는 순간(ictus) | ±70ms Perfect, ±150ms Good |
| `dynamics` | 오른손 동작 크기 (최근 1초 궤적 범위) | 구간 동안 목표 세기(p/mf/f)를 유지한 시간 비율 |
| `cue` | 왼손 검지로 해당 파트 구역(좌/중/우) 가리키기 | 시점 ±400ms 안에 가리키면 성공 |
| `cutoff` | 왼손 주먹 | 시점 ±250ms |
| `hold` | 왼손 손바닥 펴고 유지 | 구간 동안 유지한 시간 비율 |
| `target` | 오른손이 화면의 원을 통과 | ±150ms 안에 원 안에 있으면 성공 |

셈여림은 실제 소리에도 반영돼. 동작이 작으면 음악이 작아짐. 큐를 놓치면 그 파트가 작게 들림.

## 난이도

| 난이도 | 포함 노트 |
|---|---|
| easy | 마디 첫 박 `beat`, `target`(4마디마다) |
| normal | 모든 `beat`, `dynamics`, `cue`, `target` |
| hard | normal + `cutoff`, `hold`, `target`(2마디마다) |

## 채보 자동 생성 규칙

- beat: 템포/박자표에서 모든 박
- cue: 트랙이 2마디 이상 쉬다가 들어오는 시점. 파트 구역은 악기군으로 결정 (현악=좌, 목관/타악=중, 금관=우). 1박 안에 겹치면 다음 마디 셈여림이 가장 큰 것 하나만
- dynamics: 마디별 평균 velocity → p(<60) / mf(<88) / f. 같은 세기 마디를 묶고 2마디 미만 구간은 앞 구간에 합침
- hold: 3박 이상 새 음이 하나도 시작되지 않는데 소리는 나고 있는 구간
- cutoff: 곡 끝(마지막 음이 끝나는 시점)
- target: 4/4 지휘 도형 위치(1박 아래, 2박 안쪽, 3박 바깥, 4박 위)에 한 마디씩
- 왼손 노트(cutoff/hold)와 1박 이내로 겹치는 cue는 제거

## 튜토리얼

카메라로 직접 따라 해야 넘어가는 8단계. 단계 판정은 `src/tutorial/steps.ts`의 순수 로직(테스트 있음).

| 단계 | 통과 조건 | 덤 |
|---|---|---|
| 손 보여주기 | 두 손 1초 | 오른손이 화면 왼쪽에 0.5초 있으면 좌우 설정 자동 반전 |
| 박 찍기 | 박 4번 | |
| 메트로놈 | 90 BPM 박에 ±300ms 이내 8번 | 오차 중앙값(0~300ms)을 지연 보정으로 저장 |
| 셈여림 | f 2초 → p 2초 | |
| 타겟 | 원 3개 차례로 (타이밍 없음) | |
| 파트 큐 | 오른쪽 → 왼쪽 → 가운데 구역을 0.3초씩 가리키기 | |
| 홀드 | 손바닥 2초 연속 | |
| 컷오프 | 주먹 | |

튜토리얼은 지연 보정을 빼지 않은 오디오 시계로 입력을 받음. 그래서 메트로놈 단계에서 잰 오차가 곧 전체 지연값.

## 구조

```
src/
  tracking/   handTracker(MediaPipe), oneEuroFilter
  input/      beatDetector, dynamicsMeter, handPose, conductor(합쳐서 프레임별 입력 상태)
  chart/      types, generateChart(순수 함수), instruments(GM 매핑, 악기군)
  audio/      orchestra(사운드폰트 로딩, 스케줄링, 파트/전체 볼륨), clock(들리는 소리 기준 시계), sfx(메트로놈, 효과음)
  game/       judge(순수 판정), session(게임 루프, 시간 관리)
  render/     stage(공통 그리기), renderer(게임 화면), tutorialRenderer(튜토리얼 화면)
  tutorial/   steps(단계 판정, 순수 함수), tutorialSession(루프)
scripts/      makeDemoMidi(데모 곡 생성), makeChart(MIDI → chart.json)
public/songs/<id>/  song.mid, chart.json
```

## 지연 보정

오디오 출력 지연은 `getOutputTimestamp`로 오디오 시계가 따로 보정하고, 카메라 + 인식 지연은 `latency`(기본 80ms, 튜토리얼에서 자동 측정)로 빼고 판정. 게임 중 `[` `]` 키로 10ms씩 조절하고, 최근 박자 평균 오차를 화면에 보여줘서 맞추기 쉽게 함.
