/* 교배·신종 도감 검증 (node tools/breeding-test.js) */
const assert = require("assert");
const G = require("../js/logic.js");
const D = require("../js/data.js");

let seed = 11;
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
function fresh() {
  const s = G.newState();
  s.upgrades.secret = true;
  s.money = 1e12;
  ["mackerel", "spanish", "redsnapper", "blackporgy", "octopus", "goby"].forEach((k) => { s.dex[k] = { count: 1, best: 30 }; });
  const whale = G.EXP.species.find((x) => /혹등고래/.test(x.name));
  const shark = G.EXP.species.find((x) => /악상어/.test(x.name));
  s.expDex[whale.id] = { count: 1, best: 900 };
  s.expDex[shark.id] = { count: 1, best: 300 };
  return { s, whale: "s:" + whale.id, shark: "s:" + shark.id };
}
function breed(s, a, b, mutate) {
  assert.ok(G.startBreed(s, a, b, mutate), "start 실패: " + G.breedBlock(s, a, b, mutate));
  s.breeding.t = s.breeding.dur;
  return G.finishBreed(s, rng);
}

console.log("== 교배 경로 ==");
test("모든 계열 정규식이 올바르고, 레시피 계열이 실제 계열을 가리킴", () => {
  const fams = new Set(D.BREED_FAMILIES.map((f) => f.id));
  D.BREED_RECIPES.forEach((r) => assert.ok(fams.has(r.a) && fams.has(r.b) && fams.has(r.family), r.id));
  const pairs = new Set(D.BREED_RECIPES.map((r) => [r.a, r.b].sort().join("+")));
  assert.strictEqual(pairs.size, D.BREED_RECIPES.length, "레시피 계열 쌍 중복");
});
test("계열 판별: 고등어·혹등고래·악상어·참돔", () => {
  assert.strictEqual(G.BM.familyOfName("고등어"), "mackerel");
  assert.strictEqual(G.BM.familyOfName("혹등고래"), "whale");
  assert.strictEqual(G.BM.familyOfName("고래상어"), "shark");
  assert.strictEqual(G.BM.familyOfName("참돔"), "bream");
});
test("같은 어종: 고등어+고등어 → 대형 특수 고등어 → 초대형 → 전설의 (희귀도·크기 상승)", () => {
  const { s } = fresh();
  const r1 = breed(s, "f:mackerel", "f:mackerel");
  assert.strictEqual(r1.route, "upgrade");
  assert.strictEqual(r1.bred.name, "대형 특수 고등어");
  assert.strictEqual(r1.bred.rarity, "premium");
  const k1 = "b:" + r1.bred.id;
  const r2 = breed(s, k1, k1);
  assert.strictEqual(r2.bred.name, "초대형 고등어");
  const k2 = "b:" + r2.bred.id;
  const r3 = breed(s, k2, k2);
  assert.strictEqual(r3.bred.name, "전설의 고등어");
  assert.strictEqual(r3.bred.rarity, "legendary");
  assert.ok(r3.bred.size[1] > r1.bred.size[1]);
  assert.ok(G.breedBlock(s, "b:" + r3.bred.id, "b:" + r3.bred.id).includes("최고 단계"));
});
test("같은 계열 다른 종: 참돔+감성돔 → 용궁 황제돔 (계열 대표종)", () => {
  const { s } = fresh();
  const r = breed(s, "f:redsnapper", "f:blackporgy");
  assert.strictEqual(r.route, "family");
  assert.strictEqual(r.bred.name, "용궁 황제돔");
});
test("이색 조합: 혹등고래+고등어 → 고등고래 (거대, 순서 무관, 항상 같음)", () => {
  const { s, whale } = fresh();
  const r = breed(s, whale, "f:mackerel");
  assert.strictEqual(r.route, "recipe");
  assert.strictEqual(r.bred.name, "고등고래");
  const wsp = G.parentInfo(s, whale);
  assert.ok(r.bred.giant && r.bred.size[1] >= Math.round(wsp.size[1] * 4) - 1, "거대화 안 됨: " + r.bred.size);
  const r2 = breed(s, "f:mackerel", whale);
  assert.ok(r2.dup && r2.bred === r.bred && r.bred.stock === 2);
});
test("레시피 없는 이색 조합 → 잡종 + 관련 레시피 힌트 2단계 해금", () => {
  const { s } = fresh();
  const r = breed(s, "f:goby", "f:octopus");
  assert.strictEqual(r.route, "hybrid");
  assert.ok(r.hinted.length > 0);
  const kraken = G.breedCatalog(s).find((c) => c.id === "rx_kraken");
  assert.strictEqual(kraken.hintLevel, 2);
  assert.ok(!kraken.discovered);
});
test("도감: 미발견 칸은 힌트 1단계부터, 힌트 구매로 3단계까지", () => {
  const { s } = fresh();
  const c0 = G.breedCatalog(s).find((c) => c.id === "rx_mackwhale");
  assert.strictEqual(c0.hintLevel, 1);
  assert.ok(G.buyHint(s, "rx_mackwhale"));
  assert.ok(G.buyHint(s, "rx_mackwhale"));
  assert.ok(!G.buyHint(s, "rx_mackwhale"));
  const c = G.breedCatalog(s).find((x) => x.id === "rx_mackwhale");
  assert.strictEqual(c.hintLevel, 3);
  assert.ok(c.hints[2].includes("고래류") && c.hints[2].includes("고등어류"));
  assert.strictEqual(G.breedCatalog(s).length, D.BREED_FAMILIES.length + D.BREED_RECIPES.length);
});
test("유전자 변형: 비용 ×3, 개체 2배", () => {
  const { s } = fresh();
  const c1 = G.breedCost(s, "f:redsnapper", "f:blackporgy", false);
  const c3 = G.breedCost(s, "f:redsnapper", "f:blackporgy", true);
  assert.ok(c3 >= c1 * 2.99 && c3 <= c1 * 3.01, c1 + " → " + c3);
  const r = breed(s, "f:redsnapper", "f:blackporgy", true);
  assert.strictEqual(r.bred.stock, 2);
});
test("도감에 없는 재료·잠긴 양식장은 거절", () => {
  const { s } = fresh();
  assert.ok(G.breedBlock(s, "f:tuna", "f:mackerel"));
  s.upgrades.secret = false;
  assert.ok(G.breedBlock(s, "f:mackerel", "f:mackerel"));
});
test("신종은 VIP 좌대에서 낚이고 수족관 등록 가능 (희귀 이상)", () => {
  const { s, whale } = fresh();
  breed(s, whale, "f:mackerel");
  const c = G.rollBred(s, rng);
  assert.ok(c.bred && c.name === "고등고래");
  assert.ok(G.aquaAdd(s, "b:rx_mackwhale"));
});
test("예전 저장(접두어 없는 부모 키) 불러오기 호환", () => {
  const { s } = fresh();
  s.bred.push({ id: "b_goby_mackerel_rare", name: "달빛망등어", rarity: "rare", parents: ["goby", "mackerel"], prefix: "달빛", v: 1, size: [10, 30], stock: 1, caught: 0, best: 0 });
  delete s.breedHints;
  delete s.breedLog;
  const back = G.deserialize(G.serialize(s));
  const old = back.bred.find((b) => b.id === "b_goby_mackerel_rare");
  assert.deepStrictEqual(old.parents, ["f:goby", "f:mackerel"]);
  assert.strictEqual(old.kind, "hybrid");
  assert.ok(back.breedHints && Array.isArray(back.breedLog));
});

console.log("통과 " + passed + "개");
