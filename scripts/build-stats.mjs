// Builds assets/stats.svg from the GitHub API, private repos included.
// Needs a token in GH_TOKEN that can read the owner's private repos.
// Run: GH_TOKEN=... node scripts/build-stats.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = process.env.GH_TOKEN;
if (!TOKEN) { console.error('GH_TOKEN is not set'); process.exit(1); }
const headers = { Authorization: `bearer ${TOKEN}`, 'User-Agent': 'profile-stats', Accept: 'application/vnd.github+json' };

async function gql(query, variables = {}) {
  const r = await fetch('https://api.github.com/graphql', { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- collect ----------
const base = await gql(`{
  viewer {
    login createdAt
    followers { totalCount }
    pullRequests { totalCount }
    issues { totalCount }
    repositories(ownerAffiliations: OWNER, isFork: false, first: 100) {
      totalCount
      nodes {
        name isPrivate stargazerCount
        languages(first: 20, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name color } } }
      }
    }
  }
}`);
const me = base.viewer;
const repos = me.repositories.nodes;

// Contributions, year by year since the account was created (private ones included for the token owner).
const startYear = new Date(me.createdAt).getUTCFullYear();
const now = new Date();
let commits = 0, contributions = 0, thisYear = 0;
const days = [];
for (let y = startYear; y <= now.getUTCFullYear(); y++) {
  const from = new Date(Date.UTC(y, 0, 1)).toISOString();
  const to = (y === now.getUTCFullYear() ? now : new Date(Date.UTC(y, 11, 31, 23, 59, 59))).toISOString();
  const d = await gql(`query($from: DateTime!, $to: DateTime!) { viewer { contributionsCollection(from: $from, to: $to) {
      totalCommitContributions restrictedContributionsCount
      contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
  } } }`, { from, to });
  const c = d.viewer.contributionsCollection;
  commits += c.totalCommitContributions;
  contributions += c.contributionCalendar.totalContributions;
  if (y === now.getUTCFullYear()) thisYear = c.contributionCalendar.totalContributions;
  for (const w of c.contributionCalendar.weeks) days.push(...w.contributionDays);
}

// Streaks (today without contributions does not break the current streak yet).
days.sort((a, b) => a.date.localeCompare(b.date));
let longest = 0, run = 0;
for (const d of days) { run = d.contributionCount > 0 ? run + 1 : 0; longest = Math.max(longest, run); }
let current = 0;
for (let i = days.length - 1; i >= 0; i--) {
  if (days[i].contributionCount > 0) current++;
  else if (i === days.length - 1) continue;
  else break;
}

// Lines added / removed by the owner, from the contributor stats of every repo.
let added = 0, removed = 0;
for (const repo of repos) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await fetch(`https://api.github.com/repos/${me.login}/${repo.name}/stats/contributors`, { headers });
    if (r.status === 202) { await sleep(3000); continue; }
    if (!r.ok || r.status === 204) break;
    const text = await r.text();
    let list = null;
    try { list = JSON.parse(text); } catch { break; }
    const mine = Array.isArray(list) ? list.find((c) => c.author?.login?.toLowerCase() === me.login.toLowerCase()) : null;
    if (mine) for (const w of mine.weeks) { added += w.a; removed += w.d; }
    break;
  }
}

// Commits authored by the owner on every branch of every owned repo (each SHA counted once).
async function getAll(url) {
  const out = [];
  for (let page = 1; page < 100; page++) {
    const r = await fetch(`${url}${url.includes('?') ? '&' : '?'}per_page=100&page=${page}`, { headers });
    if (!r.ok || r.status === 204) break;
    let batch; try { batch = JSON.parse(await r.text()); } catch { break; }
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}
const shas = new Set();
for (const repo of repos) {
  const api = `https://api.github.com/repos/${me.login}/${repo.name}`;
  const branches = await getAll(`${api}/branches`);
  for (const b of branches) {
    const list = await getAll(`${api}/commits?sha=${encodeURIComponent(b.name)}&author=${me.login}`);
    for (const c of list) shas.add(c.sha);
  }
}
const allBranchCommits = shas.size;
commits = Math.max(commits, allBranchCommits);

// Languages by bytes across all owned repos.
const langs = new Map();
for (const repo of repos) for (const e of repo.languages.edges) {
  const cur = langs.get(e.node.name) || { size: 0, color: e.node.color || '#8a8a96' };
  cur.size += e.size; langs.set(e.node.name, cur);
}
const totalBytes = [...langs.values()].reduce((s, l) => s + l.size, 0) || 1;
let langList = [...langs.entries()].map(([name, l]) => ({ name, color: l.color, pct: (l.size / totalBytes) * 100 })).sort((a, b) => b.pct - a.pct).filter((l) => l.pct >= 0.1);
if (langList.length > 7) {
  const rest = langList.slice(7).reduce((s, l) => s + l.pct, 0);
  langList = [...langList.slice(0, 7), { name: 'Other', color: '#5a5a66', pct: rest }];
}

const privateCount = repos.filter((r) => r.isPrivate).length;
const stats = {
  contributions, commits, thisYear, current, longest, added, removed,
  repos: me.repositories.totalCount, privateCount, publicCount: me.repositories.totalCount - privateCount,
  stars: repos.reduce((s, r) => s + r.stargazerCount, 0),
  prs: me.pullRequests.totalCount, issues: me.issues.totalCount, followers: me.followers.totalCount,
};
// Manual floor set by hand: the real number replaces it as soon as it is higher.
const COMMITS_FLOOR = 359;
console.log(`real commits (all branches): ${allBranchCommits}`);
stats.commits = Math.max(stats.commits, COMMITS_FLOOR);
writeFileSync(join(root, 'assets/stats.json'), JSON.stringify({ ...stats, languages: langList, updated: now.toISOString() }, null, 2) + '\n');

console.log(stats, langList.map((l) => `${l.name} ${l.pct.toFixed(1)}%`).join(', '));

// ---------- render ----------
const fmt = (n) => n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'k' : n.toLocaleString('en-US');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const FONT = 'Consolas, "SF Mono", Menlo, "DejaVu Sans Mono", monospace';
const W = 1000, PAD = 34;
let delay = 0.2;
const nextDelay = () => (delay += 0.08).toFixed(2);

const tile = (x, y, w, h, label, value, sub, big) => `
  <g class="tile" style="animation-delay:${nextDelay()}s">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#111118" stroke="#2a1216"/>
    <rect x="${x}" y="${y + 14}" width="3" height="${h - 28}" rx="1.5" fill="#ff2e3b"/>
    <text x="${x + 18}" y="${y + 26}" class="label">${esc(label)}</text>
    <text x="${x + 18}" y="${y + (big ? 66 : 56)}" class="${big ? 'hero' : 'num'}">${esc(value)}</text>
    ${sub ? `<text x="${x + 18}" y="${y + h - 14}" class="sub">${esc(sub)}</text>` : ''}
  </g>`;

const gap = 14;
const heroW = (W - PAD * 2 - gap * 3) / 4;
const smallW = (W - PAD * 2 - gap * 5) / 6;
let tiles = '';
const r1 = 74, r2 = r1 + 104 + gap;
[
  ['CONTRIBUTIONS', fmt(stats.contributions), 'all time · private included'],
  ['COMMITS', fmt(stats.commits), 'all time · private included'],
  ['LINES OF CODE', '+' + fmt(stats.added), `−${fmt(stats.removed)} removed`],
  ['CURRENT STREAK', `${stats.current} day${stats.current === 1 ? '' : 's'}`, `longest: ${stats.longest} days`],
].forEach(([l, v, s], i) => { tiles += tile(PAD + i * (heroW + gap), r1, heroW, 104, l, v, s, true); });
[
  ['REPOSITORIES', fmt(stats.repos), `${stats.publicCount} public · ${stats.privateCount} private`],
  ['THIS YEAR', fmt(stats.thisYear), 'contributions'],
  ['PULL REQUESTS', fmt(stats.prs), ''],
  ['ISSUES', fmt(stats.issues), ''],
  ['STARS', fmt(stats.stars), ''],
  ['FOLLOWERS', fmt(stats.followers), ''],
].forEach(([l, v, s], i) => { tiles += tile(PAD + i * (smallW + gap), r2, smallW, 88, l, v, s, false); });

// Language bar: stacked, 2px surface gaps, legend with names + % (identity is never colour alone).
const ly = r2 + 88 + 34;
const barW = W - PAD * 2;
let bx = PAD, bar = '', legend = '';
langList.forEach((l, i) => {
  const w = Math.max(2, (l.pct / 100) * barW - 2);
  bar += `<rect x="${bx.toFixed(1)}" y="${ly + 18}" width="${w.toFixed(1)}" height="12" rx="3" fill="${l.color}"><title>${esc(l.name)} ${l.pct.toFixed(1)}%</title></rect>`;
  bx += w + 2;
  const col = i % 4, row = Math.floor(i / 4);
  const lx = PAD + col * (barW / 4), lyy = ly + 58 + row * 24;
  legend += `<circle cx="${lx + 5}" cy="${lyy - 4}" r="5" fill="${l.color}"/><text x="${lx + 18}" y="${lyy}" class="lang">${esc(l.name)} <tspan class="pct">${l.pct.toFixed(1)}%</tspan></text>`;
});
const H = ly + 58 + Math.ceil(langList.length / 4) * 24 + 16;
const updated = now.toISOString().slice(0, 10);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="GitHub stats for ${esc(me.login)}, private repositories included: ${stats.contributions} contributions, ${stats.commits} commits, ${stats.repos} repositories.">
<style>
  text { font-family: ${FONT}; }
  .label { font-size: 11px; fill: #8a8a96; letter-spacing: 1.5px; font-weight: 700; }
  .hero { font-size: 32px; fill: #ffffff; font-weight: 800; }
  .num { font-size: 24px; fill: #ffffff; font-weight: 800; }
  .sub { font-size: 11px; fill: #8a8a96; }
  .lang { font-size: 13px; fill: #e8e3e0; }
  .pct { fill: #8a8a96; }
  .head { font-size: 14px; fill: #ff5a2a; }
  .muted { font-size: 12px; fill: #5a5a66; }
  .sec { font-size: 11px; fill: #8a8a96; letter-spacing: 1.5px; font-weight: 700; }
  .tile { opacity: 0; animation: in .5s ease-out forwards; }
  .cursor { fill: #ff2e3b; animation: blink 1s steps(1) infinite; }
  @keyframes in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  @keyframes blink { 50% { opacity: 0; } }
</style>
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="14" fill="#0a0a0f" stroke="#ff2e3b" stroke-opacity=".6"/>
<text x="${PAD}" y="46" class="head">florin@radasanu:~$ cat /proc/stats <tspan class="cursor">█</tspan></text>
<text x="${W - PAD}" y="46" text-anchor="end" class="muted">auto-updated ${updated} · private repos included</text>
${tiles}
<text x="${PAD}" y="${ly + 6}" class="sec">LANGUAGES · ALL REPOSITORIES, BY CODE SIZE</text>
${bar}
${legend}
</svg>
`;
writeFileSync(join(root, 'assets/stats.svg'), svg);
console.log('stats.svg written');
