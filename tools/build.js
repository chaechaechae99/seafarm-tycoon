/* Cloudflare Pages 배포용 빌드: 게임 실행에 필요한 파일만 dist/로 복사
 *  - 정적 파일만 사용 (서버 코드 없음) → Pages가 그대로 서빙
 *  - css/js 주소에 내용 해시(?v=)를 붙여 캐시 무효화 → 긴 캐시 가능
 *  - _headers: 캐시 정책 + 보안 헤더(CSP 등)
 * node tools/build.js */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "dist");
const ASSETS = [
  "css/font.css", "css/style.css", "css/Galmuri-OFL.txt",
  "js/data.js", "js/species-manager.js", "js/species-data.js", "js/breeding.js", "js/logic.js",
  "js/sprites.js", "js/render.js", "js/sound.js", "js/ui.js", "js/main.js",
];

fs.rmSync(OUT, { recursive: true, force: true });
const hash = {};
ASSETS.forEach((rel) => {
  const src = path.join(ROOT, rel);
  const buf = fs.readFileSync(src);
  hash[rel] = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 10);
  fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
  fs.writeFileSync(path.join(OUT, rel), buf);
});

let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
html = html.replace(/(href|src)="((?:css|js)\/[^"?]+)"/g, (m, attr, rel) => {
  if (!hash[rel]) {
    throw new Error("index.html이 빌드 목록에 없는 파일을 참조: " + rel);
  }
  return attr + '="' + rel + "?v=" + hash[rel] + '"';
});
fs.writeFileSync(path.join(OUT, "index.html"), html);

const headers = `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'

/index.html
  Cache-Control: no-cache

/
  Cache-Control: no-cache

/js/*
  Cache-Control: public, max-age=31536000, immutable

/css/*
  Cache-Control: public, max-age=31536000, immutable
`;
fs.writeFileSync(path.join(OUT, "_headers"), headers);
// GitHub Pages: Jekyll 처리 끄기 (_headers 같은 파일을 그대로 두고, 빌드 시간 단축)
fs.writeFileSync(path.join(OUT, ".nojekyll"), "");

let total = 0;
(function walk(d) {
  fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      walk(p);
    } else {
      total += fs.statSync(p).size;
    }
  });
})(OUT);
console.log("dist/ 빌드 완료 · 파일 " + (ASSETS.length + 2) + "개 · " + (total / 1024).toFixed(0) + "KB");
