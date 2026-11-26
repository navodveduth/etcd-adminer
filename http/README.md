# HTTP and backend boundaries

- `router/`: global policy middleware and SPA/API fallback.
- `routes/`: feature-based route registration (keys/watch, cluster, access,
  leases, transfer), with one shared authentication wrapper.
- `handlers/`: composition plus independent `access/`, `cluster/`, `keys/`,
  `leases/`, `settings/`, `transfer/` and `watch/` feature packages, with colocated
  unit tests. `handlerkit/` provides shared client lifetime/admin-role gates;
  `integration/` contains cross-feature real-etcd tests. See
  [`handlers/README.md`](handlers/README.md) for the dependency rules.
- `request/`, `response/`, `middlewares/`: transport contracts/policy.
- `../internal/cluster/`: concurrent bounded maintenance collection, using a
  small injectable client interface and configured endpoints only.
- `../internal/transfer/`: validated binary-safe atomic batch planning/execution.
- `../internal/keyspace/`: caller-readable ranges, snapshot paging and scoped
  cursor signing, plus immediate-child folder discovery using subtree-skipping
  keys-only seeks, without cross-handler dependencies.
- `../internal/browsersession/`: bounded, process-local remembered credentials;
  opaque HttpOnly cookies, per-connection references/expiry and logout revocation.
  `router/` shares one manager between authentication, request validation and
  session-management routes. References are not bearer credentials: resolving
  one also requires the browser cookie, matching backend and secure transport.

Cookie-authenticated mutations require an exact Origin. Logout is an authentication
operation, not an etcd write, and remains available under read-only policy. Existing
Basic-auth clients are supported without creating persistent browser sessions.

New business logic should use internal feature packages with explicit context
and client dependencies. All metadata and mutations use caller-authenticated
clients; backend registration is offline and holds no privileged client or
administrator password. Handler-level integration tests cover real etcd authorization;
internal-package tests cover pure validation and partial-failure semantics.
