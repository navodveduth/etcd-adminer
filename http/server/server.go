package server

import (
	"context"
	"errors"
	"net"
	"net/http"
	"time"

	"github.com/srimaln91/etcd-adminer/log"
)

type Server struct {
	httpServer *http.Server
	logger     log.Logger
}

// Start binds synchronously so address/permission failures reach the caller.
func Start(address string, handler http.Handler, logger log.Logger) (*Server, error) {
	listener, err := net.Listen("tcp", address)
	if err != nil {
		return nil, err
	}
	httpServer := &http.Server{
		Addr:              listener.Addr().String(),
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	srv := &Server{httpServer: httpServer, logger: logger}
	go func() {
		if err := httpServer.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error(context.Background(), "HTTP server stopped unexpectedly", "error", err.Error())
		}
	}()
	logger.Info(context.Background(), "HTTP server listening", "address", httpServer.Addr)
	return srv, nil
}

// ShutDown gracefully stops the same server instance started by Start.
func (srv *Server) ShutDown(ctx context.Context) error {
	err := srv.httpServer.Shutdown(ctx)
	if err != nil {
		srv.logger.Error(ctx, "HTTP shutdown failed", "error", err.Error())
		// Do not leave active handlers alive after the graceful deadline.
		_ = srv.httpServer.Close()
	}
	return err
}
