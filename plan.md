# etcd Adminer: stability, performance, and feature plan

## 1. Scope and review baseline

This plan is based on the code in this checkout, not just the supplied feature checklist. It proposes work; it does not mark that work as implemented.

**Recommended order:** correctness and security → bounded backend reads and client lifecycle → responsive UI → core administration features → advanced coordination features.

### Architecture today

- Go HTTP API using Gorilla Mux; `bootstrap/init.go` loads YAML configuration and registers predefined etcd backends.
- `etcd/` wraps the etcd v3 client. Most handlers create a new authenticated client for each request.
- `http/handlers/` implements key CRUD, virtual directories, cluster information, and basic user/role operations.
- React 17 / Material UI frontend scaffolded with Create React App; Axios handles requests and Monaco edits values.
- Connection profiles, including passwords, are stored in browser `localStorage`. One global active profile determines requests.
- Key browsing fetches all matching keys, builds a complete backend tree, and sends it to the browser. The flat view flattens that tree again and paginates locally.

### Validation performed

- Reviewed backend startup, configuration, routing, middleware, handlers, tree construction, frontend service/session code, main views, tests, Docker, and CI configuration.
- `go test ./...` passes. Only `filetree/` currently contains Go tests; passing tests do not establish handler correctness.
- Frontend tests/build, live-cluster behavior, security scans, and load tests were not run. Findings below are source-review findings; performance targets are proposed budgets, not measurements.
- The frontend test in `ui/src/App.test.js` still expects the CRA “learn react” link and needs replacement.

## 2. Feature inventory: checklist versus this checkout

“Partial” means related code exists but not a complete, validated workflow. “Not found” means no working implementation was identified in this checkout; verify other branches before rebuilding anything.

| Feature | Observed status | Required work |
| --- | --- | --- |
| Basic connection with auth | Present, needs hardening | Auth failures, no-auth clusters, session expiry, validation, and secret handling |
| Key browsing: flat/tree | Present, fragile | Arbitrary key support, lazy loading, stable identity, virtualization |
| CRUD operations | Present, needs safety fixes | Validation, conflict detection, lease preservation, safe prefix deletion |
| Search/filter | Partial | Local substring filter only; add explicit server prefix/range search |
| Connection history & profiles | Partial | Saved local profiles exist; add safe metadata/history storage and edit/test workflows |
| Split-pane UI | Partial | Fixed grid layout exists; add resizable, responsive panes |
| TLS/SSL support | Not found as configurable feature | CA validation, client certificates, server name, secure configuration |
| Pagination | Partial | Client-side slicing only; implement backend cursor pagination |
| Watch/subscribe | Not found | Navigation item is disabled; implement streaming and reconnect semantics |
| Leases / TTL | Partial | Lease ID is displayed; no grant/revoke/keepalive/TTL workflow |
| JSON formatting | Partial | Monaco exists but defaults to YAML; no explicit JSON formatting/validation workflow |
| Bulk operations | Partial | Recursive prefix delete exists; no general bulk workflow or result reporting |
| Import/export JSON | Not found | Versioned, binary-safe format; validation and bounded jobs |
| Prefix/range queries | Partial | Internal prefix reads/deletes exist; no general bounded query UI/API |
| Cluster status & metrics | Partial | Membership, leader status, and database size code exists; endpoint handling is faulty; no time-series metrics |
| Dark mode | Present | Application theme toggle exists; synchronize Monaco and test contrast |
| Keyboard shortcuts | Not found as application feature | Add discoverable shortcuts without overriding editor/browser behavior |
| User/role management (RBAC) | Partial | User CRUD and role assignment/listing exist; add role CRUD and exact/range permission editing |
| Snapshots | Not found | Add controlled snapshot download; keep restore out of the normal running-cluster UI |
| Tabs / multiple connections | Partial | Multiple saved profiles and folder/list tabs exist, not independent connection workspaces |
| P.1 Performance metrics dashboard | Not found in this checkout | No metrics dashboard or `get_cluster_metrics` command found; use a Go HTTP endpoint in this architecture |
| 3.1 SSH tunneling | Planned | Server-managed, authenticated, restricted tunnels |
| 3.2 Distributed locks | Planned | Lease/session-backed lock lifecycle |
| 3.3 Leader election | Planned | Campaign/observe/resign lifecycle |
| 3.4 Transactions | Planned | Compare/then/else execution and editor conflict protection |

## 3. Priority definitions

- **P0:** crash, credential exposure, authorization correctness, unsafe mutation, or resource leak. Fix before feature expansion.
- **P1:** scalability and reliability of everyday browsing/editing. Complete before claiming large-cluster support.
- **P2:** core feature completion and operational visibility.
- **P3:** advanced features after the foundations are stable.

All tasks below start unchecked. Add an owner, linked issue/PR, and measured results when scheduling each item.

## 4. Phase A — correctness, security, and lifecycle (P0)

### A1. Fix request validation and crash paths

- [x] In `http/middlewares/validate.go`, return the backend lookup error rather than `meta, nil`. Invalid-request regression tests ensure handlers are not called.
- [x] In `http/handlers/handler.go`, initialize a non-nil empty result for users without permissions; broader RBAC integration coverage remains in A2.
- [x] Remove unchecked path slicing in `get_keys.go` and `create_directory.go`. Tree regression tests preserve slash/non-slash, repeated/trailing slash, Unicode, and punctuation keys.
- [ ] Validate missing/empty fields, malformed JSON, trailing JSON, request sizes, and query limits. Do not silently normalize actual etcd key bytes as filesystem paths.
- [ ] Add centralized JSON errors with stable codes and appropriate HTTP statuses: invalid request, unauthenticated, forbidden, not found, conflict, unavailable, and timeout. Use `errors.Is` / gRPC status handling rather than scattered direct equality checks.
- [ ] Add panic recovery and request IDs as a final containment layer, not as a substitute for fixes.

**Acceptance:** handler tests cover unknown backend, zero permissions, malformed requests, empty input, missing profile, and non-slash keys without panics or unexplained 500s.

### A2. Correct RBAC-aware listing

`getKeys` currently treats every permission's start key as a prefix, ignores `RangeEnd` and permission type, assumes the username `root` determines full access, and concatenates overlapping results.

- [ ] Model exact keys, half-open byte ranges, unbounded ranges, and read/write permission types correctly.
- [ ] Prefer explicitly requested ranges executed under the caller's identity. If permission discovery requires a privileged client, isolate it, return only necessary metadata, and never perform the user's key operations as the superadmin.
- [ ] Support an authorized non-`root` user with the root role; handle write-only roles without attempting reads.
- [ ] Merge overlapping readable ranges, deduplicate results, and preserve bytewise order and pagination semantics.
- [ ] Ensure revoked roles or changed passwords cannot retain cached authority.

**Acceptance:** integration tests prove exact-key, overlapping-prefix, bounded-range, write-only, root-role, and permission-revocation behavior; denied requests expose neither keys nor values.

### A3. Stop leaking clients and repair shutdown

- [x] Add missing client cleanup in `GetUserList`, `GetUserInfo`, `AssignRole`, `UnassignRole`, and `DeleteUser` in `http/handlers/users.go`.
- [x] Close backend registration clients on authentication failure; provider owns and closes long-lived privileged clients after HTTP shutdown, without duplicate handler-owned clients.
- [x] Configure authenticated long-lived clients with `WithAuth`; an explicit `Authenticate` call alone is not a substitute for client credential configuration.
- [x] Repair `http/server/server.go`: retain the same `*http.Server` that is started instead of copying it, initialize the logger, and treat `http.ErrServerClosed` as normal shutdown.
- [ ] Propagate startup/router errors, add bounded startup/RPC contexts, and implement resource cleanup in `bootstrap.Destruct` instead of waiting out the shutdown deadline unnecessarily.
- [ ] Add a configurable read-header timeout and request/body limits. Later streaming routes need a separate timeout policy from ordinary API requests.

**Acceptance:** repeated user/role requests reach a steady connection/goroutine count; startup failures are explicit; SIGTERM shuts down requests and owned clients without fatal logging on normal exit.

### A4. Protect credentials and destructive actions

- [ ] Stop persisting etcd passwords in `localStorage`; migrate existing profiles by removing stored secrets and requiring reauthentication.
- [ ] Use short-lived opaque server sessions with Secure/HttpOnly/SameSite cookies, explicit logout/expiry, and CSRF protection for mutations. Keep any needed upstream credentials only server-side, bounded in lifetime and never logged.
- [ ] Restrict CORS to configured trusted origins; default to same-origin. Document HTTPS termination for browser-to-adminer traffic and add configurable TLS/mTLS for adminer-to-etcd traffic.
- [ ] Load privileged credentials and TLS/SSH secrets from protected files/environment/secret mounts; remove production reliance on example root credentials.
- [ ] Guard prefix deletion against empty/root prefixes and sibling collisions (`/foo/` versus `/foobar`). Show the exact byte prefix, affected-key preview/count, and explicit confirmation; require stronger confirmation for dangerous scopes.
- [ ] Add a configurable read-only mode and redacted mutation audit events: actor, backend, operation, key/range, outcome, revision, request ID; exclude credentials and values.
- [ ] Protect configuration discovery as appropriate; do not expose internal endpoints or administrative settings unnecessarily.

**Acceptance:** no persistent browser passwords or secret-bearing logs; auth/CSRF/CORS tests pass; recursive deletion never silently expands scope or deletes prefix siblings.

### A5. Fix visible frontend correctness defects

- [ ] Add the missing `await` to `DataService.CreateUser`; handle connection failures where `error.response` is absent in `TestConnection`.
- [ ] Use Axios `params` for keys and proper path-segment encoding for usernames/roles; preserve `?`, `#`, `&`, `%`, spaces, and Unicode.
- [ ] Replace DOM-parent traversal in `tree.js` with explicit node/action callbacks; closing a context menu must not execute an action or throw.
- [ ] Make new-key state explicit and reset it after save/cancel/selection. Repeated new files must initialize correctly and saved keys must refresh the affected listing.
- [ ] Cancel/ignore stale editor reads; rapid selection must never load one key's value into another key's editable state. Disable save during loading/failure and warn before losing dirty edits.
- [ ] Make session reads resilient to missing/corrupt storage; clear dependent state when an active connection is deleted; use supported React Router guards rather than the unused v5-style `render` prop in `App.js`.
- [ ] Replace the obsolete CRA test and cover profile creation/selection/deletion, network failure, context menus, and rapid editor selection.

**Acceptance:** regression tests reproduce the original defects and pass with fixes; editing and connection switching cannot silently target the wrong key or cluster.

## 5. Phase B — backend scalability and key model (P1)

### B1. Bounded cursor pagination and explicit query semantics

- [ ] Replace whole-keyspace browsing with a versioned list contract, for example `GET /api/v1/keys?prefix=...&limit=100&cursor=...` returning `items`, `nextCursor`, `revision`, and `hasMore`.
- [ ] Use etcd keys-only range reads with a default limit of 100 and configurable hard cap (initially 1,000). Fetch values only when selected.
- [ ] Use bytewise key ordering, etcd prefix range-end semantics, and a continuation start strictly after the last returned key. Preserve the original range end on every page.
- [ ] Pin subsequent pages to the first response revision for a consistent view. Bind opaque, validated cursors to query parameters and authorization scope; handle expired/compacted revisions with a clear restart action.
- [ ] Keep revisions, IDs, leases, and other 64-bit identifiers as decimal strings across JSON/JavaScript to avoid precision loss (`http/response/key.go`, `cluster_info.go`).
- [ ] Stop assuming `/` covers the complete keyspace: root currently queries only slash-prefixed keys. Add explicit support for all keys and arbitrary binary key/value representations using an encoding field/base64 where necessary.
- [ ] Separate prefix/range querying from substring search. Substring search is not an etcd server index: label loaded-page filtering honestly, or offer an explicitly bounded/cancellable scan with progress and limits.
- [ ] Design multi-permission-range cursors with deduplication and revision consistency; do not recreate unbounded reads behind a paginated UI.

**Acceptance:** 100k-key datasets load the first page without fetching the remaining keys; complete pagination has no duplicates/skips at the pinned revision; special/binary keys round-trip without changing bytes.

### B2. Lazy tree and cheaper tree construction

- [ ] Return flat key metadata for flat mode instead of building a tree and flattening it again.
- [ ] Load tree prefixes on expansion and cache bounded pages. etcd has no native directory listing: bound each underlying prefix scan and expose continuation for large branches rather than hiding a full scan.
- [ ] Keep virtual directories/draft files in frontend workspace state. `CreateDirectory` currently rereads/rebuilds the entire tree just to add an unsaved node.
- [ ] Represent a key that also has descendants (`/a` and `/a/b`) without losing either entity; distinguish virtual folders from actual keys ending with `/`.
- [ ] Where tree assembly remains, index child lookups with maps instead of repeatedly scanning sibling slices in `filetree/tree.go`; sort once for deterministic output.
- [ ] Use key/prefix-derived stable IDs, preserving expansion and selection across refreshes; test deep nesting and large sibling counts.

**Acceptance:** expansion and draft creation do not require a whole-keyspace response; tree/list selection refers to the same raw key; benchmarks demonstrate reduced allocations and sibling lookup cost.

### B3. Reuse connections safely and bound expensive work

- [ ] Introduce an injected client manager shared by handlers instead of repeated dial/auth/close cycles.
- [ ] Scope reusable clients by backend + authenticated session/credential version + TLS configuration. Never share a privileged or differently authenticated client with another caller.
- [ ] Bound client count, idle lifetime, and concurrent acquisition; close idle/evicted clients only after active requests release them. Invalidate on logout, credential changes, and configuration changes.
- [ ] Add operation-specific deadlines, cancellation propagation, bounded concurrency, and per-session limits. Retry only operations whose semantics permit it; do not blindly replay mutations.
- [ ] Fix cluster status to query `ClientURLs`, not `PeerURLs[0]`; handle empty/unreachable advertised URLs and configured address mappings safely.
- [ ] Query member status with bounded parallelism and per-member deadlines; return partial results with per-node errors rather than failing every node when one member is unavailable.
- [ ] Cache short-lived cluster status per authorized backend scope, coalesce duplicate refreshes, and avoid key/value caches until invalidation and authorization rules are proven.

**Acceptance:** warmed repeated reads reuse connections, cross-user isolation tests pass, connection counts remain bounded, and one failed member does not hide healthy-member status.

## 6. Phase C — responsive frontend and safe editing (P1)

- [ ] Replace `new Promise(async ...)` wrappers and repeated Axios configuration in `ui/src/data/service.js` with a small shared client, straightforward `async` methods, typed/validated responses, and normalized errors.
- [ ] Pass explicit workspace/backend identity to requests rather than consulting a mutable global active session at request time.
- [ ] Adopt a bounded server-state cache (a query library or equivalent), with cache keys including session/backend/query/revision; clear it on logout and invalidate affected prefixes after mutations.
- [ ] Add request cancellation and stale-response guards on unmount, key change, query change, and connection change. Debounce search and prevent duplicate submissions.
- [ ] Use server pagination in list mode; virtualize visible tree rows and any large lists instead of rendering every node recursively.
- [ ] Lazy-load editor/admin routes and Monaco, move component definitions out of `editor.js` render, and measure bundle impact before larger framework migrations.
- [ ] Replace fixed 800/650px layouts with accessible resizable panes and responsive sizing; persist non-secret layout preferences and synchronize Monaco theme.
- [ ] Support text/JSON/YAML/base64 modes, explicit JSON validation/formatting, large-value warnings, dirty-state tracking, and accessible error/status messages.
- [ ] Implement revision-aware save using an etcd transaction comparing `mod_revision`; for new keys compare `version == 0`. Return a conflict with reload/diff options instead of silently overwriting.
- [ ] Preserve attached leases by default on edits unless the user explicitly changes/removes them; show TTL behavior before saving.

**Acceptance:** navigation stays responsive on a 100k-key fixture, out-of-order responses cannot overwrite current workspace state, conflicting writes produce a conflict UI, and editing a leased key does not accidentally remove its TTL.

## 7. Phase D — complete core administration features (P2)

### D1. P.1 Performance metrics dashboard

The supplied checklist mentions a missing `get_cluster_metrics` command. This repository is HTTP-based, not a command-bridge app; implement `GET /api/v1/cluster/metrics` unless another frontend/backend is supplied.

- [ ] First fix cluster status (B3). Define a metrics schema with timestamps, source, units, member identity, availability, and sample freshness.
- [ ] Show member health, leader, version, DB size/in-use, quota utilization where available, raft term/index/applied-index lag, and alarms using supported status/maintenance APIs.
- [ ] For rates and histograms (request throughput, latency, WAL fsync, backend commit), use configured etcd Prometheus endpoints or a Prometheus datasource. Do not invent historical rates from one status snapshot.
- [ ] Restrict/validate metrics destinations server-side, including redirects and resolved addresses, to prevent arbitrary server-side URL fetching. Configure metrics auth/TLS separately where needed.
- [ ] Add overview cards, per-member views, time-series charts, refresh controls, stale/error indicators, and actionable alarm explanations. Distinguish adminer HTTP latency from etcd operation latency.
- [ ] Coalesce backend polling, use bounded retention or an external time-series store, pause hidden-tab polling, and use an initial refresh interval of 10–30 seconds with backoff.

**Acceptance:** no full key scans for metrics; a disconnected member yields a partial dashboard; denied/missing metrics are shown as unavailable, not zero; no unbounded in-memory time-series growth.

### D2. Watch / subscribe

- [ ] Add an authenticated SSE endpoint (or WebSocket if justified) for exact-key/prefix watches, with explicit start revision, cancellation, heartbeats, and resource limits.
- [ ] Establish initial listing at revision R and watch from R+1; deduplicate/reconcile snapshot events, and resume from the last delivered revision after reconnect.
- [ ] Handle compaction with a fresh snapshot, permission changes with termination/re-authentication, and slow consumers with bounded buffers plus explicit resync—not silent event loss.
- [ ] Patch only affected cached pages/nodes, indicate stale query membership where needed, batch renders, and cap the visible event log.

**Acceptance:** disconnect/reconnect, compaction, delete, lease expiry, high event rate, and logout tests show no silent gaps or leaked watchers.

### D3. Leases / TTL

- [ ] Implement lease list/detail/TTL, grant, attach/detach, revoke, and explicit keepalive controls, respecting caller permissions.
- [ ] Make the ownership model clear: temporary browser workspaces versus deliberately server-managed sessions; cancel owned keepalives on logout/expiry.
- [ ] Preview attached-key impact before revoke and clearly explain that expiration/revocation deletes keys.

### D4. Bulk operations and import/export

- [ ] Add selected-key delete and bounded prefix export/import with progress, cancellation, size/key-count limits, and per-item results.
- [ ] Define a versioned JSON format with explicit key/value encoding and optional metadata. Do not imply that revisions or lease IDs can be restored unchanged.
- [ ] Validate before mutation; provide dry-run conflict/overwrite previews and an explicit overwrite policy. Make partial completion and non-atomic batches visible.
- [ ] Use transactions only within supported operation/request limits; larger jobs must state that they are not globally atomic. Make retries safe with job IDs and clear outcome tracking.
- [ ] Keep export pages at one revision; fail/restart clearly on compaction. Use bounded streaming/chunking rather than loading full exports into browser/backend memory.

### D5. RBAC, workspaces, and usability

- [ ] Add role create/delete, exact/range/prefix permission grant/revoke, user password changes, capability-aware UI, and stronger confirmation for removing administrative access.
- [ ] Add independent connection tabs with isolated requests, drafts, watches, and selection; clearly label backend/environment and warn before production mutations.
- [ ] Improve profile editing, connection diagnostics, recent connections, and import/export of non-secret profile metadata.
- [ ] Add keyboard shortcuts (save, search, refresh, tab navigation), a shortcut help panel, keyboard tree/context-menu access, focus management, and screen-reader labels.

### D6. Snapshots

- [ ] Add authorized, streamed etcd snapshot download with cancellation, integrity/status metadata, bounded concurrency, and disk/download size controls.
- [ ] Distinguish binary cluster snapshots from logical JSON export. Treat snapshots as sensitive data; audit downloads and never leave world-readable temporary files.
- [ ] Document offline restore using the supported etcd tooling/version. Do not implement one-click overwrite/restore of a live production cluster.

## 8. Phase E — advanced features (P3)

Implement 3.4 before 3.2/3.3; editor conflict detection should use a small internal transaction path earlier in Phase C.

| ID | Feature | Implementation and release gate |
| --- | --- | --- |
| 3.4 | Transactions | Compare/then/else builder with revision/version/value/lease comparisons, read/put/delete operations, limits, readable execution preview, and results per branch. Test atomicity and failed comparisons. Do not claim a preview reserves state. |
| 3.1 | SSH tunneling | Run tunnels on the backend, not in the browser. Require host-key verification, protected credentials, destination allowlists/authorization, timeouts, idle cleanup, and reconnect/error reporting. Ensure TLS names and multi-member routing still work through tunnels; test cleanup after logout and failures. |
| 3.2 | Distributed locks | Use etcd concurrency sessions with lease-backed ownership, cancellable acquisition, timeout, release, and loss-of-ownership reporting. Explain fencing using revision-based tokens: a held lock alone cannot prevent stale external writes. Never release another session's lock. |
| 3.3 | Leader election | Use etcd concurrency election primitives for campaign/observe/proclaim/resign; bind ownership to a managed session and show leader revision/value. Test leader failure, lease expiry, reconnect, and cleanup. Clarify this is application election, not control of etcd's Raft leader. |

## 9. Technical debt and delivery infrastructure

- [ ] Introduce a small service/repository boundary and dependency injection for configuration, clients, and timeouts; avoid mutable `config.AppConfig` in handlers and duplicating privileged client ownership.
- [ ] Publish an OpenAPI contract and migrate incrementally to versioned routes. Include a compatibility/migration strategy for old profiles and key/ID response formats.
- [ ] Execute the explicit runtime/library upgrade and CRA-to-Vite roadmap in sections 9.1–9.3 using separate, testable PRs rather than combining every migration with bug fixes.
- [ ] Pin maintained Node/Go/container images; replace `node:latest`, Go 1.16, Alpine 3.9, and the old etcd 3.2.5 development image. Use `npm ci` and a non-root runtime with only required files/permissions.
- [ ] Use isolated Docker volumes per test cluster and documented TLS/auth fixtures; avoid depending on a shared host `/srv/docker/etcd` path.
- [ ] Update CI to test all Go packages (`go test ./...`, not Dockerfile's package-local `go test -v`), race tests, vet/static analysis, frontend tests/build/lint, and integration/E2E tests.
- [ ] Separate PR validation from credentialed publishing in `.github/workflows/main.yaml`; publish only on trusted release events, with least-privilege permissions and pinned action versions.
- [ ] Add dependency/container vulnerability checks, secret scanning, and an upgrade policy. Record scan results rather than assuming every old dependency has an exploitable issue.
- [ ] Add health/readiness endpoints, structured redacted logs, request/RPC timing, active-client/watch/job gauges, bounded metric cardinality, and opt-in protected profiling. Never use raw keys/usernames as metrics labels.
- [ ] Update README configuration, architecture, support matrix, feature statuses, deployment security, backup/restore, troubleshooting, and performance limits after each milestone.

### 9.1. Runtime and dependency modernization (P1)

Resolve exact versions from official release/support documentation when implementation starts; pin the selected versions in manifests, lockfiles, Docker, and CI. The targets below are selection rules, not claims that an unverified release is currently latest. Prefer supported stable releases over prereleases or blindly updating everything to `latest`.

| Component | Current checkout | Upgrade target / migration notes |
| --- | --- | --- |
| Go | `go.mod` / Docker: 1.16; CI: 1.17 | Latest supported stable Go release; align minimum Go version, build image, local tooling, and CI. Test the previous supported Go release where compatible. |
| etcd Go API/client | 3.5.1 | Maintained compatible etcd API/client release, upgraded together; explicitly test the chosen server-version matrix rather than assuming all v3 servers behave identically. |
| React / React DOM | 17.0.2 | Current stable supported React major (evaluate React 19 or newer stable at implementation); keep React and React DOM aligned. Use React 18 as a temporary migration step only if needed. |
| Frontend build | CRA / `react-scripts` 5.0.0 | Current stable Vite with the official React plugin; remove CRA after parity checks. |
| Node.js | Docker uses `node:latest`; no declared engine | Maintained Node LTS compatible with selected Vite/test tooling; pin in `engines`, a local version file, CI, and Docker. |
| MUI / Emotion | MUI 5.2.x, lab alpha, Emotion 11.x | Current stable mutually compatible versions; replace legacy lab tree components with supported MUI X Tree View or another maintained, accessible solution after checking virtualization/licensing needs. |
| React Router | 6.2.1 | Current supported stable release using its documented incremental upgrade path; preserve SPA routing and fix guards before considering optional router features. |
| Axios | 0.24.0 | Current maintained stable Axios; use supported cancellation APIs and test auth/error behavior. Native `fetch` is optional, not a necessary rewrite. |
| Monaco wrapper/editor | Wrapper 4.3.1 | Current React-compatible wrapper plus explicitly managed Monaco dependency; verify Vite worker bundling, CSP, and offline/self-hosted operation. |
| Tests / lint | CRA-managed Jest/ESLint, older Testing Library | Vitest, jsdom, compatible Testing Library/user-event, standalone ESLint with React Hooks rules, and Playwright for E2E; pin compatible versions. |
| Other Go dependencies | Mux 1.8.0, Zap 1.19.1, old YAML prerelease, `go-make` 1.1.0 | Audit direct/transitive modules, upgrade maintained compatible releases, and evaluate replacements only where maintenance/security justifies them. Do not replace Mux solely because of age. |
| Containers / local cluster | Alpine 3.9, etcd 3.2.5 | Maintained pinned runtime and supported etcd test images, with reproducible builds and non-root execution. |

- [ ] Inventory direct/transitive dependencies and peer requirements; record initial build/test results, bundle size, licenses, and vulnerability findings.
- [ ] Upgrade Go/toolchain and Go modules separately from the frontend. Run `go mod tidy`, review indirect dependency changes, and run unit/race/integration tests plus `go vet` and `govulncheck`.
- [ ] Update React entry code in `ui/src/index.js` to the supported `createRoot` API; verify automatic batching, effect cleanup, Strict Mode behavior, and third-party React compatibility.
- [ ] Upgrade MUI, tree components, Router, and Monaco in isolated PRs; use migration guides/codemods where appropriate and review resulting accessibility/behavior changes.
- [ ] Update Testing Library alongside React and make async tests/effect cleanup deterministic; do not disable Strict Mode just to hide duplicate-effect bugs.
- [ ] Add scheduled dependency-update PRs (Dependabot/Renovate or equivalent), release-note review for majors, and a documented patch/security update cadence.

**Acceptance:** clean installs and production builds succeed on the pinned supported toolchains; no unexplained peer-dependency overrides; auth, routing, tree, editor, and TLS integration tests pass; remaining scan findings have documented disposition.

### 9.2. Replace Create React App with Vite (P1, recommended)

Vite should improve development startup/HMR and simplify the maintained build pipeline. It does **not** by itself fix runtime bottlenecks such as full-keyspace reads or rendering every tree node; Phase B/C remain required.

- [ ] Introduce `ui/vite.config.*` with the official React plugin and migrate `ui/public/index.html` to Vite's `ui/index.html` module entry; preserve favicon, manifest, asset URLs, and application metadata.
- [ ] Audit JSX inside existing `.js` files. Rename JSX-bearing modules to `.jsx` and update references as needed rather than assuming Vite will parse all current files unchanged.
- [ ] Replace CRA scripts with Vite dev/build/preview scripts and a separate Vitest test script. Update README, Makefile/shell scripts, Docker build commands/output copy paths, and CI together.
- [ ] Remove `react-scripts` and CRA-only configuration after identifying which test/lint/polyfill behavior must be configured explicitly. Remove obsolete CRA documentation once replacements exist.
- [ ] Replace `process.env.NODE_ENV` / `REACT_APP_*` usage with appropriate `import.meta.env` conventions. Treat all `VITE_*` variables as public build-time data—never place secrets there.
- [ ] Configure a development `/api` proxy to Go, keep production API calls same-origin, and remove hardcoded Axios development base URLs from `App.js`. Do not use permissive production CORS to make development work.
- [ ] Preserve the Go SPA serving contract: configure Vite output to the directory copied into `/app/static`, or update Docker consistently. Test nested-route refreshes and deployment base paths; unknown `/api/*` routes must return API errors, not `index.html`.
- [ ] Configure Monaco workers and lazy loading explicitly; self-host editor assets rather than relying on an external CDN. Verify JSON/YAML modes actually work with the selected editor setup.
- [ ] Migrate `setupTests.js` and tests from implicit Jest globals/mocks to Vitest equivalents, including CSS/assets, jsdom, and Testing Library cleanup; keep lint as a separate CI step.
- [ ] Compare cold dev startup, HMR latency, production build time, compressed bundle sizes, and functional behavior before removing the old pipeline. Vite preview is for local checks, not the production server.

**Acceptance:** one documented dev command runs HMR with the API proxy; a clean locked install builds successfully; the Go/Docker-served production SPA, nested routes, editor workers, assets, tests, and lint all work without CRA.

### 9.3. Additional measured performance improvements (P1/P2)

- [ ] Add bundle analysis and size budgets; route-split Monaco, charts, snapshots, and RBAC screens so browsing connections does not download every administration feature eagerly.
- [ ] Keep dependencies tree-shakeable and avoid duplicate React/MUI packages. Split chunks based on measured caching/loading behavior, not an arbitrary chunk-per-library policy.
- [ ] Serve content-hashed static assets with long-lived immutable caching and `index.html` with revalidation; add ETags and gzip/Brotli at the reverse proxy or a measured server implementation. Do not cache private API responses as public assets.
- [ ] Use React Profiler and browser performance traces to identify costly updates before adding memoization. Consider deferred/non-urgent updates for expensive filtering; avoid applying deferred values to mutation targets or auth identity.
- [ ] Move demonstrably expensive JSON formatting/import parsing to Web Workers with size limits and cancellation. Prefer streaming/bounded server jobs for large transfers rather than duplicating entire datasets in worker messages.
- [ ] Evaluate TypeScript incrementally for API/session/workspace models, ideally aligned with OpenAPI types. This is a correctness/maintenance improvement, not a runtime speed claim.
- [ ] Profile Go allocations/CPU before micro-optimizations. Consider profile-guided optimization only with representative workloads and reproducible evidence; prioritize query bounds, connection reuse, and cancellation first.
- [ ] Keep SSR/Next.js, React Compiler, a state-library rewrite, and replacing the HTTP router optional. Adopt them only when compatibility and measurements show a real benefit for this authenticated admin SPA.

**Acceptance:** publish before/after build and runtime measurements; no security, accessibility, or functional regressions; record explicit exceptions when a feature justifies increasing a bundle budget.

## 10. Test and performance acceptance plan

### Required test layers

| Layer | Coverage |
| --- | --- |
| Unit | Key/range/cursor byte semantics, malformed JSON, tree edge cases, empty roles, request error mapping, session migration, frontend state/races |
| Handler/contract | Auth/capabilities, HTTP statuses, response schemas, pagination, limits, partial status, large integer strings |
| Real etcd integration | TLS/mTLS, auth/no-auth, exact/range RBAC, CAS conflicts, lease preservation/expiry, revision compaction, watch resume, transactions, snapshots |
| Browser E2E | Connect → browse → edit → conflict → delete; profiles/tabs; no secret persistence; network errors; theme/keyboard/accessibility |
| Fault/load | Member outage, slow RPCs, disconnects, cancelled jobs, expired sessions, concurrent users, large keyspaces, bounded memory/connections/watch buffers |

### Benchmark datasets and procedure

- Record baseline and post-change results using the same pinned three-node cluster, machine resources, network delay, browser, and build mode.
- Seed 1k, 10k, and 100k keys with shallow/wide and deeply nested prefixes; include non-slash/binary keys, Unicode, overlapping RBAC ranges, and representative small/large values.
- Run sequential browsing plus 1/10/50 concurrent-user scenarios. Measure cold versus warm requests separately; run a 30-minute soak after warm-up.
- Capture p50/p95/p99 API latency, first-page usable time, transfer bytes, browser long tasks/heap, Go allocations/heap/goroutines, RPC counts, active connections, and bundle sizes.

### Initial budgets (confirm against the baseline)

| Area | Proposed acceptance target |
| --- | --- |
| First page | For 100k keys and a healthy local test cluster, warm keys-only API page p95 ≤ 300 ms and usable browser page ≤ 1 second |
| Data loading | Default ≤ 100 items/request; server cap initially 1,000; no initial full-keyspace tree or values fetch |
| Interaction | Common selection/search-input interactions < 100 ms; virtualization prevents DOM growth proportional to total keys |
| Connections | Repeated requests reuse scoped clients; active clients remain within configured caps |
| Resource stability | No sustained connection/goroutine/heap growth after warm-up during the 30-minute fixed-workload soak |
| Failure behavior | Per-operation deadlines are enforced; one failed member does not block healthy-member results; cancelled operations release owned resources |
| Security/correctness | No cross-user/cache leakage, silent overwrites, lost lease attachment, unsafe prefix expansion, or persistent browser passwords |

Avoid raising timeouts as the primary performance fix. Current 30/60-second frontend/backend timeouts do not replace bounded queries or efficient rendering.

## 11. Suggested implementation sequence / release gates

1. **Stability release:** A1–A5, targeted regression tests, baseline measurements, and minimal CI improvements. Gate: no known P0 defect remains and secrets are migrated safely.
2. **Scalability and modernization release:** B1–B3, Phase C, and sections 9.1–9.3 in separate PRs. After the stability baseline, sequence supported toolchains/dependencies → Vite parity → React/UI major upgrades, adjusting for peer requirements; do not block urgent bounded-query fixes on cosmetic migrations. Gate: real cursor pagination, arbitrary-key safety, isolated client reuse, conflict-safe edits, maintained toolchains, CRA removal, and benchmark budgets met or explicitly revised with evidence.
3. **Observability release:** D1 and D2. Gate: honest partial metrics, bounded polling/history/watch buffers, tested reconnect/compaction behavior.
4. **Administration release:** D3–D6. Gate: tested TTL, bulk/import/export, RBAC, workspace, and snapshot safety workflows; docs accurately reflect end-to-end features.
5. **Advanced release:** 3.4 → 3.1 → 3.2/3.3, with independently reviewed security and failure semantics.

Each release should consist of small, reviewable PRs, with regression tests first where practical. A feature is “done” only when its backend, UI, authorization, cancellation/error behavior, tests, and documentation are complete—not because a button, navigation item, or client library API exists.

## 12. Implementation journal

- **Request/tree safety:** fixed unknown-backend propagation, empty listing initialization, lossless display-tree key paths, and added bounded strict JSON decoding to key/draft mutations. Prefix directory deletion now excludes sibling prefixes and rejects empty/root scopes; preview/confirmation improvements remain pending. `go test -race ./...` passes. `go vet ./...` identified the existing copied HTTP-server lock; lifecycle repair is the next commit. Full A1/A4 acceptance is not yet complete.
- **Lifecycle repair:** fixed per-request user/role leaks, authenticated backend ownership and cleanup, startup error propagation, synchronous listener binding, and same-instance graceful shutdown. Added real HTTP listener/shutdown and bind-conflict tests. `go test -race ./...` and `go vet ./...` pass. Configurable deadlines and soak coverage remain pending.
