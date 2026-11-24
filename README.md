# Web based admin interface for ETCD (https://etcd.io)

## Screenshot
![image info](./resources/screenshot.png)

## Configuration
The application config is defined in yaml format.  You may obtain it from (config.default.yaml)[config.default.yaml].

```yaml
http:
  port: 8080

logger:
  level: "DEBUG"

etcd:
- name: "LOCAL"
  endpoints:
    - "0.0.0.0:23791"
    - "0.0.0.0:23792"
    - "0.0.0.0:23793"
  superadmin:
    username: root
    password: root@123
```
## How to run

### Using Docker

#### Run the latest version using the publicly hosted image
```bash
docker run -d --name etcd-adminer -p 8080:8080 srimaln91/etcd-adminer:latest
```

#### Run the application using a custom configuration file

You can mount the config file as a bind mount.

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

## Contributions

Contributions are welcome. Please free free to open PRs if you have anything to contribute with.
