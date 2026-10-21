/* ============================================================
 * RENDER — 도트(픽셀아트) 바다 낚시터
 * 480×270(16:9) 월드를 저해상도 버퍼에 그리고, 카메라 영역만 정수배 확대. 글자는 고해상도로 덧그림
 *
 * 맵 배치
 *  왼쪽 육지  : 위 줄 매점·대여점·횟집 / 큰길 / 아래 줄 매표소(입구)·수족관 / 아랫길 → 선착장
 *  가운데 바다: 큰길이 나무 다리(보드워크)로 이어지고 위·아래로 좌대 3개씩 (총 6개, 36석)
 *  위쪽 띠    : 선상 투어선 · 양식장 그물 · VIP 비밀 양식장 / 오른쪽 끝 해상 펜션
 *  아래쪽 띠  : 셔틀 여객선이 오른쪽에서 들어와 선착장에 정박
 * 손님은 입구(매표소) 또는 여객선에서 내려 길 그래프의 최단 경로로 자리까지 걸어가고, 끝나면 걸어서 나감
 * ============================================================ */
(function (root) {
  "use strict";
  const G = root.Game;
  const D = root.GameData;
  const S = root.Sprites;

  const W = 480;
  const H = 270;
  const HORIZON = 64;
  const LAND_TOP = 116;
  const COAST = 132;
  const ROAD_U = 166;          // 큰길·다리 중앙선
  const ROAD_L = 242;          // 아랫길 중앙선
  const LANE_X = 114;          // 두 길을 잇는 골목
  const BOARD_END = 444;
  const MW = 80;
  const MH = 46;
  const MOD_X = [146, 240, 334];
  const MOD_Y = [104, 184];
  // 좌대 채우는 순서 [줄, 칸]: 입구 가까운 칸부터
  const MOD_ORDER = [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]];
  const SEAT_OFF = [10, 35, 60];
  const MAX_SEATS_DRAWN = 36;
  // VIP 비밀 양식장: 위쪽 띠 오른쪽 넓은 자리, 위·아래 발판에 6석씩 (12석)
  const SECRET = { x: 296, y: 66, w: 144, h: 32 };
  const VIP_STEP = 22;
  const LADDER_X = MOD_X[2] + SEAT_OFF[1] + 4;
  const OWNER = { x: 126, feet: 114 };
  const TANK = { x: 38, y: 196, w: 58, h: 26 };
  const DOCK_X = 132;
  const FERRY_DOCKED_X = 172;

  const R = {
    canvas: null, ctx: null, buf: null, b: null, K: 3, t: 0,
    pops: [], texts: [], stars: [], rain: [], flash: 0, lights: [], fontReady: false,
    parts: [], ripples: [], jumpers: [], shake: 0, banner: null, fish: [],
    prevOwned: null, prevUpg: null, walkAcc: 0, walkT: 0, jumpT: 4,
    cam: { x: 0, y: 0, z: 1 },
    prevLights: [], aqua: {}, star: null, starT: 20,
    cat: { x: 40, y: 170, mode: "walk", t: 0, dir: 1, tx: 60, eatT: 0, meowT: 25, road: ROAD_U + 4 },
    leavers: [], ferry: { docked: false, x: 600 },
    onCue: null, st: null,
  };
  function cue(name, opt) {
    if (R.onCue) {
      R.onCue(name, opt);
    }
  }

  /* ---------- 카메라 (드래그·WASD 이동, 휠 줌) ---------- */
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 4;
  const HOME = { x: 0, y: 0, z: 1 };    // 홈: 1배율로 낚시터 전체
  // 카메라가 480×270 맵 밖으로 못 나가게 고정. 값이 깨지면(NaN·무한대) 홈으로 복구
  function clampCam() {
    const c = R.cam;
    if (!isFinite(c.x) || !isFinite(c.y) || !isFinite(c.z)) {
      Object.assign(c, HOME);
    }
    c.z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, c.z));
    c.x = Math.max(0, Math.min(W - W / c.z, c.x));
    c.y = Math.max(0, Math.min(H - H / c.z, c.y));
  }
  function cssScale() {
    return R.cssScale > 0 ? R.cssScale : 1;
  }
  function screenToWorld(cssX, cssY) {
    const s = cssScale();
    return { x: R.cam.x + cssX / s / R.cam.z, y: R.cam.y + cssY / s / R.cam.z };
  }
  function toScreen(x, y) {
    return [Math.round((x - R.cam.x) * R.cam.z * R.K), Math.round((y - R.cam.y) * R.cam.z * R.K)];
  }
  function panBy(dxCss, dyCss) {
    if (!isFinite(dxCss) || !isFinite(dyCss)) {
      return;
    }
    const s = cssScale() * R.cam.z;
    R.cam.x -= dxCss / s;
    R.cam.y -= dyCss / s;
    clampCam();
  }
  function panWorld(dx, dy) {
    R.cam.x += dx / R.cam.z;
    R.cam.y += dy / R.cam.z;
    clampCam();
  }
  function zoomAt(cssX, cssY, factor) {
    if (!isFinite(cssX) || !isFinite(cssY) || !(factor > 0)) {
      return;
    }
    const before = screenToWorld(cssX, cssY);
    R.cam.z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, R.cam.z * factor));
    const s = cssScale();
    R.cam.x = before.x - cssX / s / R.cam.z;
    R.cam.y = before.y - cssY / s / R.cam.z;
    clampCam();
  }
  // 홈: 줌 1배 + 기본 위치로 즉시 복귀
  function resetCam() {
    Object.assign(R.cam, HOME);
    clampCam();
  }
  function hitTest(cssX, cssY) {
    const p = screenToWorld(cssX, cssY);
    const s = R.star;
    if (s && Math.hypot(p.x - s.x, p.y - s.y) < 16) {
      return "star";
    }
    const c = R.cat;
    if (c.visible && p.x > c.x - 4 && p.x < c.x + 14 && p.y > c.y - 11 && p.y < c.y + 3) {
      return "cat";
    }
    return null;
  }

  /* ---------- 초기화 ---------- */
  function init(canvas) {
    R.canvas = canvas;
    R.ctx = canvas.getContext("2d");
    R.buf = document.createElement("canvas");
    R.buf.width = W;
    R.buf.height = H;
    R.b = R.buf.getContext("2d");
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 90; i++) {
      R.stars.push({ x: Math.floor(rnd() * W), y: Math.floor(rnd() * (HORIZON - 6)), p: rnd() * 6 });
    }
    for (let i = 0; i < 140; i++) {
      R.rain.push({ x: rnd() * W, y: rnd() * H, v: 160 + rnd() * 70 });
    }
    for (let i = 0; i < 36; i++) {
      R.fish.push({ m: i % 6, x: rnd() * 60, y: rnd() * 26, v: (rnd() < 0.5 ? -1 : 1) * (4 + rnd() * 6) });
    }
    buildGraph();
    resize();
    root.addEventListener("resize", resize);
    if (document.fonts && document.fonts.load) {
      document.fonts.load('11px "Galmuri11"').then(() => { R.fontReady = true; }, () => {});
    }
  }
  function resize() {
    const c = R.canvas;
    const cssW = c.parentElement.clientWidth || W;
    const dpr = Math.min(3, root.devicePixelRatio || 1);
    R.K = Math.max(1, Math.ceil((cssW * dpr) / W));
    c.width = W * R.K;
    c.height = H * R.K;
    c.style.width = cssW + "px";
    c.style.height = Math.round((cssW * H) / W) + "px";
    R.cssScale = cssW / W;
  }

  /* ---------- 픽셀 도구 ---------- */
  function px(x, y, w, h, c) {
    R.b.fillStyle = c;
    R.b.fillRect(Math.round(x), Math.round(y), w, h);
  }
  function line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    R.b.fillStyle = c;
    let guard = 0;
    while (guard++ < 800) {
      R.b.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) {
        break;
      }
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }
  function disc(cx, cy, r, c) {
    for (let y = -r; y <= r; y++) {
      const w = Math.floor(Math.sqrt(r * r - y * y));
      px(cx - w, cy + y, w * 2 + 1, 1, c);
    }
  }
  function ring(cx, cy, rx, ry, c) {
    for (let a = 0; a < 64; a++) {
      const t = (a / 64) * Math.PI * 2;
      px(cx + Math.cos(t) * rx, cy + Math.sin(t) * ry, 1, 1, c);
    }
  }
  function spr(img, x, y, flip) {
    const b = R.b;
    if (flip) {
      b.save();
      b.translate(Math.round(x) + img.width, Math.round(y));
      b.scale(-1, 1);
      b.drawImage(img, 0, 0);
      b.restore();
    } else {
      b.drawImage(img, Math.round(x), Math.round(y));
    }
  }
  function lerpHex(c1, c2, t) {
    const p = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    const a = p(c1);
    const b = p(c2);
    return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("");
  }
  function bands(y0, y1, cTop, cBot, n) {
    const hgt = y1 - y0;
    for (let i = 0; i < n; i++) {
      const a = y0 + Math.floor((hgt * i) / n);
      const z = y0 + Math.floor((hgt * (i + 1)) / n);
      px(0, a, W, z - a, lerpHex(cTop, cBot, n === 1 ? 0 : i / (n - 1)));
      if (i > 0) {
        R.b.fillStyle = lerpHex(cTop, cBot, (i - 1) / (n - 1));
        for (let x = (a % 2); x < W; x += 2) {
          R.b.fillRect(x, a, 1, 1);
        }
      }
    }
  }
  function bob(phase, amp) {
    return Math.round(Math.sin(R.t * 1.7 + phase) * (amp || 1));
  }
  function light(x, y, r, c, a, rect) {
    R.lights.push({ x, y, r, c, a, rect });
  }

  /* ---------- 파티클·파문 ---------- */
  function splash(x, y, n, col) {
    for (let i = 0; i < n; i++) {
      R.parts.push({ x, y, vx: (Math.random() - 0.5) * 30, vy: -18 - Math.random() * 22, g: 90, life: 0.5 + Math.random() * 0.3, c: col || (i % 2 ? "#d8f1ff" : "#ffffff") });
    }
  }
  function burst(x, y, n, cols) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const v = 16 + Math.random() * 22;
      R.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 14, g: 40, life: 0.7 + Math.random() * 0.5, c: cols[i % cols.length], twinkle: true });
    }
  }
  function ripple(x, y, big) {
    R.ripples.push({ x, y, t: 0, dur: big ? 1.1 : 0.8, max: big ? 10 : 6 });
  }
  function drawParticles(dt) {
    for (let i = R.parts.length - 1; i >= 0; i--) {
      const p = R.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        R.parts.splice(i, 1);
        continue;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.twinkle && Math.floor(p.life * 16) % 3 === 0) {
        continue;
      }
      px(p.x, p.y, 1, 1, p.c);
    }
    if (R.parts.length > 500) {
      R.parts.splice(0, R.parts.length - 500);
    }
  }
  function drawRipples(dt) {
    for (let i = R.ripples.length - 1; i >= 0; i--) {
      const r = R.ripples[i];
      r.t += dt;
      if (r.t >= r.dur) {
        R.ripples.splice(i, 1);
        continue;
      }
      const k = r.t / r.dur;
      const rx = 1 + k * r.max;
      ring(r.x, r.y, rx, Math.max(1, rx / 3), "rgba(220,242,255," + (0.8 * (1 - k)).toFixed(2) + ")");
    }
  }

  /* ---------- 하늘 ---------- */
  const SKY = [
    [0, "#1b2550", "#2d3c70"], [4.5, "#1b2550", "#2d3c70"], [6, "#f39a6b", "#ffd6a0"],
    [8, "#58a6e6", "#bfe6ff"], [16, "#4d9be2", "#c2e6ff"], [18, "#e86f5a", "#ffc58a"],
    [19.5, "#3a3570", "#7a5a8a"], [21, "#1b2550", "#2d3c70"], [24, "#1b2550", "#2d3c70"],
  ];
  function skyCols(h) {
    for (let i = 0; i < SKY.length - 1; i++) {
      const a = SKY[i];
      const b = SKY[i + 1];
      if (h >= a[0] && h <= b[0]) {
        const t = (h - a[0]) / (b[0] - a[0]);
        return [lerpHex(a[1], b[1], t), lerpHex(a[2], b[2], t)];
      }
    }
    return [SKY[0][1], SKY[0][2]];
  }
  function darkness(h) {
    if (h >= 20 || h < 4.5) {
      return 0.5;
    }
    if (h >= 18) {
      return ((h - 18) / 2) * 0.5;
    }
    if (h < 6.5) {
      return ((6.5 - h) / 2) * 0.5;
    }
    return 0;
  }
  const CLOUD = [
    ["....WWWW......", "..WWWWWWWW.WW.", ".WWWWWWWWWWWWW", "WWWWWWWWWWWWWW", ".ssssssssssss."],
    ["...WWW...", ".WWWWWWW.", "WWWWWWWWW", ".sssssss."],
  ];
  function drawSky(st, hr) {
    const [top, bot] = skyCols(hr);
    bands(0, HORIZON, top, bot, 8);
    const storm = st.weather === "rain" || st.weather === "typhoon";
    const dayT = (hr - 5) / 14;
    if (dayT > 0 && dayT < 1 && !storm) {
      const x = 30 + dayT * 420;
      const y = HORIZON - Math.sin(dayT * Math.PI) * 50 + 4;
      disc(Math.round(x), Math.round(y), 7, "#fff2a8");
      disc(Math.round(x), Math.round(y), 5, "#ffffff");
    }
    const n = st.weather === "sunny" ? 4 : 8;
    const cw = storm ? "#7c8794" : st.weather === "cloudy" ? "#dfe5ea" : "#ffffff";
    const cs = storm ? "#5c6672" : "#c7d3dd";
    for (let i = 0; i < n; i++) {
      const img = S.get("cloud" + (i % 2) + cw, CLOUD[i % 2], { W: cw, s: cs });
      const x = ((i * 97 + R.t * (2 + (i % 3))) % (W + 40)) - 30;
      spr(img, x, 6 + ((i * 13) % 34));
    }
    // 먼 섬
    for (let x = 300; x < W; x++) {
      const hgt = Math.max(0, Math.round(10 * Math.sin(((x - 300) / 180) * Math.PI) + 3 * Math.sin(x * 0.13)));
      if (hgt > 0) {
        px(x, HORIZON - hgt, 1, hgt, "#5f8f76");
        px(x, HORIZON - hgt, 1, 1, "#7aa98c");
      }
    }
    px(0, HORIZON - 1, W, 1, "#9fd2ef");
  }
  const GULL = [["kW...Wk", "..W.W..", "...W..."], ["...W...", "kWW.WWk", "......."]];
  function drawGulls(st, hr) {
    if (hr < 6 || hr > 18.5 || st.weather === "typhoon") {
      return;
    }
    for (let i = 0; i < 4; i++) {
      const x = ((i * 131 + R.t * (9 + i * 3)) % (W + 60)) - 30;
      const y = 12 + i * 8 + Math.round(Math.sin(R.t * 0.9 + i * 2) * 3);
      const f = Math.floor(R.t * 4 + i) % 2;
      spr(S.get("gull" + f, GULL[f], { W: "#f5f7fa", k: "#5f6b78" }), x, y);
    }
  }

  /* ---------- 바다 ---------- */
  function drawSea(st, hr) {
    const storm = st.weather === "rain" || st.weather === "typhoon";
    bands(HORIZON, H, storm ? "#4f86a6" : "#4aa3df", storm ? "#1f4f6e" : "#17639c", 8);
    // 물결 프레임: 마루가 4프레임으로 흐르고 위에 림라이트 (낮 흰빛 · 노을 주황 · 밤 달빛)
    const frame = Math.floor(R.t * 5) % 4;
    const rim = hr >= 17 && hr < 19.5 ? "#ffc58a" : (hr >= 19.5 || hr < 5.5) ? "#9fb8ff" : "#e6f6ff";
    const body = storm ? "#3f7898" : "#2f86c4";
    const amp = st.weather === "typhoon" ? 3 : st.weather === "rain" ? 2 : 1;
    for (let row = 0; row < 18; row++) {
      const y = HORIZON + 5 + row * 11 + (row % 2) * 3;
      if (y >= H - 2) {
        break;
      }
      const depth = (y - HORIZON) / (H - HORIZON);
      const len = 3 + Math.round(depth * 6);
      const gap = 20 + row * 2;
      const off = ((frame * 2 * amp + row * 7) * (row % 2 ? 1 : -1)) % gap;
      for (let x = -gap + off; x < W; x += gap) {
        px(x, y + 1, len, 1, body);
        px(x + 1, y, len - 2, 1, rim);
      }
    }
    const dayT = (hr - 5) / 14;
    if (dayT > 0 && dayT < 1 && !storm) {
      const sx = Math.round(30 + dayT * 420);
      for (let y = HORIZON + 2; y < HORIZON + 28; y += 3) {
        const w = 2 + Math.round(Math.sin(R.t * 3 + y) * 2 + 2);
        px(sx - w, y, w * 2, 1, "#fff2c0");
      }
    }
    if (hr >= 19.5 || hr < 4.5) {
      const nt = ((hr - 19 + 24) % 24) / 10;
      if (!storm && nt >= 0 && nt <= 1) {
        const mx = Math.round(30 + nt * 420);
        for (let y = HORIZON + 2; y < HORIZON + 36; y += 2) {
          if (Math.sin(R.t * 4 + y * 1.7) > -0.2) {
            const w = 1 + Math.round(Math.abs(Math.sin(R.t * 2 + y)) * 3);
            px(mx - w, y, w * 2, 1, "rgba(220,230,255,0.75)");
          }
        }
      }
      // 직전 프레임 광원이 물에 비침
      R.prevLights.forEach((l) => {
        if (l.y < HORIZON || l.y > H - 8 || isLand(l.x, l.y + 6)) {
          return;
        }
        for (let k = 2; k < 11; k += 2) {
          if (Math.sin(R.t * 6 + l.x + k) > 0) {
            px(l.x - 1 + (k % 4 ? 1 : 0), l.y + k + 4, 2, 1, l.c + "0.5)");
          }
        }
      });
    }
  }
  // 먼바다에서 뛰어오르는 물고기
  function drawJumpers(st, dt) {
    R.jumpT -= dt;
    if (R.jumpT <= 0 && st.weather !== "typhoon") {
      R.jumpT = 4 + Math.random() * 7;
      R.jumpers.push({ x: 150 + Math.random() * 280, y: HORIZON + 4 + Math.random() * 6, dir: Math.random() < 0.5 ? -1 : 1, t: 0 });
    }
    for (let i = R.jumpers.length - 1; i >= 0; i--) {
      const j = R.jumpers[i];
      if (j.t === 0) {
        splash(j.x, j.y, 4);
        ripple(j.x, j.y);
      }
      j.t += dt;
      if (j.t >= 0.8) {
        splash(j.x + j.dir * 16, j.y, 5);
        ripple(j.x + j.dir * 16, j.y, true);
        R.jumpers.splice(i, 1);
        continue;
      }
      const k = j.t / 0.8;
      const shape = ["..XX.", "XXXXX", "..XX."];
      spr(S.get("jf" + j.dir, j.dir > 0 ? S.flipH(shape) : shape, { X: "#2a5a7a" }), j.x + j.dir * 16 * k - 2, j.y - Math.sin(k * Math.PI) * 10 - 1);
    }
  }

  /* ---------- 육지 ---------- */
  function coastX(y) {
    return COAST + Math.round(Math.sin(y * 0.15) * 1.5);
  }
  function isLand(x, y) {
    return y >= LAND_TOP && x < coastX(y);
  }
  function drawLand(st, dt) {
    // 잔디 바탕 + 모래 해안선 + 파도 거품
    for (let y = LAND_TOP; y < H; y++) {
      const cx = coastX(y);
      px(0, y, cx, 1, (y % 6 < 3) ? "#7fae5a" : "#78a654");
      px(cx - 5, y, 5, 1, "#e8d6a0");
      px(cx - 5, y, 1, 1, "#d6c084");
      const foam = Math.sin(R.t * 2.2 + y * 0.35) > 0.2;
      px(cx, y, foam ? 2 : 1, 1, "#f2fbff");
    }
    px(0, LAND_TOP, COAST - 2, 4, "#e8d6a0");
    for (let x = 0; x < COAST; x += 3) {
      const foam = Math.sin(R.t * 2.2 + x * 0.3) > 0.1;
      px(x, LAND_TOP - 1 - (foam ? 1 : 0), 2, 1, "#f2fbff");
    }
    // 잔디 무늬 (고정 위치 점)
    for (let i = 0; i < 70; i++) {
      const x = (i * 53) % 124;
      const y = LAND_TOP + 6 + ((i * 37) % 150);
      if (!onRoad(x, y)) {
        px(x, y, 1, 2, "#5f8f43");
      }
    }
    // 돌길: 큰길·아랫길·골목
    stoneRoad(0, ROAD_U - 6, COAST - 1, 12);
    stoneRoad(0, ROAD_L - 6, COAST - 1, 12);
    stoneRoad(LANE_X - 6, ROAD_U + 6, 12, ROAD_L - ROAD_U - 12);
    void dt;
  }
  function onRoad(x, y) {
    return (Math.abs(y - ROAD_U) < 8) || (Math.abs(y - ROAD_L) < 8) || (Math.abs(x - LANE_X) < 8 && y > ROAD_U && y < ROAD_L);
  }
  function stoneRoad(x, y, w, h) {
    px(x, y, w, h, "#c9bfa8");
    for (let j = 0; j < h; j += 4) {
      for (let i = (j / 4) % 2 ? 0 : 3; i < w; i += 6) {
        px(x + i, y + j, 1, 4, "#b3a88f");
      }
      px(x, y + j, w, 1, "#b3a88f");
    }
    px(x, y, w, 1, "#ddd4bf");
  }

  /* ---------- 건물 ---------- */
  // 공용: 벽돌·판자 벽, 창문(밤에 불빛)
  function win(x, y, w, h, frame) {
    px(x - 1, y - 1, w + 2, h + 2, frame || "#6b4423");
    px(x, y, w, h, "#9fd3f2");
    px(x, y, w, 1, "#d8f0ff");
    px(x, y + Math.floor(h / 2), w, 1, frame || "#6b4423");
    light(x + w / 2, y + h / 2, 7, "rgba(255,215,120,", 0.55, [x, y, w, h]);
  }
  function lot(x, by, w, label) {
    // 빈 땅: 흙바닥 + 울타리 + 팻말
    px(x, by - 10, w, 10, "#b8946a");
    for (let i = 0; i < w; i += 5) {
      px(x + i, by - 14, 1, 6, "#8a6a44");
    }
    px(x, by - 12, w, 1, "#8a6a44");
    px(x + w / 2 - 6, by - 22, 12, 7, "#e8d8b0");
    px(x + w / 2, by - 15, 1, 6, "#6b4423");
    void label;
  }
  function drawShop(st, x, by) {
    if (!st.owned.shop) {
      lot(x, by, 40);
      return;
    }
    const w = 40;
    const h = 26;
    const y = by - h;
    px(x, y, w, h, "#f6ecd2");
    for (let j = 3; j < h; j += 4) {
      px(x, y + j, w, 1, "#e6d6b2");
    }
    px(x, by - 1, w, 1, "#b89a64");
    // 지붕 처마 + 줄무늬 차양 (물결 모양 끝)
    px(x - 2, y - 4, w + 4, 4, "#1d4f9a");
    for (let i = 0; i < w + 4; i += 6) {
      px(x - 2 + i, y, 3, 5, "#2e6fd0");
      px(x + 1 + i, y, 3, 5, "#f5f5f5");
      px(x - 1 + i, y + 5, 2, 1, "#2e6fd0");
      px(x + 2 + i, y + 5, 2, 1, "#f5f5f5");
    }
    // 진열대·계산대
    px(x + 3, y + 9, 20, 10, "#8a5a32");
    px(x + 4, y + 10, 18, 8, "#f4e3b5");
    const goods = ["#e85d5d", "#f2c94c", "#4fa36b", "#5aa0d8", "#c56cf0", "#ff9f43"];
    for (let i = 0; i < 6; i++) {
      px(x + 5 + i * 3, y + 11, 2, 2, goods[i]);
      px(x + 5 + i * 3, y + 15, 2, 2, goods[(i + 3) % 6]);
    }
    px(x + 2, y + 19, 22, 3, "#a87a48");
    // 자판기
    px(x + 27, y + 7, 9, 19, "#d0403a");
    px(x + 28, y + 9, 7, 6, "#bfe6ff");
    for (let i = 0; i < 3; i++) {
      px(x + 28 + i * 2, y + 17, 1, 2, ["#f2c94c", "#4fa36b", "#5aa0d8"][i]);
    }
    light(x + 31, y + 12, 8, "rgba(190,230,255,", 0.5);
  }
  function drawRental(st, x, by) {
    if (!st.owned.rental) {
      lot(x, by, 36);
      return;
    }
    const w = 36;
    const h = 22;
    const y = by - h;
    px(x, y, w, h, "#e8f1f2");
    for (let i = 0; i < w; i += 4) {
      px(x + i, y, 1, h, "#cfdcde");
    }
    // 초록 박공지붕
    for (let i = 0; i < 6; i++) {
      px(x - 2 + i, y - 6 + i, w + 4 - i * 2, 1, i === 5 ? "#1f6a42" : "#2f8f5b");
    }
    px(x + 4, by - 12, 7, 12, "#7a4a22");
    px(x + 9, by - 6, 1, 1, "#f2c94c");
    win(x + 14, y + 5, 8, 6);
    // 바깥 낚싯대 거치대 + 구명조끼
    for (let i = 0; i < 5; i++) {
      px(x + 25 + i * 2, y - 2, 1, h, "#7a4a22");
      px(x + 25 + i * 2, y - 2, 1, 1, ["#f2c94c", "#e5484d", "#5aa0d8", "#4fa36b", "#f39c12"][i]);
    }
    px(x + 13, y + 14, 4, 6, "#f39c12");
    px(x + 18, y + 14, 4, 6, "#f39c12");
    px(x + 13, y + 16, 9, 1, "#d97a0f");
  }
  function drawRestaurant(st, x, by) {
    if (!st.owned.restaurant) {
      lot(x, by, 38);
      return;
    }
    const w = 38;
    const h = 30;
    const y = by - h;
    px(x, y, w, h, "#fff3e0");
    px(x, y + 14, w, 2, "#8a2318");
    // 기와 지붕 (층층이 + 처마 끝 들림)
    for (let i = 0; i < 7; i++) {
      px(x - 3 + i, y - 8 + i, w + 6 - i * 2, 1, i % 2 ? "#3a3f4a" : "#4a5060");
    }
    px(x - 4, y - 2, 3, 1, "#3a3f4a");
    px(x + w + 1, y - 2, 3, 1, "#3a3f4a");
    win(x + 3, y + 3, 9, 8);
    win(x + 26, y + 3, 9, 8);
    // 수조 창 (물고기 헤엄)
    px(x + 3, y + 18, 12, 9, "#3b8fd0");
    px(x + 3, y + 18, 12, 1, "#bfe6ff");
    px(x + 4 + Math.round((Math.sin(R.t) + 1) * 4), y + 22, 3, 1, "#f2a541");
    px(x + 6 + Math.round((Math.cos(R.t * 0.8) + 1) * 3), y + 25, 3, 1, "#e5e5e5");
    // 문 + 노렌(천 가림막)
    px(x + 19, y + 17, 12, 13, "#5a3a1e");
    for (let i = 0; i < 3; i++) {
      px(x + 19 + i * 4, y + 17, 3, 6, "#1d3557");
    }
    px(x + 22, y + 19, 6, 1, "#ffffff");
    // 홍등
    [x + 1, x + w - 3].forEach((lx) => {
      px(lx, y + 15, 2, 4, "#e5484d");
      px(lx, y + 14, 2, 1, "#2a2a2a");
      light(lx + 1, y + 17, 7, "rgba(255,110,80,", 0.7);
    });
  }
  function drawGate(st, by) {
    // 매표소 키오스크 + 입구 아치
    const x = 4;
    px(x, by - 20, 18, 20, "#f2e2c0");
    px(x - 2, by - 24, 22, 4, "#e5484d");
    px(x - 1, by - 25, 20, 1, "#ff7b7b");
    px(x + 3, by - 16, 12, 7, "#9fd3f2");
    px(x + 3, by - 16, 12, 1, "#d8f0ff");
    px(x + 2, by - 9, 14, 2, "#8a5a32");
    light(x + 9, by - 12, 8, "rgba(255,215,120,", 0.55);
    // 아치 (아랫길 위)
    const ax = 26;
    px(ax, ROAD_L - 22, 2, 22, "#6b4423");
    px(ax + 14, ROAD_L - 22, 2, 22, "#6b4423");
    px(ax - 2, ROAD_L - 26, 20, 5, "#2e6fd0");
    px(ax - 2, ROAD_L - 26, 20, 1, "#5aa0d8");
    px(ax + 2, ROAD_L - 24, 12, 1, "#f5f5f5");
    // 깃발
    const f = Math.floor(R.t * 3) % 2;
    px(ax + 15, ROAD_L - 34, 1, 8, "#5f6b78");
    px(ax + 16, ROAD_L - 34 + f, 5, 3, "#f2c94c");
  }
  function drawAquariumBuilding(st, dt) {
    const x = 30;
    const by = 234;
    const w = 74;
    const h = 46;
    const y = by - h;
    // 유리 돔 지붕
    for (let i = 0; i < 10; i++) {
      const inset = Math.round(Math.sqrt(100 - (10 - i) * (10 - i)) );
      px(x + w / 2 - inset * 3.4, y - 10 + i, inset * 6.8, 1, i % 3 ? "#9fd3f2" : "#d8f0ff");
    }
    px(x, y, w, h, "#e6eef2");
    px(x, y, w, 2, "#5a6b78");
    px(x, by - 1, w, 1, "#5a6b78");
    for (let i = 0; i < w; i += 8) {
      px(x + i, y + 2, 1, h - 3, "#cfdde4");
    }
    // 큰 수조 창: 등록한 물고기가 헤엄침
    px(TANK.x - 2, TANK.y - 2, TANK.w + 4, TANK.h + 4, "#33404d");
    drawTank(TANK.x, TANK.y, TANK.w, TANK.h, st, dt, "scene");
    // 입구
    px(x + w / 2 - 5, by - 9, 10, 9, "#2e6fd0");
    px(x + w / 2, by - 9, 1, 9, "#1d3557");
    light(x + w / 2, y + 20, 26, "rgba(120,200,255,", 0.45);
  }

  /* ---------- 수조 (건물 창 · 수족관 화면 공용) ---------- */
  function drawTank(x, y, w, h, st, dt, key) {
    const list = (st.aquarium || []).map((k) => G.aquaEntry(st, k)).filter(Boolean);
    const store = R.aqua[key] || (R.aqua[key] = { fish: {}, bubbles: [] });
    for (let i = 0; i < 4; i++) {
      px(x, y + Math.floor((h * i) / 4), w, Math.ceil(h / 4), i % 2 ? "#2479b3" : "#1f6fa6");
    }
    // 빛줄기
    for (let i = 0; i < 3; i++) {
      const lx = x + ((i * 23 + Math.round(R.t * 3)) % w);
      R.b.fillStyle = "rgba(200,240,255,0.12)";
      R.b.fillRect(lx, y, 3, h - 4);
    }
    px(x, y + h - 4, w, 4, "#e0c48a");
    for (let i = 3; i < w; i += 7) {
      px(x + i, y + h - 4, 2, 1, "#c9a96a");
    }
    for (let i = 0; i < Math.max(2, Math.floor(w / 18)); i++) {
      const sx = x + 6 + i * 18;
      for (let k = 0; k < Math.min(10, h / 3); k++) {
        const sway = Math.round(Math.sin(R.t * 2 + i + k * 0.5) * (k / 4));
        px(sx + sway, y + h - 5 - k, 1, 1, i % 2 ? "#2f8a55" : "#4fae6a");
      }
    }
    if (!list.length) {
      px(x + w / 2 - 8, y + h / 2 - 2, 16, 1, "rgba(255,255,255,0.4)");
    }
    list.forEach((e, i) => {
      let a = store.fish[e.key];
      if (!a) {
        a = store.fish[e.key] = { x: Math.random() * (w - 20), v: (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 5), ph: Math.random() * 6 };
      }
      const img = S.catchSprite(e.sprite, 1, Math.floor(R.t * 6 + i) % 4, st.bred, G.EXP.byId);
      a.x += a.v * dt;
      if (a.x < 1 || a.x > w - img.width - 1) {
        a.v = -a.v;
        a.x = Math.max(1, Math.min(Math.max(1, w - img.width - 1), a.x));
      }
      const range = Math.max(1, h - img.height - 7);
      const fy = y + 2 + ((i * 7) % range) + Math.round(Math.sin(R.t * 1.3 + a.ph) * 2);
      spr(img, x + a.x, fy, a.v > 0);
      if (e.rarity === "legendary" && Math.floor(R.t * 3 + i) % 4 === 0) {
        px(x + a.x + img.width / 2, fy - 1, 1, 1, "#fff2a8");
      }
    });
    // 기포
    if (Math.random() < dt * (w / 10)) {
      store.bubbles.push({ x: x + 3 + Math.random() * (w - 6), y: y + h - 5, v: 6 + Math.random() * 6, r: Math.random() < 0.3 ? 2 : 1, ph: Math.random() * 6 });
    }
    for (let i = store.bubbles.length - 1; i >= 0; i--) {
      const b = store.bubbles[i];
      b.y -= b.v * dt;
      const bx = b.x + Math.sin(R.t * 3 + b.ph);
      if (b.y <= y + 1) {
        px(bx - 1, y + 1, 1, 1, "#e6f6ff");
        px(bx + 1, y + 1, 1, 1, "#e6f6ff");
        store.bubbles.splice(i, 1);
        continue;
      }
      if (b.r > 1) {
        px(bx, b.y, 2, 2, "rgba(230,246,255,0.8)");
        px(bx, b.y, 1, 1, "#ffffff");
      } else {
        px(bx, b.y, 1, 1, "rgba(230,246,255,0.85)");
      }
    }
    px(x, y, w, 1, "#cfeaff");
    px(x + 3, y + 2, 1, h - 8, "rgba(255,255,255,0.3)");
  }

  /* ---------- 나무 다리 · 선착장 · 사장님 부두 ---------- */
  function planks(x, y, w, h, vertical) {
    px(x, y, w, h, "#b98552");
    px(x, y, w, 1, "#d9a46c");
    if (vertical) {
      for (let i = 0; i < w; i += 4) {
        px(x + i, y, 1, h, "#8f5f34");
      }
    } else {
      for (let j = 0; j < h; j += 4) {
        px(x, y + j, w, 1, "#8f5f34");
      }
    }
    px(x, y + h, w, 2, "#6b4423");
  }
  function posts(x0, x1, y, step, len) {
    for (let x = x0; x <= x1; x += step) {
      px(x, y, 2, len, "#5a3a1e");
      if (Math.sin(R.t * 2 + x) > 0) {
        px(x - 1, y + len - 1, 4, 1, "#e6f6ff");
      }
    }
  }
  function drawBoardwalk(st) {
    // 다리는 지어진 좌대(또는 펜션)까지만 이어짐
    let maxCol = 0;
    for (let i = 0; i < moduleCount(st); i++) {
      maxCol = Math.max(maxCol, modulePos(i).col);
    }
    const end = st.owned.pension > 0 || st.upgrades.secret ? BOARD_END : MOD_X[maxCol] + MW;
    posts(COAST + 2, end, ROAD_U + 8, 16, 6);
    planks(COAST - 2, ROAD_U - 6, end - COAST + 2, 12, true);
    // 가로등
    for (let x = 150; x <= end; x += 48) {
      px(x, ROAD_U - 15, 1, 9, "#33404d");
      px(x - 1, ROAD_U - 16, 3, 2, "#ffe9a8");
      light(x, ROAD_U - 15, 12, "rgba(255,225,150,", 0.55);
    }
    // 오른쪽 끝 펜션 데크
    if (st.owned.pension > 0) {
      planks(BOARD_END - 2, ROAD_U - 8, 36, 16, true);
    }
  }
  function drawDock(st) {
    posts(DOCK_X + 2, DOCK_X + 36, ROAD_L + 8, 10, 8);
    planks(DOCK_X - 2, ROAD_L - 6, 40, 12, true);
    // 계류 말뚝 + 밧줄
    px(DOCK_X + 34, ROAD_L - 9, 3, 4, "#33404d");
    void st;
  }
  function drawOwnerJetty() {
    posts(COAST - 4, COAST + 8, 112, 8, 5);
    planks(COAST - 12, 106, 22, 6, true);
  }

  /* ---------- 좌대 (입체 목재 + 그물 + 부표) ---------- */
  function modulePos(m) {
    const [r, c] = MOD_ORDER[m];
    return { x: MOD_X[c], y: MOD_Y[r], row: r, col: c };
  }
  function moduleCount(st) {
    return Math.max(1, Math.min(6, Math.ceil(Math.min(MAX_SEATS_DRAWN, G.seats(st)) / 6)));
  }
  function seatInfo(st, seat) {
    if (seat >= G.VIP_SEAT0) {
      const k = seat - G.VIP_SEAT0;
      const sx = SECRET.x + 8 + (k % 6) * VIP_STEP;
      const d = bob(7, 0.6);
      if (k < 6) {
        const feet = SECRET.y + 5 + d;
        return { x: sx, feet, view: "front", hand: [sx + 7, feet - 6], tip: [sx + 11, feet + 4], bob: [sx + 11, feet + 11], m: -1 };
      }
      const feet = SECRET.y + SECRET.h - 1 + d;
      return { x: sx, feet, view: "back", hand: [sx + 7, feet - 6], tip: [sx + 10, feet - 14], bob: [sx + 10, feet - 19], m: -1 };
    }
    if (seat >= MAX_SEATS_DRAWN) {
      return null;
    }
    const m = Math.floor(seat / 6);
    if (st && m >= moduleCount(st)) {
      return null;
    }
    const p = modulePos(m);
    const k = seat % 6;
    const sx = p.x + SEAT_OFF[k % 3];
    const d = bob(m, 0.6);
    if (k < 3) {
      const feet = p.y + 5 + d;
      return { x: sx, feet, view: "front", hand: [sx + 7, feet - 6], tip: [sx + 11, feet + 4], bob: [sx + 11, feet + 13], m };
    }
    const feet = p.y + MH - 1 + d;
    return { x: sx, feet, view: "back", hand: [sx + 7, feet - 6], tip: [sx + 10, feet - 14], bob: [sx + 10, feet - 21], m };
  }
  function drawModule(st, i, night) {
    const p = modulePos(i);
    const d = bob(i, 0.6);
    const x = p.x;
    const y = p.y + d;
    // 물 위 그림자
    R.b.fillStyle = "rgba(8,30,50,0.35)";
    R.b.fillRect(x + 3, y + MH + 1, MW, 3);
    // 그물 안 물 (더 깊은 색) + 마름모 그물코
    px(x + 5, y + 6, MW - 10, MH - 12, "#1a5a8a");
    px(x + 5, y + 6, MW - 10, 3, "#14496f");
    R.b.fillStyle = "rgba(170,215,240,0.22)";
    for (let k = 0; k < MW + MH; k += 6) {
      for (let s = 0; s < MH - 12; s++) {
        const a = x + 5 + k - s;
        const b2 = x + 5 + k - (MH - 12) + s;
        if (a >= x + 5 && a < x + MW - 5) {
          R.b.fillRect(a, y + 6 + s, 1, 1);
        }
        if (b2 >= x + 5 && b2 < x + MW - 5) {
          R.b.fillRect(b2, y + 6 + s, 1, 1);
        }
      }
    }
    // 물속 물고기 그림자 + 수면 반짝임
    R.fish.filter((f) => f.m === i).forEach((f) => {
      f.x += f.v * R.dt;
      if (f.x < 0 || f.x > MW - 22) {
        f.v = -f.v;
        f.x = Math.max(0, Math.min(MW - 22, f.x));
      }
      spr(S.shadowFish(f.v > 0 ? 1 : -1), x + 7 + f.x, y + 9 + f.y);
    });
    if (Math.sin(R.t * 3 + i) > 0.6) {
      px(x + 12 + ((i * 17 + Math.floor(R.t * 4)) % (MW - 24)), y + 14, 3, 1, "rgba(220,242,255,0.6)");
    }
    // 목재 테두리: 위·아래 발판(세로 판자 이음새 + 못), 좌우 들보
    const plank = (px0, py0, w, h) => {
      px(px0, py0, w, h, "#b98552");
      px(px0, py0, w, 1, "#dcab74");
      for (let k = 0; k < w; k += 7) {
        px(px0 + k, py0, 1, h, "#8f5f34");
        px(px0 + k + 3, py0 + 1, 1, 1, "#e8d2a8");
      }
    };
    plank(x, y, MW, 6);
    plank(x, y + MH - 6, MW, 6);
    px(x, y + 6, 5, MH - 12, "#a8743f");
    px(x + MW - 5, y + 6, 5, MH - 12, "#a8743f");
    px(x + 1, y + 6, 1, MH - 12, "#c99263");
    px(x + MW - 4, y + 6, 1, MH - 12, "#c99263");
    // 앞면 두께
    px(x, y + MH, MW, 2, "#6b4423");
    px(x, y + 6, MW, 1, "#6b4423");
    // 모서리 기둥 + 밧줄
    [[x, y], [x + MW - 3, y], [x, y + MH - 6], [x + MW - 3, y + MH - 6]].forEach(([cx, cy]) => {
      px(cx, cy - 2, 3, 3, "#5a3a1e");
    });
    // 부표: 아래 가장자리 흰·주황 통
    for (let k = 0; k < 5; k++) {
      const fx = x + 4 + k * ((MW - 10) / 4);
      const bb = Math.round(Math.sin(R.t * 2 + k + i) * 0.6);
      px(fx, y + MH + 2 + bb, 6, 3, k % 2 ? "#f5f5f5" : "#e8662b");
      px(fx + 1, y + MH + 5 + bb, 4, 1, "rgba(255,255,255,0.5)");
    }
    // 파도 거품 (아래 가장자리)
    for (let k = 0; k < MW; k += 4) {
      if (Math.sin(R.t * 2.5 + k * 0.4 + i) > 0.3) {
        px(x + k, y + MH + 6, 2, 1, "#e6f6ff");
      }
    }
    // 그늘막·밤 랜턴
    if (st.upgrades.shade) {
      [x + 24, x + 62].forEach((cx) => {
        px(cx, y - 9, 1, 10, "#6b6b6b");
        px(cx - 6, y - 11, 13, 2, "#e5484d");
        px(cx - 4, y - 12, 9, 1, "#e5484d");
        px(cx - 4, y - 11, 2, 2, "#f5f5f5");
        px(cx + 2, y - 11, 2, 2, "#f5f5f5");
      });
    }
    if (night) {
      px(x + 1, y - 4, 2, 3, "#ffe9a8");
      px(x + MW - 3, y - 4, 2, 3, "#ffe9a8");
      light(x + 2, y - 3, 10, "rgba(255,220,140,", 0.5);
      light(x + MW - 2, y - 3, 10, "rgba(255,220,140,", 0.5);
    }
  }
  function drawRamp(i) {
    const p = modulePos(i);
    const cx = p.x + MW / 2 - 4;
    if (p.row === 0) {
      planks(cx, p.y + MH, 8, ROAD_U - 6 - (p.y + MH), false);
    } else {
      planks(cx, ROAD_U + 6, 8, p.y - (ROAD_U + 6), false);
    }
  }
  function drawCages(st, world, night) {
    const n = moduleCount(st);
    for (let i = 0; i < n; i++) {
      drawRamp(i);
    }
    // 위 줄 먼저(멀리) 그리고, 각 좌대 위 손님
    const order = [];
    for (let i = 0; i < n; i++) {
      order.push(i);
    }
    order.sort((a, b) => modulePos(a).row - modulePos(b).row);
    order.forEach((i) => {
      drawModule(st, i, night);
      const here = world.guests.filter((g) => g.seat < MAX_SEATS_DRAWN && Math.floor(g.seat / 6) === i && !(g.walk > 0));
      ["front", "back"].forEach((view) => {
        here.forEach((g) => {
          const info = seatInfo(st, g.seat);
          if (info && info.view === view) {
            drawOneGuest(st, g, info);
          }
        });
      });
      for (let k = 0; k < 6; k++) {
        const seat = i * 6 + k;
        if (seat < G.seats(st) && !world.seatOcc[seat]) {
          const info = seatInfo(st, seat);
          px(info.x + 2, info.feet - 1, 4, 1, "rgba(255,255,255,0.55)");
        }
      }
    });
    if (night && st.upgrades.night) {
      const y = MOD_Y[0] - 3;
      line(MOD_X[0] - 2, y, MOD_X[2] + MW, y, "#333a42");
      for (let x = MOD_X[0] + 4; x < MOD_X[2] + MW; x += 14) {
        px(x, y + 1, 2, 2, "#f4ffe8");
        light(x + 1, y + 2, 18, "rgba(200,255,190,", 0.4);
      }
    }
  }

  /* ---------- 위쪽 띠: 투어선 · 양식장 · 비밀 양식장 · 펜션 ---------- */
  function boat(x, y, opt) {
    // 큰 배: 선체(두 줄 색) · 선실(창문·승객) · 조타실 · 깃발 · 물보라
    const w = opt.w;
    const hull = opt.hull || "#f2f4f6";
    const stripe = opt.stripe || "#b03a2e";
    for (let i = 0; i < 6; i++) {
      const inset = i < 2 ? 0 : i - 1;
      px(x + inset, y + i, w - inset * 2 - (i > 3 ? 2 : 0), 1, i === 1 || i === 2 ? stripe : hull);
    }
    px(x + 3, y + 6, w - 8, 1, "rgba(8,30,50,0.45)");
    const cw = Math.round(w * 0.55);
    const cx = x + Math.round(w * 0.2);
    px(cx, y - 9, cw, 9, opt.cabin || "#e8edf1");
    px(cx, y - 10, cw, 1, "#c9d3dc");
    const nwin = Math.floor((cw - 4) / 6);
    for (let i = 0; i < nwin; i++) {
      const wx = cx + 3 + i * 6;
      px(wx, y - 7, 4, 4, "#5aa0d8");
      px(wx, y - 7, 4, 1, "#bfe6ff");
      if (opt.passengers && i < opt.passengers) {
        px(wx + 1, y - 6, 2, 2, ["#f6cfa3", "#e7b382", "#c98d5c"][i % 3]);
        px(wx + 1, y - 7, 2, 1, ["#2b1d14", "#141414", "#6b4423"][i % 3]);
      }
      light(wx + 2, y - 5, 6, "rgba(255,225,150,", 0.5);
    }
    px(cx + cw - 9, y - 16, 9, 6, "#dfe6ea");
    px(cx + cw - 8, y - 15, 7, 3, "#5aa0d8");
    px(cx + cw - 5, y - 23, 1, 7, "#5f6b78");
    px(cx + cw - 4, y - 23 + (Math.floor(R.t * 3) % 2), 5, 3, opt.flag || "#e5484d");
    if (opt.rods) {
      for (let i = 0; i < 4; i++) {
        line(x + 4 + i * (w - 10) / 3, y - 1, x + 2 + i * (w - 10) / 3 - 4, y - 10, "#7a4a22");
      }
    }
    if (opt.wake) {
      for (let i = 0; i < 6; i++) {
        const wx = opt.wake > 0 ? x + w + 2 + i * 4 : x - 4 - i * 4;
        if (Math.sin(R.t * 8 + i) > -0.3) {
          px(wx, y + 4 + (i % 2), 3, 1, "#e6f6ff");
        }
      }
    }
  }
  function drawTourShip(st) {
    if (!st.upgrades.boat) {
      return;
    }
    const x = Math.round(136 + (Math.sin(R.t * 0.07) + 1) * 6);
    const y = 84 + bob(2, 0.6);
    boat(x, y, { w: 52, rods: true, passengers: 4, wake: Math.cos(R.t * 0.07) > 0 ? -1 : 1 });
  }
  function drawFarm(st) {
    const n = Math.min(6, st.owned.farm);
    for (let i = 0; i < n; i++) {
      const cx = 216 + (i % 3) * 24;
      const cy = 72 + Math.floor(i / 3) * 13 + bob(i, 0.6);
      ring(cx, cy, 11, 4, "#d6b66e");
      ring(cx, cy, 8, 3, "rgba(220,240,255,0.5)");
      px(cx - 1, cy - 1, 2, 2, "rgba(8,30,50,0.5)");
    }
  }
  function drawSecretFarm(st, world, night) {
    if (!st.upgrades.secret) {
      return;
    }
    const d = bob(7, 0.6);
    const x = SECRET.x;
    const y = SECRET.y + d;
    const w = SECRET.w;
    const h = SECRET.h;
    px(x + 4, y + 5, w - 8, h - 10, "#3a1f5f");
    R.b.fillStyle = "rgba(200,150,255,0.35)";
    for (let gx = x + 7; gx < x + w - 4; gx += 4) {
      R.b.fillRect(gx, y + 5, 1, h - 10);
    }
    const glow = 0.5 + 0.5 * Math.sin(R.t * 2);
    px(x + 8 + Math.round(glow * (w - 20)), y + 10, 4, 1, "#d6b3ff");
    px(x, y, w, 5, "#c99a63");
    px(x, y, w, 1, "#e6c08a");
    px(x, y + h - 5, w, 5, "#c99a63");
    px(x, y + h, w, 2, "#6b4423");
    px(x, y + 5, 4, h - 10, "#b07f4c");
    px(x + w - 4, y + 5, 4, h - 10, "#b07f4c");
    for (let i = 0; i < w; i += 6) {
      px(x + i, y - 4, 1, 4, "#f2c230");
    }
    px(x, y - 4, w, 1, "#f2c230");
    light(x + w / 2, y + 10, 18, "rgba(190,140,255,", 0.5);
    // 아래 좌대로 내려가는 사다리
    const lx = LADDER_X;
    for (let yy = y + h + 2; yy < MOD_Y[0]; yy += 2) {
      px(lx - 2, yy, 5, 1, "#8f5f34");
    }
    void night;
    ["front", "back"].forEach((view) => {
      world.guests.forEach((g) => {
        const info = g.seat >= G.VIP_SEAT0 && !(g.walk > 0) ? seatInfo(st, g.seat) : null;
        if (info && info.view === view) {
          drawOneGuest(st, g, info, "vip");
        }
      });
    });
  }
  function drawPension(st) {
    const n = Math.min(4, st.owned.pension);
    const slots = [[448, 100], [448, 128], [448, 184], [448, 212]];
    for (let i = 0; i < n; i++) {
      const [x, y] = slots[i];
      const d = bob(i + 3, 0.5);
      px(x - 2, y + 20 + d, 30, 3, "#c4935e");
      px(x - 2, y + 23 + d, 30, 1, "#7d5230");
      px(x + 1, y + 24 + d, 2, 4, "#5a3a1e");
      px(x + 23, y + 24 + d, 2, 4, "#5a3a1e");
      px(x, y + d, 26, 20, "#fdf6ec");
      for (let j = 3; j < 20; j += 4) {
        px(x, y + j + d, 26, 1, "#ece0cc");
      }
      for (let k = 0; k < 6; k++) {
        px(x - 2 + k, y - 6 + k + d, 30 - k * 2, 1, k === 5 ? "#583590" : "#7b4fb3");
      }
      win(x + 3, y + 5 + d, 6, 5);
      win(x + 17, y + 5 + d, 6, 5);
      px(x + 10, y + 11 + d, 6, 9, "#7a4a22");
    }
  }
  function drawExpBoats(st) {
    const crew = st.owned.crew || 0;
    if (!crew) {
      return;
    }
    const n = Math.min(4, Math.ceil(crew / 10));
    for (let i = 0; i < n; i++) {
      const x = Math.round(((i * 113 + R.t * (2 + i * 0.5)) % (W + 40)) - 20);
      const y = HORIZON - 4 + (i % 2);
      px(x, y, 16, 3, "#e8edf1");
      px(x + 1, y + 3, 14, 1, "#1d3557");
      px(x + 4, y - 4, 6, 4, "#dfe6ea");
      px(x + 5, y - 3, 2, 2, "#5aa0d8");
      px(x + 11, y - 9, 1, 9, "#5f6b78");
      line(x + 12, y - 9, x + 16, y - 2, "#7a4a22");
    }
  }

  /* ---------- 원정 전용 선착장 (매점·대여점 위 모래사장) ---------- */
  const EXP_DOCK = { x: 50, y0: 94, y1: LAND_TOP + 2 };
  const EXP_MOOR = { x: 60, y: 102 };          // 정박 위치 (선체 윗면)
  const EXP_FAR = { x: 230, y: HORIZON + 1 };  // 수평선 (여기서 사라지고 나타남)
  const SAIL = 20;                              // 출항·귀항 연출 시간 (초)
  function drawExpDock(st) {
    if (!(st.owned.crew > 0)) {
      return;
    }
    posts(EXP_DOCK.x, EXP_DOCK.x + 8, EXP_DOCK.y0 + 2, 8, 6);
    planks(EXP_DOCK.x, EXP_DOCK.y0, 10, EXP_DOCK.y1 - EXP_DOCK.y0, false);
    px(EXP_DOCK.x + 10, EXP_DOCK.y0 + 2, 3, 4, "#33404d");
  }
  // 0 = 정박, 1 = 수평선 너머. 출항 SAIL초 동안 0→1, 귀항 SAIL초 동안 1→0, 그 사이는 안 보임
  function expBoatOut(st) {
    const dp = st.dispatch;
    if (!dp) {
      return 0;
    }
    const sail = Math.min(SAIL, dp.dur / 3);
    if (dp.t < sail) {
      return dp.t / sail;
    }
    if (dp.t > dp.dur - sail) {
      return (dp.dur - dp.t) / sail;
    }
    return 1;
  }
  function drawExpBoat(st) {
    if (!(st.owned.crew > 0)) {
      return;
    }
    const k = expBoatOut(st);
    if (k >= 1) {
      return;
    }
    const e = k * k * (3 - 2 * k);
    const x = Math.round(EXP_MOOR.x + (EXP_FAR.x - EXP_MOOR.x) * e);
    // 선체 윗면이 항상 수면(HORIZON) 아래쪽 바다 위에 있도록
    const y = Math.max(HORIZON + 1, Math.round(EXP_MOOR.y + (EXP_FAR.y - EXP_MOOR.y) * e)) + (k === 0 ? bob(9, 0.6) : 0);
    const w = Math.max(14, Math.round(44 * (1 - e * 0.65)));
    const leaving = st.dispatch && st.dispatch.t < st.dispatch.dur / 2;
    boat(x, y, { w, rods: true, passengers: k === 0 ? 0 : 3, flag: "#f2c94c", wake: k > 0 && k < 1 ? (leaving ? -1 : 1) : 0 });
  }

  /* ---------- 여객선 (셔틀) ---------- */
  // 26초 주기: 0~7초 입항 · 7~15초 정박(승하선) · 15~22초 출항 · 22~26초 바깥
  function ferryState(st) {
    if (!st.owned.shuttle) {
      return { visible: false, docked: false };
    }
    const period = 26;
    const t = R.t % period;
    const ease = (k) => k * k * (3 - 2 * k);
    let x;
    let dir = 0;
    if (t < 7) {
      x = W + 20 - ease(t / 7) * (W + 20 - FERRY_DOCKED_X);
      dir = -1;
    } else if (t < 15) {
      x = FERRY_DOCKED_X;
    } else if (t < 22) {
      x = FERRY_DOCKED_X + ease((t - 15) / 7) * (W + 20 - FERRY_DOCKED_X);
      dir = 1;
    } else {
      x = W + 40;
    }
    return { visible: x < W + 10, docked: t >= 7 && t < 15, x, dir };
  }
  function drawFerry(st) {
    const f = ferryState(st);
    R.ferry = f;
    if (!f.visible) {
      return;
    }
    const y = ROAD_L + 2 + bob(5, 0.8);
    boat(Math.round(f.x), y, { w: 72, hull: "#f5f5f5", stripe: "#f39c12", cabin: "#eef2f5", passengers: f.docked ? 2 : 7, flag: "#2e6fd0", wake: f.dir });
    if (f.docked) {
      // 승하선 발판
      planks(DOCK_X + 36, ROAD_L - 3, FERRY_DOCKED_X - DOCK_X - 32, 4, true);
    }
  }

  /* ---------- 걷는 길 그래프 · 최단 경로 ---------- */
  const NODES = [];
  const ADJ = [];
  const SEAT_NODE = {};
  const NODE = {};
  function node(x, y) {
    NODES.push({ x, y });
    ADJ.push([]);
    return NODES.length - 1;
  }
  function link(a, b) {
    const d = Math.hypot(NODES[a].x - NODES[b].x, NODES[a].y - NODES[b].y);
    ADJ[a].push([b, d]);
    ADJ[b].push([a, d]);
  }
  function chain(ids) {
    for (let i = 0; i < ids.length - 1; i++) {
      link(ids[i], ids[i + 1]);
    }
  }
  function buildGraph() {
    NODE.gateOut = node(-10, ROAD_L);
    NODE.gateIn = node(34, ROAD_L);
    NODE.laneBot = node(LANE_X, ROAD_L);
    NODE.dock = node(DOCK_X + 20, ROAD_L);
    NODE.gang = node(FERRY_DOCKED_X + 12, ROAD_L);
    chain([NODE.gateOut, NODE.gateIn, NODE.laneBot, NODE.dock, NODE.gang]);
    NODE.laneTop = node(LANE_X, ROAD_U);
    link(NODE.laneBot, NODE.laneTop);
    NODE.pier = node(COAST + 2, ROAD_U);
    link(NODE.laneTop, NODE.pier);
    const board = MOD_X.map((mx) => node(mx + MW / 2, ROAD_U));
    chain([NODE.pier].concat(board));
    for (let m = 0; m < 6; m++) {
      const p = modulePos(m);
      const yT = p.y + 3;
      const yB = p.y + MH - 3;
      const top = SEAT_OFF.map((o, k) => (SEAT_NODE[m * 6 + k] = node(p.x + o + 4, yT)));
      const bot = SEAT_OFF.map((o, k) => (SEAT_NODE[m * 6 + 3 + k] = node(p.x + o + 4, yB)));
      const TL = node(p.x + 2, yT);
      const TR = node(p.x + MW - 2, yT);
      const BL = node(p.x + 2, yB);
      const BR = node(p.x + MW - 2, yB);
      chain([TL].concat(top, [TR]));
      chain([BL].concat(bot, [BR]));
      link(TL, BL);
      link(TR, BR);
      // 다리 → 경사로 → 가까운 발판 가운데 자리
      link(board[p.col], p.row === 0 ? bot[1] : top[1]);
    }
    // 비밀 양식장: 오른쪽 위 좌대의 먼 발판 가운데에서 사다리
    const vyT = SECRET.y + 3;
    const vyB = SECRET.y + SECRET.h - 3;
    const vTop = [];
    const vBot = [];
    for (let k = 0; k < 6; k++) {
      const vx = SECRET.x + 8 + k * VIP_STEP + 4;
      vTop.push(SEAT_NODE[G.VIP_SEAT0 + k] = node(vx, vyT));
      vBot.push(SEAT_NODE[G.VIP_SEAT0 + 6 + k] = node(vx, vyB));
    }
    const vTL = node(SECRET.x + 2, vyT);
    const vTR = node(SECRET.x + SECRET.w - 2, vyT);
    const vBL = node(SECRET.x + 2, vyB);
    const vBR = node(SECRET.x + SECRET.w - 2, vyB);
    const ladder = node(LADDER_X, vyB);
    const botLine = vBot.concat([ladder]).sort((a, b) => NODES[a].x - NODES[b].x);
    chain([vTL].concat(vTop, [vTR]));
    chain([vBL].concat(botLine, [vBR]));
    link(vTL, vBL);
    link(vTR, vBR);
    const upperRight = MOD_ORDER.findIndex(([r, c]) => r === 0 && c === 2);
    link(ladder, SEAT_NODE[upperRight * 6 + 1]);
  }
  // 다익스트라 (노드 수가 적어 단순 구현)
  function shortestPath(a, b) {
    const n = NODES.length;
    const dist = new Array(n).fill(Infinity);
    const prev = new Array(n).fill(-1);
    const done = new Array(n).fill(false);
    dist[a] = 0;
    for (let it = 0; it < n; it++) {
      let u = -1;
      for (let i = 0; i < n; i++) {
        if (!done[i] && (u < 0 || dist[i] < dist[u])) {
          u = i;
        }
      }
      if (u < 0 || dist[u] === Infinity || u === b) {
        break;
      }
      done[u] = true;
      ADJ[u].forEach(([v, w]) => {
        if (dist[u] + w < dist[v]) {
          dist[v] = dist[u] + w;
          prev[v] = u;
        }
      });
    }
    if (dist[b] === Infinity) {
      return null;
    }
    const out = [];
    for (let v = b; v >= 0; v = prev[v]) {
      out.unshift({ x: NODES[v].x, y: NODES[v].y });
    }
    return out;
  }
  function measure(path) {
    const cum = [0];
    for (let i = 1; i < path.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
    }
    return { path, cum, len: cum[cum.length - 1] };
  }
  function pointAt(route, f) {
    const d = Math.max(0, Math.min(1, f)) * route.len;
    const { path, cum } = route;
    for (let i = 1; i < path.length; i++) {
      if (d <= cum[i]) {
        const k = (d - cum[i - 1]) / Math.max(0.001, cum[i] - cum[i - 1]);
        return { x: path[i - 1].x + (path[i].x - path[i - 1].x) * k, y: path[i - 1].y + (path[i].y - path[i - 1].y) * k, dx: path[i].x - path[i - 1].x, dy: path[i].y - path[i - 1].y };
      }
    }
    const l = path[path.length - 1];
    return { x: l.x, y: l.y, dx: 0, dy: 0 };
  }
  // 입구 선택: 여객선이 정박해 있으면 배에서 내림, 아니면 매표소
  function entryNode(st) {
    return ferryState(st).docked ? NODE.gang : NODE.gateOut;
  }
  function drawWalker(look, skin, hair, pos, moving) {
    const view = pos.dy < -0.3 && Math.abs(pos.dy) > Math.abs(pos.dx) ? "back" : "front";
    const step = moving ? (Math.floor(R.t * 8) % 2 ? "walkA" : "walkB") : null;
    const img = S.person(view, look, skin, hair, step);
    const lift = moving && step === "walkA" ? 1 : 0;
    // 발밑 그림자
    R.b.fillStyle = "rgba(0,0,0,0.25)";
    R.b.fillRect(Math.round(pos.x) - 3, Math.round(pos.y), 7, 1);
    spr(img, pos.x - 4, pos.y - 13 - lift, pos.dx < 0);
  }
  // 걸어 들어오는 손님 (logic의 walk 시간에 맞춰 경로 위 위치 결정)
  function drawArrivals(st, world) {
    world.guests.forEach((g) => {
      if (!(g.walk > 0)) {
        return;
      }
      const target = SEAT_NODE[g.seat];
      if (target === undefined) {
        return;
      }
      if (!g._route) {
        const path = shortestPath(entryNode(st), target);
        if (!path) {
          return;
        }
        g._route = measure(path);
        g._skin = Math.floor(Math.random() * S.SKINS.length);
        g._hair = Math.floor(Math.random() * S.HAIRS.length);
      }
      const f = 1 - g.walk / G.WALK_IN;
      drawWalker(g.vip ? "vip" : g.type.id, g._skin, g._hair, pointAt(g._route, f), true);
    });
  }
  function startLeaver(st, ev) {
    const g = ev.guest;
    const from = SEAT_NODE[ev.seat];
    if (!g || from === undefined) {
      return;
    }
    const exit = st.owned.shuttle > 0 && Math.random() < 0.4 ? NODE.gang : NODE.gateOut;
    const path = shortestPath(from, exit);
    if (!path) {
      return;
    }
    R.leavers.push({ route: measure(path), t: 0, dur: G.WALK_IN, look: g.vip ? "vip" : g.type.id, skin: g._skin || 0, hair: g._hair || 0 });
  }
  function drawLeavers(dt) {
    for (let i = R.leavers.length - 1; i >= 0; i--) {
      const l = R.leavers[i];
      l.t += dt;
      if (l.t >= l.dur) {
        R.leavers.splice(i, 1);
        continue;
      }
      drawWalker(l.look, l.skin, l.hair, pointAt(l.route, l.t / l.dur), true);
    }
    if (R.leavers.length > 60) {
      R.leavers.splice(0, R.leavers.length - 60);
    }
  }

  /* ---------- 손님 동작 ---------- */
  function drawRodAndLine(info, bite) {
    const [hx, hy] = info.hand;
    const [tx, ty] = info.tip;
    let [bx, by] = info.bob;
    if (bite) {
      by += 1;
    } else if (Math.sin(R.t * 2.6 + bx * 0.7) > 0.55) {
      by += 1;
    }
    line(tx, ty, bx, by - 1, "rgba(235,245,250,0.75)");
    line(hx, hy, tx, ty, "#6b4423");
    px(tx, ty, 1, 1, "#d9b38c");
    px(bx, by - 1, 2, 1, "#ff3b30");
    px(bx, by, 2, 1, "#f5f5f5");
    if (bite) {
      px(bx - 2, by + 1, 1, 1, "#d8f1ff");
      px(bx + 3, by + 1, 1, 1, "#d8f1ff");
      px(bx - 1, by + 2, 4, 1, "rgba(216,241,255,0.6)");
    }
  }
  function guestPose(g) {
    if (g.bite > 0.95) {
      return "surprise";
    }
    if (g.bite > 0.4) {
      return "reel";
    }
    if (g._drinkUntil > R.t) {
      return "drink";
    }
    if (Math.random() < R.dt * 0.025) {
      g._drinkUntil = R.t + 2.2;
    }
    return null;
  }
  function drawOneGuest(st, g, info, look) {
    if (!info) {
      return;
    }
    if (g._skin === undefined) {
      g._skin = Math.floor(Math.random() * S.SKINS.length);
      g._hair = Math.floor(Math.random() * S.HAIRS.length);
    }
    const pose = guestPose(g);
    const bite = g.bite > 0.5;
    const hop = pose === "surprise" && Math.floor(g.bite * 10) % 2 ? 1 : 0;
    const nod = !pose && Math.sin(R.t * 1.1 + g.seat) > 0.85 ? 1 : 0;
    const img = S.person(info.view, look || g.type.id, g._skin, g._hair, pose);
    const rod = pose === "reel" ? Object.assign({}, info, { tip: [info.tip[0] - 1, info.tip[1] - (info.view === "front" ? 9 : 4)] }) : info;
    const yTop = info.feet - 13 - hop + nod;
    if (info.view === "front") {
      drawRodAndLine(rod, bite);
      spr(img, info.x, yTop);
    } else {
      spr(img, info.x, yTop);
      drawRodAndLine(rod, bite);
    }
    if (pose === "surprise") {
      px(info.x + 3, info.feet - 21, 2, 4, "#ffe066");
      px(info.x + 3, info.feet - 16, 2, 1, "#ffe066");
    }
    if (g.lv >= 10) {
      px(info.x + 2, yTop - 3, 5, 1, "#f2c230");
      px(info.x + 2, yTop - 4, 1, 1, "#f2c230");
      px(info.x + 4, yTop - 5, 1, 2, "#f2c230");
      px(info.x + 6, yTop - 4, 1, 1, "#f2c230");
    } else if (g.lv >= 5) {
      px(info.x + 4, yTop - 4, 1, 3, "#ffe680");
      px(info.x + 3, yTop - 3, 3, 1, "#ffe680");
    }
  }

  /* ---------- 사장님 ---------- */
  function ownerInfo() {
    return { view: "front", hand: [OWNER.x + 7, OWNER.feet - 6], tip: [OWNER.x + 14, OWNER.feet - 10], bob: [OWNER.x + 20, OWNER.feet - 20] };
  }
  function drawOwner(world) {
    const img = S.person("front", "owner", 0, 1, world.cast && world.cast.t > world.cast.dur * 0.55 ? "reel" : null);
    const casting = world.cast;
    const bite = casting && casting.t > casting.dur * 0.55;
    const info = ownerInfo();
    if (casting) {
      const p = Math.min(1, casting.t / 0.35);
      info.tip = [OWNER.x + 8 + 6 * p, OWNER.feet - 18 + 8 * p];
    }
    drawRodAndLine(info, bite);
    spr(img, OWNER.x, OWNER.feet - 13);
    if (bite) {
      px(OWNER.x + 3, OWNER.feet - 21, 2, 4, "#ffe066");
      px(OWNER.x + 3, OWNER.feet - 16, 2, 1, "#ffe066");
    }
  }

  /* ---------- 고양이 '나비' ---------- */
  function drawCat(st, dt) {
    const c = R.cat;
    c.visible = true;
    c.t -= dt;
    c.meowT -= dt;
    if (c.meowT <= 0) {
      c.meowT = 30 + Math.random() * 40;
      cue("meow");
    }
    if (c.eatT > 0) {
      c.eatT -= dt;
      c.mode = "eat";
    } else if (c.t <= 0) {
      const r = Math.random();
      c.mode = r < 0.45 ? "walk" : r < 0.72 && st.owned.shop > 0 ? "loaf" : "watch";
      c.t = c.mode === "walk" ? 7 : 8 + Math.random() * 6;
      c.tx = 6 + Math.random() * 110;
      c.road = Math.random() < 0.6 ? ROAD_U + 4 : ROAD_L + 4;
    }
    let frame = "walk0";
    if (c.mode === "walk" || (c.mode === "watch" && Math.abs(c.x - 120) > 1)) {
      const target = c.mode === "watch" ? 120 : c.tx;
      c.y = c.mode === "watch" ? ROAD_U + 4 : c.road;
      const dir = target > c.x ? 1 : -1;
      c.dir = dir;
      c.x += dir * 12 * dt;
      if (Math.abs(target - c.x) < 1) {
        c.x = target;
      }
      frame = Math.floor(R.t * 6) % 2 ? "walk1" : "walk0";
    } else if (c.mode === "loaf") {
      c.x = 14;
      c.y = 128;
      frame = "loaf";
    } else if (c.mode === "watch") {
      c.dir = 1;
      frame = "sit";
    } else if (c.mode === "eat") {
      if (c.y === 128) {
        c.y = ROAD_U + 4;
      }
      frame = "eat";
    }
    const img = S.catSprite(frame);
    spr(img, c.x, c.y - img.height, c.dir < 0);
    if (frame === "sit" || frame === "loaf") {
      px(c.x + 9, c.y - 3 - (Math.floor(R.t * 2) % 2), 1, 1, "#f2a541");
    }
    if (st.buffs.cat > 0 && Math.floor(R.t * 2) % 3 === 0) {
      const hy = c.y - 10 - (R.t * 4) % 4;
      px(c.x + 4, hy, 1, 1, "#ff6b8a");
      px(c.x + 6, hy, 1, 1, "#ff6b8a");
      px(c.x + 5, hy + 1, 1, 1, "#ff6b8a");
    }
  }
  function catFed() {
    R.cat.eatT = 4;
    burst(R.cat.x + 5, R.cat.y - 6, 10, ["#ff6b8a", "#ffffff", "#ffe680"]);
    cue("meow", { happy: true });
  }

  /* ---------- 갯바위 (왼쪽 위 바다) ---------- */
  function drawRocks(st) {
    if (!st.upgrades.rock) {
      return;
    }
    const pts = [[0, 60], [10, 50], [22, 56], [34, 44], [48, 52], [62, 58], [76, 66], [90, 76]];
    for (let x = 0; x < 92; x++) {
      let top = 80;
      for (let i = 0; i < pts.length - 1; i++) {
        if (x >= pts[i][0] && x <= pts[i + 1][0]) {
          const t = (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
          top = Math.round(pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t);
        }
      }
      px(x, top, 1, 84 - top, x % 7 < 3 ? "#5d636c" : "#6e757e");
      px(x, top, 1, 1, "#8b929b");
      if (Math.sin(R.t * 2 + x * 0.4) > 0.4) {
        px(x, 83, 1, 1, "#e6f6ff");
      }
    }
    [[16, 54], [40, 48]].forEach(([x, y], i) => {
      spr(S.person("front", i ? "angler" : "tourist", i, i + 1), x - 4, y - 13);
      line(x + 3, y - 6, x + 12, y - 16, "#6b4423");
      line(x + 12, y - 16, x + 16, y + 14, "rgba(255,255,255,0.6)");
    });
  }

  /* ---------- 날씨 ---------- */
  function drawWeather(st, dt, season) {
    if (st.weather === "rain" && season === "winter") {
      R.b.fillStyle = "rgba(200,215,235,0.12)";
      R.b.fillRect(0, 0, W, H);
      for (let i = 0; i < 110; i++) {
        const d = R.rain[i];
        d.y += d.v * 0.12 * dt;
        d.x += Math.sin(R.t * 1.3 + i) * 6 * dt;
        if (d.y > H) {
          d.y = -2;
          d.x = Math.random() * W;
        }
        px(((d.x % W) + W) % W, d.y, i % 4 ? 1 : 2, i % 4 ? 1 : 2, "#ffffff");
      }
      return;
    }
    if (season === "spring" && (st.weather === "sunny" || st.weather === "cloudy")) {
      for (let i = 0; i < 20; i++) {
        const d = R.rain[i];
        const x = (d.x + R.t * (10 + (i % 5) * 3)) % (W + 10) - 5;
        const y = (d.y + R.t * (8 + (i % 3) * 4)) % H;
        px(x + Math.round(Math.sin(R.t * 2 + i) * 2), y, 2, 1, i % 3 ? "#ffc4d6" : "#ffe3ec");
      }
    }
    if (st.weather === "rain" || st.weather === "typhoon") {
      R.b.fillStyle = "rgba(30,40,55,0.22)";
      R.b.fillRect(0, 0, W, H);
      if (Math.random() < dt * (st.weather === "typhoon" ? 18 : 10)) {
        const rx = COAST + Math.random() * (W - COAST);
        ripple(rx, HORIZON + 4 + Math.random() * (H - HORIZON - 8));
      }
      const n = st.weather === "typhoon" ? 140 : 90;
      const slant = st.weather === "typhoon" ? 0.6 : 0.2;
      R.b.fillStyle = "rgba(210,225,240,0.7)";
      for (let i = 0; i < n; i++) {
        const d = R.rain[i];
        d.y += d.v * dt;
        d.x += d.v * slant * dt;
        if (d.y > H) {
          d.y = -4;
          d.x = Math.random() * W;
        }
        if (d.x > W) {
          d.x -= W;
        }
        R.b.fillRect(Math.round(d.x), Math.round(d.y), 1, 3);
      }
    }
    if (st.weather === "typhoon") {
      if (Math.random() < dt * 0.2) {
        R.flash = 0.2;
        R.shake = Math.max(R.shake, 1.5);
        R.bolt = { x: 40 + Math.random() * 400, t: 0.18 };
        cue("thunder");
      }
      if (R.bolt && R.bolt.t > 0) {
        R.bolt.t -= dt;
        let bx = R.bolt.x;
        for (let y = 0; y < HORIZON; y += 4) {
          const nx = bx + (Math.random() < 0.5 ? -3 : 3);
          line(bx, y, nx, y + 4, "#ffffff");
          bx = nx;
        }
      }
      if (R.flash > 0) {
        R.b.fillStyle = "rgba(255,255,255," + Math.min(0.8, R.flash * 4) + ")";
        R.b.fillRect(0, 0, W, H);
        R.flash -= dt;
      }
    }
  }

  /* ---------- 밤 조명 ---------- */
  function drawNight(hr, st) {
    const dk = darkness(hr);
    if (hr >= 17 && hr < 19.5) {
      R.b.fillStyle = "rgba(255,130,60," + (0.12 * Math.sin(((hr - 17) / 2.5) * Math.PI)) + ")";
      R.b.fillRect(0, 0, W, H);
    }
    if (dk <= 0) {
      R.lights = [];
      return;
    }
    R.b.fillStyle = "rgba(10,18,48," + dk + ")";
    R.b.fillRect(0, 0, W, H);
    const storm = st.weather === "rain" || st.weather === "typhoon";
    if (!storm) {
      R.stars.forEach((s) => {
        if (Math.sin(R.t * 1.5 + s.p) > -0.3) {
          px(s.x, s.y, 1, 1, Math.sin(R.t * 1.5 + s.p) > 0.7 ? "#ffffff" : "#b9c6f0");
        }
      });
      const nt = ((hr - 19 + 24) % 24) / 10;
      if (nt >= 0 && nt <= 1) {
        const x = Math.round(30 + nt * 420);
        const y = Math.round(HORIZON - Math.sin(nt * Math.PI) * 48 + 4);
        disc(x, y, 6, "#f2f0dc");
        disc(x + 3, y - 2, 5, lerpHex("#1b2550", "#2d3c70", 0.3));
      }
    }
    const b = R.b;
    b.save();
    b.globalCompositeOperation = "lighter";
    R.lights.forEach((l) => {
      const g = b.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      g.addColorStop(0, l.c + (l.a * dk * 1.6) + ")");
      g.addColorStop(1, l.c + "0)");
      b.fillStyle = g;
      b.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    });
    b.restore();
    R.lights.forEach((l) => {
      if (l.rect) {
        px(l.rect[0], l.rect[1], l.rect[2], l.rect[3], "#ffd86b");
      }
    });
    R.lights = [];
  }

  /* ---------- 별똥별 ---------- */
  function drawStar(st, dt, night) {
    const storm = st.weather === "rain" || st.weather === "typhoon";
    if (!R.star) {
      R.starT -= dt;
      if (night && !storm && R.starT <= 0) {
        R.starT = 35 + Math.random() * 50;
        const dir = Math.random() < 0.5 ? -1 : 1;
        R.star = { x: dir < 0 ? 360 + Math.random() * 90 : 30 + Math.random() * 90, y: 6 + Math.random() * 14, vx: dir * 60, vy: 16, t: 0, life: 2.8, trail: [] };
        cue("starfall");
      }
      return;
    }
    const s = R.star;
    s.t += dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.trail.unshift([s.x, s.y]);
    s.trail.length = Math.min(s.trail.length, 16);
    if (s.t > s.life || s.y > HORIZON - 4) {
      R.star = null;
      return;
    }
    s.trail.forEach(([tx, ty], i) => {
      px(tx, ty, 1, 1, i < 3 ? "#ffffff" : i < 9 ? "#fff2a8" : "#9fb8ff");
    });
    px(s.x - 1, s.y, 3, 1, "#ffffff");
    px(s.x, s.y - 1, 1, 3, "#ffffff");
    light(s.x, s.y, 8, "rgba(255,250,200,", 0.8);
  }
  function starCaught() {
    const s = R.star;
    if (!s) {
      return;
    }
    burst(s.x, s.y, 24, ["#fff2a8", "#ffffff", "#bcd6ff"]);
    R.banner = { s: "소원을 빌었어요!", sub: "30분간 전설·신종 입질 ↑", c: "#bcd6ff", t: 0, life: 2.4 };
    R.star = null;
    cue("wish");
  }

  /* ---------- 튀어오르는 물고기 · 이벤트 ---------- */
  function headPos(st, ev) {
    if (ev.owner) {
      const o = ownerInfo();
      return { x: OWNER.x + 4, y: OWNER.feet - 14, bx: o.bob[0], by: o.bob[1] };
    }
    if (typeof ev.seat !== "number") {
      return null;
    }
    const info = seatInfo(st, ev.seat);
    if (!info) {
      return null;
    }
    return { x: info.x + 4, y: info.feet - 14, bx: info.bob[0], by: info.bob[1] };
  }
  function pushEvent(st, ev) {
    if (ev.kind === "leave") {
      startLeaver(st, ev);
      return;
    }
    if (ev.kind === "money" && ev.src === "passive") {
      if (st.owned.pension > 0) {
        R.texts.push({ x: 460, y: 96, s: "+" + G.fmt(ev.amount), c: "#e7d2ff", life: 1.6, vy: -10 });
      }
      return;
    }
    if (ev.kind === "money" && ev.src === "walkin") {
      R.walkAcc += ev.amount;
      return;
    }
    // 입장료는 손님이 들어오는 곳(매표소·여객선)에서
    if (ev.kind === "money" && ev.src === "guest") {
      const atFerry = ferryState(st).docked;
      R.texts.push({ x: atFerry ? FERRY_DOCKED_X + 20 : 22, y: ROAD_L - 20 - Math.random() * 6, s: "+" + G.fmt(ev.amount), c: "#ffe680", life: 1.1, vy: -14 });
      return;
    }
    if (ev.kind === "money" && ev.src === "exp") {
      R.texts.push({ x: 380, y: HORIZON - 10, s: "+" + G.fmt(ev.amount) + " 원정", c: "#bfe6ff", life: 1.6, vy: -6 });
      return;
    }
    if (ev.kind === "bred") {
      burst(SECRET.x + SECRET.w / 2, SECRET.y + 8, 18, ["#d6b3ff", "#7cf5a0", "#ffffff"]);
      cue("levelup");
      if (!ev.dup) {
        const sub = { upgrade: "등급 상승 교배 성공", family: "계열 대표종 발견!", recipe: "이색 조합 레시피 발견!", hybrid: "돌연변이 잡종" }[ev.route] || "";
        R.banner = { s: "신종 탄생! " + ev.bred.name, sub: sub + " · " + G.fmtSize(ev.bred.size[1]) + "급 · VIP 전용 좌대", c: ev.route === "recipe" ? "#d6b3ff" : "#ffd27a", t: 0, life: 2.8 };
        if (ev.route === "recipe" || ev.bred.giant) {
          R.shake = Math.max(R.shake, 2.5);
        }
      }
      return;
    }
    if (ev.kind === "vipLevel") {
      cue("levelup");
      return;
    }
    if (ev.kind === "money" && ev.src === "tip") {
      const p = headPos(st, ev);
      if (p) {
        R.texts.push({ x: p.x, y: p.y - 10, s: "팁 +" + G.fmt(ev.amount), c: "#7cf5a0", life: 1.4, vy: -10 });
        cue("coin");
      }
      return;
    }
    if (ev.kind !== "money" && ev.kind !== "catch") {
      return;
    }
    if (ev.kind === "money" && (ev.src === "owner" || ev.src === "cook" || ev.amount < 1)) {
      return;
    }
    const p = headPos(st, ev);
    if (!p) {
      return;
    }
    if (ev.kind === "money") {
      R.texts.push({ x: p.x, y: p.y - 4, s: "+" + G.fmt(ev.amount), c: "#ffe680", life: 1.1, vy: -14 });
      return;
    }
    const f = ev.fish;
    const img = S.catchSprite(f, 1, 0, st.bred, G.EXP.byId);
    R.pops.push({ f, img, x0: p.bx - img.width / 2, y0: p.by - 3, x1: p.x - img.width / 2 + 2, y1: p.y - 10 - Math.max(0, img.height - 8), t: 0, dur: 0.6, hold: 0.7, golden: f.golden, rare: !f.junk && (f.rarity === "rare" || f.rarity === "legendary") });
    const big = !f.junk && (f.rarity === "legendary" || f.golden);
    splash(p.bx, p.by, big ? 14 : f.junk ? 3 : 6);
    ripple(p.bx, p.by + 1, big || f.rarity === "rare");
    cue("splash");
    if (!ev.owner) {
      return;
    }
    cue(big ? "fanfare" : f.rarity === "rare" ? "rare" : f.junk ? "junk" : "catch");
    if (!f.junk && f.rarity !== "common") {
      const cols = f.golden ? ["#fff2a8", "#f2c230", "#ffffff"]
        : f.rarity === "legendary" ? ["#ffd27a", "#ff9f43", "#ffffff"]
        : f.rarity === "rare" ? ["#bcd6ff", "#5aa0ff", "#ffffff"] : ["#a8f0c0", "#ffffff"];
      burst(p.x + 2, p.y - 8, f.rarity === "premium" ? 6 : 14, cols);
    }
    if (big) {
      R.shake = Math.max(R.shake, 3);
      R.banner = { s: (f.golden ? "황금 " : "전설 ") + f.name + "!", sub: G.fmtSize(f.size) + " · " + (ev.owner ? "사장님" : ev.who), c: f.golden ? "#f2c230" : "#ff9f43", t: 0, life: 2.6 };
    } else if (!f.junk && f.rarity === "rare") {
      R.shake = Math.max(R.shake, 1);
    }
    if (ev.isNew) {
      R.texts.push({ x: p.x + 4, y: p.y - 30, s: "NEW!", c: "#7cf5a0", life: 1.6, vy: -8, label: true });
    }
    if (ev.owner) {
      R.texts.push({ x: p.x + 4, y: p.y - 22, s: f.junk ? f.name : f.name + " " + G.fmtSize(f.size), c: "#ffffff", life: 1.9, vy: -6, label: true });
      if (ev.amount) {
        R.texts.push({ x: p.x + 4, y: p.y - 14, s: "+" + G.fmt(ev.amount) + "원", c: "#ffe680", life: 1.9, vy: -6 });
      }
    }
  }
  function drawPops(dt) {
    for (let i = R.pops.length - 1; i >= 0; i--) {
      const p = R.pops[i];
      p.t += dt;
      if (p.t > p.dur + p.hold) {
        R.pops.splice(i, 1);
        continue;
      }
      const k = Math.min(1, p.t / p.dur);
      const x = p.x0 + (p.x1 - p.x0) * k;
      const y = p.y0 + (p.y1 - p.y0) * k - Math.sin(k * Math.PI) * 10;
      if (p.t > p.dur + p.hold - 0.2 && Math.floor(p.t * 20) % 2) {
        continue;
      }
      const img = p.f && !p.f.junk ? S.catchSprite(p.f, 1, Math.floor(p.t * 14) % 4, R.st && R.st.bred, G.EXP.byId) : p.img;
      spr(img, x, y, false);
      if (k < 1) {
        px(p.x0 + 2, p.y0 + 3, 1, 1, "#d8f1ff");
        px(p.x0 + img.width - 2, p.y0 + 2, 1, 1, "#d8f1ff");
      }
      if (p.golden || p.rare) {
        const c = p.golden ? "#fff2a8" : "#bcd6ff";
        const a = R.t * 8;
        for (let j = 0; j < 4; j++) {
          const ang = a + (j * Math.PI) / 2;
          px(x + img.width / 2 + Math.cos(ang) * 10, y + 3 + Math.sin(ang) * 6, 1, 1, c);
        }
      }
    }
    if (R.pops.length > 40) {
      R.pops.splice(0, R.pops.length - 40);
    }
  }

  /* ---------- 고해상도 글자 ---------- */
  function fontFor(K) {
    const fs = Math.max(10, Math.round(11 * K / (R.cssScale || 1)));
    return [fs, (R.fontReady ? '"Galmuri11", ' : "") + '"Apple SD Gothic Neo", "Malgun Gothic", sans-serif'];
  }
  function hiText() {
    const c = R.ctx;
    const [fs, font] = fontFor(R.K);
    c.textAlign = "center";
    c.textBaseline = "alphabetic";
    c.lineJoin = "round";
    for (let i = R.texts.length - 1; i >= 0; i--) {
      const t = R.texts[i];
      t.life -= R.dt;
      t.y += t.vy * R.dt;
      if (t.life <= 0) {
        R.texts.splice(i, 1);
        continue;
      }
      c.globalAlpha = Math.min(1, t.life * 2);
      c.font = (t.label ? "bold " : "") + fs + "px " + font;
      const [X, Y] = toScreen(t.x, t.y);
      c.lineWidth = Math.max(3, Math.round(fs / 3.5));
      c.strokeStyle = "rgba(10,20,35,0.85)";
      c.strokeText(t.s, X, Y);
      c.fillStyle = t.c;
      c.fillText(t.s, X, Y);
    }
    c.globalAlpha = 1;
    if (R.texts.length > 70) {
      R.texts.splice(0, R.texts.length - 70);
    }
  }
  function signs(st) {
    const c = R.ctx;
    const [fs, font] = fontFor(R.K);
    c.font = fs + "px " + font;
    c.textAlign = "center";
    const tag = (s, x, y, bg) => {
      const w = c.measureText(s).width + fs * 0.8;
      const [cx, Y] = toScreen(x, y);
      const X = Math.round(cx - w / 2);
      c.fillStyle = bg;
      c.fillRect(X, Y - fs, w, fs * 1.35);
      c.fillStyle = "rgba(0,0,0,0.35)";
      c.fillRect(X, Y + fs * 0.35, w, Math.max(1, R.K / 2));
      c.fillStyle = "#ffffff";
      c.fillText(s, cx, Y);
    };
    const o = st.owned;
    tag(o.shop ? "매점" : "매점 자리", 24, 124, o.shop ? "rgba(29,79,154,0.92)" : "rgba(90,58,30,0.85)");
    tag(o.rental ? "대여점" : "대여점 자리", 66, 128, o.rental ? "rgba(31,106,66,0.92)" : "rgba(90,58,30,0.85)");
    tag(o.restaurant ? "횟집" : "횟집 자리", 105, 116, o.restaurant ? "rgba(138,35,24,0.92)" : "rgba(90,58,30,0.85)");
    tag("매표소 · 입구", 22, 206, "rgba(176,58,46,0.92)");
    tag("수족관", 67, 180, "rgba(30,80,120,0.92)");
    if (o.shuttle > 0) {
      tag("손님 선착장", DOCK_X + 18, ROAD_L + 18, "rgba(29,53,87,0.92)");
    }
    if (o.crew > 0) {
      tag("원정 선착장", EXP_DOCK.x + 5, EXP_DOCK.y0 - 4, "rgba(122,74,34,0.92)");
    }
    if (o.pension > 0) {
      tag("펜션" + (o.pension > 4 ? " " + o.pension + "실" : ""), 461, 94, "rgba(88,53,144,0.92)");
    }
    if (st.upgrades.secret) {
      tag("VIP 비밀 양식장", SECRET.x + SECRET.w / 2, SECRET.y - 6, "rgba(88,40,140,0.92)");
    }
    tag("사장님", OWNER.x + 4, OWNER.feet + 9, "rgba(29,53,87,0.92)");
    if (G.seats(st) > MAX_SEATS_DRAWN) {
      tag("+ 좌석 " + (G.seats(st) - MAX_SEATS_DRAWN) + "석", 300, 262, "rgba(8,20,32,0.75)");
    }
  }
  function drawBanner(dt) {
    const bn = R.banner;
    if (!bn) {
      return;
    }
    bn.t += dt;
    if (bn.t >= bn.life) {
      R.banner = null;
      return;
    }
    const c = R.ctx;
    const K = R.K;
    const base = Math.max(14, Math.round(20 * K / (R.cssScale || 1)));
    const pop = bn.t < 0.25 ? 0.6 + 0.4 * (bn.t / 0.25) + Math.sin((bn.t / 0.25) * Math.PI) * 0.25 : 1;
    const fs = Math.round(base * pop);
    const font = fontFor(K)[1];
    const fade = Math.min(1, (bn.life - bn.t) * 2.5);
    const cy = Math.round(H * K * 0.3);
    c.globalAlpha = fade;
    c.fillStyle = "rgba(10,20,35,0.72)";
    c.fillRect(0, cy - fs * 1.25, W * K, fs * 2.3);
    c.fillStyle = bn.c;
    c.fillRect(0, cy - fs * 1.25, W * K, Math.max(2, K));
    c.fillRect(0, cy + fs * 1.05 - Math.max(2, K), W * K, Math.max(2, K));
    c.textAlign = "center";
    c.lineJoin = "round";
    c.font = "bold " + fs + "px " + font;
    c.lineWidth = Math.max(3, Math.round(fs / 4));
    c.strokeStyle = "rgba(10,20,35,0.95)";
    c.strokeText(bn.s, Math.round(W * K / 2), cy);
    c.fillStyle = bn.c;
    c.fillText(bn.s, Math.round(W * K / 2), cy);
    c.font = Math.round(fs * 0.55) + "px " + font;
    c.fillStyle = "#ffffff";
    c.fillText(bn.sub, Math.round(W * K / 2), cy + Math.round(fs * 0.75));
    c.globalAlpha = 1;
  }

  /* ---------- 구매 연출 ---------- */
  function facilitySpot(st, id) {
    if (id === "seat") {
      const info = seatInfo(st, Math.min(G.seats(st), MAX_SEATS_DRAWN) - 1);
      return info ? [info.x + 4, info.feet - 6] : [290, 166];
    }
    const fixed = {
      shop: [24, 140], rental: [66, 144], restaurant: [105, 136], shuttle: [DOCK_X + 18, ROAD_L],
      pension: [461, 110], farm: [240, 78], boat: [190, 78], rock: [40, 56], night: [290, 86],
      shade: [190, 100], crew: [EXP_MOOR.x + 20, EXP_MOOR.y], secret: [SECRET.x + SECRET.w / 2, SECRET.y + 6],
    };
    if (/^z_/.test(id)) {
      return [380, HORIZON - 4];
    }
    return fixed[id] || null;
  }
  function watchPurchases(st) {
    const o = st.owned;
    const u = st.upgrades;
    if (!R.prevOwned) {
      R.prevOwned = Object.assign({}, o);
      R.prevUpg = Object.assign({}, u);
      return;
    }
    const fire = (id, first) => {
      const pos = facilitySpot(st, id);
      if (!pos) {
        return;
      }
      burst(pos[0], pos[1], first ? 22 : 8, first ? ["#ffe680", "#ffffff", "#7cf5a0"] : ["#ffe680", "#ffffff"]);
      if (first) {
        R.shake = Math.max(R.shake, 1.5);
        R.texts.push({ x: pos[0], y: pos[1] - 8, s: "개업!", c: "#ffe680", life: 1.6, vy: -8, label: true });
      }
    };
    Object.keys(o).forEach((id) => {
      if (o[id] > (R.prevOwned[id] || 0)) {
        fire(id, (R.prevOwned[id] || 0) === (G.FAC[id].free || 0));
      }
    });
    Object.keys(u).forEach((id) => {
      if (u[id] && !R.prevUpg[id]) {
        fire(id, true);
      }
    });
    R.prevOwned = Object.assign({}, o);
    R.prevUpg = Object.assign({}, u);
  }

  /* ---------- 렌더 레이어 ----------
   *  1 sky       하늘·해·구름·갈매기·별똥별·먼 섬
   *  2 far       원정선 (수평선)
   *  3 water     바다 띠 + 물결 4프레임·림라이트·달빛/광원 반사·튀는 물고기
   *  4 land      잔디·모래 해안선·파도 거품·돌길
   *  5 stage     갯바위·투어선·양식장·비밀 양식장·다리·좌대(+손님)·펜션·건물·수족관·선착장·여객선
   *  6 actors    걷는 손님(입장·퇴장)·사장님·고양이
   *  7 fx        파문·낚인 물고기·파티클
   *  8 weather   비·눈·꽃잎·번개
   *  9 lighting  노을 틴트·밤 어둠 + 광원 가산 합성
   */
  const LAYERS = [
    ["sky", (st, world, ctx) => { drawSky(st, ctx.hr); drawGulls(st, ctx.hr); drawStar(st, ctx.dt, ctx.night); }],
    ["far", (st) => { drawExpBoats(st); }],
    ["water", (st, world, ctx) => { drawSea(st, ctx.hr); drawJumpers(st, ctx.dt); }],
    ["land", (st, world, ctx) => { drawLand(st, ctx.dt); }],
    ["stage", (st, world, ctx) => {
      drawRocks(st);
      drawExpDock(st);
      drawExpBoat(st);
      drawTourShip(st);
      drawFarm(st);
      drawSecretFarm(st, world, ctx.night);
      drawBoardwalk(st);
      drawCages(st, world, ctx.night);
      drawPension(st);
      drawShop(st, 4, 158);
      drawRental(st, 48, 158);
      drawRestaurant(st, 86, 158);
      drawOwnerJetty();
      drawGate(st, 234);
      drawAquariumBuilding(st, ctx.dt);
      drawDock(st);
      drawFerry(st);
    }],
    ["actors", (st, world, ctx) => { drawArrivals(st, world); drawLeavers(ctx.dt); drawOwner(world); drawCat(st, ctx.dt); }],
    ["fx", (st, world, ctx) => { drawRipples(ctx.dt); drawPops(ctx.dt); drawParticles(ctx.dt); }],
    ["weather", (st, world, ctx) => { drawWeather(st, ctx.dt, ctx.ck.season); }],
    ["lighting", (st, world, ctx) => { R.prevLights = R.lights.slice(); drawNight(ctx.hr, st); }],
  ];

  function draw(st, world, dt) {
    R.t += dt;
    R.dt = dt;
    R.st = st;
    const ck = G.clockInfo(st);
    const hr = ck.hour + ck.minute / 60;
    const ctx = { ck, hr, night: ck.night, dt };
    R.lights = [];
    watchPurchases(st);
    LAYERS.forEach((l) => l[1](st, world, ctx));

    R.walkT += dt;
    if (R.walkT >= 2.5) {
      R.walkT = 0;
      if (R.walkAcc >= 1) {
        R.texts.push({ x: 40, y: ROAD_L - 14, s: "+" + G.fmt(R.walkAcc) + " 구경손님", c: "#bfe6ff", life: 1.4, vy: -8 });
      }
      R.walkAcc = 0;
    }
    let sx = 0;
    let sy = 0;
    if (R.shake > 0) {
      sx = Math.round((Math.random() * 2 - 1) * R.shake);
      sy = Math.round((Math.random() * 2 - 1) * R.shake);
      R.shake = Math.max(0, R.shake - dt * 6);
    }
    const c = R.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = false;
    if (sx || sy) {
      c.fillStyle = "#0a1423";
      c.fillRect(0, 0, W * R.K, H * R.K);
    }
    // 카메라 영역만 잘라서 확대 (그리기 직전에 한 번 더 경계 고정)
    clampCam();
    const cam = R.cam;
    c.drawImage(R.buf, cam.x, cam.y, W / cam.z, H / cam.z, sx * R.K, sy * R.K, W * R.K, H * R.K);
    signs(st);
    hiText();
    drawBanner(dt);
  }

  /* ---------- 수족관 서브 화면 (수족관 탭 캔버스) ---------- */
  const AQ = { buf: null, b: null, w: 192, h: 96 };
  function drawAquariumView(canvas, st, dt) {
    if (!AQ.buf) {
      AQ.buf = document.createElement("canvas");
      AQ.buf.width = AQ.w;
      AQ.buf.height = AQ.h;
      AQ.b = AQ.buf.getContext("2d");
    }
    const old = R.b;
    R.b = AQ.b;
    px(0, 0, AQ.w, AQ.h, "#33404d");
    drawTank(2, 2, AQ.w - 4, AQ.h - 4, st, dt, "view");
    R.b = old;
    const cssW = canvas.clientWidth || AQ.w * 2;
    const k = Math.max(1, Math.ceil((cssW * Math.min(3, root.devicePixelRatio || 1)) / AQ.w));
    if (canvas.width !== AQ.w * k) {
      canvas.width = AQ.w * k;
      canvas.height = AQ.h * k;
    }
    const c = canvas.getContext("2d");
    c.imageSmoothingEnabled = false;
    c.drawImage(AQ.buf, 0, 0, AQ.w * k, AQ.h * k);
  }

  function resync() {
    R.prevOwned = null;
    R.prevUpg = null;
    R.banner = null;
    R.leavers = [];
  }

  root.Renderer = {
    init, resize, draw, pushEvent, resync, drawAquariumView,
    panBy, panWorld, zoomAt, resetCam, screenToWorld, hitTest, catFed, starCaught,
    get cam() { return R.cam; },
    set onCue(fn) { R.onCue = fn; },
    W, H,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
