(function () {
  var data = window.SEARCH_DATA || [];
  var input = document.getElementById("q");
  var out = document.getElementById("results");
  var browse = document.getElementById("browse");
  if (!input || !out) return;

  function norm(s) {
    return String(s).toLowerCase().replace(/[第條条]/g, " ").replace(/\s+/g, " ").trim();
  }

  function search(raw) {
    var q = norm(raw);
    if (!q) return [];
    var terms = q.split(" ");
    var hits = [];
    data.forEach(function (d) {
      var score = 0;
      var ok = terms.every(function (t) {
        if (/^\d+$/.test(t)) {
          // 純數字：條號必須完全相同；判例則比對年份
          if (d.k === "art") { if (d.no === t) { score += 100; return true; } return false; }
          if (d.hay.indexOf(t) !== -1) { score += 5; return true; }
          return false;
        }
        var i = d.hay.indexOf(t);
        if (i === -1) return false;
        score += d.title.toLowerCase().indexOf(t) !== -1 ? 20 : 5;
        return true;
      });
      if (ok) hits.push({ d: d, s: score });
    });
    hits.sort(function (a, b) { return b.s - a.s; });
    return hits.map(function (h) { return h.d; });
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function render() {
    var raw = input.value;
    var hits = search(raw);
    if (!raw.trim()) {
      out.innerHTML = "";
      if (browse) browse.hidden = false;
      return;
    }
    if (browse) browse.hidden = true;
    if (!hits.length) {
      out.innerHTML = '<p class="muted">找不到符合的內容。可以試試條號（例如 26）、中文關鍵字或英文名稱。</p>';
      return;
    }
    out.innerHTML =
      '<ul class="arts">' +
      hits.map(function (d) {
        return '<li><a href="' + d.url + '"><strong>' + esc(d.title) + '</strong></a> ' +
          '<span class="tag">' + (d.k === "art" ? esc(d.abbr) + " 條文" : "判例") + '</span>' +
          '<br><span class="muted">' + esc(d.sub) + "｜" + esc(d.line) + "</span></li>";
      }).join("") + "</ul>";
  }

  document.getElementById("searchForm").addEventListener("submit", function (e) { e.preventDefault(); });
  input.addEventListener("input", function () {
    render();
    try { history.replaceState(null, "", input.value ? "?q=" + encodeURIComponent(input.value) : location.pathname); } catch (e) {}
  });

  var init = new URLSearchParams(location.search).get("q");
  if (init) { input.value = init; render(); }
})();
