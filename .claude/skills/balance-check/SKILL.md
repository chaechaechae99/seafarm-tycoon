---
name: balance-check
description: "게임 경제·성장 곡선의 이상치, 막힌 구간, 퇴화 전략(무한 루프·압도적 선택지)을 찾는다. '밸런스 점검', 'balance check'."
---

<!-- 원본: Donchitos/Claude-Code-Game-Studios .claude/skills/balance-check (MIT). 훅·레지스트리 의존을 빼고 이 프로젝트용으로 줄임. -->

# Balance Check (바다 가두리 낚시터용)

## 0. 데이터가 없으면 "평가 안 됨"
읽을 입력(js/data.js, js/logic.js, tools/sim.js 결과)을 FOUND/ABSENT로 적는다. 없는 입력에 대한 항목은 추정하지 말고 `NOT ASSESSED`로 둔다.

## 1. 입력
- 수치: `js/data.js` (FACILITIES r·base, PRICE knee·soft, UPGRADES, DIAMOND, AUCTION, PRESTIGE)
- 공식: `js/logic.js` (costOf, expectedRate, msMult, passivePerSec, incomeMult)
- 목표: `docs/requirements.md`, `docs/design.md`의 페이싱 목표
- 실측: `node tools/sim.js 7200` (탐욕 봇 10분 단위 표)

## 2. 점검 항목
**경제**
- 재화 수입원(faucet)과 소모처(sink)를 흐름으로 나열하고, 소모처가 수입 증가 속도를 따라가는지 확인
- 무한 루프(구매 → 수입 증가 → 더 싼 구매)가 생기지 않는지
- 한 번도 살 가치가 없는 시설·업그레이드가 있는지 (sim 구매 기록에 0회)
- 10개 묶음 가격이 한 단계 수입 증가보다 지나치게 빨리 오르는지 (가격 ×배율 vs 초당 수익 ×배율)

**성장**
- 30·60·120분 초당 수익을 목표와 비교. 이전 실행보다 5배 넘게 뛰면 폭주로 본다
- 구매 사이 대기 중앙값이 너무 길거나(막힘) 0초에 가까운지(무의미)
- 해금 시각이 10~20분 간격을 유지하는지

**뽑기·다이아**
- 등급별 기대 획득 시간, 중복 보상, 다이아 수입(업적) 대비 소모처 가격

## 3. 출력
```
## Balance Check: [시스템]
### 읽은 데이터
### 상태: NOT ASSESSED / HEALTHY / CONCERNS / CRITICAL
### 이상치 | 값 | 기대 범위 | 실제 | 문제 |
### 퇴화 전략
### 성장 곡선 (sim 표 요약)
### 조정 제안 (data.js 값만, 한 줄 근거)
```
수치를 바꿨으면 sim을 다시 돌려 전후를 같이 보여준다.
