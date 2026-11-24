package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/srimaln91/etcd-adminer/http/request"
	"github.com/srimaln91/etcd-adminer/http/response"
	"go.etcd.io/etcd/api/v3/v3rpc/rpctypes"
)

func (jh *GenericHandler) GetUserList(rw http.ResponseWriter, r *http.Request) {

	requestMeta, ok := r.Context().Value(META_KEY).(request.RequestMeta)
	if !ok {
		rw.WriteHeader(http.StatusInternalServerError)
		return
	}

	client, err := requestMeta.Backend.NewClient(requestMeta.User, requestMeta.Pass)
	if err != nil {
		if err == rpctypes.ErrAuthFailed {
			rw.WriteHeader(http.StatusForbidden)
			return
		}

		rw.WriteHeader(http.StatusInternalServerError)
		return
	}

	defer jh.closeEtcdClient(client)
	userList, err := client.UserList(r.Context())
	if err != nil {
		if err == rpctypes.ErrPermissionDenied || err == rpctypes.ErrPermissionNotGranted {
			rw.WriteHeader(http.StatusForbidden)
			return
		}

		rw.WriteHeader(http.StatusInternalServerError)
		return
	}

	response, err := json.Marshal(userList.Users)
	if err != nil {
		rw.WriteHeader(http.StatusInternalServerError)
		return
	}

	rw.Header().Add("Content-Type", "application/json")
	rw.WriteHeader(http.StatusOK)
	rw.Write(response)

}

func (jh *GenericHandler) GetUserInfo(rw http.ResponseWriter, r *http.Request) {

	requestMeta, ok := r.Context().Value(META_KEY).(request.RequestMeta)
	if !ok {
		rw.WriteHeader(http.StatusInternalServerError)
		return
	}

	vars := mux.Vars(r)

	if _, ok := vars["name"]; !ok {
		rw.WriteHeader(http.StatusNotAcceptable)
		return
	}

	client, err := requestMeta.Backend.NewClient(requestMeta.User, requestMeta.Pass)
	if err != nil {
		if err == rpctypes.ErrAuthFailed {
			rw.WriteHeader(http.StatusForbidden)
			return
		}

		rw.WriteHeader(http.StatusInternalServerError)
		return
	}

	defer jh.closeEtcdClient(client)
	etcdUser, err := client.UserGet(r.Context(), vars["name"])
	if err != nil {
		rw.WriteHeader(http.StatusInternalServerError)
		return
	}

	responseData := response.User{
		Name:  vars["name"],
		Roles: etcdUser.Roles,
	}
	response, err := json.Marshal(responseData)
	if err != nil {
		rw.WriteHeader(http.StatusInternalServerError)
		return
	}

	rw.Header().Add("Content-Type", "application/json")
	rw.WriteHeader(http.StatusOK)
	rw.Write(response)

}

func (jh *GenericHandler) AssignRole(rw http.ResponseWriter, r *http.Request) {

	requestMeta, ok := r.Context().Value(META_KEY).(request.RequestMeta)
	if !ok {
		rw.WriteHeader(http.StatusInternalServerError)
		return
	}

	vars := mux.Vars(r)

	if _, ok := vars["name"]; !ok {
		rw.WriteHeader(http.StatusNotAcceptable)
		return
	}

	if _, ok := vars["role"]; !ok {
		rw.WriteHeader(http.StatusNotAcceptable)
		return
	}

	client, err := requestMeta.Backend.NewClient(requestMeta.User, requestMeta.Pass)
	if err != nil {
		if err == rpctypes.ErrAuthFailed {
			rw.WriteHeader(http.StatusForbidden)
			return
		}

		rw.WriteHeader(http.StatusInternalServerError)
		return
	}

	defer jh.closeEtcdClient(client)
	if vars["role"] == "root" && r.Header.Get("X-Admin-Confirmation") != "GRANT ROOT" {
		response.WriteError(rw, http.StatusBadRequest, "confirmation_required", "root grants require explicit GRANT ROOT confirmation")
		return
	}
	_, err = client.UserGrantRole(r.Context(), vars["name"], vars["role"])
	if err != nil {
		if err == rpctypes.ErrPermissionDenied || err == rpctypes.ErrPermissionNotGranted {
			rw.WriteHeader(http.StatusForbidden)
			return
		}

		rw.WriteHeader(http.StatusInternalServerError)
		return
	}

	rw.WriteHeader(http.StatusOK)
}

func (jh *GenericHandler) UnassignRole(rw http.ResponseWriter, r *http.Request) {

	requestMeta, ok := r.Context().Value(META_KEY).(request.RequestMeta)
	if !ok {
		rw.WriteHeader(http.StatusInternalServerError)
		return
	}

	vars := mux.Vars(r)

	if _, ok := vars["name"]; !ok {
		rw.WriteHeader(http.StatusNotAcceptable)
		return
	}

	if _, ok := vars["role"]; !ok {
		rw.WriteHeader(http.StatusNotAcceptable)
		return
	}

	client, err := requestMeta.Backend.NewClient(requestMeta.User, requestMeta.Pass)
	if err != nil {
		if err == rpctypes.ErrAuthFailed {
			rw.WriteHeader(http.StatusForbidden)
			return
		}

		rw.WriteHeader(http.StatusInternalServerError)
		return
	}

	defer jh.closeEtcdClient(client)
	if vars["role"] == "root" && (vars["name"] == "root" || requestMeta.Backend.IsProtectedUser(vars["name"])) {
		response.WriteError(rw, http.StatusBadRequest, "protected_administrator", "cannot remove the canonical root user's or a protected account's root role")
		return
	}
	_, err = client.UserRevokeRole(r.Context(), vars["name"], vars["role"])
	if err != nil {
		if err == rpctypes.ErrPermissionDenied || err == rpctypes.ErrPermissionNotGranted {
			rw.WriteHeader(http.StatusForbidden)
			return
		}

		rw.WriteHeader(http.StatusInternalServerError)
		return
	}

	rw.WriteHeader(http.StatusOK)
}

func (jh *GenericHandler) DeleteUser(rw http.ResponseWriter, r *http.Request) {

	requestMeta, ok := r.Context().Value(META_KEY).(request.RequestMeta)
	if !ok {
		rw.WriteHeader(http.StatusInternalServerError)
		return
	}

	vars := mux.Vars(r)

	if _, ok := vars["name"]; !ok {
		rw.WriteHeader(http.StatusNotAcceptable)
		return
	}

	client, ctx, cleanup, ok := jh.requestClient(rw, r, true)
	if !ok {
		return
	}
	defer cleanup()
	if vars["name"] == "root" || requestMeta.Backend.IsProtectedUser(vars["name"]) {
		response.WriteError(rw, http.StatusBadRequest, "protected_administrator", "cannot delete the canonical root user or a protected account")
		return
	}
	_, err := client.UserDelete(ctx, vars["name"])
	if err != nil {
		if err == rpctypes.ErrPermissionDenied || err == rpctypes.ErrPermissionNotGranted {
			rw.WriteHeader(http.StatusForbidden)
			return
		}

		rw.WriteHeader(http.StatusInternalServerError)
		return
	}

	rw.WriteHeader(http.StatusOK)
}

func (jh *GenericHandler) CreateUser(rw http.ResponseWriter, r *http.Request) {
	var reqDataDecoded request.CreateUserRequest
	if err := request.DecodeJSON(rw, r, &reqDataDecoded); err != nil || !validIdentity(reqDataDecoded.UserName) || reqDataDecoded.Password == "" || len(reqDataDecoded.Password) > 72 || len(reqDataDecoded.Roles) > 32 {
		response.WriteError(rw, http.StatusBadRequest, "invalid_request", "a username, password, and valid JSON object are required")
		return
	}
	for _, role := range reqDataDecoded.Roles {
		if role == "root" {
			response.WriteError(rw, http.StatusBadRequest, "confirmation_required", "create the user first, then explicitly grant root from user details")
			return
		}
	}

	client, ctx, cleanup, ok := jh.requestClient(rw, r, true)
	if !ok {
		return
	}
	defer cleanup()
	_, err := client.UserAdd(ctx, reqDataDecoded.UserName, reqDataDecoded.Password)
	if err != nil {
		response.WriteRPCError(rw, err)
		return
	}

	// Assign Roles
	for _, role := range reqDataDecoded.Roles {
		_, err := client.UserGrantRole(ctx, reqDataDecoded.UserName, role)
		if err != nil {
			response.WriteError(rw, http.StatusConflict, "partial_user_creation", "the user was created but role assignment was incomplete; inspect the existing user before retrying")
			return
		}
	}

	rw.Header().Add("Content-Type", "application/json")
	rw.WriteHeader(http.StatusCreated)
}
