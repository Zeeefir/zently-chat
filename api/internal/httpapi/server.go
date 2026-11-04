package httpapi

import (
	"net/http"
	"time"

	"newsChat/api/internal/config"
)

func NewServer(cfg config.Config) *http.Server {
	return &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           newRouter(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
}
