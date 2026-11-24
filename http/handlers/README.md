# Feature handlers

`handler.go` is composition only. Each feature owns its HTTP adapters, handler
type, and colocated unit tests:

```text
handlers/
  handler.go       # constructs feature handlers, signer and shared client policy
  access/          # authentication, capabilities, roles, users, legacy RBAC routes
  cluster/         # cluster status and maintenance metrics
  keys/            # key CRUD, listing, virtual directories, legacy tree endpoint
  leases/          # lease inventory and lifecycle operations
  settings/        # public, non-secret instance configuration
  transfer/        # logical export and atomic import/delete adapters
  watch/           # streaming, buffering and instance-wide watcher quotas
  handlerkit/      # shared authenticated client lifetime and admin-role gate
  integration/     # cross-feature real-etcd tests (integration build tag)
```

Features must not import sibling handlers or the composition package. Shared
domain logic lives under `internal/`: `keyspace/` owns readable byte ranges,
snapshot paging and cursor signing; `cluster/` and `transfer/` own telemetry and
batch execution. The composition creates one signer for listing/export and one
watch handler per HTTP instance, preserving cursor scoping and global quotas.

Context metadata belongs to `http/request`; JSON contracts and byte-display
encoding belong to `http/response`. Middleware does not depend on handlers.
Route registration under `http/routes` explicitly selects the relevant feature.

Run `go test -race ./...` and `go vet ./...`. Use
`sh scripts/test-integration.sh` (and `ETCD_TEST_TLS=1`) for cross-feature tests.
The integration runner now targets `http/handlers/integration`.
