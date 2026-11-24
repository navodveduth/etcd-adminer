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
  cursor signing, shared by listing/export without cross-handler dependencies.

New business logic should use internal feature packages with explicit context
and client dependencies. All metadata and mutations use caller-authenticated
clients; backend registration is offline and holds no privileged client or
administrator password. Handler-level integration tests cover real etcd authorization;
internal-package tests cover pure validation and partial-failure semantics.
