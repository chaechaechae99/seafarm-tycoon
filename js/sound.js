/* ============================================================
 * SOUND — 사운드 매니저 (Web Audio로 직접 합성, 음원 파일 없음)
 *  bgm  로파이 픽셀 BGM (72bpm, Fmaj7–Em7–Dm7–Cmaj7, 밤엔 더 어둡게)
 *  amb  바닷소리 ASMR(파도), 비, 폭풍 바람, 밤 귀뚜라미 — 시간·날씨에 따라 섞임
 *  sfx  찌 물보라, 어획, 희귀·전설 팡파르, 동전, 고양이 울음, 천둥, 소원 등
 * 브라우저 자동재생 제한 때문에 첫 클릭·키 입력 때 시작함
 * ============================================================ */
(function (root) {
  "use strict";
  const KEY = "seafarm_sound_v1";
  const S = {
    ctx: null, master: null, bus: {}, amb: {}, on: { bgm: true, amb: true, sfx: true }, vol: 0.6,
    step: 0, nextT: 0, timer: null, mood: { night: false, weather: "sunny" }, last: {}, cricketT: 0,
  };

  function loadPrefs() {
    try {
      const p = JSON.parse(root.localStorage.getItem(KEY) || "null");
      if (p) {
        Object.assign(S.on, p.on || {});
        S.vol = typeof p.vol === "number" ? p.vol : S.vol;
      }
    } catch (e) {
      /* 저장소 없음 */
    }
  }
  function savePrefs() {
    try {
      root.localStorage.setItem(KEY, JSON.stringify({ on: S.on, vol: S.vol }));
    } catch (e) {
      /* 저장소 없음 */
    }
  }

  /* ---------------- 그래프 ---------------- */
  function noiseBuffer(kind) {
    const ctx = S.ctx;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === "brown") {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else {
        d[i] = w;
      }
    }
    return buf;
  }
  function loopNoise(kind) {
    const src = S.ctx.createBufferSource();
    src.buffer = kind === "brown" ? S.brown : S.white;
    src.loop = true;
    src.start();
    return src;
  }
  function gainNode(v, dest) {
    const g = S.ctx.createGain();
    g.gain.value = v;
    g.connect(dest);
    return g;
  }
  function filter(type, freq, q, dest) {
    const f = S.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q || 0.7;
    f.connect(dest);
    return f;
  }

  function ensure() {
    if (S.ctx) {
      return true;
    }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) {
      return false;
    }
    S.ctx = new AC();
    S.master = gainNode(S.vol, S.ctx.destination);
    S.bus.bgm = gainNode(S.on.bgm ? 0.5 : 0, S.master);
    S.bus.amb = gainNode(S.on.amb ? 0.8 : 0, S.master);
    S.bus.sfx = gainNode(S.on.sfx ? 0.7 : 0, S.master);
    S.brown = noiseBuffer("brown");
    S.white = noiseBuffer("white");
    S.bgmLP = filter("lowpass", 1400, 0.5, S.bus.bgm);

    // 파도: 갈색 소음 → 저역통과, 아주 느린 LFO로 밀려왔다 빠지는 느낌
    const waveG = gainNode(0.0, S.bus.amb);
    loopNoise("brown").connect(filter("lowpass", 520, 0.6, waveG));
    const lfo = S.ctx.createOscillator();
    const lfoAmt = S.ctx.createGain();
    lfo.frequency.value = 0.09;
    lfoAmt.gain.value = 0.18;
    lfo.connect(lfoAmt);
    lfoAmt.connect(waveG.gain);
    lfo.start();
    S.amb.wave = waveG;
    // 비: 흰 소음 → 고역통과
    const rainG = gainNode(0, S.bus.amb);
    loopNoise("white").connect(filter("highpass", 1400, 0.5, rainG));
    S.amb.rain = rainG;
    // 폭풍 바람: 갈색 소음 → 대역통과(주파수가 천천히 흔들림)
    const windG = gainNode(0, S.bus.amb);
    const windF = filter("bandpass", 450, 1.2, windG);
    loopNoise("brown").connect(windF);
    const wl = S.ctx.createOscillator();
    const wa = S.ctx.createGain();
    wl.frequency.value = 0.15;
    wa.gain.value = 220;
    wl.connect(wa);
    wa.connect(windF.frequency);
    wl.start();
    S.amb.wind = windG;

    S.nextT = S.ctx.currentTime + 0.1;
    S.timer = setInterval(schedule, 100);
    return true;
  }
  /* ---------------- 로파이 BGM ---------------- */
  const BPM = 72;
  const EIGHTH = 60 / BPM / 2;
  // 화음 (MIDI): Fmaj7, Em7, Dm7, Cmaj7
  const CHORDS = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]];
  const SCALE = [72, 74, 76, 79, 81, 84];
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function tone(freq, t, dur, type, vol, dest, attack) {
    const ctx = S.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + (attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }
  function noiseHit(t, dur, vol, type, freq, dest) {
    const src = S.ctx.createBufferSource();
    src.buffer = S.white;
    const g = S.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f = S.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }
  function schedule() {
    const ctx = S.ctx;
    if (!ctx || ctx.state !== "running") {
      return;
    }
    while (S.nextT < ctx.currentTime + 0.35) {
      playStep(S.step, S.nextT);
      S.step = (S.step + 1) % 64;
      // 스윙: 뒷박 8분음표를 살짝 늦게
      S.nextT += EIGHTH * (S.step % 2 ? 1.12 : 0.88);
    }
    ambienceTick();
  }
  function playStep(step, t) {
    const bar = Math.floor(step / 8) % 4;
    const beat = step % 8;
    const chord = CHORDS[bar];
    const dark = S.mood.night;
    const out = S.bgmLP;
    if (beat === 0) {
      // 밤엔 근음만 한 옥타브 내려 더 어둡게
      chord.forEach((m, i) => tone(mtof(dark && i === 0 ? m - 12 : m), t + i * 0.02, EIGHTH * 8, "triangle", 0.045, out, 0.4));
      tone(mtof(chord[0] - 12), t, EIGHTH * 3, "sine", 0.12, out, 0.02);
    }
    // 킥(1·3박), 하이햇(뒷박)
    if (beat === 0 || beat === 4) {
      const o = S.ctx.createOscillator();
      const g = S.ctx.createGain();
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + 0.3);
    }
    if (beat % 2 === 1) {
      noiseHit(t, 0.05, 0.03, "highpass", 7000, out);
    }
    // 멜로디 플럭: 펜타토닉에서 가끔
    if (beat % 2 === 0 && Math.random() < (dark ? 0.3 : 0.45)) {
      const m = SCALE[Math.floor(Math.random() * SCALE.length)] - (dark ? 12 : 0);
      tone(mtof(m), t, 0.5, "sine", 0.05, out, 0.005);
    }
  }
  /* ---------------- 환경음 ---------------- */
  function ambienceTick() {
    const c = S.ctx;
    const m = S.mood;
    const now = c.currentTime;
    const w = m.weather;
    S.amb.wave.gain.setTargetAtTime(w === "typhoon" ? 0.55 : w === "rain" ? 0.4 : 0.3, now, 1.5);
    S.amb.rain.gain.setTargetAtTime(w === "rain" ? (m.winter ? 0.02 : 0.09) : w === "typhoon" ? 0.14 : 0, now, 1.5);
    S.amb.wind.gain.setTargetAtTime(w === "typhoon" ? 0.25 : w === "cloudy" ? 0.04 : 0, now, 1.5);
    S.bgmLP.frequency.setTargetAtTime(m.night ? 800 : 1500, now, 2);
    // 밤 귀뚜라미: 4.3kHz 짧은 펄스 3번
    if (m.night && w !== "typhoon" && now > S.cricketT) {
      S.cricketT = now + 0.4 + Math.random() * 1.2;
      for (let k = 0; k < 3; k++) {
        tone(4300 + Math.random() * 200, now + 0.05 + k * 0.045, 0.03, "triangle", 0.012, S.bus.amb, 0.003);
      }
    }
  }

  /* ---------------- 효과음 ---------------- */
  const GAP = { splash: 0.12, catch: 0.08, coin: 0.06, meow: 0.8 };
  const SFX = {
    splash(t, out) {
      noiseHit(t, 0.28, 0.25, "bandpass", 1300, out);
      tone(240, t, 0.12, "sine", 0.06, out);
    },
    catch(t, out) {
      tone(660, t, 0.12, "square", 0.04, out);
      tone(880, t + 0.08, 0.16, "square", 0.04, out);
    },
    junk(t, out) {
      tone(330, t, 0.12, "square", 0.04, out);
      tone(220, t + 0.1, 0.2, "square", 0.04, out);
    },
    rare(t, out) {
      [72, 76, 79, 84].forEach((m, i) => tone(mtof(m), t + i * 0.07, 0.25, "square", 0.04, out));
    },
    fanfare(t, out) {
      [67, 72, 76, 79, 84, 88].forEach((m, i) => tone(mtof(m), t + i * 0.08, 0.5, "square", 0.045, out));
      [72, 76, 79].forEach((m) => tone(mtof(m), t + 0.55, 0.9, "triangle", 0.05, out, 0.02));
    },
    coin(t, out) {
      tone(988, t, 0.06, "square", 0.035, out);
      tone(1319, t + 0.05, 0.14, "square", 0.035, out);
    },
    buy(t, out) {
      tone(523, t, 0.08, "square", 0.04, out);
      tone(784, t + 0.06, 0.12, "square", 0.04, out);
    },
    levelup(t, out) {
      [60, 64, 67, 72].forEach((m, i) => tone(mtof(m), t + i * 0.09, 0.3, "triangle", 0.06, out));
    },
    // 고양이: 톱니파를 포먼트 필터에 통과시키며 음높이를 미아~오 하고 굽힘
    meow(t, out, opt) {
      const c = S.ctx;
      const o = c.createOscillator();
      const g = c.createGain();
      const f = c.createBiquadFilter();
      const base = opt && opt.happy ? 820 : 650;
      o.type = "sawtooth";
      o.frequency.setValueAtTime(base, t);
      o.frequency.linearRampToValueAtTime(base * 1.45, t + 0.18);
      o.frequency.linearRampToValueAtTime(base * 0.85, t + 0.5);
      f.type = "bandpass";
      f.frequency.setValueAtTime(900, t);
      f.frequency.linearRampToValueAtTime(1600, t + 0.2);
      f.frequency.linearRampToValueAtTime(800, t + 0.5);
      f.Q.value = 3;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.07, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.connect(f);
      f.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + 0.6);
    },
    thunder(t, out) {
      noiseHit(t, 0.15, 0.3, "highpass", 2000, out);
      const src = S.ctx.createBufferSource();
      src.buffer = S.brown;
      const g = S.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.9, t + 0.12);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
      const f = S.ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 180;
      src.connect(f);
      f.connect(g);
      g.connect(out);
      src.start(t + 0.05);
      src.stop(t + 3);
    },
    wish(t, out) {
      [84, 88, 91, 96, 100].forEach((m, i) => tone(mtof(m), t + i * 0.06, 1.2, "sine", 0.05, out));
    },
    starfall(t, out) {
      const o = S.ctx.createOscillator();
      const g = S.ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(2600, t);
      o.frequency.exponentialRampToValueAtTime(900, t + 1.2);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.025, t + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      o.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + 1.4);
    },
    click(t, out) {
      tone(1200, t, 0.03, "square", 0.02, out);
    },
  };
  function cue(name, opt) {
    if (!S.ctx || S.ctx.state !== "running" || !S.on.sfx || !SFX[name]) {
      return;
    }
    const now = S.ctx.currentTime;
    if (now - (S.last[name] || 0) < (GAP[name] || 0.05)) {
      return;
    }
    S.last[name] = now;
    SFX[name](now + 0.01, S.bus.sfx, opt);
  }

  /* ---------------- 공개 API ---------------- */
  // 첫 사용자 입력 때 호출 (자동재생 정책)
  function unlock() {
    if (!ensure()) {
      return;
    }
    if (S.ctx.state === "suspended") {
      S.ctx.resume();
    }
  }
  function update(mood) {
    Object.assign(S.mood, mood);
  }
  function setOn(kind, on) {
    S.on[kind] = on;
    savePrefs();
    if (S.ctx) {
      const v = { bgm: 0.5, amb: 0.8, sfx: 0.7 }[kind];
      S.bus[kind].gain.setTargetAtTime(on ? v : 0, S.ctx.currentTime, 0.1);
    }
  }
  function setVolume(v) {
    S.vol = Math.max(0, Math.min(1, v));
    savePrefs();
    if (S.master) {
      S.master.gain.setTargetAtTime(S.vol, S.ctx.currentTime, 0.05);
    }
  }
  function prefs() {
    return { on: Object.assign({}, S.on), vol: S.vol, started: !!(S.ctx && S.ctx.state === "running") };
  }

  loadPrefs();
  root.Sound = { unlock, update, cue, setOn, setVolume, prefs };
})(typeof globalThis !== "undefined" ? globalThis : this);
