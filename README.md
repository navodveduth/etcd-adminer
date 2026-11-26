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

Enter the actual etcd username/password when opening a connection in the UI.
No shared root password belongs in `config.yaml`, and the API can start while
etcd is offline. Endpoint/TLS configuration is still validated at startup. The
development cluster is not a production deployment.
`docker compose down` stops the fixture while retaining its named
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

### Leases and TTL

Use **Leases / TTL** to create a lease (1 second to 7 days), inspect attached
keys and remaining TTL, renew it once, or revoke it with typed confirmation.
Cluster-wide lease listing/administration requires the etcd **root role** and
uses the caller's credentials. There is no shared privileged metadata client.

In the key editor, **Expiration on save** can preserve the current lease,
remove expiration, or attach a decimal lease ID. These changes share the
revision-checked key transaction. The API accepts optional `"lease":"0"` to
detach or another signed decimal ID to attach; omission preserves an existing
lease. Revoking/expiring a lease deletes its attached keys; detaching does not
revoke the lease. Renewal is explicitly one-shot, not an automatic background
keepalive unless optional workspace auto-renewal is enabled (see below). Read-only mode
disables lease/key mutations. Lease lists cap displayed IDs at 1,000 and details
show at most 100 attached keys while confirming the full affected count.

### Live changes / watch

The application now opens up to four independent connection workspaces. Each
workspace binds requests to its own backend/user and keeps its own navigation,
key draft, selection, cached pages and watches when switching tabs or feature
pages. Profile editing/deletion and disconnect close affected workspaces;
closing a workspace explicitly warns about discarded drafts and stopped watches
and renewal. Workspaces are in-memory and require reopening after reload.
Feature navigation uses workspace-local memory history, not global deep links.

Open **Live updates** in the key-browser panel to watch a nonempty prefix from
the loaded snapshot revision. The current live state remains visible when collapsed.
It patches visible puts/deletes without replacing editor drafts. Partial pages,
compaction or uncertain membership require an explicit refresh; these states
are visibly marked. CAS checks remain authoritative when saving.

Lease auto-renewal is optional and owned by the open workspace, with a 15-minute
maximum. It continues across feature/tab switches, stops on teardown, and stops
after any unconfirmed renewal. Browser sleep/throttling can still cause expiry;
this is not a durable server-side keepalive service. Stopping renewal does not
revoke a lease, but its attached keys may expire.

Access hints refresh on focus/every 30 seconds; unavailable capability checks
fail closed for mutations/admin pages. etcd still authorizes every operation.
Profile **Edit / diagnose** requires a fresh authentication test before saving,
labels the measured roundtrip, and explains server-side transport troubleshooting.
F1 opens shortcut help; Alt+1–4 switches workspaces; focused key browsers support
Alt+F (prefix) and Alt+R (refresh), and the focused editor supports Ctrl/Cmd+S.
The shell includes a skip link, labeled tabs and keyboard-accessible controls.

Frontend components are grouped by feature under `ui/src/components/`; see
[`ui/src/components/README.md`](ui/src/components/README.md). Backend route
groups and service boundaries are documented in [`http/README.md`](http/README.md).

For production-bundle browser smoke tests: from `ui/`, run `npm ci`,
`npx playwright install --with-deps chromium`, then `npm run test:browser`.
The deterministic browser fixture checks workspace isolation, drafts, capability
controls, live updates, renewal, bulk confirmation and keyboard help. It does
not replace the disposable real-etcd plaintext/mTLS integration suite.

Open **Live changes**, or use **Watch this key** in the key browser. Choose an
exact key or prefix, then Start/Stop explicitly. The screen shows new changes
only (not an initial snapshot), connection/retry status, the last complete
revision, and the latest 500 events. Values are hidden unless explicitly
requested and are never persisted by this UI. The active backend/user is shown
in the application header.

The authenticated SSE endpoint is `GET /api/v1/watch?key=...&mode=exact|prefix`;
`afterRevision` resumes after a completed revision. Browser requests use auth
headers, not credentials in URLs. Reconnects remain bound to their starting
connection. Transaction events are delivered in complete batches before the
revision is acknowledged; partial frames are retried from the prior revision.
Each stream lasts up to 45 seconds and reconnects automatically, with bounded
backoff for network failures. Stop or closing/disconnecting the workspace cancels
the upstream watch; switching feature pages retains it.

Limits: two streams per user/backend, 16 per instance, 8 KiB key/prefix input,
2 MiB gRPC/frame messages, and a 4 MiB pending-response budget. Slow consumers,
oversized events, permission changes, and compacted history surface a resync
warning rather than silently dropping events. Inspect the keys again or restart
from a known retained revision after such a warning. Watch is available in
read-only mode. Reverse proxies must disable response buffering for the watch
endpoint and permit long-lived responses; `X-Accel-Buffering: no` is sent.

### Users, roles, and permissions

**Import / export** transfers a version-1 JSON envelope with `records` containing
`keyBase64` and `valueBase64`. Exports contain only the caller's readable keys,
at a fixed snapshot revision across signed cursor pages (20 records, about
1 MiB per page). Download each page separately; compaction requires restarting.
Values above 128 KiB need external etcd tooling. Files contain secrets.

Import and exact-key bulk deletion require a preview, an explicit create-only
or overwrite policy, and typed `IMPORT N` / `DELETE N` confirmation. Batches
are limited to 50 unique keys, 1 MiB decoded data, and a 2 MiB JSON request.
Each batch is one revision-checked transaction: any conflict rejects all its
mutations. Multiple pages/batches are not globally atomic. Existing leases are
preserved on overwrite; new keys are unleased. Source revisions/lease IDs are
not restored. Cancellation of a submitted transaction does not prove rollback;
inspect keys and preview again before retrying. List view supports selection
of up to 50 exact keys for deletion preview.

**New key** in the key-browser header works in both Folder and List views. Paste
the full path (for example,
`/system/automation-services/driver-simulator/common/redis/pool-timeout`) and enter
its value directly. Parent folders are virtual and need no separate creation.
The write is create-only (`expectedRevision: "0"`): an existing key is never
overwritten. Empty values are allowed, and text is stored exactly without format
conversion. This form supports keys up to 8 KiB and values up to 128 KiB of UTF-8.
New keys have no lease/TTL. The current editor selection and unsaved draft remain
unchanged, including when creating outside the displayed prefix/page. Cancellation
cannot undo a submitted write; inspect the exact key before retrying an unknown
outcome. Errors preserve the entered key and value.

**Duplicate folder…** is available from a persisted folder's context menu in the
key browser (right-click or Shift+F10). Choose a different destination path, preview
all readable source keys, then type `COPY N` to apply. For example, copy
`/system/automation-services/driver-simulator/v1/t0002/` to the corresponding
`t0003/` prefix. This includes readable keys beyond the current browser page, not
unsaved drafts or keys outside your read permissions. The source is unchanged;
only key prefixes are rewritten. Values (including embedded IDs/paths) are copied
byte-for-byte, and new keys have **no lease/TTL**.

Copies are create-only: destination collisions stop the operation rather than
overwrite data. Preview is bounded to 1,000 keys / 16 MiB of source records / 100
export pages, with a two-minute limit for each preview/copy phase. Values remain
limited to 128 KiB. Pages use one source snapshot and are applied in separate
atomic batches of at most 20 keys; a whole folder is **not globally atomic**.
Failures/cancellation can leave a partial copy. Confirmed progress is reported;
inspect the destination before retrying an uncertain batch. No automatic rollback
or retry occurs. Use etcd tooling for larger copies.

**Overview** provides root-authorized maintenance metrics from configured
endpoints: availability, DB size/in-use/quota (when reported), leader, Raft lag,
and alarms. It keeps at most 60 local trend samples, pauses polling in hidden
browser tabs, backs off after errors, and retains visibly stale samples during
outages. Status availability is not a write-quorum test. Throughput/latency and
WAL/commit rates require a future configured Prometheus integration; no arbitrary
metrics URL fetching or inferred rates are used.

Use **Roles** to create roles and grant or revoke read, write, or read/write
permissions for exact keys, prefixes, or half-open byte-ordered ranges. Scope
previews explain the affected keys: `/app` and `/app/` are different prefixes,
not filesystem directories. Existing binary permissions can be inspected and
revoked losslessly; new rules use UTF-8 text inputs. All assigned roles combine.
Deleting a role removes its assignments, not keys, and requires its typed name.

Use **Users** to create accounts, inspect role chips, assign/remove roles, and
change passwords (1–72 UTF-8 bytes). Administrative mutations require the
caller's etcd root role. Users cannot receive root during creation; explicit
promotion requires typing `GRANT ROOT`. The built-in root role cannot be edited
or deleted. The canonical `root` user and accounts optionally listed in
`protectedUsers` cannot be deleted or lose their root role through either API
generation. Protected accounts must have passwords rotated externally; other
root-authorized password changes can use the UI. Confirmed own-password changes update
the matching tab-memory profile where possible; otherwise reauthenticate.
Passwords are not persisted in browser storage.

The versioned RBAC API uses JSON bodies and query-based user/role detail routes,
supporting names containing slashes. Mutations use caller credentials, bounded
RPC deadlines, same-origin enforcement, and the read-only guard.

### Bounded key browsing

The UI uses `GET /api/v1/keys?prefix=...&limit=100&cursor=...` (default 100,
maximum 1,000 keys). Results contain `items`, `revision`, `hasMore`, and an
optional `nextCursor`; values are fetched only when selecting a key. Continue
with the same prefix/limit and the returned cursor. Cursors are signed, scoped
to the backend/user/credentials/query, expire after 10 minutes, and become
invalid after an adminer restart. Compacted snapshots return HTTP 409; restart
the listing. Prefixes are limited to 8 KiB and cursor tokens to 64 KiB.

List view shows **one 100-key server page**. Folder view automatically collects
up to ten 1,000-key pages of key summaries at the same snapshot, so projects
beyond the first page are included in the tree. Progress is visible; a partial
tree is explicitly labelled, with **Load more keys** to append another bounded
batch or a prefix to narrow the query. Permission, cursor and compaction errors
are surfaced, never presented as a complete tree. Values are not prefetched.
Substring filtering in List view applies only to that page; use the prefix field
for server-side queries. The prefix is applied automatically after a 350 ms typing pause (Enter
applies immediately); there is no Apply button. Changing it cancels stale reads,
resets pagination/selection and pauses the old live stream without replacing
editor drafts. Clearing it restarts the unfiltered listing. IME composition is
allowed to finish before querying. Binary keys are encoded as base64 in API metadata and excluded from
the text-editing view with an explicit notice. Binary editing remains planned.
Draft files/directories stay local until a file is saved; no whole-cluster scan
is needed to create a draft. The legacy unbounded `GET /api/keys` tree endpoint
is deprecated and retained only for compatibility; new clients must not use it.

The key workspace uses a compact header and top-aligned browser/editor panels.
Browser width is adjustable in the header on desktop; live-update controls and
editor **Expiration on save** settings expand on demand. Read-only users still see
the key's current lease metadata, but no inactive expiration controls.

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

The same `publicOrigin` setting is needed if a proxy changes the Host or public
port, even without TLS termination. Include any non-default public port. A 403
with code `invalid_origin` is a policy rejection before etcd authentication, not
evidence of an incorrect password; the connection UI reports it separately.

### Upstream TLS / mTLS

All etcd handlers use the selected backend's transport policy, including
authentication, RBAC, key operations, and discovered-member status calls.
For private CAs or client-certificate authentication, configure each backend:

```yaml
etcd:
  - name: secure
    endpoints: ["https://etcd.example.com:2379"]
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

### Connection credentials, account protection and read-only deployments

Backends configure endpoints and transport policy only. Startup never connects
to etcd or authenticates with a shared administrator account. Each browser
connection supplies its own credentials; all permission discovery, reads,
mutations and administrative RPCs use that caller's etcd identity. A restricted
user can inspect their own assigned roles/permissions, but cannot acquire
administrator capabilities through Adminer.

Optionally protect externally managed accounts without storing their passwords:

```yaml
http:
  port: 8080
  readOnly: true
etcd:
  - name: production
    endpoints: ["https://etcd.example.com:2379"]
    protectedUsers: [service-admin]
    tls:
      enabled: true
      caFile: /run/secrets/etcd-ca.pem
```

`protectedUsers` prevents account deletion, root-role removal and in-app password
changes. It grants no access and is not used to connect. The canonical `root`
account always retains deletion/root-role-removal protection, even if this list
is omitted. Admin RPCs still require the caller's etcd root role.

**Migration:** remove the old `superadmin` block and any Adminer-only secret
mount/environment variable used for it. Legacy blocks are accepted with a
non-secret startup warning; `password`, `passwordFile` and `passwordEnv` are
ignored (files/environment values are not read). The legacy username is treated
as an additional protected account for compatibility. Move it to `protectedUsers`
if that guard is still wanted. The configuration API does not expose this policy
or legacy credentials. TLS certificate/key mounts remain required when configured.

`http.readOnly: true` rejects all mutating API methods except authentication,
including key writes/deletes and RBAC changes. The UI displays a read-only banner
and disables mutation controls; if settings cannot be loaded, it fails closed.
This is an additional application guard, not a substitute for etcd RBAC or
protecting users' connection credentials. It does not make an exposed instance safe
without HTTPS, authorization, and appropriate network access controls.

## Contributions

Contributions are welcome. Please free free to open PRs if you have anything to contribute with.
