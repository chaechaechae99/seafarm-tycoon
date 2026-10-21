/* 어종 매니저 검증 + 구역별 요약 (node tools/species-test.js) */
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const SM = require("../js/species-manager.js");

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/korean_fishing_350_species.json"), "utf8"));
const M = SM.create(raw);
let seed = 42;
const rng = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log("  ✓ " + name);
}

console.log("== 검증 ==");
test("모든 어종이 정확히 한 구역에 배정됨", () => {
  const n = M.zones.reduce((a, z) => a + M.zoneSpecies(z.id).length, 0);
  assert.strictEqual(n, M.species.length);
});

test("구역을 열 때마다 풀이 늘어나고, 마지막엔 전 어종", () => {
  const p = M.newProgress();
  p.money = 1e15;
  let prev = M.poolFor(p).length;
  for (let i = 1; i < M.zones.length; i++) {
    const r = M.unlockZone(p, M.zones[i].id);
    assert.ok(r.ok, M.zones[i].id + " 해금 실패: " + r.reason);
    const now = M.poolFor(p).length;
    assert.ok(now > prev && r.added === now - prev);
    prev = now;
  }
  assert.strictEqual(prev, M.species.length);
});

test("순서 건너뛰기·돈 부족 해금은 거절", () => {
  const p = M.newProgress();
  assert.strictEqual(M.unlockZone(p, "offshore").ok, false);
  assert.strictEqual(M.unlockZone(p, "bay").ok, false);
  p.money = M.zones[1].unlockCost;
  assert.strictEqual(M.unlockZone(p, "bay").ok, true);
  assert.strictEqual(p.money, 0);
});

test("확률표 합이 1 (희귀도·어종 모두)", () => {
  const p = M.newProgress();
  const t = M.dropTable(p);
  const sr = SM.RARITIES.reduce((a, r) => a + t.byRarity[r], 0);
  let ss = 0;
  t.species.forEach((v) => { ss += v; });
  assert.ok(near(sr, 1, 1e-9) && near(ss, 1, 1e-9), sr + " / " + ss);
});

test("잠긴 구역 어종은 절대 안 나옴 (2만 회)", () => {
  const p = M.newProgress();
  const allowed = new Set(M.poolFor(p).map((s) => s.id));
  for (let i = 0; i < 20000; i++) {
    const c = M.rollCatch(p, { weather: SM.WEATHERS[i % 4], time: SM.TIMES[(i >> 2) % 4] }, rng);
    if (c) {
      assert.ok(allowed.has(c.id), c.name);
    }
  }
});

test("조건이 안 맞는 날씨·시간대 어종은 안 나옴", () => {
  const p = M.newProgress();
  for (let i = 0; i < 5000; i++) {
    const c = M.rollCatch(p, { weather: "Stormy", time: "Night" }, rng);
    const s = M.byId.get(c.id);
    assert.ok(s.conditions.weather.includes("Stormy") && s.conditions.timeOfDay.includes("Night"), c.name);
  }
});

test("실제 뽑기 비율이 확률표와 일치 (±1.5%p, 5만 회)", () => {
  const p = M.newProgress();
  p.money = 1e15;
  M.unlockZone(p, "bay");
  const ctx = { weather: "Clear", time: "Day" };
  const t = M.dropTable(p, ctx);
  const cnt = {};
  const N = 50000;
  for (let i = 0; i < N; i++) {
    const c = M.rollCatch(p, ctx, rng);
    cnt[c.rarity] = (cnt[c.rarity] || 0) + 1;
  }
  SM.RARITIES.forEach((r) => {
    assert.ok(near((cnt[r] || 0) / N, t.byRarity[r], 0.015), r + " " + (cnt[r] / N) + " vs " + t.byRarity[r]);
  });
});

test("행운(luck)은 일반 외 희귀도 비율만 올림", () => {
  const p = M.newProgress();
  const a = M.dropTable(p);
  const b = M.dropTable(p, { luck: 2 });
  assert.ok(b.byRarity.Common < a.byRarity.Common && b.byRarity.Legendary > a.byRarity.Legendary);
});

test("오프라인: DPS 보상 = idleDps × 시간 × 효율, 상한·음수 처리", () => {
  const p = M.newProgress();
  const r = M.computeOffline(p, 3600, { rng });
  assert.ok(near(r.dpsGold, M.idleDps(p) * 3600 * 0.5, 1e-6));
  assert.ok(near(r.total, r.dpsGold + r.saleGold, 1e-6));
  assert.strictEqual(M.computeOffline(p, 99 * 3600, { rng }).elapsed, SM.OFFLINE.cap);
  assert.strictEqual(M.computeOffline(p, -50, { rng }).total, 0);
  assert.strictEqual(M.computeOffline(p, NaN, { rng }).total, 0);
});

test("오프라인 희귀도별 드랍 합 ≈ 어획 수", () => {
  const p = M.newProgress();
  const r = M.computeOffline(p, 8 * 3600, { rng });
  const sum = SM.RARITIES.reduce((a, k) => a + r.dropsByRarity[k], 0);
  assert.ok(Math.abs(sum - r.catches) <= SM.RARITIES.length, sum + " vs " + r.catches);
});

test("applyOffline이 돈과 도감을 반영", () => {
  const p = M.newProgress();
  const r = M.computeOffline(p, 3600, { rng });
  M.applyOffline(p, r);
  assert.ok(near(p.money, r.total, 1e-6));
  assert.strictEqual(Object.keys(p.dex).length, r.discovered.length);
});

console.log("통과 " + passed + "개");

console.log("\n== 구역별 어종 수 ==");
M.zoneSummary().forEach((z) => {
  console.log(z.name.padEnd(8) + " 해금 " + String(z.unlockCost).padStart(12) + "원  " + String(z.total).padStart(3) + "종  " +
    SM.RARITIES.map((r) => r[0] + ":" + z.count[r]).join(" "));
});

console.log("\n== 구역 해금 단계별 방치 수익 (낚시꾼 1명, 8시간, 효율 50%) ==");
const p = M.newProgress();
p.money = 1e15;
M.zones.forEach((z, i) => {
  if (i > 0) {
    M.unlockZone(p, z.id);
  }
  const t = M.dropTable(p);
  const r = M.computeOffline(p, 8 * 3600, { rng });
  // 다음 구역 비용을 모으는 데 걸리는 시간 (효율 100% 기준 초당 수익)
  const perSec = r.total / (8 * 3600 * r.efficiency);
  const nz = M.zones[i + 1];
  const wait = nz ? (nz.unlockCost / perSec / 3600).toFixed(1) + "시간" : "-";
  console.log(("~" + z.name).padEnd(9) + " 풀 " + String(M.poolFor(p).length).padStart(3) + "종  " +
    SM.RARITIES.map((k) => k[0] + " " + (t.byRarity[k] * 100).toFixed(1) + "%").join("  ") +
    "  | DPS " + r.dps.toFixed(1) + "  DPS보상 " + Math.round(r.dpsGold) + "  판매 " + Math.round(r.saleGold) +
    "  합계 " + Math.round(r.total) + "  | 초당 " + perSec.toFixed(0) + " · 다음 구역까지 " + wait);
});

if (M.warnings.length) {
  console.log("\n== 데이터 경고 " + M.warnings.length + "건 ==");
  M.warnings.forEach((w) => console.log("  " + w));
}
