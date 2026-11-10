# dsh-session-search

English | [中文](README.zh.md)

A left-sidebar **Session search** entry for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), plus the search page it opens: **fuzzy title matching** and **full-text message search** over every past session, **archived sessions included**. A click reopens that session and continues the same conversation — an archived hit is unarchived first.

```
Search  [ archived plugin ]     Scope: [All|Title|Content]   [x] Include archived
──────────────────────────────────────────────────────────────────────────────
Session search · 12 sessions · 5 title hits · 8 content hits · 34 ms
┌────────────────────────────────────────────────────────────────────────────┐
│ Cleaning up archived sessions   [archived] [title+content]  [Unarchive & open] [⧉] │
│ 3 days ago · default-workspace · session-a1abc6e5-81…                      │
│ …drop the id from archivedSessionIds in workspace.json, then rebuild the index… │
└────────────────────────────────────────────────────────────────────────────┘
```

## What it does

| Piece | Behaviour |
|---|---|
| Sidebar icon **Session search** (`sidebar.panellist`, order 12) | Opens the search page in the main panel (`main` slot, key `session-search`) |
| Search box | Searches as you type (240 ms debounce), Enter searches immediately, Esc clears; at most 200 characters |
| Scope | `All` (title + content) · `Title` (local fuzzy match, zero latency) · `Content` (full-text only) |
| `Include archived` | On by default; turning it off removes archived sessions from the results |
| Result row | Title with the matched fragment wrapped in `<mark>`, plus `archived` / `running` / match-kind badges, a relative time, the workspace name, the session-id prefix, and a message excerpt |
| Row actions | **Open** (or **Unarchive & open** on an archived row) switches to that session and continues the conversation; `⧉` copies the session id |
| Degradation | When full-text search is unavailable the footer says so — "title matches only" plus the reason — instead of returning a silent empty list |

## Where the data comes from

Everything goes through channels DSH already authenticates; the plugin adds no HTTP route.

| Needs | Source |
|---|---|
| Session catalog (title, cwd, created-at, running state) | the slot's standard `useSessions` prop — the same live catalog the sidebar renders |
| Archived set / workspace membership | the slot's standard `useWorkspaces` prop → `archivedSessionIds`, `items[].sessionIds` |
| Message full-text search (ranked, with excerpts) | `ctx.sessions.search(query, signal)` — the same remote the shipped sidebar search box uses (`sessionQuery.searchSessions`) |
| Open / continue a session | `ctx.uiWorkspace.openSession(id)` |
| Unarchive | `ctx.workspaces.unarchiveSession(id)` |

**Why no custom HTTP route.** The desktop GUI is served over the `dsh-app://` protocol behind a Host/Origin fence plus a browser session cookie. A plugin-registered `webServer` route cannot satisfy that fence from a page request: `connection.requestRejection` rejects it, which surfaces as "the panel finds nothing". The native channels above have neither the authentication problem nor a dependency on an unpublished protocol.

## Fuzzy title tiers

Under one normalization (case, whitespace and punctuation ignored), best first:

1. Equal after normalization — `dshbestpractices` = `DSH Best Practices`
2. Prefix match
3. Every query term contained
4. Contiguous substring (earlier position scores higher)
5. **Ordered subsequence** — the characters appear in order, gaps allowed, so a typo or a dropped character still matches
6. Single term contained
7. Workspace name match (one tier below titles, so it never outranks a title hit)

## Why full-text search works here

The shipped composition mounts `session-query-sqlite` with `path: ':memory:'` and `openAt: never`, i.e. content search is off. This bundle's `cordis.patch.yml` overrides that row in a later patch layer:

```yaml
- id: session-query-sqlite
  name: '@deepseek-ai/dsh-session-query-sqlite'
  config:
    path: ':memory:'
    openAt: first-search
```

`dsh-base` documents exactly this as the way to enable content search: the index is built **lazily on the first search** (in-process, memory only, never written to disk), so the first content query is slower — the page shows "building the content index" — and every later one is milliseconds. A side effect is that the shipped sidebar search box becomes usable too, since it is bound by the same row.

If a future release renames or removes that row, the plugin does not break: when the remote reports an error the page degrades to **title matching only** and states why. Title matching is local and always available.

## Known limits

- One content search returns at most **20 sessions** (`api-session-controller`'s hard cap); the page says so. Title matching is not capped.
- Content search covers **currently visible model-facing messages**: entries folded away by compaction are not in the FTS results.
- The FTS tokenizer is `unicode61`, so there is no arbitrary-substring matching; Chinese works because text is segmented per character.
- Blank new-session drafts (`blank`) do not participate in search.
- Product policy forbids opening an archived session directly, so that row's button reads **Unarchive & open**: unarchive, then open, then continue the conversation.

## Install

The plugin is a normal Harness bundle: a Client module (`client.js`) that registers the sidebar icon and the main-panel page, and a Host entry (`index.js`) that exists only so the package is scanned as a Loader entry — the feature itself lives in the browser. `cordis.patch.yml` arranges the composition.

Add it to a profile and enable the bundle:

```powershell
# profile package.json
"dsh-session-search": "link:C:/path/to/dsh-session-search"
```

or install it straight from this repository:

```powershell
dsh plugin --profile desktop add "github:guo-chsh/dsh-session-search"
```

then enable `dsh-session-search` in the Plugins page (or with `plugin_manager` `set_bundle`). A Host restart is needed the first time a bundle appears; afterwards a page refresh (Ctrl+R) is enough for client-side changes.

## Files

| File | Role |
|---|---|
| `client.js` | the whole UI: dictionaries, catalog, fuzzy matcher, search page, icon, slot registration |
| `index.js` | Host entry — a documented no-op that keeps the package a scanned Loader entry |
| `cordis.patch.yml` | enables lazy full-text search and inserts the `session-search` row |
| `locale/en.json`, `locale/zh.json` | Plugins-page catalog metadata |
| `icon.svg` | Plugins-page icon |
| `.github/workflows/verify.yml` | CI: parses both halves, validates metadata and the manifest/patch contract |

## License

MIT
