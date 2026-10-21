/* ============================================================
 * DATA — 수치 테이블 (밸런스 조정은 이 파일만 고치면 됨)
 * ============================================================ */
(function (root) {
  "use strict";

  // 시설: 여러 개 구매 가능. cost(n) = base * r^(n - free)
  const FACILITIES = [
    { id: "seat", name: "가두리 좌대 자리", base: 15, r: 1.15, free: 2,
      desc: "동시에 낚시할 수 있는 손님 +1명" },
    { id: "shop", name: "매점·미끼가게", base: 90, r: 1.16, free: 0, need: { seat: 3 },
      desc: "손님 1명당 매점 매출 +6원" },
    { id: "rental", name: "장비 대여소", base: 450, r: 1.17, free: 0, need: { shop: 1 },
      desc: "방문객 +20%, 입장료 +4원" },
    { id: "restaurant", name: "횟집", base: 2600, r: 1.18, free: 0, need: { rental: 1 },
      desc: "잡은 고기 손질·판매 매출 +5%" },
    { id: "shuttle", name: "셔틀 선박", base: 8000, r: 1.2, free: 0, need: { restaurant: 1 },
      desc: "기본 방문객 +0.08명/초" },
    { id: "pension", name: "해상 펜션 객실", base: 25000, r: 1.15, free: 0, need: { shuttle: 1 },
      desc: "숙박 수입 초당 +60원 (평판에 비례)" },
    { id: "farm", name: "양식장", base: 300000, r: 1.17, free: 0, need: { pension: 1 },
      desc: "방류어 판매 초당 +900원, 가두리 고급 어종 ↑" },
    { id: "crew", name: "원정 낚시꾼", base: 15000, r: 1.15, free: 0, need: { shuttle: 1 },
      desc: "해금한 원정 구역(350종)에서 쉬지 않고 낚시해 수익을 벌어와요" },
  ];

  // 1회성 업그레이드 / 낚시 포인트 해금
  const UPGRADES = [
    { id: "shade", name: "좌대 그늘막", cost: 350, desc: "손님 체류시간 +20%, 만족도 +5" },
    { id: "bait", name: "고급 미끼", cost: 2000, desc: "고급 이상 어종 확률 ×1.5" },
    { id: "sns", name: "SNS 홍보", cost: 3000, desc: "방문객 ×1.5" },
    { id: "boat", name: "선상 낚시 투어", cost: 150000, spot: "boat", desc: "선상 포인트 해금 (열기·방어·참다랑어…)" },
    { id: "fridge", name: "냉장 창고", cost: 40000, desc: "자리 비운 동안 수익 효율 50% → 80%" },
    { id: "typhoon", name: "태풍 대비 보강", cost: 60000, desc: "태풍 때도 절반 영업" },
    { id: "night", name: "야간 집어등", cost: 600000, spot: "night", desc: "밤에도 손님 정상 방문 + 야간 포인트 해금 (한치·갈치·무늬오징어)" },
    { id: "golden", name: "황금 낚싯바늘", cost: 450000, desc: "황금 개체 확률 ×3" },
    { id: "rock", name: "갯바위 포인트 개척", cost: 2500000, spot: "rock", desc: "갯바위 포인트 해금 (돌돔·다금바리…)" },
    { id: "tv", name: "낚시 방송 촬영 유치", cost: 6000000, desc: "프로·유튜버 손님 ×3, 방문객 ×1.2, 입장료 ×1.5" },
    { id: "secret", name: "비밀 양식장", cost: 8000000, needFac: { farm: 1 }, needVip: 10,
      desc: "어종 교배·유전자 변형으로 신종 육성 + VIP 전용 좌대 3석 (호감도 10 VIP 손님이 있어야 공사 가능)" },
    // 원정 구역 (원정 탭에 표시). zone = species-manager의 구역 id
    { id: "z_bay", name: "내만 선착장 원정", cost: 300000, zone: "bay", tab: "exp", desc: "원정 구역 2 · 어종 풀 확장, 어획 가치 ×1.4" },
    { id: "z_offshore", name: "근해 선상 원정", cost: 2000000, zone: "offshore", needUpg: "z_bay", tab: "exp", desc: "원정 구역 3 · 어획 가치 ×2" },
    { id: "z_reef", name: "갯바위·암초 원정", cost: 15000000, zone: "reef", needUpg: "z_offshore", tab: "exp", desc: "원정 구역 4 · 어획 가치 ×3" },
    { id: "z_ocean", name: "외해 원양 원정", cost: 50000000, zone: "ocean", needUpg: "z_reef", tab: "exp", desc: "원정 구역 5 · 어획 가치 ×4.5" },
    { id: "z_abyss", name: "심해 원정", cost: 250000000, zone: "abyss", needUpg: "z_ocean", tab: "exp", desc: "원정 구역 6 · 고래·심해 생물, 어획 가치 ×7" },
  ];

  const RARITY = {
    common: { name: "일반", base: 30, weight: 70, color: "#7a8a99", sat: 3 },
    premium: { name: "고급", base: 150, weight: 24, color: "#2f8f5b", sat: 8 },
    rare: { name: "희귀", base: 1000, weight: 5.5, color: "#2f6fd6", sat: 20 },
    legendary: { name: "전설", base: 12000, weight: 0.4, color: "#c9821b", sat: 40 },
  };
  const RARITY_ORDER = ["common", "premium", "rare", "legendary"];

  const SPOTS = {
    cage: { name: "가두리", weight: 1.0 },
    boat: { name: "선상", weight: 0.7 },
    night: { name: "야간", weight: 0.9 },
    rock: { name: "갯바위", weight: 0.6 },
  };

  // 어종 48종 — 제철은 게임 연출용 근사치
  const A = ["spring", "summer", "autumn", "winter"];
  const FISH = [
    // 일반
    { id: "goby", name: "망둥어", rarity: "common", spots: ["cage"], seasons: ["autumn"], size: [10, 25], v: 0.6 },
    { id: "halfbeak", name: "학꽁치", rarity: "common", spots: ["cage"], seasons: ["autumn", "winter"], size: [20, 40], v: 0.8 },
    { id: "mackerel", name: "고등어", rarity: "common", spots: ["cage"], seasons: ["autumn"], size: [25, 45], v: 1.0 },
    { id: "jack", name: "전갱이", rarity: "common", spots: ["cage"], seasons: ["summer", "autumn"], size: [15, 35], v: 0.9 },
    { id: "rockfish", name: "우럭", rarity: "common", spots: ["cage"], seasons: A, size: [20, 50], v: 1.3 },
    { id: "greenling", name: "노래미", rarity: "common", spots: ["cage"], seasons: ["winter", "spring"], size: [20, 45], v: 1.1 },
    { id: "rockcod", name: "볼락", rarity: "common", spots: ["cage", "night"], seasons: ["winter", "spring"], size: [12, 30], v: 1.2 },
    { id: "filefish", name: "쥐치", rarity: "common", spots: ["cage"], seasons: ["summer", "autumn"], size: [15, 30], v: 1.0 },
    { id: "mullet", name: "숭어", rarity: "common", spots: ["cage"], seasons: ["winter"], size: [30, 70], v: 1.2 },
    { id: "flounder", name: "도다리", rarity: "common", spots: ["cage"], seasons: ["spring"], size: [15, 35], v: 1.4 },
    { id: "shad", name: "전어", rarity: "common", spots: ["cage"], seasons: ["autumn"], size: [15, 30], v: 0.9 },
    { id: "sillago", name: "보리멸", rarity: "common", spots: ["cage"], seasons: ["summer"], size: [15, 30], v: 1.0 },
    { id: "wrasse", name: "용치놀래기", rarity: "common", spots: ["cage"], seasons: ["summer"], size: [10, 25], v: 0.8 },
    { id: "conger", name: "붕장어", rarity: "common", spots: ["cage", "night"], seasons: ["summer", "autumn"], size: [40, 100], v: 1.3 },
    { id: "herring", name: "청어", rarity: "common", spots: ["cage"], seasons: ["winter"], size: [20, 35], v: 1.0 },
    // 고급
    { id: "olive", name: "광어", rarity: "premium", spots: ["cage"], seasons: ["winter", "spring"], size: [35, 90], v: 1.3 },
    { id: "seabass", name: "농어", rarity: "premium", spots: ["cage", "boat"], seasons: ["summer"], size: [40, 100], v: 1.2 },
    { id: "scorpion", name: "쏨뱅이", rarity: "premium", spots: ["rock"], seasons: ["winter"], size: [15, 35], v: 0.8 },
    { id: "redrock", name: "열기", rarity: "premium", spots: ["boat"], seasons: ["winter", "spring"], size: [20, 35], v: 0.9 },
    { id: "webfoot", name: "주꾸미", rarity: "premium", spots: ["boat"], seasons: ["autumn"], size: [10, 25], v: 0.7 },
    { id: "cuttle", name: "갑오징어", rarity: "premium", spots: ["boat"], seasons: ["spring", "autumn"], size: [15, 35], v: 1.0 },
    { id: "squid", name: "한치", rarity: "premium", spots: ["night"], seasons: ["summer"], size: [15, 35], v: 0.9 },
    { id: "hairtail", name: "갈치", rarity: "premium", spots: ["night", "boat"], seasons: ["autumn"], size: [60, 130], v: 1.1 },
    { id: "spanish", name: "삼치", rarity: "premium", spots: ["boat"], seasons: ["autumn", "winter"], size: [50, 100], v: 1.1 },
    { id: "octopus", name: "문어", rarity: "premium", spots: ["boat"], seasons: A, size: [30, 90], v: 1.5 },
    { id: "rabbitfish", name: "독가시치", rarity: "premium", spots: ["rock"], seasons: ["autumn"], size: [20, 40], v: 1.0 },
    { id: "nakji", name: "낙지", rarity: "premium", spots: ["boat", "night"], seasons: ["spring", "autumn"], size: [20, 60], v: 1.2 },
    { id: "jsquid", name: "살오징어", rarity: "premium", spots: ["night"], seasons: ["summer", "autumn"], size: [20, 40], v: 1.0 },
    { id: "crab", name: "꽃게", rarity: "premium", spots: ["cage", "night"], seasons: ["spring", "autumn"], size: [10, 25], v: 1.3 },
    { id: "gurnard", name: "성대", rarity: "premium", spots: ["boat"], seasons: ["winter", "spring"], size: [25, 45], v: 1.0 },
    // 희귀
    { id: "redsnapper", name: "참돔", rarity: "rare", spots: ["cage", "boat"], seasons: ["spring", "autumn"], size: [30, 90], v: 1.2 },
    { id: "blackporgy", name: "감성돔", rarity: "rare", spots: ["rock", "cage"], seasons: ["autumn", "winter"], size: [25, 60], v: 1.1 },
    { id: "opaleye", name: "벵에돔", rarity: "rare", spots: ["rock"], seasons: ["summer", "autumn"], size: [25, 50], v: 1.0 },
    { id: "bigfin", name: "무늬오징어", rarity: "rare", spots: ["night", "rock"], seasons: ["autumn"], size: [20, 50], v: 0.9 },
    { id: "yellowtail", name: "방어", rarity: "rare", spots: ["boat"], seasons: ["winter"], size: [60, 120], v: 1.3 },
    { id: "amberjack", name: "부시리", rarity: "rare", spots: ["boat"], seasons: ["summer", "autumn"], size: [60, 130], v: 1.1 },
    { id: "croaker", name: "민어", rarity: "rare", spots: ["boat"], seasons: ["summer"], size: [50, 110], v: 1.4 },
    { id: "cod", name: "대구", rarity: "rare", spots: ["boat"], seasons: ["winter"], size: [50, 100], v: 1.0 },
    { id: "grouper", name: "능성어", rarity: "rare", spots: ["rock"], seasons: ["summer", "autumn"], size: [40, 90], v: 1.2 },
    { id: "humphead", name: "혹돔", rarity: "rare", spots: ["rock"], seasons: ["summer"], size: [40, 90], v: 1.1 },
    { id: "skate", name: "홍어", rarity: "rare", spots: ["boat"], seasons: ["winter", "spring"], size: [50, 120], v: 1.4 },
    { id: "bonito", name: "가다랑어", rarity: "rare", spots: ["boat"], seasons: ["summer", "autumn"], size: [40, 90], v: 1.0 },
    // 전설
    { id: "knifejaw", name: "돌돔", rarity: "legendary", spots: ["rock", "cage"], seasons: ["summer"], size: [30, 70], v: 1.0 },
    { id: "redgrouper", name: "붉바리", rarity: "legendary", spots: ["rock"], seasons: ["summer"], size: [25, 50], v: 1.2 },
    { id: "longtooth", name: "다금바리", rarity: "legendary", spots: ["rock"], seasons: ["summer"], size: [50, 120], v: 1.5 },
    { id: "tuna", name: "참다랑어", rarity: "legendary", spots: ["boat"], seasons: ["summer", "autumn"], size: [120, 250], v: 2.0 },
    { id: "marlin", name: "청새치", rarity: "legendary", spots: ["boat"], seasons: ["summer"], size: [150, 300], v: 2.2 },
    { id: "jewfish", name: "돗돔", rarity: "legendary", spots: ["night", "rock"], seasons: ["summer"], size: [80, 180], v: 1.8 },
  ];

  const JUNK = [
    { id: "boot", name: "장화" },
    { id: "star", name: "불가사리" },
    { id: "puffer", name: "복어 (방생)" },
    { id: "weed", name: "해초" },
    { id: "can", name: "빈 깡통" },
    { id: "shell", name: "소라 껍데기" },
  ];
  const JUNK_CHANCE = 0.08;
  // 자리가 없어 구경·매점만 이용하는 손님: 입장료의 fee배 + 매점, 전체에 spend배
  const WALKIN = { fee: 0.3, spend: 0.6 };

  // 원정 낚시 (350종, species-manager.js). 낚시꾼 1명 수익 × scale × 마일스톤 배율
  const EXPEDITION = { scale: 1, dexBonus: 0.005 };   // 원정 도감 1종당 전체 수익 +0.5%

  // VIP 단골 손님 호감도
  const VIP = {
    max: 12,               // 단골 명부 최대 인원
    joinChance: 0.15,      // 별 4개 이상 남긴 손님이 단골이 될 확률
    visitPer: 0.03,        // 단골 1명당 '이번 손님이 단골' 확률 (최대 visitCap)
    visitCap: 0.35,
    xp: [0, 2, 5, 9, 14, 20, 27, 35, 44, 54],   // 레벨 1~10에 필요한 누적 호감도
    titles: [[10, "VIP VVIP 손님"], [5, "단골 조사님"], [1, "일반 손님"]],
    tipBase: 0.1,          // 팁 확률 (레벨 5부터 +tipLv5)
    tipLv5: 0.2,
    tipShare: 0.5,         // 팁 = (입장료+매점) × tipShare
    lv5Stay: 1.2,          // 고급 좌대: 체류 ×, 희귀 어종 ×
    lv5Rarity: 1.2,
    feeLv10: 20,           // VIP VVIP 이용료 배수
    secretSeats: 3,        // 비밀 양식장 VIP 전용 좌대
  };

  // 비밀 양식장 교배
  const BREED = {
    time: 60,              // 교배 시간 (초)
    costMult: 40,          // 비용 = 부모 평균 가치 × costMult
    mutateCostMult: 3,     // 유전자 변형 시 비용 ×
    upChance: 0.3,         // 희귀도 한 단계 상승 확률 (유전자 변형 시 +mutateBonus)
    mutateBonus: 0.35,
    valueMult: 1.3,        // 신종 프리미엄
    maxSpecies: 16,
    prefix: ["달빛", "무지개", "황금비늘", "번개", "별무늬", "심연", "용왕", "벚꽃", "에메랄드", "흑진주", "은하", "불꽃"],
    hintSec: [0, 120, 400],   // 힌트 2·3단계 가격 = 초당 수익 × 초 (최소 1,000원)
    logMax: 12,               // 실험 기록 보관 수
  };

  // 교배 계열: 이름 정규식으로 판별 (위에서부터 먼저 맞는 것). champ = 같은 계열 다른 종 교배 결과
  // shape = 도트 체형, giant = 2배 크기로 그림
  const BREED_FAMILIES = [
    { id: "jelly", name: "해파리류", re: "해파리", champ: { name: "왕관해파리", rarity: "rare", v: 1.8, shape: "squid", hint: "투명한 우산들이 모여 왕관을 썼다" } },
    { id: "whale", name: "고래류", re: "고래(?!상어)|벨루가|상괭이", champ: { name: "바다의 왕 대왕고래", rarity: "legendary", v: 2.6, shape: "big", giant: true, hint: "숨 한 번에 파도가 이는, 숨결 중의 숨결" } },
    { id: "shark", name: "상어류", re: "상어", champ: { name: "백상아리 제왕", rarity: "legendary", v: 2.2, shape: "big", hint: "이빨 가진 사냥꾼들이 왕을 뽑았다" } },
    { id: "ray", name: "가오리류", re: "가오리|홍어", champ: { name: "만타 대왕가오리", rarity: "rare", v: 2, shape: "ray", giant: true, hint: "바닷속을 나는 커다란 담요" } },
    { id: "seahorse", name: "해마류", re: "해마", champ: { name: "나뭇잎해룡", rarity: "legendary", v: 2.2, shape: "slim", hint: "말들이 모여 해초 옷을 입은 용이 되었다" } },
    { id: "puffer", name: "복어류", re: "복어|졸복|밀복|까칠복|참복|까치복|황복|개복치", champ: { name: "풍선 대왕복", rarity: "rare", v: 1.8, shape: "fish", giant: true, hint: "화나면 부푸는 녀석들, 이번엔 끝까지 부풀었다" } },
    { id: "octo", name: "문어류", re: "문어|낙지|주꾸미", champ: { name: "대왕문어", rarity: "rare", v: 2, shape: "octo", giant: true, hint: "여덟 팔끼리 모여 열여섯 팔만큼 커졌다" } },
    { id: "squid", name: "오징어류", re: "오징어|한치|꼴뚜기", champ: { name: "심해 대왕오징어", rarity: "legendary", v: 2.2, shape: "squid", giant: true, hint: "열 개의 다리, 빛 없는 곳에서 자란 눈" } },
    { id: "crab", name: "게류", re: "대게|꽃게|돌게|참게|방울게|홍게|박대게", champ: { name: "킹크랩 대왕", rarity: "rare", v: 2, shape: "crab", hint: "옆으로 걷는 무리의 왕은 다리가 더 길다" } },
    { id: "shrimp", name: "새우류", re: "새우|가재", champ: { name: "황제 닭새우", rarity: "rare", v: 1.8, shape: "slim", hint: "굽은 허리들이 모여 왕관 같은 뿔을 세웠다" } },
    { id: "eel", name: "장어류", re: "장어|곰치", champ: { name: "용왕 장어", rarity: "rare", v: 2, shape: "eel", giant: true, hint: "길고 미끄러운 것끼리 엮이니 끝이 안 보인다" } },
    { id: "cutlass", name: "갈치류", re: "갈치", champ: { name: "은빛 대갈치", rarity: "rare", v: 1.9, shape: "long", giant: true, hint: "은빛 칼들이 하나로 벼려졌다" } },
    { id: "mackerel", name: "고등어류", re: "고등어|삼치|꽁치|청어|전어|전갱이|멸치", champ: { name: "등푸른 대왕고등어", rarity: "rare", v: 1.8, shape: "fish", hint: "등 푸른 생선들이 모여 하나의 큰 물결이 되었다" } },
    { id: "tuna", name: "다랑어·방어류", re: "다랑어|방어|부시리|새치", champ: { name: "황금 참다랑어 왕", rarity: "legendary", v: 2.4, shape: "big", giant: true, hint: "가장 빠른 회유어들의 왕, 비늘이 금빛이다" } },
    { id: "bream", name: "돔류", re: "돔", champ: { name: "용궁 황제돔", rarity: "legendary", v: 2.2, shape: "fish", hint: "잔칫상의 주인공들이 용궁의 왕을 뽑았다" } },
    { id: "flat", name: "가자미류", re: "가자미|광어|넙치|도다리|서대", champ: { name: "양탄자 대광어", rarity: "rare", v: 1.8, shape: "flat", giant: true, hint: "눈이 한쪽에 몰린 것들이 바닥만큼 넓어졌다" } },
    { id: "rockfish", name: "볼락·우럭류", re: "볼락|우럭|열기|쏨뱅이|노래미", champ: { name: "바위왕 우럭", rarity: "rare", v: 1.7, shape: "fish", hint: "바위틈의 터줏대감들이 왕을 세웠다" } },
    { id: "grouper", name: "바리류", re: "바리|능성어", champ: { name: "제주 대왕다금바리", rarity: "legendary", v: 2.4, shape: "big", hint: "섬의 보물이라 불리는 것들이 하나가 되었다" } },
    { id: "turtle", name: "거북류", re: "거북", champ: { name: "천년 바다거북", rarity: "legendary", v: 2.2, shape: "big", giant: true, hint: "느린 것끼리 만나 천 년을 산다" } },
    { id: "shell", name: "조개·극피류", re: "전복|소라|해삼|성게|불가사리", champ: { name: "진주 대왕전복", rarity: "rare", v: 1.8, shape: "crab", hint: "단단한 집 속에서 진주를 품었다" } },
    { id: "abyss", name: "심해 미지류", re: "미지", champ: { name: "이름 없는 심연", rarity: "legendary", v: 2.6, shape: "eel", giant: true, hint: "빛이 닿지 않는 곳의 것들이 모이면 이름조차 사라진다" } },
    { id: "misc", name: "기타 어류", re: "", champ: { name: "만능 잡어왕", rarity: "rare", v: 1.6, shape: "fish", hint: "어느 무리에도 속하지 않던 것들이 왕을 뽑았다" } },
  ];

  // 이색 조합 레시피: 두 계열의 순서는 상관없음. 결과는 항상 같아서 추리할 수 있음
  const BREED_RECIPES = [
    { id: "mackwhale", a: "whale", b: "mackerel", name: "고등고래", rarity: "legendary", v: 3, shape: "big", giant: true, sizeMult: 8, family: "whale", hint: "바다에서 가장 큰 숨결이 등 푸른 줄무늬를 입었다" },
    { id: "toothwhale", a: "whale", b: "shark", name: "이빨고래상어", rarity: "legendary", v: 2.8, shape: "big", giant: true, sizeMult: 6, family: "shark", hint: "가장 큰 입에 가장 날카로운 이빨이 돋았다" },
    { id: "balloonwhale", a: "whale", b: "puffer", name: "풍선고래", rarity: "legendary", v: 2.8, shape: "big", giant: true, sizeMult: 8, family: "whale", hint: "한 번 부풀면 섬 하나만 해진다" },
    { id: "shrimpwhale", a: "whale", b: "shrimp", name: "새우고래", rarity: "rare", v: 2.2, shape: "slim", giant: true, sizeMult: 10, family: "shrimp", hint: "먹히던 작은 것이 먹던 것만큼 커졌다" },
    { id: "feastwhale", a: "whale", b: "bream", name: "잔칫상고래", rarity: "legendary", v: 2.8, shape: "big", giant: true, sizeMult: 6, family: "bream", hint: "잔칫상에 오르던 붉은 생선이 고래만큼 커졌다" },
    { id: "abysslord", a: "whale", b: "abyss", name: "심연의 군주", rarity: "legendary", v: 3.4, shape: "big", giant: true, sizeMult: 6, family: "abyss", hint: "가장 큰 숨결이 빛 없는 곳의 이름 없는 것과 만났다" },
    { id: "octoshark", a: "shark", b: "octo", name: "문어상어", rarity: "legendary", v: 2.6, shape: "octo", giant: true, sizeMult: 6, family: "shark", hint: "여덟 개의 팔로 사냥하는 이빨" },
    { id: "wingshark", a: "shark", b: "ray", name: "날개상어", rarity: "rare", v: 2.2, shape: "ray", sizeMult: 3.2, family: "shark", hint: "지느러미가 날개가 된 사냥꾼" },
    { id: "bladesquid", a: "squid", b: "cutlass", name: "칼오징어", rarity: "rare", v: 2, shape: "long", sizeMult: 3, family: "squid", hint: "은빛 칼날 같은 몸에 다리가 열 개" },
    { id: "tunacrab", a: "crab", b: "tuna", name: "다랑게", rarity: "rare", v: 2.2, shape: "crab", giant: true, sizeMult: 6, family: "crab", hint: "가장 빠른 물고기가 옆으로 걷기 시작했다" },
    { id: "dragoneel", a: "seahorse", b: "eel", name: "해룡장어", rarity: "legendary", v: 2.6, shape: "eel", giant: true, sizeMult: 6, family: "eel", hint: "말의 얼굴을 한 뱀이 용이 되려 한다" },
    { id: "kitesquid", a: "ray", b: "squid", name: "연날리기오징어", rarity: "rare", v: 2, shape: "ray", sizeMult: 3.2, family: "squid", hint: "바다를 나는 연, 꼬리는 열 갈래" },
    { id: "ghostocto", a: "jelly", b: "octo", name: "유령문어", rarity: "rare", v: 2.1, shape: "octo", sizeMult: 3, family: "octo", hint: "투명한 몸, 독침 달린 여덟 팔" },
    { id: "electriceel", a: "jelly", b: "eel", name: "전기장어", rarity: "rare", v: 2.1, shape: "eel", sizeMult: 3, family: "eel", hint: "닿기만 해도 찌릿, 길고 번쩍이는 몸" },
    { id: "carpetflat", a: "flat", b: "ray", name: "양탄자가자미", rarity: "rare", v: 2, shape: "flat", giant: true, sizeMult: 6, family: "flat", hint: "납작한 것끼리 만나 바다 바닥 전체가 되었다" },
    { id: "hermitking", a: "shell", b: "crab", name: "소라게 대왕", rarity: "rare", v: 2, shape: "crab", sizeMult: 3.6, family: "crab", hint: "집을 등에 지고 다니는 집게들의 왕" },
    { id: "lobster", a: "shrimp", b: "crab", name: "왕가재", rarity: "rare", v: 2, shape: "crab", sizeMult: 3.6, family: "shrimp", hint: "갑옷 입은 두 친구가 커다란 집게를 얻었다" },
    { id: "kraken", a: "abyss", b: "octo", name: "크라켄", rarity: "legendary", v: 3.2, shape: "octo", giant: true, sizeMult: 8, family: "abyss", hint: "선원들의 이야기 속, 배를 삼키는 여덟 팔" },
    { id: "shellmackerel", a: "turtle", b: "mackerel", name: "등껍질고등어", rarity: "rare", v: 1.9, shape: "fish", sizeMult: 3, family: "mackerel", hint: "등이 푸르다 못해 단단한 등껍질이 되었다" },
    { id: "spikehorse", a: "puffer", b: "seahorse", name: "가시해마", rarity: "rare", v: 2, shape: "slim", sizeMult: 3, family: "seahorse", hint: "건드리면 부풀어 가시가 서는 작은 말" },
    { id: "silverdragon", a: "cutlass", b: "eel", name: "은빛용", rarity: "legendary", v: 2.8, shape: "long", giant: true, sizeMult: 6, family: "eel", hint: "은빛 칼과 긴 뱀이 만나 용이 되었다" },
    { id: "palacegate", a: "grouper", b: "turtle", name: "용궁 문지기", rarity: "legendary", v: 2.8, shape: "big", giant: true, sizeMult: 6, family: "turtle", hint: "천 년 사는 등껍질과 바위틈의 왕이 지키는 문" },
  ];
  // 같은 어종끼리 교배할 때 단계 이름 (단계마다 희귀도 +1, 크기 ×BREED_SIZE.tierStep)
  const BREED_TIERS = ["대형 특수 ", "초대형 ", "전설의 "];
  // 교배 크기 규칙: 거대(giant) 결과는 최소 크기 보장, 계열 대표종 거대형 배율
  const BREED_SIZE = { tierStep: 1.6, champ: 1.6, champGiant: 4, giantFloor: [800, 1500] };

  // 마스코트 고양이 '나비': 생선을 주면 buffSec 동안 명성(평판)·방문율 상승
  const CAT = { buffSec: 600, rep: 0.4, arrive: 1.25, feedCostSec: 20 };   // 비용 = 초당 수익 × feedCostSec (최소 30원)
  // 원정 파견: 60/120/180초 출항 → 분당 perMinute마리, 희귀 쪽 luck 배, 비용 = 초당 수익 × 시간 × costRatio
  const DISPATCH = { durations: [60, 120, 180], perMinute: 4, luck: 1.6, costRatio: 0.4, haulRatio: 0.6 };
  // 사장님 자동 낚시 간격 (초)
  const AUTO_CAST_SEC = 30;
  // 밤 별똥별 소원: buffSec 동안 전설·신종 입질 ×legendary
  const WISH = { buffSec: 1800, legendary: 2.5 };

  // 수족관: 희귀 이상만 등록. 등록 1마리당 전체 매출 버프
  const AQUARIUM = {
    slots: 6,
    buff: { rare: 0.04, legendary: 0.12 },
    bredBonus: 0.03,       // 직접 개량한 신종이면 추가
    goldenMult: 2,         // 황금 개체를 낚은 적 있는 어종이면 ×
  };
  const GOLDEN_CHANCE = 0.01;

  // 손님 유형
  const GUEST_TYPES = [
    { id: "tourist", name: "초보 관광객", weight: 60, color: "#f2a541", stay: 0.8, shop: 1.3, fee: 1.0, rarity: 1.0, review: 1 },
    { id: "family", name: "가족", weight: 25, color: "#e86a92", stay: 1.0, shop: 1.2, fee: 1.0, rarity: 1.0, review: 1 },
    { id: "angler", name: "동호회 꾼", weight: 14, color: "#3a7bd5", stay: 1.4, shop: 0.7, fee: 1.5, rarity: 1.3, review: 1 },
    { id: "pro", name: "프로·유튜버", weight: 1, color: "#9b59b6", stay: 1.5, shop: 1.0, fee: 2.0, rarity: 2.0, review: 5 },
  ];

  const SEASON_NAMES = { spring: "봄", summer: "여름", autumn: "가을", winter: "겨울" };

  const WEATHER = {
    sunny: { name: "맑음", arrive: 1.0, catchSpeed: 1.0, sat: 0 },
    cloudy: { name: "흐림", arrive: 1.0, catchSpeed: 1.25, sat: 2 },
    rain: { name: "비", arrive: 0.6, catchSpeed: 1.1, sat: -8 },
    typhoon: { name: "태풍", arrive: 0.0, catchSpeed: 0.8, sat: -15 },
  };
  const WEATHER_ODDS = {
    spring: { sunny: 60, cloudy: 25, rain: 15, typhoon: 0 },
    summer: { sunny: 50, cloudy: 20, rain: 20, typhoon: 10 },
    autumn: { sunny: 55, cloudy: 25, rain: 13, typhoon: 7 },
    winter: { sunny: 55, cloudy: 35, rain: 10, typhoon: 0 },
  };

  // 가상 손님 닉네임 (게임 안에서만 표시)
  const NICK_A = ["주말", "새벽", "초보", "손맛", "바다", "갯바위", "대물", "월척", "찌낚시", "선상", "가족", "캠핑", "회사원", "은퇴한", "여행가"];
  const NICK_B = ["꾼", "조사", "아빠", "엄마", "삼촌", "낚린이", "고수", "왕", "러버", "탐험가", "김씨", "박씨", "이씨", "최씨"];

  const REVIEW_TEXT = {
    5: ["인생 손맛 봤습니다!! 또 올게요", "회까지 떠주시니 최고예요", "애들이 너무 좋아했어요 강추", "여기 물 좋네요. 단골 예약", "사장님 친절하고 고기 잘 나와요"],
    4: ["재밌었어요, 다음엔 대물 노려봅니다", "시설 깔끔하고 입질 괜찮았어요", "가성비 좋은 낚시터", "바다 뷰가 끝내줘요"],
    3: ["무난했어요", "입질이 좀 약했지만 바람 쐬기 좋음", "그럭저럭 손맛은 봤어요"],
    2: ["오늘은 꽝이었네요…", "날씨 때문인지 고기가 안 물어요", "조금 아쉬웠습니다"],
    1: ["장화만 낚았습니다 ㅠㅠ", "하루 종일 입질 한 번 없었어요", "다신 안 올래요… 아마도"],
  };

  const GameData = {
    FACILITIES, UPGRADES, RARITY, RARITY_ORDER, SPOTS, FISH, JUNK, JUNK_CHANCE, WALKIN, GOLDEN_CHANCE,
    EXPEDITION, VIP, BREED, AQUARIUM, CAT, WISH, DISPATCH, AUTO_CAST_SEC, BREED_FAMILIES, BREED_RECIPES, BREED_TIERS, BREED_SIZE,
    GUEST_TYPES, SEASON_NAMES, WEATHER, WEATHER_ODDS, NICK_A, NICK_B, REVIEW_TEXT,
  };
  root.GameData = GameData;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = GameData;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
