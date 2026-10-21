# 설계

## 모듈 (불러오는 순서)
| 파일 | 역할 | DOM |
|---|---|---|
| `js/data.js` | 모든 수치·이름·문구 (시설, 어종 48, VIP, 교배 계열·레시피, 파견) | 없음 |
| `js/species-manager.js` | 350종 검증, 구역 배정, 희귀도별 드랍표, 방치 DPS, 오프라인 원정 | 없음 |
| `js/species-data.js` | 350종 (빌드 생성물) | 없음 |
| `js/breeding.js` | BreedingManager: 교배 경로, 결과 생성, 신종 도감·힌트, 저장 이전 | 없음 |
| `js/logic.js` | 게임 상태·틱·손님·수익·VIP·수족관·파견·자동 낚시·저장 | 없음 |
| `js/sprites.js` | 문자열 도트 → 캔버스, 체형 11개 × 색으로 350종·신종 생성, 4프레임 | 캔버스 |
| `js/render.js` | 9개 레이어, 카메라, 길 그래프(다익스트라), 건물·배·좌대, 연출 | 캔버스 |
| `js/sound.js` | Web Audio 합성 BGM·환경음·효과음 | 오디오 |
| `js/ui.js` · `js/main.js` | 사이드바·팝업 / 시작·루프·입력·저장 | DOM |

로직 3개 파일은 Node에서 그대로 `require`해 `tools/*-test.js`, `tools/sim.js`로 검증한다.

## 데이터 흐름
- 350종: `data/korean_fishing_350_species.json` → `tools/patch-sizes.js`가 `data/size-overrides.json`(고래 24~33m 등 52종)을 덮어씀 → `tools/build-species.js`가 검증 후 `js/species-data.js` 생성
- 교배 크기: 결과 크기 = 큰 부모 크기 × 레시피 `sizeMult`, 거대종은 `BREED_SIZE.giantFloor`(8~15m) 이상

## 렌더 레이어
sky → far(원정선·파견선) → water(물결 4프레임·반사) → land(잔디·해안 거품·돌길) → stage(건물·다리·좌대·배) → actors(걷는 손님·사장님·고양이) → fx → weather → lighting(밤 광원 가산 합성). 글자는 고해상도로 덧그림.

## 동선
노드: 매표소·골목·선착장·여객선 발판·다리·좌대 발판 모서리·좌석. 손님은 생성 시 자리를 예약하고 `WALK_IN`(6초) 동안 경로 위를 걷는다(이동 중엔 낚시 안 함). 퇴장은 좌석 → 매표소 또는 여객선.

## 배포
`tools/build.js` → `dist/`(파일 해시 캐시, `_headers` CSP, `.nojekyll`) → Cloudflare Pages(`wrangler.toml`) 또는 GitHub Pages(`.github/workflows/pages.yml`).
