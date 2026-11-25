# Application-wide UI/UX redesign plan

## 1. Scope, status and principles

**Scope: every existing screen, feature view, dialog and important UI state.**
The supplied screenshots are examples of wider consistency/usability problems,
not the boundary of this work. Cluster and Connections must not receive a
redesign while the remaining pages retain unrelated layouts and interaction patterns.

**Status:** the application-wide redesign is implemented across the existing pages.
Shared page/state components, blue shell, responsive navigation, workspace activity
indicators, Connections/reauthentication, Cluster/Metrics, Keys/editor/dialogs,
transfer task views, leases, watches, users, roles and About have been updated.
Validation passes 69 frontend tests, lint, Go tests and production Chromium journeys
at 375, 720, 768, 1280, 1440 and 1920px in both themes. The 720px viewport exercises
the layout equivalent of a 1440px browser at 200% zoom; it is not a native browser
zoom or screen-reader audit. Fine-grained acceptance follow-ups are listed below.
This supersedes the screenshot-focused plan.

### Implementation checkpoint

- Shared headers, sections, loading/error/empty states, scrollable tables, exact-value
  copy controls, blue selection, and consistent non-destructive dialog autofocus.
- Searchable responsive connections, profile diagnostics and password visibility,
  explicit delete/disconnect/close confirmations, and per-profile reauthentication
  that preserves existing workspace drafts and unrelated connections.
- Readable member inventory and details, exact decimal IDs, binary size units,
  Cluster/Metrics navigation, partial/stale/retry states and accessible trend summaries.
- Adjustable desktop key-browser width and stacked mobile layout; page revision/count,
  selection, draft and live indicators; confirmed discard/reload and copy-draft recovery.
  New key/folder dialogs preview exact paths and explain virtual-folder semantics.
- Separate Import/Export/Bulk delete task tabs with preview steps and retained typed
  confirmation; searchable leases with duration presets, sampled TTL and renewal
  ownership; readable watch scope/event sections and retained-event counts.
- Searchable users with desktop master/detail and mobile back navigation; consistent
  create-user/password validation; separate role-navigation/removal controls; searchable
  role inventory with explicit scope preview and preserved root/byte-boundary safeguards.
- Browser fixtures check workspace identity, draft retention, reauthentication, RBAC,
  live updates, renewal, typed batch confirmation, every page's heading/overflow,
  stale/retry behavior, workspace keyboard navigation and close cleanup.

Folder duplication is now implemented through the folder context menu, with
caller-readable snapshot pagination, exact byte-prefix replacement, destination
preview, typed `COPY N`, create-only revision guards, bounded sequential batches,
and explicit lease/partial-outcome warnings. The source and current editor draft
are not changed. Limits and usage are documented in the root README.

A header-level **New key** action now accepts a full exact key path and value
directly in either Folder or List view, without pre-creating folders. It preserves
the selected editor draft, uses create-only revision checks, surfaces conflicts,
and retains input on failures/cancellation. New keys are unleased; path/value byte
limits and unknown submitted outcomes are explicit in the dialog.

### Remaining acceptance follow-ups

- Run a manual screen-reader/native-zoom audit and broader automated accessibility
  analysis; the keyboard/semantic/browser checks do not establish full WCAG compliance.
- Extend deterministic fixtures to every dialog's loading, denied, empty, partial and
  unknown-outcome combination, including long/binary values and filtered inventories.
- Add metric member filtering and richer chart axes. The existing trends show all
  sampled endpoints with explicit scale, units and retention rather than a selector.
- User-directory role summaries/protectedUsers badges require inventory metadata not
  currently returned by the names-only users endpoint. Root is marked protected;
  detailed role assignments appear after selection and policy guards remain server-side.
- Application build/version metadata is not exposed by the server; About states this
  instead of inventing a version. Cluster server versions remain available separately.

### Non-negotiable requirements

- Retain the original blue identity: **#1976d2** in light mode and **#90caf9**
  primary in dark mode. Do not introduce another color rebrand.
- Use blue for primary actions/selection, green for confirmed success/status,
  amber for caution and red for destructive/error states. Never rely on color alone.
- Keep the existing MUI stack and feature-based source structure.
- Preserve per-workspace credentials, drafts, requests, selection and watches.
- Preserve backend RBAC, exact-key write checks, read-only guards, CAS editing,
  snapshot pagination, bounded transfers and typed destructive confirmations.
- Do not persist passwords, key values or drafts in browser storage or URLs.
- Prefer plain task-oriented language, useful defaults and progressive disclosure.
- Keep advanced controls available without making every screen look like a
  configuration manual. Never hide material security/expiry warnings in tooltips.

## 2. Complete screen and state coverage

Paths below describe existing workspace-local routes, not a claim that the
current application supports reloadable browser deep links.

| Area                 | Screens/views in scope                                                                                                                     | Source ownership                                                  | Status  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ------- |
| Application shell    | Header, sidebar, workspace tabs, active identity, theme, responsive navigation                                                             | `App.jsx`, `workspaces.jsx`, `components/layout/`                 | Planned |
| Connections          | Saved profiles, empty state, search/list/cards, open/disconnect/delete                                                                     | `components/connections/connection.jsx`, `connectionCard.jsx`     | Planned |
| Connection setup     | New/edit profile, test/diagnose, validation, save                                                                                          | `components/connections/newConnection.jsx`                        | Planned |
| Authentication       | Password prompt, failed authentication, reauthentication, cancelled test                                                                   | `components/connections/connection.jsx`, shared feedback          | Planned |
| Cluster              | `/cluster`: summary, member inventory and member details                                                                                   | `components/cluster/cluster.jsx`, `etcdNode.jsx`                  | Planned |
| Metrics              | `/metrics`: availability, DB/quota, Raft, alarms, trends, refresh                                                                          | `components/cluster/metrics.jsx`                                  | Planned |
| Key browser          | `/keys`: prefix query, tree, list, page controls, selection, live updates                                                                  | `components/keys/keys.jsx`, `tree.jsx`, `keysList.jsx`            | Planned |
| Key editor           | View/create/edit value, formatting, expiration, save/discard/reload, conflicts                                                             | `components/keys/editor.jsx`, `monacoEditor.jsx`                  | Planned |
| Key/folder dialogs   | New key, virtual folder, exact/prefix delete confirmations                                                                                 | `components/dialogs/`, `components/keys/`                         | Planned |
| Data transfer        | `/transfer`: import, export, selected-key delete, previews and results                                                                     | `components/transfer/transfer.jsx`                                | Planned |
| Leases               | `/leases`: inventory, details, create, renew, automatic renewal and revoke                                                                 | `components/leases/leases.jsx`                                    | Planned |
| Live changes         | `/watchers`: configure, start/stop, event log, reconnect/resync                                                                            | `components/watch/watch.jsx`                                      | Planned |
| Users                | `/users`: list, user details, assignments, password changes and deletion                                                                   | `components/access/userList.jsx`, `userTable.jsx`, `userInfo.jsx` | Planned |
| Create user          | `/users/new`: account form, initial roles, success/failure                                                                                 | `components/access/createUser.jsx`                                | Planned |
| Roles                | `/roles`: inventory, creation, details, permissions and deletion                                                                           | `components/access/roles.jsx`                                     | Planned |
| Help                 | About page, shortcuts dialog, contextual guidance and diagnostics                                                                          | `components/about.jsx`, `App.jsx`                                 | Planned |
| Cross-cutting states | Loading, empty, offline, partial/stale data, denied access, read-only, expired credentials, conflicts, cancellation and uncertain outcomes | Shared UI patterns and every affected feature                     | Planned |

No area is complete just because its successful desktop state looks better.
Its forms, dialogs, failure states, dark theme and responsive layout must also pass review.

## 3. Shared design and interaction system

Create the common patterns first, then use them across **all** pages.

### Layout and visual hierarchy

- One consistent page structure: title/context → short description → primary
  action and toolbar → main content → contextual feedback/details.
- Use the available workspace width for browsers, tables and dashboards. Limit
  form width to roughly 640–800px for readability, not the entire application.
- Remove arbitrary fixed page/card heights and nested half-width grids. Use
  content-driven sections, consistent gaps and deliberate bounded data panels.
- Use an 8px spacing rhythm, consistent heading levels and readable 14–16px
  body text. Standardize button sizes, field density, borders and corner radii.
- Use neutral page backgrounds and subtle section boundaries, not thick colored
  borders or large empty panels. Replace hardcoded colors with theme tokens.
- Keep action placement predictable: primary action in the same toolbar position,
  secondary actions nearby, destructive actions visually separated.
- Standardize initial skeletons, empty states, inline validation, retry panels,
  success notifications, confirmation dialogs and detail drawers.

### Forms and feedback

- Use persistent labels and specific inline errors; placeholders are not labels.
- Explain why a required action is unavailable. Avoid a disabled button with no
  discoverable reason or an unexplained empty administrative page.
- Support Enter to submit safe forms, prevent duplicate submissions, and keep
  cancel/back available except where a submitted operation cannot be cancelled.
- Preserve input after failures. Never announce success before confirmation.
- Place results/errors next to their operation; use brief non-blocking success
  feedback rather than accumulating full-page banners.
- Distinguish invalid credentials, denied permissions, network/TLS failures,
  stale data, compaction and revision conflicts. Give a specific next step.
- Show when an outcome is uncertain. Network cancellation is not a rollback.
- Keep help concise in the main flow; use expandable explanations for technical
  details, without hiding destructive scope or lease-expiration risks.

### Shared UI building blocks

Introduce only reusable patterns actually needed by the screens, such as
`PageHeader`, `PageToolbar`, `StatusBadge`, `EmptyState`, `ErrorState`,
`CopyableValue`, a responsive data-table wrapper and a consistent confirmation
dialog. Keep these in a documented shared UI folder; feature-specific forms and
business decisions stay in their feature folders.

## 4. Screen-by-screen redesign

### 4.1 Application shell and workspace navigation

**Goal:** users always know where they are, which connection is active and what
will happen when they navigate or close a workspace.

- Keep a compact blue application header and a consistent responsive sidebar.
- Use clear navigation groups: Keys; Cluster; Data transfer; Leases; Live changes;
  Access (Users/Roles); Help. Connections remains a clear global destination.
- Present Cluster summary, Members and Metrics under one coherent destination;
  retain equivalent access to the existing `/cluster` and `/metrics` views.
- Replace `DEV · DEV · ROOT` with a concise profile label and secondary backend/user
  identity. Preserve username case; do not uppercase case-sensitive identifiers.
- Deduplicate identical profile/backend names. Show backend/user where needed to
  avoid ambiguity rather than repeating every field in every heading.
- Put close controls next to their own workspace labels, with accessible names.
  Explain discarded drafts and stopped watches/renewal before a consequential close.
- Keep unsaved changes, active watches and renewal discoverable when their page
  is hidden. Closing one workspace must not stop another workspace's tasks.
- Show read-only and access-check-failed states consistently in the active context.
- Use environment badges only when explicitly configured; do not infer a safe
  environment from a username, a color or a guessed hostname pattern.
- Define intuitive back/forward and return-to-last-page behavior. Evaluate URL-backed
  navigation separately with isolation tests; never put secrets/drafts in a URL or
  imply that reload restores authenticated sessions.

**Acceptance:** identity is unambiguous, tab switching preserves local state,
closing targets the correct workspace, and keyboard focus never remains in a hidden panel.

### 4.2 Saved connections

**Goal:** find, open and maintain a profile through clear, rounded connection cards.

- Add a clear Connections heading, a blue New connection action and a useful
  first-run empty state explaining the next step.
- Use a searchable responsive card grid at every viewport (updated to the user's
  card-layout preference). Give cards rounded borders, blue identity/selection,
  readable backend/endpoint/user fields, a clear Open workspace action and a
  labeled overflow menu for reauthentication, editing and safe profile deletion.
  Show profile, backend, endpoint, username and an obvious Open action.
- Replace red initial avatars and heavy blue borders with neutral/blue identity
  treatment and a restrained active/open indicator.
- Distinguish Saved, Workspace open, Authenticating and Needs sign-in. Do not label
  a remembered profile Healthy merely because it was selected previously.
- Wrap/copy endpoints safely; use a consistent menu for edit, diagnose and delete.
- Give delete/disconnect clear scope: profile metadata versus open workspaces;
  neither implies deleting cluster keys.
- Reduce repeated storage notices to short guidance with an accessible explanation.

**Acceptance:** one obvious action opens a saved profile; long names/endpoints do
not break the layout; delete/disconnect consequences are clear before confirmation.

### 4.3 New/edit connection and diagnostics

**Goal:** complete a short, understandable setup with actionable failure messages.

- Use the same focused form layout for create/edit, with clear mode and Back/Cancel.
- Group profile name, configured backend and credentials; explain that server-side
  endpoints/TLS cannot be edited by typing a browser profile.
- Show selected endpoint/transport details without displaying secret file paths.
- Make Test connection and Save/Open states explicit. Invalidate the test when
  credentials/backend change, and explain why saving requires another test.
- Show testing progress and Cancel; label roundtrip timing accurately rather than
  describing authentication time as general etcd operation latency.
- Separate authentication rejection from DNS/network/TLS/server failures. Offer
  useful checks without exposing raw request headers or passwords.
- Detect duplicate names inline and explain the effects of editing an open identity.

**Acceptance:** first-time setup and editing need no guesswork; failed tests retain
input; stale test success cannot authorize saving a different identity.

### 4.4 Authentication and reauthentication dialogs

- Name the target profile/backend and user in the dialog, without repeating secrets.
- Autofocus the password field, support password managers and paste, provide a
  labeled visibility toggle, and keep Enter/Cancel/Escape behavior predictable.
- Show errors inline, retain non-secret context, and prevent duplicate authentication.
- Explain reload/disconnect credential loss in plain language.
- On expired/rejected credentials, offer reauthentication for that connection only;
  unrelated workspaces and drafts must remain intact.

**Acceptance:** users know which connection they are authenticating; cancellation
clears sensitive input and restores focus to the initiating control.

### 4.5 Cluster summary and members

- Remove the overlapping 200px summary and 800px member panels shown in the screenshot.
  Replace nested half-width grids with a full-width, content-driven layout.
- Lead with responding members, leader, version, DB usage and alarms; show refresh
  controls, timestamp and stale/partial-result state in one consistent toolbar.
- Use a member table on desktop and readable detail cards on small screens.
  Move peer URLs, IDs and detailed Raft fields into expandable details.
- Use Leader/Follower/Learner/Unavailable labels rather than raw booleans.
- Format bytes as MiB/GiB; retain raw values on demand. Copy long IDs exactly,
  label their format, and never convert them through JavaScript Number.
- Do not present a membership-response revision of zero as the current keyspace
  revision. Remove or qualify it unless an authoritative source supplies that value.
- Keep partial results useful, with errors beside affected members. A successful
  Status RPC is not proof of write-quorum health.

**Acceptance:** no overlap at 200% zoom, no narrow member column inside an otherwise
empty desktop page, and no fabricated zero/healthy states for unavailable data.

### 4.6 Metrics and alarms

- Use consistent summary cards, member selection, chart legends/units, refresh
  controls and source/freshness labels; integrate with the Cluster navigation.
- Make database allocated/in-use/quota relationships understandable. Explain
  missing quota support and visibly report anomalies rather than hiding them.
- Use responsive charts with accessible text summaries, meaningful axes and
  honest gaps when samples are unavailable.
- Keep historical-window and local-retention limits visible. Pause nonessential
  polling when hidden and retain explicitly stale last-successful data on failure.
- Give alarms concise meaning and safe operational guidance; do not make dangerous
  maintenance actions look like routine one-click fixes.
- Show unsupported Prometheus rates/histograms as unavailable, not zero or inferred.

**Acceptance:** users can interpret each metric's unit, source and age; charts and
tables remain usable without color vision or a successful response from every member.

### 4.7 Key browser: tree and list views

- Use a resizable desktop browser/editor split and a stacked layout on small screens.
- Separate server prefix queries, current-page filtering and pagination clearly.
  Put prefix, snapshot revision, visible count and live state in one toolbar.
- Improve row density, selection, tree indentation, folder expansion, copy actions
  and the distinction between a real key and a virtual folder.
- Make selected-key counts and bulk actions visible; do not silently retain hidden
  selections after a page/query change.
- Give the page boundary and pagination model explicit labels. “No results” must
  distinguish an empty prefix, a page filter and unavailable permission data.
- Make live changes unobtrusive but visible. Warn when membership is stale or resync
  is required, and offer Refresh without replacing editor drafts.
- Label binary keys honestly and offer safe copy/export/tooling guidance rather
  than lossy text conversion or an unusable empty editor.

**Acceptance:** users understand the scope of search, selection and deletion;
keyboard interaction works in both views; live status never claims completeness after a gap.

### 4.8 Key editor and key/folder dialogs

- Give the editor a clear selected-key heading, concise revision/lease metadata,
  unsaved indicator and predictable Save, Discard, Reload and format controls.
- Keep language/format/expiration controls organized without crowding the value area.
- Explain create versus update, preserved versus removed expiration, and the
  consequences of attaching a lease.
- Present conflicts as draft-safe recovery: preserve/copy the draft and explicitly
  choose a reload; never silently overwrite it with a live update.
- Keep expired/denied write access visible with a reason and a safe recovery step.
- Improve new-key/folder dialogs with full-path preview, useful validation and focus
  behavior. Explain that a virtual folder is not a persisted filesystem directory.
- Separate exact-key deletion from raw-prefix recursive deletion, including keys
  not currently displayed. Keep destructive confirmation proportional to scope.

**Acceptance:** users can identify unsaved changes and the exact save/delete target;
conflicts, reloads and live updates cannot silently destroy a draft.

### 4.9 Import, export and selected-key deletion

- Separate Import, Export and Bulk delete into understandable task views rather
  than one long mixed form; preserve selection passed from the key browser.
- Import flow: choose file → validate → choose conflict policy → preview → confirm → result.
- Export flow: choose prefix → explain snapshot/page limits → download → clearly
  show Next page, Restart and Complete states.
- Bulk-delete flow: review exact selected keys → preview revisions → confirm count → result.
- Use readable key previews with explicit binary encoding labels; keep sensitive
  values out of previews unless the user intentionally reveals them.
- Keep size/count limits and atomic-batch boundaries visible. Explain that multiple
  files/batches are not globally atomic and source revisions/leases are not restored.
- Put progress, cancellation, per-batch outcome and retry guidance beside the current
  operation. Unknown commit outcomes require inspection/re-preview, not blind retry.

**Acceptance:** one clear next action per step; no mutation before validation and
confirmation; large, invalid, conflicting and cancelled inputs have recoverable states.

### 4.10 Leases and expiration

- Replace an ID-only selector with a searchable inventory and a useful selected-lease
  detail view. Separate create, inspect, renew and revoke actions clearly.
- Show remaining TTL, granted TTL, sample time and attached-key count; indicate when
  information may be stale or the lease has expired.
- Offer understandable duration presets plus validated custom input, with exact
  seconds available. Do not imply a displayed countdown is server-confirmed TTL.
- Make one-shot versus workspace-owned automatic renewal distinct. Keep its active
  state, owner, 15-minute maximum and stop/expiry risks discoverable across navigation.
- Explain browser sleep/throttling and stop behavior; this is not durable server renewal.
- Show attached-key preview limits and require the exact lease ID before revocation,
  warning that all attached keys may be deleted, including ones not displayed.

**Acceptance:** users can distinguish expired, last-observed and actively renewed
leases; renewal ownership and destructive impact are never hidden.

### 4.11 Live changes/watch viewer

- Group key/prefix, mode and optional resume revision into a compact configuration
  section, with clear Start and Stop controls.
- Put lifecycle status, last delivered revision, retries and retained-event count
  together; distinguish connection retry from a gap requiring resynchronization.
- Use a readable event table with event type, key, revision and timestamp. Make
  long/binary keys and optional values accessible without breaking row layout.
- Keep values opt-in and warn before revealing sensitive content. Clear log must
  clearly affect only the visible history, not stop the upstream watch.
- Explain the 500-event retention cap and lack of initial snapshot/permanent audit
  history. Do not silently describe a truncated log as the complete change history.
- Keep running-watch state visible when navigating away within its workspace.

**Acceptance:** users can start, stop and recover a watch without guessing whether
it is running, whether events were missed, or whether values are being exposed.

### 4.12 Users list and user details

- Replace oversized/min-width-constrained tables and floating-icon-only actions
  with a responsive searchable user list, labeled Create user action and clear selection.
- Use a master/detail layout on desktop and list/detail navigation on mobile.
- Show username, role summary and protected/admin status without treating every
  user initial as an error state.
- Group identity, role assignments and password changes into clearly titled sections.
- Make role chips useful navigation while separating their remove action and warning
  about effective access from other roles.
- Keep root grant/revoke confirmation explicit and explain protected-account restrictions.
- Put password validation, confirmation and outcome beside the password form. Explain
  UTF-8 byte limits without inventing additional password rules; clear secrets on exit.
- Explain whether deleting a user removes login/assignments, not their keys.

**Acceptance:** user selection, role changes and password changes cannot target the
wrong user after navigation; role refresh and permission failures remain visible.

### 4.13 Create user

- Use a short, consistently styled form with username, password/confirmation and
  optional least-privilege roles, plus Create and Cancel/Back.
- Provide clear inline errors, labeled visibility controls, password-manager support
  and an explanation of password byte limits and role assignment.
- Keep root promotion a separate explicit action after creation.
- Prevent double submission; preserve input on recoverable failures and distinguish
  confirmed creation from partial role-assignment or unknown outcomes.
- After confirmed success, provide View user/Create another rather than forcing
  users to infer where the account appeared.

**Acceptance:** the create journey has a clear result and next step; sensitive input
is cleared after success; partial creation never encourages duplicate-account retries.

### 4.14 Roles and permissions

- Provide a searchable role inventory with a clear Create role action and selected
  role detail view instead of stacking unrelated create/edit/delete forms.
- Show permissions as readable Access + Scope + Key/prefix/range summaries, with
  exact byte boundaries and binary encodings available on demand.
- Use a guided permission form: access → exact/prefix/range → boundaries → effective
  scope preview → save. Keep exact `/app` and prefix `/app/` semantics explicit.
- Explain replacement of a matching rule and combined permissions across roles.
- Give empty roles, built-in root and protected operations distinct explanatory states.
- Keep role deletion and permission removal separate, with affected-access warnings,
  typed role-name confirmation where required and no implication that keys are deleted.

**Acceptance:** a user can explain what a proposed rule grants before saving it;
root protections and lossless binary-rule revocation remain intact.

### 4.15 About, shortcuts and contextual help

- Replace the oversized centered About block with a concise, readable page including
  project links, version/build information when available, and documentation links.
- Group shortcut help by navigation/editor/workspace and display platform-appropriate
  keys. Keep shortcuts discoverable without overriding normal typing/browser actions.
- Explain permission requirements, storage/privacy, snapshot versus logical export,
  watch retention and renewal ownership where the user needs that information.
- Provide actionable troubleshooting for connection/configuration failures. Any
  copyable diagnostics must be sanitized: no passwords, auth headers or key values.
- Ensure help works without a connected backend and external links are clearly labeled.

**Acceptance:** users can find relevant help without losing their place, exposing
secrets or navigating away from an unsaved workflow unintentionally.

## 5. Mandatory states for every affected page

| State                           | Required experience                                                           |
| ------------------------------- | ----------------------------------------------------------------------------- |
| First load                      | Stable skeleton/layout, meaningful label, no false zero values                |
| Refresh                         | Keep useful content, indicate activity and sample age without resetting focus |
| Empty                           | Explain what is empty and offer the appropriate next action                   |
| Filtering has no matches        | Show query/filter scope and an obvious reset                                  |
| Network/TLS/backend unavailable | Specific error, retry/diagnose path, retained safe input                      |
| Partial/stale results           | Label affected sections; do not imply completeness/health                     |
| Permission denied               | Explain the required capability and the available safe alternatives           |
| Read-only                       | Persistent context indicator plus explanations at affected controls           |
| Access check unavailable        | Fail closed for mutations/admin functions, with a recovery path               |
| Credentials rejected/expired    | Reauthenticate only the affected connection; preserve unrelated workspaces    |
| Validation failure              | Inline field message, correct focus and preserved input                       |
| Revision conflict/compaction    | Explicit recovery without silent draft loss or hidden missing events          |
| Submitting                      | Prevent duplicates; show operation-specific progress                          |
| Success                         | Confirm the actual result and provide the next useful step                    |
| Cancelled/unknown result        | Distinguish stopped client work from a potentially committed server mutation  |
| Protected/destructive action    | Explain exact scope and enforce the existing confirmation policy              |

## 6. Responsive behavior, accessibility and performance

- Design/review at 375, 768, 1280, 1440 and 1920px, plus 200% zoom, in light/dark modes.
- Avoid page-level horizontal overflow. Complex tables may have a deliberately
  bounded scroll region or a mobile detail alternative, not clipped actions.
- Collapse navigation predictably; keep tab identity and primary actions accessible.
- Target WCAG 2.2 AA: contrast, visible focus, logical headings/landmarks, labels,
  practical touch targets and non-color status indicators.
- Verify keyboard-only forms, tabs, tree/context menus, tables and dialogs, including
  focus restoration and announcements for important results/errors.
- Do not announce every polling tick or steal focus when background data updates.
- Keep content safe for long names, Unicode, binary keys, large IDs and many rows.
- Reuse existing bounded requests/lazy Monaco and route loading. Do not fetch an
  entire keyspace or add persistent background work to make a redesign look complete.
- Measure large-page and editor interactions; introduce virtualization only where
  measured needs justify it, without sacrificing keyboard/accessibility behavior.

## 7. Implementation sequence and deliverables

Use focused local commits, no pushing, with a reviewable result at each step.

1. **Audit and design baseline:** capture every page/state with fixtures, document
   navigation decisions, and agree on shared layouts/tokens. Blue restoration is done.
2. **Shared components and shell:** establish the common page/form/table/feedback
   patterns and responsive workspace navigation used by all later work.
3. **Connections and authentication:** redesign saved profiles, create/edit/test,
   sign-in, reauthentication and connection-related dialogs as one complete journey.
4. **Keys:** redesign tree/list, editor, selection, live states and all key/folder dialogs.
5. **Cluster and metrics:** fix overlap/wasted space immediately, then deliver the
   coherent summary/member/metrics views and all partial/stale/offline states.
6. **Data operations:** complete import/export/bulk delete, leases/renewal and watch
   viewer flows, including previews, confirmations and uncertain outcomes.
7. **Access administration:** complete users, create user, details/password/roles,
   role/permission management and their protected/destructive dialogs.
8. **Help and application-wide polish:** finish About/shortcuts/context help, audit
   all cross-cutting states, and remove remaining inconsistent legacy patterns.
9. **Final acceptance:** verify every inventory row, theme, viewport and required
   state; no page is left as an unreviewed legacy exception.

Critical layout defects such as overlapping cluster panels can be fixed early
without waiting for a complete feature redesign. They do not replace the commitment
to cover every page in the inventory.

### Evidence required for each delivered area

- Reviewed before/after screenshots and a page/state coverage checklist.
- Component tests for validation, focus, permission/read-only guards and outcomes.
- Production-bundle browser journeys for the relevant end-to-end workflow, not
  only an isolated successful page render.
- Visual/layout checks for overlap, hidden controls, long content and responsive
  behavior; add automated accessibility checks alongside keyboard/manual review.
- Prettier, ESLint, frontend tests and production build passing. Run Go/integration
  tests when UI data contracts or API behavior need backend changes.
- Workspace isolation, draft preservation, cursor/transaction safeguards and
  watch/renewal cleanup tests remain green.
- Use deterministic API fixtures and disposable etcd for mutations. **Do not use
  the configured DEV cluster for destructive design tests or screenshots.**
- Review at each milestone; complete a final whole-application consistency pass
  rather than treating the first improved screenshots as completion.

## 8. Definition of done and exclusions

The redesign is done only when **all inventory rows** have implemented/reviewed
screens, relevant dialogs and required states; responsive and accessibility
checks pass; common tasks have obvious next actions and outcomes; the blue theme
is consistent; and existing security/correctness tests have no regressions.

This is a UX redesign of existing capabilities, not an authorization to replace
MUI, add unrelated database features, invent Prometheus data, persist credentials,
or build durable server-side lease sessions. UI-driven backend changes must have
an explicit data-contract reason and their own tests.
