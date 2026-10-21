/* ============================================================
 * BREEDING — 비밀 양식장 교배 · 신종 도감 힌트 (브라우저/Node 공용)
 *
 * 교배 경로 (route)
 *  upgrade  같은 어종 A + A          → "대형 특수 A" → "초대형 A" → "전설의 A" (단계마다 희귀도 +1, 크기 ×1.5)
 *  family   같은 계열의 다른 어종    → 계열 대표종 (예: 고등어류 → 등푸른 대왕고등어)
 *  recipe   레시피에 있는 두 계열    → 이색 신종 (예: 고래류 + 고등어류 → 고등고래, 거대화)
 *  hybrid   그 밖의 조합             → 돌연변이 잡종 (무작위 이름) + 관련 레시피 힌트 해금
 * 도감(catalog) = 계열 대표종 + 이색 레시피. 미발견 칸은 실루엣 + 단계별 힌트
 *
 * 부모 키: "f:어종id"(가두리 48종) · "s:번호"(원정 350종) · "b:신종id"
 * ============================================================ */
(function (root) {
  "use strict";

  // 원정 데이터 희귀도 → 게임 희귀도
  const EXP_RARITY = { Common: "common", Rare: "premium", Epic: "rare", Legendary: "legendary" };

  class BreedingManager {
    /**
     * @param {object} opt { data: GameData, species: 원정 어종 배열 }
     */
    constructor(opt) {
      this.D = opt.data;
      this.fishById = new Map(this.D.FISH.map((f) => [f.id, f]));
      this.speciesById = new Map((opt.species || []).map((s) => [s.id, s]));
      this.order = this.D.RARITY_ORDER;
      this.families = this.D.BREED_FAMILIES.map((f) => Object.assign({}, f, { rx: f.re ? new RegExp(f.re) : null }));
      this.famById = new Map(this.families.map((f) => [f.id, f]));
      this.recipes = this.D.BREED_RECIPES;
      this.recipeByPair = new Map();
      this.recipes.forEach((r) => this.recipeByPair.set(this.pairKey(r.a, r.b), r));
    }

    pairKey(a, b) {
      return [a, b].sort().join("+");
    }
    familyOfName(name) {
      const f = this.families.find((x) => x.rx && x.rx.test(name));
      return f ? f.id : "misc";
    }
    rank(r) {
      return this.order.indexOf(r);
    }

    /* ---------- 부모 ---------- */
    // 예전 저장(접두어 없는 키)도 받아줌
    normKey(key) {
      if (/^[fsb]:/.test(key)) {
        return key;
      }
      if (this.fishById.has(key)) {
        return "f:" + key;
      }
      return "b:" + key;
    }
    bred(state, id) {
      return state.bred.find((b) => b.id === id) || null;
    }
    parentInfo(state, rawKey) {
      if (!rawKey) {
        return null;
      }
      const key = this.normKey(rawKey);
      const kind = key[0];
      const id = key.slice(2);
      if (kind === "f") {
        const f = this.fishById.get(id);
        if (!f || !state.dex[id]) {
          return null;
        }
        return { key, kind, name: f.name, rarity: f.rarity, v: f.v, size: f.size, family: this.familyOfName(f.name), base: key };
      }
      if (kind === "s") {
        const s = this.speciesById.get(Number(id));
        if (!s || !state.expDex[s.id]) {
          return null;
        }
        const rarity = EXP_RARITY[s.rarity];
        return {
          key, kind, name: s.name, rarity, v: Math.max(0.5, Math.min(3, s.price / (this.D.RARITY[rarity].base * 8))),
          size: [s.minSize, s.maxSize], family: this.familyOfName(s.name), base: key,
        };
      }
      const b = this.bred(state, id);
      if (!b) {
        return null;
      }
      return {
        key, kind, name: b.name, rarity: b.rarity, v: b.v, size: b.size, family: b.family || this.familyOfName(b.name),
        base: b.base || key, tier: b.tier || 0, bredRef: b,
      };
    }
    // 교배 재료 후보 (가두리 도감 · 원정 도감 · 신종)
    parents(state) {
      const out = [];
      this.D.FISH.forEach((f) => {
        if (state.dex[f.id]) {
          out.push(Object.assign({ group: "가두리 도감" }, this.parentInfo(state, "f:" + f.id)));
        }
      });
      Object.keys(state.expDex || {}).map(Number).sort((a, b) => a - b).forEach((id) => {
        const p = this.parentInfo(state, "s:" + id);
        if (p) {
          out.push(Object.assign({ group: "원정 도감" }, p));
        }
      });
      state.bred.forEach((b) => out.push(Object.assign({ group: "신종" }, this.parentInfo(state, "b:" + b.id))));
      return out;
    }

    /* ---------- 경로 판정 ---------- */
    route(state, a, b) {
      const pa = this.parentInfo(state, a);
      const pb = this.parentInfo(state, b);
      if (!pa || !pb) {
        return null;
      }
      if (pa.key === pb.key) {
        return { type: "upgrade", pa, pb, label: "등급 상승 교배 (같은 어종)" };
      }
      if (pa.family === pb.family) {
        return { type: "family", pa, pb, fam: this.famById.get(pa.family), label: "등급 상승 교배 (같은 " + this.famById.get(pa.family).name + ")" };
      }
      const r = this.recipeByPair.get(this.pairKey(pa.family, pb.family));
      return r
        ? { type: "recipe", pa, pb, recipe: r, label: "이색 조합 (" + this.famName(pa.family) + " × " + this.famName(pb.family) + ")" }
        : { type: "hybrid", pa, pb, label: "이색 조합 (" + this.famName(pa.family) + " × " + this.famName(pb.family) + ")" };
    }
    famName(id) {
      const f = this.famById.get(id);
      return f ? f.name : id;
    }

    /* ---------- 비용·시작 ---------- */
    cost(state, a, b, mutate, ratePerSec) {
      const pa = this.parentInfo(state, a);
      const pb = this.parentInfo(state, b);
      if (!pa || !pb) {
        return Infinity;
      }
      const R = this.D.RARITY;
      const avg = (R[pa.rarity].base * pa.v + R[pb.rarity].base * pb.v) / 2;
      const base = Math.max(avg * this.D.BREED.costMult, (ratePerSec || 0) * 40);
      return Math.ceil(base * (mutate ? this.D.BREED.mutateCostMult : 1));
    }
    block(state, a, b, mutate, ratePerSec) {
      if (!state.upgrades.secret) {
        return "비밀 양식장이 필요해요";
      }
      if (state.breeding) {
        return "교배가 진행 중이에요";
      }
      if (!a || !b) {
        return "재료 두 마리를 골라주세요";
      }
      const rt = this.route(state, a, b);
      if (!rt) {
        return "도감에 있는 어종만 쓸 수 있어요";
      }
      if (rt.type === "upgrade" && (rt.pa.tier || 0) >= this.D.BREED_TIERS.length) {
        return "이미 최고 단계예요";
      }
      if (state.bred.length >= this.D.BREED.maxSpecies && !this.bred(state, this.resultId(rt))) {
        return "신종 수조가 가득 찼어요";
      }
      if (state.money < this.cost(state, a, b, mutate, ratePerSec)) {
        return "돈이 부족해요";
      }
      return "";
    }
    start(state, a, b, mutate, ratePerSec) {
      if (this.block(state, a, b, mutate, ratePerSec)) {
        return false;
      }
      state.money -= this.cost(state, a, b, mutate, ratePerSec);
      state.breeding = { a: this.normKey(a), b: this.normKey(b), mutate: !!mutate, t: 0, dur: this.D.BREED.time };
      return true;
    }

    /* ---------- 결과 ---------- */
    resultId(rt) {
      if (rt.type === "upgrade") {
        return "up_" + rt.pa.base.replace(":", "_") + "_" + ((rt.pa.tier || 0) + 1);
      }
      if (rt.type === "family") {
        return "fam_" + rt.fam.id;
      }
      if (rt.type === "recipe") {
        return "rx_" + rt.recipe.id;
      }
      return "hy_" + [rt.pa.key, rt.pb.key].sort().join("_").replace(/:/g, "");
    }
    hash(s) {
      let h = 7;
      for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) % 1000003;
      }
      return h;
    }
    bumpRank(r, n) {
      return this.order[Math.min(this.order.length - 1, this.rank(r) + n)];
    }
    // 교배 완료 처리. 같은 결과가 이미 있으면 개체 수만 늘어남
    finish(state, rng) {
      const br = state.breeding;
      state.breeding = null;
      const rt = this.route(state, br.a, br.b);
      if (!rt) {
        return null;
      }
      const id = this.resultId(rt);
      const add = br.mutate ? 2 : 1;
      let b = this.bred(state, id);
      const isNew = !b;
      if (b) {
        b.stock += add;
      } else {
        b = this.makeResult(rt, id, br.mutate, rng);
        b.stock = add;
        state.bred.push(b);
      }
      this.log(state, rt, b, isNew);
      // 추리 보상: 실험한 계열이 들어간 미발견 레시피 힌트를 2단계로
      const hinted = [];
      if (rt.type === "hybrid" || rt.type === "family" || rt.type === "upgrade") {
        [rt.pa.family, rt.pb.family].forEach((fam) => {
          this.recipes.forEach((r) => {
            const rid = "rx_" + r.id;
            if ((r.a === fam || r.b === fam) && !this.bred(state, rid) && this.hintLevel(state, rid) < 2) {
              state.breedHints[rid] = 2;
              hinted.push(r.name);
            }
          });
        });
      }
      return { bred: b, dup: !isNew, route: rt.type, hinted };
    }
    makeResult(rt, id, mutate, rng) {
      const pa = rt.pa;
      const pb = rt.pb;
      const bigSize = pa.size[1] >= pb.size[1] ? pa.size : pb.size;
      const common = { id, parents: [pa.key, pb.key], caught: 0, best: 0, mutated: mutate };
      const SZ = this.D.BREED_SIZE;
      // 거대종은 최소 크기를 보장해 확실히 압도적으로
      const giantSize = (lo, hi) => [Math.max(SZ.giantFloor[0], Math.round(lo)), Math.max(SZ.giantFloor[1], Math.round(hi))];
      if (rt.type === "upgrade") {
        const tier = (pa.tier || 0) + 1;
        const baseName = (pa.bredRef && pa.bredRef.baseName) || pa.name;
        return Object.assign(common, {
          kind: "upgrade", name: this.D.BREED_TIERS[tier - 1] + baseName, baseName, base: pa.base, tier,
          rarity: tier >= this.D.BREED_TIERS.length ? "legendary" : this.bumpRank(pa.rarity, 1), v: Math.round(pa.v * 1.5 * 100) / 100, family: pa.family,
          size: [Math.round(pa.size[0] * SZ.tierStep), Math.round(pa.size[1] * SZ.tierStep)], giant: tier >= 3,
        });
      }
      if (rt.type === "family") {
        const c = rt.fam.champ;
        const m = c.giant ? SZ.champGiant : SZ.champ;
        const size = [bigSize[0] * m, bigSize[1] * m];
        return Object.assign(common, {
          kind: "family", name: c.name, rarity: c.rarity, v: c.v, family: rt.fam.id, shape: c.shape, giant: !!c.giant,
          size: c.giant ? giantSize(size[0], size[1]) : size.map(Math.round),
        });
      }
      if (rt.type === "recipe") {
        const r = rt.recipe;
        const size = [bigSize[0] * r.sizeMult, bigSize[1] * r.sizeMult];
        return Object.assign(common, {
          kind: "recipe", recipe: r.id, name: r.name, rarity: r.rarity, v: r.v, family: r.family, shape: r.shape, giant: !!r.giant,
          size: r.giant ? giantSize(size[0], size[1]) : size.map(Math.round),
        });
      }
      // 돌연변이 잡종: 희귀도는 부모 중 높은 쪽에서 확률적으로 상승
      let rank = Math.max(this.rank(pa.rarity), this.rank(pb.rarity));
      if (rng() < this.D.BREED.upChance + (mutate ? this.D.BREED.mutateBonus : 0)) {
        rank++;
      }
      const prefix = this.D.BREED.prefix[this.hash(id) % this.D.BREED.prefix.length];
      const tail = pb.name.replace(/\(.*\)/, "");
      return Object.assign(common, {
        kind: "hybrid", name: prefix + pa.name.replace(/\(.*\)/, "")[0] + (tail.length >= 3 ? tail.slice(-2) : tail), prefix,
        rarity: this.order[Math.min(this.order.length - 1, rank)], family: pa.family,
        v: Math.round(((pa.v + pb.v) / 2) * this.D.BREED.valueMult * 100) / 100,
        size: [Math.round((pa.size[0] + pb.size[0]) / 2), Math.round(((pa.size[1] + pb.size[1]) / 2) * 1.1)],
      });
    }
    log(state, rt, b, isNew) {
      state.breedLog.unshift({ a: rt.pa.name, b: rt.pb.name, route: rt.type, result: b.name, isNew });
      state.breedLog.length = Math.min(state.breedLog.length, this.D.BREED.logMax);
    }

    /* ---------- 도감·힌트 ---------- */
    hintLevel(state, rid) {
      return Math.max(1, (state.breedHints || {})[rid] || 1);
    }
    hintCost(state, rid, ratePerSec) {
      const lv = this.hintLevel(state, rid);
      if (lv >= 3) {
        return Infinity;
      }
      return Math.max(1000, Math.ceil((ratePerSec || 0) * this.D.BREED.hintSec[lv]));
    }
    buyHint(state, rid, ratePerSec) {
      const c = this.hintCost(state, rid, ratePerSec);
      if (!isFinite(c) || state.money < c || this.bred(state, rid)) {
        return false;
      }
      state.money -= c;
      state.breedHints[rid] = this.hintLevel(state, rid) + 1;
      return true;
    }
    // 도감 칸 목록: 계열 대표종 → 이색 레시피 순서
    catalog(state) {
      const out = [];
      this.families.forEach((f) => {
        const id = "fam_" + f.id;
        const lv = this.hintLevel(state, id);
        const found = this.bred(state, id);
        out.push({
          id, kind: "family", name: f.champ.name, rarity: f.champ.rarity, shape: f.champ.shape, giant: !!f.champ.giant,
          discovered: !!found, entry: found, hintLevel: lv, formula: f.name + " + " + f.name + " (서로 다른 종)",
          hints: [f.champ.hint, "같은 계열끼리 섞는 등급 상승 교배예요", "재료: " + f.name + " 두 종"],
        });
      });
      this.recipes.forEach((r) => {
        const id = "rx_" + r.id;
        const found = this.bred(state, id);
        out.push({
          id, kind: "recipe", name: r.name, rarity: r.rarity, shape: r.shape, giant: !!r.giant,
          discovered: !!found, entry: found, hintLevel: this.hintLevel(state, id), formula: this.famName(r.a) + " + " + this.famName(r.b),
          hints: [r.hint, "재료 중 하나는 " + this.famName(r.a), "재료: " + this.famName(r.a) + " + " + this.famName(r.b)],
        });
      });
      return out;
    }
    // 예전 저장의 신종 정리 (계열·종류 채우기)
    migrate(state) {
      state.breedHints = state.breedHints || {};
      state.breedLog = state.breedLog || [];
      state.bred.forEach((b) => {
        if (!b.kind) {
          b.kind = "hybrid";
          b.parents = b.parents.map((k) => this.normKey(k));
        }
        if (!b.family) {
          b.family = this.familyOfName(b.name);
        }
      });
      if (state.breeding) {
        state.breeding.a = this.normKey(state.breeding.a);
        state.breeding.b = this.normKey(state.breeding.b);
      }
    }
  }

  root.BreedingManager = BreedingManager;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = BreedingManager;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
