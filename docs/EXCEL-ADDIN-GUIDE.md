# Excel Add-in — Smart-View-style integration for CFO Pilot

**Status:** Design + build guide. No code shipped yet.
**Goal:** Excel users connect to CFO Pilot, drop a POV into a sheet, pull live facts, edit them, submit back, drill from any cell.

---

## 1. What you're really building (vs the Oracle Smart View you remember)

| Old Smart View (Hyperion/Oracle) | What we'd build for CFO Pilot |
|---|---|
| COM / VSTO Windows-only add-in | **Office Web Add-in** — JavaScript, runs in Excel on Win/Mac/web |
| Custom shape-private API | Microsoft Office.js + Web API (HTTPS to your backend) |
| Distributed via MSI installer | Sideload (instant) or AppSource Marketplace (Microsoft-reviewed) |
| Smart View ribbon | Taskpane (right-side panel) + ribbon button group |

**Architecturally an Excel Web Add-in is just:** a manifest.xml + a static web page hosted at HTTPS. Office loads that page in a sandboxed iframe inside Excel and gives the page access to Office.js (read/write cells, get selection, run on workbook events).

So you don't ship an .exe. You ship a manifest + a URL.

---

## 2. The four files that make it work

```
office-addin/
├── manifest.xml          ← the Office add-in manifest (XML)
├── taskpane.html         ← the panel UI
├── taskpane.js           ← Office.js + fetch CFO Pilot APIs
└── commands.html         ← ribbon button command handlers
```

Plus those files are hosted at HTTPS — e.g. `https://metadata-module.vercel.app/excel-addin/taskpane.html`.

`manifest.xml` tells Excel:
- "Show a ribbon button called Connect to CFO Pilot"
- "When clicked, open this URL in a taskpane"
- "When this command fires, run this JS function"

---

## 3. The user flow we're targeting

1. User opens Excel → clicks **Insert → My Add-ins → CFO Pilot**.
2. Taskpane slides in. **Login** button → opens OAuth popup → hits `/api/auth/login` on metadata-module.vercel.app → user signs in with usual creds.
3. User picks a POV via UnifiedPovPicker (we reuse the React component or rebuild it leaner).
4. **"Pull POV into sheet"** → cells A1:G15 populate with Account × Time grid for current POV. Each cell is tagged via Excel custom XML with `{scenarioId, timeId, entityId, accountId}`.
5. User edits a cell value.
6. **"Submit edits"** → reads the cell's custom XML tag, POSTs to `/api/v2/facts` with the new value + intersection. Fact row written with origin=Form, prior version marked `isCurrent=false`.
7. **Right-click any cell → "Drill into source"** → opens a popup at `/api/v2/facts/by-intersection` for the cell's tagged intersection. Or "Open lineage" → fetch `/api/v2/lineage/fact` + render in the taskpane.
8. **"Refresh"** → re-fetches all cells from the API and rewrites values.

---

## 4. The hard parts (and how to handle them)

### Auth from inside Excel
- Office.js has `OfficeRuntime.auth.getAccessToken()` for SSO, but it ties you to Microsoft Identity.
- Simpler for V1: open a popup to `https://metadata-module.vercel.app/login?return=...&channel=excel-addin`. The login page closes itself + writes a cookie. The add-in then `fetch(..., { credentials: 'include' })` works.
- Note: cookies in the taskpane iframe are subject to third-party cookie blocks. Best to host the add-in's HTML on the same origin as the API (i.e. `metadata-module.vercel.app/excel-addin/...`) so cookies are first-party.

### Tagging cells with intersection metadata
Excel doesn't give cells a free metadata bag. Two options:
- **Custom XML Parts** — store a single XML doc per workbook listing every tagged cell: `<cell ref="Sheet1!B2" scenarioId="..." accountId="..."/>`. Persisted with the workbook.
- **Workbook.settings** or **named ranges** — simpler but limited.
For V1, Custom XML Parts is the right call.

### Refresh performance
A single API call returning the whole pivot is faster than N calls per cell. Reuse `/api/v2/analyze/pivot` — it returns the grid in one shot. Map the result onto the sheet range in O(rows × cols).

### Drill from a cell
Office.js gives you the selected range's address. Read the cell's tag from the Custom XML Part. Open a sub-pane with the lineage / fact-rows API.

### Multiple workbooks open
Each workbook is sandboxed; the add-in instance is per-document. Your auth cookie is shared across instances (good).

---

## 5. What to build, in build order

### Phase A — Smoke (1 day)
- Office Add-in scaffold via Yeoman (`npm install -g yo generator-office`; `yo office`).
- Pick "Excel" + "TypeScript" + "Office Add-in Task Pane project".
- Replace the boilerplate with one button: **"Connect"** → calls `fetch('https://metadata-module.vercel.app/api/v2/tenant', { credentials: 'include' })` and shows tenant name.
- Sideload locally: `npm start` opens Excel with the add-in loaded from `https://localhost:3000`. Confirm cookies + CORS work.

### Phase B — POV picker + Pull (3 days)
- Port (or rewrite small) `<UnifiedPovPicker>` for the taskpane.
- On "Pull" click → call `/api/v2/analyze/pivot` with chosen POV → write the result into sheet at the current selection's top-left cell.
- Add Custom XML Part tagging — store `{cellRef, intersection}` per data cell.

### Phase C — Submit + Drill (3 days)
- "Submit" — find all cells tagged in Custom XML, diff against last-pulled values, POST changes to `/api/v2/facts`.
- "Drill" — show a sub-panel with `/api/v2/facts/by-intersection` for the active cell's tag.
- "Lineage" — same pattern, hitting `/api/v2/lineage/fact`.

### Phase D — Refresh metadata (2 days)
- "Refresh dimensions" button — re-pulls the dim member list so a new account added in CFO Pilot shows up in POV picker without restarting.
- Background watch: optional, fire `/api/v2/audit?from=<lastChecked>` every 30s; if anything changed, badge the Refresh button red.

### Phase E — Distribution (3 days)
- Move the static add-in files to `cfo-pilot-metadata/public/excel-addin/` so they're served from the prod URL.
- Sign manifest with a real cert (CodeSignTool, free for community add-ins).
- For internal-only: distribute manifest.xml via Microsoft 365 Admin Center → Integrated Apps → Upload custom app.
- For public: submit to AppSource — 2–4 week Microsoft review.

**Total: ~12 days of focused work for sideload-ready. AppSource adds 2–4 weeks of review on top.**

---

## 6. Repo layout (proposed)

```
faizan-app-studio/
└── cfo-pilot-metadata/                    ← existing Next.js app
    ├── public/excel-addin/                ← NEW — static add-in files
    │   ├── manifest.xml                   
    │   ├── taskpane.html                  
    │   ├── taskpane.js                    
    │   ├── commands.html                  
    │   └── assets/icon-*.png              
    └── office-addin-dev/                  ← NEW — Vite + Office.js dev env
        ├── src/
        │   ├── taskpane.tsx               ← React + Office.js
        │   ├── pivot.ts                   ← cell ↔ Custom XML mapping
        │   └── auth.ts                    ← popup-flow handler
        ├── package.json
        └── vite.config.ts
```

The dev env (`office-addin-dev/`) builds with Vite and outputs to `public/excel-addin/`. Excel loads from `public/excel-addin/` in production (served by the same Next.js deploy).

---

## 7. Manifest.xml — the minimum that works

```xml
<?xml version="1.0" encoding="UTF-8"?>
<OfficeApp xmlns="http://schemas.microsoft.com/office/appforoffice/1.1"
           xsi:type="TaskPaneApp">
  <Id>2f8d5b1c-cfo-pilot-excel-001</Id>
  <Version>1.0.0.0</Version>
  <ProviderName>CFO Pilot</ProviderName>
  <DefaultLocale>en-US</DefaultLocale>
  <DisplayName DefaultValue="CFO Pilot"/>
  <Description DefaultValue="Live POV pull, edit, submit, drill from Excel"/>
  <IconUrl DefaultValue="https://metadata-module.vercel.app/excel-addin/assets/icon-32.png"/>
  <SupportUrl DefaultValue="https://metadata-module.vercel.app/support"/>
  <AppDomains>
    <AppDomain>metadata-module.vercel.app</AppDomain>
  </AppDomains>
  <Hosts>
    <Host Name="Workbook"/>
  </Hosts>
  <DefaultSettings>
    <SourceLocation DefaultValue="https://metadata-module.vercel.app/excel-addin/taskpane.html"/>
  </DefaultSettings>
  <Permissions>ReadWriteDocument</Permissions>
</OfficeApp>
```

That's it. Drop it in `public/excel-addin/manifest.xml`, upload via Microsoft 365 admin or sideload during dev.

---

## 8. What I can do for you today

If you want me to start, here are the safe, decision-free first steps:

1. **Scaffold `office-addin-dev/` with Vite + Office.js + TypeScript** — runs `npm start`, opens Excel sideloaded against localhost. Just the "Connect" button shows tenant name. ~1 day of work, 0 risk to production.
2. **Add `public/excel-addin/` with manifest.xml stub** pointing at production URL. Won't function until taskpane.html exists, but it's the file that goes to admins / AppSource.
3. **Add `/api/auth/excel-channel` endpoint** that issues the cookie via a popup-friendly flow. Doesn't touch existing auth.

Say "scaffold the Excel add-in" and I'll queue 1 + 2 + 3 as a single Wk4 sprint.

---

## 9. Open decisions you'll need to make later

- **Identity** — stick with cookie SSO (popup login)? Or wire Microsoft Identity (Office SSO + AAD app registration)? Cookie SSO is simpler; MS Identity needed if you want enterprise IT to provision via AAD.
- **AppSource distribution** — yes/no. Adds 2–4 weeks Microsoft review + a marketing listing. Sideload is fine for internal use.
- **Pricing** — is the add-in part of every tier or only Enterprise/FullOS? Standard EPM convention is "Excel = Enterprise feature."
- **Offline mode** — Smart View used to support offline edits → submit when back online. We can either ship online-only (simpler) or add a "queued edits" log per workbook (real work).

---

End — EXCEL-ADDIN-GUIDE.md
