package httpapi

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"newsChat/api/internal/config"
	"newsChat/api/internal/realtime"
)

func NewServer(cfg config.Config, db *pgxpool.Pool, publisher realtime.Publisher) *http.Server {
	return &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           newRouter(db, publisher),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
}
