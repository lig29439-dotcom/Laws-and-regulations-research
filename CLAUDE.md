# 國際公法法源速查

給學生用的國際公法法源查詢網站：中文為主、白話說明、每條附「為什麼這樣規定」與小情境、附相關判例與情境練習題。
靜態網站，無外部依賴，Node 18+。

## 指令
- `npm run build`：讀 `data/`、檢查、輸出 `dist/`
- `npm run serve`：建置後在 http://localhost:8080 預覽

## 結構
- `data/instruments/<id>/`：每個法源一個資料夾（`instrument.json`、`topics.json`、`articles/*.json`）。目前有 `vclt`（維也納條約法公約，85 條已全部收錄，第 2 條只收(a)款）。
- `data/cases/cases.json`：判例（每筆有 `instrument` 欄位）
- `data/quiz/questions.json`：練習題（每筆有 `instrument` 欄位）
- `scripts/build.mjs`：建置與資料檢查；`src/`：CSS 與前端 JS
- `.github/workflows/pages.yml`：推送後自動部署到 GitHub Pages

## 新增法源
照 `docs/adding-an-instrument.md` 做，**不需要改 `scripts/build.mjs`**。已用暫時的第二個法源驗證過（搜尋、跨法源連結、練習、非純數字條號）。

## 約定
- 網址穩定：`<id>/index.html`、`<id>/art-<條號>.html`、`cases/<id>.html`；不要改既有網址。
- 只做索引加導讀，不轉載條約全文，用 `links` 連到官方來源。
- 所有內容為依知識整理、尚未經人工審閱；頁尾已標示「教學整理，非官方文本」。新增內容要忠於官方文本，拿不準的不要寫。
- 情境一律用虛構國家。
- 不要自行建立 PR 或推送到其他分支，除非使用者要求。
