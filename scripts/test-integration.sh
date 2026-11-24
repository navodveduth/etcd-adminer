#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

container=""
certificates=""
cleanup() {
  if [ -n "$container" ]; then docker stop "$container" >/dev/null || true; fi
  if [ -n "$certificates" ]; then
    rm -f "$certificates/ca.pem" "$certificates/server.pem" "$certificates/server-key.pem" \
      "$certificates/client.pem" "$certificates/client-key.pem"
    rmdir "$certificates"
  fi
}
trap cleanup EXIT

scheme=http
start_container() {
  # Own only this disposable container; never mount host etcd data.
  docker run --rm --detach --publish 127.0.0.1::2379 \
    --user "$(id -u):$(id -g)" --entrypoint /usr/local/bin/etcd \
    --env ETCD_NAME=integration --env ETCD_DATA_DIR=/tmp/etcd \
    --env "ETCD_LISTEN_CLIENT_URLS=$scheme://0.0.0.0:2379" \
    --env "ETCD_ADVERTISE_CLIENT_URLS=$scheme://127.0.0.1:2379" \
    --env ETCD_LOG_LEVEL=error "$@" "${ETCD_TEST_IMAGE:-quay.io/coreos/etcd:v3.7.4}"
}

if [ "${ETCD_TEST_TLS:-0}" = "1" ]; then
  scheme=https
  certificates=$(mktemp -d "${TMPDIR:-/tmp}/etcd-adminer-certs.XXXXXX")
  go run ./scripts/testcerts -dir "$certificates"
  container=$(start_container --mount "type=bind,source=$certificates,target=/certs,readonly" \
    --env ETCD_CERT_FILE=/certs/server.pem --env ETCD_KEY_FILE=/certs/server-key.pem \
    --env ETCD_TRUSTED_CA_FILE=/certs/ca.pem --env ETCD_CLIENT_CERT_AUTH=true)
else
  container=$(start_container)
fi
endpoint="$scheme://$(docker port "$container" 2379/tcp)"
ETCD_TEST_ENDPOINT="$endpoint" ETCD_TEST_CERTIFICATES="$certificates" \
  go test -race -tags=integration ./http/handlers/integration -count=1 "$@"
