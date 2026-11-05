package auth

import (
	"context"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"newsChat/api/internal/database"
)

func TestSessionLifecycle(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to a test PostgreSQL database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	db, err := database.Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	s := New(db)
	email := fmt.Sprintf("test-%d@example.com", time.Now().UnixNano())
	u, err := s.Register(ctx, "Integration Test", email, "test-password-12345")
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		cleanup, c := context.WithTimeout(context.Background(), 5*time.Second)
		defer c()
		_, _ = db.Exec(cleanup, "DELETE FROM users WHERE id=$1", u.ID)
	}()
	if _, err := s.Register(ctx, "Duplicate", email, "test-password-12345"); !errors.Is(err, ErrEmailExists) {
		t.Fatalf("duplicate: %v", err)
	}
	if _, _, _, err := s.Login(ctx, email, "wrong-password-123"); !errors.Is(err, ErrCredentials) {
		t.Fatalf("wrong password: %v", err)
	}
	_, token, _, err := s.Login(ctx, email, "test-password-12345")
	if err != nil {
		t.Fatal(err)
	}
	current, err := s.CurrentUser(ctx, token)
	if err != nil || current.ID != u.ID {
		t.Fatalf("current user: %v", err)
	}
	if err := s.Logout(ctx, token); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CurrentUser(ctx, token); !errors.Is(err, ErrSession) {
		t.Fatalf("logged out token: %v", err)
	}
	_, token, _, err = s.Login(ctx, email, "test-password-12345")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, "UPDATE sessions SET created_at=now()-interval '2 days', expires_at=now()-interval '1 day' WHERE user_id=$1", u.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CurrentUser(ctx, token); !errors.Is(err, ErrSession) {
		t.Fatalf("expired session: %v", err)
	}
}
