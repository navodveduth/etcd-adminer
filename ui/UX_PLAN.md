# UI/UX improvement plan

## Scope and visual direction

Keep the original blue identity. Improve the existing MUI application rather
than introduce another theme, framework, or unrelated feature rewrite.

- Light primary: **#1976d2**; dark primary: **#90caf9**.
- Blue is for navigation, selection and primary actions. Green is only for real
  success/healthy status, not general action buttons or application branding.
- Neutral surfaces, consistent spacing, readable typography and restrained borders.
- Preserve workspace isolation, RBAC, read-only behavior, CAS editing, bounded
  queries and explicit destructive confirmations throughout the redesign.

**Implemented now:** restore the blue primary palette and blue connection action.
**Everything below is planned, not yet implemented.**

## Problems visible in the supplied screenshots

1. The teal header and green connection button changed the original identity.
2. Cluster content uses only half of the available area. The nested node grid
   makes one node a narrow vertical card despite a mostly empty screen.
3. Fixed-height panels cause the Revision row to overlap the Nodes section.
4. Raw database byte counts, long IDs, technical booleans and densely wrapped
   URLs make basic cluster information difficult to scan.
5. `DEV · DEV · ROOT` repeats identity, uppercases a case-sensitive username,
   and does not clearly communicate workspace state.
6. The separate close icon is far from the tab it closes. Connections and
   workspace navigation feel like disconnected screens.
7. Profile cards spend too much space on a single saved connection, while
   “Most recently selected” can be mistaken for live connection health.
8. Cluster and Overview appear as competing destinations with unclear purposes.

## Phase 1 — fix cluster layout and data readability (highest priority)

Files: `components/cluster/cluster.jsx`, `etcdNode.jsx`, `metrics.jsx`.

- Remove fixed 200px/800px heights and nested half-width grids. Use the full
  workspace content width with natural document flow and consistent section gaps.
- Add a clear page heading and toolbar: **Cluster overview**, Refresh, last
  successful sample time, and an explicit refreshing/stale/error indicator.
- Put scannable summaries first: responding members, leader, version, database
  size/in-use and alarms. Do not equate a successful status RPC with quorum health.
- Replace narrow member cards with a responsive members table on desktop and
  stacked detail cards on small screens. Expose endpoint errors per member.
- Show MiB/GiB and percentages with units; provide raw-byte detail when needed.
- Use Leader/Follower/Learner/Unavailable labels instead of raw booleans.
- Shorten long IDs visually with copy controls and accessible full values.
  Preserve exact ID strings; never convert them to JavaScript numbers.
- Move peer URLs, Raft details and IDs into expandable member details. Allow
  endpoint wrapping/copying without breaking layout.
- Correct misleading data presentation: a membership-response revision of zero
  must not be presented as the current keyspace revision. Remove it or label it
  unavailable unless an authoritative source supplies the intended value.
- Retain useful last-successful data during refresh failures, clearly marked
  stale. Never replace unavailable sizes/alarms with fabricated zero values.

**Acceptance:** no overlapping rows at 200% zoom; no large unused half-screen
column; member details remain readable at 375px and 1920px widths; missing data
and partial failures have explicit labels.

## Phase 2 — simplify connections and workspace navigation

Files: `App.jsx`, `workspaces.jsx`, `components/connections/`, `components/layout/`.

- Give Connections a clear title and prominent blue **New connection** action.
- Offer a compact, searchable connection list with profile, backend, endpoint,
  username and primary **Open** action. Use responsive cards only where useful.
- Show the endpoint once, with safe wrapping/copying; distinguish profile name
  from backend name without repeating identical names unnecessarily.
- Replace large repeated credential notices with short guidance and an optional
  “How credentials are stored” explanation. Keep the security information available.
- Use neutral/blue avatars. A user's initial is not an error or health state.
- Distinguish Saved, Workspace open, Authenticating and Needs sign-in. Only
  display Connected/Healthy when a corresponding live check actually supports it.
- Keep usernames in their original case, including `root`. Put environment and
  administrator-role badges beside identity, not inside an all-uppercase label.
- Put an accessible close action next to each workspace label. Explain what
  closing stops; preserve safe confirmation for unsaved drafts/owned renewal.
- Keep connection identity visible on every feature page. Switching profiles
  must never retarget requests or drafts in an existing workspace.
- Consolidate Cluster and Overview into one destination, with Summary, Members
  and Metrics sections/tabs. Preserve equivalent existing navigation entry points.
- Add an appropriate next step after authentication: open Keys by default, with
  obvious access to Cluster overview. Do not force users through technical setup
  text or unrelated administration screens.

**Acceptance:** a saved connection can be opened with one clear primary action;
the active backend/user is unambiguous; close buttons are associated with their
own tabs; duplicate names do not dominate the header; all workspace-isolation
and permission-navigation tests continue to pass.

## Phase 3 — make common operations easier

### Key browser and editor

- Use a resizable desktop browser/editor split and a stacked mobile layout.
- Give prefix search, page filtering and snapshot pagination distinct labels.
  Show the current prefix, key count, revision and live/stale state together.
- Make exact-key selection and folder expansion keyboard-accessible and visually
  distinct; selected keys should be easy to identify.
- Use a compact editor toolbar with Save, Reload, format, language and expiration.
  Show unsaved changes and conflicts near Save, without overwriting a draft.
- Explain when live updates require a fresh page. “Live” must not imply complete
  query membership after page-boundary changes or a missed/compacted stream.

### Import/export and bulk delete

- Use a guided flow: choose file/keys → validate → preview → confirm → result.
- Keep counts, overwrite policy, byte/key limits and exact affected scope visible.
- Associate progress, cancellation and ambiguous-outcome warnings with the
  current operation. Never imply that cancellation rolled back a transaction.
- Give completed exports a clear next-page/end-of-export state.

### Leases, watches and RBAC

- Present leases in a searchable list with TTL/expiry summaries and clear renewal
  ownership. Show automatic-renewal state and its 15-minute limit continuously.
- Make Start/Stop, reconnect status, last delivered revision and value-visibility
  controls obvious in the watch viewer. Values remain opt-in.
- Present role permissions as readable access/scope summaries, with technical
  range boundaries available on demand.
- Give unavailable actions a visible explanation rather than unexplained disabled
  controls. Capability hints remain advisory; backend authorization is mandatory.

**Acceptance:** each operation has one obvious next action, a visible outcome,
and a recoverable error state. Existing transaction, confirmation, credential
privacy and lease/watch cleanup guarantees are retained.

## Phase 4 — shared visual and accessibility standards

- Define shared page header, toolbar, summary card, status badge, empty state,
  error/retry state and confirmation patterns. Do not duplicate styling per page.
- Use theme tokens instead of hardcoded card borders/colors, with an 8px spacing
  rhythm, consistent headings and comfortable body text.
- Keep one useful page scroll area; avoid tall empty containers and nested scroll
  traps. Use table/panel scrolling only where the content requires it.
- Collapse the sidebar on small screens; keep workspace tabs scrollable without
  pushing global actions off-screen.
- Target WCAG AA contrast in light/dark themes; do not communicate state by color
  alone. Use practical touch targets, visible focus and labeled icon buttons.
- Verify keyboard navigation, tree context menus, skip navigation, dialog focus
  restoration, and shortcut discoverability. Focus must not remain in hidden tabs.
- Announce important operation results/errors to assistive technology, but avoid
  interrupting users with every background polling update.
- Use skeletons for initial loading and restrained refresh indicators afterward.
  Successful operations should not produce persistent full-page banners.

## Delivery and validation

Implement in small, reviewable local commits, without pushing:

1. Blue palette restoration — completed separately from layout redesign.
2. Cluster layout/readability fixes — first redesign deliverable.
3. Connections and workspace shell.
4. Key browser/editor improvements.
5. Remaining operational workflows and accessibility polish.

For each deliverable:

- Review light/dark screenshots at 375, 768, 1280, 1440 and 1920px, plus 200% zoom.
- Check keyboard-only operation, long names/URLs, many members, empty data,
  restricted users, read-only mode, offline endpoints and partial failures.
- Extend component tests and production-bundle Chromium smoke checks; add layout
  assertions/visual baselines for overlaps and responsive behavior.
- Run Prettier, ESLint, frontend tests and production build. Run Go/integration
  tests when API/data-presentation changes require backend work.
- Use deterministic API fixtures and disposable etcd for destructive testing.
  Do not mutate the configured DEV cluster for design checks or screenshots.
- Ask for review after the cluster/connection redesign before rolling the new
  patterns across every feature screen.

Not included: replacing MUI, another color rebrand, new database features,
durable server-side lease sessions, or inventing Prometheus metrics. This plan
improves the usability of the existing features first.
