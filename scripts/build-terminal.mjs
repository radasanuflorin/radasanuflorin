// Builds assets/terminal.svg: an animated neofetch-style card with an ASCII portrait.
// Run: node scripts/build-terminal.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const face = JSON.parse(readFileSync(join(root, 'assets/face.json'), 'utf8'));

// Live numbers written by build-stats.mjs (optional: the card still builds without them).
const statsPath = join(root, 'assets/stats.json');
const S = existsSync(statsPath) ? JSON.parse(readFileSync(statsPath, 'utf8')) : null;
const k = (n) => n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/.0$/, '') + 'k' : n.toLocaleString('en-US');

const W = 1000;
const FONT = 'Consolas, "SF Mono", Menlo, "DejaVu Sans Mono", monospace';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- ASCII portrait ----------
// Brightness -> colour ramp: deep ember -> neon red -> orange -> warm white.
const PALETTE = ['#5a1a20', '#7a1c26', '#9c1f2b', '#c22430', '#e62a36', '#ff3b3b', '#ff6a30', '#ff9640', '#ffbe7a', '#fff0dc'];
const levelOf = (v) => Math.min(PALETTE.length - 1, Math.floor(Math.pow(v, 0.85) * PALETTE.length));

const AX = 24, AY = 70, FS = 9.4, LH = 10.4;
let ascii = '';
face.rows.forEach((row, y) => {
  let spans = '', cur = null, buf = '';
  const flush = () => { if (buf) spans += cur === null ? esc(buf) : `<tspan class="c${cur}">${esc(buf)}</tspan>`; buf = ''; };
  for (const [ch, v] of row) {
    const lvl = ch === ' ' ? null : levelOf(v);
    if (lvl !== cur) { flush(); cur = lvl; }
    buf += ch;
  }
  flush();
  const delay = (0.35 + y * 0.028).toFixed(3);
  ascii += `<text class="row" x="${AX}" y="${AY + y * LH}" style="animation-delay:${delay}s">${spans}</text>\n`;
});
const asciiBottom = AY + face.rows.length * LH;

// ---------- Info panel ----------
const IX = 460;
const info = [
  ['prompt', 'florin@radasanu:~$ neofetch'],
  ['title', 'florin@radasanu'],
  ['rule', '-'.repeat(46)],
  ['kv', 'OS', 'Computer Engineering @ USV Suceava · Year II'],
  ['kv', 'Host', 'Suceava, Romania'],
  ['kv', 'Kernel', 'Full-Stack Developer'],
  ['kv', 'Uptime', 'shipping projects since 2025'],
  ['kv', 'Packages', S ? `${S.repos} repos (${S.publicCount} public · ${S.privateCount} private)` : '4 apps · web + mobile'],
  ['kv', 'Shell', 'TypeScript · JavaScript · Dart'],
  ['gap'],
  ['kv', 'Lang.Code', 'TypeScript, JavaScript, Dart, SQL, VHDL'],
  ['kv', 'Lang.Real', 'Romanian (native), English (C1)'],
  ['kv', 'Web', 'React, Next.js, Tailwind, Framer Motion'],
  ['kv', 'Mobile', 'Flutter, Riverpod, Hive'],
  ['kv', 'Backend', 'Node.js, Cloudflare Workers, Prisma, SQLite'],
  ['kv', 'Passion', 'Cyber security — deeply into it'],
  ['kv', 'Tools', 'Git, GitHub Actions, Vitest, Vercel'],
  ['kv', 'Studying', 'Analog electronics, Computer organization'],
  ['kv', 'Seeking', 'Research in electronics & hardware'],
  ['status', 'Status', 'AVAILABLE'],
  ...(S ? [
    ['gap'],
    ['section', '- GitHub (live) '],
    ['kv', 'Commits', `${k(S.commits)} · ${k(S.contributions)} contributions`],
    ['kv', 'Lines', `+${k(S.added)} written · −${k(S.removed)} removed`],
    ['kv', 'Streak', `${S.current} day${S.current === 1 ? '' : 's'} (longest ${S.longest})`],
  ] : []),
  ['gap'],
  ['section', '- Contact '],
  ['kv', 'Email', 'radasanuflo@gmail.com'],
  ['kv', 'Instagram', '@radasanu.f'],
  ['kv', 'Motto', '"Correctness over speed."'],
];

const LINE = 20.2, KEYW = 14; // key column width in chars
let y = 74, t = 0.6, infoSvg = '', clips = '';
info.forEach((line, i) => {
  const [kind] = line;
  if (kind === 'gap') { y += LINE * 0.55; return; }
  let content = '', chars = 0;
  if (kind === 'prompt') {
    content = `<text x="${IX}" y="${y}" class="prompt">${esc(line[1])}</text>`; chars = line[1].length;
  } else if (kind === 'title') {
    const s = esc(line[1]);
    content = `<g class="glitch"><text x="${IX}" y="${y + 6}" class="title g1">${s}</text><text x="${IX}" y="${y + 6}" class="title g2">${s}</text><text x="${IX}" y="${y + 6}" class="title">${s}</text></g>`;
    chars = 30; y += 8;
  } else if (kind === 'rule' || kind === 'section') {
    const s = kind === 'section' ? line[1] + '-'.repeat(46 - line[1].length) : line[1];
    content = `<text x="${IX}" y="${y}" class="rule">${esc(s)}</text>`; chars = s.length;
  } else if (kind === 'kv' || kind === 'status') {
    const key = line[1], dots = ' ' + '.'.repeat(Math.max(2, KEYW - key.length - 1)) + ' ';
    const val = kind === 'status'
      ? `<tspan class="ok">● ${esc(line[2])}</tspan><tspan class="val"> — open to opportunities</tspan>`
      : `<tspan class="val">${esc(line[2])}</tspan>`;
    content = `<text x="${IX}" y="${y}" xml:space="preserve"><tspan class="key">${esc(key)}</tspan><tspan class="dots">${esc(dots)}</tspan>${val}</text>`;
    chars = KEYW + line[2].length + (kind === 'status' ? 26 : 0);
  }
  const dur = Math.min(0.9, 0.12 + chars * 0.012);
  const id = `l${i}`;
  clips += `<clipPath id="${id}"><rect x="${IX - 4}" y="${y - 20}" height="${kind === 'title' ? 34 : 26}" width="0"><animate attributeName="width" from="0" to="560" begin="${t.toFixed(2)}s" dur="${dur.toFixed(2)}s" fill="freeze" calcMode="spline" keySplines="0.3 0 0.6 1" keyTimes="0;1"/></rect></clipPath>\n`;
  infoSvg += `<g clip-path="url(#${id})">${content}</g>\n`;
  t += dur * 0.55;
  y += LINE;
});

// neofetch colour blocks + blinking cursor
const blockColors = ['#1a1a1f', '#c21f2c', '#ff2e3b', '#ff5a2a', '#ff8a2a', '#ffb066', '#ffe2c4', '#f2f2f2'];
y += 4;
const blocks = blockColors.map((c, i) => `<rect x="${IX + i * 30}" y="${y - 14}" width="28" height="16" rx="2" fill="${c}" class="blk" style="animation-delay:${(t + i * 0.06).toFixed(2)}s"/>`).join('');
const cursorY = y + 30;
const H = Math.round(Math.max(asciiBottom, cursorY) + 36);
const asciiShift = Math.max(0, (cursorY - asciiBottom) / 2);
const cursor = `<text x="${IX}" y="${cursorY}" class="prompt fade" style="animation-delay:${(t + 0.6).toFixed(2)}s">florin@radasanu:~$ <tspan class="cursor">█</tspan></text>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Florin Radasanu — neofetch-style profile card with an ASCII portrait">
<defs>
  <linearGradient id="border" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ff2e3b"/><stop offset=".5" stop-color="#ff8a2a"/><stop offset="1" stop-color="#ff2e3b"/>
  </linearGradient>
  <linearGradient id="scan" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ff2e3b" stop-opacity="0"/><stop offset=".5" stop-color="#ff5a2a" stop-opacity=".22"/><stop offset="1" stop-color="#ff2e3b" stop-opacity="0"/>
  </linearGradient>
  <radialGradient id="glow" cx=".22" cy=".55" r=".5">
    <stop offset="0" stop-color="#ff2e3b" stop-opacity=".16"/><stop offset="1" stop-color="#ff2e3b" stop-opacity="0"/>
  </radialGradient>
  <pattern id="lines" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#000" opacity=".28"/></pattern>
  <clipPath id="screen"><rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="14"/></clipPath>
  ${clips}
</defs>
<style>
  text { font-family: ${FONT}; }
  .row { font-size: ${FS}px; font-weight: 700; white-space: pre; opacity: 0; animation: rowIn .45s ease-out forwards, flicker 7s 4s infinite; }
  ${PALETTE.map((c, i) => `.c${i}{fill:${c}}`).join('')}
  .c9,.c8 { filter: drop-shadow(0 0 2px #ff8a2a); }
  .prompt { font-size: 14px; fill: #ff5a2a; white-space: pre; }
  .title { font-size: 26px; font-weight: 800; fill: #fff; letter-spacing: 1px; }
  .g1 { fill: #ff2e3b; opacity: .85; animation: g1 3.2s 3s infinite steps(1); }
  .g2 { fill: #2ee6ff; opacity: .7;  animation: g2 3.2s 3s infinite steps(1); }
  .rule { font-size: 14px; fill: #5a2228; white-space: pre; }
  .key { font-size: 14px; fill: #ff8a2a; font-weight: 700; }
  .dots { font-size: 14px; fill: #3b3b44; white-space: pre; }
  .val { font-size: 14px; fill: #e8e3e0; white-space: pre; }
  .ok { font-size: 14px; fill: #3ddc84; font-weight: 700; animation: pulse 1.6s infinite; }
  .cursor { fill: #ff2e3b; animation: blink 1s steps(1) infinite; }
  .fade, .blk { opacity: 0; animation: rowIn .4s ease-out forwards; }
  .scan { animation: scan 5.5s linear infinite; }
  @keyframes rowIn { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: none; } }
  @keyframes flicker { 0%,96%,100% { opacity: 1; } 97% { opacity: .55; } 98% { opacity: 1; } 99% { opacity: .75; } }
  @keyframes blink { 50% { opacity: 0; } }
  @keyframes pulse { 50% { opacity: .45; } }
  @keyframes scan { from { transform: translateY(-120px); } to { transform: translateY(${H + 40}px); } }
  @keyframes g1 { 0%,88%,100% { transform: none; } 90% { transform: translate(-3px,1px); } 93% { transform: translate(2px,-1px); } 96% { transform: translate(-1px,0); } }
  @keyframes g2 { 0%,88%,100% { transform: none; } 90% { transform: translate(3px,-1px); } 93% { transform: translate(-2px,1px); } 96% { transform: translate(1px,0); } }
</style>

<rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="14" fill="#0a0a0f"/>
<g clip-path="url(#screen)">
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <!-- title bar -->
  <rect x="10" y="10" width="${W - 20}" height="34" fill="#14141b"/>
  <circle cx="34" cy="27" r="6" fill="#ff5f57"/><circle cx="54" cy="27" r="6" fill="#febc2e"/><circle cx="74" cy="27" r="6" fill="#28c840"/>
  <text x="${W / 2}" y="32" text-anchor="middle" font-size="13" fill="#8a8a96">florin@radasanu: ~ — neofetch — 120×40</text>
  <!-- portrait -->
  <g transform="translate(0 ${asciiShift.toFixed(1)})">${'\n' + ascii}</g>
  <line x1="${IX - 22}" y1="66" x2="${IX - 22}" y2="${H - 40}" stroke="#2a1216" stroke-dasharray="2 4"/>
  <!-- info -->
  ${infoSvg}
  ${blocks}
  ${cursor}
  <!-- CRT effects -->
  <rect width="${W}" height="${H}" fill="url(#lines)" pointer-events="none"/>
  <rect class="scan" x="0" y="0" width="${W}" height="110" fill="url(#scan)" pointer-events="none"/>
</g>
<rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="14" fill="none" stroke="url(#border)" stroke-width="1.6"/>
</svg>
`;

writeFileSync(join(root, 'assets/terminal.svg'), svg);
console.log(`terminal.svg written (${(svg.length / 1024).toFixed(1)} KB), ascii bottom = ${asciiBottom}, info bottom = ${cursorY}`);
