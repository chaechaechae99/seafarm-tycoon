/* 의뢰·환생·해양 이벤트·대회 검증 (node tools/meta-test.js) */
const assert = require("assert");
const G = require("../js/logic.js");
const D = require("../js/data.js");

let seed = 21;
const rng = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log("  ✓ " + name);
}
function midGame() {
  const s = G.newState();
  Object.assign(s.owned, { seat: 60, shop: 40, rental: 30, restaurant: 20, shuttle: 10, pension: 5, farm: 5, crew: 10 });
  ["shade", "bait", "sns", "boat"].forEach((u) => { s.upgrades[u] = true; });
  return s;
}

test("보상은 진행도(CPS)에 비례: 초반·중반 의뢰 보상 비율 ≈ CPS 비율", () => {
  const early = G.newState();
  const mid = midGame();
  const f = D.FISH.find((x) => x.rarity === "premium");
  const r1 = G.questReward(early, f);
  const r2 = G.questReward(mid, f);
  assert.ok(r2 > r1 * 10, r1 + " → " + r2);
  assert.ok(Math.abs(r2 - G.expectedRate(mid) * D.QUEST.sec.premium) < 2 || r2 === Math.round(D.RARITY.premium.base * f.v * D.QUEST.valueMult));
});

test("의뢰: 손님이 '!' 의뢰를 내고, 해당 어종을 낚으면 보상, 시간이 지나면 만료", () => {
  const s = midGame();
  const w = G.newWorld(rng);
  let issued = 0;
  let done = 0;
  let failed = 0;
  for (let i = 0; i < 18000; i++) {
    G.tick(s, w, 0.1);
    w.events.forEach((e) => {
      if (e.kind === "quest") {
        if (e.done) { done++; } else if (e.failed) { failed++; } else { issued++; }
      }
    });
    w.events = [];
  }
  assert.ok(issued > 3, "발생 " + issued);
  assert.ok(done > 0, "완료 " + done);
  assert.ok(s.quests.length <= D.QUEST.max);
  console.log("     30분: 의뢰 " + issued + "건 · 완료 " + done + " · 만료 " + failed);
});

test("해양 이벤트가 발생·종료되고 효과가 적용됨 (고래 떼 = 전설 ×3)", () => {
  const s = midGame();
  s.ocean = { id: "whale", left: 10 };
  assert.strictEqual(G.legendaryMult(s), 3);
  s.ocean = { id: "redtide", left: 10 };
  const slow = G.catchSpeedMult(s);
  s.ocean = null;
  assert.ok(slow < G.catchSpeedMult(s));
  s.weather = "typhoon";
  assert.strictEqual(G.legendaryMult(s), D.OCEAN.typhoonLegend);
});

test("태풍 중 귀항한 원정은 어획 30% 유실", () => {
  const s = midGame();
  const w = G.newWorld(rng);
  G.startDispatch(s, 3600);
  s.dispatch.t = s.dispatch.dur;
  s.weather = "typhoon";
  const res = G.finishDispatch(s, w, rng);
  assert.ok(res.storm && res.total <= Math.round(60 * 0.7));
});

test("대회: 리그는 CPS로, 상금은 CPS × 순위별 초", () => {
  const s = midGame();
  const w = G.newWorld(rng);
  const res = G.runTourney(s, w, rng);
  assert.ok(res.rank >= 1 && res.rank <= D.TOURNEY.entrants);
  const expect = Math.max(100, Math.round(G.expectedRate(s) * D.TOURNEY.prizeSec[res.rank - 1]));
  assert.ok(Math.abs(res.prize - expect) <= 1, res.prize + " vs " + expect);
  assert.strictEqual(G.tourneyLeague(G.newState()).id, "rookie");
});

test("환생: 100억 미만 불가, 이상이면 포인트 획득 + 시설 초기화 + 도감·트로피 유지", () => {
  const s = midGame();
  s.dex.goby = { count: 1, best: 10 };
  s.trophies = [{ league: "rookie", rank: 1, day: 3 }];
  s.totalEarned = 5e9;
  assert.strictEqual(G.doPrestige(s), 0);
  s.totalEarned = 4e10;
  const gain = G.doPrestige(s);
  assert.strictEqual(gain, Math.floor(10 * Math.sqrt(4)));
  assert.strictEqual(s.owned.shop, 0);
  assert.strictEqual(s.money, 0);
  assert.ok(s.dex.goby && s.trophies.length === 1 && s.prestige.points === gain && s.prestige.count === 1);
});

test("환생 상점: 비용·효과 (속도·전설·원정·수익)", () => {
  const s = G.newState();
  s.prestige.points = 100;
  const base = G.catchSpeedMult(s);
  assert.ok(G.buyPrestige(s, "speed"));
  assert.ok(Math.abs(G.catchSpeedMult(s) - base * 1.1) < 1e-9);
  assert.strictEqual(G.prestigeCost(s, "speed"), 10);
  G.buyPrestige(s, "voyage");
  s.owned.crew = 1;
  G.startDispatch(s, 3600);
  assert.ok(s.dispatch.dur < 3600 && s.dispatch.sec === 3600);
});

test("예전 저장 불러오기 (새 필드 없음)", () => {
  const s = G.newState();
  ["quests", "prestige", "ocean", "tourney", "trophies", "skins"].forEach((k) => { delete s[k]; });
  const back = G.deserialize(JSON.stringify(s));
  const w = G.newWorld(rng);
  for (let i = 0; i < 100; i++) { G.tick(back, w, 0.1); }
  assert.ok(Array.isArray(back.quests) && back.prestige.levels && back.tourney);
});

console.log("통과 " + passed + "개");
