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

## Contributions

Contributions are welcome. Please free free to open PRs if you have anything to contribute with.
