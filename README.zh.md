# dsh-session-search · 回忆 Recall

[English](README.md) | 中文

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 加一个左侧栏「**回忆**」入口 + 一个搜索页：**标题模糊匹配** + **消息正文全文检索**，**已归档会话也能搜到**；点结果即可**继续那次对话**（归档会话会先自动取消归档）。

```
搜索框  [ 归档 插件 ]                范围: [全部|标题|内容]   [x] 含归档
──────────────────────────────────────────────────────────────────────────
会话搜索 · 12 个会话 · 标题命中 5 个 · 内容命中 8 个 · 34 毫秒
┌────────────────────────────────────────────────────────────────────────┐
│ DSH归档清理 插件开发        [已归档] [标题+内容]      [取消归档并打开] [⧉] │
│ 3 天前 · default-workspace · session-a1abc6e5-81…                      │
│ …把归档标记从 workspace.json 的 archivedSessionIds 里摘掉，再重建搜索索引… │
└────────────────────────────────────────────────────────────────────────┘
```

## 它做什么

| 位置 | 行为 |
|---|---|
| 侧栏面板图标「回忆」（`sidebar.panellist`，order 12） | 打开主面板搜索页（`main` slot，key `session-search`） |
| 搜索框 | 输入即搜（240ms 防抖），Enter 立即搜，Esc 清空；最长 200 字符 |
| 范围 | `全部`（标题+内容）/ `标题`（仅本地模糊匹配，零延迟）/ `内容`（仅全文检索） |
| `含归档` | 默认开；关掉后已归档会话从结果里消失 |
| 结果行 | 标题（命中片段 `<mark>` 高亮）+ `已归档` / `进行中` / 命中类型标签 + 相对时间 + 工作区名 + 会话 ID 前缀 + 正文摘要 |
| 结果行动作 | `打开`（归档行写成 `取消归档并打开`）→ 切到该会话并**继续对话**；`⧉` 复制会话 ID |
| 降级提示 | 正文检索不可用时，页脚明确说明"只显示标题匹配"并给出原因，而不是静默空结果 |

## 数据来源（全部走 DSH 已认证通道）

| 需要什么 | 从哪来 |
|---|---|
| 会话清单（含标题、cwd、创建时间、运行状态） | 插槽标准 prop `useSessions` —— 侧栏用的同一份实时目录 |
| 归档集合 / 工作区归属 | 插槽标准 prop `useWorkspaces` → `archivedSessionIds`、`items[].sessionIds` |
| 消息正文检索（排序 + 摘要） | `ctx.sessions.search(query, signal)`，即原版侧栏搜索框用的同一个远端（`sessionQuery.searchSessions`） |
| 打开 / 继续会话 | `ctx.uiWorkspace.openSession(id)` |
| 取消归档 | `ctx.workspaces.unarchiveSession(id)` |

**为什么不自己开 HTTP 路由**：桌面 GUI 走的是 `dsh-app://` 私有协议 + Host/Origin 围栏与浏览器会话 cookie，插件自建的 `webServer` 路由从页面发请求拿不到该凭据，会被 `connection.requestRejection` 挡掉（表现为"搜索不出东西"）。改用上面这些原生通道后，既没有鉴权问题，也不依赖未公开的协议。

## 标题模糊匹配的档次

同一个归一化（忽略大小写、空白、标点）下，从高到低：

1. 归一化后完全相等 —— `dsh最佳实践` = `DSH 最佳实践`
2. 前缀命中
3. 多词全部包含
4. 连续子串（越靠前分越高）
5. **有序子序列**（字符按顺序出现即可，允许中间缺字）—— 打错字/漏字也能命中
6. 单词包含
7. 工作区名命中（比标题低一档，排在所有标题命中之后）

## 正文检索为什么可用

出厂组合里 `session-query-sqlite` 这一行是 `path: ':memory:'`、`openAt: never`（内容检索关闭）。本插件的 `cordis.patch.yml` 用**后置补丁层覆盖该行**：

```yaml
- id: session-query-sqlite
  name: '@deepseek-ai/dsh-session-query-sqlite'
  config:
    path: ':memory:'
    openAt: first-search
```

这是 `dsh-base` 补丁注释里写明的开启方式：索引在**首次搜索时惰性建立**（进程内内存索引，不落盘），所以第一次内容检索会慢一点（页面上会显示"正在建立内容索引"），之后就是毫秒级。副作用是原版侧栏搜索框也一起变成可用的——它之前同样受这一行影响。

若该覆盖在将来版本失效，插件不会坏：远端返回错误时，页面自动退化为**仅标题匹配**并显示原因；标题匹配是本地的，永远可用。

## 已知限制

- 正文检索每次最多返回 **20 个会话**（`api-session-controller` 的硬上限），页面会提示这一点；标题匹配不受此限。
- 正文检索覆盖**当前可用的模型可见消息**（compaction 折叠掉的旧条目不在 FTS 结果里）。
- FTS 分词器为 `unicode61`：不做任意子串匹配，但中文按字切词后短语检索正常。
- 空的新会话草稿（`blank`）不参与搜索。
- 归档会话按产品策略不能直接打开：面板按钮会写成「取消归档并打开」，先取消归档再打开，之后可继续对话。

## 安装

本插件是一个普通 Harness bundle：客户端半边（`client.js`）注册侧栏图标与主面板页面；Host 半边（`index.js`）只是一个占位入口，让这个包被 `clientModules` 扫描到——功能本身都在浏览器里。`cordis.patch.yml` 负责组合。

仓库名是 `dsh-session-search`，包名是 **`dsh-session-recall`**（界面上这个插件叫「回忆 / Recall」）。两者指的是同一个插件；Harness 的插件行一律使用包名。

直接从本仓库安装：

```powershell
dsh plugin --profile desktop add "github:guo-chsh/dsh-session-search"
```

或者在本地检出目录上安装：

```jsonc
// profile 的 package.json
"dsh-session-recall": "link:C:/path/to/dsh-session-search"
```

然后在插件页启用 `dsh-session-recall`（或用 `plugin_manager` 的 `set_bundle`）。bundle 第一次出现需要重启 Host；之后客户端改动刷新页面（Ctrl+R）即可生效。

## 文件

| 文件 | 作用 |
|---|---|
| `client.js` | 整个界面：字典、目录、模糊匹配、搜索页、图标、插槽注册 |
| `index.js` | Host 入口——有注释的占位实现，只让这个包成为被扫描的 Loader 条目 |
| `cordis.patch.yml` | 打开惰性全文检索，并插入 `session-search` 行 |
| `locale/en.json`、`locale/zh.json` | 插件页的元数据 |
| `icon.svg` | 插件页图标 |
| `.github/workflows/verify.yml` | CI：解析两半代码、校验元数据与 manifest/补丁契约 |

## 许可

MIT
