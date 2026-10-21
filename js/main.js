/* ============================================================
 * MAIN — 초기화, 루프, 저장
 * ============================================================ */
(function (root) {
  "use strict";
  const G = root.Game;
  const UI = root.UI;
  const Rd = root.Renderer;

  let state = null;
  let world = null;
  let last = 0;
  let uiAcc = 0;
  let saveAcc = 0;

  function storeGet() {
    try {
      return root.localStorage.getItem(G.SAVE_KEY);
    } catch (e) {
      return null;
    }
  }
  function storeSet(v) {
    try {
      root.localStorage.setItem(G.SAVE_KEY, v);
      return true;
    } catch (e) {
      return false;
    }
  }
  function storeDel() {
    try {
      root.localStorage.removeItem(G.SAVE_KEY);
    } catch (e) {
      /* 저장소를 못 쓰는 환경 */
    }
  }

  function save() {
    if (!state) {
      return;
    }
    state.lastSave = Date.now();
    storeSet(G.serialize(state));
  }

  function load(hotData) {
    let st = null;
    if (hotData && hotData.state) {
      try {
        st = G.deserialize(JSON.stringify(hotData.state));
      } catch (e) {
        st = null;
      }
    }
    if (!st) {
      const raw = storeGet();
      if (raw) {
        try {
          st = G.deserialize(raw);
        } catch (e) {
          st = null;
        }
      }
    }
    return st;
  }

  function dispatch() {
    const evs = world.events;
    world.events = [];
    for (const ev of evs) {
      Rd.pushEvent(state, ev);
      UI.onEvent(state, ev);
    }
  }

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 1);
    last = now;
    G.tick(state, world, dt);
    dispatch();
    panByKeys(dt);
    Rd.draw(state, world, dt);
    if (UI.currentTab() === "aqua") {
      Rd.drawAquariumView(document.getElementById("aquaView"), state, dt);
    }
    if (root.Sound) {
      const ck = G.clockInfo(state);
      root.Sound.update({ night: ck.night, weather: state.weather, winter: ck.season === "winter" });
    }
    uiAcc += dt;
    if (uiAcc >= 0.2) {
      uiAcc = 0;
      UI.update(state, world);
    }
    saveAcc += dt;
    if (saveAcc >= 15) {
      saveAcc = 0;
      save();
    }
    requestAnimationFrame(frame);
  }

  function sfx(name, opt) {
    if (root.Sound) {
      root.Sound.cue(name, opt);
    }
  }

  /* ---------- 카메라 조작: 좌클릭 드래그 · WASD 이동 · 휠 줌 · 클릭(고양이·별똥별) ---------- */
  const keys = {};
  function panByKeys(dt) {
    const sp = 120 * dt;   // 월드 픽셀/초 (줌이 클수록 화면상 같은 속도)
    const dx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    const dy = (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0);
    if (dx || dy) {
      Rd.panWorld(dx * sp, dy * sp);
    }
  }
  function bindCamera(canvas) {
    let drag = null;
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) {
        return;
      }
      const p = pos(e);
      drag = { x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false, id: e.pointerId };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      const p = pos(e);
      if (!drag) {
        canvas.classList.toggle("is-hover", !!Rd.hitTest(p.x, p.y));
        return;
      }
      if (!drag.moved && Math.hypot(p.x - drag.sx, p.y - drag.sy) > 4) {
        drag.moved = true;
        canvas.classList.add("is-dragging");
      }
      if (drag.moved) {
        Rd.panBy(p.x - drag.x, p.y - drag.y);
      }
      drag.x = p.x;
      drag.y = p.y;
    });
    const end = (e) => {
      if (!drag) {
        return;
      }
      const p = pos(e);
      if (!drag.moved) {
        clickWorld(p.x, p.y);
      }
      canvas.classList.remove("is-dragging");
      drag = null;
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", () => {
      drag = null;
      canvas.classList.remove("is-dragging");
    });
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const p = pos(e);
      Rd.zoomAt(p.x, p.y, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    }, { passive: false });
    const center = () => ({ x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 });
    document.getElementById("zoomIn").addEventListener("click", () => { const c = center(); Rd.zoomAt(c.x, c.y, 1.4); });
    document.getElementById("zoomOut").addEventListener("click", () => { const c = center(); Rd.zoomAt(c.x, c.y, 1 / 1.4); });
    document.getElementById("zoomReset").addEventListener("click", () => { const c = center(); Rd.zoomAt(c.x, c.y, 1 / Rd.cam.z); });
    document.getElementById("camHome").addEventListener("click", goHome);
  }
  // 홈 버튼·H 키: 줌 1배 + 기본 위치로 즉시 복귀
  function goHome() {
    Object.keys(keys).forEach((k) => { keys[k] = false; });
    Rd.resetCam();
  }
  function clickWorld(x, y) {
    const hit = Rd.hitTest(x, y);
    if (hit === "star") {
      actions.wish();
    } else if (hit === "cat") {
      actions.feedCat();
    }
  }

  const actions = {
    breed(a, b, mutate) {
      if (G.startBreed(state, a, b, mutate)) {
        sfx("buy");
        save();
        UI.update(state, world);
        return true;
      }
      return false;
    },
    toggleAuto() {
      state.autoCast = !state.autoCast;
      world.autoT = 0;   // 켜자마자 한 번 던짐
      sfx("click");
      save();
      UI.update(state, world);
    },
    dispatch(dur) {
      if (G.startDispatch(state, dur)) {
        sfx("buy");
        UI.toast("원정 어선 출항! " + dur / 60 + "분 뒤 귀항", "new", root.Sprites.iconURL("crew"));
        save();
        return true;
      }
      return false;
    },
    buyHint(id) {
      if (G.buyHint(state, id)) {
        sfx("coin");
        save();
        return true;
      }
      return false;
    },
    aqua(add, key) {
      const ok = add ? G.aquaAdd(state, key) : G.aquaRemove(state, key);
      if (ok) {
        sfx(add ? "levelup" : "click");
        save();
        UI.update(state, world);
      }
    },
    feedCat() {
      if (G.feedCat(state)) {
        Rd.catFed();
        UI.toast("나비에게 생선을 줬어요! 10분간 명성·손님 방문 ↑", "gold", root.Sprites.iconURL("cat"));
        save();
      } else if (state.buffs.cat > 0) {
        sfx("meow");
        UI.toast("나비는 배불러요 (남은 버프 " + Math.ceil(state.buffs.cat / 60) + "분)");
      } else {
        sfx("meow");
        UI.toast("생선값 " + G.fmt(G.catFeedCost(state)) + "원이 필요해요");
      }
    },
    wish() {
      G.makeWish(state);
      Rd.starCaught();
      UI.toast("별똥별에 소원을 빌었어요! 30분간 전설·신종 입질 ↑", "gold", root.Sprites.iconURL("wish"));
      save();
    },
    buyFacility(id, amt) {
      const k = amt === "max" ? Math.max(1, G.maxAffordable(state, id)) : Number(amt);
      if (G.buyFacility(state, id, k)) {
        sfx("buy");
        const f = G.FAC[id];
        if (state.owned[id] - (f.free || 0) === k) {
          UI.toast(f.name + " 개업!", "new", root.Sprites.iconURL(id));
        }
        G.MILESTONES.forEach((m) => {
          if (state.owned[id] >= m && state.owned[id] - k < m && id !== "shuttle") {
            UI.toast(f.name + " " + m + "개 달성! " + (id === "seat" ? "입질 속도 ×1.2" : "효과 2배"), "gold", root.Sprites.iconURL(id));
          }
        });
        save();
        UI.update(state, world);
      }
    },
    buyUpgrade(id) {
      if (G.buyUpgrade(state, id)) {
        sfx("levelup");
        const u = G.UPG[id];
        UI.toast(u.name + " 완료!", "new", root.Sprites.iconURL(id));
        save();
        UI.update(state, world);
      }
    },
    cast() {
      G.startCast(world);
    },
    save,
    exportCode() {
      save();
      return G.exportSave(state);
    },
    importCode(code) {
      try {
        const st = G.importSave(code);
        state = st;
        world = G.newWorld();
        Rd.resync();
        UI.refreshAll();
        save();
        UI.update(state, world);
        return true;
      } catch (e) {
        return false;
      }
    },
    reset() {
      storeDel();
      state = G.newState();
      world = G.newWorld();
      Rd.resync();
      UI.refreshAll();
      save();
      UI.update(state, world);
    },
  };

  function checkOffline() {
    const res = G.applyOffline(state, Date.now());
    if (res && res.gain > 0) {
      UI.showOffline(res);
      save();
    }
  }

  function start(hotData) {
    state = load(hotData) || G.newState();
    world = G.newWorld();
    Rd.init(document.getElementById("scene"));
    bindCamera(document.getElementById("scene"));
    if (root.Sound) {
      Rd.onCue = (name, opt) => root.Sound.cue(name, opt);
      // 자동재생 정책: 첫 클릭·키 입력에 오디오 시작
      const unlock = () => {
        root.Sound.unlock();
        document.removeEventListener("pointerdown", unlock);
        document.removeEventListener("keydown", unlock);
      };
      document.addEventListener("pointerdown", unlock);
      document.addEventListener("keydown", unlock);
    }
    document.getElementById("brandIcon").src = root.Sprites.fishURL("redsnapper");
    UI.init(actions);
    if (!(hotData && hotData.state)) {
      checkOffline();
    }
    UI.update(state, world);
    if (state.stats.guests === 0) {
      UI.toast("낡은 좌대 2석으로 시작해요. 사장님 낚시로 첫 자금을 모아보세요!");
    }

    const typing = () => /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    document.addEventListener("keydown", (e) => {
      if (e.code === "Space" && !typing() && document.activeElement.tagName !== "BUTTON") {
        e.preventDefault();
        actions.cast();
      }
      if (e.code === "KeyH" && !typing() && !e.ctrlKey && !e.metaKey) {
        goHome();
      }
      if (/^Key[WASD]$/.test(e.code) && !typing() && !e.ctrlKey && !e.metaKey) {
        keys[e.code] = true;
        e.preventDefault();
      }
    });
    document.addEventListener("keyup", (e) => { keys[e.code] = false; });
    root.addEventListener("blur", () => { Object.keys(keys).forEach((k) => { keys[k] = false; }); });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        save();
      } else {
        checkOffline();
        last = performance.now();
      }
    });
    root.addEventListener("beforeunload", save);
    root.addEventListener("pagehide", save);

    if (root.claude && root.claude.hot && root.claude.hot.snapshot) {
      try {
        root.claude.hot.snapshot(() => ({ state }));
      } catch (e) {
        /* 미리보기 밖에서는 없음 */
      }
    }

    last = performance.now();
    requestAnimationFrame(frame);
    root.__seafarm = { get state() { return state; }, get world() { return world; }, actions };
  }

  function boot() {
    const hot = root.claude && root.claude.hot;
    if (hot && hot.ready) {
      hot.ready(start);
    } else {
      start(hot && hot.data ? hot.data : {});
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
