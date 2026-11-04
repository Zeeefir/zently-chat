package main

import (
	"errors"
	"log"
	"net/http"

	"newsChat/api/internal/config"
	"newsChat/api/internal/httpapi"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}

	server := httpapi.NewServer(cfg)
	log.Printf("API запускается: http://localhost:%s", cfg.Port)

	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
