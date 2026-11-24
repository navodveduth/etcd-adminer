package bootstrap

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/srimaln91/etcd-adminer/config"
	"github.com/srimaln91/etcd-adminer/etcd"
	"github.com/srimaln91/etcd-adminer/http/router"
	"github.com/srimaln91/etcd-adminer/http/server"
	"github.com/srimaln91/etcd-adminer/log"
)

func Init() {

	// Read and parse config
	configFilePath := flag.String("config", "config.yaml", "config filepath")
	flag.Parse()

	cfg, err := config.Parse(*configFilePath)
	if err != nil {
		panic(err)
	}

	// Init Logger
	logger, err := log.NewLogger(cfg.Logger.Level)
	if err != nil {
		panic(err)
	}

	// Create admin backends
	backendProvider := etcd.NewBackendProvider()
	defer func() {
		if err := backendProvider.Close(); err != nil {
			logger.Error(context.Background(), "backend cleanup failed", "error", err.Error())
		}
	}()

	for _, cluster := range cfg.ETCD {
		tlsConfig, err := cluster.TLS.Load()
		if err != nil {
			logger.Error(context.Background(), "TLS configuration failed", "backend", cluster.Name, "error", err.Error())
			return
		}
		err = backendProvider.RegisterBackend(cluster.Name, cluster.Endpoints, cluster.SuperAdmin.UserName, cluster.SuperAdmin.Password, etcd.WithTLS(tlsConfig))
		if err != nil {
			logger.Error(context.Background(), "backend registration failed", "error", err.Error())
			return
		}

		logger.Info(context.TODO(), fmt.Sprintf("registered backend %s with endpoints %v", cluster.Name, cluster.Endpoints))
	}

	// Init Http handler
	httpHandler, err := router.NewRouter(logger, backendProvider)
	if err != nil {
		logger.Error(context.Background(), "router initialization failed", "error", err.Error())
		return
	}

	// Init Http server
	httpSrv, err := server.Start(fmt.Sprintf(":%d", cfg.HTTP.Port), httpHandler, logger)
	if err != nil {
		logger.Error(context.Background(), "HTTP startup failed", "error", err.Error())
		return
	}

	// Listen for term signals
	c := make(chan os.Signal, 1)

	// We'll accept graceful shutdowns when quit via SIGINT (Ctrl+C)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM, syscall.SIGQUIT, syscall.SIGINT)
	defer signal.Stop(c)

	// Block until we receive our signal
	signal := <-c

	logger.Info(context.Background(), fmt.Sprintf("received signal: %s", signal))

	// Shutdown Http server
	// Create a deadline to wait for.
	ctx, cancel := context.WithTimeout(context.Background(), time.Second*5)
	defer cancel()

	_ = httpSrv.ShutDown(ctx)

}
