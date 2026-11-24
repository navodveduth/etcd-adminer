FROM golang:1.27.4-bookworm AS build_go
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go test ./... && go vet ./...
RUN CGO_ENABLED=0 go build -trimpath -o /out/etcd-adminer .

FROM node:24.22.3-bookworm-slim AS build_ui
WORKDIR /src/ui
COPY ui/package.json ui/package-lock.json ./
RUN npm ci
COPY ui/ ./
RUN npm run lint && npm test && npm run build

FROM gcr.io/distroless/static-debian13:nonroot
WORKDIR /app
COPY --from=build_go /out/etcd-adminer /app/etcd-adminer
COPY --from=build_ui /src/ui/build /app/static
COPY config.default.yaml /app/config.yaml
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/app/etcd-adminer"]
