# Component organization

- `connections/`: profiles, authentication, diagnostics.
- `cluster/`: member inventory and maintenance telemetry.
- `keys/`: backend-lazy folder/project browsing, paginated List and self-hosted editor.
- `access/`: user/role administration.
- `leases/`, `watch/`, `transfer/`: feature screens and colocated tests.
- `layout/`: navigation and connection tabs; `dialogs/`: shared dialogs.

`../workspaces.jsx` owns workspace lifetimes and page retention. Feature screens
obtain their bound API via `useDataService` from `../data/context.jsx`, not the
globally selected profile. Do not read `SessionStore.GetActiveSession()` inside
feature screens: it would route background workspace requests to another cluster.
Only connection management and the outer shell may select profiles globally.
`../navigation.jsx` bridges the active workspace router to real browser URLs;
visited feature queries remain local to each workspace. URL/query persistence
contains only connection/page/prefix/key metadata, never values or drafts.

`../storage/session.js` stores profile metadata and non-secret server references.
Remembered references must be verified against `/api/v1/sessions` after startup;
the HttpOnly cookie itself is never accessible to this module. Opt-out credentials
remain in tab memory only. Disconnect must revoke server sessions before reporting
success, and session expiry must not silently fall back to another connection.

Keep pure state transformations in `../data/`, and keep secrets out of storage,
URLs, logs and persisted workspace state. Every continuous task must be bounded
and cancelled during workspace teardown. Hiding a feature page does not unmount
it; use workspace-active context to pause nonessential polling.
