// 靜態網站建置：讀取 data/ 的 JSON，輸出 dist/。無任何外部套件依賴。
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

// ---------- 載入資料 ----------
const instruments = readJSON(path.join(DATA, "instruments.json"));
const topics = readJSON(path.join(DATA, "vclt", "topics.json")).sort((a, b) => a.order - b.order);
const cases = readJSON(path.join(DATA, "cases", "cases.json"));
const quiz = readJSON(path.join(DATA, "quiz", "questions.json"));
const articleFiles = fs.readdirSync(path.join(DATA, "vclt")).filter((f) => /^\d+-.*\.json$/.test(f)).sort();
const articles = articleFiles.flatMap((f) => readJSON(path.join(DATA, "vclt", f)));

// 依主題順序、再依條號排序，用於上一條／下一條
const topicOrder = Object.fromEntries(topics.map((t) => [t.id, t.order]));
articles.sort((a, b) => topicOrder[a.topic] - topicOrder[b.topic] || Number(a.no) - Number(b.no));

// ---------- 資料檢查（連結壞掉就直接讓建置失敗） ----------
const artByNo = new Map(articles.map((a) => [a.no, a]));
const caseById = new Map(cases.map((c) => [c.id, c]));
const topicById = new Map(topics.map((t) => [t.id, t]));
const errors = [];
for (const a of articles) {
  if (!topicById.has(a.topic)) errors.push(`第${a.no}條：未知主題 ${a.topic}`);
  for (const r of a.related ?? []) if (!artByNo.has(r)) errors.push(`第${a.no}條：related 指向不存在的第${r}條`);
  for (const c of a.cases ?? []) if (!caseById.has(c)) errors.push(`第${a.no}條：cases 指向不存在的 ${c}`);
}
for (const c of cases) for (const n of c.articles ?? []) if (!artByNo.has(n)) errors.push(`案例 ${c.id}：articles 指向不存在的第${n}條`);
if (new Set(articles.map((a) => a.no)).size !== articles.length) errors.push("條號重複");
{
  const ids = new Set();
  for (const q of quiz) {
    if (ids.has(q.id)) errors.push(`題目 ${q.id} 重複`);
    ids.add(q.id);
    if (!q.options.includes(q.answer)) errors.push(`題目 ${q.id}：答案不在選項內`);
    for (const o of q.options) {
      if (!artByNo.has(o)) errors.push(`題目 ${q.id}：選項第${o}條不存在`);
      if (o !== q.answer && !q.notes?.[o]) errors.push(`題目 ${q.id}：缺少第${o}條的誤選說明`);
    }
  }
}
if (errors.length) {
  console.error("資料錯誤：\n- " + errors.join("\n- "));
  process.exit(1);
}

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
      <a href="${R}vclt/index.html">條約法</a>
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

const artUrl = (a, R = "") => `${R}vclt/art-${a.no}.html`;
const caseUrl = (c, R = "") => `${R}cases/${c.id}.html`;
const artTitle = (a) => `第${a.no}條　${a.title}`;

function write(rel, html) {
  const p = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, html);
}

// ---------- 建置 ----------
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
fs.copyFileSync(path.join(SRC, "style.css"), path.join(DIST, "style.css"));
fs.copyFileSync(path.join(SRC, "search.js"), path.join(DIST, "search.js"));
fs.copyFileSync(path.join(SRC, "quiz.js"), path.join(DIST, "quiz.js"));

const vclt = instruments.find((i) => i.id === "vclt");

// 搜尋索引
const searchIndex = [
  ...articles.map((a) => ({
    k: "art",
    no: a.no,
    url: `vclt/art-${a.no}.html`,
    title: artTitle(a),
    sub: a.en,
    line: a.oneLiner,
    hay: [
      "vclt", "維也納條約法公約", `第${a.no}條`, `art ${a.no}`, a.title, a.en, a.oneLiner, topicById.get(a.topic).title,
      ...(a.keywords ?? []),
    ].join(" ").toLowerCase(),
  })),
  ...cases.map((c) => ({
    k: "case",
    url: `cases/${c.id}.html`,
    title: c.short,
    sub: `${c.court}・${c.year}`,
    line: c.lesson,
    hay: [c.short, c.en, c.court, String(c.year), c.cite, ...(c.articles ?? []).map((n) => `第${n}條`)].join(" ").toLowerCase(),
  })),
];
fs.writeFileSync(path.join(DIST, "search-data.js"), "window.SEARCH_DATA=" + JSON.stringify(searchIndex) + ";");

// 首頁
{
  const stages = topics
    .map((t, i) => {
      const list = articles.filter((a) => a.topic === t.id);
      return `<li class="stage">
  <div class="stage-no">${i + 1}</div>
  <div class="stage-body">
    <h3>${esc(t.title)}</h3>
    <p class="muted">${esc(t.blurb)}</p>
    <p class="chips">${list.map((a) => `<a class="chip" href="${artUrl(a)}" title="${esc(a.title)}">第${a.no}條 ${esc(a.title)}</a>`).join("")}</p>
  </div>
</li>`;
    })
    .join("\n");
  const body = `
<section class="hero">
  <h1>國際公法法源速查</h1>
  <p class="lead">先從<strong>條約法</strong>開始：用白話和小情境，說明每一條規則「為什麼這樣規定」。</p>
  <form id="searchForm" role="search">
    <input id="q" type="search" placeholder="輸入條號（26）、關鍵字（保留、脅迫）或英文（pacta sunt servanda）" autofocus aria-label="搜尋">
  </form>
  <div id="results" class="results" aria-live="polite"></div>
</section>

<section id="browse">
  <h2>一個條約的一生</h2>
  <p class="muted">依條約從誕生到結束的順序整理《維也納條約法公約》（共 ${articles.length} 條）。</p>
  <ol class="stages">${stages}</ol>
  <p><a href="vclt/index.html">→ 查看公約介紹與全部條文</a>　<a href="cases/index.html">→ 判例（${cases.length}）</a>　<a href="quiz/index.html">→ 情境練習（${quiz.length} 題）</a></p>
</section>`;
  write(
    "index.html",
    layout({
      title: "國際公法法源速查",
      desc: "以白話與情境整理國際公法法源，目前收錄維也納條約法公約重點條文與相關國際法院判例。",
      depth: 0,
      body,
      scripts: `<script src="search-data.js"></script><script src="search.js"></script>`,
    })
  );
}

// 公約頁
{
  const rows = [
    ["中文名稱", vclt.title],
    ["英文名稱", vclt.en],
    ["簡稱", vclt.abbr],
    ["通過", vclt.adopted],
    ["生效", vclt.inForce],
    ["保存機關", vclt.depositary],
  ]
    .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`)
    .join("");
  const groups = topics
    .map((t) => {
      const list = articles.filter((a) => a.topic === t.id);
      return `<h3>${esc(t.title)}</h3>
<ul class="arts">${list
        .map((a) => `<li><a href="art-${a.no}.html"><span class="no">第${a.no}條</span> <strong>${esc(a.title)}</strong></a><br><span class="muted">${esc(a.oneLiner)}</span></li>`)
        .join("")}</ul>`;
    })
    .join("\n");
  const body = `
<nav class="crumb"><a href="../index.html">首頁</a> › 條約法</nav>
<h1>${esc(vclt.title)} <small>${esc(vclt.abbr)}</small></h1>
<p class="lead">${esc(vclt.intro)}</p>
<table class="meta">${rows}</table>
<h2>先看這幾點</h2>
<ul>${vclt.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
<h2>官方資料</h2>
<ul>${vclt.links.map((l) => `<li><a href="${esc(l.url)}" rel="noopener">${esc(l.label)}</a></li>`).join("")}</ul>
<h2>已收錄條文</h2>
${groups}`;
  write("vclt/index.html", layout({ title: `${vclt.title}｜國際公法法源速查`, desc: vclt.intro, depth: 1, body }));
}

// 條文頁
articles.forEach((a, i) => {
  const t = topicById.get(a.topic);
  const prev = articles[i - 1];
  const next = articles[i + 1];
  const rel = (a.related ?? []).map((n) => artByNo.get(n));
  const cs = (a.cases ?? []).map((id) => caseById.get(id));
  const body = `
<nav class="crumb"><a href="../index.html">首頁</a> › <a href="index.html">條約法</a> › ${esc(t.title)}</nav>
<article>
  <p class="eyebrow">${esc(vclt.abbr)} ${esc(a.label)}</p>
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

  ${rel.length ? `<h2>相關條文</h2><p class="chips">${rel.map((r) => `<a class="chip" href="art-${r.no}.html">第${r.no}條 ${esc(r.title)}</a>`).join("")}</p>` : ""}

  ${cs.length ? `<h2>相關判例</h2><ul>${cs.map((c) => `<li><a href="../cases/${c.id}.html">${esc(c.short)}</a> <span class="muted">（${esc(c.court)}，${c.year}）</span></li>`).join("")}</ul>` : ""}

  ${quiz.some((q) => q.answer === a.no) ? `<h2>練習</h2><p><a href="../quiz/index.html?article=${a.no}">做「第${a.no}條」的情境題（${quiz.filter((q) => q.answer === a.no).length} 題）→</a></p>` : ""}

  <h2>查官方全文</h2>
  <ul>${vclt.links.map((l) => `<li><a href="${esc(l.url)}" rel="noopener">${esc(l.label)}</a></li>`).join("")}</ul>
</article>
<nav class="pager">
  ${prev ? `<a href="art-${prev.no}.html">← 第${prev.no}條 ${esc(prev.title)}</a>` : "<span></span>"}
  ${next ? `<a href="art-${next.no}.html">第${next.no}條 ${esc(next.title)} →</a>` : "<span></span>"}
</nav>`;
  write(`vclt/art-${a.no}.html`, layout({ title: `${vclt.abbr} ${a.label} ${a.title}｜國際公法法源速查`, desc: a.oneLiner, depth: 1, body }));
});

// 判例頁
{
  const list = cases
    .slice()
    .sort((x, y) => x.year - y.year)
    .map(
      (c) => `<li><a href="${c.id}.html"><strong>${esc(c.short)}</strong></a> <span class="muted">${esc(c.court)}，${c.year}</span><br><span class="muted">${esc(c.lesson)}</span></li>`
    )
    .join("");
  write(
    "cases/index.html",
    layout({
      title: "判例｜國際公法法源速查",
      desc: "與條約法相關的國際法院判例整理。",
      depth: 1,
      body: `<nav class="crumb"><a href="../index.html">首頁</a> › 判例</nav><h1>判例</h1><p class="lead">與條約法條文相關的國際法院案例，用來看規則在真實爭端中怎麼被適用。</p><ul class="arts">${list}</ul>`,
    })
  );
  for (const c of cases) {
    const arts = (c.articles ?? []).map((n) => artByNo.get(n));
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
  <p class="chips">${arts.map((a) => `<a class="chip" href="../vclt/art-${a.no}.html">第${a.no}條 ${esc(a.title)}</a>`).join("")}</p>
  <p class="note">案情與判旨為教學用摘要，引用請以判決原文為準（國際法院網站：<a href="https://www.icj-cij.org/cases" rel="noopener">icj-cij.org/cases</a>）。</p>
</article>`;
    write(`cases/${c.id}.html`, layout({ title: `${c.short}｜國際公法法源速查`, desc: c.lesson, depth: 1, body }));
  }
}

// 練習頁
{
  const artMap = Object.fromEntries(articles.map((a) => [a.no, { title: a.title, url: `../vclt/art-${a.no}.html`, topic: a.topic }]));
  const qdata = quiz.map((q) => ({ ...q, topic: artByNo.get(q.answer).topic }));
  const payload = { questions: qdata, articles: artMap, topics: topics.map((t) => ({ id: t.id, title: t.title })) };
  fs.writeFileSync(path.join(DIST, "quiz-data.js"), "window.QUIZ_DATA=" + JSON.stringify(payload) + ";");
  const body = `
<nav class="crumb"><a href="../index.html">首頁</a> › 練習</nav>
<h1>情境練習</h1>
<p class="lead">每題一個小情境，選出最適用的條文。答完會告訴你為什麼對、為什麼其他選項不對。</p>
<div id="quiz-setup" class="quiz-setup">
  <label>範圍
    <select id="quiz-topic"><option value="all">全部主題</option>${topics.map((t) => `<option value="${t.id}">${esc(t.title)}</option>`).join("")}</select>
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
    layout({ title: "情境練習｜國際公法法源速查", desc: "用小情境練習判斷該援引哪一條條約法規則。", depth: 1, body, scripts: `<script src="../quiz-data.js"></script><script src="../quiz.js"></script>` })
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
<p>所有內容都是 <code>data/</code> 底下的 JSON 檔：條文在 <code>data/vclt/</code>，判例在 <code>data/cases/cases.json</code>。新增一筆資料後執行 <code>npm run build</code>，建置程式會檢查「相關條文」與「相關判例」有沒有指到不存在的項目。</p>`,
  })
);

console.log(`完成：${articles.length} 條條文、${cases.length} 個判例 → dist/`);
