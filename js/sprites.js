/* ============================================================
 * SPRITES — 도트 스프라이트 (문자열 그림 → 캔버스, 캐시)
 * '.' = 투명, 나머지 글자는 팔레트 색
 * ============================================================ */
(function (root) {
  "use strict";
  const cache = new Map();

  function build(rows, pal, scale) {
    scale = scale || 1;
    const h = rows.length;
    const w = Math.max(...rows.map((r) => r.length));
    const c = document.createElement("canvas");
    c.width = w * scale;
    c.height = h * scale;
    const x = c.getContext("2d");
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < rows[j].length; i++) {
        const ch = rows[j][i];
        if (ch === "." || ch === " ") {
          continue;
        }
        const col = pal[ch];
        if (!col) {
          continue;
        }
        x.fillStyle = col;
        x.fillRect(i * scale, j * scale, scale, scale);
      }
    }
    return c;
  }
  function get(key, rows, pal, scale) {
    const k = key + "@" + (scale || 1);
    if (!cache.has(k)) {
      cache.set(k, build(rows, pal, scale));
    }
    return cache.get(k);
  }
  function flipH(rows) {
    return rows.map((r) => r.split("").reverse().join(""));
  }

  /* ---------------- 사람 ---------------- */
  // 8×13. 앞모습(카메라를 봄) / 뒷모습
  const BODY_FRONT = [
    ".ASSSSA.",
    ".SESSES.",
    "..SmmS..",
    ".TTTTTT.",
    "STTttTTS",
    "S.TTTT.S",
    "..PPPP..",
    "..P..P..",
    "..P..P..",
    ".BB..BB.",
  ];
  const BODY_BACK = [
    ".AAAAAA.",
    ".AAAAAA.",
    "..ASSA..",
    ".TTTTTT.",
    "STTttTTS",
    "S.TTTT.S",
    "..PPPP..",
    "..P..P..",
    "..P..P..",
    ".BB..BB.",
  ];
  const HATS = {
    straw: ["..HHHH..", ".HHhhHH.", "HHHHHHHH"],
    cap: ["........", "..HHHH..", ".HHHHHHh"],
    bucket: ["..HHHH..", ".HHHHHH.", "hhhhhhhh"],
    captain: ["..HHHH..", ".hhhhhh.", "HHHHHHHH"],
    none: ["........", "..AAAA..", ".AAAAAA."],
  };
  const SKINS = ["#f6cfa3", "#e7b382", "#c98d5c"];
  const HAIRS = ["#2b1d14", "#141414", "#6b4423", "#a8a8a8"];

  const LOOKS = {
    tourist: { hat: "straw", H: "#f2cf6b", h: "#c99a35", T: "#f08a4b", t: "#c96a33", P: "#3e5c8a", B: "#5a3b22" },
    family: { hat: "cap", H: "#e5484d", h: "#a8272c", T: "#ff8fb1", t: "#d96489", P: "#6d7a86", B: "#f2f2f2" },
    angler: { hat: "bucket", H: "#9aa35f", h: "#6c7440", T: "#5c6b34", t: "#e0c07a", P: "#334028", B: "#1f2a1a" },
    pro: { hat: "cap", H: "#1c1c22", h: "#000000", T: "#7b3fd0", t: "#f2f2f2", P: "#1c1c22", B: "#f2f2f2" },
    owner: { hat: "captain", H: "#f5f7fa", h: "#1d3557", T: "#1d3557", t: "#f2c14e", P: "#14213d", B: "#3a2414" },
    vip: { hat: "captain", H: "#1c1c22", h: "#f2c230", T: "#2a2a33", t: "#f2c230", P: "#1c1c22", B: "#111111", shades: true },
  };

  // 손님 동작 포즈: 몸통 4~5번째 줄(팔)과 얼굴 줄만 바꿔 끼움
  //  idle 찌 관찰 / reel 끌어올리기(양팔 위) / drink 캔음료(한 손 입가 + 캔) / surprise 깜짝(팔 벌림)
  const POSE_ROWS = {
    reel: { 3: "STTTTTTS", 4: ".TTttTT.", 5: "..TTTT.." },
    drink: { 2: "..SmmSC.", 3: ".TTTTTSC", 4: "STTttTT.", 5: "S.TTTT.." },
    surprise: { 3: "S.TTTT.S", 4: ".TTttTT.", 5: "S.TTTT.S" },
    // 걷기 2프레임: 다리 벌림 ↔ 모음, 팔 반대로 흔들기
    walkA: { 4: "STTttTT.", 5: "..TTTT.S", 7: "..P..P..", 8: ".P....P.", 9: "BB....BB" },
    walkB: { 4: ".TTttTTS", 5: "S.TTTT..", 7: "...PP...", 8: "...PP...", 9: "...BB..." },
  };

  // 손님 외형 → 스프라이트
  function person(view, lookId, skinI, hairI, pose) {
    const L = LOOKS[lookId];
    const hat = HATS[L.hat];
    let body = view === "front" ? BODY_FRONT : BODY_BACK;
    const pr = pose && POSE_ROWS[pose];
    if (pr) {
      body = body.map((r, i) => {
        if (!pr[i]) {
          return r;
        }
        // 뒷모습은 얼굴 줄(2번) 대신 머리카락이 보이니 몸통만 교체
        return view === "back" && i === 2 ? r : pr[i];
      });
    }
    if (L.shades && view === "front") {
      body = body.map((r, i) => (i === 1 ? ".SEEEES." : r));
    }
    const rows = hat.concat(body);
    const pal = {
      H: L.H, h: L.h, T: L.T, t: L.t, P: L.P, B: L.B,
      S: SKINS[skinI % SKINS.length], A: HAIRS[hairI % HAIRS.length],
      E: "#1a1a1a", m: lookId === "owner" ? "#3b2a1a" : SKINS[skinI % SKINS.length],
      C: "#e5484d",
    };
    return get("p:" + view + lookId + skinI + hairI + (pose || ""), rows, pal);
  }

  /* ---------------- 물고기 ---------------- */
  // B 몸, b 배, F 지느러미, E 눈, S 줄무늬
  const FISH_SHAPES = {
    fish: [
      ".....FF.......",
      "...BBBBBB...F.",
      "..BBSBBSBBBFF.",
      ".EBBSBBSBBBBF.",
      "BBBBSBBSBBBFF.",
      ".bbbbbbbbbb.F.",
      "...bbbbbb.....",
      ".....F........",
    ],
    flat: [
      "....BBBBBB....",
      "..BBSBBBBSBB..",
      ".EBBBBBSBBBBBF",
      "BBBBSBBBBBSBFF",
      ".BBBBBBSBBBBBF",
      "..BBBSBBBBBB..",
      "....BBBBBB....",
    ],
    long: [
      "..............",
      "FFFFFFFFFFFF..",
      "EBBBBBBBBBBBBB",
      "bbbbbbbbbbbbbF",
      "..............",
    ],
    big: [
      "......FFF.......",
      "...BBBBBBBBB..FF",
      ".BBBBBBBBBBBBFF.",
      "EBBBSSSSSSBBBF..",
      "BbbbbbbbbbbbBFF.",
      ".bbbbbbbbbbb..FF",
      "....FF..........",
    ],
    squid: [
      "......BBBBB...",
      ".F..BBBSBBBBB.",
      "FFbbBBBBBSBBBB",
      ".F..bBBBBBBBB.",
      "......bbbbb...",
    ],
    octo: [
      "....BBBBB.....",
      "...BBSBBBB....",
      "..BBEBBEBBB...",
      "..BBBBBBBBB...",
      ".BbBbBbBbBbB..",
      "B.b.B.b.B.b.B.",
    ],
    slim: [
      "......FF......",
      "..BBBBBBBBBB.F",
      "EBBSBBBSBBBBFF",
      ".bbbbbbbbbbb.F",
    ],
    eel: [
      "...FFFFFFFFFFF..",
      ".BBBBBBBBBBBBBBF",
      "EBBBBBBBBBBBBBFF",
      ".bbbbbbbbbbbbbbF",
    ],
    crab: [
      "F..........F",
      "FF........FF",
      ".F.BBBBBB.F.",
      "..BBEBBEBB..",
      ".BBBSBBSBBB.",
      "B.bBBBBBBb.B",
      "..b.b..b.b..",
    ],
    ray: [
      "......BB......",
      "....BBBBBB....",
      "..BBBSBBSBBB..",
      "BBBBBEBBEBBBBB",
      "..BBBBBBBBBB..",
      "....bbbbbb....",
      "......FF......",
      ".......F......",
    ],
    marlin: [
      "........FFFF........",
      ".......FFFFFF.......",
      "....BBBBBBBBBBBB..FF",
      "FFFEBBSBBSBBSBBBBFF.",
      "....bbbbbbbbbbbb..FF",
      ".......FF...........",
    ],
  };
  const FISH_LOOK = {
    goby: ["fish", "#8a7a5a", "#c9b98f", "#6b5c40", "#5c4e35"],
    halfbeak: ["long", "#5d8fb3", "#dfe9ef", "#3a6380", "#3a6380"],
    mackerel: ["fish", "#2f7f8f", "#e8f0f2", "#235c69", "#1a3e4a"],
    jack: ["fish", "#7fa3b8", "#f0f4f6", "#e0c45a", "#5a7f94"],
    rockfish: ["fish", "#5b5348", "#8c8172", "#3e382f", "#2b2620"],
    greenling: ["fish", "#8a6a3a", "#c9a46a", "#6b4f26", "#5a3e1c"],
    rockcod: ["fish", "#a35a3a", "#d9946a", "#7a3e22", "#6b301a"],
    filefish: ["fish", "#9a8f6a", "#d4cba6", "#6b6142", "#4a3f22"],
    mullet: ["fish", "#7a8a96", "#e6ecef", "#55626b", "#55626b"],
    flounder: ["flat", "#9a7f5a", "#c7a97a", "#6b5538", "#5a4428"],
    olive: ["flat", "#6f6a4a", "#9a9470", "#4a462f", "#3a3622"],
    seabass: ["fish", "#9aa8b0", "#f2f5f7", "#5f6d75", "#3a4850"],
    scorpion: ["fish", "#c0502e", "#e88a5a", "#8a3418", "#6b2410"],
    redrock: ["fish", "#e0503a", "#f59a7a", "#a8301e", "#a8301e"],
    webfoot: ["octo", "#b88a7a", "#e3c2b5", "#8a5f50", "#7a4f40"],
    cuttle: ["squid", "#a8876a", "#e2cdb8", "#7a5f45", "#7a5f45"],
    squid: ["squid", "#e3a39a", "#f7ddd8", "#c27a70", "#c27a70"],
    hairtail: ["long", "#d6dde3", "#ffffff", "#a8b4be", "#a8b4be"],
    spanish: ["fish", "#4f7fa8", "#eef3f7", "#2f5a80", "#253f5a"],
    octopus: ["octo", "#b5523e", "#e08a72", "#82331f", "#6b2614"],
    redsnapper: ["fish", "#ec6b78", "#fbc3c8", "#c24a57", "#4fb0d6"],
    blackporgy: ["fish", "#4a5560", "#8c99a3", "#2e363e", "#2e363e"],
    opaleye: ["fish", "#3e4c4a", "#6c7d7a", "#253230", "#1a2422"],
    bigfin: ["squid", "#d7c6b0", "#f4ece0", "#b39c7f", "#9a7f5f"],
    yellowtail: ["big", "#4a6f9a", "#eef2f6", "#e8c547", "#e8c547"],
    amberjack: ["big", "#5f88a8", "#f1f5f8", "#d9b23a", "#d9b23a"],
    croaker: ["fish", "#8a8f8a", "#d9ddd9", "#5f655f", "#6b706b"],
    cod: ["fish", "#9a8a6a", "#e6dcc6", "#6b5f45", "#6b5f45"],
    knifejaw: ["fish", "#d8d8d0", "#f5f5ef", "#2a2a2a", "#2a2a2a"],
    redgrouper: ["fish", "#d0562e", "#f0a37a", "#9a3818", "#f6d36b"],
    longtooth: ["big", "#6a5a4a", "#a8977f", "#4a3c2e", "#3a2e22"],
    tuna: ["big", "#22385a", "#c9d3dc", "#f2c94c", "#3e5f8a"],
    shad: ["fish", "#5a7f9a", "#eef3f6", "#3f5f78", "#2a4256"],
    sillago: ["slim", "#d8c9a0", "#f5efdc", "#b3a272", "#c2b082"],
    wrasse: ["fish", "#5aa86a", "#f0c48a", "#e0663a", "#3a7f9a"],
    conger: ["eel", "#6a6050", "#d8d0bc", "#4a4234", "#4a4234"],
    herring: ["slim", "#4a6f9a", "#e8eef4", "#2f4f72", "#2f4f72"],
    rabbitfish: ["fish", "#7a7a4a", "#c9c79a", "#4f4f2a", "#d9d27a"],
    nakji: ["octo", "#c9906a", "#ecc9ae", "#9a6644", "#8a5a3a"],
    jsquid: ["squid", "#e8b0a0", "#fae6de", "#c48070", "#a8604f"],
    crab: ["crab", "#4f6f8f", "#e0c9a0", "#3a5470", "#f2f2f2"],
    gurnard: ["fish", "#d66a4a", "#f2c3a8", "#4fa0c8", "#a8442a"],
    grouper: ["big", "#8a5a3a", "#c99a72", "#5a3a22", "#e0b070"],
    humphead: ["big", "#c86a5a", "#f0b8a8", "#9a3f30", "#f2f2f2"],
    skate: ["ray", "#8a7a60", "#e8dfcc", "#5f523c", "#6b5d45"],
    bonito: ["big", "#2f4f78", "#e6ecf2", "#1f3a5a", "#5a6f8a"],
    marlin: ["marlin", "#1f4f8a", "#e6eef6", "#123862", "#5aa0d8"],
    jewfish: ["big", "#3a3a40", "#7a7a82", "#22222a", "#55555e"],
  };
  // 헤엄 4프레임: 꼬리(오른쪽 3칸)를 위아래로 흔들고 등지느러미를 깜빡임.
  // 문어·게·가오리처럼 꼬리가 없는 체형은 마지막 줄(다리·날개 끝)을 좌우로 흔듦
  const TAIL_WAVE = [0, 1, 0, -1];
  function frameRows(shape, frame) {
    const rows = FISH_SHAPES[shape];
    const f = ((frame || 0) % 4 + 4) % 4;
    if (f === 0) {
      return rows;
    }
    if (shape === "octo" || shape === "crab" || shape === "ray") {
      const last = rows.length - 1;
      return rows.map((r, i) => (i === last && f % 2 ? "." + r.slice(0, -1) : r));
    }
    const w = Math.max(...rows.map((r) => r.length));
    const off = TAIL_WAVE[f];
    const pad = rows.map((r) => r.padEnd(w, "."));
    return pad.map((r, j) => {
      const src = pad[j - off];
      let out = r.slice(0, w - 3) + (src ? src.slice(w - 3) : "...");
      if (f % 2 && j < 2) {
        out = out.replace(/F/g, ".");   // 등지느러미 접힘
      }
      return out;
    });
  }
  function fishSprite(id, scale, golden, frame) {
    const L = FISH_LOOK[id] || ["fish", "#7a8a99", "#dfe6ea", "#55626b", "#55626b"];
    const pal = golden
      ? { B: "#f2c230", b: "#fff1a8", F: "#c9921a", S: "#e0a81e", E: "#3a2a00" }
      : { B: L[1], b: L[2], F: L[3], S: L[4], E: "#111111" };
    const fr = (frame || 0) % 4;
    return get("f:" + id + (golden ? "g" : "") + "#" + fr, frameRows(L[0], fr), pal, scale);
  }

  /* ---------------- 원정 350종 (이름으로 체형, id로 색) ---------------- */
  const SHAPE_KEYS = [
    [/고래/, "big"], [/새치|청새치|황새치/, "marlin"], [/오징어|한치|꼴뚜기/, "squid"],
    [/문어|낙지|주꾸미/, "octo"], [/게$|게\(|대게|킹크랩|가재/, "crab"], [/새우/, "slim"],
    [/가오리|홍어|상어/, "ray"], [/장어|곰치|먹장어/, "eel"], [/갈치|꽁치|학꽁치|동갈치/, "long"],
    [/가자미|광어|넙치|도다리|서대|박대/, "flat"], [/다랑어|참치|방어|부시리|삼치|대구|돗돔|능성어|다금바리|민어/, "big"],
    [/보리멸|청어|멸치|전어|정어리|양미리|빙어/, "slim"],
  ];
  const RARITY_ACCENT = { Common: null, Rare: "#5aa0ff", Epic: "#b36bff", Legendary: "#f2c230" };
  function hsl(h, s, l) {
    return "hsl(" + Math.round(h) + "," + Math.round(s) + "%," + Math.round(l) + "%)";
  }
  function speciesLook(s) {
    let shape = "fish";
    for (const [re, sh] of SHAPE_KEYS) {
      if (re.test(s.name)) {
        shape = sh;
        break;
      }
    }
    const h = (s.id * 137.5) % 360;
    const deep = /심해|미지/.test(s.name);
    const acc = RARITY_ACCENT[s.rarity];
    return {
      shape,
      pal: {
        B: deep ? hsl(h, 35, 22) : hsl(h, 38, 48), b: deep ? hsl(h, 30, 55) : hsl(h, 30, 86),
        F: acc || hsl(h, 40, 34), S: acc || hsl((h + 40) % 360, 45, 38), E: deep ? "#9fffe0" : "#111111",
      },
    };
  }
  function speciesSprite(s, scale, frame) {
    const L = speciesLook(s);
    const fr = (frame || 0) % 4;
    return get("s:" + s.id + "#" + fr, frameRows(L.shape, fr), L.pal, scale);
  }

  /* ---------------- 비밀 양식장 신종 (부모 색을 섞고 접두어 색으로 물들임) ---------------- */
  const PREFIX_TINT = {
    달빛: "#cfd8ff", 무지개: "#ff7ad9", 황금비늘: "#f2c230", 번개: "#ffe14d", 별무늬: "#ffffff", 심연: "#2a2a6a",
    용왕: "#d03030", 벚꽃: "#ffb3c8", 에메랄드: "#2fbf7f", 흑진주: "#2a2a33", 은하: "#7a5cff", 불꽃: "#ff6a2a",
  };
  function mixHex(a, b, t) {
    const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const x = p(a);
    const y = p(b);
    return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
  }
  // 결과 종류별 물들임: 등급 상승은 금빛 줄무늬, 계열 대표종·이색 신종은 고유색
  const KIND_TINT = { upgrade: "#f2c230", family: "#ffd27a", recipe: "#b36bff" };
  const DEFAULT_LOOK = ["fish", "#7a8a99", "#dfe6ea", "#55626b", "#55626b"];
  function hslToHex(str) {
    const m = /hsl\((\d+),(\d+)%,(\d+)%\)/.exec(str);
    if (!m) {
      return str;
    }
    const h = m[1] / 360;
    const s = m[2] / 100;
    const l = m[3] / 100;
    const f = (n) => {
      const k = (n + h * 12) % 12;
      const a = s * Math.min(l, 1 - l);
      const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(c * 255).toString(16).padStart(2, "0");
    };
    return "#" + f(0) + f(8) + f(4);
  }
  // 부모 키("f:"·"s:"·"b:" 또는 예전 키)에서 [체형, 몸, 배, 지느러미, 무늬] 색을 구함. 신종은 재귀
  function lookOf(key, bredList, depth) {
    const raw = /^[fsb]:/.test(key) ? key.slice(2) : key;
    const kind = /^[fsb]:/.test(key) ? key[0] : null;
    if ((kind === "f" || !kind) && FISH_LOOK[raw]) {
      return FISH_LOOK[raw];
    }
    if (kind === "s") {
      const sp = root.Game && root.Game.EXP.byId.get(Number(raw));
      if (!sp) {
        return DEFAULT_LOOK;
      }
      const L = speciesLook(sp);
      return [L.shape, hslToHex(L.pal.B), hslToHex(L.pal.b), hslToHex(L.pal.F), hslToHex(L.pal.S)];
    }
    const b = (bredList || []).find((x) => x.id === raw);
    if (!b || depth > 6) {
      return DEFAULT_LOOK;
    }
    const A = lookOf(b.parents[0], bredList, depth + 1);
    const B = lookOf(b.parents[1], bredList, depth + 1);
    const tint = PREFIX_TINT[b.prefix] || KIND_TINT[b.kind] || "#ffffff";
    const shape = b.shape || A[0];
    return [shape,mixHex(mixHex(A[1], B[1], 0.5), tint, b.kind === "upgrade" ? 0.2 : 0.45), mixHex(A[2], B[2], 0.5), mixHex(B[3], tint, 0.3), tint];
  }
  // 거대 신종(giant)은 2배로 그림
  function bredSprite(b, bredList, scale, frame) {
    const L = lookOf("b:" + b.id, bredList, 0);
    const fr = (frame || 0) % 4;
    const sc = (scale || 1) * (b.giant ? 2 : 1);
    return get("b:" + b.id + "#" + fr, frameRows(L[0], fr), { B: L[1], b: L[2], F: L[3], S: L[4], E: "#111111" }, sc);
  }
  // 도감 미발견 칸용 검은 실루엣
  function silhouetteURL(shape, giant) {
    const k = "sil:" + shape + (giant ? "G" : "");
    if (!iconUrlCache[k]) {
      const pal = { B: "#0b0f14", b: "#0b0f14", F: "#0b0f14", S: "#0b0f14", E: "#0b0f14" };
      iconUrlCache[k] = get(k, FISH_SHAPES[shape] || FISH_SHAPES.fish, pal, giant ? 8 : 4).toDataURL();
    }
    return iconUrlCache[k];
  }
  // 어떤 어획이든 맞는 스프라이트로 (bredList = state.bred, speciesById = 원정 어종 조회)
  function catchSprite(f, scale, frame, bredList, speciesById) {
    if (f.junk) {
      return junkSprite(f.id, scale);
    }
    if (f.bred) {
      const b = (bredList || []).find((x) => x.id === f.id);
      return b ? bredSprite(b, bredList, scale, frame) : fishSprite("redsnapper", scale, false, frame);
    }
    if (typeof f.id === "number" && speciesById) {
      const s = speciesById.get(f.id);
      return s ? speciesSprite(s, scale, frame) : fishSprite("goby", scale, false, frame);
    }
    return fishSprite(f.id, scale, f.golden, frame);
  }

  /* ---------------- 고양이 '나비' (10×7) ---------------- */
  const CAT_FRAMES = {
    walk0: ["O.......O.", "OO.....OO.", ".OOOOOOOO.", "OEOOOOOOOw", ".OOOOOOOO.", ".O.O..O.O.", ".........."],
    walk1: ["O.......O.", "OO.....OO.", ".OOOOOOOO.", "OEOOOOOOOw", ".OOOOOOOO.", "..O.OO.O..", ".........."],
    loaf: ["..........", "O.....O...", "OO...OO...", "OOOOOOOOO.", "OEOOOOOOOw", "OOOOOOOOOO", ".........."],
    sit: ["O...O.....", "OO.OO.....", "OEOEO.....", ".OOO...w..", ".OOOO..w..", ".OOOOOOO..", ".O..O....."],
    eat: ["..........", "O.....O...", "OO...OO...", "OOOOOOOOOw", "EOOOOOOOO.", "fOOOOOOO..", "ff.O..O..."],
  };
  const CAT_PAL = { O: "#f2a541", E: "#2a1a0a", w: "#f2a541", f: "#9ab8d0" };
  function catSprite(frame) {
    return get("cat:" + frame, CAT_FRAMES[frame] || CAT_FRAMES.walk0, CAT_PAL);
  }
  // 그물 안을 헤엄치는 그림자 물고기
  function shadowFish(dir) {
    const r = ["..XX.", "XXXXX", "..XX."];
    return get("sf" + dir, dir > 0 ? flipH(r) : r, { X: "rgba(8,28,48,0.55)" });
  }

  /* ---------------- 잡동사니 ---------------- */
  const JUNK_SPR = {
    boot: [["..BBB.", "..BBB.", "..BBB.", "..BBBB", "BBBBBB", "bbbbbb"], { B: "#3a5f3a", b: "#1f331f" }],
    star: [["..O..", ".OOO.", "OOOOO", ".O.O.", "O...O"], { O: "#f08a4b" }],
    puffer: [[".S.S.S.", "SBBBBBS", "BEBBBBF", "BBBBBBF", "SbbbbbS", ".S.S.S."], { B: "#d9c27a", b: "#f2ead0", S: "#8a7a3a", E: "#111", F: "#b39a4a" }],
    weed: [[".G...", ".G.G.", "GG.G.", ".GGG.", "..G..", "..G.."], { G: "#4f9a4a" }],
    can: [[".ss.", "RRRR", "RWWR", "RRRR", "RRRR", ".ss."], { s: "#b8c0c8", R: "#d0403a", W: "#f5f5f5" }],
    shell: [["...SS.", "..SsSS", ".SsSsS", "SsSsSS", ".SSSS.", "..SS.."], { S: "#e8c9a0", s: "#b8906a" }],
  };
  function junkSprite(id, scale) {
    const j = JUNK_SPR[id] || JUNK_SPR.weed;
    return get("j:" + id, j[0], j[1], scale);
  }

  /* ---------------- 아이콘 (12×12) ---------------- */
  const ICONS = {
    seat: [[
      "............",
      "...bbbbbb...",
      "...bwwwwb...",
      "...bwwwwb...",
      "...bwwwwb...",
      "..bbbbbbbb..",
      "..bwwwwwwb..",
      "..bbbbbbbb..",
      "..b......b..",
      "~~b~~~~~~b~~",
      "OOOOOOOOOOOO",
      ".OOOOOOOOOO.",
    ], { b: "#6b4423", w: "#c98f55", O: "#e8662b", "~": "#3b8fd0" }],
    shop: [[
      "............",
      ".RRRRRRRRRR.",
      "RRWWRRWWRRWW",
      "RRWWRRWWRRWW",
      ".dddddddddd.",
      ".dyyyyyyyyd.",
      ".dyccyyccyd.",
      ".dyccyyccyd.",
      ".dyyyyyyyyd.",
      ".dddddddddd.",
      ".bbbbbbbbbb.",
      "............",
    ], { R: "#2e6fd0", W: "#f5f5f5", d: "#8a5a32", y: "#f4e3b5", c: "#e85d5d", b: "#5a3a1e" }],
    rental: [[
      ".r..r..r..r.",
      ".r..r..r..r.",
      ".r..r..r..r.",
      ".r..r..r..r.",
      ".r..r..r..r.",
      "bbbbbbbbbbbb",
      "b.r..r..r..b",
      "b.Y..R..G..b",
      "b..........b",
      "bbbbbbbbbbbb",
      "b..........b",
      "b..........b",
    ], { r: "#7a4a22", b: "#3f6b3a", Y: "#f2c94c", R: "#e5484d", G: "#4fa36b" }],
    restaurant: [[
      "............",
      "..LLLLLLLL..",
      "..L.LL.L.L..",
      "............",
      "..BBBBBBB.F.",
      ".EBBSSBBBFF.",
      ".BBBSSBBBBF.",
      "..bbbbbbb.F.",
      "WWWWWWWWWWWW",
      ".WwwwwwwwwW.",
      "..WWWWWWWW..",
      "............",
    ], { L: "#c0392b", B: "#ec6b78", b: "#fbc3c8", S: "#ffffff", E: "#111111", F: "#c24a57", W: "#f5f5f5", w: "#c9d3dc" }],
    shuttle: [[
      "............",
      ".....WW.....",
      ".....WWWW...",
      ".....W......",
      "...wwwww....",
      "...wBwBw....",
      "OOOOOOOOOOOO",
      "WWWWWWWWWWW.",
      ".WWWWWWWWW..",
      "..WWWWWWW...",
      "~~~~~~~~~~~~",
      "............",
    ], { W: "#f5f5f5", w: "#d8dde2", B: "#5aa0d8", O: "#f39c12", "~": "#3b8fd0" }],
    pension: [[
      ".....PP.....",
      "....PPPP....",
      "...PPPPPP...",
      "..PPPPPPPP..",
      ".PPPPPPPPPP.",
      "..yyyyyyyy..",
      "..yLLyyLLy..",
      "..yLLyyLLy..",
      "..yyyddyyy..",
      "..yyyddyyy..",
      "bbbbbbbbbbbb",
      ".b..b..b..b.",
    ], { P: "#7b4fb3", y: "#f6ecd8", L: "#ffd86b", d: "#8a5a32", b: "#6b4423" }],
    farm: [[
      "............",
      "...oooooo...",
      ".oo~~~~~~oo.",
      "o~~n~~n~~n~o",
      "o~n~~n~~n~~o",
      "o~~n~~n~~n~o",
      ".oo~~~~~~oo.",
      "...oooooo...",
      "............",
      ".s..s..s..s.",
      "ss.ss.ss.ss.",
      "............",
    ], { o: "#d6b66e", "~": "#2f7fbf", n: "#a7d3f0", s: "#7a8a99" }],
    shade: [[
      "....RRRR....",
      "..RRWWRRWW..",
      ".RRRWWRRWWR.",
      "RRRRWWRRWWRR",
      "......g.....",
      "......g.....",
      "......g.....",
      "......g.....",
      "......g.....",
      "......g.....",
      "....bbbbb...",
      "............",
    ], { R: "#e5484d", W: "#f5f5f5", g: "#6b6b6b", b: "#6b4423" }],
    bait: [[
      "............",
      "..pp........",
      ".pPPp.......",
      ".pP.Pp......",
      "..p..Pp.....",
      ".....pPp....",
      "......pPp...",
      ".......pPp..",
      "........pP..",
      "........pP..",
      ".......pp...",
      "............",
    ], { p: "#c9605a", P: "#ef8a80" }],
    sns: [[
      "...kkkkkk...",
      "...kwwwwk...",
      "...kbbbbk...",
      "...kbHHbk...",
      "...kbHHbk...",
      "...kbbbbk...",
      "...kbbbbk...",
      "...kbbbbk...",
      "...kwwwwk...",
      "...kkggkk...",
      "...kkkkkk...",
      "............",
    ], { k: "#22262b", w: "#3a4048", b: "#5aa0d8", H: "#ff5c7a", g: "#8a929a" }],
    boat: [[
      ".....F......",
      ".....FF.....",
      ".....F......",
      "...wwwww....",
      "...wBwBw....",
      "...wwwww....",
      "WWWWWWWWWWWW",
      "RRRRRRRRRRR.",
      ".WWWWWWWWW..",
      "..WWWWWWW...",
      "~~~~~~~~~~~~",
      "............",
    ], { F: "#e5484d", w: "#d8dde2", B: "#5aa0d8", W: "#f5f5f5", R: "#b03a2e", "~": "#3b8fd0" }],
    fridge: [[
      "............",
      ".bbbbbbbbbb.",
      ".bWWWWWWWWb.",
      ".bWccWWccWb.",
      ".bbbbbbbbbb.",
      ".bIIIIIIIIb.",
      ".bIiIIiIIIb.",
      ".bIIIIIiIIb.",
      ".bIIiIIIIIb.",
      ".bIIIIIIIIb.",
      ".bbbbbbbbbb.",
      "............",
    ], { b: "#2e6fd0", W: "#f5f5f5", c: "#9cc8ef", I: "#bfe3ff", i: "#ffffff" }],
    typhoon: [[
      ".....gg.....",
      "....g..g....",
      ".....gg.....",
      ".....gg.....",
      "...gggggg...",
      ".....gg.....",
      ".....gg.....",
      "g....gg....g",
      "gg...gg...gg",
      ".gg..gg..gg.",
      "..gggggggg..",
      "....gggg....",
    ], { g: "#5f6b78" }],
    night: [[
      ".....kk.....",
      ".....kk.....",
      "....kkkk....",
      "...YYYYYY...",
      "..YYwwwwYY..",
      "..YwwwwwwY..",
      "..YwwwwwwY..",
      "..YYwwwwYY..",
      "...YYYYYY...",
      "....kkkk....",
      "..y......y..",
      "y..........y",
    ], { k: "#333a42", Y: "#c8f5a0", w: "#f4ffe8", y: "#c8f5a0" }],
    golden: [[
      "....GGG.....",
      "....G.G.....",
      "....GGG.....",
      ".....G......",
      ".....G......",
      ".....G......",
      ".....G......",
      ".G...G......",
      ".GG..G......",
      "..GG.G......",
      "...GGG......",
      "............",
    ], { G: "#f2c230" }],
    rock: [[
      "............",
      "....gg......",
      "...gGGg.....",
      "..gGGGGg..g.",
      "..gGGGGGggGg",
      ".gGGGgGGGGGg",
      "gGGGGGGGgGGg",
      "gGGgGGGGGGGg",
      "~~~~~~~~~~~~",
      "~..~~..~~..~",
      "............",
      "............",
    ], { g: "#3e4249", G: "#6f757e", "~": "#3b8fd0" }],
    tv: [[
      "............",
      "..kkk.......",
      ".kkkkkkkk.r.",
      ".kgggggkkkk.",
      ".kgLLLgkkkk.",
      ".kgLwLgkkkk.",
      ".kgLLLgkkkk.",
      ".kgggggkkkk.",
      ".kkkkkkkk.r.",
      "....kk......",
      "...kkkk.....",
      "............",
    ], { k: "#22262b", g: "#4a525c", L: "#5aa0d8", w: "#ffffff", r: "#e5484d" }],
  };
  Object.assign(ICONS, {
    w_sunny: [[
      ".....y......",
      ".y...y...y..",
      "..y.....y...",
      "....YYYY....",
      "...YYWWYY...",
      "yy.YWWWWY.yy",
      "...YWWWWY...",
      "...YYWWYY...",
      "....YYYY....",
      "..y.....y...",
      ".y...y...y..",
      ".....y......",
    ], { Y: "#f6b93b", W: "#fff2a8", y: "#f6b93b" }],
    w_cloudy: [[
      "............",
      "............",
      "....WWWW....",
      "...WWWWWW...",
      ".WWWWWWWWW..",
      "WWWWWWWWWWW.",
      "WWWWWWWWWWWW",
      "ssssssssssss",
      ".ssssssssss.",
      "............",
      "............",
      "............",
    ], { W: "#e6ecf1", s: "#a9b7c4" }],
    w_rain: [[
      "....WWWW....",
      "...WWWWWW...",
      ".WWWWWWWWW..",
      "WWWWWWWWWWW.",
      "ssssssssssss",
      ".ssssssssss.",
      "............",
      "..b...b...b.",
      ".b...b...b..",
      "............",
      "...b...b....",
      "..b...b.....",
    ], { W: "#b8c4cf", s: "#7c8a97", b: "#4aa3df" }],
    w_typhoon: [[
      "....gggg....",
      "..gg....g...",
      ".g...gg..g..",
      ".g..g..g.g..",
      "g..g.gg.g.g.",
      "g.g.g..g.g.g",
      "g.g.g..g.g.g",
      ".g.g.gg.g..g",
      "..g.g..g..g.",
      "..g..gg...g.",
      "...g....gg..",
      "....gggg....",
    ], { g: "#5f6b78" }],
    moon: [[
      "....YYY.....",
      "..YYY.......",
      ".YYY........",
      ".YY.........",
      "YYY.........",
      "YYY.........",
      "YYY.........",
      "YYYY........",
      ".YYYY....Y..",
      ".YYYYYYYYY..",
      "..YYYYYYY...",
      "....YYY.....",
    ], { Y: "#f2e6a0" }],
  });
  Object.assign(ICONS, {
    crew: [[
      ".....F......",
      ".....F..r...",
      ".....F.r....",
      "...wwwwr....",
      "...wBwr.....",
      "...wwww.....",
      "NNNNNNNNNNNN",
      "WWWWWWWWWWW.",
      ".WWWWWWWWW..",
      "..WWWWWWW...",
      "~~~~~~~~~~~~",
      "............",
    ], { F: "#e5484d", r: "#7a4a22", w: "#d8dde2", B: "#5aa0d8", N: "#1d3557", W: "#f5f5f5", "~": "#3b8fd0" }],
    zone: [[
      "....kkkk....",
      "..kkwwwwkk..",
      ".kwwwwRwwwk.",
      ".kwwwRRwwwk.",
      "kwwwwRRwwwwk",
      "kwwwRRwwwwwk",
      "kwwwwbbwwwwk",
      "kwwwwbbwwwwk",
      ".kwwwbwwwwk.",
      ".kwwwwwwwwk.",
      "..kkwwwwkk..",
      "....kkkk....",
    ], { k: "#6b4423", w: "#f4e3b5", R: "#e5484d", b: "#2e6fd0" }],
    secret: [[
      "..p......g..",
      "...p....g...",
      "....p..g....",
      ".....pg.....",
      ".....gp.....",
      "....g..p....",
      "...g....p...",
      "...g....p...",
      "....g..p....",
      ".....gp.....",
      ".....pg.....",
      "....p..g....",
    ], { p: "#b36bff", g: "#2fbf7f" }],
    aqua: [[
      "kkkkkkkkkkkk",
      "kwwwwwwwwwwk",
      "kbbbbbbbbbbk",
      "kbbo.bbbbbbk",
      "kbbbbbBBBbbk",
      "kbbbbBBBBBbk",
      "kbo.bbBBBbbk",
      "kbbbbbbbbbbk",
      "kgbbgbbbgbbk",
      "kgggggssgggk",
      "kkkkkkkkkkkk",
      "............",
    ], { k: "#33404d", w: "#cfeaff", b: "#4aa3df", o: "#e6f6ff", B: "#f2a541", g: "#2f8a55", s: "#e0c48a" }],
    cat: [[
      "............",
      ".O.......O..",
      ".OO.....OO..",
      ".OOOOOOOOO..",
      "OOEOOOOEOOO.",
      "OOOOOpOOOOO.",
      ".OOOOOOOOO..",
      "..OOOOOOO...",
      "............",
      "............",
      "............",
      "............",
    ], { O: "#f2a541", E: "#2a1a0a", p: "#e86a92" }],
    home: [[
      ".....rr.....",
      "....rrrr....",
      "...rrrrrr...",
      "..rrrrrrrr..",
      ".rrrrrrrrrr.",
      "rrrrrrrrrrrr",
      ".wwwwwwwwww.",
      ".wbbwwwddww.",
      ".wbbwwwddww.",
      ".wwwwwwddww.",
      ".wwwwwwddww.",
      ".kkkkkkkkkk.",
    ], { r: "#e5484d", w: "#f6ecd8", b: "#5aa0d8", d: "#7a4a22", k: "#5a3a1e" }],
    book: [[
      "............",
      ".bbbbb.bbbbb",
      ".bwwwb.bwwwb",
      ".bwkwb.bwkwb",
      ".bwwwb.bwwwb",
      ".bwkwb.bwkwb",
      ".bwwwb.bwwwb",
      ".bwkwbbbwkwb",
      ".bwwwwbwwwwb",
      ".bbbbbbbbbbb",
      "......b.....",
      "............",
    ], { b: "#7b4fb3", w: "#f6ecd8", k: "#9a8a6a" }],
    vip: [[
      "............",
      "............",
      ".G...G...G..",
      ".GG.GGG.GG..",
      ".GGGGGGGGG..",
      ".GGRGGGBGG..",
      ".GGGGGGGGG..",
      ".ggggggggg..",
      "............",
      "............",
      "............",
      "............",
    ], { G: "#f2c230", g: "#c9921a", R: "#e5484d", B: "#5aa0ff" }],
    wish: [[
      "..........Y.",
      ".........YY.",
      "........YWY.",
      ".......YWY..",
      "......y.Y...",
      ".....y......",
      "....y.......",
      "...y........",
      "..y.........",
      ".y..........",
      "............",
      "............",
    ], { Y: "#fff2a8", W: "#ffffff", y: "#bcd6ff" }],
  });
  const iconUrlCache = {};
  function iconURL(id) {
    if (!ICONS[id] && /^z_/.test(id)) {
      id = "zone";
    }
    if (!iconUrlCache[id]) {
      const ic = ICONS[id];
      if (!ic) {
        return "";
      }
      iconUrlCache[id] = build(ic[0], ic[1], 4).toDataURL();
    }
    return iconUrlCache[id];
  }
  function fishURL(id, golden) {
    const k = id + (golden ? "g" : "");
    if (!iconUrlCache["f" + k]) {
      iconUrlCache["f" + k] = fishSprite(id, 4, golden).toDataURL();
    }
    return iconUrlCache["f" + k];
  }

  // 어획물 이미지 URL (뉴스·토스트·도감용, 프레임 0)
  function catchURL(f, bredList, speciesById) {
    const k = "c:" + (f.bred ? "b" : typeof f.id === "number" ? "s" : "f") + f.id + (f.golden ? "g" : "");
    if (!iconUrlCache[k]) {
      iconUrlCache[k] = catchSprite(f, 4, 0, bredList, speciesById).toDataURL();
    }
    return iconUrlCache[k];
  }

  root.Sprites = {
    person, fishSprite, shadowFish, junkSprite, iconURL, fishURL, get, flipH,
    speciesSprite, bredSprite, catchSprite, catchURL, catSprite, frameRows, silhouetteURL,
    SKINS, HAIRS, ICONS, FISH_SHAPES, FISH_LOOK,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
