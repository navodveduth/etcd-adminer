# Component organization

- `connections/`: profiles, authentication, diagnostics.
- `cluster/`: member inventory and maintenance telemetry.
- `keys/`: paginated key browser, tree/list and self-hosted editor.
- `access/`: user/role administration.
- `leases/`, `watch/`, `transfer/`: feature screens and colocated tests.
- `layout/`: navigation and connection tabs; `dialogs/`: shared dialogs.

`../workspaces.jsx` owns workspace lifetimes and page retention. Feature screens
obtain their bound API via `useDataService` from `../data/context.jsx`, not the
globally selected profile. Do not read `SessionStore.GetActiveSession()` inside
feature screens: it would route background workspace requests to another cluster.
Only connection management and the outer shell may select profiles globally.

Keep pure state transformations in `../data/`, and keep secrets out of storage,
URLs, logs and persisted workspace state. Every continuous task must be bounded
and cancelled during workspace teardown. Hiding a feature page does not unmount
it; use workspace-active context to pause nonessential polling.
