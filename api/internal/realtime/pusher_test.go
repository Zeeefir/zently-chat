package realtime

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	pusher "github.com/pusher/pusher-http-go/v5"
)

func TestPusherPrivateSignatureAndPublish(t *testing.T) {
	const channel = "private-conversation-11111111-1111-1111-1111-111111111111"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.URL.Path != "/apps/123/events" || r.URL.Query().Get("auth_signature") == "" {
			t.Error("incorrect signed Pusher request")
		}
		var event struct {
			Name     string   `json:"name"`
			Channels []string `json:"channels"`
			Data     string   `json:"data"`
		}
		if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
			t.Error(err)
		}
		if event.Name != "message.created" || len(event.Channels) != 1 || event.Channels[0] != channel || !strings.Contains(event.Data, "hello") {
			t.Error("incorrect event payload")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{}`))
	}))
	defer server.Close()
	client := &Client{sdk: &pusher.Client{AppID: "123", Key: "public-key", Secret: "test-secret", Host: strings.TrimPrefix(server.URL, "http://"), HTTPClient: server.Client()}}
	data, err := client.Authorize("123.456", channel)
	if err != nil {
		t.Fatal(err)
	}
	var result struct {
		Auth string `json:"auth"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatal(err)
	}
	mac := hmac.New(sha256.New, []byte("test-secret"))
	_, _ = mac.Write([]byte("123.456:" + channel))
	if result.Auth != "public-key:"+hex.EncodeToString(mac.Sum(nil)) {
		t.Fatal("incorrect private channel signature")
	}
	if err := client.Publish(channel, "message.created", map[string]string{"body": "hello"}); err != nil {
		t.Fatal(err)
	}
	config := client.PublicConfig()
	if _, ok := config["secret"]; ok {
		t.Fatal("secret exposed")
	}
}

func TestPusherConfiguration(t *testing.T) {
	for _, name := range []string{"PUSHER_APP_ID", "PUSHER_KEY", "PUSHER_SECRET", "PUSHER_CLUSTER"} {
		t.Setenv(name, "")
	}
	client, err := FromEnv()
	if err != nil || client.Enabled() {
		t.Fatal("empty configuration should disable Pusher")
	}
	t.Setenv("PUSHER_KEY", "public-key")
	if _, err := FromEnv(); err == nil {
		t.Fatal("partial configuration accepted")
	}
}
