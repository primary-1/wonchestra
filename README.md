# Wonchestra

웹캠 손 트래킹(MediaPipe Hands)으로 오케스트라를 지휘하는 리듬게임. 오른손으로 박을 찍고, 동작 크기로 셈여림을 조절하고, 왼손으로 파트에 큐를 줘요.

A conducting rhythm game in the browser: beat time with your right hand, shape dynamics with the size of your gestures, and cue orchestra sections with your left hand — all tracked from a webcam.

**바로 해보기: https://wonchestra.xhajtm54.workers.dev** (웹캠 필요, 데스크톱 Chrome 권장)

설계는 [docs/design.md](docs/design.md) 참고.

## 실행

Node 22+, pnpm, 웹캠이 필요해요.

```bash
pnpm install        # postinstall이 MediaPipe wasm 복사 + 손 인식 모델 다운로드
pnpm dev            # http://localhost:5173
```

카메라와 소리가 필요해서 브라우저 권한을 허용해야 해요. 악기 소리는 처음 시작할 때 인터넷에서 받아요.

## 튜토리얼

메뉴의 "튜토리얼"로 8단계를 직접 따라 하며 배워요. 손 보여주기 → 박 찍기 → 메트로놈 맞추기 → 셈여림 → 타겟 → 파트 큐 → 홀드 → 컷오프 순서예요. 좌우 손이 반대로 잡히면 1단계에서 자동으로 바로잡고, 3단계에서 잰 박 오차로 지연 보정을 자동 설정해요. `→` 건너뛰기, `Esc` 나가기.

## 곡 추가

```bash
mkdir public/songs/<id> && cp 곡.mid public/songs/<id>/song.mid
pnpm chart public/songs/<id>/song.mid --title "곡 제목"
```

`chart.json`이 자동으로 만들어지고 `public/songs/index.json` 목록에 추가돼. 노트 위치나 난이도(`difficulties`)는 `chart.json`에서 직접 고쳐도 돼. 고정 템포만 지원해서, 템포가 바뀌는 MIDI는 첫 템포로 처리해.

데모 곡(환희의 송가)을 다시 만들려면 `pnpm demo-midi` 다음에 `pnpm chart public/songs/ode-to-joy/song.mid --title "환희의 송가" --force`.

## 조작

| 키 | 기능 |
|---|---|
| `[` `]` | 지연 보정 ±10ms. 우상단 "박 평균 오차"가 0 근처가 되게 맞추기 |
| `H` | 왼손/오른손이 반대로 잡힐 때 뒤집기 |
| `D` | 디버그 정보 (왼손 포즈, 동작 크기) |
| `→` | 튜토리얼 단계 건너뛰기 |
| `Esc` | 메뉴로 |

튜닝 값(박 감지 민감도, 셈여림 기준, 판정 범위)은 전부 `src/config.ts`에 있어.

## 배포

Cloudflare Workers 정적 자산으로 배포해요 (`wrangler.jsonc`).

```bash
pnpm exec wrangler login   # 처음 한 번
pnpm run deploy            # 빌드 + 배포
```

## 테스트

```bash
pnpm test
```

## 사용한 것들

| 무엇 | 출처 | 라이선스 |
|---|---|---|
| 손 인식 | [MediaPipe Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker) (설치 때 다운로드) | Apache-2.0 |
| 악기 소리 | [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts)의 MusyngKite (실행 중 CDN에서 로드, 재배포 안 함) | CC BY-SA 3.0 |
| 사운드폰트 재생 | [smplr](https://github.com/danigb/smplr) | MIT |
| MIDI 읽기/쓰기 | [@tonejs/midi](https://github.com/Tonejs/Midi) | MIT |
| 데모 곡 | 베토벤 「환희의 송가」 선율 (공개 도메인), `scripts/makeDemoMidi.ts`로 직접 편곡 | — |

## 라이선스

[MIT](LICENSE)
