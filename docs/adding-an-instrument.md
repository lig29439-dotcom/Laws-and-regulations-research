# 新增一個法源（例如《聯合國海洋法公約》）

網站以「法源（instrument）」為單位。新增法源**不需要改程式**，只要新增資料並執行 `npm run build`。
建置程式（`scripts/build.mjs`）會檢查所有欄位與交叉連結，有錯就讓建置失敗並列出原因。

## 1. 新增資料夾

```
data/instruments/<id>/
  instrument.json     法源基本資料
  topics.json         主題分類（決定首頁「階段」與條文頁麵包屑）
  articles/*.json     條文，每個檔案是一個陣列，可分多個檔案（檔名依序排）
```

`<id>` 用小寫英數，例如 `unclos`。它會成為網址：`<id>/index.html`、`<id>/art-<條號>.html`。
資料夾名稱必須等於 `instrument.json` 的 `id`。

### instrument.json

| 欄位 | 必填 | 說明 |
|---|---|---|
| `id` | 是 | 同資料夾名 |
| `abbr` | 是 | 簡稱，例如 `UNCLOS` |
| `title` | 是 | 中文名稱 |
| `en` | 是 | 英文名稱 |
| `intro` | 是 | 一段導讀 |
| `order` | 否 | 首頁排序，數字小的在前（VCLT 是 1） |
| `adopted` / `inForce` / `depositary` | 否 | 顯示在法源頁的基本資料 |
| `status` | 否 | 例如「收錄中」，顯示在首頁卡片 |
| `links` | 否 | `[{label, url}]` 官方資料連結（會出現在每個條文頁底部） |
| `notes` | 否 | 字串陣列，法源頁的「先看這幾點」 |

### topics.json

陣列，每筆：`{ "id", "order", "title", "stage", "blurb" }`。`order` 決定顯示順序。

### 條文（articles/*.json）

每筆：

```json
{
  "no": "121",
  "title": "島嶼制度",
  "en": "Regime of islands",
  "topic": "<topics.json 的 id>",
  "oneLiner": "一句話重點",
  "explain": ["白話說明（每個字串一段）"],
  "why": "為什麼這樣規定",
  "scenario": "小情境（用虛構的甲國、乙國；\n可分段）",
  "pitfalls": ["容易搞混的地方"],
  "related": ["122", "vclt:26"],
  "cases": ["<cases.json 的 id>"],
  "keywords": ["搜尋用關鍵字（中英文、縮寫）"],
  "custom": "（選填）習慣法地位說明",
  "label": "（選填）頁面標題用的完整標示，例如「第2條第1項(a)款」",
  "numLabel": "（選填）非「第N條」格式時，例如附件：「附件六第1條」",
  "order": 0
}
```

- `no` 是字串。可以是 `"121"`，也可以是 `"A6-1"` 這類非純數字（網址會把非英數字元換成 `-`）。
- 排序：先依主題 `order`，再依 `order` 欄位（沒有就用 `no` 的數字），最後比對字串。
- `related`：`"122"` 指同一法源；`"vclt:26"` 指其他法源的條文。
- `scenario` 內的換行會變成段落。
- 不要貼條約全文：只做索引加導讀，官方全文用 `links` 連出去。

## 2. 判例（選填）

在 `data/cases/cases.json` 新增，每筆必須有 `"instrument": "<id>"`，其 `articles` 是該法源的條號
（`"121"`，或跨法源 `"vclt:31"`）。欄位：`id, instrument, short, en, court, year, cite, articles, facts, holding, lesson`。
條文要連到判例，就在條文的 `cases` 放判例 `id`。

## 3. 練習題（選填）

在 `data/quiz/questions.json` 新增，每筆必須有 `"instrument": "<id>"`：

```json
{
  "id": "q47", "instrument": "unclos",
  "scenario": "情境", "answer": "121",
  "options": ["121", "122", "60", "vclt:26"],
  "explain": "為什麼答案對",
  "notes": { "122": "為什麼這個選項不對", "60": "…", "vclt:26": "…" }
}
```

每個**非答案**選項都必須有 `notes`，否則建置失敗。選項以條號表示，前端會自動顯示「第N條 標題」。

## 4. 驗證與預覽

```
npm run build        # 檢查資料並輸出 dist/
npm run serve        # 本機預覽 http://localhost:8080
```

推送到分支後，GitHub Actions 會自動部署（見 `.github/workflows/pages.yml`）。

## 寫作準則

- 學生為對象、中文為主。每條都要有「白話說明」「為什麼這樣規定」「一個簡單情境」。
- 情境用虛構國家（甲國、乙國…），不要影射現實事件。
- 條文內容必須忠於官方文本；寫完請對照官方全文抽查，不確定的地方不要寫。
- 判例的案名、年份、出處（cite）要正確；拿不準就不要收。
