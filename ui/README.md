## React Web UI

Use Node.js from `.nvmrc` (24.22.3) and `npm ci` for reproducible installs.

```sh
npm run dev         # Vite with HMR; /api proxies to Go on localhost:8080
npm test            # Vitest + jsdom + Testing Library
npm run lint        # standalone ESLint
npm run build       # production assets in build/, served by the Go backend
npm run preview     # local production-build preview, not a production server
```

Run the Go API separately with a configured etcd cluster. Production API calls are same-origin; no frontend secrets or API URL are embedded in the bundle. Any future `VITE_*` variables are public build-time configuration, not secret storage.

Vite replaces Create React App. JSX modules use `.jsx`; tests have explicit setup in `src/setupTests.js`. Development tooling improvements do not replace backend pagination or bounded rendering.

# Formatting

Run `npm run format` to format frontend code with the pinned Prettier version.
Run `npm run format:check` to verify formatting without modifying files; CI
requires this check alongside ESLint and tests. Configuration lives in
`.prettierrc.json`; build output, dependencies and the generated lockfile are
excluded. Go source continues to use `gofmt`.
