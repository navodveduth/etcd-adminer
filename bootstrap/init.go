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

func Init() error {

	// Read and parse config
	configFilePath := flag.String("config", "config.yaml", "config filepath")
	flag.Parse()

	cfg, err := config.Parse(*configFilePath)
	if err != nil {
		return fmt.Errorf("configuration failed: %w", err)
	}

	// Init Logger
	logger, err := log.NewLogger(cfg.Logger.Level)
	if err != nil {
		return fmt.Errorf("logger initialization failed: %w", err)
	}

	// Register transport configuration without connecting to any cluster.
	backendProvider := etcd.NewBackendProvider()
	defer func() {
		if err := backendProvider.Close(); err != nil {
			logger.Error(context.Background(), "backend cleanup failed", "error", err.Error())
		}
	}()

	for index, cluster := range cfg.ETCD {
		tlsConfig, err := cluster.TLS.Load()
		if err != nil {
			return fmt.Errorf("backend %q TLS configuration failed: %w", cluster.Name, err)
		}
		protectedUsers := append([]string(nil), cluster.ProtectedUsers...)
		if cluster.SuperAdmin.UserName != "" {
			protectedUsers = append(protectedUsers, cluster.SuperAdmin.UserName)
		}
		if cluster.SuperAdmin != (config.AdminCredentials{}) {
			logger.Warn(context.Background(), "legacy superadmin credentials are ignored; remove the block and optionally use protectedUsers", "backend", cluster.Name)
			cfg.ETCD[index].SuperAdmin = config.AdminCredentials{}
		}
		err = backendProvider.RegisterBackend(cluster.Name, cluster.Endpoints, etcd.WithTLS(tlsConfig), etcd.WithProtectedUsers(protectedUsers...))
		if err != nil {
			return fmt.Errorf("backend registration failed: %w", err)
		}

		logger.Info(context.TODO(), fmt.Sprintf("registered backend %s with endpoints %v", cluster.Name, cluster.Endpoints))
	}

	// Init Http handler
	httpHandler, err := router.NewRouter(logger, backendProvider)
	if err != nil {
		return fmt.Errorf("router initialization failed: %w", err)
	}

	// Init Http server
	// Install termination handling before advertising readiness.
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM, syscall.SIGQUIT)
	defer signal.Stop(c)
	httpSrv, err := server.Start(fmt.Sprintf(":%d", cfg.HTTP.Port), httpHandler, logger)
	if err != nil {
		return fmt.Errorf("HTTP startup failed: %w", err)
	}

	// Block until we receive our signal
	signal := <-c

	logger.Info(context.Background(), fmt.Sprintf("received signal: %s", signal))

	// Shutdown Http server
	// Create a deadline to wait for.
	ctx, cancel := context.WithTimeout(context.Background(), time.Second*5)
	defer cancel()

	return httpSrv.ShutDown(ctx)
}
