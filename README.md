# Web based admin interface for ETCD (https://etcd.io)

## Screenshot
![image info](./resources/screenshot.png)

## Configuration
The application configuration uses YAML; start from [config.default.yaml](config.default.yaml).

```yaml
http:
  port: 8080

logger:
  level: "INFO"

etcd:
- name: "LOCAL"
  endpoints:
    - "http://127.0.0.1:23791"
    - "http://127.0.0.1:23792"
    - "http://127.0.0.1:23793"
  superadmin:
    username: root
    password: root@123
```
## How to run

### Local development cluster

The Compose fixture uses etcd 3.7.4, separate project-scoped volumes per node,
and loopback-only client ports. It is intended for a **host-run API**, not a
production deployment. It does not touch or migrate the previous shared
`/srv/docker/etcd` directory; do not mount old 3.2 data directly into a newer
server as an upgrade shortcut.

```sh
docker compose up -d
# Check readiness before initializing auth:
docker compose exec etcd1 etcdctl --endpoints=http://127.0.0.1:2379 endpoint health
# First initialization only; user add prompts for a password:
docker compose exec etcd1 etcdctl user add root
docker compose exec etcd1 etcdctl user grant-role root root
docker compose exec etcd1 etcdctl auth enable
cp config.default.yaml config.yaml
```

Set the actual root password in your protected `config.yaml` before starting
the API. The example `root@123` is a development placeholder, not a production
credential. `docker compose down` stops the fixture while retaining its named
volumes. Do not delete volumes unless you explicitly intend to discard their
development data. The generated-certificate integration fixtures are separate
disposable containers and never use these volumes.

### Using Docker

#### Run the latest version using the publicly hosted image
```bash
docker run -d --name etcd-adminer -p 8080:8080 srimaln91/etcd-adminer:latest
```

#### Run the application using a custom configuration file

You can mount the config file as a bind mount.

For a containerized API, configure etcd URLs reachable **inside that container**;
the sample loopback endpoints are for a host-run API. Mount configuration and
TLS secrets read-only with permissions for the non-root runtime user.

```bash
docker run -d --name etcd-adminer -p 8080:8080 -v /path/to/config.yaml:/app/config.yaml srimaln91/etcd-adminer:latest
```

### Build and run

#### Backend API
Requires Go 1.27.4 (the version declared in `go.mod`).

```bash
# clone the project
git clone https://github.com/srimaln91/etcd-adminer.git
cd etcd-adminer

# download go modules
go mod download

# build it!
go build
```

Use a supported etcd server; the client/API modules are pinned to 3.7.4.
Compatibility with older server releases must be integration-tested before deployment.

Run `go test -race ./...` and `go vet ./...` for backend checks. With Docker
available, `sh scripts/test-integration.sh` creates an isolated etcd 3.7.4
container, verifies real RBAC behavior, and removes only that container on exit.
It does not use your configured cluster or mount any host etcd data.

#### React UI

The project uses React with Vite. Use Node.js 24.22.3 (`ui/.nvmrc`).
```bash
cd ./ui

# install node modules
npm ci

# start the development server with auto reload/compilation enabled
npm run start
```

Vite proxies `/api` requests to the Go API on port 8080. Run `npm test`,
`npm run lint`, and `npm run build` in `ui/` to validate frontend changes.
The production output remains `ui/build/`, compatible with the Go static server.

### Safe key writes

`PUT /api/keys` now requires `expectedRevision` as a decimal string. Send `"0"`
to create a key only if absent, or the key's `modRevision` returned by a read
to update it. Stale writes return HTTP 409 without changing the value. Updates
preserve an existing lease. Revision/version/lease fields are JSON strings to
avoid JavaScript integer precision loss; clients must not coerce them to numbers.

### Bounded key browsing

The UI uses `GET /api/v1/keys?prefix=...&limit=100&cursor=...` (default 100,
maximum 1,000 keys). Results contain `items`, `revision`, `hasMore`, and an
optional `nextCursor`; values are fetched only when selecting a key. Continue
with the same prefix/limit and the returned cursor. Cursors are signed, scoped
to the backend/user/credentials/query, expire after 10 minutes, and become
invalid after an adminer restart. Compacted snapshots return HTTP 409; restart
the listing. Prefixes are limited to 8 KiB and cursor tokens to 64 KiB.

Tree and list views show **one server page**, not the entire cluster. Substring
filtering applies only to that page; use the prefix field for server-side
queries. Binary keys are encoded as base64 in API metadata and excluded from
the text-editing view with an explicit notice. Binary editing remains planned.
Draft files/directories stay local until a file is saved; no whole-cluster scan
is needed to create a draft. The legacy unbounded `GET /api/keys` tree endpoint
is deprecated and retained only for compatibility; new clients must not use it.

For a reproducible disposable-cluster 100k-key API benchmark, run
`ETCD_TEST_LARGE=1 sh scripts/test-integration.sh -v`. This reports 20 first-page
samples, not a browser benchmark or multi-node production performance guarantee.

### Credential and origin handling

Saved browser profiles contain metadata only. Legacy stored passwords are
removed on access; you must reauthenticate after reloading/opening a tab.
Passwords remain in tab memory until disconnect, deletion, or tab closure;
they are still sent as HTTP Basic credentials to the API. **Use HTTPS for
non-local deployments.** Full short-lived server-side cookie sessions
remain planned; these changes are not a claim of
complete production security hardening.

The API no longer enables wildcard CORS and rejects cross-origin browser
mutations. For TLS termination at a reverse proxy, set `http.publicOrigin`
to the exact external origin, such as `https://adminer.example.com` (no trailing
slash). Forward the correct Host header. Do not trust arbitrary forwarded
scheme headers. The Vite development proxy handles same-origin development
requests without weakening the production origin policy. JSON mutations
require `Content-Type: application/json`; form/plaintext bodies are rejected.

### Upstream TLS / mTLS

All etcd handlers use the selected backend's transport policy, including
authentication, RBAC, key operations, and discovered-member status calls.
For private CAs or client-certificate authentication, configure each backend:

```yaml
etcd:
  - name: secure
    endpoints: ["https://etcd.example.com:2379"]
    superadmin:
      username: root
      password: "replace-with-protected-credentials"
    tls:
      enabled: true
      caFile: /run/secrets/etcd-ca.pem
      certFile: /run/secrets/etcd-client.pem
      keyFile: /run/secrets/etcd-client-key.pem
      # Optional override, still verified against the server certificate:
      serverName: etcd.example.com
```

TLS requires certificate/hostname verification and TLS 1.2 or newer; insecure
verification and plaintext fallback are not supported. Use explicit `https://`
URLs for every configured/discovered client endpoint. Without `caFile`, system
trust roots are used. A configured CA file replaces the system pool. Client
certificate/key fields are optional but must be supplied together; relative
paths resolve beside the configuration file. Configuration rejects unknown
fields and multiple YAML documents instead of silently ignoring them.

**Caller isolation:** a shared client certificate must have an **empty Common
Name**. etcd can derive user identity from the TLS CN instead of the supplied
username/token; accepting a shared `root` certificate could bypass per-user
RBAC. Such certificates are deliberately rejected. Use an empty-CN certificate
for transport-level mTLS and username/password for each caller. Dedicated
per-user certificate identities are not supported yet.

Mount private key files read-only with permissions allowing the non-root
runtime user to read them; never commit certificates/private keys. Run
`ETCD_TEST_TLS=1 sh scripts/test-integration.sh` to verify real mTLS/RBAC behavior
against a disposable cluster with generated, short-lived test certificates.

## Contributions

Contributions are welcome. Please free free to open PRs if you have anything to contribute with.
