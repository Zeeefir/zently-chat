package database

import (
	"context"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"fmt"
	"io/fs"
	"log"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

// Migrate applies pending SQL files atomically before the HTTP server starts.
func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	files, err := fs.Glob(migrationFiles, "migrations/*.sql")
	if err != nil {
		return fmt.Errorf("список миграций: %w", err)
	}
	sort.Strings(files)

	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("начало миграции: %w", err)
	}
	defer func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cleanupCancel()
		_ = tx.Rollback(cleanupCtx)
	}()

	// Serialize migrations when several API instances start simultaneously.
	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(782346019)"); err != nil {
		return fmt.Errorf("блокировка миграций: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			name TEXT PRIMARY KEY,
			checksum TEXT NOT NULL,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)
	`); err != nil {
		return fmt.Errorf("создание истории миграций: %w", err)
	}

	var applied []string
	for _, name := range files {
		body, err := migrationFiles.ReadFile(name)
		if err != nil {
			return fmt.Errorf("чтение %s: %w", name, err)
		}
		sum := sha256.Sum256(body)
		checksum := hex.EncodeToString(sum[:])
		var savedChecksum string
		err = tx.QueryRow(ctx, "SELECT checksum FROM schema_migrations WHERE name = $1", name).Scan(&savedChecksum)
		if err == nil {
			if savedChecksum != checksum {
				return fmt.Errorf("миграция %s изменена после применения; создайте новый SQL-файл", name)
			}
			continue
		}
		if err != pgx.ErrNoRows {
			return fmt.Errorf("проверка %s: %w", name, err)
		}
		if _, err := tx.Exec(ctx, string(body)); err != nil {
			return fmt.Errorf("выполнение %s: %w", name, err)
		}
		if _, err := tx.Exec(ctx, "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", name, checksum); err != nil {
			return fmt.Errorf("сохранение %s: %w", name, err)
		}
		applied = append(applied, name)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("сохранение миграций: %w", err)
	}
	for _, name := range applied {
		log.Printf("Применена миграция: %s", name)
	}
	return nil
}
