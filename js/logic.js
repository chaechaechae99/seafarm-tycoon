/* ============================================================
 * LOGIC — 순수 게임 로직 (브라우저/Node 공용)
 * ============================================================ */
(function (root) {
  "use strict";
  const D = root.GameData || require("./data.js");
  const SM = root.SpeciesManager || require("./species-manager.js");
  const SPECIES = root.SpeciesData || require("./species-data.js");

  const VERSION = 1;
  const SAVE_KEY = "seafarm_save_v1";
  const GAME_MIN_PER_SEC = 4;          // 현실 1초 = 게임 4분 → 하루 6분
  const DAY_MIN = 1440;
  const SEASON_DAYS = 2;                // 계절 = 게임 2일 (현실 12분)
  const SEASONS = ["spring", "summer", "autumn", "winter"];
  const BASE_STAY = 45;                 // 손님 체류 (초)
  const WALK_IN = 6;                    // 입구 → 자리까지 걷는 시간 (초, 그동안 자리 차지)
  const BASE_CATCH_INTERVAL = 9;        // 평균 입질 간격 (초)
  const WEATHER_PERIOD = 45;            // 날씨 변경 주기 (초)
  const OFFLINE_CAP = 8 * 3600;

  const FAC = Object.fromEntries(D.FACILITIES.map((f) => [f.id, f]));
  const UPG = Object.fromEntries(D.UPGRADES.map((u) => [u.id, u]));
  const FISH_BY_ID = Object.fromEntries(D.FISH.map((f) => [f.id, f]));
  const RANK = Object.fromEntries(D.RARITY_ORDER.map((r, i) => [r, i]));

  // 원정 구역 해금 비용은 data.js의 원정 업그레이드 가격을 따름
  const EXP_ZONES = SM.ZONES.map((z) => {
    const u = D.UPGRADES.find((x) => x.zone === z.id);
    return Object.assign({}, z, { unlockCost: u ? u.cost : 0 });
  });
  const EXP = SM.create(SPECIES, { zones: EXP_ZONES });
  const BreedingManager = root.BreedingManager || require("./breeding.js");
  const BM = new BreedingManager({ data: D, species: EXP.species });

  /* ---------------- 상태 ---------------- */
  function newState() {
    const owned = {};
    D.FACILITIES.forEach((f) => { owned[f.id] = f.free || 0; });
    return {
      version: VERSION,
      money: 0,
      totalEarned: 0,
      owned,
      upgrades: {},
      dex: {},              // id -> { count, best }
      reviews: [],          // { nick, stars, text, type, weight, fish }
      gameMin: 6 * 60,      // 1일차 06:00
      weather: "sunny",
      weatherTimer: WEATHER_PERIOD,
      stats: { guests: 0, missed: 0, catches: 0, golden: 0, ownerCasts: 0, vipVisits: 0, tips: 0, expCatches: 0, bredCatches: 0 },
      expDex: {},           // 원정 350종 도감: id -> { count, best }
      vip: { regulars: [], nextId: 1 },   // { id, nick, type, xp, visits }
      bred: [],             // 비밀 양식장 신종
      breeding: null,       // { a, b, mutate, t, dur }
      aquarium: [],         // "f:어종id" / "b:신종id"
      breedHints: {},       // 도감 칸 id -> 힌트 단계(1~3)
      breedLog: [],         // 최근 교배 실험 기록
      buffs: { cat: 0, wish: 0 },   // 남은 초
      stats2: { catFed: 0, wishes: 0 },
      dispatch: null,       // 원정 파견 중: { t, dur, zone }
      lastDispatch: null,
      autoCast: false,      // 사장님 자동 낚시 (30초마다)
      lastSave: Date.now(),
      created: Date.now(),
    };
  }

  function mergeDefaults(base, saved) {
    if (saved === null || typeof saved !== "object" || Array.isArray(saved)) {
      return saved === undefined ? base : saved;
    }
    const out = Array.isArray(base) ? [] : {};
    const keys = new Set([...Object.keys(base || {}), ...Object.keys(saved)]);
    keys.forEach((k) => {
      const b = base ? base[k] : undefined;
      const s = saved[k];
      if (s === undefined) {
        out[k] = b;
      } else if (b && typeof b === "object" && !Array.isArray(b) && typeof s === "object" && !Array.isArray(s)) {
        out[k] = mergeDefaults(b, s);
      } else {
        out[k] = s;
      }
    });
    return out;
  }

  /* ---------------- 시간·계절 ---------------- */
  function clockInfo(state) {
    const day = Math.floor(state.gameMin / DAY_MIN) + 1;
    const minOfDay = state.gameMin % DAY_MIN;
    const hour = Math.floor(minOfDay / 60);
    const minute = Math.floor(minOfDay % 60);
    const season = SEASONS[Math.floor((day - 1) / SEASON_DAYS) % 4];
    const night = hour >= 19 || hour < 5;
    return { day, hour, minute, minOfDay, season, night };
  }

  /* ---------------- 가격·구매 ---------------- */
  function costOf(id, owned) {
    const f = FAC[id];
    return Math.ceil(f.base * Math.pow(f.r, owned - (f.free || 0)));
  }
  function costOfN(id, owned, k) {
    const f = FAC[id];
    const first = f.base * Math.pow(f.r, owned - (f.free || 0));
    return Math.ceil(first * (Math.pow(f.r, k) - 1) / (f.r - 1));
  }
  function maxAffordable(state, id) {
    let k = 0;
    while (k < 1000 && costOfN(id, state.owned[id], k + 1) <= state.money) {
      k++;
    }
    return k;
  }
  function facilityVisible(state, id) {
    const f = FAC[id];
    if (!f.need) {
      return true;
    }
    return Object.entries(f.need).every(([nid, n]) => (state.owned[nid] || 0) >= n);
  }
  function buyFacility(state, id, k) {
    k = Math.max(1, k || 1);
    if (!facilityVisible(state, id)) {
      return false;
    }
    const c = costOfN(id, state.owned[id], k);
    if (state.money < c) {
      return false;
    }
    state.money -= c;
    state.owned[id] += k;
    return true;
  }
  function upgradeVisible(state, id) {
    const u = UPG[id];
    if (state.upgrades[id]) {
      return true;
    }
    if (u.needUpg && !state.upgrades[u.needUpg]) {
      return false;
    }
    if (u.needFac && !Object.entries(u.needFac).every(([k, n]) => (state.owned[k] || 0) >= n)) {
      return false;
    }
    return state.totalEarned >= u.cost * 0.2;
  }
  // 돈 말고 막힌 조건이 있으면 그 이유 (없으면 "")
  function upgradeBlock(state, id) {
    const u = UPG[id];
    if (u.needVip && maxVipLevel(state) < u.needVip) {
      return "호감도 " + u.needVip + " VIP 손님 필요";
    }
    return "";
  }
  function buyUpgrade(state, id) {
    const u = UPG[id];
    if (state.upgrades[id] || state.money < u.cost || !upgradeVisible(state, id) || upgradeBlock(state, id)) {
      return false;
    }
    state.money -= u.cost;
    state.upgrades[id] = true;
    return true;
  }

  /* ---------------- 공식 ---------------- */
  function dexCount(state) {
    return Object.keys(state.dex).filter((k) => FISH_BY_ID[k]).length;
  }
  function expDexCount(state) {
    return Object.keys(state.expDex).length;
  }
  // 도감 1종당 +2%, 원정 도감 1종당 +0.5%, 수족관 버프는 곱으로
  function incomeMult(state) {
    return (1 + 0.02 * dexCount(state) + D.EXPEDITION.dexBonus * expDexCount(state)) * (1 + aquaBuff(state));
  }

  /* ---------------- 원정 낚시 (350종) ---------------- */
  function expProgress(state) {
    const unlocked = ["coast"];
    D.UPGRADES.forEach((u) => {
      if (u.zone && state.upgrades[u.id]) {
        unlocked.push(u.zone);
      }
    });
    return { money: state.money, unlocked, dex: state.expDex };
  }
  // 낚시꾼 1명 수익은 해금 깊이로만 정해지므로 캐시
  const expPerAnglerCache = {};
  function expPerAngler(state) {
    const p = expProgress(state);
    const k = p.unlocked.length;
    if (expPerAnglerCache[k] === undefined) {
      expPerAnglerCache[k] = EXP.incomePerSec(p, { anglers: 1 });
    }
    return expPerAnglerCache[k];
  }
  // 원정 초당 수익 (incomeMult 적용 전)
  function expIncome(state) {
    const n = state.owned.crew || 0;
    return n ? expPerAngler(state) * n * msMult(n) * D.EXPEDITION.scale : 0;
  }
  function registerExp(state, c) {
    const isNew = !state.expDex[c.id];
    const d = state.expDex[c.id] || { count: 0, best: 0 };
    d.count++;
    d.best = Math.max(d.best, c.size);
    state.expDex[c.id] = d;
    state.stats.expCatches++;
    return isNew;
  }

  /* ---------------- VIP 단골 ---------------- */
  // 레벨 L에 필요한 누적 호감도 (최대 D.VIP.maxLevel)
  function vipXpFor(L) {
    return Math.round(0.6 * (L - 1) * (L - 1) + 0.6 * (L - 1));   // Lv10 = 54 (예전 저장과 같음)
  }
  function vipLevel(r) {
    let lv = 1;
    while (lv < D.VIP.maxLevel && r.xp >= vipXpFor(lv + 1)) {
      lv++;
    }
    return lv;
  }
  // VIP 좌대 이용료 배수: Lv10 = 20배, 이후 1레벨당 +0.5배 (Lv100 = 65배)
  function vipFeeMult(lv) {
    return D.VIP.feeLv10 + Math.max(0, lv - 10) * D.VIP.feePerLv;
  }
  function vipTitle(lv) {
    return D.VIP.titles.find((t) => lv >= t[0])[1];
  }
  function maxVipLevel(state) {
    return state.vip.regulars.reduce((m, r) => Math.max(m, vipLevel(r)), 0);
  }
  function regularChance(state) {
    return Math.min(D.VIP.visitCap, D.VIP.visitPer * state.vip.regulars.length);
  }
  function tipChance(lv) {
    return D.VIP.tipBase + (lv >= 5 ? D.VIP.tipLv5 : 0);
  }
  function guestTypeById(id) {
    return D.GUEST_TYPES.find((g) => g.id === id) || D.GUEST_TYPES[0];
  }

  /* ---------------- 비밀 양식장 신종 (BreedingManager에 위임) ---------------- */
  function bredById(state, id) {
    return state.bred.find((b) => b.id === id) || null;
  }
  function parentInfo(state, key) {
    return BM.parentInfo(state, key);
  }
  function breedParents(state) {
    return BM.parents(state);
  }
  function breedRoute(state, a, b) {
    return BM.route(state, a, b);
  }
  function breedCost(state, a, b, mutate) {
    return BM.cost(state, a, b, mutate, expectedRate(state));
  }
  function breedBlock(state, a, b, mutate) {
    return BM.block(state, a, b, mutate, expectedRate(state));
  }
  function startBreed(state, a, b, mutate) {
    return BM.start(state, a, b, mutate, expectedRate(state));
  }
  function finishBreed(state, rng) {
    return BM.finish(state, rng);
  }
  function breedCatalog(state) {
    return BM.catalog(state);
  }
  function hintCost(state, rid) {
    return BM.hintCost(state, rid, expectedRate(state));
  }
  function buyHint(state, rid) {
    return BM.buyHint(state, rid, expectedRate(state));
  }
  // VIP 전용 좌대에서만 낚이는 신종
  const EXP_RANK_W = { Common: 1, Rare: 3, Epic: 6, Legendary: 10 };
  function vipPool(state) {
    const out = [];
    // 원정 어종 중 일반 등급이 아니거나 심해·대형 생물만 (흔한 연안 어종 제외)
    Object.keys(state.expDex).forEach((id) => {
      const s = EXP.byId.get(Number(id));
      if (s && (s.rarity !== "Common" || /고래|미지|심해|대왕|상어/.test(s.name))) {
        out.push([{ exp: s }, EXP_RANK_W[s.rarity] * (s.rarity === "Legendary" ? legendaryMult(state) : 1)]);
      }
    });
    state.bred.forEach((b) => {
      out.push([{ bred: b }, D.RARITY[b.rarity].weight * 0.2 * b.stock * (b.rarity === "legendary" ? legendaryMult(state) : 1)]);
    });
    return out;
  }
  function rollBred(state, rng) {
    const pool = vipPool(state);
    if (!pool.length) {
      return null;   // 원정·교배로 얻은 어종이 없으면 VIP 좌대에선 아무것도 안 낚임
    }
    const pick = pickWeighted(rng, pool);
    const t = rng();
    const tier = t > 0.9 ? "대물" : t > 0.6 ? "대" : t > 0.3 ? "중" : "소";
    if (pick.exp) {
      const s = pick.exp;
      const zone = EXP.zoneOf(s.id);
      return {
        junk: false, exp: true, id: s.id, name: s.name, rarity: EXP_RARITY[s.rarity], spot: "secret", golden: false, tier,
        size: Math.round(s.minSize + (s.maxSize - s.minSize) * Math.pow(t, 1.6)),
        value: Math.round(s.price * (zone ? zone.mult || 1 : 1) * (0.7 + 0.6 * t)),
      };
    }
    const b = pick.bred;
    return {
      junk: false, bred: true, id: b.id, name: b.name, rarity: b.rarity, spot: "secret", golden: false, tier,
      size: Math.round(b.size[0] + (b.size[1] - b.size[0]) * Math.pow(t, 1.6)),
      value: Math.round(D.RARITY[b.rarity].base * b.v * (0.7 + 0.9 * t)),
    };
  }
  function avgVipValue(state) {
    const pool = vipPool(state);
    let w = 0;
    let v = 0;
    pool.forEach(([p, x]) => {
      const val = p.exp ? p.exp.price * ((EXP.zoneOf(p.exp.id) || {}).mult || 1) : D.RARITY[p.bred.rarity].base * p.bred.v * 1.15;
      w += x;
      v += x * val;
    });
    return w ? v / w : 0;
  }

  /* ---------------- 수족관 ---------------- */
  function aquaEntry(state, key) {
    const [kind, id] = [key.slice(0, 1), key.slice(2)];
    // sprite = 그림용 어획 객체 (render·ui가 그대로 Sprites.catchSprite에 넘김)
    if (kind === "f") {
      const f = FISH_BY_ID[id];
      const d = state.dex[id];
      return f && d ? { key, kind, id, name: f.name, rarity: f.rarity, golden: !!d.golden, bred: false, sprite: { id, golden: !!d.golden } } : null;
    }
    if (kind === "s") {
      const s = EXP.byId.get(Number(id));
      const rarity = s && EXP_RARITY[s.rarity];
      return s && state.expDex[s.id] ? { key, kind, id, name: s.name, rarity, golden: false, bred: false, sprite: { id: s.id } } : null;
    }
    const b = bredById(state, id);
    return b ? { key, kind, id, name: b.name, rarity: b.rarity, golden: false, bred: true, sprite: { bred: true, id: b.id } } : null;
  }
  const EXP_RARITY = { Common: "common", Rare: "premium", Epic: "rare", Legendary: "legendary" };
  // 등록 가능: 낚은(또는 개량한) 희귀·전설 어종
  function aquaCandidates(state) {
    const out = [];
    D.FISH.forEach((f) => {
      if (state.dex[f.id] && D.AQUARIUM.buff[f.rarity]) {
        out.push(aquaEntry(state, "f:" + f.id));
      }
    });
    state.bred.forEach((b) => {
      if (D.AQUARIUM.buff[b.rarity]) {
        out.push(aquaEntry(state, "b:" + b.id));
      }
    });
    // 원정에서 얻은 영웅·전설 어종 (고래 등)
    Object.keys(state.expDex).forEach((id) => {
      const e = aquaEntry(state, "s:" + id);
      if (e && D.AQUARIUM.buff[e.rarity]) {
        out.push(e);
      }
    });
    return out;
  }

  /* ---------------- 원정 파견 (팝업) ----------------
   * 가두리에는 연안 48종만, 고래·심해 생물(350종)은 원정 파견으로만 얻음.
   * 파견: 배 1척이 dur초(60/120/180) 뒤 귀항 → 해금한 구역 풀에서 catches마리 획득 → 원정 도감에 등록되어
   * 교배 재료("s:번호")·수족관 등록에 바로 쓰임 */
  // 비용 = max(초당 수익 × 시간 × costRatio, 예상 어획 판매가 × haulRatio) → 초반에도 남는 장사지만 과하지 않게
  function dispatchTier(sec) {
    return D.DISPATCH.tiers.find((x) => x.sec === sec) || null;
  }
  function dispatchCatches(sec) {
    return Math.max(1, Math.round((sec / 60) * D.DISPATCH.perMinute));
  }
  // 원정 낚시꾼을 1명 이상 고용해야 해금
  function dispatchUnlocked(state) {
    return (state.owned.crew || 0) > 0;
  }
  // 무료. 잠겨 있거나 이미 나가 있으면 불가
  function startDispatch(state, sec) {
    if (!dispatchUnlocked(state) || state.dispatch || !dispatchTier(sec)) {
      return false;
    }
    state.dispatch = { t: 0, dur: sec };
    return true;
  }
  // 귀항: 시간 등급의 luck·deep·depth로 굴림. 결과는 요약만 저장 (24시간 = 1,440마리)
  function finishDispatch(state, world, rng) {
    const dp = state.dispatch;
    state.dispatch = null;
    const tier = dispatchTier(dp.dur) || D.DISPATCH.tiers[0];
    const prog = expProgress(state);
    const ctx = { luck: tier.luck, deep: tier.deep, depth: tier.depth };
    const byRarity = { Common: 0, Rare: 0, Epic: 0, Legendary: 0 };
    const best = {};
    let gold = 0;
    let total = 0;
    let newCount = 0;
    for (let i = 0; i < dispatchCatches(dp.dur); i++) {
      const c = EXP.rollCatch(prog, ctx, rng);
      if (!c) {
        continue;
      }
      if (registerExp(state, c)) {
        newCount++;
        c.isNew = true;
      }
      total++;
      gold += c.value;
      byRarity[c.rarity]++;
      if (!best[c.id] || c.value > best[c.id].value || c.isNew) {
        best[c.id] = Object.assign({}, c, { isNew: c.isNew || (best[c.id] && best[c.id].isNew) });
      }
    }
    earn(state, world, gold, null);
    const top = Object.values(best).sort((a, b) => (b.isNew - a.isNew) || b.value - a.value).slice(0, 20);
    const res = { dur: dp.dur, name: tier.name, total, byRarity, catches: top, gold: gold * incomeMult(state), newCount, seen: false };
    state.lastDispatch = res;
    world.events.push({ kind: "dispatch", res });
    return res;
  }
  function aquaBuffOf(e) {
    const base = (D.AQUARIUM.buff[e.rarity] || 0) + (e.bred ? D.AQUARIUM.bredBonus : 0);
    return base * (e.golden ? D.AQUARIUM.goldenMult : 1);
  }
  function aquaBuff(state) {
    let s = 0;
    (state.aquarium || []).forEach((k) => {
      const e = aquaEntry(state, k);
      if (e) {
        s += aquaBuffOf(e);
      }
    });
    return s;
  }
  function aquaAdd(state, key) {
    const e = aquaEntry(state, key);
    if (!e || !D.AQUARIUM.buff[e.rarity] || state.aquarium.includes(key) || state.aquarium.length >= D.AQUARIUM.slots) {
      return false;
    }
    state.aquarium.push(key);
    return true;
  }
  function aquaRemove(state, key) {
    const i = state.aquarium.indexOf(key);
    if (i < 0) {
      return false;
    }
    state.aquarium.splice(i, 1);
    return true;
  }
  function reputation(state) {
    if (!state.reviews.length) {
      return 3;
    }
    let s = 0;
    let w = 0;
    state.reviews.forEach((r) => { s += r.stars * r.weight; w += r.weight; });
    return s / w;
  }
  function repMult(state) {
    const rep = Math.min(5, reputation(state) + (state.buffs.cat > 0 ? D.CAT.rep : 0));
    return 0.4 + 0.2 * rep;   // 별3 = 1.0, 별5 = 1.4
  }

  /* ---------------- 고양이·별똥별 ---------------- */
  function catFeedCost(state) {
    return Math.max(30, Math.ceil(expectedRate(state) * D.CAT.feedCostSec));
  }
  function feedCat(state) {
    const c = catFeedCost(state);
    if (state.buffs.cat > 0 || state.money < c) {
      return false;
    }
    state.money -= c;
    state.buffs.cat = D.CAT.buffSec;
    state.stats2.catFed++;
    return true;
  }
  function makeWish(state) {
    state.buffs.wish = D.WISH.buffSec;
    state.stats2.wishes++;
    return true;
  }
  function legendaryMult(state) {
    return state.buffs.wish > 0 ? D.WISH.legendary : 1;
  }
  const MILESTONES = [25, 50, 100, 200, 400];
  function msCount(n) {
    return MILESTONES.filter((m) => n >= m).length;
  }
  function msMult(n) {
    return Math.pow(2, msCount(n));
  }
  function nextMilestone(n) {
    return MILESTONES.find((m) => n < m) || null;
  }
  function catchSpeedMult(state) {
    return Math.pow(1.2, msCount(state.owned.seat));
  }
  function spotBonus(state, night) {
    return 1 + 0.25 * (availableSpots(state, night).length - 1);
  }
  function seats(state) {
    return state.owned.seat;
  }
  function stayMult(state) {
    return state.upgrades.shade ? 1.2 : 1;
  }
  function avgStay(state) {
    let s = 0;
    let w = 0;
    D.GUEST_TYPES.forEach((g) => { s += g.stay * g.weight; w += g.weight; });
    return BASE_STAY * stayMult(state) * (s / w);
  }
  function arrivalRate(state, night, weather) {
    const o = state.owned;
    let r = (0.12 + 0.08 * o.shuttle) * (1 + 0.2 * o.rental);
    if (state.upgrades.sns) {
      r *= 1.5;
    }
    if (state.upgrades.tv) {
      r *= 1.2;
    }
    if (state.buffs.cat > 0) {
      r *= D.CAT.arrive;
    }
    r *= repMult(state);
    if (night && !state.upgrades.night) {
      r *= 0.4;
    }
    let wa = D.WEATHER[weather].arrive;
    if (weather === "typhoon" && state.upgrades.typhoon) {
      wa = 0.5;
    }
    return r * wa;
  }
  function feePerGuest(state, g) {
    return (20 + 4 * state.owned.rental * msMult(state.owned.rental)) * g.fee * (state.upgrades.tv ? 1.5 : 1);
  }
  function shopPerGuest(state, g) {
    return 6 * state.owned.shop * msMult(state.owned.shop) * g.shop;
  }
  function cookRate(state) {
    return 0.05 * state.owned.restaurant * msMult(state.owned.restaurant);
  }
  // 자리가 없어 낚시는 못 하고 구경·매점만 이용하는 손님 1명당 지출
  function walkinPerGuest(state, g) {
    return (feePerGuest(state, g) * D.WALKIN.fee + shopPerGuest(state, g)) * D.WALKIN.spend;
  }
  // 계절 날씨 확률로 본 평균 방문 배율 (태풍 보강 반영)
  function weatherArriveAvg(state, season) {
    const odds = D.WEATHER_ODDS[season];
    let s = 0;
    let w = 0;
    Object.entries(odds).forEach(([k, p]) => {
      let a = D.WEATHER[k].arrive;
      if (k === "typhoon" && state.upgrades.typhoon) {
        a = 0.5;
      }
      s += a * p;
      w += p;
    });
    return s / w;
  }
  function passivePerSec(state) {
    const pension = 60 * state.owned.pension * msMult(state.owned.pension) * (reputation(state) / 3);
    const farm = 900 * state.owned.farm * msMult(state.owned.farm);
    return pension + farm;
  }

  /* ---------------- 어종 뽑기 ---------------- */
  function availableSpots(state, night) {
    const s = ["cage"];
    if (state.upgrades.boat) {
      s.push("boat");
    }
    if (state.upgrades.night && night) {
      s.push("night");
    }
    if (state.upgrades.rock) {
      s.push("rock");
    }
    return s;
  }
  function rarityWeights(state, rarityMult, spot, night) {
    const w = {};
    const sb = spotBonus(state, night);
    D.RARITY_ORDER.forEach((r) => {
      let x = D.RARITY[r].weight;
      if (r !== "common") {
        x *= rarityMult * sb;
        if (state.upgrades.bait) {
          x *= 1.5;
        }
        if (spot === "cage") {
          x *= 1 + Math.min(0.5, 0.02 * state.owned.farm);
        }
        if (r === "legendary") {
          x *= legendaryMult(state);
        }
      }
      w[r] = x;
    });
    return w;
  }
  function pickWeighted(rng, entries) {
    let total = 0;
    entries.forEach((e) => { total += e[1]; });
    let x = rng() * total;
    for (const e of entries) {
      x -= e[1];
      if (x <= 0) {
        return e[0];
      }
    }
    return entries[entries.length - 1][0];
  }
  function fishPool(spot, rarity, season) {
    return D.FISH.filter((f) => f.rarity === rarity && f.spots.includes(spot))
      .map((f) => [f, f.seasons.includes(season) ? 2.5 : 1]);
  }
  function rollFish(state, rng, opt) {
    opt = opt || {};
    const ck = clockInfo(state);
    if (rng() < (opt.junkChance === undefined ? D.JUNK_CHANCE : opt.junkChance)) {
      const j = D.JUNK[Math.floor(rng() * D.JUNK.length)];
      return { junk: true, id: j.id, name: j.name, value: 0, rarity: "junk" };
    }
    const spots = availableSpots(state, ck.night);
    const spot = pickWeighted(rng, spots.map((s) => [s, D.SPOTS[s].weight]));
    const rw = rarityWeights(state, opt.rarityMult || 1, spot, ck.night);
    const rarities = D.RARITY_ORDER.filter((r) => fishPool(spot, r, ck.season).length > 0);
    const rarity = pickWeighted(rng, rarities.map((r) => [r, rw[r]]));
    const f = pickWeighted(rng, fishPool(spot, rarity, ck.season));
    const t = rng();
    const size = Math.round(f.size[0] + (f.size[1] - f.size[0]) * Math.pow(t, 1.6));
    const sizeMult = 0.7 + 0.9 * t;
    const gChance = D.GOLDEN_CHANCE * (state.upgrades.golden ? 3 : 1);
    const golden = rng() < gChance;
    const value = Math.round(D.RARITY[rarity].base * f.v * sizeMult * (golden ? 10 : 1));
    const tier = t > 0.9 ? "대물" : t > 0.6 ? "대" : t > 0.3 ? "중" : "소";
    return { junk: false, id: f.id, name: f.name, rarity, spot, size, value, golden, tier };
  }
  function registerCatch(state, c) {
    state.stats.catches++;
    if (c.junk) {
      return false;
    }
    if (c.exp) {
      const d = state.expDex[c.id] || { count: 0, best: 0 };
      d.count++;
      d.best = Math.max(d.best, c.size);
      state.expDex[c.id] = d;
      return false;
    }
    if (c.bred) {
      const b = bredById(state, c.id);
      state.stats.bredCatches++;
      if (!b) {
        return false;
      }
      const first = b.caught === 0;
      b.caught++;
      b.best = Math.max(b.best, c.size);
      return first;
    }
    if (c.golden) {
      state.stats.golden++;
    }
    const isNew = !state.dex[c.id];
    const d = state.dex[c.id] || { count: 0, best: 0, golden: false };
    d.count++;
    d.best = Math.max(d.best, c.size);
    d.golden = d.golden || c.golden;
    state.dex[c.id] = d;
    return isNew;
  }

  // 기대 어획 가치 (오프라인·초당 수익 표시용)
  function expectedFishValue(state, night, rarityMult) {
    const season = clockInfo(state).season;
    const spots = availableSpots(state, night);
    let sw = 0;
    spots.forEach((s) => { sw += D.SPOTS[s].weight; });
    let ev = 0;
    spots.forEach((spot) => {
      const rw = rarityWeights(state, rarityMult || 1, spot, night);
      const rarities = D.RARITY_ORDER.filter((r) => fishPool(spot, r, season).length > 0);
      let rt = 0;
      rarities.forEach((r) => { rt += rw[r]; });
      rarities.forEach((r) => {
        const pool = fishPool(spot, r, season);
        let pw = 0;
        let pv = 0;
        pool.forEach(([f, w]) => { pw += w; pv += w * f.v; });
        ev += (D.SPOTS[spot].weight / sw) * (rw[r] / rt) * D.RARITY[r].base * (pv / pw);
      });
    });
    const gChance = D.GOLDEN_CHANCE * (state.upgrades.golden ? 3 : 1);
    return ev * 1.15 * (1 + 9 * gChance) * (1 - D.JUNK_CHANCE);
  }

  // 평균 손님 1명당 수입 + 처리량 → 초당 기대 수익
  function expectedRate(state, opts) {
    opts = opts || {};
    const nightFrac = 10 / 24;
    const weatherAvg = opts.weatherAvg === undefined ? weatherArriveAvg(state, clockInfo(state).season) : opts.weatherAvg;
    const calc = (night) => {
      let gw = 0;
      let perGuest = 0;
      let perWalkin = 0;
      const stay = avgStay(state);
      D.GUEST_TYPES.forEach((g) => { gw += g.weight; });
      D.GUEST_TYPES.forEach((g) => {
        const p = g.weight / gw;
        const catches = (BASE_STAY * stayMult(state) * g.stay) * catchSpeedMult(state) / BASE_CATCH_INTERVAL;
        perGuest += p * (feePerGuest(state, g) + shopPerGuest(state, g) +
          catches * expectedFishValue(state, night, g.rarity) * cookRate(state));
        perWalkin += p * walkinPerGuest(state, g);
      });
      const arrive = arrivalRate(state, night, "sunny") * weatherAvg;
      const thru = Math.min(arrive, seats(state) / (stay + WALK_IN));
      return thru * perGuest + Math.max(0, arrive - thru) * perWalkin + vipExtraPerSec(state, Math.min(arrive, thru + 0.0001), night);
    };
    const active = opts.night === undefined
      ? (1 - nightFrac) * calc(false) + nightFrac * calc(true)
      : calc(opts.night);
    return (active + passivePerSec(state) + expIncome(state)) * incomeMult(state);
  }

  // 단골이 추가로 내는 돈: 팁 + (호감도 10 VIP가 비밀 양식장 좌대에 앉으면) 이용료 20배·신종 손질 매출
  function vipExtraPerSec(state, arrive, night) {
    const regs = state.vip.regulars;
    if (!regs.length || arrive <= 0) {
      return 0;
    }
    let gw = 0;
    let fee = 0;
    let shop = 0;
    D.GUEST_TYPES.forEach((g) => { gw += g.weight; });
    D.GUEST_TYPES.forEach((g) => {
      fee += (g.weight / gw) * feePerGuest(state, g);
      shop += (g.weight / gw) * shopPerGuest(state, g);
    });
    const perReg = (arrive * regularChance(state)) / regs.length;   // 단골 1명의 초당 방문
    let extra = 0;
    let vipRate = 0;
    regs.forEach((r) => {
      const lv = vipLevel(r);
      extra += perReg * tipChance(lv) * D.VIP.tipShare * (fee + shop);
      if (lv >= 10 && state.upgrades.secret) {
        vipRate += perReg;
      }
    });
    if (vipRate > 0) {
      const stay = BASE_STAY * stayMult(state) * D.VIP.lv5Stay;
      vipRate = Math.min(vipRate, D.VIP.secretSeats / (stay + WALK_IN));
      const catches = stay * catchSpeedMult(state) / BASE_CATCH_INTERVAL;
      extra += vipRate * (fee * (vipFeeMult(maxVipLevel(state)) - 1) + catches * avgVipValue(state) * cookRate(state));
    }
    return extra;
  }

  /* ---------------- 월드 (저장 안 하는 실시간 시뮬) ---------------- */
  function newWorld(rng) {
    return {
      rng: rng || Math.random,
      guests: [],              // { type, seat, stay, left, nextCatch, sat, caught:[], reg, vip }
      seatOcc: [],
      vipOcc: [],              // 비밀 양식장 VIP 좌대 (seat = VIP_SEAT0 + k)
      present: {},             // 지금 와 있는 단골 id
      expCatchAcc: 0,
      expMoneyAcc: 0,
      lastExpPop: 0,
      arriveAcc: 0,
      nextArrive: 1,
      events: [],              // 렌더/UI가 소비
      cast: null,              // { t, dur }
      castCd: 0,
      time: 0,
    };
  }

  function earn(state, world, amount, info) {
    if (amount <= 0) {
      return 0;
    }
    const a = amount * incomeMult(state);
    state.money += a;
    state.totalEarned += a;
    if (info) {
      world.events.push(Object.assign({ kind: "money", amount: a }, info));
    }
    return a;
  }

  function pickGuestType(state, rng) {
    return pickWeighted(rng, D.GUEST_TYPES.map((g) => [g, g.id === "pro" && state.upgrades.tv ? g.weight * 3 : g.weight]));
  }

  const VIP_SEAT0 = 1000;
  function spawnGuest(state, world) {
    const rng = world.rng;
    // 단골이 올 차례인지
    let reg = null;
    const free = state.vip.regulars.filter((r) => !world.present[r.id]);
    if (free.length && rng() < regularChance(state)) {
      reg = free[Math.floor(rng() * free.length)];
    }
    const g = reg ? guestTypeById(reg.type) : pickGuestType(state, rng);
    const lv = reg ? vipLevel(reg) : 0;
    let seat = -1;
    // 호감도 10 VIP는 비밀 양식장 전용 좌대로
    if (lv >= 10 && state.upgrades.secret) {
      for (let k = 0; k < D.VIP.secretSeats; k++) {
        if (!world.vipOcc[k]) {
          seat = VIP_SEAT0 + k;
          break;
        }
      }
    }
    if (seat < 0) {
      for (let i = 0; i < seats(state); i++) {
        if (!world.seatOcc[i]) {
          seat = i;
          break;
        }
      }
    }
    if (seat < 0) {
      state.stats.missed++;
      earn(state, world, walkinPerGuest(state, g), { src: "walkin" });
      return null;
    }
    const vip = seat >= VIP_SEAT0;
    const perk = lv >= 5;
    const stay = BASE_STAY * stayMult(state) * g.stay * (perk ? D.VIP.lv5Stay : 1) * (0.85 + rng() * 0.3);
    const guest = {
      type: g, seat, stay, left: stay, reg, vip, lv, walk: WALK_IN,
      rarity: g.rarity * (perk ? D.VIP.lv5Rarity : 1),
      nextCatch: BASE_CATCH_INTERVAL * (0.5 + rng()),
      sat: 55 + (state.upgrades.shade ? 5 : 0) + (perk ? 10 : 0),
      caught: [], bite: 0,
    };
    if (vip) {
      world.vipOcc[seat - VIP_SEAT0] = guest;
    } else {
      world.seatOcc[seat] = guest;
    }
    if (reg) {
      world.present[reg.id] = true;
      state.stats.vipVisits++;
    }
    world.guests.push(guest);
    state.stats.guests++;
    const fee = feePerGuest(state, g) * (vip ? vipFeeMult(lv) : 1);
    earn(state, world, fee + shopPerGuest(state, g), { seat, src: "guest" });
    world.events.push({ kind: "arrive", seat, type: g.id, reg: reg ? { nick: reg.nick, lv } : null, vip });
    return guest;
  }

  function guestCatch(state, world, guest) {
    const c = guest.vip ? rollBred(state, world.rng) : rollFish(state, world.rng, { rarityMult: guest.rarity });
    if (!c) {
      return;
    }
    guest.caught.push(c);
    guest.bite = 1.2;
    const isNew = registerCatch(state, c);
    if (c.junk) {
      guest.sat -= 3;
    } else {
      guest.sat += D.RARITY[c.rarity].sat + (c.golden ? 25 : 0);
      earn(state, world, c.value * cookRate(state), { seat: guest.seat, src: "cook" });
    }
    world.events.push({ kind: "catch", seat: guest.seat, fish: c, isNew, who: guest.type.name });
  }

  function makeReview(state, world, guest) {
    const rng = world.rng;
    const ck = clockInfo(state);
    let sat = guest.sat + D.WEATHER[state.weather].sat;
    if (!guest.caught.some((c) => !c.junk)) {
      sat -= 25;
    }
    const stars = Math.max(1, Math.min(5, Math.round(sat / 20)));
    const texts = D.REVIEW_TEXT[stars];
    const nick = guest.reg ? guest.reg.nick : D.NICK_A[Math.floor(rng() * D.NICK_A.length)] + D.NICK_B[Math.floor(rng() * D.NICK_B.length)];
    // 단골: 팁·호감도 / 일반 손님: 만족하면 단골 등록
    if (guest.reg) {
      const r = guest.reg;
      const before = vipLevel(r);
      if (rng() < tipChance(before)) {
        const tip = (feePerGuest(state, guest.type) + shopPerGuest(state, guest.type)) * D.VIP.tipShare;
        state.stats.tips++;
        earn(state, world, tip, { seat: guest.seat, src: "tip" });
      }
      r.xp += 1 + Math.max(0, stars - 3);
      r.visits++;
      const after = vipLevel(r);
      if (after > before) {
        world.events.push({ kind: "vipLevel", nick: r.nick, lv: after, title: vipTitle(after) });
      }
    } else if (stars >= 4 && state.vip.regulars.length < D.VIP.max && rng() < D.VIP.joinChance) {
      const r = { id: state.vip.nextId++, nick, type: guest.type.id, xp: 1, visits: 1 };
      state.vip.regulars.push(r);
      world.events.push({ kind: "newRegular", nick, type: guest.type.name });
    }
    const best = guest.caught.filter((c) => !c.junk).sort((a, b) => b.value - a.value)[0];
    const r = {
      nick, stars, text: texts[Math.floor(rng() * texts.length)],
      type: guest.type.name, weight: guest.type.review,
      fish: best ? best.name + " " + fmtSize(best.size) : "꽝",
      day: ck.day,
    };
    state.reviews.unshift(r);
    if (state.reviews.length > 40) {
      state.reviews.length = 40;
    }
    world.events.push({ kind: "review", review: r });
  }

  function rollWeather(state, rng) {
    const odds = D.WEATHER_ODDS[clockInfo(state).season];
    return pickWeighted(rng, Object.entries(odds).filter((e) => e[1] > 0));
  }

  function tick(state, world, dt) {
    const rng = world.rng;
    world.time += dt;
    state.gameMin += dt * GAME_MIN_PER_SEC;

    // 날씨
    state.weatherTimer -= dt;
    if (state.weatherTimer <= 0) {
      state.weatherTimer = WEATHER_PERIOD;
      const prev = state.weather;
      state.weather = rollWeather(state, rng);
      if (prev !== state.weather) {
        world.events.push({ kind: "weather", weather: state.weather });
      }
    }

    // 손님 도착 (지수분포 간격)
    const ck = clockInfo(state);
    const lam = arrivalRate(state, ck.night, state.weather);
    if (lam > 0) {
      world.nextArrive -= dt;
      let guard = 0;
      while (world.nextArrive <= 0 && guard++ < 50) {
        spawnGuest(state, world);
        world.nextArrive += -Math.log(1 - rng() * 0.999) / lam;
      }
    }

    // 손님 진행
    const cs = D.WEATHER[state.weather].catchSpeed * catchSpeedMult(state);
    for (let i = world.guests.length - 1; i >= 0; i--) {
      const g = world.guests[i];
      // 입구에서 자리까지 걸어오는 중: 자리는 잡았지만 아직 낚시 안 함
      if (g.walk > 0) {
        g.walk -= dt;
        continue;
      }
      g.left -= dt;
      g.bite = Math.max(0, g.bite - dt);
      g.nextCatch -= dt * cs;
      if (g.nextCatch <= 0 && g.left > 0) {
        guestCatch(state, world, g);
        g.nextCatch += BASE_CATCH_INTERVAL * (0.5 + rng());
      }
      if (g.left <= 0 || (!g.vip && g.seat >= seats(state))) {
        makeReview(state, world, g);
        if (g.vip) {
          world.vipOcc[g.seat - VIP_SEAT0] = null;
        } else {
          world.seatOcc[g.seat] = null;
        }
        if (g.reg) {
          world.present[g.reg.id] = false;
        }
        world.guests.splice(i, 1);
        world.events.push({ kind: "leave", seat: g.seat, guest: g });
      }
    }

    // 원정 낚시: 수익은 연속으로, 어획(도감용)은 낚시꾼 수만큼 굴림
    const crew = state.owned.crew || 0;
    if (crew > 0) {
      const got = earn(state, world, expIncome(state) * dt, null);
      world.expMoneyAcc += got;
      if (world.time - world.lastExpPop > 3) {
        world.events.push({ kind: "money", amount: world.expMoneyAcc, src: "exp" });
        world.expMoneyAcc = 0;
        world.lastExpPop = world.time;
      }
      world.expCatchAcc = Math.min(5, world.expCatchAcc + (dt * crew) / SM.OFFLINE.catchInterval);
      const ctx = { weather: SM.toWeather(state.weather), time: SM.toTime(ck.hour) };
      let n = 0;
      while (world.expCatchAcc >= 1 && n++ < 3) {
        world.expCatchAcc -= 1;
        const c = EXP.rollCatch(expProgress(state), ctx, rng);
        if (c) {
          const isNew = registerExp(state, c);
          world.events.push({ kind: "expcatch", fish: c, isNew });
        }
      }
    }

    // 버프 시간
    // 원정 파견 귀항
    if (state.dispatch) {
      state.dispatch.t += dt;
      if (state.dispatch.t >= state.dispatch.dur) {
        finishDispatch(state, world, rng);
      }
    }
    // 사장님 자동 낚시: 30초마다 저절로 던지고, 꽝 없이 성공
    if (state.autoCast) {
      world.autoT = (world.autoT === undefined ? 0 : world.autoT) - dt;
      if (world.autoT <= 0 && !world.cast && world.castCd <= 0) {
        startCast(world, true);
        world.autoT = D.AUTO_CAST_SEC;
      }
    }
    state.buffs.cat = Math.max(0, state.buffs.cat - dt);
    state.buffs.wish = Math.max(0, state.buffs.wish - dt);

    // 비밀 양식장 교배 진행
    if (state.breeding) {
      state.breeding.t += dt;
      if (state.breeding.t >= state.breeding.dur) {
        const res = finishBreed(state, rng);
        if (res) {
          world.events.push({ kind: "bred", bred: res.bred, dup: res.dup, route: res.route, hinted: res.hinted });
        }
      }
    }

    // 펜션·양식장 수입
    earn(state, world, passivePerSec(state) * dt, null);
    world.passiveAcc = (world.passiveAcc || 0) + passivePerSec(state) * dt * incomeMult(state);
    if (world.passiveAcc > 0 && world.time - (world.lastPassivePop || 0) > 3) {
      world.events.push({ kind: "money", amount: world.passiveAcc, src: "passive" });
      world.passiveAcc = 0;
      world.lastPassivePop = world.time;
    }

    // 사장님 직접 낚시
    world.castCd = Math.max(0, world.castCd - dt);
    if (world.cast) {
      world.cast.t += dt;
      if (world.cast.t >= world.cast.dur) {
        const c = rollFish(state, rng, { rarityMult: 1.2, junkChance: world.cast.auto ? 0 : 0.05 });
        const isNew = registerCatch(state, c);
        state.stats.ownerCasts++;
        const bonus = expectedRate(state) * 3 / incomeMult(state);
        const got = earn(state, world, c.value + bonus, { src: "owner" });
        world.events.push({ kind: "catch", owner: true, fish: c, isNew, amount: got });
        world.cast = null;
      }
    }
  }

  function startCast(world, auto) {
    if (world.cast || world.castCd > 0) {
      return false;
    }
    world.cast = { t: 0, dur: 1.4, auto: !!auto };
    world.castCd = 1.8;
    return true;
  }

  /* ---------------- 오프라인 ---------------- */
  function applyOffline(state, now) {
    const elapsed = Math.max(0, Math.min(OFFLINE_CAP, (now - state.lastSave) / 1000));
    if (!isFinite(elapsed) || elapsed < 30) {
      return null;
    }
    const eff = state.upgrades.fridge ? 0.8 : 0.5;
    const gain = expectedRate(state) * elapsed * eff;
    state.money += gain;
    state.totalEarned += gain;
    state.gameMin += elapsed * GAME_MIN_PER_SEC;
    state.lastSave = now;
    // 원정대 방치 어획: 돈은 위 gain에 이미 들어 있으니 도감 표본만 반영
    let expFound = 0;
    let expBest = null;
    const crew = state.owned.crew || 0;
    if (crew > 0) {
      const res = EXP.computeOffline(expProgress(state), elapsed, { anglers: crew, efficiency: eff });
      expFound = res.discovered.length;
      expBest = res.best;
      res.samples.forEach((c) => registerExp(state, c));
    }
    if (state.breeding) {
      state.breeding.t += elapsed;
    }
    if (state.dispatch) {
      state.dispatch.t += elapsed;   // 다음 틱에 귀항 처리
    }
    state.buffs.cat = Math.max(0, state.buffs.cat - elapsed);
    state.buffs.wish = Math.max(0, state.buffs.wish - elapsed);
    return { elapsed, gain, eff, expFound, expBest };
  }

  /* ---------------- 저장 ---------------- */
  function serialize(state) {
    return JSON.stringify(state);
  }
  function deserialize(str) {
    const raw = JSON.parse(str);
    if (!raw || typeof raw !== "object") {
      throw new Error("bad save");
    }
    // 버전 마이그레이션 체인 (현재 v1)
    const st = mergeDefaults(newState(), raw);
    BM.migrate(st);
    st.version = VERSION;
    if (!isFinite(st.money)) {
      st.money = 0;
    }
    return st;
  }
  function exportSave(state) {
    const s = serialize(state);
    return typeof btoa === "function"
      ? btoa(unescape(encodeURIComponent(s)))
      : Buffer.from(s, "utf8").toString("base64");
  }
  function importSave(b64) {
    const s = typeof atob === "function"
      ? decodeURIComponent(escape(atob(b64.trim())))
      : Buffer.from(b64.trim(), "base64").toString("utf8");
    return deserialize(s);
  }

  // 크기 표기: 10m 미만은 cm, 그 이상은 m
  function fmtSize(cm) {
    if (cm < 1000) {
      return Math.round(cm) + "cm";
    }
    const m = cm / 100;
    return (m >= 100 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, "")) + "m";
  }

  /* ---------------- 숫자 표기 ---------------- */
  function fmt(n) {
    if (!isFinite(n)) {
      return "∞";
    }
    const neg = n < 0;
    n = Math.abs(n);
    let out;
    if (n < 10000) {
      out = Math.floor(n).toLocaleString("ko-KR");
    } else {
      const units = [["경", 1e16], ["조", 1e12], ["억", 1e8], ["만", 1e4]];
      const u = units.find((x) => n >= x[1]);
      const v = n / u[1];
      out = (v >= 1000 ? Math.floor(v).toLocaleString("ko-KR") : v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2).replace(/\.?0+$/, "")) + u[0];
    }
    return (neg ? "-" : "") + out;
  }

  const Game = {
    VERSION, SAVE_KEY, GAME_MIN_PER_SEC, SEASONS, OFFLINE_CAP, FAC, UPG, FISH_BY_ID,
    MILESTONES, msCount, msMult, nextMilestone, catchSpeedMult, spotBonus,
    newState, newWorld, clockInfo, costOf, costOfN, maxAffordable, facilityVisible, buyFacility,
    upgradeVisible, upgradeBlock, buyUpgrade, dexCount, incomeMult, reputation, repMult, seats, avgStay,
    EXP, SM, VIP_SEAT0, expProgress, expIncome, expPerAngler, expDexCount, registerExp,
    vipLevel, vipTitle, maxVipLevel, regularChance, tipChance, vipExtraPerSec,
    BM, bredById, parentInfo, breedParents, breedRoute, breedCost, breedBlock, startBreed, finishBreed, rollBred,
    breedCatalog, hintCost, buyHint,
    aquaEntry, aquaCandidates, aquaBuffOf, aquaBuff, aquaAdd, aquaRemove,
    catFeedCost, feedCat, makeWish, legendaryMult, fmtSize, WALK_IN,
    dispatchTier, dispatchCatches, startDispatch, dispatchUnlocked, finishDispatch, vipXpFor, vipFeeMult, vipPool,
    arrivalRate, feePerGuest, shopPerGuest, walkinPerGuest, weatherArriveAvg, cookRate, passivePerSec, availableSpots,
    rollFish, registerCatch, expectedFishValue, expectedRate, tick, startCast, spawnGuest,
    applyOffline, serialize, deserialize, exportSave, importSave, fmt,
  };
  root.Game = Game;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = Game;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
