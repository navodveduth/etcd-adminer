package routes

import "net/http"

func (a api) access() {
	h := a.handler
	a.handle("/api/users", h.GetUserList, http.MethodGet, http.MethodOptions)
	a.handle("/api/users", h.CreateUser, http.MethodPost, http.MethodOptions)
	a.handle("/api/users/{name}", h.GetUserInfo, http.MethodGet, http.MethodOptions)
	a.handle("/api/users/{name}", h.DeleteUser, http.MethodDelete, http.MethodOptions)
	a.handle("/api/users/{name}/role/{role}", h.AssignRole, http.MethodPost, http.MethodOptions)
	a.handle("/api/users/{name}/role/{role}", h.UnassignRole, http.MethodDelete, http.MethodOptions)
	a.handle("/api/role", h.GetRoles, http.MethodGet, http.MethodOptions)
	a.handle("/api/v1/roles", h.Roles, http.MethodGet, http.MethodPost)
	a.handle("/api/v1/roles/detail", h.RoleDetail, http.MethodGet, http.MethodDelete)
	a.handle("/api/v1/roles/permissions", h.RolePermissions, http.MethodPost, http.MethodDelete)
	a.handle("/api/v1/users/roles", h.UserRoles, http.MethodPost)
	a.handle("/api/v1/users/password", h.UserPassword, http.MethodPost)
	a.handle("/api/v1/users/detail", h.UserDetail, http.MethodGet, http.MethodDelete)
}
