# AGENTS.md — AI 협업 규칙

이 저장소에서 AI 도구(Claude Code 등)가 작업할 때 지키는 규칙.

## 절대 규칙
1. **이모지 금지**: 코드, UI 문자열, 데이터, 문서, 커밋 메시지 어디에도 이모지를 쓰지 않는다. 아이콘은 `js/sprites.js`의 도트 아이콘(ICONS)이나 텍스트(`[잠김]`, `[NEW]`)로 표현한다.
2. **해상도 고정**: 게임 월드는 480×270(16:9) 고정. `js/render.js`의 `W`, `H`를 바꾸지 않는다. 확대는 카메라 줌(1~4배)으로만 한다.
3. **Data-Logic 분리**: 수치·이름·문구는 `js/data.js`(와 `data/*.json`)에만 둔다. `js/logic.js`·`js/breeding.js`·`js/species-manager.js`는 DOM을 쓰지 않는 순수 로직(Node에서 테스트 가능). 그리기는 `render.js`·`sprites.js`, 화면 패널은 `ui.js`만 담당한다.
4. **게임 본체만**: 랜딩·홍보 페이지를 만들지 않는다. 산출물은 `index.html` 하나로 실행되는 PC 웹 게임.
5. **외부 요청 없음**: CDN·외부 폰트·API 호출 금지(배포 CSP가 막음). 소리는 `js/sound.js`의 Web Audio 합성만 쓴다.

## 작업 방식
- 수정 후 `npm test`(검증 22개)와 `npm run sim`(밸런스) 결과를 확인한다.
- 350종 데이터는 `data/korean_fishing_350_species.json`과 `data/size-overrides.json`을 고친 뒤 `npm run data`로 `js/species-data.js`를 다시 만든다. 생성 파일을 직접 고치지 않는다.
- 저장 형식을 바꾸면 `logic.js`의 `deserialize`(와 `BreedingManager.migrate`)에서 예전 저장을 받아준다.
- 코드 스타일: 블록은 항상 중괄호, 2칸 들여쓰기, 한국어 주석은 "왜"를 적는다.
