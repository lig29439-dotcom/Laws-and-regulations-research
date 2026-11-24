// 靜態網站建置：讀取 data/ 的 JSON，輸出 dist/。無任何外部套件依賴。
// 以「法源（instrument）」為單位：data/instruments/<id>/ 底下放 instrument.json、topics.json、articles/*.json。
// 新增法源只需要新增資料夾，不用改這支程式。詳見 docs/adding-an-instrument.md。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");

const readJSON = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const paras = (text) => String(text).split(/\n+/).map((t) => `<p>${esc(t)}</p>`).join("\n");
const slug = (no) => String(no).replace(/[^A-Za-z0-9]+/g, "-");

const errors = [];

// ---------- 載入資料 ----------
const INST_DIR = path.join(DATA, "instruments");
const instruments = fs
  .readdirSync(INST_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => {
    const dir = path.join(INST_DIR, d.name);
    const meta = readJSON(path.join(dir, "instrument.json"));
    if (meta.id !== d.name) errors.push(`法源資料夾 ${d.name} 與 instrument.json 的 id（${meta.id}）不一致`);
    for (const k of ["id", "abbr", "title", "en", "intro"]) if (!meta[k]) errors.push(`${d.name}/instrument.json 缺少欄位 ${k}`);
    const topics = readJSON(path.join(dir, "topics.json")).sort((a, b) => a.order - b.order);
    const files = fs.readdirSync(path.join(dir, "articles")).filter((f) => f.endsWith(".json")).sort();
    const topicOrder = Object.fromEntries(topics.map((t) => [t.id, t.order]));
    const articles = files
      .flatMap((f) => readJSON(path.join(dir, "articles", f)))
      .map((a) => ({ ...a, inst: meta.id, slug: slug(a.no), lab: a.numLabel ?? `第${a.no}條` }));
    const key = (a) => a.order ?? (Number.isNaN(parseFloat(a.no)) ? 1e9 : parseFloat(a.no));
    articles.sort((a, b) => (topicOrder[a.topic] ?? 1e9) - (topicOrder[b.topic] ?? 1e9) || key(a) - key(b) || String(a.no).localeCompare(String(b.no)));
    return { ...meta, topics, articles };
  })
  .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

const cases = readJSON(path.join(DATA, "cases", "cases.json"));
const quiz = readJSON(path.join(DATA, "quiz", "questions.json"));

const instById = new Map(instruments.map((i) => [i.id, i]));
const artByKey = new Map(); // "inst:no" -> article
for (const i of instruments) for (const a of i.articles) artByKey.set(`${i.id}:${a.no}`, a);
const caseById = new Map(cases.map((c) => [c.id, c]));

// 解析條文參照：「26」＝同一法源的第 26 條；「unclos:121」＝其他法源
const ref = (defaultInst, r) => artByKey.get(String(r).includes(":") ? String(r) : `${defaultInst}:${r}`);
const refKey = (defaultInst, r) => (String(r).includes(":") ? String(r) : `${defaultInst}:${r}`);

// ---------- 資料檢查（連結壞掉就直接讓建置失敗） ----------
for (const i of instruments) {
  const topicIds = new Set(i.topics.map((t) => t.id));
  const nos = new Set();
  for (const a of i.articles) {
    if (nos.has(a.no)) errors.push(`${i.id}：條號 ${a.no} 重複`);
    nos.add(a.no);
    const where = `${i.id} ${a.lab}`;
    for (const k of ["no", "title", "en", "topic", "oneLiner", "explain", "why", "scenario"]) if (!a[k]) errors.push(`${where}：缺少欄位 ${k}`);
    if (!topicIds.has(a.topic)) errors.push(`${where}：未知主題 ${a.topic}`);
    for (const r of a.related ?? []) if (!ref(i.id, r)) errors.push(`${where}：related 指向不存在的 ${r}`);
    for (const c of a.cases ?? []) if (!caseById.has(c)) errors.push(`${where}：cases 指向不存在的 ${c}`);
  }
}
for (const c of cases) {
  if (!instById.has(c.instrument)) errors.push(`案例 ${c.id}：未知法源 ${c.instrument}`);
  for (const r of c.articles ?? []) if (!ref(c.instrument, r)) errors.push(`案例 ${c.id}：articles 指向不存在的 ${r}`);
}
{
  const ids = new Set();
  for (const q of quiz) {
    if (ids.has(q.id)) errors.push(`題目 ${q.id} 重複`);
    ids.add(q.id);
    if (!instById.has(q.instrument)) { errors.push(`題目 ${q.id}：未知法源 ${q.instrument}`); continue; }
    if (!q.options.includes(q.answer)) errors.push(`題目 ${q.id}：答案不在選項內`);
    for (const o of q.options) {
      if (!ref(q.instrument, o)) errors.push(`題目 ${q.id}：選項 ${o} 不存在`);
      if (o !== q.answer && !q.notes?.[o]) errors.push(`題目 ${q.id}：缺少 ${o} 的誤選說明`);
    }
  }
}
if (errors.length) {
  console.error("資料錯誤：\n- " + errors.join("\n- "));
  process.exit(1);
}

const totalArticles = instruments.reduce((n, i) => n + i.articles.length, 0);
const multi = instruments.length > 1;
const artPath = (a) => `${a.inst}/art-${a.slug}.html`;
const artTitle = (a) => `${a.lab}　${a.title}`;
const chipLabel = (a, withAbbr) => `${withAbbr ? instById.get(a.inst).abbr + " " : ""}${a.lab} ${a.title}`;

// ---------- 版型 ----------
function layout({ title, desc, depth, body, scripts = "" }) {
  const R = "../".repeat(depth);
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="stylesheet" href="${R}style.css">
</head>
<body>
<header class="site">
  <div class="wrap bar">
    <a class="brand" href="${R}index.html">國際公法法源速查</a>
    <nav>
      <a href="${R}index.html#instruments">法源</a>
      <a href="${R}cases/index.html">判例</a>
      <a href="${R}quiz/index.html">練習</a>
      <a href="${R}about.html">關於</a>
    </nav>
    <form class="mini" action="${R}index.html" method="get" role="search">
      <input type="search" name="q" placeholder="搜尋：26、保留、jus cogens…" aria-label="搜尋">
    </form>
  </div>
</header>
<main class="wrap">
${body}
</main>
<footer class="site"><div class="wrap">
  教學整理，非官方文本。引用或實務使用前，請以官方全文與最新締約狀態為準。
</div></footer>
${scripts}
</body>
</html>
`;
}

function write(rel, html) {
  const p = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, html);
}

// ---------- 建置 ----------
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
for (const f of ["style.css", "search.js", "quiz.js"]) fs.copyFileSync(path.join(SRC, f), path.join(DIST, f));

// 搜尋索引
const searchIndex = [
  ...instruments.flatMap((i) =>
    i.articles.map((a) => ({
      k: "art",
      abbr: i.abbr,
      no: String(a.no),
      url: artPath(a),
      title: (multi ? `${i.abbr} ` : "") + artTitle(a),
      sub: a.en,
      line: a.oneLiner,
      hay: [
        i.abbr, i.title, i.en, a.lab, `art ${a.no}`, a.title, a.en, a.oneLiner,
        i.topics.find((t) => t.id === a.topic).title, ...(a.keywords ?? []),
      ].join(" ").toLowerCase(),
    }))
  ),
  ...cases.map((c) => ({
    k: "case",
    url: `cases/${c.id}.html`,
    title: c.short,
    sub: `${c.court}・${c.year}`,
    line: c.lesson,
    hay: [c.short, c.en, c.court, String(c.year), c.cite, instById.get(c.instrument).abbr, ...(c.articles ?? []).map((r) => ref(c.instrument, r).lab)].join(" ").toLowerCase(),
  })),
];
fs.writeFileSync(path.join(DIST, "search-data.js"), "window.SEARCH_DATA=" + JSON.stringify(searchIndex) + ";");

// 首頁
{
  const cards = instruments
    .map(
      (i) => `<li class="card"><a href="${i.id}/index.html"><strong>${esc(i.title)}</strong> <span class="tag">${esc(i.abbr)}</span></a>
  <p class="muted">${esc(i.en)}・${i.articles.length} 條${esc(i.status ? "・" + i.status : "")}</p>
  <p>${esc(i.intro)}</p></li>`
    )
    .join("\n");
  const sections = instruments
    .map((i) => {
      const stages = i.topics
        .map((t, n) => {
          const list = i.articles.filter((a) => a.topic === t.id);
          return `<li class="stage">
  <div class="stage-no">${n + 1}</div>
  <div class="stage-body">
    <h3>${esc(t.title)}</h3>
    <p class="muted">${esc(t.blurb)}</p>
    <p class="chips">${list.map((a) => `<a class="chip" href="${artPath(a)}" title="${esc(a.title)}">${a.lab} ${esc(a.title)}</a>`).join("")}</p>
  </div>
</li>`;
        })
        .join("\n");
      return `<section class="inst-section" id="browse-${i.id}">
  <h2>${esc(i.title)}　<small class="muted">${esc(i.abbr)}</small></h2>
  <ol class="stages">${stages}</ol>
  <p><a href="${i.id}/index.html">→ 查看${esc(i.abbr)}介紹與全部條文</a></p>
</section>`;
    })
    .join("\n");
  const body = `
<section class="hero">
  <h1>國際公法法源速查</h1>
  <p class="lead">用白話和小情境，說明每一條規則「為什麼這樣規定」。</p>
  <form id="searchForm" role="search">
    <input id="q" type="search" placeholder="輸入條號（26）、關鍵字（保留、脅迫）或英文（pacta sunt servanda）" autofocus aria-label="搜尋">
  </form>
  <div id="results" class="results" aria-live="polite"></div>
</section>

<div id="browse">
<section id="instruments">
  <h2>收錄的法源</h2>
  <ul class="cards">${cards}</ul>
  <p class="muted">共 ${totalArticles} 條條文、${cases.length} 個判例、${quiz.length} 題練習。　<a href="cases/index.html">判例</a>　<a href="quiz/index.html">情境練習</a></p>
</section>
${sections}
</div>`;
  write(
    "index.html",
    layout({
      title: "國際公法法源速查",
      desc: "以白話與情境整理國際公法法源，附相關國際法院判例與情境練習。",
      depth: 0,
      body,
      scripts: `<script src="search-data.js"></script><script src="search.js"></script>`,
    })
  );
}

// 法源頁與條文頁
for (const inst of instruments) {
  const topicById = new Map(inst.topics.map((t) => [t.id, t]));
  const rows = [
    ["中文名稱", inst.title],
    ["英文名稱", inst.en],
    ["簡稱", inst.abbr],
    ["通過", inst.adopted],
    ["生效", inst.inForce],
    ["保存機關", inst.depositary],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`)
    .join("");
  const links = (inst.links ?? []).map((l) => `<li><a href="${esc(l.url)}" rel="noopener">${esc(l.label)}</a></li>`).join("");
  const groups = inst.topics
    .map((t) => {
      const list = inst.articles.filter((a) => a.topic === t.id);
      if (!list.length) return "";
      return `<h3>${esc(t.title)}</h3>
<ul class="arts">${list
        .map((a) => `<li><a href="art-${a.slug}.html"><span class="no">${a.lab}</span> <strong>${esc(a.title)}</strong></a><br><span class="muted">${esc(a.oneLiner)}</span></li>`)
        .join("")}</ul>`;
    })
    .join("\n");
  write(
    `${inst.id}/index.html`,
    layout({
      title: `${inst.title}｜國際公法法源速查`,
      desc: inst.intro,
      depth: 1,
      body: `
<nav class="crumb"><a href="../index.html">首頁</a> › ${esc(inst.abbr)}</nav>
<h1>${esc(inst.title)} <small>${esc(inst.abbr)}</small></h1>
<p class="lead">${esc(inst.intro)}</p>
<table class="meta">${rows}</table>
${inst.notes?.length ? `<h2>先看這幾點</h2><ul>${inst.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
${links ? `<h2>官方資料</h2><ul>${links}</ul>` : ""}
<h2>已收錄條文（${inst.articles.length}）</h2>
${groups}`,
    })
  );

  inst.articles.forEach((a, n) => {
    const t = topicById.get(a.topic);
    const prev = inst.articles[n - 1];
    const next = inst.articles[n + 1];
    const rel = (a.related ?? []).map((r) => ref(inst.id, r));
    const cs = (a.cases ?? []).map((id) => caseById.get(id));
    const qn = quiz.filter((q) => q.instrument === inst.id && q.answer === String(a.no)).length;
    const body = `
<nav class="crumb"><a href="../index.html">首頁</a> › <a href="index.html">${esc(inst.abbr)}</a> › ${esc(t.title)}</nav>
<article>
  <p class="eyebrow">${esc(inst.abbr)} ${esc(a.label ?? a.lab)}</p>
  <h1>${esc(a.title)}</h1>
  <p class="en">${esc(a.en)}</p>
  <p class="oneliner">${esc(a.oneLiner)}</p>

  <h2>白話說明</h2>
  ${a.explain.map((p) => `<p>${esc(p)}</p>`).join("\n")}
  ${a.custom ? `<p class="note"><strong>習慣法：</strong>${esc(a.custom)}</p>` : ""}

  <h2>為什麼這樣規定？</h2>
  <p>${esc(a.why)}</p>

  <aside class="scenario">
    <h2>小情境</h2>
    ${paras(a.scenario)}
  </aside>

  ${a.pitfalls?.length ? `<h2>容易搞混的地方</h2><ul>${a.pitfalls.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}

  ${rel.length ? `<h2>相關條文</h2><p class="chips">${rel.map((r) => `<a class="chip" href="../${artPath(r)}">${esc(chipLabel(r, r.inst !== inst.id))}</a>`).join("")}</p>` : ""}

  ${cs.length ? `<h2>相關判例</h2><ul>${cs.map((c) => `<li><a href="../cases/${c.id}.html">${esc(c.short)}</a> <span class="muted">（${esc(c.court)}，${c.year}）</span></li>`).join("")}</ul>` : ""}

  ${qn ? `<h2>練習</h2><p><a href="../quiz/index.html?i=${inst.id}&article=${encodeURIComponent(a.no)}">做「${esc(a.lab)}」的情境題（${qn} 題）→</a></p>` : ""}

  ${links ? `<h2>查官方全文</h2><ul>${links}</ul>` : ""}
</article>
<nav class="pager">
  ${prev ? `<a href="art-${prev.slug}.html">← ${prev.lab} ${esc(prev.title)}</a>` : "<span></span>"}
  ${next ? `<a href="art-${next.slug}.html">${next.lab} ${esc(next.title)} →</a>` : "<span></span>"}
</nav>`;
    write(`${inst.id}/art-${a.slug}.html`, layout({ title: `${inst.abbr} ${a.label ?? a.lab} ${a.title}｜國際公法法源速查`, desc: a.oneLiner, depth: 1, body }));
  });
}

// 判例頁
{
  const list = cases
    .slice()
    .sort((x, y) => x.year - y.year)
    .map(
      (c) => `<li><a href="${c.id}.html"><strong>${esc(c.short)}</strong></a> <span class="muted">${esc(c.court)}，${c.year}</span>${multi ? ` <span class="tag">${esc(instById.get(c.instrument).abbr)}</span>` : ""}<br><span class="muted">${esc(c.lesson)}</span></li>`
    )
    .join("");
  write(
    "cases/index.html",
    layout({
      title: "判例｜國際公法法源速查",
      desc: "與各法源條文相關的國際司法判例整理。",
      depth: 1,
      body: `<nav class="crumb"><a href="../index.html">首頁</a> › 判例</nav><h1>判例</h1><p class="lead">與條文相關的國際司法案例，用來看規則在真實爭端中怎麼被適用。</p><ul class="arts">${list}</ul>`,
    })
  );
  for (const c of cases) {
    const arts = (c.articles ?? []).map((r) => ref(c.instrument, r));
    const body = `
<nav class="crumb"><a href="../index.html">首頁</a> › <a href="index.html">判例</a></nav>
<article>
  <p class="eyebrow">${esc(c.court)}　${c.year}</p>
  <h1>${esc(c.short)}</h1>
  <p class="en">${esc(c.en)}</p>
  <p class="muted">${esc(c.cite)}</p>
  <h2>事實背景</h2><p>${esc(c.facts)}</p>
  <h2>法院怎麼說</h2><p>${esc(c.holding)}</p>
  <h2>學習重點</h2><p>${esc(c.lesson)}</p>
  <h2>相關條文</h2>
  <p class="chips">${arts.map((a) => `<a class="chip" href="../${artPath(a)}">${esc(chipLabel(a, true))}</a>`).join("")}</p>
  <p class="note">案情與判旨為教學用摘要，引用請以判決原文為準（國際法院網站：<a href="https://www.icj-cij.org/cases" rel="noopener">icj-cij.org/cases</a>）。</p>
</article>`;
    write(`cases/${c.id}.html`, layout({ title: `${c.short}｜國際公法法源速查`, desc: c.lesson, depth: 1, body }));
  }
}

// 練習頁
{
  const artMap = {};
  for (const [k, a] of artByKey) artMap[k] = { lab: a.lab, title: a.title, url: `../${artPath(a)}`, abbr: instById.get(a.inst).abbr };
  const qdata = quiz.map((q) => {
    const ans = ref(q.instrument, q.answer);
    const K = (r) => refKey(q.instrument, r);
    return {
      id: q.id,
      inst: q.instrument,
      topic: `${q.instrument}:${ans.topic}`,
      scenario: q.scenario,
      answer: K(q.answer),
      options: q.options.map(K),
      explain: q.explain,
      notes: Object.fromEntries(Object.entries(q.notes ?? {}).map(([r, v]) => [K(r), v])),
    };
  });
  fs.writeFileSync(path.join(DIST, "quiz-data.js"), "window.QUIZ_DATA=" + JSON.stringify({ questions: qdata, articles: artMap, multi }) + ";");
  const scopeOptions = instruments
    .map(
      (i) => `<optgroup label="${esc(i.abbr)}"><option value="${i.id}:*">${esc(i.abbr)} 全部主題</option>${i.topics
        .filter((t) => qdata.some((q) => q.topic === `${i.id}:${t.id}`))
        .map((t) => `<option value="${i.id}:${t.id}">${esc(t.title)}</option>`)
        .join("")}</optgroup>`
    )
    .join("");
  const body = `
<nav class="crumb"><a href="../index.html">首頁</a> › 練習</nav>
<h1>情境練習</h1>
<p class="lead">每題一個小情境，選出最適用的條文。答完會告訴你為什麼對、為什麼其他選項不對。</p>
<div id="quiz-setup" class="quiz-setup">
  <label>範圍
    <select id="quiz-topic"><option value="all">全部</option>${scopeOptions}</select>
  </label>
  <label>題數
    <select id="quiz-count"><option value="10">10 題</option><option value="20">20 題</option><option value="all">全部</option></select>
  </label>
  <button id="quiz-start" class="btn">開始</button>
  <p id="quiz-filter-note" class="muted" hidden></p>
</div>
<div id="quiz-box" aria-live="polite"></div>`;
  write(
    "quiz/index.html",
    layout({ title: "情境練習｜國際公法法源速查", desc: "用小情境練習判斷該援引哪一條規則。", depth: 1, body, scripts: `<script src="../quiz-data.js"></script><script src="../quiz.js"></script>` })
  );
}

// 關於頁
write(
  "about.html",
  layout({
    title: "關於本站｜國際公法法源速查",
    desc: "本站定位、資料來源與如何增補內容。",
    depth: 0,
    body: `
<h1>關於本站</h1>
<h2>定位</h2>
<p>給學習國際公法的學生用的速查與理解工具：以中文為主，每個條文都有白話說明、為什麼這樣規定，以及一個簡單情境。</p>
<h2>資料與限制</h2>
<ul>
  <li>本站只做「索引加導讀」，不轉載條約全文。官方文本與締約國狀態請看聯合國條約集等權威來源。</li>
  <li>說明、情境與案情摘要為教學整理，情境中的國家與事件皆為虛構。</li>
  <li>內容尚未經過專業人士逐條審閱；引用於報告或實務前，請對照官方全文與判決原文。</li>
</ul>
<h2>如何增補內容</h2>
<p>所有內容都是 <code>data/</code> 底下的 JSON 檔。每個法源是 <code>data/instruments/&lt;id&gt;/</code> 一個資料夾（條文放在 <code>articles/</code>）；判例在 <code>data/cases/</code>，練習題在 <code>data/quiz/</code>。新增資料後執行 <code>npm run build</code>，建置程式會檢查欄位與交叉連結。完整步驟見專案內的 <code>docs/adding-an-instrument.md</code>。</p>`,
  })
);

console.log(`完成：${instruments.length} 個法源、${totalArticles} 條條文、${cases.length} 個判例、${quiz.length} 題練習 → dist/`);
