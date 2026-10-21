/* ============================================================
 * SPECIES MANAGER — 350종 어종 풀 · 구역 해금 · 오프라인 방치 보상
 * 게임 상태와 분리된 계산 모듈 (브라우저/Node 공용)
 *
 * 사용 예:
 *   const M = SpeciesManager.create(SpeciesData);
 *   const prog = M.newProgress();            // { money, unlocked:["coast"], dex:{} }
 *   M.unlockZone(prog, "bay");               // 돈이 충분하면 해금 → 풀 확장
 *   const res = M.computeOffline(prog, 3600); // 1시간 방치 보상 계산
 *   M.applyOffline(prog, res);               // 돈·도감 반영
 * ============================================================ */
(function (root) {
  "use strict";

  /* ---------------- 설정 (밸런스 조정은 여기) ---------------- */
  const RARITIES = ["Common", "Rare", "Epic", "Legendary"];
  const RARITY_INFO = {
    Common: { name: "일반", weight: 70 },
    Rare: { name: "희귀", weight: 22 },
    Epic: { name: "영웅", weight: 6.5 },
    Legendary: { name: "전설", weight: 1.5 },
  };
  const WEATHERS = ["Clear", "Cloudy", "Rainy", "Stormy"];
  const TIMES = ["Morning", "Day", "Evening", "Night"];
  // 하루 중 시간대 비율: 아침 05~10시, 낮 10~17시, 저녁 17~21시, 밤 21~05시
  const TIME_SHARE = { Morning: 5 / 24, Day: 7 / 24, Evening: 4 / 24, Night: 8 / 24 };
  const WEATHER_ODDS = { Clear: 55, Cloudy: 25, Rainy: 14, Stormy: 6 };
  const PREFERRED_BONUS = 1.5;        // 선호 날씨일 때 그 어종 출현 가중치
  // 가장 깊이 연 구역에서 주로 낚음: 한 구역 얕을수록 출현 가중치 ÷ZONE_FOCUS
  // (1이면 전 구역 균등 → 새 구역을 열어도 수익이 거의 안 오름)
  const ZONE_FOCUS = 2;

  // 구역은 순서대로 해금. keywordOnly 구역은 이름 키워드에 맞는 어종만 들어감
  // mult = 그 구역 어종의 판매가·idleDps 배율 (깊은 바다 프리미엄)
  // unlockCost = 직전 단계 방치 수익(낚시꾼 1명, 효율 100%)으로 약 0.5·1·2·3·4시간분
  const ZONES = [
    { id: "coast", name: "연안 가두리", unlockCost: 0, mult: 1 },
    { id: "bay", name: "내만 선착장", unlockCost: 2e5, mult: 1.4 },
    { id: "offshore", name: "근해 선상", unlockCost: 6e5, mult: 2 },
    { id: "reef", name: "갯바위·암초", unlockCost: 1.8e6, mult: 3 },
    { id: "ocean", name: "외해 원양", unlockCost: 4.5e6, mult: 4.5 },
    { id: "abyss", name: "심해", unlockCost: 1e7, mult: 7, keywordOnly: true, keywords: ["고래", "심해"] },
  ];

  const OFFLINE = {
    cap: 8 * 3600,         // 최대 인정 시간 (초)
    efficiency: 0.5,       // 방치 효율 (냉장 창고 등으로 상향)
    catchInterval: 9,      // 자동 낚시꾼 1명의 평균 입질 간격 (초)
    anglers: 1,            // 자동 낚시꾼 수
    saleShare: 1,          // 어획물 판매 수익 반영 비율 (0이면 idleDps만)
    sampleCap: 300,        // 실제로 굴려보는 어획 표본 수 (도감·최고 기록용)
  };

  /* ---------------- 검증 ---------------- */
  // 잘못된 항목은 버리고, 경고는 모아서 돌려줌
  function validate(raw) {
    const list = [];
    const warnings = [];
    const seenId = new Set();
    const seenName = new Map();
    (Array.isArray(raw) ? raw : []).forEach((s, i) => {
      const where = "#" + i + (s && s.name ? " " + s.name : "");
      if (!s || typeof s !== "object") {
        warnings.push(where + ": 객체가 아님 → 제외");
        return;
      }
      if (!Number.isFinite(s.id) || seenId.has(s.id)) {
        warnings.push(where + ": id 없음 또는 중복 → 제외");
        return;
      }
      if (!RARITY_INFO[s.rarity]) {
        warnings.push(where + ": 알 수 없는 희귀도 " + s.rarity + " → 제외");
        return;
      }
      if (!(s.minSize > 0) || !(s.maxSize >= s.minSize) || !(s.price >= 0) || !(s.idleDps >= 0)) {
        warnings.push(where + ": 크기·가격·idleDps 값 이상 → 제외");
        return;
      }
      const c = s.conditions || {};
      const weather = (c.weather || []).filter((w) => WEATHERS.includes(w));
      const timeOfDay = (c.timeOfDay || []).filter((t) => TIMES.includes(t));
      if (!weather.length || !timeOfDay.length) {
        warnings.push(where + ": 출현 조건 없음 → 제외");
        return;
      }
      if (seenName.has(s.name)) {
        warnings.push(where + ": 이름 중복 (id " + seenName.get(s.name) + "와 같음)");
      } else {
        seenName.set(s.name, s.id);
      }
      seenId.add(s.id);
      list.push({
        id: s.id, name: String(s.name), rarity: s.rarity,
        minSize: s.minSize, maxSize: s.maxSize, price: s.price, idleDps: s.idleDps,
        zone: s.zone,
        conditions: {
          weather, timeOfDay,
          preferredWeather: weather.includes(c.preferredWeather) ? c.preferredWeather : null,
        },
        description: s.description || "",
      });
    });
    return { list, warnings };
  }

  /* ---------------- 구역 배정 ---------------- */
  // 1) 데이터에 zone이 있으면 그대로  2) 이름 키워드 구역  3) 나머지는 희귀도마다
  //    가치 점수(가격·idleDps를 희귀도 평균으로 나눠 더한 값) 순으로 정렬해 일반 구역에
  //    고르게 나눔 → 구역마다 모든 희귀도가 섞이고, 깊은 구역일수록 같은 희귀도 안에서
  //    비싸고 방치 수익이 높은 어종이 나옴 (원본 데이터는 희귀도 안에서 가격과 idleDps가
  //    거의 무관해서 한쪽만 기준으로 삼으면 다른 쪽은 구역을 열어도 안 오름)
  function assignZones(list, zones) {
    const zoneIndex = new Map(zones.map((z, i) => [z.id, i]));
    const out = new Map();
    const rest = [];
    list.forEach((s) => {
      if (s.zone && zoneIndex.has(s.zone)) {
        out.set(s.id, zoneIndex.get(s.zone));
        return;
      }
      const forced = zones.findIndex((z) => (z.keywords || []).some((k) => s.name.includes(k)));
      if (forced >= 0) {
        out.set(s.id, forced);
      } else {
        rest.push(s);
      }
    });
    const open = zones.map((z, i) => i).filter((i) => !zones[i].keywordOnly);
    RARITIES.forEach((r) => {
      const group = rest.filter((s) => s.rarity === r);
      const mean = (k) => group.reduce((a, s) => a + s[k], 0) / Math.max(1, group.length) || 1;
      const mp = mean("price");
      const md = mean("idleDps");
      const score = (s) => s.price / mp + s.idleDps / md;
      group.sort((a, b) => score(a) - score(b) || a.id - b.id);
      group.forEach((s, k) => {
        out.set(s.id, open[Math.floor((k * open.length) / group.length)]);
      });
    });
    return out;
  }

  /* ---------------- 게임 값 변환 ---------------- */
  const GAME_WEATHER = { sunny: "Clear", cloudy: "Cloudy", rain: "Rainy", typhoon: "Stormy" };
  function toWeather(gameWeather) {
    return GAME_WEATHER[gameWeather] || "Clear";
  }
  function toTime(hour) {
    if (hour >= 5 && hour < 10) {
      return "Morning";
    }
    if (hour >= 10 && hour < 17) {
      return "Day";
    }
    if (hour >= 17 && hour < 21) {
      return "Evening";
    }
    return "Night";
  }

  /* ---------------- 매니저 ---------------- */
  function create(rawSpecies, options) {
    options = options || {};
    const zones = options.zones || ZONES;
    const offlineCfg = Object.assign({}, OFFLINE, options.offline);
    const zoneFocus = options.zoneFocus || ZONE_FOCUS;
    const { list, warnings } = validate(rawSpecies);
    const zoneOf = assignZones(list, zones);
    const byId = new Map(list.map((s) => [s.id, s]));
    const tableCache = new Map();
    const zoneMult = (s) => zones[zoneOf.get(s.id)].mult || 1;

    function newProgress() {
      return { money: 0, unlocked: [zones[0].id], dex: {} };
    }

    /* ----- 구역 ----- */
    // 해금된 가장 깊은 구역 번호 (구역은 순서대로만 열림)
    function depth(progress) {
      let d = 0;
      zones.forEach((z, i) => {
        if (progress.unlocked.includes(z.id)) {
          d = Math.max(d, i);
        }
      });
      return d;
    }
    function nextZone(progress) {
      return zones[depth(progress) + 1] || null;
    }
    function canUnlock(progress, zoneId) {
      const nz = nextZone(progress);
      if (!nz || nz.id !== zoneId) {
        return { ok: false, reason: "이전 구역부터 열어야 해요" };
      }
      if (progress.money < nz.unlockCost) {
        return { ok: false, reason: "돈이 부족해요", cost: nz.unlockCost };
      }
      return { ok: true, cost: nz.unlockCost };
    }
    function unlockZone(progress, zoneId) {
      const chk = canUnlock(progress, zoneId);
      if (!chk.ok) {
        return chk;
      }
      const before = poolFor(progress).length;
      progress.money -= chk.cost;
      progress.unlocked.push(zoneId);
      return { ok: true, cost: chk.cost, added: poolFor(progress).length - before };
    }

    /* ----- 어종 풀 ----- */
    function poolFor(progress) {
      const d = depth(progress);
      return list.filter((s) => zoneOf.get(s.id) <= d);
    }
    function zoneSpecies(zoneId) {
      const i = zones.findIndex((z) => z.id === zoneId);
      return list.filter((s) => zoneOf.get(s.id) === i);
    }

    /* ----- 드랍 확률 ----- */
    function condWeight(s, weather, time) {
      const c = s.conditions;
      if (!c.weather.includes(weather) || !c.timeOfDay.includes(time)) {
        return 0;
      }
      return c.preferredWeather === weather ? PREFERRED_BONUS : 1;
    }
    // 한 날씨·시간대에서의 확률표. 희귀도 → 어종 순서로 뽑음
    function contextTable(pool, weather, time, luck, d) {
      const inR = {};
      RARITIES.forEach((r) => { inR[r] = []; });
      pool.forEach((s) => {
        const w = condWeight(s, weather, time) * Math.pow(zoneFocus, zoneOf.get(s.id) - d);
        if (w > 0) {
          inR[s.rarity].push([s, w]);
        }
      });
      const rw = {};
      let tot = 0;
      RARITIES.forEach((r) => {
        rw[r] = inR[r].length ? RARITY_INFO[r].weight * (r === "Common" ? 1 : luck) : 0;
        tot += rw[r];
      });
      const byRarity = {};
      const species = new Map();
      RARITIES.forEach((r) => {
        byRarity[r] = tot ? rw[r] / tot : 0;
        let sw = 0;
        inR[r].forEach((e) => { sw += e[1]; });
        inR[r].forEach(([s, w]) => species.set(s, byRarity[r] * (w / sw)));
      });
      return { byRarity, species, active: tot > 0 };
    }
    // ctx가 있으면 그 순간의 표, 없으면 날씨 확률·시간대 비율로 평균낸 표
    // active = 무언가 잡히는 시간의 비율 (조건이 안 맞아 빈 시간대는 어획 0)
    function dropTable(progress, ctx) {
      ctx = ctx || {};
      const luck = ctx.luck || 1;
      const pool = poolFor(progress);
      const d = depth(progress);
      if (ctx.weather && ctx.time) {
        const t = contextTable(pool, ctx.weather, ctx.time, luck, d);
        return { byRarity: t.byRarity, species: t.species, active: t.active ? 1 : 0 };
      }
      const odds = ctx.weatherOdds || WEATHER_ODDS;
      const key = d + "|" + luck + "|" + JSON.stringify(odds);
      if (tableCache.has(key)) {
        return tableCache.get(key);
      }
      let oddsTot = 0;
      WEATHERS.forEach((w) => { oddsTot += odds[w] || 0; });
      const byRarity = {};
      RARITIES.forEach((r) => { byRarity[r] = 0; });
      const species = new Map();
      let active = 0;
      WEATHERS.forEach((w) => {
        TIMES.forEach((tm) => {
          const p = ((odds[w] || 0) / oddsTot) * TIME_SHARE[tm];
          const t = contextTable(pool, w, tm, luck, d);
          if (!p || !t.active) {
            return;
          }
          active += p;
          RARITIES.forEach((r) => { byRarity[r] += p * t.byRarity[r]; });
          t.species.forEach((ps, s) => species.set(s, (species.get(s) || 0) + p * ps));
        });
      });
      if (active > 0) {
        RARITIES.forEach((r) => { byRarity[r] /= active; });
        species.forEach((ps, s) => species.set(s, ps / active));
      }
      const res = { byRarity, species, active };
      tableCache.set(key, res);
      return res;
    }

    /* ----- 방치 DPS ----- */
    // 자동 낚시꾼이 초당 벌어들이는 기대값 = Σ P(어종) × idleDps × 구역 배율 × 낚시꾼 수 × 활동 비율
    function idleDps(progress, opts) {
      opts = opts || {};
      const t = dropTable(progress, opts);
      let dps = 0;
      t.species.forEach((p, s) => { dps += p * s.idleDps * zoneMult(s); });
      return dps * (opts.anglers || offlineCfg.anglers) * t.active * (opts.mult || 1);
    }

    // 한 마리당 평균 판매가 (구역 배율 포함)
    function avgCatchValue(progress, opts) {
      const t = dropTable(progress, opts);
      let v = 0;
      t.species.forEach((p, s) => { v += p * s.price * zoneMult(s); });
      return v;
    }
    // 낚시꾼 1명(또는 opts.anglers명)의 초당 기대 수익 = 방치 DPS + 어획 판매 (효율 100%)
    function incomePerSec(progress, opts) {
      opts = opts || {};
      const t = dropTable(progress, opts);
      const anglers = opts.anglers || offlineCfg.anglers;
      const sale = (anglers / offlineCfg.catchInterval) * t.active * avgCatchValue(progress, opts) * offlineCfg.saleShare;
      return idleDps(progress, opts) + sale;
    }

    /* ----- 한 마리 뽑기 ----- */
    function pick(rng, entries) {
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
    function makeCatch(s, rng) {
      const t = rng();
      return {
        id: s.id, name: s.name, rarity: s.rarity,
        size: Math.round((s.minSize + (s.maxSize - s.minSize) * Math.pow(t, 1.6)) * 10) / 10,
        value: Math.round(s.price * zoneMult(s) * (0.7 + 0.6 * t)),   // 평균 = price × 구역 배율
      };
    }
    function rollCatch(progress, ctx, rng) {
      rng = rng || Math.random;
      const t = dropTable(progress, ctx);
      if (!t.species.size) {
        return null;
      }
      return makeCatch(pick(rng, [...t.species.entries()]), rng);
    }

    /* ----- 오프라인 보상 ----- */
    // 계산만 하고 상태는 바꾸지 않음 → applyOffline으로 반영
    function computeOffline(progress, elapsedSec, opts) {
      opts = opts || {};
      const cfg = Object.assign({}, offlineCfg, opts);
      const rng = opts.rng || Math.random;
      const elapsed = Number.isFinite(elapsedSec) ? Math.max(0, Math.min(cfg.cap, elapsedSec)) : 0;
      const empty = { elapsed, efficiency: cfg.efficiency, dps: 0, dpsGold: 0, catches: 0, dropsByRarity: {}, saleGold: 0, total: 0, samples: [], discovered: [], best: null };
      RARITIES.forEach((r) => { empty.dropsByRarity[r] = 0; });
      if (elapsed <= 0) {
        return empty;
      }
      const t = dropTable(progress, opts);
      const dps = idleDps(progress, opts);
      const dpsGold = dps * elapsed * cfg.efficiency;

      // 어획 수 → 희귀도별 기대 수량 (정수는 확률적 반올림)
      const catches = (cfg.anglers * elapsed * cfg.efficiency / cfg.catchInterval) * t.active;
      const dropsByRarity = {};
      let saleGold = 0;
      RARITIES.forEach((r) => {
        const exp = catches * t.byRarity[r];
        const n = Math.floor(exp) + (rng() < exp - Math.floor(exp) ? 1 : 0);
        dropsByRarity[r] = n;
        // 희귀도 안에서의 평균 판매가
        let pw = 0;
        let pv = 0;
        t.species.forEach((p, s) => {
          if (s.rarity === r) {
            pw += p;
            pv += p * s.price * zoneMult(s);
          }
        });
        saleGold += n * (pw ? pv / pw : 0);
      });
      saleGold *= cfg.saleShare;

      // 도감·최고 기록용 표본 (전부 굴리면 8시간에 수천 번이라 표본만)
      const nSample = Math.min(cfg.sampleCap, Math.round(catches));
      const entries = [...t.species.entries()];
      const samples = [];
      const discovered = [];
      let best = null;
      for (let i = 0; i < nSample && entries.length; i++) {
        const c = makeCatch(pick(rng, entries), rng);
        samples.push(c);
        if (!progress.dex[c.id] && !discovered.includes(c.id)) {
          discovered.push(c.id);
        }
        if (!best || c.value > best.value) {
          best = c;
        }
      }
      return {
        elapsed, efficiency: cfg.efficiency, dps, dpsGold, catches, dropsByRarity, saleGold,
        total: dpsGold + saleGold, samples, discovered, best,
      };
    }
    function applyOffline(progress, res) {
      progress.money += res.total;
      res.samples.forEach((c) => {
        const d = progress.dex[c.id] || { count: 0, best: 0 };
        d.count++;
        d.best = Math.max(d.best, c.size);
        progress.dex[c.id] = d;
      });
      return progress;
    }

    /* ----- 요약 (디버그·밸런스 확인용) ----- */
    function zoneSummary() {
      return zones.map((z, i) => {
        const sp = list.filter((s) => zoneOf.get(s.id) === i);
        const count = {};
        RARITIES.forEach((r) => { count[r] = sp.filter((s) => s.rarity === r).length; });
        return { id: z.id, name: z.name, unlockCost: z.unlockCost, mult: z.mult || 1, total: sp.length, count };
      });
    }

    return {
      species: list, warnings, zones, byId,
      zoneOf: (id) => zones[zoneOf.get(id)] || null,
      newProgress, depth, nextZone, canUnlock, unlockZone,
      poolFor, zoneSpecies, dropTable, idleDps, avgCatchValue, incomePerSec, rollCatch,
      computeOffline, applyOffline, zoneSummary,
    };
  }

  const SpeciesManager = {
    create, validate, toWeather, toTime,
    RARITIES, RARITY_INFO, WEATHERS, TIMES, TIME_SHARE, WEATHER_ODDS, ZONES, OFFLINE,
  };
  root.SpeciesManager = SpeciesManager;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = SpeciesManager;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
