/* data/size-overrides.json의 크기를 350종 JSON에 반영 (여러 번 실행해도 결과 같음)
 * node tools/patch-sizes.js  →  이어서 node tools/build-species.js */
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "../data/korean_fishing_350_species.json");
const ov = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/size-overrides.json"), "utf8"));
const list = JSON.parse(fs.readFileSync(src, "utf8"));

let n = 0;
list.forEach((s) => {
  let r = ov.byName[s.name];
  if (!r && /미지/.test(s.name)) {
    r = ov.deepUnknownByRarity[s.rarity];
  }
  if (r && (s.minSize !== r[0] || s.maxSize !== r[1])) {
    console.log(("  " + s.name).padEnd(22) + s.minSize + "~" + s.maxSize + "cm → " + r[0] + "~" + r[1] + "cm");
    s.minSize = r[0];
    s.maxSize = r[1];
    n++;
  }
});
fs.writeFileSync(src, JSON.stringify(list, null, 2) + "\n");
console.log("크기 수정 " + n + "종");
