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
  assert.ok(!s.dex.goby && s.achv.dex.length === 0, "환생하면 어류 도감·도감 업적 초기화");
  assert.ok(s.trophies.length === 1 && s.prestige.points === gain && s.prestige.count === 1);
});

test("손님 새 어종 도감 쿨타임 · 역대 도감은 환생 후에도 남음", () => {
  const s = midGame();
  const f = D.FISH.filter((x) => x.rarity === "common");
  assert.ok(G.registerCatch(s, { id: f[0].id, size: 10, rarity: "common" }, true));
  assert.ok(!G.registerCatch(s, { id: f[1].id, size: 10, rarity: "common" }, true), "쿨타임 중 손님 새 어종은 미등록");
  assert.ok(G.registerCatch(s, { id: f[1].id, size: 12, rarity: "common" }), "사장님은 항상 등록");
  s.totalEarned = 4e10;
  G.doPrestige(s);
  assert.ok(!s.dex[f[1].id] && s.allDex[f[1].id].best === 12);
});

test("원정 파견: 후반 보상은 초당 수익 비례, 전설 원정 어종은 파견 전용", () => {
  const s = midGame();
  const w = G.newWorld(rng);
  s.tickets = 12;
  G.startDispatch(s, 3600);
  s.dispatch.t = s.dispatch.dur;
  s.weather = "sunny";
  const res = G.finishDispatch(s, w, rng);
  assert.ok(res.gold >= G.expectedRate(s) * 3600 * D.DISPATCH.cpsShare * 0.99);
  assert.ok(Object.keys(s.dispDex).length > 0);
  const leg = G.EXP.species.find((x) => x.rarity === "Legendary" && !s.expDex[x.id]);
  assert.ok(!G.registerExp(s, { id: leg.id, rarity: "Legendary", size: 100 }) && !s.expDex[leg.id]);
});

test("교배 시간: 일반 15분 ~ 전설 3시간, 부스터·명인 손재주로 단축", () => {
  const s = G.newState();
  const c = D.FISH.find((f) => f.rarity === "common");
  const l = D.FISH.find((f) => f.rarity === "legendary");
  s.dex[c.id] = { count: 1, best: 10 };
  s.dex[l.id] = { count: 1, best: 10 };
  assert.strictEqual(G.breedTime(s, "f:" + c.id, "f:" + c.id), 900);
  assert.strictEqual(G.breedTime(s, "f:" + c.id, "f:" + l.id), 10800);
  s.buffs.boost = 100;
  s.skills.craft = 5;
  assert.strictEqual(G.breedTime(s, "f:" + l.id, "f:" + l.id), Math.round(10800 * 0.7 * 0.5));
});

test("원정 티켓: 1시간 = 1장, 1시간마다 충전, 다이아 즉시 귀항", () => {
  const s = midGame();
  s.tickets = 2;
  assert.ok(!G.startDispatch(s, 10800), "티켓 부족이면 3시간 원정 불가");
  assert.ok(G.startDispatch(s, 3600));
  assert.strictEqual(s.tickets, 1);
  s.lastSave = Date.now();
  G.applyOffline(s, Date.now() + 2 * 3600 * 1000 + 500);
  assert.strictEqual(s.tickets, 3);
  s.dispatch = { t: 0, sec: 10800, dur: 10800 };
  s.diamonds = 100;
  assert.strictEqual(G.instDispatchCost(s), 9);
  assert.ok(G.instantFinish(s, "dispatch") && s.dispatch.t === s.dispatch.dur && s.diamonds === 91);
});

test("VIP 초청: 다이아 소모 → 확정 방문·도감 등록·특수 팁", () => {
  const s = midGame();
  const w = G.newWorld(rng);
  s.diamonds = 20;
  const v = G.inviteVip(s, rng);
  assert.ok(v && s.diamonds === 5 && s.pendingVip === v.id);
  const before = s.money;
  G.tick(s, w, 0.05);
  assert.ok(!s.pendingVip && s.vipDex.includes(v.id));
  assert.ok(s.money - before >= G.expectedRate(s) * v.tipSec * 0.5);
});

test("스킬: 골드 버스트 수입 ×3·쿨타임, 패시브 레벨업", () => {
  const s = midGame();
  const base = G.incomeMult(s);
  assert.ok(G.useSkill(s, "burst"));
  assert.ok(Math.abs(G.incomeMult(s) - base * 3) < 1e-9);
  assert.ok(!G.useSkill(s, "burst"));
  assert.ok(!G.useSkill(s, "harbor"), "원정 없으면 만선 입항 불가");
  s.money = 1e15;
  const sp = G.catchSpeedMult(s);
  assert.ok(G.upgradeSkill(s, "chum"));
  assert.ok(Math.abs(G.catchSpeedMult(s) - sp * 1.05) < 1e-9);
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
