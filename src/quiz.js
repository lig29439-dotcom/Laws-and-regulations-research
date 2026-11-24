(function () {
  var D = window.QUIZ_DATA;
  var box = document.getElementById("quiz-box");
  var setup = document.getElementById("quiz-setup");
  var topicSel = document.getElementById("quiz-topic");
  var countSel = document.getElementById("quiz-count");
  var note = document.getElementById("quiz-filter-note");
  if (!D || !box) return;

  var state = null;
  var params = new URLSearchParams(location.search);
  var articleFilter = params.get("article") ? (params.get("i") || "") + ":" + params.get("article") : null;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function label(key) {
    var a = D.articles[key];
    return (D.multi ? a.abbr + " " : "") + a.lab + "　" + a.title;
  }

  function pool() {
    var qs = D.questions;
    if (articleFilter) return qs.filter(function (q) { return q.answer === articleFilter; });
    var t = topicSel.value;
    if (t === "all") return qs;
    var parts = t.split(":");
    if (parts[1] === "*") return qs.filter(function (q) { return q.inst === parts[0]; });
    return qs.filter(function (q) { return q.topic === t; });
  }

  function start(questions) {
    state = { qs: questions, i: 0, right: 0, wrong: [] };
    setup.hidden = true;
    renderQuestion();
  }

  function renderQuestion() {
    var q = state.qs[state.i];
    var opts = shuffle(q.options);
    box.innerHTML =
      '<p class="muted">第 ' + (state.i + 1) + " / " + state.qs.length + " 題</p>" +
      '<aside class="scenario"><h2>情境</h2><p>' + esc(q.scenario) + "</p></aside>" +
      "<p><strong>最適用的條文是？</strong></p>" +
      '<div class="opts">' +
      opts.map(function (o) {
        return '<button class="opt" data-no="' + o + '">' + esc(label(o)) + "</button>";
      }).join("") +
      '</div><div id="feedback"></div>';
    Array.prototype.forEach.call(box.querySelectorAll(".opt"), function (b) {
      b.addEventListener("click", function () { answer(q, b.getAttribute("data-no")); });
    });
  }

  function answer(q, picked) {
    var ok = picked === q.answer;
    if (ok) state.right++; else state.wrong.push(q);
    Array.prototype.forEach.call(box.querySelectorAll(".opt"), function (b) {
      var no = b.getAttribute("data-no");
      b.disabled = true;
      if (no === q.answer) b.classList.add("right");
      else if (no === picked) b.classList.add("wrong");
    });
    var other = picked !== q.answer ? "<p>你選的" + esc(D.articles[picked].lab) + "：" + esc(q.notes[picked]) + "</p>" : "";
    var last = state.i === state.qs.length - 1;
    document.getElementById("feedback").innerHTML =
      '<div class="note ' + (ok ? "ok" : "bad") + '"><p><strong>' + (ok ? "答對了！" : "答錯了。") +
      "正確答案：" + esc(label(q.answer)) + "</strong></p><p>" + esc(q.explain) + "</p>" + other +
      '<p><a href="' + D.articles[q.answer].url + '">查看' + esc(D.articles[q.answer].lab) + "完整說明 →</a></p></div>" +
      '<p><button class="btn" id="next">' + (last ? "看結果" : "下一題") + "</button></p>";
    var next = document.getElementById("next");
    next.addEventListener("click", function () {
      if (last) renderResult(); else { state.i++; renderQuestion(); }
    });
    next.focus();
  }

  function renderResult() {
    var n = state.qs.length;
    var html = '<h2>結果：' + state.right + " / " + n + "</h2>";
    if (state.wrong.length) {
      html += "<p>答錯的題目，建議回頭複習這些條文：</p><ul>" +
        state.wrong.map(function (q) {
          return '<li><a href="' + D.articles[q.answer].url + '">' + esc(label(q.answer)) + "</a></li>";
        }).join("") + "</ul>" +
        '<p><button class="btn" id="retry">只重做答錯的題目</button> ';
    } else {
      html += "<p>全部答對！可以換一個主題再挑戰。</p><p>";
    }
    html += '<button class="btn alt" id="again">回到選單</button></p>';
    box.innerHTML = html;
    var retry = document.getElementById("retry");
    if (retry) retry.addEventListener("click", function () { start(shuffle(state.wrong)); });
    document.getElementById("again").addEventListener("click", function () {
      articleFilter = null;
      history.replaceState(null, "", location.pathname);
      box.innerHTML = "";
      setup.hidden = false;
      note.hidden = true;
    });
  }

  document.getElementById("quiz-start").addEventListener("click", function () {
    var p = shuffle(pool());
    var c = countSel.value;
    if (c !== "all") p = p.slice(0, Number(c));
    if (!p.length) { box.innerHTML = "<p class=\"muted\">這個範圍還沒有題目。</p>"; return; }
    start(p);
  });

  if (articleFilter && D.articles[articleFilter]) {
    var p = pool();
    if (p.length) {
      note.hidden = false;
      note.textContent = "目前只出「" + label(articleFilter) + "」的題目（" + p.length + " 題）。";
      start(shuffle(p));
    }
  }
})();
