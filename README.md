# 바다 가두리 낚시터

PC 웹 브라우저에서 돌아가는 도트 방치형 낚시터 타이쿤 게임. 서버 코드 없는 정적 사이트라 GitHub Pages·Cloudflare Pages에 그대로 올라감.

문서: [AGENTS.md](AGENTS.md)(AI 협업 규칙) · [docs/requirements.md](docs/requirements.md) · [docs/design.md](docs/design.md) · [docs/tasks.md](docs/tasks.md) · [docs/progress.md](docs/progress.md)

## 실행
- 로컬: `index.html`을 더블클릭 (설치 불필요)
- 검증: `npm test` (Node.js 18 이상)

## GitHub Pages 배포 (친구들이 URL로 바로 플레이)
1. GitHub에서 새 저장소를 만들고 이 폴더를 올린다
   ```
   git init
   git add .
   git commit -m "first deploy"
   git branch -M main
   git remote add origin https://github.com/<내아이디>/<저장소이름>.git
   git push -u origin main
   ```
2. 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 바꾼다
3. 끝. `main`에 push할 때마다 `.github/workflows/deploy.yml`이 테스트 → `dist/` 빌드 → 배포를 자동으로 한다 (Actions 탭에서 진행 확인, 1~2분)
4. 주소: `https://<내아이디>.github.io/<저장소이름>/` 을 친구에게 보내면 됨

Actions 없이 하려면: Source를 **Deploy from a branch**, 브랜치 `main`, 폴더 `/ (root)`로 두어도 저장소 루트의 `index.html`이 그대로 실행된다(캐시 버전 표시만 빠짐).

## Cloudflare Pages 배포
1. 처음 한 번: `npx wrangler login`
2. `npm run deploy` → `dist/` 빌드 후 업로드 (프로젝트 이름 `seafarm-tycoon`, `wrangler.toml`)
- Git 저장소 연결 시: Build command `node tools/build.js`, Build output directory `dist`
- `dist/_headers`의 캐시·보안 헤더(CSP)는 Cloudflare에서만 적용된다

빌드(`tools/build.js`)는 게임 실행 파일만 `dist/`로 복사하고, css·js 주소에 내용 해시(`?v=`)를 붙여 새 버전이 바로 반영되게 한다.

## 조작
- 맵 이동: 좌클릭 드래그 또는 W·A·S·D (480×270 맵 밖으로는 안 나감) / 확대·축소: 마우스 휠 (1~4배), 오른쪽 위 + · − · 1x 버튼
- 홈: 오른쪽 위 집 모양 버튼 또는 H 키 → 줌 1배·기본 위치로 즉시 복귀
- 사장님 낚시: 버튼 또는 스페이스바 / **자동 낚시** 버튼으로 켜면 30초마다 저절로 던지고 꽝 없이 성공
- **원정 파견** 버튼: 1·2·3분 동안 어선을 보내 고래·심해 생물 등 원정 어종(350종)을 얻음 → 교배 재료·수족관 등록에 바로 쓰임 (가두리에선 연안 48종만 낚임)
- 고양이 '나비' 클릭: 생선 주기 (10분간 명성·방문율 상승)
- 밤에 별똥별 클릭: 소원 (30분간 전설·신종 입질 상승)
- 오른쪽 사이드바: 시설 / 업그레이드 / 원정 / 양식장 / VIP / 수족관 / 도감 / 후기 / 설정. 위쪽 버튼으로 비밀 양식장·VIP·수족관 바로 열기, 오른쪽 위 `>` 버튼으로 접기

## 맵 (480×270, 16:9)
- 왼쪽 육지: 위 줄 매점·대여점·횟집(짓기 전엔 빈 땅) / 큰길 / 아래 줄 매표소(입구)·수족관 건물 / 아랫길 → 선착장
- 바다: 큰길이 나무 다리로 이어지고 위·아래로 목재 좌대 3개씩(최대 36석 표시), 위쪽에 투어선·양식장·VIP 비밀 양식장, 오른쪽 끝 해상 펜션
- 셔틀 여객선이 오른쪽에서 들어와 선착장에 정박
- 손님은 매표소나 정박한 여객선에서 내려, 길 그래프의 최단 경로(다익스트라)로 자리까지 6초 동안 걸어가고, 끝나면 걸어서 나감

## 폴더 구성
- `index.html` — 게임 화면
- `css/style.css` — 디자인 / `css/font.css` — 도트 글꼴 Galmuri (SIL OFL 1.1, `css/Galmuri-OFL.txt`)
- `js/data.js` — 시설·업그레이드·48종·VIP·교배 계열·레시피 수치표 (밸런스 조정은 여기)
- `js/species-manager.js` — 원정 350종: 구역 해금·어종 풀·희귀도별 드랍·방치 DPS
- `js/species-data.js` — 350종 데이터 (자동 생성, 직접 고치지 않음)
- `js/breeding.js` — BreedingManager: 교배 경로·신종 도감·힌트
- `js/logic.js` — 게임 규칙 (손님·낚시·수익·저장·오프라인 보상)
- `js/sprites.js` — 도트 그림 (사람·물고기·아이콘)
- `js/render.js` — 바다 장면 (레이어·카메라·길찾기·건물·배)
- `js/sound.js` — Web Audio로 합성하는 로파이 BGM·파도·효과음 (첫 클릭 뒤 재생)
- `js/ui.js` — 사이드바 / `js/main.js` — 시작·루프·저장·입력
- `data/korean_fishing_350_species.json` — 350종 원본, `data/size-overrides.json` — 고래·대형 어종 실제 크기
- `tools/` — 빌드·데이터·테스트·밸런스 도구
- `기획서.md` — 게임 기획서

## 명령어 (Node.js 필요)
| 명령 | 하는 일 |
|---|---|
| `npm run data` | 크기 덮어쓰기 반영 후 350종 데이터 다시 생성 |
| `npm test` | 원정 매니저 11개 + 교배 11개 검증 |
| `npm run sim` | 탐욕 봇 2시간 밸런스 시뮬레이션 |
| `npm run build` | `dist/` 배포 빌드 |
| `npm run deploy` | 빌드 후 Cloudflare Pages 배포 |

## 주요 시스템
- **원정 낚시 (350종)**: "원정 낚시꾼" 고용 + 구역 6곳 해금 → 수익·방치 보상에 합산, 원정 도감 1종당 +0.5%
- **VIP 단골 호감도**: 별 4개 이상 손님 일부가 단골(최대 12명). Lv5 팁+20%·고급 좌대, Lv10 비밀 양식장 좌대·이용료 20배
- **비밀 양식장 교배**: 같은 어종 → 대형 특수 → 초대형 → 전설의 / 같은 계열 다른 종 → 계열 대표종(22) / 레시피 계열 조합 → 이색 신종(22, 다수 거대화). 신종은 VIP 전용 좌대에서만 낚임
- **신종 도감 힌트**: 미발견 칸은 검은 실루엣 + 수수께끼 → 재료 계열 하나 → 두 계열. 힌트는 구매하거나 관련 계열로 실험하면 열림
- **수족관**: 희귀·전설 최대 6마리 등록 → 육지 수족관 건물 창과 수족관 탭 화면에서 헤엄 + 전체 매출 버프
- **크기**: 고래·대형 상어·대왕오징어·심해 미지 생물은 `data/size-overrides.json`의 실제 크기(최대 33m). 거대 신종은 최소 15m 보장, 10m 이상은 m 단위로 표기
