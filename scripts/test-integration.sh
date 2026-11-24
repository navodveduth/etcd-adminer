#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

# This script owns only the disposable container it creates. No host data mounts.
container=$(docker run --rm --detach --publish 127.0.0.1::2379 \
  --entrypoint /usr/local/bin/etcd "${ETCD_TEST_IMAGE:-quay.io/coreos/etcd:v3.7.4}" \
  --name integration --data-dir /tmp/etcd \
  --listen-client-urls http://0.0.0.0:2379 \
  --advertise-client-urls http://127.0.0.1:2379 --log-level error)
trap 'docker stop "$container" >/dev/null' EXIT
endpoint="http://$(docker port "$container" 2379/tcp)"
ETCD_TEST_ENDPOINT="$endpoint" go test -race -tags=integration ./http/handlers -count=1 "$@"
