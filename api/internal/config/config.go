package config

import (
	"fmt"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	Port        string
	DatabaseURL string
}

func Load() (Config, error) {
	// Start from api/: the shared Docker and API settings live one level up.
	// ENV_FILE allows choosing another path explicitly.
	envFile := os.Getenv("ENV_FILE")
	if envFile == "" {
		envFile = "../.env"
	}
	if err := godotenv.Load(envFile); err != nil && !os.IsNotExist(err) {
		return Config{}, fmt.Errorf("не удалось прочитать файл настроек %s", envFile)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	number, err := strconv.Atoi(port)
	if err != nil || number < 1 || number > 65535 {
		return Config{}, fmt.Errorf("PORT должен быть числом от 1 до 65535")
	}

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return Config{}, fmt.Errorf("задайте переменную окружения DATABASE_URL для подключения к PostgreSQL")
	}

	return Config{Port: port, DatabaseURL: databaseURL}, nil
}
