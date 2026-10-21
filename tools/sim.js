/* 밸런스 시뮬레이션: 탐욕 봇이 0~2시간 플레이 (node tools/sim.js) */
const G = require("../js/logic.js");
const D = require("../js/data.js");

const clone = (s) => JSON.parse(JSON.stringify(s));
const st = G.newState();
const HORIZON = Number(process.argv[2] || 7200);
const TAP_UNTIL = 300;      // 처음 5분은 사장님 낚시를 0.4회/초 한다고 가정
const log = [];
const firsts = {};
let lastBuy = 0;
const waits = [];

function candidates(s) {
  const c = [];
  D.FACILITIES.forEach((f) => {
    if (G.facilityVisible(s, f.id)) {
      c.push({ kind: "f", id: f.id, cost: G.costOf(f.id, s.owned[f.id]) });
    }
  });
  D.UPGRADES.forEach((u) => {
    if (!s.upgrades[u.id] && G.upgradeVisible(s, u.id) && !G.upgradeBlock(s, u.id)) {
      c.push({ kind: "u", id: u.id, cost: u.cost });
    }
  });
  return c;
}
function gain(s, cand) {
  const t = clone(s);
  t.money = 1e300;
  if (cand.kind === "f") {
    G.buyFacility(t, cand.id, 1);
  } else {
    G.buyUpgrade(t, cand.id);
  }
  return G.expectedRate(t) - G.expectedRate(s);
}

for (let t = 0; t < HORIZON; t++) {
  let rate = G.expectedRate(st);
  if (t < TAP_UNTIL) {
    rate += 0.4 * (30 * 1.0 + rate * 3);
  }
  st.money += rate;
  st.totalEarned += rate;
  st.gameMin += G.GAME_MIN_PER_SEC;

  // 가장 회수가 빠른 것 구매 (기다리는 시간 포함)
  let guard = 0;
  while (guard++ < 20) {
    const cs = candidates(st);
    let best = null;
    let bestScore = Infinity;
    const near = cs.filter((c) => c.cost <= st.money + rate * 60);
    (near.length ? near : cs).forEach((c) => {
      const g = gain(st, c);
      const wait = Math.max(0, (c.cost - st.money) / Math.max(rate, 1e-9));
      let score = g > 0 ? wait + c.cost / g : Infinity;
      if (g <= 0 && c.kind === "u" && c.cost < rate * 60) {
        score = wait; // 초당 수익에 안 잡히는 편의 업그레이드(냉장 창고)는 1분 수익보다 싸지면 산다
      }
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    });
    if (!best || st.money < best.cost) {
      break;
    }
    if (best.kind === "f") {
      G.buyFacility(st, best.id, 1);
    } else {
      G.buyUpgrade(st, best.id);
    }
    const key = best.kind + ":" + best.id;
    if (!firsts[key]) {
      firsts[key] = t;
    }
    waits.push({ t, w: t - lastBuy });
    lastBuy = t;
  }
  if (t % 600 === 0 || t === HORIZON - 1) {
    log.push({ min: Math.round(t / 60), rate: Math.round(G.expectedRate(st)), money: Math.round(st.totalEarned), owned: JSON.stringify(st.owned) });
  }
}

console.log("== 처음 구매 시각 ==");
Object.entries(firsts).sort((a, b) => a[1] - b[1]).forEach(([k, t]) => {
  console.log(k.padEnd(14), (t / 60).toFixed(1) + "분");
});
console.log("\n== 10분 단위 ==");
log.forEach((l) => console.log(String(l.min).padStart(4) + "분  초당 " + G.fmt(l.rate).padEnd(8) + " 누적 " + G.fmt(l.money).padEnd(8) + " " + l.owned));
const buckets = [[0, 300], [300, 1800], [1800, 3600], [3600, 7200]];
console.log("\n== 구매 간 대기(초) 중앙값 ==");
buckets.forEach(([a, b]) => {
  const w = waits.filter((x) => x.t >= a && x.t < b).map((x) => x.w).sort((p, q) => p - q);
  console.log(`${a / 60}~${b / 60}분: ${w.length ? w[Math.floor(w.length / 2)] : "-"}초 (구매 ${w.length}회)`);
});
