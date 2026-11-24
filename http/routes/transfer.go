package routes

import "net/http"

func (a api) transfer() {
	a.handle("/api/v1/transfer/export", a.handler.Transfer.ExportPage, http.MethodGet)
	a.handle("/api/v1/transfer/batch", a.handler.Transfer.TransferBatch, http.MethodPost)
}
