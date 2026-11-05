package httpapi

import (
	"embed"
	"net/http"
)

//go:embed docs/*
var documentation embed.FS

func registerDocs(mux *http.ServeMux) {
	mux.HandleFunc("GET /swagger", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/swagger/", http.StatusTemporaryRedirect)
	})
	mux.HandleFunc("GET /swagger/{$}", func(w http.ResponseWriter, r *http.Request) {
		body, _ := documentation.ReadFile("docs/index.html")
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(body)
	})
	mux.HandleFunc("GET /swagger/openapi.json", func(w http.ResponseWriter, r *http.Request) {
		body, _ := documentation.ReadFile("docs/openapi.json")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	})
}
