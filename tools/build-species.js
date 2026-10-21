/* 어종 JSON → js/species-data.js 변환 (index.html 더블클릭 실행은 fetch로 JSON을 못 읽어서)
 * node tools/build-species.js [json 경로]   기본: data/korean_fishing_350_species.json */
const fs = require("fs");
const path = require("path");
const M = require("../js/species-manager.js");

const src = process.argv[2] || path.join(__dirname, "../data/korean_fishing_350_species.json");
const out = path.join(__dirname, "../js/species-data.js");

const raw = JSON.parse(fs.readFileSync(src, "utf8"));
const { list, warnings } = M.validate(raw);
const body = "/* 자동 생성 파일 — 고치지 말고 data/*.json을 고친 뒤 node tools/build-species.js */\n" +
  "(function (root) {\n  \"use strict\";\n  root.SpeciesData = " + JSON.stringify(list) + ";\n" +
  "  if (typeof module !== \"undefined\" && module.exports) {\n    module.exports = root.SpeciesData;\n  }\n" +
  "})(typeof globalThis !== \"undefined\" ? globalThis : this);\n";
fs.writeFileSync(out, body);

console.log("어종 " + list.length + "/" + raw.length + "종 → " + path.relative(process.cwd(), out));
if (warnings.length) {
  console.log("경고 " + warnings.length + "건:");
  warnings.forEach((w) => console.log("  " + w));
}
