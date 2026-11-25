# etcd Adminer: stability, performance, and feature plan

### UI redesign implementation checkpoint

- Key prefixes auto-filter after a short debounce, without an Apply button.
  Stale reads/live streams are cancelled; pagination resets and drafts are retained.

- Added a full-path New key/value dialog available in both key-browser views.
  It uses the existing create-only key API, supports cancellation, preserves input
  and unrelated editor drafts, and does not require pre-creating virtual folders.

- Added folder duplication via the key-tree context menu. It reuses bounded,
  caller-scoped export/transfer APIs: one source snapshot, create-only destination
  preview, typed confirmation and explicit per-batch progress/unknown outcomes.
  Source keys/values are unchanged; copies are unleased. No backend/API expansion
  or destructive DEV testing is required.

- Implemented shared layouts and the blue redesign across every existing feature page,
  including responsive navigation, Connections/reauthentication, Cluster/Metrics,
  Keys/editor/dialogs, transfer, leases, watches, users, roles and About.
- Workspace tabs surface unsaved drafts, live watches, renewal and transfer activity.
- Validation: 75 frontend tests, ESLint, Go tests and production Chromium journeys
  at 375/720/768/1280/1440/1920px in both themes passed. Reauthentication retains drafts.
- Fine-grained state-fixture, metric filtering and manual screen-reader/native-zoom
  acceptance follow-ups are documented explicitly in `ui/UX_PLAN.md`.
- Testing uses API fixtures, not destructive operations against DEV. No push performed.

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
| Connection history & profiles | Core profiles implemented | Non-secret saved profiles, edit/retest, cancellable diagnostics and workspace reopening; recent-history ordering and metadata import/export remain pending |
| Split-pane UI | Partial | Fixed grid layout exists; add resizable, responsive panes |
| TLS/SSL support | Implemented | Per-backend verified TLS/mTLS, private CA and server-name options, no plaintext downgrade; real mTLS/RBAC integration tests pass |
| Pagination | Implemented, broader load validation pending | UI uses bounded server cursor pages; snapshot/compaction and 100k-key tests pass; legacy whole-tree endpoint is deprecated |
| Watch/subscribe | Implemented viewer and browser updates | Authenticated resumable SSE, live prefix-page patches and draft-safe stale indicators; automatic compaction resnapshot remains pending |
| Leases / TTL | Implemented core workflow | Admin inventory/detail/grant/revoke/renew, revision-safe attach/detach and optional 15-minute browser-workspace renewal; durable server keepalive remains future work |
| JSON formatting | Implemented | Explicit format/validation action with JSON/YAML/text modes; malformed JSON preserves the draft |
| Bulk operations | Implemented bounded batches | Selected exact-key delete/import previews, typed confirmation and atomic CAS results; large resumable jobs remain pending |
| Import/export JSON | Implemented paged workflow | Versioned binary-safe files, fixed-snapshot exports, validated create/overwrite imports and cancellation; single-file large streaming jobs remain pending |
| Prefix/range queries | Partial | Internal prefix reads/deletes exist; no general bounded query UI/API |
| Cluster status & metrics | Maintenance dashboard implemented | Bounded configured-endpoint Status/alarms, DB/quota/lag, freshness and local trends; Prometheus throughput/latency remains pending |
| Dark mode | Present | Application theme toggle exists; synchronize Monaco and test contrast |
| Keyboard shortcuts | Implemented core shortcuts | Help, workspace switching, focused save/prefix/refresh, keyboard tree selection/context menu; full accessibility audit remains pending |
| User/role management (RBAC) | Implemented core workflow | Role/permission and user/password management, explicit root promotion, protected admins and capability-aware navigation/editor hints |
| Snapshots | Not found | Add controlled snapshot download; keep restore out of the normal running-cluster UI |
| Tabs / multiple connections | Implemented browser workspaces | Four connection-bound tabs retain drafts, selection and watches with explicit close/disconnect cleanup; reload/deep-link restoration remains pending |
| P.1 Performance metrics dashboard | Implemented maintenance baseline | `/api/v1/cluster/metrics` and Overview; external Prometheus rates/histograms remain pending |
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

- [x] Model exact keys, half-open byte ranges, unbounded ranges, and read/write permission types correctly; real etcd tests verify exact versus descendant access.
- [ ] Add explicit user-requested paginated ranges. Existing listing now authenticates before privileged permission discovery and performs all key reads under the caller's identity.
- [x] Support an authorized non-`root` user with the root role; handle write-only roles without attempting reads.
- [ ] Complete pagination semantics for merged ranges. Existing whole-list reads merge overlap/adjacency, deduplicate, sort bytewise, and pin multi-range reads to one revision.
- [x] Re-read permissions and authenticate on each listing; real etcd tests cover role revocation and incorrect credentials, without cached authority.

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

- [x] Stop persisting etcd passwords in `localStorage`; scrub legacy profile passwords, retain credentials only in tab memory, and require reauthentication after reload. Disconnect/deletion clears held credentials.
- [ ] Use short-lived opaque server sessions with Secure/HttpOnly/SameSite cookies, explicit logout/expiry, and CSRF protection for mutations. Keep any needed upstream credentials only server-side, bounded in lifetime and never logged.
- [x] Add configurable verified TLS/mTLS for adminer-to-etcd traffic, with HTTPS reverse-proxy origin configuration documented separately. Wildcard CORS is removed and cross-origin mutations are rejected.
- [x] Support privileged password files/environment sources and protected TLS file mounts, with explicit production examples instead of relying on inline development passwords. SSH secret handling will be part of the future tunneling feature.
- [ ] Guard prefix deletion against empty/root prefixes and sibling collisions (`/foo/` versus `/foobar`). Show the exact byte prefix, affected-key preview/count, and explicit confirmation; require stronger confirmation for dangerous scopes.
- [ ] Add redacted mutation audit events (actor/backend/operation/key/outcome/revision/request ID, never credentials/values). Configurable server-enforced read-only mode and fail-closed frontend controls are implemented.
- [ ] Protect configuration discovery as appropriate; do not expose internal endpoints or administrative settings unnecessarily.

**Acceptance:** no persistent browser passwords or secret-bearing logs; auth/CSRF/CORS tests pass; recursive deletion never silently expands scope or deletes prefix siblings.

### A5. Fix visible frontend correctness defects

- [x] Await `DataService.CreateUser` and preserve transport errors when `error.response` is absent; regression tests cover both paths.
- [x] Use Axios `params` for keys and proper path-segment encoding for usernames/roles; service tests preserve punctuation and Unicode.
- [x] Replace DOM-parent traversal in `tree.jsx` with explicit node/action callbacks; context-menu dismissal only closes the menu.
- [x] Reset new-key state after save/selection, reinitialize consecutive drafts, and refresh the listing after save. Regression tests cover consecutive new keys.
- [ ] Complete dirty-edit guarding across all in-app navigation. Editor reads now cancel/ignore stale responses, save is disabled during loading/failure, key switching asks before discarding, and browser unload warns; regression tests cover stale responses and failed reads.
- [ ] Make session reads resilient to missing/corrupt storage; clear dependent state when an active connection is deleted; use supported React Router guards rather than the unused v5-style `render` prop in `App.js`.
- [ ] Replace the obsolete CRA test and cover profile creation/selection/deletion, network failure, context menus, and rapid editor selection.

**Acceptance:** regression tests reproduce the original defects and pass with fixes; editing and connection switching cannot silently target the wrong key or cluster.

## 5. Phase B — backend scalability and key model (P1)

### B1. Bounded cursor pagination and explicit query semantics

- [x] Replace UI whole-keyspace browsing with `GET /api/v1/keys?prefix=...&limit=100&cursor=...` returning `items`, `nextCursor`, `revision`, and `hasMore`; legacy API is explicitly deprecated.
- [ ] Make the hard cap configurable. New API already uses keys-only reads, default 100 and enforced cap 1,000; values load only on selection.
- [x] Use bytewise key ordering, prefix range-end semantics, and continuation strictly after the last key, preserving bounds across pages.
- [x] Pin pages to the first revision; sign cursors with query/backend/user/credential scope and 10-minute expiry. Compaction produces a structured conflict and the UI provides restart.
- [ ] Keep revisions, IDs, leases, and other 64-bit identifiers as decimal strings across JSON/JavaScript to avoid precision loss (`http/response/key.go`, `cluster_info.go`).
- [ ] Stop assuming `/` covers the complete keyspace: root currently queries only slash-prefixed keys. Add explicit support for all keys and arbitrary binary key/value representations using an encoding field/base64 where necessary.
- [x] Separate server prefix queries from explicitly labelled loaded-page substring filtering. General range queries and optional cancellable global scans remain future features.
- [x] Page over merged readable permission ranges with deduplication and revision consistency, fetching at most limit+1 records per page request.

**Acceptance:** 100k-key datasets load the first page without fetching the remaining keys; complete pagination has no duplicates/skips at the pinned revision; special/binary keys round-trip without changing bytes.

### B2. Lazy tree and cheaper tree construction

- [x] Return flat metadata directly; build only a bounded page-local tree in the browser, without flattening a backend whole-tree response.
- [ ] Load tree prefixes on expansion and cache bounded pages. etcd has no native directory listing: bound each underlying prefix scan and expose continuation for large branches rather than hiding a full scan.
- [x] Keep virtual directories/draft files in frontend state; creating drafts no longer calls the legacy whole-tree endpoint.
- [ ] Represent a key that also has descendants (`/a` and `/a/b`) without losing either entity; distinguish virtual folders from actual keys ending with `/`.
- [ ] Where tree assembly remains, index child lookups with maps instead of repeatedly scanning sibling slices in `filetree/tree.go`; sort once for deterministic output.
- [ ] Use key/prefix-derived stable IDs, preserving expansion and selection across refreshes; test deep nesting and large sibling counts.

**Acceptance:** expansion and draft creation do not require a whole-keyspace response; tree/list selection refers to the same raw key; benchmarks demonstrate reduced allocations and sibling lookup cost.

### B3. Reuse connections safely and bound expensive work

- [ ] Introduce an injected client manager shared by handlers instead of repeated dial/auth/close cycles.
- [ ] Scope reusable clients by backend + authenticated session/credential version + TLS configuration. Never share a privileged or differently authenticated client with another caller.
- [ ] Bound client count, idle lifetime, and concurrent acquisition; close idle/evicted clients only after active requests release them. Invalidate on logout, credential changes, and configuration changes.
- [ ] Add operation-specific deadlines, cancellation propagation, bounded concurrency, and per-session limits. Retry only operations whose semantics permit it; do not blindly replay mutations.
- [ ] Add configured client-address mappings. Status already uses advertised client URLs (with fallback), not peer URLs, and safely reports empty/unreachable endpoints.
- [x] Query status with at most four workers, per-member/toplevel deadlines, and partial results with per-node errors; unavailable measurements are null, not misleading zeroes.
- [ ] Cache short-lived cluster status per authorized backend scope, coalesce duplicate refreshes, and avoid key/value caches until invalidation and authorization rules are proven.

**Acceptance:** warmed repeated reads reuse connections, cross-user isolation tests pass, connection counts remain bounded, and one failed member does not hide healthy-member status.

## 6. Phase C — responsive frontend and safe editing (P1)

- [ ] Complete service response validation/error normalization. Shared Axios configuration, straightforward `async` methods, injected session storage, and cancellation options for key reads are implemented; typed response validation remains pending.
- [ ] Pass explicit workspace/backend identity to requests rather than consulting a mutable global active session at request time.
- [ ] Adopt a bounded server-state cache (a query library or equivalent), with cache keys including session/backend/query/revision; clear it on logout and invalidate affected prefixes after mutations.
- [ ] Add request cancellation and stale-response guards on unmount, key change, query change, and connection change. Debounce search and prevent duplicate submissions.
- [ ] Use server pagination in list mode; virtualize visible tree rows and any large lists instead of rendering every node recursively.
- [ ] Lazy-load editor/admin routes and Monaco, move component definitions out of `editor.js` render, and measure bundle impact before larger framework migrations.
- [ ] Replace fixed 800/650px layouts with accessible resizable panes and responsive sizing; persist non-secret layout preferences and synchronize Monaco theme.
- [ ] Support text/JSON/YAML/base64 modes, explicit JSON validation/formatting, large-value warnings, dirty-state tracking, and accessible error/status messages.
- [x] Implement revision-aware save using an etcd transaction comparing `mod_revision`; new keys compare `version == 0`. Conflicts preserve the draft and offer explicit reload; a visual diff remains a future improvement.
- [ ] Complete TTL controls/preview. Existing-key edits now preserve their attached lease using `WithIgnoreLease`, verified against real etcd.

**Acceptance:** navigation stays responsive on a 100k-key fixture, out-of-order responses cannot overwrite current workspace state, conflicting writes produce a conflict UI, and editing a leased key does not accidentally remove its TTL.

## 7. Phase D — complete core administration features (P2)

### D1. P.1 Performance metrics dashboard

Implemented maintenance dashboard checkpoint: bounded concurrent Status sampling
of operator-configured endpoints, partial availability, DB/quota, Raft apply lag,
alarm guidance, freshness, hidden-tab polling pause/backoff, and 60-sample local
DB trends. No key scans or browser-supplied metric URLs. Prometheus throughput,
latency histograms and WAL/commit-rate integration remain unavailable/pending.

The supplied checklist mentions a missing `get_cluster_metrics` command. This repository is HTTP-based, not a command-bridge app; implement `GET /api/v1/cluster/metrics` unless another frontend/backend is supplied.

- [ ] First fix cluster status (B3). Define a metrics schema with timestamps, source, units, member identity, availability, and sample freshness.
- [ ] Show member health, leader, version, DB size/in-use, quota utilization where available, raft term/index/applied-index lag, and alarms using supported status/maintenance APIs.
- [ ] For rates and histograms (request throughput, latency, WAL fsync, backend commit), use configured etcd Prometheus endpoints or a Prometheus datasource. Do not invent historical rates from one status snapshot.
- [ ] Restrict/validate metrics destinations server-side, including redirects and resolved addresses, to prevent arbitrary server-side URL fetching. Configure metrics auth/TLS separately where needed.
- [ ] Add overview cards, per-member views, time-series charts, refresh controls, stale/error indicators, and actionable alarm explanations. Distinguish adminer HTTP latency from etcd operation latency.
- [ ] Coalesce backend polling, use bounded retention or an external time-series store, pause hidden-tab polling, and use an initial refresh interval of 10–30 seconds with backoff.

**Acceptance:** no full key scans for metrics; a disconnected member yields a partial dashboard; denied/missing metrics are shown as unavailable, not zero; no unbounded in-memory time-series growth.

### D2. Watch / subscribe

- [x] Add authenticated exact/prefix SSE watches with explicit resume revision, cancellation, heartbeats, size limits, per-principal/global stream quotas, and bounded pending responses.
- [x] Establish initial listing at revision R and watch from R+1; deduplicate/reconcile page events, and resume from the last delivered revision after reconnect.
- [ ] Handle compaction with a fresh snapshot, permission changes with termination/re-authentication, and slow consumers with bounded buffers plus explicit resync—not silent event loss.
- [x] Patch only affected cached page nodes in revision batches, indicate stale query membership, preserve editor drafts, and cap the standalone event log.

**Acceptance:** disconnect/reconnect, compaction, delete, lease expiry, high event rate, and logout tests show no silent gaps or leaked watchers.

### D3. Leases / TTL

- [x] Implement root-role-scoped lease list/detail/TTL, grant/revoke/one-shot renewal, and caller-authorized revision-safe key attach/detach.
- [x] Make browser-workspace ownership explicit; bound optional renewal to 15 minutes and cancel on close/disconnect/error. Durable server-managed sessions are not implemented.
- [x] Show attached-key count/preview and require exact lease-ID confirmation before revoke, with explicit expiry/deletion and one-shot renewal explanations.

### D4. Bulk operations and import/export

Bounded transfer checkpoint implemented: versioned base64 JSON, fixed-revision
20-record export pages with caller-scoped signed cursors, file validation,
create/overwrite previews, exact-key selection, typed confirmation and atomic
CAS import/delete batches (50 keys / 1 MiB decoded). Cancellation explicitly
warns about uncertain commit outcomes. Large resumable server jobs and streaming
single-file exports remain future work; pages/batches are separate bounded units.

- [ ] Add selected-key delete and bounded prefix export/import with progress, cancellation, size/key-count limits, and per-item results.
- [ ] Define a versioned JSON format with explicit key/value encoding and optional metadata. Do not imply that revisions or lease IDs can be restored unchanged.
- [ ] Validate before mutation; provide dry-run conflict/overwrite previews and an explicit overwrite policy. Make partial completion and non-atomic batches visible.
- [ ] Use transactions only within supported operation/request limits; larger jobs must state that they are not globally atomic. Make retries safe with job IDs and clear outcome tracking.
- [ ] Keep export pages at one revision; fail/restart clearly on compaction. Use bounded streaming/chunking rather than loading full exports into browser/backend memory.

### D5. RBAC, workspaces, and usability

Application-wide UI redesign is specified in [ui/UX_PLAN.md](ui/UX_PLAN.md),
with an inventory and individual redesign/acceptance criteria for every page,
dialog and cross-cutting state. The blue palette/primary connection action are
restored; all further redesign remains planned, not implemented. Shared patterns
and shell changes precede complete connection, key, cluster/metrics, data-tools,
lease/watch, access-administration and help journeys. Fix critical layout defects
early, but do not treat improved screenshots of a few pages as overall completion.

Workspace UX checkpoint: four independently bound connection tabs with retained
feature-page state, fail-closed capability hints/admin navigation, profile
editing with cancellable diagnostics and retest-before-save, shortcut help and
focused save/search/refresh, skip navigation, live prefix-page patches and
explicit stale-membership warnings. Optional workspace-owned lease renewal is
bounded to 15 minutes and cancelled on close/disconnect. These are browser-owned
workspaces, not durable server sessions; deep links and full accessibility/E2E
certification remain pending. Frontend regression tests verify identity/draft
isolation across feature navigation and renewal teardown.

RBAC checkpoint: role CRUD and permission previews, lossless binary-rule
revocation, slash-safe user/role names, typed root promotion/removal, password
management, protected canonical/service administrators (including legacy routes),
and fixed async user creation are implemented. Real-etcd mTLS tests cover scope
boundaries, revocation, root promotion, password authorization/change, deletion,
and protected accounts. Validation: Go race tests/vet, 32 frontend tests,
lint/production build, and plaintext plus mTLS real-etcd integration pass.
Workspace isolation and capability discovery were pending at that checkpoint
and are now implemented in the workspace checkpoint above. The existing
Monaco chunk-size warning remains; Docker image validation is still blocked
by the previously recorded base-layer download failures.

- [x] Add role create/delete, exact/range/prefix permission grant/revoke, root-authorized user password changes, and stronger confirmation for administrative role changes.
- [x] Add caller-capability-aware navigation and fail-closed mutation controls, with exact-key write hints for the editor. etcd remains authoritative.
- [x] Add independent connection tabs with isolated requests, drafts, watches and selection; label backend/user and require explicit destructive confirmations.
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
- [x] Use isolated Compose volumes per member and disposable TLS/auth test containers; the development fixture no longer mounts shared host `/srv/docker/etcd` data.
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

Handler organization checkpoint: replaced the monolithic GenericHandler with
feature-owned access/cluster/keys/leases/settings/transfer/watch handler packages.
The root package now only composes them. Shared client policy is in handlerkit,
typed request metadata in request, JSON contracts in response, and range/paging/
cursor logic in internal/keyspace. Colocated unit tests follow their packages;
cross-feature real-etcd tests and the runner target handlers/integration.
Architecture tests prevent sibling-handler dependencies and verify shared
signer ownership; watch quotas remain instance-wide. HTTP routes and wire
contracts are unchanged.

Validation for the handler split: Go race tests, vet and build pass; the moved
cross-feature integration suite passes against both disposable plaintext and
mTLS etcd. No frontend or external HTTP API changes were made in this split.

Formatting/startup checkpoint: pinned Prettier formats JSX/JS/CSS/frontend
documentation and CI enforces `npm run format:check`; Go continues using gofmt.
Removed shared administrator clients and startup authentication entirely.
Backends register validated endpoints/TLS without dialing; callers inspect
their own etcd roles/permissions for listing, export, capability hints and admin
gates. The default YAML contains no `superadmin` credentials. Legacy secret
sources are ignored with a non-secret warning; optional `protectedUsers` guards
externally managed accounts without connecting as them. Offline-startup
subprocess and no-dial registration tests cover the new lifecycle. This
supersedes the earlier privileged password-file/environment startup workflow.

Latest dashboard/transfer/workspace checkpoint: Go race tests/vet, **41 frontend
tests**, lint, production build and Chromium production-bundle smoke all pass.
Plaintext and mTLS real-etcd tests pass for maintenance access, scoped capability
hints, binary transfer, fixed-revision export pagination, atomic conflicts and
deletion, and preservation of leases during overwrite. Chromium tests cover
identity/draft isolation, page retention, live keys, optional renewal, typed
bulk confirmation, shortcut help and workspace close. CI now runs this smoke
test with a pinned Playwright dependency. This is not a full multi-browser,
accessibility, multi-node fault, or sustained-load certification.

The frontend has feature folders with colocated tests; backend routes have
feature registration modules and new logic uses injectable internal cluster
and transfer services. Large deferred Monaco chunks remain a build warning;
Docker image validation remains blocked as previously documented.

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
- **Vite migration:** replaced CRA with Vite 8.3.8 / Vitest 5.1.1, pinned Node 24.22.3, renamed JSX modules, added standalone lint and same-origin API proxy, and preserved `ui/build/` output. Updated Docker/UI build instructions and strict API-vs-SPA fallback/cache tests. Frontend: 5 tests pass, lint passes, production build succeeds (1.04s; initial main chunk 553.85 kB / 173.32 kB gzip). Simplified Axios service with regression tests. Audit identifies old Axios/Router findings; the following dependency upgrade addresses these rather than using `audit fix --force`. Monaco self-hosting and route splitting remain pending.
- **Go modernization:** verified official stable Go 1.27.4; upgraded etcd API/client together to 3.7.4, Mux to 1.8.1, Zap to 1.28.0, YAML to 3.0.1, and go-make to 1.4.0 with refreshed transitive modules. Race tests, vet, and binary build pass on the new toolchain. Aligned Docker build version, non-root runtime, and split backend/frontend CI validation without credentialed PR publishing. Live etcd version-matrix and image build verification remain pending.
- **React/library modernization:** pinned React/DOM 19.3.1, Router 7.18.6, MUI 9.6.0, MUI X Tree View 9.18.0, Axios 1.21.1, Monaco 0.58.0/wrapper 4.7.0, ESLint 10.15.0, and current compatible Testing Library/Emotion. Removed obsolete lab/history/web-vitals dependencies; migrated root, grid, navigation, slot props, and tree APIs. Added robust profile parsing and tree/menu tests. Clean `npm ci` reports no peer warnings and zero vulnerabilities; 9 frontend tests and lint pass. Production build passes with self-hosted editor/JSON workers and deferred Monaco loading. Main chunk is 302.72 kB (96.66 kB gzip); large deferred Monaco chunks remain an explicit optimization opportunity, not suppressed warnings. `govulncheck ./...` reports no vulnerabilities. Browser E2E, full performance budgets, and remaining Phase C behavior are not yet complete.
- **RBAC listing:** replaced start-key-as-prefix interpretation with merged readable byte ranges; supports exact keys, write-only/empty roles, root roles on arbitrary usernames, and non-slash keys. Key reads remain caller-authenticated; permission metadata is refreshed, and reads across ranges share a revision. Unit/race tests and isolated real-etcd 3.7.4 tests pass, including overlapping grants, role revocation, and bad passwords. Added disposable Docker integration runner and CI step. Whole-list scalability is still pending B1/B2.
- **Safe editing:** conditional create/update transactions reject stale writes and preserve leases; revision/version/lease JSON fields use decimal strings, with a documented client migration. Replaced the editor class with cancellation-safe state, deferred editor loading, draft preservation, loading/error save guards, JSON formatting, and theme synchronization. Unit/race tests, 13 frontend tests, lint, production build, and real-etcd conflict/create/lease tests pass. Added portable POSIX-shell integration runner. Full Docker image build was attempted but failed during base-layer download with daemon RPC EOF; image validation is not marked complete.
- **Bounded browsing:** added signed, scoped, expiring cursor pagination over merged readable ranges; keys-only limit+1 reads, snapshot consistency, compaction errors, prefix queries, and binary-key metadata. Main UI now loads 100 keys/page, builds a stable-ID page-local tree, labels page filtering honestly, and creates drafts without server scans. Legacy whole-tree reads are deprecated. Unit/race tests, 15 frontend tests, lint/build, and real-etcd pagination/tampering/compaction tests pass. On the disposable single-node 3.7.4 fixture with 100k keys and 20 authenticated first-page samples: p50 **117.14 ms**, p95 **121.71 ms**; this is not a production/multi-user/browser guarantee. Remaining: lazy per-prefix expansion, binary editing, configurable limits, connection reuse, and full load/soak budgets.
- **Cluster status repair:** uses client URLs with fallback, bounds fan-out to four workers and per-node deadlines, and retains healthy members when another is unreachable/unstarted. Unavailable database sizes are null and surfaced as unavailable in the UI; IDs/revisions use decimal JSON strings. Added race-tested partial-result and endpoint-selection tests. Address mappings, metrics history/dashboard, and a live multi-node fault test remain pending.
- **Credential/origin hardening:** browser storage now contains profile metadata only; legacy passwords are scrubbed, reload requires a password dialog, and disconnect/deletion clears tab-memory credentials. Authentication no longer returns upstream tokens. Removed wildcard CORS, added tested same-origin mutation enforcement and validated `http.publicOrigin` for HTTPS proxies, and require bounded strict JSON bodies on JSON mutations (including user creation). Go race/vet checks, real-etcd integration, 19 frontend tests, lint/build, and npm audit (zero findings) pass. Full server-side cookie sessions, upstream TLS, audit/read-only controls, and browser E2E remain pending; do not treat this as complete production hardening.
- **TLS/mTLS:** centralized caller-client construction through the selected backend; private CA, paired certificate/key, verified server-name override, TLS 1.2 minimum, explicit HTTPS endpoints, and discovered-member downgrade checks are implemented. Shared certificates with a non-empty CN are rejected to prevent etcd certificate identity from overriding caller RBAC. Strict single-document YAML rejects unknown options; relative certificate paths resolve beside configuration. Race/vet tests, hostname/CA/client-certificate negative tests, and real-etcd plaintext plus mTLS integration pass, including direct unauthorized-read assertions. Server-side sessions, protected privileged-credential files/environment, and certificate rotation remain pending.
- **Development/dependency maintenance:** replaced the old 3.2.5 Compose image/shared host data with digest-pinned 3.7.4 members, isolated named volumes, and loopback-only client ports. Updated host-run development setup/auth instructions and sample loopback endpoints. Pinned build/runtime image digests and added weekly dependency-update configuration. `docker compose config --quiet` passes; isolation/pinning assertions cover the fixture configuration. The three-member development fixture has not been started against user data or claimed as a validated upgrade path; old data is deliberately untouched.
- **Protected credentials/read-only mode:** added exclusive inline/file/environment privileged-password sources with bounded file reads, whitespace-preserving handling, relative file paths, and non-secret diagnostics. Startup failures now exit nonzero rather than logging and returning success; subprocess tests verify this. Added a global read-only mutation guard (authentication remains allowed), exposed only a non-secret capability flag, and disabled mutating UI controls with fail-closed settings loading. Go race/vet, **21 frontend tests**, lint/build, and mTLS integration pass; audit logging and server-side sessions remain pending. A second Docker image build attempt again failed during base-layer downloads with daemon RPC EOF, so image verification remains blocked by the environment.
- **Lease UX:** added a dedicated lease screen with TTL guidance, attached-key preview, one-shot renewal, read-only controls, and typed destructive confirmation. Added lease attach/detach to revision-safe key saves, tracking expiration edits as unsaved changes. Cluster-wide lease metadata/administration requires the caller's root role to avoid leaking another user's attached keys. Validation/UI tests and isolated mTLS lifecycle, detachment, natural-expiry, and authorization checks cover the workflow. Automatic server-managed renewal is deliberately not implied.
- **Live-change UX:** enabled a dedicated exact/prefix watch viewer and key-browser shortcut, visible backend/user identity, explicit Start/Stop, privacy opt-in for values, bounded 500-event history, retry/status messaging, and revision resume. Server streams use caller authentication, range authorization before headers, complete transaction batches, heartbeat/write deadlines, quotas, bounded queues/messages, and explicit resync errors. SSE parsing handles split UTF-8/CRLF and truncated frames without acknowledging partial revisions. Go race tests, frontend tests/lint/build, and real mTLS transaction/resume/delete/denied-range/cleanup tests cover this workflow. This viewer is not an initial key snapshot or permanent audit store; live browser-cache patching remains pending.
