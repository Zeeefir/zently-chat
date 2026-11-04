package httpapi

import (
	"net/http"

	"newsChat/api/internal/auth"

	"github.com/jackc/pgx/v5/pgxpool"
)

func newRouter(db *pgxpool.Pool) http.Handler {
	mux := http.NewServeMux()
	h := &authHandlers{service: auth.New(db)}
	authMux := http.NewServeMux()
	authMux.HandleFunc("POST /api/auth/register", h.register)
	authMux.HandleFunc("POST /api/auth/login", h.login)
	authMux.HandleFunc("POST /api/auth/logout", h.logout)
	authMux.HandleFunc("GET /api/auth/me", h.me)
	mux.Handle("/api/auth/", protectAuth(authMux))
	mux.HandleFunc("GET /api/ready", readinessHandler(db))

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "route_not_found"})
	})

	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
			return
		}
		healthHandler(w, r)
	})

	return mux
}
