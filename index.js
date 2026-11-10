/**
 * Host half of `dsh-session-search`.
 *
 * This plugin's work happens entirely in the browser: the panel reads the live
 * Session catalog and Workspace snapshot through the slot's own standard props,
 * searches message content through the shipped authenticated `ctx.sessions.search`
 * remote, and opens a hit through the shipped `uiWorkspace` / `workspaces`
 * services. No Host API of its own is therefore needed — this module exists so
 * the package is an enabled Loader entry, which is what makes the Host serve the
 * `dsh.client` half declared in package.json.
 *
 * The composition layer (`cordis.patch.yml`) is what makes content search work:
 * it flips the shipped `session-query-sqlite` row from `openAt: never` to
 * `openAt: first-search`, the documented way to enable ranked full-text search
 * (and, as a side effect, the shipped sidebar search box).
 */

/** No Host services are consumed by this entry. */
export const inject = []

/**
 * Register nothing: the Client half owns the whole feature.
 * @param _ctx - Host plugin context, unused.
 */
export function apply(_ctx) {}