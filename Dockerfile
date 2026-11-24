FROM golang:1.27.4-bookworm@sha256:b754301872c53d3dff666ec39e3fae971dc6f5ecd5a9b01fdefabbebb0f59901 AS build_go
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go test ./... && go vet ./...
RUN CGO_ENABLED=0 go build -trimpath -o /out/etcd-adminer .

FROM node:24.22.3-bookworm-slim@sha256:32e57b5784e8875d2cc0112dcaf13f9100f2d0d9446187808738e99aee29a5a2 AS build_ui
WORKDIR /src/ui
COPY ui/package.json ui/package-lock.json ./
RUN npm ci
COPY ui/ ./
RUN npm run lint && npm test && npm run build

FROM gcr.io/distroless/static-debian13:nonroot@sha256:8ce6dd87e9823c5b48dcfb2c8604714ccb351ce59607327bcc4957448da279b5
WORKDIR /app
COPY --from=build_go /out/etcd-adminer /app/etcd-adminer
COPY --from=build_ui /src/ui/build /app/static
COPY config.default.yaml /app/config.yaml
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/app/etcd-adminer"]
