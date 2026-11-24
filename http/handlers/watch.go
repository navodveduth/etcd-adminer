package handlers

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"sync/atomic"
	"time"
	"unicode/utf8"

	"github.com/srimaln91/etcd-adminer/etcd"
	"github.com/srimaln91/etcd-adminer/http/request"
	"github.com/srimaln91/etcd-adminer/http/response"
	clientv3 "go.etcd.io/etcd/client/v3"
)

const watchMessageBytes = 2 * 1024 * 1024
const watchQueueBytes = 4 * 1024 * 1024

var errWatchMessageTooLarge = errors.New("watch event exceeds the message budget")

type watchPrincipal struct{ backend, user string }
type changeEvent struct {
	Type          string  `json:"type"`
	Key           string  `json:"key"`
	KeyEncoding   string  `json:"keyEncoding"`
	Value         *string `json:"value,omitempty"`
	ValueEncoding string  `json:"valueEncoding,omitempty"`
	Revision      string  `json:"revision"`
}

func displayBytes(value []byte) (string, string) {
	if utf8.Valid(value) {
		return string(value), "utf8"
	}
	return base64.StdEncoding.EncodeToString(value), "base64"
}

func (jh *GenericHandler) reserveWatch(principal watchPrincipal) (func(), bool) {
	jh.watchMu.Lock()
	defer jh.watchMu.Unlock()
	if jh.watchCount >= 16 || jh.watches[principal] >= 2 {
		return nil, false
	}
	if jh.watches == nil {
		jh.watches = make(map[watchPrincipal]int)
	}
	jh.watchCount++
	jh.watches[principal]++
	return func() {
		jh.watchMu.Lock()
		defer jh.watchMu.Unlock()
		jh.watchCount--
		jh.watches[principal]--
		if jh.watches[principal] == 0 {
			delete(jh.watches, principal)
		}
	}, true
}

func sendWatchFrame(w http.ResponseWriter, kind string, revision int64, value interface{}) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	if len(data) > watchMessageBytes {
		return errWatchMessageTooLarge
	}
	controller := http.NewResponseController(w)
	if err := controller.SetWriteDeadline(time.Now().Add(15 * time.Second)); err != nil && !errors.Is(err, http.ErrNotSupported) {
		return err
	}
	if _, err := fmt.Fprintf(w, "event: %s\nid: %d\ndata: %s\n\n", kind, revision, data); err != nil {
		return err
	}
	return controller.Flush()
}

func (jh *GenericHandler) Watch(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	key := query.Get("key")
	if key == "" || len(key) > 8192 {
		response.WriteError(w, http.StatusBadRequest, "invalid_key", "provide an exact key or prefix of 1 to 8192 bytes")
		return
	}
	if query.Get("mode") != "exact" && query.Get("mode") != "prefix" {
		response.WriteError(w, http.StatusBadRequest, "invalid_mode", "mode must be exact or prefix")
		return
	}
	last := int64(0)
	if value := query.Get("afterRevision"); value != "" {
		parsed, err := strconv.ParseInt(value, 10, 64)
		if err != nil || parsed < 0 || parsed == int64(^uint64(0)>>1) || strconv.FormatInt(parsed, 10) != value {
			response.WriteError(w, http.StatusBadRequest, "invalid_revision", "afterRevision must be a non-negative decimal string")
			return
		}
		last = parsed
	}
	meta, ok := r.Context().Value(META_KEY).(request.RequestMeta)
	if !ok || meta.Backend == nil {
		response.WriteError(w, http.StatusInternalServerError, "internal_error", "request metadata missing")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
	defer cancel()
	client, err := meta.Backend.NewClient(meta.User, meta.Pass, etcd.WithMaxReceiveBytes(watchMessageBytes))
	if err != nil {
		response.WriteRPCError(w, err)
		return
	}
	defer client.Close()
	if _, err := client.Authenticate(ctx, meta.User, meta.Pass); err != nil {
		response.WriteRPCError(w, err)
		return
	}
	release, ok := jh.reserveWatch(watchPrincipal{meta.Backend.Name(), meta.User})
	if !ok {
		w.Header().Set("Retry-After", "5")
		response.WriteError(w, http.StatusTooManyRequests, "watch_limit", "watch limit reached: at most 2 per user/backend and 16 per instance")
		return
	}
	defer release()
	// Authorize the complete requested range before committing SSE headers.
	readOptions := []clientv3.OpOption{clientv3.WithLimit(1), clientv3.WithKeysOnly()}
	if query.Get("mode") == "prefix" {
		readOptions = append(readOptions, clientv3.WithPrefix())
	}
	initial, err := client.Get(ctx, key, readOptions...)
	if err != nil {
		response.WriteRPCError(w, err)
		return
	}
	if last == 0 {
		last = initial.Header.Revision
	}
	if last > initial.Header.Revision {
		response.WriteError(w, http.StatusBadRequest, "future_revision", "the requested revision is ahead of this cluster; start from now or use a revision from this connection")
		return
	}
	watchContext, stopWatch := context.WithCancel(ctx)
	defer stopWatch()
	options := []clientv3.OpOption{clientv3.WithRev(last + 1), clientv3.WithCreatedNotify()}
	if query.Get("mode") == "prefix" {
		options = append(options, clientv3.WithPrefix())
	}
	stream := client.Watch(watchContext, key, options...)
	var initialWatch clientv3.WatchResponse
	select {
	case first, open := <-stream:
		if !open {
			response.WriteError(w, http.StatusServiceUnavailable, "watch_unavailable", "could not establish this watch")
			return
		}
		if err := first.Err(); err != nil {
			response.WriteRPCError(w, err)
			return
		}
		initialWatch = first
		// Created notifications do not contain changes; do not advance past the
		// requested revision, since changes between the read and watch must replay.
	case <-ctx.Done():
		response.WriteRPCError(w, ctx.Err())
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Accel-Buffering", "no")
	if err := sendWatchFrame(w, "ready", last, map[string]string{"revision": strconv.FormatInt(last, 10)}); err != nil {
		return
	}

	type envelope struct {
		response clientv3.WatchResponse
		size     int64
	}
	queue := make(chan envelope, 16)
	failures := make(chan string, 1)
	var queuedBytes atomic.Int64
	go func() {
		defer close(queue)
		push := func(item clientv3.WatchResponse) bool {
			if ctx.Err() != nil {
				return false
			}
			if item.Err() != nil {
				failures <- "watch interrupted, permission changed, or history compacted; refresh and restart"
				return false
			}
			if len(item.Events) == 0 {
				return true
			}
			var size int64
			for _, event := range item.Events {
				size += int64(len(event.Kv.Key) + len(event.Kv.Value) + 128)
			}
			if queuedBytes.Add(size) > watchQueueBytes {
				failures <- "consumer too slow or event too large; narrow the prefix and resynchronize"
				stopWatch()
				return false
			}
			select {
			case queue <- envelope{item, size}:
			case <-ctx.Done():
				return false
			default:
				failures <- "consumer too slow; narrow the prefix and resynchronize"
				stopWatch()
				return false
			}
			return true
		}
		if !push(initialWatch) {
			return
		}
		for item := range stream {
			if !push(item) {
				return
			}
		}
	}()
	heartbeat := time.NewTicker(5 * time.Second)
	defer heartbeat.Stop()
	for {
		select {
		case reason := <-failures:
			_ = sendWatchFrame(w, "resync", last, map[string]string{"message": reason})
			return
		case item, open := <-queue:
			if !open {
				select {
				case reason := <-failures:
					_ = sendWatchFrame(w, "resync", last, map[string]string{"message": reason})
				default:
					_ = sendWatchFrame(w, "reconnect", last, map[string]string{"revision": strconv.FormatInt(last, 10)})
				}
				return
			}
			events := make([]changeEvent, 0, len(item.response.Events))
			revision := last
			for _, event := range item.response.Events {
				key, encoding := displayBytes(event.Kv.Key)
				change := changeEvent{Type: event.Type.String(), Key: key, KeyEncoding: encoding, Revision: strconv.FormatInt(event.Kv.ModRevision, 10)}
				if query.Get("values") == "true" && event.Type == clientv3.EventTypePut {
					value, encoding := displayBytes(event.Kv.Value)
					change.Value = &value
					change.ValueEncoding = encoding
				}
				events = append(events, change)
				if event.Kv.ModRevision > revision {
					revision = event.Kv.ModRevision
				}
			}
			if err := sendWatchFrame(w, "changes", revision, map[string]interface{}{"events": events, "revision": strconv.FormatInt(revision, 10)}); err != nil {
				if errors.Is(err, errWatchMessageTooLarge) {
					_ = sendWatchFrame(w, "resync", last, map[string]string{"message": "event too large; narrow the prefix and resynchronize"})
				}
				return
			}
			last = revision
			queuedBytes.Add(-item.size)
		case <-heartbeat.C:
			if err := sendWatchFrame(w, "heartbeat", last, map[string]string{"revision": strconv.FormatInt(last, 10)}); err != nil {
				return
			}
		case <-ctx.Done():
			if r.Context().Err() == nil {
				_ = sendWatchFrame(w, "reconnect", last, map[string]string{"revision": strconv.FormatInt(last, 10)})
			}
			return
		}
	}
}
