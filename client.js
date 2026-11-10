/**
 * Client half of `dsh-session-search`: the left-sidebar "Session search" entry
 * and the search page it opens in the main panel.
 *
 * Everything the page needs already flows through channels the shipped UI uses:
 *
 * - the Session catalog and the Workspace snapshot arrive as slot standard props
 *   (`useSessions`, `useWorkspaces`), so every past session — archived ones
 *   included — is present without any extra Host call;
 * - fuzzy title matching is local, over that catalog;
 * - message-content search is `ctx.sessions.search()`, the shipped authenticated
 *   remote (ranked full-text over every logical session, archived included);
 * - opening a hit is `ctx.uiWorkspace.openSession()`, with the shipped
 *   `unarchiveSession` first for archived hits, because DSH deliberately refuses
 *   to open an archived session without lifting the marker.
 *
 * The page keeps working with titles only when the deployment's content search is
 * unavailable, and says so instead of silently returning nothing.
 */
window.__ModuleLoader__.load({
  id: 'dsh-session-search',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Dictionary namespace owned by this plugin. */
    const NS = 'sessionSearch'
    /** Sidebar panel id; also the `main` slot key the page registers under. */
    const PANEL_ID = 'session-search'
    /** Typing pause before the content search fires; title matching is instant. */
    const DEBOUNCE_MS = 240
    /** Longest accepted query, matching the Host remote's own bound. */
    const MAX_QUERY_UNITS = 200
    /** Rows the page renders at most. */
    const RESULT_LIMIT = 40
    /** Content hits one remote call can return, and therefore its recall bound. */
    const CONTENT_HIT_LIMIT = 20

    const en = {
      panel: 'Recall',
      title: 'Recall',
      subtitle: 'Searches every past session by title and by message content, archived sessions included.',
      placeholder: 'Search titles and message content…',
      search: 'Search',
      clear: 'Clear',
      scopeLabel: 'Match',
      scopeAll: 'All',
      scopeTitle: 'Title',
      scopeContent: 'Content',
      includeArchived: 'Archived',
      includeArchivedHint: 'Include archived sessions in the results',
      idleTitle: 'Search your whole session history',
      idleHint: 'Fuzzy title matching runs on the live catalog; message content is searched full-text.',
      idleTip: 'Try a short phrase, a few separate words, or part of a title.',
      searching: 'Searching…',
      indexing: 'Building the content index for the first search — this can take a moment…',
      emptyTitle: 'No session matches “{query}”',
      emptyHint: 'Try a shorter term, fewer words, or turn on “Archived”.',
      untitled: 'Untitled session',
      ungrouped: 'Ungrouped',
      archivedBadge: 'archived',
      matchedTitle: 'title',
      matchedContent: 'content',
      matchedBoth: 'title + content',
      open: 'Open',
      unarchiveAndOpen: 'Unarchive & open',
      copyId: 'Copy session id',
      copied: 'Copied',
      resultOne: '{count} session',
      resultsMany: '{count} sessions',
      took: '{ms} ms',
      titleHits: '{count} by title',
      contentHits: '{count} by content',
      truncated: 'Showing {shown} of {total}; narrow the query to see fewer.',
      contentCap: 'Content search returns at most {count} sessions per query.',
      contentUnavailable: 'Content search is unavailable in this deployment ({message}); showing title matches only.',
      unarchiveFailed: 'Could not unarchive this session: {message}',
      openFailed: 'Could not open this session: {message}',
      openHint: 'Opening a session continues that conversation; an archived one is unarchived first.',
      noSnippet: 'Title match only — no message excerpt.',
      running: 'running',
      justNow: 'just now',
      minutesAgo: '{count} min ago',
      hoursAgo: '{count} h ago',
      daysAgo: '{count} d ago',
      monthsAgo: '{count} mo ago',
    }

    const zh = {
      panel: '回忆',
      title: '回忆',
      subtitle: '按标题和消息正文检索全部历史会话，包括已归档的会话。',
      placeholder: '搜索标题与消息内容…',
      search: '搜索',
      clear: '清空',
      scopeLabel: '范围',
      scopeAll: '全部',
      scopeTitle: '标题',
      scopeContent: '内容',
      includeArchived: '含归档',
      includeArchivedHint: '在结果中包含已归档会话',
      idleTitle: '搜索你的全部会话历史',
      idleHint: '标题是本地模糊匹配（即时）；消息正文是全文检索。',
      idleTip: '可以试短词、用空格分词的多个词，或标题的一部分。',
      searching: '搜索中…',
      indexing: '首次搜索正在建立内容索引，可能需要几秒…',
      emptyTitle: '没有匹配「{query}」的会话',
      emptyHint: '试试更短的关键词、更少的词，或打开「含归档」。',
      untitled: '未命名会话',
      ungrouped: '未归入工作区',
      archivedBadge: '已归档',
      matchedTitle: '标题',
      matchedContent: '内容',
      matchedBoth: '标题+内容',
      open: '打开',
      unarchiveAndOpen: '取消归档并打开',
      copyId: '复制会话 ID',
      copied: '已复制',
      resultOne: '{count} 个会话',
      resultsMany: '{count} 个会话',
      took: '{ms} 毫秒',
      titleHits: '标题命中 {count} 个',
      contentHits: '内容命中 {count} 个',
      truncated: '仅显示 {total} 个中的 {shown} 个；缩小查询范围可看到更少结果。',
      contentCap: '内容检索每次最多返回 {count} 个会话。',
      contentUnavailable: '当前部署的内容检索不可用（{message}），只显示标题匹配。',
      unarchiveFailed: '取消归档失败：{message}',
      openFailed: '打开会话失败：{message}',
      openHint: '点击结果会继续该会话；已归档的会话会先取消归档。',
      noSnippet: '仅标题命中，无消息摘要。',
      running: '进行中',
      justNow: '刚刚',
      minutesAgo: '{count} 分钟前',
      hoursAgo: '{count} 小时前',
      daysAgo: '{count} 天前',
      monthsAgo: '{count} 个月前',
    }

    /* ---------------------------------------------------------------------- *
     * Text helpers
     * ---------------------------------------------------------------------- */

    /** Collapse whitespace and trim. */
    function squeeze(value) {
      return String(value ?? '')
        .replace(/\s+/gu, ' ')
        .trim()
    }

    /** Case-folded text without whitespace or punctuation, for fuzzy matching. */
    function compact(value) {
      return String(value ?? '')
        .toLowerCase()
        .replace(/[\s\p{P}\p{S}]+/gu, '')
    }

    /** Earliest offset where `needle` occurs inside `haystack` as an ordered subsequence. */
    function subsequenceAt(needle, haystack) {
      let at = -1
      let gaps = 0
      for (const char of needle) {
        const found = haystack.indexOf(char, at + 1)
        if (found === -1) return undefined
        if (at !== -1) gaps += found - at - 1
        at = found
      }
      return { at: at - needle.length + 1, gaps }
    }

    /**
     * Score one title against the query; 0 means no match.
     *
     * Tiers, best first: equal compact forms, prefix, every term present, a
     * contiguous substring, an ordered subsequence, one term contained. The
     * compact form ignores case, spacing and punctuation, so `dsh最佳实践` matches
     * `DSH 最佳实践笔记` and `sessionsearch` matches `Session Search`.
     */
    function scoreTitle(title, query, terms) {
      const titleCompact = compact(title)
      const queryCompact = compact(query)
      if (titleCompact === '' || queryCompact === '') return 0
      if (titleCompact === queryCompact) return 1000
      if (titleCompact.startsWith(queryCompact)) return 900
      const termCompacts = terms.map(compact).filter((term) => term !== '')
      if (termCompacts.length > 1 && termCompacts.every((term) => titleCompact.includes(term))) return 820
      const direct = titleCompact.indexOf(queryCompact)
      if (direct !== -1) return 760 - Math.min(direct, 60)
      if (termCompacts.length > 0 && termCompacts.every((term) => titleCompact.includes(term))) return 700
      const ordered = subsequenceAt(queryCompact, titleCompact)
      if (ordered !== undefined) return 620 - Math.min(ordered.gaps, 120)
      return 0
    }

    /** Score a workspace label, one tier below a title match. */
    function scoreLabel(label, queryCompact, terms) {
      const labelCompact = compact(label)
      if (labelCompact === '' || queryCompact === '') return 0
      if (labelCompact.startsWith(queryCompact)) return 460
      if (labelCompact.includes(queryCompact)) return 400
      const termCompacts = terms.map(compact).filter((term) => term !== '')
      if (termCompacts.length > 0 && termCompacts.every((term) => labelCompact.includes(term))) return 340
      return 0
    }

    /** Final path segment, for workspace labels. */
    function baseName(path) {
      const trimmed = String(path ?? '').replace(/[\\/]+$/u, '')
      const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
      return cut === -1 ? trimmed : trimmed.slice(cut + 1) || trimmed
    }

    /** Human text for a thrown value. */
    function messageOf(error) {
      if (error instanceof Error && error.message !== '') return error.message
      return String(error)
    }

    /** Fill `{name}` placeholders in one dictionary string. */
    function fill(template, values) {
      return String(template ?? '').replace(/\{(\w+)\}/gu, (whole, name) =>
        Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : whole,
      )
    }

    /** Parse a session timestamp (ISO string or epoch milliseconds) into ms. */
    function timeOf(value) {
      if (typeof value === 'number' && Number.isFinite(value)) return value
      if (typeof value === 'string' && value !== '') {
        const parsed = Date.parse(value)
        return Number.isFinite(parsed) ? parsed : 0
      }
      return 0
    }

    /** Absolute local timestamp for a tooltip. */
    function stampOf(milliseconds) {
      if (milliseconds <= 0) return ''
      try {
        return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(milliseconds)
      } catch {
        return new Date(milliseconds).toISOString()
      }
    }

    /** Short relative time such as "3 天前"; '' when unknown. */
    function relativeOf(milliseconds, t) {
      if (milliseconds <= 0) return ''
      const delta = Date.now() - milliseconds
      const minute = 60_000
      const hour = 60 * minute
      const day = 24 * hour
      if (delta < minute) return t('justNow')
      if (delta < hour) return fill(t('minutesAgo'), { count: Math.floor(delta / minute) })
      if (delta < day) return fill(t('hoursAgo'), { count: Math.floor(delta / hour) })
      if (delta < 30 * day) return fill(t('daysAgo'), { count: Math.floor(delta / day) })
      return fill(t('monthsAgo'), { count: Math.floor(delta / (30 * day)) })
    }

    /** Split `text` into runs, marking case-insensitive occurrences of any term. */
    function highlight(text, terms) {
      const source = String(text ?? '')
      const needles = [...new Set(terms.map((term) => String(term).trim()).filter((term) => term !== ''))].sort(
        (left, right) => right.length - left.length,
      )
      if (source === '' || needles.length === 0) return [{ text: source, match: false }]
      const lower = source.toLowerCase()
      const taken = new Array(source.length).fill(false)
      for (const needle of needles) {
        const target = needle.toLowerCase()
        let from = 0
        for (;;) {
          const at = lower.indexOf(target, from)
          if (at === -1) break
          for (let index = at; index < at + target.length; index += 1) taken[index] = true
          from = at + Math.max(target.length, 1)
        }
      }
      const runs = []
      let start = 0
      for (let index = 1; index <= source.length; index += 1) {
        if (index === source.length || taken[index] !== taken[start]) {
          runs.push({ text: source.slice(start, index), match: taken[start] === true })
          start = index
        }
      }
      return runs.length === 0 ? [{ text: source, match: false }] : runs
    }

    /** Terms a query contributes to highlighting and fuzzy matching. */
    function termsOf(query) {
      const whole = squeeze(query)
      if (whole === '') return []
      const parts = whole.split(' ').filter((part) => part !== '')
      return parts.length > 1 ? [...new Set([whole, ...parts])] : [whole]
    }

    /* ---------------------------------------------------------------------- *
     * Page styles
     * ---------------------------------------------------------------------- */

    const styles = {
      page: {
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
      },
      header: { flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px 10px' },
      headerText: { minWidth: 0, flex: '1 1 auto' },
      h1: { margin: 0, fontSize: 16, lineHeight: '22px', fontWeight: 600 },
      subtitle: { marginTop: 2, fontSize: 12, lineHeight: '16px', color: 'var(--dsw-alias-label-secondary)' },
      meta: { flex: '0 0 auto', fontSize: 12, color: 'var(--dsw-alias-label-secondary)', textAlign: 'right' },
      controls: { flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '0 20px 12px' },
      bar: { display: 'flex', alignItems: 'center', gap: 8 },
      inputWrap: { position: 'relative', flex: '1 1 auto', minWidth: 0, display: 'flex' },
      input: { paddingRight: 30 },
      clearInInput: {
        position: 'absolute',
        right: 6,
        top: '50%',
        transform: 'translateY(-50%)',
        width: 22,
        height: 22,
        border: 'none',
        borderRadius: 6,
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
        cursor: 'pointer',
        fontSize: 15,
        lineHeight: '22px',
        padding: 0,
      },
      facets: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
      facetGroup: { display: 'inline-flex', alignItems: 'center', gap: 7 },
      facetLabel: { fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)' },
      seg: {
        display: 'inline-flex',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 7,
        overflow: 'hidden',
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      toggle: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11.5,
        color: 'var(--dsw-alias-label-secondary)',
        cursor: 'pointer',
        userSelect: 'none',
      },
      notice: {
        margin: '0 20px 8px',
        padding: '7px 10px',
        fontSize: 12,
        lineHeight: '17px',
        borderRadius: 8,
        color: 'var(--dsw-alias-state-warning-primary, #9a6700)',
        background: 'color-mix(in srgb, currentColor 9%, transparent)',
      },
      scroll: { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '2px 20px 26px' },
      list: { display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 980 },
      row: {
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '11px 13px',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 11,
        background: 'var(--dsw-alias-bg-layer-1)',
        transition: 'border-color 120ms ease, box-shadow 120ms ease',
      },
      rowHead: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
      rowTitle: {
        margin: 0,
        fontSize: 13.5,
        fontWeight: 600,
        lineHeight: '20px',
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        flex: '0 1 auto',
      },
      rowActions: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' },
      rowMeta: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11.5,
        color: 'var(--dsw-alias-label-secondary)',
        flexWrap: 'wrap',
      },
      dot: { opacity: 0.5 },
      badge: {
        flex: '0 0 auto',
        fontSize: 10.5,
        lineHeight: '16px',
        padding: '0 6px',
        borderRadius: 5,
        color: 'var(--dsw-alias-label-secondary)',
        background: 'var(--dsw-alias-bg-layer-2)',
        whiteSpace: 'nowrap',
      },
      badgeArchive: {
        flex: '0 0 auto',
        fontSize: 10.5,
        lineHeight: '16px',
        padding: '0 6px',
        borderRadius: 5,
        color: 'var(--dsw-alias-state-warning-primary, #9a6700)',
        background: 'color-mix(in srgb, currentColor 12%, transparent)',
        whiteSpace: 'nowrap',
      },
      badgeRunning: {
        flex: '0 0 auto',
        fontSize: 10.5,
        lineHeight: '16px',
        padding: '0 6px',
        borderRadius: 5,
        color: 'var(--dsw-static-deepseek-500, #4176e6)',
        background: 'color-mix(in srgb, currentColor 12%, transparent)',
        whiteSpace: 'nowrap',
      },
      snippet: {
        fontSize: 12.5,
        lineHeight: '19px',
        color: 'var(--dsw-alias-label-primary)',
        opacity: 0.86,
        overflowWrap: 'anywhere',
      },
      muted: { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)' },
      stateBox: { display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 620, padding: '22px 2px' },
      stateTitle: { fontSize: 13.5, fontWeight: 600 },
    }

    /** Page stylesheet: real class rules for the hover/focus states inline styles cannot express. */
    const PAGE_CSS = `
.dshs-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;font-family:inherit;font-size:12.5px;font-weight:500;line-height:1;border-radius:8px;border:1px solid transparent;cursor:pointer;white-space:nowrap;transition:background 120ms ease,border-color 120ms ease,color 120ms ease}
.dshs-btn:disabled{opacity:.45;cursor:not-allowed}
.dshs-btn:focus-visible{outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-static-deepseek-500,#4176e6) 26%,transparent)}
.dshs-btn--primary{background:var(--dsw-static-deepseek-500,#4176e6);color:#fff;font-weight:600}
.dshs-btn--primary:hover:not(:disabled){background:var(--dsw-static-deepseek-450,#5686fe)}
.dshs-btn--secondary{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}
.dshs-btn--secondary:hover:not(:disabled){background:var(--dsw-alias-bg-layer-3)}
.dshs-btn--ghost{background:transparent;color:var(--dsw-alias-label-secondary);padding:0 7px}
.dshs-btn--ghost:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dshs-input{width:100%;box-sizing:border-box;height:34px;padding:0 11px;font-family:inherit;font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;outline:none;transition:border-color 120ms ease,box-shadow 120ms ease}
.dshs-input::placeholder{color:var(--dsw-alias-label-secondary)}
.dshs-input:hover{border-color:var(--dsw-alias-border-l2)}
.dshs-input:focus{border-color:var(--dsw-static-deepseek-500,#4176e6);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-static-deepseek-500,#4176e6) 16%,transparent)}
.dshs-clear:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dshs-seg-btn{height:24px;padding:0 9px;font-family:inherit;font-size:11.5px;font-weight:500;line-height:1;border:none;border-right:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dshs-seg-btn:last-child{border-right:none}
.dshs-seg-btn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dshs-seg-btn[data-on=true]{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);font-weight:600}
.dshs-row:hover{border-color:color-mix(in srgb,var(--dsw-static-deepseek-500,#4176e6) 28%,var(--dsw-alias-border-l2))}
.dshs-mark{background:color-mix(in srgb,var(--dsw-static-deepseek-500,#4176e6) 22%,transparent);color:inherit;border-radius:3px;padding:0 1px}
`

    /** One text button; the variant class carries colour, hover and focus. */
    function Button(props) {
      return h(
        'button',
        {
          type: 'button',
          className: `dshs-btn dshs-btn--${props.variant ?? 'secondary'}`,
          disabled: props.disabled === true,
          title: props.title,
          onClick: props.onClick,
        },
        props.label,
      )
    }

    /** Sidebar glyph: a magnifier over a message bubble. */
    function SearchIcon(props) {
      const size = typeof props.size === 'number' ? props.size : 18
      const active = props.active === true
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 20 20',
          fill: 'none',
          'aria-hidden': true,
          style: { display: 'block' },
        },
        h('path', {
          d: 'M3.1 5.2c0-.86.7-1.55 1.55-1.55h6.1c.86 0 1.55.69 1.55 1.55v4.05c0 .86-.7 1.55-1.55 1.55H6.72l-2.2 1.72a.45.45 0 0 1-.72-.36v-1.4H4.65A1.55 1.55 0 0 1 3.1 9.25Z',
          stroke: 'currentColor',
          strokeWidth: 1.35,
          strokeLinejoin: 'round',
        }),
        h('circle', {
          cx: 13.15,
          cy: 12.35,
          r: 2.75,
          stroke: 'currentColor',
          strokeWidth: 1.4,
          opacity: active ? 1 : 0.85,
        }),
        h('path', { d: 'm15.2 14.4 1.85 1.85', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
      )
    }

    /** One result row: title, badges, meta line, excerpt, and its open action. */
    function ResultRow(props) {
      const { item, query, t, busy, onOpen } = props
      const [copied, setCopied] = React.useState(false)
      const terms = termsOf(query)
      const createdAt = timeOf(item.createdAt)
      const title = item.title === '' ? t('untitled') : item.title
      const copy = () => {
        const clipboard = globalThis.navigator?.clipboard
        if (clipboard === undefined) return
        clipboard.writeText(item.sessionId).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1400)
        })
      }
      const badge =
        item.matchedTitle === true && item.matchedContent === true
          ? t('matchedBoth')
          : item.matchedContent === true
            ? t('matchedContent')
            : t('matchedTitle')
      return h(
        'article',
        { className: 'dshs-row', style: styles.row, 'data-session': item.sessionId },
        h(
          'div',
          { style: styles.rowHead },
          h(
            'h3',
            { style: styles.rowTitle, title },
            highlight(title, terms).map((run, index) =>
              run.match ? h('mark', { key: index, className: 'dshs-mark' }, run.text) : h('span', { key: index }, run.text),
            ),
          ),
          item.archived === true ? h('span', { style: styles.badgeArchive }, t('archivedBadge')) : null,
          item.running === true ? h('span', { style: styles.badgeRunning }, t('running')) : null,
          h('span', { style: styles.badge }, badge),
          h(
            'div',
            { style: styles.rowActions },
            h(Button, {
              label: item.archived === true ? t('unarchiveAndOpen') : t('open'),
              variant: item.archived === true ? 'secondary' : 'primary',
              disabled: busy === true,
              onClick: () => onOpen(item),
            }),
            h(Button, { label: copied ? t('copied') : '⧉', variant: 'ghost', title: t('copyId'), onClick: copy }),
          ),
        ),
        h(
          'div',
          { style: styles.rowMeta },
          createdAt === 0 ? null : h('span', { title: stampOf(createdAt) }, relativeOf(createdAt, t)),
          createdAt === 0 ? null : h('span', { style: styles.dot }, '·'),
          h('span', { title: item.cwd ?? '' }, item.workspace === '' ? t('ungrouped') : item.workspace),
          h('span', { style: styles.dot }, '·'),
          h('span', { style: { fontFamily: 'var(--ds-font-family-code, monospace)' } }, String(item.sessionId).slice(0, 20)),
        ),
        item.snippet === ''
          ? h('div', { style: styles.muted }, t('noSnippet'))
          : h(
              'div',
              { style: styles.snippet },
              highlight(item.snippet, terms).map((run, index) =>
                run.match
                  ? h('mark', { key: index, className: 'dshs-mark' }, run.text)
                  : h('span', { key: index }, run.text),
              ),
            ),
      )
    }

    /** The search page registered under the `main` slot for this panel id. */
    function SearchPage(props) {
      const { t, useSessions, useWorkspaces, searchSessions, openSession, unarchiveSession } = props
      const sessions = useSessions((state) => state)
      const workspaceState = useWorkspaces((state) => state)
      const [query, setQuery] = React.useState('')
      const [scope, setScope] = React.useState('all')
      const [includeArchived, setIncludeArchived] = React.useState(true)
      const [result, setResult] = React.useState({
        phase: 'idle',
        items: [],
        titleCount: 0,
        contentCount: 0,
        tookMs: 0,
        contentError: null,
        contentHasMore: false,
      })
      const [busy, setBusy] = React.useState(false)
      const [notice, setNotice] = React.useState(null)
      const inputRef = React.useRef(null)

      /** Every catalog row the page can search: blank drafts excluded. */
      const catalog = React.useMemo(() => {
        const byId = sessions?.byId ?? {}
        const ids = Array.isArray(sessions?.ids) ? sessions.ids : []
        const archived = new Set(Array.isArray(workspaceState?.archivedSessionIds) ? workspaceState.archivedSessionIds : [])
        const workspaceLabelOf = new Map()
        for (const workspace of Array.isArray(workspaceState?.items) ? workspaceState.items : []) {
          const label = squeeze(workspace?.title) || baseName(workspace?.path)
          for (const sessionId of Array.isArray(workspace?.sessionIds) ? workspace.sessionIds : []) {
            if (!workspaceLabelOf.has(sessionId)) workspaceLabelOf.set(sessionId, label)
          }
        }
        const rows = []
        for (const sessionId of ids) {
          const summary = byId[sessionId]
          if (summary === undefined || summary === null || summary.blank === true) continue
          const cwd = typeof summary.cwd === 'string' ? summary.cwd : ''
          rows.push({
            sessionId,
            title: squeeze(summary.title),
            cwd,
            createdAt: summary.createdAt,
            archived: archived.has(sessionId),
            running: summary.running === true,
            workspace: workspaceLabelOf.get(sessionId) ?? (cwd === '' ? '' : baseName(cwd)),
          })
        }
        return rows
      }, [sessions, workspaceState])

      const catalogById = React.useMemo(() => new Map(catalog.map((row) => [row.sessionId, row])), [catalog])

      /** Local title pass: fuzzy over titles and, one tier lower, workspace labels. */
      const matchTitles = React.useCallback(
        (term) => {
          const terms = termsOf(term)
          const queryCompact = compact(term)
          const hits = []
          for (const row of catalog) {
            if (row.archived && !includeArchived) continue
            const titleScore = row.title === '' ? 0 : scoreTitle(row.title, term, terms)
            const labelScore = titleScore === 0 ? scoreLabel(row.workspace, queryCompact, terms) : 0
            const score = Math.max(titleScore, labelScore)
            if (score === 0) continue
            hits.push({ row, score, matchedTitle: titleScore > 0 })
          }
          hits.sort((left, right) => {
            if (right.score !== left.score) return right.score - left.score
            return timeOf(right.row.createdAt) - timeOf(left.row.createdAt)
          })
          return hits
        },
        [catalog, includeArchived],
      )

      /** Merge the local title hits with one content page, title matches first. */
      const merge = React.useCallback(
        (titleHits, contentPage) => {
          const rows = titleHits.map((hit) => ({
            sessionId: hit.row.sessionId,
            title: hit.row.title,
            snippet: '',
            cwd: hit.row.cwd,
            workspace: hit.row.workspace,
            createdAt: hit.row.createdAt,
            archived: hit.row.archived,
            running: hit.row.running,
            matchedTitle: hit.matchedTitle,
            matchedContent: false,
          }))
          const positionOf = new Map(rows.map((row, index) => [row.sessionId, index]))
          let contentCount = 0
          for (const item of Array.isArray(contentPage?.items) ? contentPage.items : []) {
            const sessionId = squeeze(item?.sessionId)
            const catalogRow = catalogById.get(sessionId)
            if (catalogRow === undefined) continue
            if (catalogRow.archived && !includeArchived) continue
            contentCount += 1
            const snippet = squeeze(item?.snippet)
            const at = positionOf.get(sessionId)
            if (at !== undefined) {
              rows[at] = { ...rows[at], snippet: snippet === '' ? rows[at].snippet : snippet, matchedContent: true }
              continue
            }
            positionOf.set(sessionId, rows.length)
            rows.push({
              sessionId,
              title: catalogRow.title,
              snippet,
              cwd: catalogRow.cwd,
              workspace: catalogRow.workspace,
              createdAt: catalogRow.createdAt,
              archived: catalogRow.archived,
              running: catalogRow.running,
              matchedTitle: false,
              matchedContent: true,
            })
          }
          return { rows, contentCount }
        },
        [catalogById, includeArchived],
      )

      /** Run the whole search for one term and the current facets. */
      const run = React.useCallback(
        (term, signal) => {
          const startedAt = Date.now()
          const trimmed = squeeze(term)
          if (trimmed === '') {
            setResult({ phase: 'idle', items: [], titleCount: 0, contentCount: 0, tookMs: 0, contentError: null, contentHasMore: false })
            return
          }
          const titleHits = scope === 'content' ? [] : matchTitles(trimmed)
          // Title matches are local and immediate: publish them before the remote
          // content pass resolves, so the page never sits empty while it waits.
          setResult({
            phase: scope === 'title' ? 'ready' : 'loading',
            items: merge(titleHits, undefined).rows.slice(0, RESULT_LIMIT),
            titleCount: titleHits.length,
            contentCount: 0,
            tookMs: Date.now() - startedAt,
            contentError: null,
            contentHasMore: false,
          })
          if (scope === 'title') return
          searchSessions(trimmed, signal)
            .then((page) => {
              if (signal?.aborted === true) return
              const merged = merge(titleHits, page)
              setResult({
                phase: 'ready',
                items: merged.rows.slice(0, RESULT_LIMIT),
                titleCount: titleHits.length,
                contentCount: merged.contentCount,
                tookMs: Date.now() - startedAt,
                contentError: null,
                contentHasMore: page?.hasMore === true || merged.contentCount >= CONTENT_HIT_LIMIT,
              })
            })
            .catch((failure) => {
              if (signal?.aborted === true) return
              // The local title pass stays useful without the remote, so a content
              // failure degrades the page instead of emptying it.
              setResult({
                phase: 'ready',
                items: merge(titleHits, undefined).rows.slice(0, RESULT_LIMIT),
                titleCount: titleHits.length,
                contentCount: 0,
                tookMs: Date.now() - startedAt,
                contentError: messageOf(failure),
                contentHasMore: false,
              })
            })
        },
        [matchTitles, merge, scope, searchSessions],
      )

      // Debounced run on every facet change; the controller cancels stale waits.
      React.useEffect(() => {
        const trimmed = squeeze(query)
        if (trimmed === '') {
          setResult({ phase: 'idle', items: [], titleCount: 0, contentCount: 0, tookMs: 0, contentError: null, contentHasMore: false })
          return undefined
        }
        const controller = new AbortController()
        setResult((current) => ({ ...current, phase: 'loading' }))
        const timer = window.setTimeout(() => {
          run(trimmed, controller.signal)
        }, DEBOUNCE_MS)
        return () => {
          window.clearTimeout(timer)
          controller.abort()
        }
      }, [query, scope, includeArchived, run])

      React.useEffect(() => {
        inputRef.current?.focus({ preventScroll: true })
      }, [])

      const openResult = async (item) => {
        setBusy(true)
        setNotice(null)
        try {
          if (item.archived === true) {
            await unarchiveSession(item.sessionId)
            // The archived set follows the Host asynchronously; one short beat
            // keeps the click from racing the Workspace snapshot refresh.
            await new Promise((resolve) => window.setTimeout(resolve, 150))
          }
          openSession(item.sessionId)
        } catch (failure) {
          setNotice(fill(t(item.archived === true ? 'unarchiveFailed' : 'openFailed'), { message: messageOf(failure) }))
        } finally {
          setBusy(false)
        }
      }

      const trimmed = squeeze(query)
      const loading = result.phase === 'loading'
      const heading =
        result.phase === 'ready' && result.items.length > 0
          ? [
              fill(t(result.items.length === 1 ? 'resultOne' : 'resultsMany'), { count: result.items.length }),
              result.titleCount > 0 ? fill(t('titleHits'), { count: result.titleCount }) : '',
              result.contentCount > 0 ? fill(t('contentHits'), { count: result.contentCount }) : '',
            ]
              .filter((part) => part !== '')
              .join(' · ')
          : ''

      let body
      if (result.phase === 'idle') {
        body = h(
          'div',
          { style: styles.stateBox },
          h('div', { style: styles.stateTitle }, t('idleTitle')),
          h('div', { style: styles.muted }, t('idleHint')),
          h('div', { style: styles.muted }, t('idleTip')),
          h('div', { style: styles.muted }, t('openHint')),
        )
      } else if (loading && result.items.length === 0) {
        body = h(
          'div',
          { style: styles.stateBox },
          h('div', { style: styles.muted }, t('searching')),
          h('div', { style: styles.muted }, t('indexing')),
        )
      } else if (result.items.length === 0) {
        body = h(
          'div',
          { style: styles.stateBox },
          h('div', { style: styles.stateTitle }, fill(t('emptyTitle'), { query: trimmed })),
          h('div', { style: styles.muted }, t('emptyHint')),
          result.contentError === null
            ? null
            : h('div', { style: styles.muted }, fill(t('contentUnavailable'), { message: result.contentError })),
        )
      } else {
        body = h(
          'div',
          { style: styles.list },
          result.items.map((item) => h(ResultRow, { key: item.sessionId, item, query: trimmed, t, busy, onOpen: openResult })),
          result.contentError === null
            ? null
            : h('div', { style: styles.muted }, fill(t('contentUnavailable'), { message: result.contentError })),
          result.contentHasMore === true ? h('div', { style: styles.muted }, fill(t('contentCap'), { count: CONTENT_HIT_LIMIT })) : null,
          result.items.length >= RESULT_LIMIT && result.titleCount + result.contentCount > result.items.length
            ? h(
                'div',
                { style: styles.muted },
                fill(t('truncated'), { shown: result.items.length, total: result.titleCount + result.contentCount }),
              )
            : null,
        )
      }

      const scopes = [
        { id: 'all', label: t('scopeAll') },
        { id: 'title', label: t('scopeTitle') },
        { id: 'content', label: t('scopeContent') },
      ]

      return h(
        'section',
        { style: styles.page, 'aria-label': t('title'), 'data-testid': 'session-search-page' },
        h('style', { key: 'session-search-css' }, PAGE_CSS),
        h(
          'header',
          { style: styles.header },
          h(
            'div',
            { style: styles.headerText },
            h('h1', { style: styles.h1 }, t('title')),
            h('div', { style: styles.subtitle }, t('subtitle')),
          ),
          h(
            'div',
            { style: styles.meta },
            loading
              ? t('searching')
              : result.phase === 'ready'
                ? `${heading}${result.tookMs > 0 ? ` · ${fill(t('took'), { ms: result.tookMs })}` : ''}`
                : '',
          ),
        ),
        h(
          'div',
          { style: styles.controls },
          h(
            'div',
            { style: styles.bar },
            h(
              'div',
              { style: styles.inputWrap },
              h('input', {
                ref: inputRef,
                className: 'dshs-input',
                style: styles.input,
                type: 'search',
                value: query,
                maxLength: MAX_QUERY_UNITS,
                placeholder: t('placeholder'),
                spellCheck: false,
                'aria-label': t('placeholder'),
                onChange: (event) => setQuery(event.target.value),
                onKeyDown: (event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    run(query, undefined)
                  } else if (event.key === 'Escape') {
                    setQuery('')
                  }
                },
              }),
              query === ''
                ? null
                : h(
                    'button',
                    {
                      type: 'button',
                      className: 'dshs-clear',
                      style: styles.clearInInput,
                      title: t('clear'),
                      'aria-label': t('clear'),
                      onClick: () => {
                        setQuery('')
                        inputRef.current?.focus({ preventScroll: true })
                      },
                    },
                    '×',
                  ),
            ),
            h(Button, { label: t('search'), variant: 'primary', onClick: () => run(query, undefined), disabled: trimmed === '' }),
          ),
          h(
            'div',
            { style: styles.facets },
            h(
              'span',
              { style: styles.facetGroup },
              h('span', { style: styles.facetLabel }, t('scopeLabel')),
              h(
                'span',
                { style: styles.seg, role: 'group' },
                scopes.map((entry) =>
                  h(
                    'button',
                    {
                      key: entry.id,
                      type: 'button',
                      className: 'dshs-seg-btn',
                      'data-on': scope === entry.id ? 'true' : 'false',
                      'aria-pressed': scope === entry.id,
                      onClick: () => setScope(entry.id),
                    },
                    entry.label,
                  ),
                ),
              ),
            ),
            h(
              'label',
              { style: styles.toggle, title: t('includeArchivedHint') },
              h('input', {
                type: 'checkbox',
                checked: includeArchived,
                onChange: (event) => setIncludeArchived(event.target.checked),
              }),
              h('span', null, t('includeArchived')),
            ),
          ),
        ),
        notice === null ? null : h('div', { style: styles.notice, role: 'status' }, notice),
        h('div', { style: styles.scroll }, body),
      )
    }

    /** Client plugin body: dictionary, services, and the two slot entries. */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-session-search: dictionaries')
      const t = ctx.locale.bind(NS)

      /** Ranked content page through the shipped authenticated remote. */
      const searchSessions = async (query, signal) => {
        const result = await ctx.sessions.search(query, signal ?? new AbortController().signal)
        if (result?.ok !== true) throw new Error(squeeze(result?.error?.message) || 'content search failed')
        return result.value
      }

      /** Reveal one session in the conversation panel, continuing its history. */
      const openSession = (sessionId) => ctx.uiWorkspace.openSession(sessionId)

      /** Lift the archive marker through the shipped Workspace service. */
      const unarchiveSession = (sessionId) => ctx.workspaces.unarchiveSession(sessionId)

      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 12,
            locale: NS,
            label: () => t('panel'),
          },
          SearchIcon,
        ),
      )

      ctx.slots.inject('main', () =>
        ctx.slots.register(
          {
            name: 'main',
            key: PANEL_ID,
            locale: NS,
            inject: () => ({ searchSessions, openSession, unarchiveSession }),
          },
          SearchPage,
        ),
      )
    }

    return {
      inject: ['slots', 'locale', 'sessions', 'workspaces', 'uiWorkspace'],
      apply,
    }
  },
})