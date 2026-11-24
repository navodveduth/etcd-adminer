# HTTP and backend boundaries

- `router/`: global policy middleware and SPA/API fallback.
- `routes/`: feature-based route registration (keys/watch, cluster, access,
  leases, transfer), with one shared authentication wrapper.
- `handlers/`: HTTP adapters, bounded caller-client lifetime, request validation,
  authorization gates and response/error mapping. Existing handlers remain in
  their package to avoid changing receiver ownership or public API contracts.
- `request/`, `response/`, `middlewares/`: transport contracts/policy.
- `../internal/cluster/`: concurrent bounded maintenance collection, using a
  small injectable client interface and configured endpoints only.
- `../internal/transfer/`: validated binary-safe atomic batch planning/execution.

New business logic should use internal feature packages with explicit context
and client dependencies. Never use the privileged metadata client to perform
caller mutations. Handler-level integration tests cover real etcd authorization;
internal-package tests cover pure validation and partial-failure semantics.
