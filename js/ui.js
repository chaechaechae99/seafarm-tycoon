/* ============================================================
 * UI — DOM 패널 (4~5Hz로 갱신)
 * ============================================================ */
(function (root) {
  "use strict";
  const G = root.Game;
  const D = root.GameData;
  const SM = root.SpeciesManager;
  const $ = (id) => document.getElementById(id);
  const fmt = G.fmt;

  const U = {
    amt: "1", rar: "all", tab: "facilities", els: {}, news: [], actions: null, dexDirty: true, reviewsDirty: true,
    expZone: "coast", expDirty: true, farmDirty: true, aquaDirty: true, vipT: 0, breedA: "", breedB: "", mutate: false, state: null,
    breedQ: "", catKind: "all",
  };

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  /* ---------- 탭 ---------- */
  function setTab(name) {
    U.tab = name;
    document.querySelectorAll(".tab").forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle("is-on", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll(".tab-body").forEach((b) => { b.hidden = b.dataset.body !== name; });
    document.querySelectorAll(".quick-btn").forEach((q) => q.classList.toggle("is-on", q.dataset.quick === name));
    if (name === "dex") {
      U.dexDirty = true;
    }
    if (name === "reviews") {
      U.reviewsDirty = true;
    }
    U.expDirty = U.farmDirty = U.aquaDirty = true;
    U.vipT = 0;
  }
  function setCollapsed(on) {
    $("layout").classList.toggle("is-collapsed", on);
    const t = $("sideToggle");
    t.setAttribute("aria-expanded", on ? "false" : "true");
    t.setAttribute("aria-label", on ? "사이드바 펼치기" : "사이드바 접기");
    t.textContent = on ? "<" : ">";
    try {
      root.localStorage.setItem("seafarm_side", on ? "1" : "0");
    } catch (e) {
      /* 저장소 없음 */
    }
    root.dispatchEvent(new Event("resize"));
  }

  /* ---------- 시설 ---------- */
  function buildFacilities() {
    const ul = $("facilityList");
    ul.innerHTML = "";
    D.FACILITIES.forEach((f) => {
      const li = document.createElement("li");
      li.className = "item";
      li.innerHTML =
        '<img class="item-icon pix" alt="" src="' + root.Sprites.iconURL(f.id) + '">' +
        '<div class="item-main"><p class="item-name"><span class="nm"></span><span class="item-count"></span></p>' +
        '<p class="item-desc"></p><p class="item-effect"></p><div class="ms-bar"><i></i></div></div>' +
        '<button type="button" class="buy-btn" id="buy-' + f.id + '"><span class="c"></span><small class="q"></small></button>';
      li.querySelector(".buy-btn").addEventListener("click", () => U.actions.buyFacility(f.id, U.amt));
      ul.appendChild(li);
      U.els["f_" + f.id] = {
        li, nm: li.querySelector(".nm"), cnt: li.querySelector(".item-count"), desc: li.querySelector(".item-desc"),
        eff: li.querySelector(".item-effect"), bar: li.querySelector(".ms-bar i"), btn: li.querySelector(".buy-btn"),
        c: li.querySelector(".c"), q: li.querySelector(".q"),
      };
    });
  }
  function facilityEffect(state, id) {
    const o = state.owned;
    const ms = G.msMult(o[id]);
    switch (id) {
      case "seat": return "좌석 " + o.seat + "석 · 입질 속도 ×" + G.catchSpeedMult(state).toFixed(2);
      case "shop": return "손님당 매점 매출 " + fmt(6 * o.shop * ms) + "원" + (ms > 1 ? " (×" + ms + ")" : "");
      case "rental": return "방문객 +" + Math.round(20 * o.rental) + "% · 입장료 +" + fmt(4 * o.rental * ms) + "원";
      case "restaurant": return "어획 가치의 " + Math.round(G.cookRate(state) * 100) + "%를 손질 매출로";
      case "shuttle": return "기본 방문객 +" + (0.08 * o.shuttle).toFixed(2) + "명/초";
      case "pension": return "숙박 수입 초당 " + fmt(60 * o.pension * ms * G.reputation(state) / 3) + "원";
      case "farm": return "초당 " + fmt(900 * o.farm * ms) + "원 · 가두리 고급 어종 +" + Math.round(Math.min(50, 2 * o.farm)) + "%";
      case "crew": return "원정 수익 초당 " + fmt(G.expIncome(state) * G.incomeMult(state)) + "원 (1명당 " + fmt(G.expPerAngler(state)) + "원" + (ms > 1 ? " ×" + ms : "") + ")";
      default: return "";
    }
  }
  function updateFacilities(state) {
    let shownLocked = false;
    D.FACILITIES.forEach((f) => {
      const e = U.els["f_" + f.id];
      const visible = G.facilityVisible(state, f.id);
      if (!visible) {
        e.li.hidden = shownLocked;
        shownLocked = true;
        e.li.classList.add("is-locked");
        e.nm.textContent = "???";
        e.cnt.textContent = "";
        const need = Object.entries(f.need).map(([k, n]) => G.FAC[k].name + " " + n + "개").join(", ");
        e.desc.textContent = need + " 보유 시 공개";
        e.eff.textContent = "";
        e.bar.parentElement.hidden = true;
        e.btn.disabled = true;
        e.c.textContent = "잠김";
        e.q.textContent = "";
        return;
      }
      e.li.hidden = false;
      e.li.classList.remove("is-locked");
      e.nm.textContent = f.name;
      e.cnt.textContent = "× " + state.owned[f.id];
      e.desc.textContent = f.desc;
      e.eff.textContent = state.owned[f.id] > (f.free || 0) || f.id === "seat" ? facilityEffect(state, f.id) : "";
      const n = state.owned[f.id];
      const next = G.nextMilestone(n);
      if (next) {
        const prev = G.MILESTONES[G.MILESTONES.indexOf(next) - 1] || 0;
        e.bar.parentElement.hidden = false;
        e.bar.style.width = Math.min(100, ((n - prev) / (next - prev)) * 100) + "%";
        e.bar.parentElement.title = next + "개 달성 시 " + (f.id === "seat" ? "입질 속도 ×1.2" : f.id === "shuttle" ? "보너스 없음" : "효과 2배");
        if (f.id === "shuttle") {
          e.bar.parentElement.hidden = true;
        }
      } else {
        e.bar.parentElement.hidden = true;
      }
      let k = U.amt === "max" ? Math.max(1, G.maxAffordable(state, f.id)) : Number(U.amt);
      const cost = G.costOfN(f.id, n, k);
      const can = state.money >= cost;
      e.btn.disabled = !can;
      e.btn.classList.toggle("is-ready", can);
      e.c.textContent = fmt(cost) + "원";
      e.q.textContent = k > 1 ? k + "개 구매" : "구매";
      e.btn.setAttribute("aria-label", f.name + " " + k + "개 구매, " + fmt(cost) + "원");
    });
  }

  /* ---------- 업그레이드 ---------- */
  function buildUpgrades() {
    const ul = $("upgradeList");
    ul.innerHTML = "";
    const zl = $("zoneList");
    zl.innerHTML = "";
    D.UPGRADES.slice().sort((a, b) => a.cost - b.cost).forEach((u) => {
      const target = u.tab === "exp" ? zl : ul;
      const li = document.createElement("li");
      li.className = "item";
      li.innerHTML =
        '<img class="item-icon pix" alt="" src="' + root.Sprites.iconURL(u.id) + '">' +
        '<div class="item-main"><p class="item-name"><span class="nm"></span></p><p class="item-desc"></p></div>' +
        '<button type="button" class="buy-btn" id="upg-' + u.id + '"><span class="c"></span><small class="q">구매</small></button>' +
        '<span class="done-tag" hidden>설치 완료</span>';
      li.querySelector(".buy-btn").addEventListener("click", () => U.actions.buyUpgrade(u.id));
      target.appendChild(li);
      U.els["u_" + u.id] = {
        li, nm: li.querySelector(".nm"), desc: li.querySelector(".item-desc"),
        btn: li.querySelector(".buy-btn"), c: li.querySelector(".c"), done: li.querySelector(".done-tag"),
      };
    });
  }
  function updateUpgrades(state) {
    const lockedShown = { main: 0, exp: 0 };
    D.UPGRADES.forEach((u) => {
      const e = U.els["u_" + u.id];
      const owned = !!state.upgrades[u.id];
      const vis = G.upgradeVisible(state, u.id);
      const group = u.tab === "exp" ? "exp" : "main";
      e.li.classList.toggle("is-done", owned);
      e.li.classList.toggle("is-locked", !vis);
      e.done.hidden = !owned;
      e.btn.hidden = owned;
      if (!vis) {
        e.li.hidden = lockedShown[group] >= (group === "exp" ? 1 : 2);
        lockedShown[group]++;
        e.nm.textContent = "???";
        const prev = u.needUpg ? G.UPG[u.needUpg].name + " 후, " : u.needFac ? Object.keys(u.needFac).map((k) => G.FAC[k].name).join("·") + " 보유 후, " : "";
        e.desc.textContent = prev + "누적 수익 " + fmt(u.cost * 0.2) + "원 달성 시 공개";
        e.btn.disabled = true;
        e.c.textContent = fmt(u.cost) + "원";
        return;
      }
      e.li.hidden = false;
      e.nm.textContent = u.name;
      const block = owned ? "" : G.upgradeBlock(state, u.id);
      e.desc.textContent = u.desc + (block ? " · [잠김] " + block + " (현재 최고 호감도 " + G.maxVipLevel(state) + ")" : "");
      const can = state.money >= u.cost && !block;
      e.btn.disabled = !can;
      e.btn.classList.toggle("is-ready", can);
      e.c.textContent = fmt(u.cost) + "원";
    });
  }

  /* ---------- 원정 (350종) ---------- */
  const RAR350 = { Common: ["일반", "var(--r-common)"], Rare: ["희귀", "var(--r-premium)"], Epic: ["영웅", "var(--r-rare)"], Legendary: ["전설", "var(--r-legendary)"] };
  function updateExp(state) {
    const M = G.EXP;
    $("expCount").textContent = G.expDexCount(state) + "/" + M.species.length;
    if (U.tab !== "exp") {
      return;
    }
    const prog = G.expProgress(state);
    const depth = M.depth(prog);
    const crew = state.owned.crew || 0;
    $("expSummary").innerHTML =
      "<h3>원정 낚시 · " + esc(M.zones[depth].name) + "까지 해금</h3>" +
      '<div class="row"><span>원정 낚시꾼 (시설 탭에서 고용)</span><b>' + crew + "명</b></div>" +
      '<div class="row"><span>원정 수익</span><b>' + fmt(G.expIncome(state) * G.incomeMult(state)) + "원/초</b></div>" +
      '<div class="row"><span>낚시꾼 1명 (방치 DPS + 판매)</span><b>' + fmt(G.expPerAngler(state)) + "원/초</b></div>" +
      '<div class="row"><span>등장 어종 풀</span><b>' + M.poolFor(prog).length + " / " + M.species.length + "종</b></div>" +
      '<p class="note">원정 도감 1종마다 전체 수익 +0.5% · 자리 비운 동안에도 원정대가 낚아요</p>';
    if (!U.expDirty) {
      return;
    }
    U.expDirty = false;
    // 희귀도별 드랍 확률 (날씨·시간대 평균)
    const t = M.dropTable(prog);
    $("expRates").innerHTML = "<h3>희귀도별 드랍 확률</h3><div class=\"rate-bars\">" + SM.RARITIES.map((r) =>
      '<div class="rate-bar" style="--rc:' + RAR350[r][1] + '"><span>' + RAR350[r][0] + '</span><i style="width:' + (t.byRarity[r] * 100).toFixed(1) + '%"></i><span>' +
      (t.byRarity[r] * 100).toFixed(1) + "%</span></div>").join("") + "</div>";
    // 구역 필터 + 도감
    $("expZoneFilter").innerHTML = M.zones.map((z, i) =>
      '<button type="button" class="amt' + (U.expZone === z.id ? " is-on" : "") + '" data-zone="' + z.id + '">' + esc(z.name) + (i > depth ? " [잠김]" : "") + "</button>").join("");
    const zi = M.zones.findIndex((z) => z.id === U.expZone);
    const locked = zi > depth;
    $("expGrid").innerHTML = M.zoneSpecies(U.expZone).map((s) => {
      const d = state.expDex[s.id];
      const rr = RAR350[s.rarity];
      const img = root.Sprites.catchURL({ id: s.id }, state.bred, M.byId);
      if (!d) {
        return '<div class="dex-cell is-unknown" style="--rc:' + rr[1] + '"><img class="dex-img pix" alt="" src="' + img + '"><div class="dex-name">' +
          (locked ? "잠김" : "???") + '</div><div class="dex-rar">' + rr[0] + "</div></div>";
      }
      return '<div class="dex-cell" style="--rc:' + rr[1] + '"><img class="dex-img pix" alt="" src="' + img + '"><div class="dex-name" title="' + esc(s.name) + '">' + esc(s.name) +
        '</div><div class="dex-meta">' + d.count + "마리 · 최대 " + G.fmtSize(d.best) + '</div><div class="dex-rar">' + rr[0] + "</div></div>";
    }).join("");
  }

  /* ---------- 비밀 양식장 · 신종 도감 ---------- */
  const ROUTE_TIP = {
    upgrade: "같은 어종끼리 → 한 단계 위로 진화해요",
    family: "같은 계열의 다른 종끼리 → 계열 대표종이 태어나요",
    recipe: "서로 다른 계열 → 결과는 교배해봐야 알아요",
    hybrid: "서로 다른 계열 → 결과는 교배해봐야 알아요",
  };
  function parentOptions(state, sel) {
    const q = (U.breedQ || "").trim();
    const groups = {};
    G.breedParents(state).forEach((p) => {
      if (q && !p.name.includes(q) && p.key !== sel) {
        return;
      }
      (groups[p.group] = groups[p.group] || []).push(p);
    });
    return Object.entries(groups).map(([g, list]) => '<optgroup label="' + esc(g) + '">' + list.map((p) =>
      '<option value="' + esc(p.key) + '"' + (p.key === sel ? " selected" : "") + ">" + esc(p.name) + " · " + D.RARITY[p.rarity].name +
      " · " + esc(G.BM.famName(p.family)) + "</option>").join("") + "</optgroup>").join("");
  }
  function fillParentSelects(state) {
    $("breedA").innerHTML = parentOptions(state, U.breedA);
    $("breedB").innerHTML = parentOptions(state, U.breedB);
    U.breedA = $("breedA").value;
    U.breedB = $("breedB").value;
  }
  function catalogHtml(state) {
    const cat = G.breedCatalog(state).filter((c) => U.catKind === "all" || c.kind === U.catKind);
    return cat.map((c) => {
      if (c.discovered) {
        return '<div class="dex-cell" style="--rc: var(--r-' + c.rarity + ')"><img class="dex-img pix' + (c.giant ? " is-giant" : "") + '" alt="" src="' +
          root.Sprites.catchURL({ bred: true, id: c.id }, state.bred) + '"><div class="dex-name" title="' + esc(c.name) + '">' + esc(c.name) +
          '</div><div class="dex-meta">' + esc(c.formula) + '</div><div class="dex-rar">' + D.RARITY[c.rarity].name + (c.giant ? " · 거대" : "") + "</div></div>";
      }
      const hints = c.hints.slice(0, c.hintLevel).map((h, i) => '<p class="hint' + (i ? " hint-more" : "") + '">' + (i ? "힌트 " + (i + 1) + ". " : "“") + esc(h) + (i ? "" : "”") + "</p>").join("");
      const cost = G.hintCost(state, c.id);
      return '<div class="dex-cell is-sil" style="--rc: var(--r-' + c.rarity + ')"><img class="dex-img pix' + (c.giant ? " is-giant" : "") + '" alt="미발견 실루엣" src="' +
        root.Sprites.silhouetteURL(c.shape, c.giant) + '"><div class="dex-name">???</div>' + hints +
        (isFinite(cost) ? '<button type="button" class="mini-btn" data-hint="' + c.id + '" data-cost="' + cost + '">힌트 더 보기 ' + fmt(cost) + "원</button>" : "") + "</div>";
    }).join("");
  }
  function updateFarm(state) {
    if (U.tab !== "farm") {
      return;
    }
    const body = $("farmBody");
    const cat = G.breedCatalog(state);
    const found = cat.filter((c) => c.discovered).length;
    if (U.farmDirty) {
      U.farmDirty = false;
      let top;
      if (!state.upgrades.secret) {
        const u = G.UPG.secret;
        top = '<div class="box"><h3><img class="pix h-ic" alt="" src="' + root.Sprites.iconURL("secret") + '">비밀 양식장 (잠김)</h3>' +
          '<p class="note">어종을 교배해 신종·전설 어종을 직접 키워요. 태어난 신종은 <b>호감도 10 VIP 손님 전용 좌대</b>에서만 낚여요.</p>' +
          '<div class="row"><span>조건 1 · 양식장 시설</span><b id="secReq1"></b></div>' +
          '<div class="row"><span>조건 2 · 호감도 10 VIP 손님</span><b id="secReq2"></b></div>' +
          '<div class="row"><span>공사비</span><b>' + fmt(u.cost) + "원</b></div>" +
          '<button type="button" class="btn btn-primary" data-act="buy-secret" id="secBuy">비밀 양식장 짓기</button></div>';
      } else {
        top = '<div class="box"><h3><img class="pix h-ic" alt="" src="' + root.Sprites.iconURL("secret") + '">유전자 교배</h3>' +
          '<input type="search" id="breedQ" placeholder="재료 이름 검색 (예: 고래, 고등어)" value="' + esc(U.breedQ || "") + '">' +
          '<div class="form-row"><span>재료 A</span><select id="breedA"></select></div>' +
          '<div class="form-row"><span>재료 B</span><select id="breedB"></select></div>' +
          '<p class="route" id="breedRoute"></p>' +
          '<label class="check"><input type="checkbox" id="breedMut"' + (U.mutate ? " checked" : "") + "> 유전자 변형 (비용 ×" + D.BREED.mutateCostMult +
          ", 개체 2배 · 잡종 희귀도 상승 " + Math.round(D.BREED.upChance * 100) + "% → " + Math.round((D.BREED.upChance + D.BREED.mutateBonus) * 100) + "%)</label>" +
          '<div class="row"><span>비용 · 시간</span><b id="breedCost"></b></div>' +
          '<div class="progress" id="breedProgWrap" hidden><i id="breedProg"></i></div>' +
          '<p class="note" id="breedMsg"></p>' +
          '<button type="button" class="btn btn-primary" data-act="breed" id="breedBtn">교배 시작</button></div>' +
          (state.breedLog.length ? '<div class="box"><h3>실험 기록</h3>' + state.breedLog.map((l) =>
            '<div class="row"><span>' + esc(l.a) + " + " + esc(l.b) + "</span><b>" + esc(l.result) + (l.isNew ? " [NEW]" : "") + "</b></div>").join("") + "</div>" : "");
      }
      const extra = state.bred.filter((b) => b.kind === "upgrade" || b.kind === "hybrid");
      body.innerHTML = top +
        '<div class="box"><h3><img class="pix h-ic" alt="" src="' + root.Sprites.iconURL("book") + '">신종 도감 ' + found + " / " + cat.length + '</h3><p class="note">검은 실루엣과 힌트를 보고 조합을 추리해 보세요. 같은 계열끼리 섞으면 대표종, 다른 계열끼리는 이색 신종이 나와요. 실험할수록 관련 레시피 힌트가 열려요.</p>' +
        '<div class="dex-filter" role="group" aria-label="도감 분류">' + [["all", "전체"], ["family", "계열 대표종"], ["recipe", "이색 조합"]].map(([k, n]) =>
          '<button type="button" class="amt' + (U.catKind === k ? " is-on" : "") + '" data-cat="' + k + '">' + n + "</button>").join("") + "</div></div>" +
        '<div class="dex-grid" id="catGrid">' + catalogHtml(state) + "</div>" +
        (extra.length ? '<div class="box"><h3>개량종 · 잡종 (' + extra.length + ')</h3></div><div class="dex-grid dex-grid-sm">' + extra.map((b) =>
          '<div class="dex-cell" style="--rc: var(--r-' + b.rarity + ')"><img class="dex-img pix" alt="" src="' + root.Sprites.catchURL({ bred: true, id: b.id }, state.bred) +
          '"><div class="dex-name" title="' + esc(b.name) + '">' + esc(b.name) + '</div><div class="dex-meta">개체 ' + b.stock + " · 낚임 " + b.caught +
          '</div><div class="dex-rar">' + D.RARITY[b.rarity].name + (b.kind === "upgrade" ? " · " + b.tier + "단계" : " · 잡종") + "</div></div>").join("") + "</div>" : "");
      if (state.upgrades.secret) {
        fillParentSelects(state);
        $("breedQ").addEventListener("input", (e) => {
          U.breedQ = e.target.value;
          fillParentSelects(state);
        });
        $("breedA").addEventListener("change", (e) => { U.breedA = e.target.value; });
        $("breedB").addEventListener("change", (e) => { U.breedB = e.target.value; });
        $("breedMut").addEventListener("change", (e) => { U.mutate = e.target.checked; });
      }
    }
    // 매 갱신: 버튼·비용·진행
    body.querySelectorAll("[data-hint]").forEach((b) => { b.disabled = state.money < Number(b.dataset.cost); });
    if (!state.upgrades.secret) {
      $("secReq1").textContent = (state.owned.farm || 0) >= 1 ? "완료" : "미달";
      $("secReq2").textContent = "현재 최고 Lv." + G.maxVipLevel(state);
      $("secBuy").disabled = !(G.upgradeVisible(state, "secret") && !G.upgradeBlock(state, "secret") && state.money >= G.UPG.secret.cost);
      return;
    }
    const rt = G.breedRoute(state, U.breedA, U.breedB);
    let preview = "";
    if (rt) {
      if (rt.type === "upgrade") {
        const tier = (rt.pa.tier || 0) + 1;
        preview = tier > D.BREED_TIERS.length ? "이미 최고 단계예요" : "→ " + D.BREED_TIERS[tier - 1] + ((rt.pa.bredRef && rt.pa.bredRef.baseName) || rt.pa.name);
      } else if (rt.type === "family") {
        const done = G.bredById(state, "fam_" + rt.fam.id);
        preview = "→ " + (done ? done.name : "??? (" + rt.fam.name + " 대표종)");
      } else {
        const done = rt.type === "recipe" && G.bredById(state, "rx_" + rt.recipe.id);
        preview = done ? "→ " + done.name + " (발견한 레시피)" : "";
      }
    }
    $("breedRoute").innerHTML = rt ? "<b>" + esc(rt.label) + "</b><br>" + esc(ROUTE_TIP[rt.type]) + (preview ? "<br>" + esc(preview) : "") : "";
    const br = state.breeding;
    $("breedProgWrap").hidden = !br;
    if (br) {
      $("breedProg").style.width = Math.min(100, (br.t / br.dur) * 100) + "%";
      const pa = G.parentInfo(state, br.a);
      const pb = G.parentInfo(state, br.b);
      $("breedMsg").textContent = "교배 중: " + (pa ? pa.name : "?") + " × " + (pb ? pb.name : "?") + " · " + Math.ceil(br.dur - br.t) + "초 남음";
    } else {
      $("breedMsg").textContent = G.breedBlock(state, U.breedA, U.breedB, U.mutate);
    }
    const cost = G.breedCost(state, U.breedA, U.breedB, U.mutate);
    $("breedCost").textContent = (isFinite(cost) ? fmt(cost) + "원" : "-") + " · " + D.BREED.time + "초";
    $("breedBtn").disabled = !!G.breedBlock(state, U.breedA, U.breedB, U.mutate);
  }

  /* ---------- VIP 단골 호감도 ---------- */
  function updateVip(state, world, dt) {
    if (U.tab !== "vip") {
      return;
    }
    U.vipT -= dt;
    if (U.vipT > 0) {
      return;
    }
    U.vipT = 1;
    const regs = state.vip.regulars.slice().sort((a, b) => b.xp - a.xp);
    const legend = '<div class="box"><h3><img class="pix h-ic" alt="" src="' + root.Sprites.iconURL("vip") + '">VIP 단골 호감도</h3>' +
      '<div class="row"><span>Lv.1 일반 손님</span><b>기본 입장료</b></div>' +
      '<div class="row"><span>Lv.5 단골 조사님</span><b>팁 확률 +20% · 고급 좌대</b></div>' +
      '<div class="row"><span>Lv.10 VIP VVIP 손님</span><b>비밀 양식장 좌대 · 이용료 ×20</b></div>' +
      '<div class="row"><span>Lv.11~100 (명예 VIP · 전설의 단골 · 낚시터의 전설)</span><b>레벨마다 이용료 +0.5배 (최대 ×65)</b></div>' +
      '<p class="note">별 4개 이상 남긴 손님 중 일부가 단골이 돼요 (최대 ' + D.VIP.max + "명). 방문할 때마다 호감도가 쌓여요.</p></div>";
    const rows = regs.length ? regs.map((r) => {
      const lv = G.vipLevel(r);
      const cur = G.vipXpFor(lv);
      const next = lv < D.VIP.maxLevel ? G.vipXpFor(lv + 1) : undefined;
      const pct = next === undefined ? 100 : Math.round(((r.xp - cur) / (next - cur)) * 100);
      const here = world.present[r.id];
      return '<div class="vip-row' + (here ? " is-here" : "") + '"><div class="vip-lv' + (lv >= 10 ? " lv10" : lv >= 5 ? " lv5" : "") + '">' + lv + "</div>" +
        '<div><div class="vip-name">' + esc(r.nick) + ' <span class="vip-meta">' + esc(G.vipTitle(lv)) + "</span></div>" +
        '<div class="ms-bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="vip-meta">' + esc((D.GUEST_TYPES.find((g) => g.id === r.type) || {}).name || "") + " · 방문 " + r.visits + "회 · 호감도 " + r.xp + (next !== undefined ? "/" + next : " (최고)") + "</div></div>" +
        '<span class="vip-meta">' + (here ? "방문 중" : "") + "</span></div>";
    }).join("") : '<p class="empty">아직 단골이 없어요. 손님 만족도(별점)를 높여보세요.</p>';
    $("vipBody").innerHTML = legend + '<div class="list">' + rows + "</div>";
  }

  /* ---------- 수족관 ---------- */
  function updateAqua(state) {
    if (U.tab !== "aqua" || !U.aquaDirty) {
      return;
    }
    U.aquaDirty = false;
    const slots = [];
    for (let i = 0; i < D.AQUARIUM.slots; i++) {
      const key = state.aquarium[i];
      const e = key && G.aquaEntry(state, key);
      if (!e) {
        slots.push('<div class="aqua-slot is-empty">빈 수조</div>');
        continue;
      }
      slots.push('<div class="aqua-slot"><img class="pix" alt="" src="' + aquaImg(state, e) + '"><span>' + esc(e.name) + "</span><span>+" +
        Math.round(G.aquaBuffOf(e) * 100) + '%</span><button type="button" class="mini-btn" data-act="aqua-del" data-key="' + esc(key) + '">빼기</button></div>');
    }
    const cands = G.aquaCandidates(state).filter((e) => !state.aquarium.includes(e.key));
    $("aquaBody").innerHTML =
      '<div class="box"><h3><img class="pix h-ic" alt="" src="' + root.Sprites.iconURL("aqua") + '">수족관 패시브 버프</h3><div class="row"><span>낚시터 전체 매출</span><b>+' + Math.round(G.aquaBuff(state) * 100) + "%</b></div>" +
      '<p class="note">희귀 +' + D.AQUARIUM.buff.rare * 100 + "% · 전설 +" + D.AQUARIUM.buff.legendary * 100 + "% · 직접 개량한 신종 +" + D.AQUARIUM.bredBonus * 100 +
      "%p · 황금 개체를 낚은 어종 ×" + D.AQUARIUM.goldenMult + " · 등록한 물고기는 바다 화면 왼쪽 수족관에서 헤엄쳐요</p></div>" +
      '<div class="aqua-slots">' + slots.join("") + "</div>" +
      '<div class="box"><h3>등록할 수 있는 어종</h3>' + (cands.length ? '<div class="list">' + cands.map((e) =>
        '<div class="vip-row"><img class="pix" style="height:20px;width:auto" alt="" src="' + aquaImg(state, e) + '"><div><div class="vip-name">' + esc(e.name) +
        '</div><div class="vip-meta">' + D.RARITY[e.rarity].name + (e.bred ? " · 신종" : e.kind === "s" ? " · 원정" : "") + (e.golden ? " · 황금" : "") + " · +" + Math.round(G.aquaBuffOf(e) * 100) +
        '%</div></div><button type="button" class="mini-btn" data-act="aqua-add" data-key="' + esc(e.key) + '"' + (state.aquarium.length >= D.AQUARIUM.slots ? " disabled" : "") +
        ">등록</button></div>").join("") + "</div>" : '<p class="note">희귀·전설 어종을 낚거나 비밀 양식장에서 개량하면 등록할 수 있어요.</p>') + "</div>";
  }
  function aquaImg(state, e) {
    return root.Sprites.catchURL(e.sprite, state.bred, G.EXP.byId);
  }

  /* ---------- 원정 파견 팝업 · 자동 낚시 버튼 ---------- */
  const mmss = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
  function updateActions(state, world) {
    const ab = $("autoBtn");
    ab.setAttribute("aria-pressed", state.autoCast ? "true" : "false");
    ab.textContent = state.autoCast ? "자동 낚시 ON · " + Math.max(0, Math.ceil(world.autoT || 0)) + "초" : "자동 낚시 OFF";
    const dp = state.dispatch;
    const open = G.dispatchUnlocked(state);
    $("dispatchBtn").disabled = !open;
    $("dispatchBtn").title = open ? "" : "시설 탭에서 원정 낚시꾼을 고용하면 열려요";
    $("dispatchBtn").lastChild.textContent = !open ? "원정 파견 [잠김]" : dp ? "원정 중 " + mmss(Math.max(0, dp.dur - dp.t)) : "원정 파견";
    if (!$("dispatchModal").hidden) {
      renderDispatch(state);
    }
  }
  function dispatchResultHtml(state, last) {
    return '<div class="box"><h3>' + esc(last.name) + " 원정 결과 · " + last.total + "마리 · +" + fmt(last.gold) + "원 · 새 어종 " + last.newCount + "종</h3>" +
      '<div class="row"><span>일반 ' + last.byRarity.Common + " · 희귀 " + last.byRarity.Rare + " · 영웅 " + last.byRarity.Epic + "</span><b>전설 " + last.byRarity.Legendary + "</b></div>" +
      '<div class="disp-list">' + last.catches.map((c) => '<div class="disp-row"><img class="pix" alt="" src="' + root.Sprites.catchURL({ id: c.id }, state.bred, G.EXP.byId) + '"><span>' +
        esc(c.name) + " · " + G.fmtSize(c.size) + (c.isNew ? " [NEW]" : "") + "</span><b>" + ({ Common: "일반", Rare: "희귀", Epic: "영웅", Legendary: "전설" }[c.rarity] || "") + "</b></div>").join("") + "</div></div>";
  }
  function renderDispatch(state) {
    const dp = state.dispatch;
    let html;
    if (dp) {
      html = '<div class="box"><div class="row"><span>출항 중 · ' + esc((G.dispatchTier(dp.dur) || {}).name || "") + " 원정</span><b>" + mmss(Math.max(0, dp.dur - dp.t)) + ' 남음</b></div>' +
        '<div class="progress"><i style="width:' + Math.min(100, (dp.t / dp.dur) * 100) + '%"></i></div></div>';
    } else {
      html = '<p class="note">파견은 무료예요. 1분에 1마리씩 잡고, 오래 보낼수록 더 먼 바다까지 나가 전설·고래·심해 생물 확률이 크게 올라요.</p>' +
        '<div class="disp-opts">' + D.DISPATCH.tiers.map((x) =>
          '<button type="button" class="btn disp-opt" data-disp="' + x.sec + '"><b>' + x.name + "</b><span>" + G.dispatchCatches(x.sec) + "마리</span><span>" +
          esc(G.EXP.zones[x.depth].name) + "까지</span><span>희귀↑ x" + x.luck + "</span></button>").join("") + "</div>";
    }
    if (state.lastDispatch) {
      html += dispatchResultHtml(state, state.lastDispatch);
    }
    if (U.dispHtml !== html) {
      U.dispHtml = html;
      $("dispBody").innerHTML = html;
    }
  }
  // 귀항 결과는 팝업으로 한 번만
  function showDispatchResult(state) {
    const last = state.lastDispatch;
    if (!last || last.seen) {
      return;
    }
    last.seen = true;
    U.dispHtml = "";
    $("dispatchModal").hidden = false;
    renderDispatch(state);
  }

  /* ---------- 도감 ---------- */
  function updateDex(state) {
    $("dexCount").textContent = G.dexCount(state) + "/" + D.FISH.length;
    if (U.tab !== "dex" || !U.dexDirty) {
      return;
    }
    U.dexDirty = false;
    const ck = G.clockInfo(state);
    $("dexNote").textContent = "새 어종을 낚을 때마다 전체 수익 +2% (현재 +" + (G.dexCount(state) * 2) + "%) · 지금은 " + D.SEASON_NAMES[ck.season] + " 제철 어종이 잘 잡혀요";
    const grid = $("dexGrid");
    grid.innerHTML = D.FISH.filter((f) => U.rar === "all" || f.rarity === U.rar).map((f) => {
      const d = state.dex[f.id];
      const r = D.RARITY[f.rarity];
      const spots = f.spots.map((s) => D.SPOTS[s].name).join("·");
      const inSeason = f.seasons.includes(ck.season);
      if (!d) {
        return '<div class="dex-cell is-unknown" style="--rc: var(--r-' + f.rarity + ')">' +
          '<img class="dex-img pix" alt="" src="' + root.Sprites.fishURL(f.id) + '"><div class="dex-name">???</div>' +
          '<div class="dex-meta">' + esc(spots) + '</div><div class="dex-rar">' + r.name + (inSeason ? " · 제철" : "") + "</div></div>";
      }
      return '<div class="dex-cell" style="--rc: var(--r-' + f.rarity + ')">' + (d.golden ? '<span class="dex-gold" title="황금 개체 낚음">황금</span>' : "") +
        '<img class="dex-img pix" alt="" src="' + root.Sprites.fishURL(f.id, d.golden) + '"><div class="dex-name">' + esc(f.name) + "</div>" +
        '<div class="dex-meta">난이도 ' + (f.diff || D.DIFF_DEFAULT[f.rarity]) + " · 최대 " + G.fmtSize(d.best) + " · " + d.count + "마리</div>" +
        '<div class="dex-rar">' + r.name + " · " + esc(spots) + (inSeason ? " · 제철" : "") + "</div></div>";
    }).join("");
  }

  /* ---------- 후기 ---------- */
  function updateReviews(state) {
    if (U.tab !== "reviews" || !U.reviewsDirty) {
      return;
    }
    U.reviewsDirty = false;
    const ul = $("reviewList");
    if (!state.reviews.length) {
      ul.innerHTML = '<li class="empty">아직 후기가 없어요. 손님이 낚시를 마치고 돌아가면 후기를 남겨요.</li>';
      return;
    }
    ul.innerHTML = state.reviews.map((r) =>
      '<li class="review"><div class="review-head"><span class="stars">' + "★".repeat(r.stars) + "☆".repeat(5 - r.stars) + "</span>" +
      "<b>" + esc(r.nick) + '</b><span class="review-type">' + esc(r.type) + " · " + r.day + "일차</span></div>" +
      "<p>" + esc(r.text) + '</p><p class="fishline">조과: ' + esc(r.fish) + "</p></li>").join("");
  }

  /* ---------- 설정·통계 ---------- */
  function updateStats(state) {
    if (U.tab !== "settings") {
      return;
    }
    const s = state.stats;
    const rows = [
      ["누적 수익", fmt(state.totalEarned) + "원"],
      ["방문 손님", fmt(s.guests) + "명"],
      ["자리가 없어 구경만 한 손님", fmt(s.missed) + "명"],
      ["총 어획", fmt(s.catches) + "회"],
      ["황금 개체", fmt(s.golden) + "마리"],
      ["사장님 직접 낚시", fmt(s.ownerCasts) + "회"],
      ["도감", G.dexCount(state) + " / " + D.FISH.length + "종"],
      ["원정 도감", G.expDexCount(state) + " / " + G.EXP.species.length + "종"],
      ["원정 어획", fmt(s.expCatches) + "회"],
      ["단골 방문 · 팁", fmt(s.vipVisits) + "회 · " + fmt(s.tips) + "회"],
      ["신종 어획 (VIP)", fmt(s.bredCatches) + "회"],
      ["나비 밥 · 소원", fmt(state.stats2.catFed) + "회 · " + fmt(state.stats2.wishes) + "회"],
    ];
    $("statList").innerHTML = rows.map((r) => "<dt>" + r[0] + "</dt><dd>" + r[1] + "</dd>").join("");
  }

  /* ---------- 상단·HUD ---------- */
  function updateTop(state, world) {
    $("money").textContent = fmt(state.money);
    const ck = G.clockInfo(state);
    $("rate").textContent = fmt(G.expectedRate(state, { night: ck.night, weatherAvg: weatherFactor(state) }));
    const rep = G.reputation(state);
    const full = Math.round(rep);
    $("stars").textContent = "★".repeat(full) + "☆".repeat(5 - full);
    $("repNum").textContent = rep.toFixed(1);
    $("clockLabel").textContent = D.SEASON_NAMES[ck.season] + " · " + ck.day + "일차";
    $("clock").textContent = String(ck.hour).padStart(2, "0") + ":" + String(ck.minute).padStart(2, "0");
    $("dayIcon").src = root.Sprites.iconURL(ck.night ? "moon" : "w_sunny");
    $("dayIcon").hidden = !ck.night;
    const w = D.WEATHER[state.weather];
    $("weatherName").textContent = w.name;
    $("weatherIcon").src = root.Sprites.iconURL("w_" + state.weather);
    $("hudGuests").textContent = "손님 " + world.guests.length + " / " + G.seats(state) + "석";
    $("hudHint").textContent = hint(state, ck);
    // 버프 칩
    const mmss = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
    const chips = [];
    if (state.buffs.cat > 0) {
      chips.push('<span class="buff" title="명성 +' + D.CAT.rep + ", 방문 ×" + D.CAT.arrive + '"><img class="pix" alt="" src="' + root.Sprites.iconURL("cat") + '">나비 ' + mmss(state.buffs.cat) + "</span>");
    }
    if (state.buffs.wish > 0) {
      chips.push('<span class="buff" title="전설·신종 입질 ×' + D.WISH.legendary + '"><img class="pix" alt="" src="' + root.Sprites.iconURL("wish") + '">소원 ' + mmss(state.buffs.wish) + "</span>");
    }
    const aq = G.aquaBuff(state);
    if (aq > 0) {
      chips.push('<span class="buff"><img class="pix" alt="" src="' + root.Sprites.iconURL("aqua") + '">수족관 +' + Math.round(aq * 100) + "%</span>");
    }
    const html = chips.join("");
    if ($("buffs").innerHTML !== html) {
      $("buffs").innerHTML = html;
    }
  }
  function weatherFactor(state) {
    const w = D.WEATHER[state.weather];
    if (state.weather === "typhoon") {
      return state.upgrades.typhoon ? 0.5 : 0;
    }
    return w.arrive;
  }
  function hint(state, ck) {
    if (state.weather === "typhoon" && !state.upgrades.typhoon) {
      return "태풍으로 임시 휴장 중";
    }
    if (ck.night && !state.upgrades.night && state.totalEarned > 50000) {
      return "밤이라 손님이 적어요 · 야간 집어등을 달아보세요";
    }
    const arr = G.arrivalRate(state, ck.night, "sunny");
    const cap = G.seats(state) / G.avgStay(state);
    if (arr > cap * 1.25) {
      return "좌석 부족 · 좌대 자리를 늘려보세요";
    }
    if (cap > arr * 2 && G.facilityVisible(state, "rental")) {
      return "빈자리 많음 · 대여소·셔틀로 손님 모으기";
    }
    return "";
  }

  /* ---------- 뉴스·토스트 ---------- */
  function addNews(html) {
    U.news.unshift(html);
    U.news.length = Math.min(U.news.length, 3);
    $("news").innerHTML = U.news.map((n) => "<li>" + n + "</li>").join("");
  }
  function fishURL(f) {
    return root.Sprites.catchURL(f, U.state && U.state.bred, G.EXP.byId);
  }
  function fishImg(f) {
    const src = f.junk ? "" : fishURL(f);
    return src ? '<img class="news-fish pix" alt="" src="' + src + '">' : "";
  }
  function toast(msg, tone, icon) {
    const el = document.createElement("div");
    el.className = "toast" + (tone ? " t-" + tone : "");
    if (icon) {
      const im = document.createElement("img");
      im.src = icon;
      im.alt = "";
      im.className = "pix";
      el.appendChild(im);
    }
    const sp = document.createElement("span");
    sp.textContent = msg;
    el.appendChild(sp);
    $("toasts").appendChild(el);
    setTimeout(() => el.remove(), 3200);
    const all = $("toasts").children;
    while (all.length > 3) {
      all[0].remove();
    }
  }
  function onEvent(state, ev) {
    if (ev.kind === "catch" && !ev.owner) {
      if (ev.isNew) {
        U.dexDirty = U.aquaDirty = U.farmDirty = true;
      }
      return;
    }
    if (ev.kind === "catch") {
      const f = ev.fish;
      const who = ev.owner ? "사장님" : ev.who;
      if (f.junk) {
        if (ev.owner) {
          addNews(fishImg(f) + "<b>" + who + "</b>이 " + esc(f.name) + "을(를) 건졌어요");
        }
        return;
      }
      const big = f.rarity === "rare" || f.rarity === "legendary" || f.golden || f.tier === "대물";
      if (ev.owner || big || Math.random() < 0.35) {
        addNews(fishImg(f) + "<b>" + esc(who) + "</b> · " + (f.golden ? "황금 " : "") +
          '<span style="color:var(--r-' + f.rarity + ')">' + esc(f.name) + "</span> " + G.fmtSize(f.size) + (f.tier === "대물" ? " 대물!" : ""));
      }
      if (ev.isNew) {
        toast((f.bred ? "신종 첫 낚시: " : "도감 등록: ") + f.name + " (" + D.RARITY[f.rarity].name + ")" + (f.bred ? "" : " · 전체 수익 +2%"), "new", fishURL(f));
        U.dexDirty = true;
        U.aquaDirty = true;
        U.farmDirty = true;
      }
      if (f.rarity === "legendary") {
        toast("전설의 " + f.name + " " + G.fmtSize(f.size) + " 출현!", "gold", fishURL(f));
      } else if (f.golden) {
        toast("황금 " + f.name + "! 가치 10배", "gold", fishURL(f));
      }
    } else if (ev.kind === "expcatch") {
      const f = ev.fish;
      if (ev.isNew) {
        U.expDirty = true;
        if (f.rarity === "Legendary" || f.rarity === "Epic") {
          toast("원정대가 " + (f.rarity === "Legendary" ? "전설" : "영웅") + " 어종 " + f.name + "을(를) 발견!", "gold", fishURL(f));
        }
      }
      if (f.rarity === "Legendary" || (ev.isNew && Math.random() < 0.3)) {
        addNews(fishImg(f) + "<b>원정대</b> · " + esc(f.name) + " " + G.fmtSize(f.size) + (ev.isNew ? " (새 어종)" : ""));
      }
    } else if (ev.kind === "dispatch") {
      U.expDirty = U.farmDirty = U.aquaDirty = true;
      showDispatchResult(state);
    } else if (ev.kind === "vipLevel") {
      toast(ev.nick + "님 호감도 Lv." + ev.lv + " · " + ev.title + (ev.lv === 10 ? " — 비밀 양식장 입장 가능!" : ev.lv === 5 ? " — 팁·고급 좌대" : ""), ev.lv >= 5 ? "gold" : "new", root.Sprites.iconURL("vip"));
      U.farmDirty = true;
    } else if (ev.kind === "newRegular") {
      toast(ev.type + " " + ev.nick + "님이 단골이 됐어요!", "new", root.Sprites.iconURL("vip"));
    } else if (ev.kind === "bred") {
      const how = { upgrade: "등급 상승", family: "계열 대표종", recipe: "이색 조합 레시피 발견", hybrid: "돌연변이 잡종" }[ev.route] || "";
      toast(ev.dup ? ev.bred.name + " 개체 수 늘어남 (총 " + ev.bred.stock + ")" : "신종 탄생! " + ev.bred.name + " · " + how + " (" + D.RARITY[ev.bred.rarity].name + ")",
        "gold", fishURL({ bred: true, id: ev.bred.id }));
      if (ev.hinted && ev.hinted.length) {
        toast("실험 결과 힌트 해금: 비슷한 재료로 만드는 레시피 " + ev.hinted.length + "개", "new", root.Sprites.iconURL("secret"));
      }
      U.farmDirty = true;
      U.aquaDirty = true;
    } else if (ev.kind === "arrive" && ev.vip) {
      addNews("<b>VIP " + esc(ev.reg.nick) + "</b>님이 비밀 양식장 좌대에 입장 (이용료 ×" + D.VIP.feeLv10 + ")");
    } else if (ev.kind === "review") {
      U.reviewsDirty = true;
      if (ev.review.weight > 1) {
        toast(ev.review.type + " " + ev.review.nick + "님이 별 " + ev.review.stars + "개 후기를 남겼어요", "gold");
      }
    } else if (ev.kind === "weather") {
      const w = D.WEATHER[ev.weather];
      const winter = G.clockInfo(state).season === "winter";
      const msg = { sunny: "날이 개었어요", cloudy: "흐려졌어요 · 입질이 좋아져요", rain: (winter ? "눈이 와요" : "비가 와요") + " · 손님이 줄어요", typhoon: "태풍 접근! " + (state.upgrades.typhoon ? "보강 덕분에 절반 영업" : "임시 휴장") }[ev.weather];
      toast(msg, "", root.Sprites.iconURL("w_" + ev.weather));
    } else if (ev.kind === "arrive" && ev.type === "pro") {
      toast("프로 낚시 유튜버가 방문했어요!", "gold", root.Sprites.iconURL("tv"));
    }
  }

  /* ---------- 초기화 ---------- */
  function init(actions) {
    U.actions = actions;
    buildFacilities();
    buildUpgrades();
    document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => setTab(t.dataset.tab)));
    // 사이드바: 빠른 열기·접기
    document.querySelectorAll("[data-icon]").forEach((im) => { im.src = root.Sprites.iconURL(im.dataset.icon); });
    document.querySelectorAll(".quick-btn").forEach((q) => q.addEventListener("click", () => {
      setCollapsed(false);
      setTab(q.dataset.quick);
    }));
    $("sideToggle").addEventListener("click", () => setCollapsed(!$("layout").classList.contains("is-collapsed")));
    try {
      if (root.localStorage.getItem("seafarm_side") === "1") {
        setCollapsed(true);
      }
    } catch (e) {
      /* 저장소 없음 */
    }
    // 새 탭 버튼들 (내용을 다시 그려도 동작하도록 위임)
    document.querySelector(".sidebar").addEventListener("click", (e) => {
      const b = e.target.closest("[data-act], [data-zone], [data-cat], [data-hint]");
      if (!b) {
        return;
      }
      if (b.dataset.zone) {
        U.expZone = b.dataset.zone;
        U.expDirty = true;
        return;
      }
      if (b.dataset.cat) {
        U.catKind = b.dataset.cat;
        U.farmDirty = true;
        return;
      }
      if (b.dataset.hint) {
        if (actions.buyHint(b.dataset.hint)) {
          U.farmDirty = true;
        }
        return;
      }
      const act = b.dataset.act;
      if (act === "buy-secret") {
        actions.buyUpgrade("secret");
        U.farmDirty = true;
      } else if (act === "breed") {
        if (actions.breed(U.breedA, U.breedB, U.mutate)) {
          toast("교배를 시작했어요 (" + D.BREED.time + "초)", "new", root.Sprites.iconURL("secret"));
        }
      } else if (act === "aqua-add" || act === "aqua-del") {
        actions.aqua(act === "aqua-add", b.dataset.key);
        U.aquaDirty = true;
      }
    });
    // 사운드 토글
    const sp = root.Sound ? root.Sound.prefs() : null;
    document.querySelectorAll("[data-snd]").forEach((b) => {
      if (sp) {
        b.setAttribute("aria-pressed", sp.on[b.dataset.snd] ? "true" : "false");
      }
      b.addEventListener("click", () => {
        const on = b.getAttribute("aria-pressed") !== "true";
        b.setAttribute("aria-pressed", on ? "true" : "false");
        root.Sound.setOn(b.dataset.snd, on);
      });
    });
    if (sp) {
      $("volume").value = Math.round(sp.vol * 100);
    }
    $("volume").addEventListener("input", (e) => root.Sound.setVolume(e.target.value / 100));
    document.querySelectorAll("[data-amt]").forEach((b) => b.addEventListener("click", () => {
      U.amt = b.dataset.amt;
      document.querySelectorAll("[data-amt]").forEach((x) => x.classList.toggle("is-on", x === b));
    }));
    document.querySelectorAll("[data-rar]").forEach((b) => b.addEventListener("click", () => {
      U.rar = b.dataset.rar;
      U.dexDirty = true;
      document.querySelectorAll("[data-rar]").forEach((x) => x.classList.toggle("is-on", x === b));
    }));
    $("castBtn").addEventListener("click", () => actions.cast());
    $("autoBtn").addEventListener("click", () => actions.toggleAuto());
    $("dispatchBtn").addEventListener("click", () => {
      if (!G.dispatchUnlocked(U.state)) {
        toast("원정 낚시꾼을 고용하면 원정 파견이 열려요 (시설 탭)");
        return;
      }
      U.dispHtml = "";
      $("dispatchModal").hidden = false;
      renderDispatch(U.state);
    });
    $("dispClose").addEventListener("click", () => { $("dispatchModal").hidden = true; });
    $("dispBody").addEventListener("click", (e) => {
      const b = e.target.closest("[data-disp]");
      if (b && actions.dispatch(Number(b.dataset.disp))) {
        U.dispHtml = "";
        renderDispatch(U.state);
      }
    });
    $("saveBtn").addEventListener("click", () => { actions.save(); toast("저장했어요"); });
    $("exportBtn").addEventListener("click", () => {
      const code = actions.exportCode();
      const ta = $("saveCode");
      ta.value = code;
      const done = () => { $("codeMsg").textContent = "저장 코드를 복사했어요."; };
      const fallback = () => { ta.focus(); ta.select(); $("codeMsg").textContent = "코드를 선택해 두었어요. Ctrl+C로 복사하세요."; };
      try {
        navigator.clipboard.writeText(code).then(done, fallback);
      } catch (e) {
        fallback();
      }
    });
    $("importBtn").addEventListener("click", () => {
      const ok = actions.importCode($("saveCode").value);
      $("codeMsg").textContent = ok ? "불러왔어요." : "코드를 읽을 수 없어요. 전체를 빠짐없이 붙여넣었는지 확인해 주세요.";
    });
    let armTimer = null;
    $("resetBtn").addEventListener("click", (ev) => {
      const b = ev.currentTarget;
      if (!b.classList.contains("is-armed")) {
        b.classList.add("is-armed");
        b.textContent = "한 번 더 누르면 초기화";
        armTimer = setTimeout(() => { b.classList.remove("is-armed"); b.textContent = "초기화"; }, 3000);
        return;
      }
      clearTimeout(armTimer);
      b.classList.remove("is-armed");
      b.textContent = "초기화";
      actions.reset();
      toast("새 낚시터를 열었어요");
    });
    $("offClose").addEventListener("click", () => { $("offlineModal").hidden = true; });
  }

  function update(state, world) {
    U.state = state;
    updateTop(state, world);
    updateActions(state, world);
    updateFacilities(state);
    updateUpgrades(state);
    updateExp(state);
    updateFarm(state);
    updateVip(state, world, 0.2);
    updateAqua(state);
    updateDex(state);
    updateReviews(state);
    updateStats(state);
    const cf = $("castFill");
    const btn = $("castBtn");
    if (world.cast) {
      cf.style.width = Math.min(100, (world.cast.t / world.cast.dur) * 100) + "%";
      btn.setAttribute("aria-busy", "true");
    } else {
      cf.style.width = "0";
      btn.setAttribute("aria-busy", world.castCd > 0 ? "true" : "false");
    }
  }

  function showOffline(res) {
    $("offGain").textContent = fmt(res.gain);
    const h = Math.floor(res.elapsed / 3600);
    const m = Math.floor((res.elapsed % 3600) / 60);
    $("offInfo").textContent = (h ? h + "시간 " : "") + m + "분 동안 직원들이 낚시터를 운영했어요 (효율 " + Math.round(res.eff * 100) + "%, 최대 8시간)";
    $("offExp").textContent = res.expBest ? "원정대가 새 어종 " + res.expFound + "종을 발견했어요 · 최고 기록 " + res.expBest.name + " " + G.fmtSize(res.expBest.size) : "";
    U.expDirty = true;
    $("offlineModal").hidden = false;
    $("offClose").focus();
  }

  function refreshAll() {
    U.dexDirty = true;
    U.reviewsDirty = true;
    U.expDirty = U.farmDirty = U.aquaDirty = true;
    U.news = [];
    $("news").innerHTML = "";
  }

  root.UI = { showDispatchResult, init, update, onEvent, toast, showOffline, refreshAll, setTab, currentTab: () => U.tab };
})(typeof globalThis !== "undefined" ? globalThis : this);
