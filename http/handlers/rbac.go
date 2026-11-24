package handlers

import (
	"bytes"
	"encoding/base64"
	"errors"
	"net/http"
	"strings"

	"github.com/srimaln91/etcd-adminer/http/request"
	"github.com/srimaln91/etcd-adminer/http/response"
	"go.etcd.io/etcd/api/v3/authpb"
	clientv3 "go.etcd.io/etcd/client/v3"
)

func validIdentity(name string) bool { return strings.TrimSpace(name) != "" && len(name) <= 1024 }

type permissionInput struct {
	Name           string `json:"name"`
	Access         string `json:"access"`
	Scope          string `json:"scope"`
	Key            string `json:"key"`
	RangeEnd       string `json:"rangeEnd"`
	KeyBase64      string `json:"keyBase64"`
	RangeEndBase64 string `json:"rangeEndBase64"`
}

func permissionBounds(input permissionInput, revoke bool) (string, string, clientv3.PermissionType, error) {
	invalid := errors.New("provide a non-empty key, a valid exact/prefix/range scope, and read/write/readwrite access")
	if revoke {
		key, err := base64.StdEncoding.DecodeString(input.KeyBase64)
		if err != nil || len(key) == 0 || len(key) > 8192 {
			return "", "", 0, invalid
		}
		end, err := base64.StdEncoding.DecodeString(input.RangeEndBase64)
		if err != nil || len(end) > 8192 {
			return "", "", 0, invalid
		}
		return string(key), string(end), 0, nil
	}
	if input.Key == "" || len(input.Key) > 8192 {
		return "", "", 0, invalid
	}
	var access clientv3.PermissionType
	switch input.Access {
	case "read":
		access = clientv3.PermissionType(authpb.READ)
	case "write":
		access = clientv3.PermissionType(authpb.WRITE)
	case "readwrite":
		access = clientv3.PermissionType(authpb.READWRITE)
	default:
		return "", "", 0, invalid
	}
	end := ""
	switch input.Scope {
	case "exact":
	case "prefix":
		end = clientv3.GetPrefixRangeEnd(input.Key)
	case "range":
		if input.RangeEnd <= input.Key || len(input.RangeEnd) > 8192 {
			return "", "", 0, invalid
		}
		end = input.RangeEnd
	default:
		return "", "", 0, invalid
	}
	return input.Key, end, access, nil
}

func (jh *GenericHandler) Roles(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
	}
	if r.Method == http.MethodPost {
		if err := request.DecodeJSON(w, r, &body); err != nil || !validIdentity(body.Name) || body.Name == "root" {
			response.WriteError(w, 400, "invalid_role", "provide a role name of 1 to 1024 bytes; root is protected")
			return
		}
	}
	client, ctx, cleanup, ok := jh.requestClient(w, r, true)
	if !ok {
		return
	}
	defer cleanup()
	if r.Method == http.MethodPost {
		if _, err := client.RoleAdd(ctx, body.Name); err != nil {
			response.WriteRPCError(w, err)
			return
		}
		w.WriteHeader(http.StatusCreated)
		return
	}
	roles, err := client.RoleList(ctx)
	if err != nil {
		response.WriteRPCError(w, err)
		return
	}
	writeJSON(w, struct {
		Roles []string `json:"roles"`
	}{roles.Roles})
}

func (jh *GenericHandler) RoleDetail(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if !validIdentity(name) {
		response.WriteError(w, 400, "invalid_role", "provide a valid role name")
		return
	}
	if r.Method == http.MethodDelete {
		var body struct {
			Confirmation string `json:"confirmation"`
		}
		if err := request.DecodeJSON(w, r, &body); err != nil || body.Confirmation != name || name == "root" {
			response.WriteError(w, 400, "confirmation_required", "confirm the exact role name; root cannot be deleted")
			return
		}
	}
	client, ctx, cleanup, ok := jh.requestClient(w, r, true)
	if !ok {
		return
	}
	defer cleanup()
	if r.Method == http.MethodDelete {
		if _, err := client.RoleDelete(ctx, name); err != nil {
			response.WriteRPCError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}
	role, err := client.RoleGet(ctx, name)
	if err != nil {
		response.WriteRPCError(w, err)
		return
	}
	type permission struct {
		Key              string `json:"key"`
		KeyEncoding      string `json:"keyEncoding"`
		RangeEnd         string `json:"rangeEnd"`
		RangeEndEncoding string `json:"rangeEndEncoding"`
		KeyBase64        string `json:"keyBase64"`
		RangeEndBase64   string `json:"rangeEndBase64"`
		Scope            string `json:"scope"`
		Access           string `json:"access"`
	}
	items := make([]permission, 0, len(role.Perm))
	for _, rule := range role.Perm {
		key, encoding := displayBytes(rule.Key)
		end, endEncoding := displayBytes(rule.RangeEnd)
		scope := "range"
		if len(rule.RangeEnd) == 0 {
			scope = "exact"
		} else if bytes.Equal(rule.RangeEnd, []byte(clientv3.GetPrefixRangeEnd(string(rule.Key)))) {
			scope = "prefix"
		}
		items = append(items, permission{key, encoding, end, endEncoding, base64.StdEncoding.EncodeToString(rule.Key), base64.StdEncoding.EncodeToString(rule.RangeEnd), scope, strings.ToLower(rule.PermType.String())})
	}
	writeJSON(w, struct {
		Name        string       `json:"name"`
		Protected   bool         `json:"protected"`
		Permissions []permission `json:"permissions"`
	}{name, name == "root", items})
}

func (jh *GenericHandler) RolePermissions(w http.ResponseWriter, r *http.Request) {
	var body permissionInput
	if err := request.DecodeJSON(w, r, &body); err != nil || !validIdentity(body.Name) || body.Name == "root" {
		response.WriteError(w, 400, "invalid_role", "provide a valid non-root role and permission")
		return
	}
	key, end, access, err := permissionBounds(body, r.Method == http.MethodDelete)
	if err != nil {
		response.WriteError(w, 400, "invalid_permission", err.Error())
		return
	}
	client, ctx, cleanup, ok := jh.requestClient(w, r, true)
	if !ok {
		return
	}
	defer cleanup()
	if r.Method == http.MethodDelete {
		_, err = client.RoleRevokePermission(ctx, body.Name, key, end)
	} else {
		_, err = client.RoleGrantPermission(ctx, body.Name, key, end, access)
	}
	if err != nil {
		response.WriteRPCError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (jh *GenericHandler) UserRoles(w http.ResponseWriter, r *http.Request) {
	var body struct {
		UserName     string `json:"userName"`
		Role         string `json:"role"`
		Operation    string `json:"operation"`
		Confirmation string `json:"confirmation"`
	}
	if err := request.DecodeJSON(w, r, &body); err != nil || !validIdentity(body.UserName) || !validIdentity(body.Role) || (body.Operation != "grant" && body.Operation != "revoke") {
		response.WriteError(w, 400, "invalid_request", "provide userName, role, and grant/revoke operation")
		return
	}
	if body.Role == "root" && body.Operation == "grant" && body.Confirmation != "GRANT ROOT" {
		response.WriteError(w, 400, "confirmation_required", "root grants require explicit GRANT ROOT confirmation")
		return
	}
	client, ctx, cleanup, ok := jh.requestClient(w, r, true)
	if !ok {
		return
	}
	defer cleanup()
	meta := r.Context().Value(META_KEY).(request.RequestMeta)
	if body.Role == "root" && body.Operation == "revoke" && (body.UserName == "root" || body.UserName == meta.Backend.AdminConnection().Username) {
		response.WriteError(w, 400, "protected_administrator", "cannot remove the canonical or configured service administrator's root role")
		return
	}
	var err error
	if body.Operation == "grant" {
		_, err = client.UserGrantRole(ctx, body.UserName, body.Role)
	} else {
		_, err = client.UserRevokeRole(ctx, body.UserName, body.Role)
	}
	if err != nil {
		response.WriteRPCError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (jh *GenericHandler) UserPassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		UserName string `json:"userName"`
		Password string `json:"password"`
	}
	if err := request.DecodeJSON(w, r, &body); err != nil || !validIdentity(body.UserName) || body.Password == "" || len(body.Password) > 72 {
		response.WriteError(w, 400, "invalid_request", "provide a userName and a password of 1 to 72 UTF-8 bytes")
		return
	}
	meta, ok := r.Context().Value(META_KEY).(request.RequestMeta)
	if !ok || meta.Backend == nil {
		response.WriteError(w, 500, "internal_error", "request metadata missing")
		return
	}
	client, ctx, cleanup, ok := jh.requestClient(w, r, true)
	if !ok {
		return
	}
	defer cleanup()
	if body.UserName == meta.Backend.AdminConnection().Username {
		response.WriteError(w, 400, "managed_credential", "rotate the configured service administrator's password externally, update its protected credential source, and restart adminer")
		return
	}
	if _, err := client.UserChangePassword(ctx, body.UserName, body.Password); err != nil {
		response.WriteRPCError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (jh *GenericHandler) UserDetail(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if !validIdentity(name) {
		response.WriteError(w, http.StatusBadRequest, "invalid_user", "provide a valid user name")
		return
	}
	if r.Method == http.MethodDelete {
		var body struct {
			Confirmation string `json:"confirmation"`
		}
		if err := request.DecodeJSON(w, r, &body); err != nil || body.Confirmation != name {
			response.WriteError(w, http.StatusBadRequest, "confirmation_required", "confirm the exact user name")
			return
		}
	}
	client, ctx, cleanup, ok := jh.requestClient(w, r, r.Method == http.MethodDelete)
	if !ok {
		return
	}
	defer cleanup()
	meta := r.Context().Value(META_KEY).(request.RequestMeta)
	if r.Method == http.MethodDelete {
		if name == "root" || name == meta.Backend.AdminConnection().Username {
			response.WriteError(w, http.StatusBadRequest, "protected_administrator", "cannot delete the canonical or configured service administrator")
			return
		}
		if _, err := client.UserDelete(ctx, name); err != nil {
			response.WriteRPCError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}
	user, err := client.UserGet(ctx, name)
	if err != nil {
		response.WriteRPCError(w, err)
		return
	}
	writeJSON(w, struct {
		Name  string   `json:"name"`
		Roles []string `json:"roles"`
	}{name, user.Roles})
}
