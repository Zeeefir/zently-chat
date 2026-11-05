package main

import (
	"context"
	"errors"
	"log"
	"net/http"

	"newsChat/api/internal/config"
	"newsChat/api/internal/database"
	"newsChat/api/internal/httpapi"
	"newsChat/api/internal/realtime"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}

	if err := run(cfg); err != nil {
		log.Fatal(err)
	}
}

func run(cfg config.Config) error {
	db, err := database.Open(context.Background(), cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	log.Println("Подключение к PostgreSQL установлено")
	if err := database.Migrate(context.Background(), db); err != nil {
		return err
	}

	publisher, err := realtime.FromEnv()
	if err != nil {
		return err
	}
	if !publisher.Enabled() {
		log.Println("Pusher не настроен: HTTP-чат доступен, мгновенные события отключены")
	}
	server := httpapi.NewServer(cfg, db, publisher)
	log.Printf("API запускается: http://localhost:%s", cfg.Port)

	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
