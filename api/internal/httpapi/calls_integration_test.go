package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"newsChat/api/internal/auth"
	"newsChat/api/internal/calls"
	"newsChat/api/internal/chat"
	"newsChat/api/internal/database"
)

func TestCallLifecycleAndSignaling(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to a test PostgreSQL database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Second)
	defer cancel()
	db, err := database.Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	service := auth.New(db)
	users := make([]auth.User, 0, 3)
	tokens := make([]string, 0, 3)
	defer func() {
		cleanup, c := context.WithTimeout(context.Background(), 5*time.Second)
		defer c()
		for _, u := range users {
			_, _ = db.Exec(cleanup, "DELETE FROM users WHERE id=$1", u.ID)
		}
	}()
	for i := 0; i < 3; i++ {
		email := fmt.Sprintf("calls-%d-%d@example.com", time.Now().UnixNano(), i)
		user, err := service.Register(ctx, "Call Tester", email, "test-password-12345")
		if err != nil {
			t.Fatal(err)
		}
		users = append(users, user)
		_, token, _, err := service.Login(ctx, email, "test-password-12345")
		if err != nil {
			t.Fatal(err)
		}
		tokens = append(tokens, token)
	}
	conv, err := chat.New(db).CreateConversation(ctx, users[0].ID, users[1].ID)
	if err != nil {
		t.Fatal(err)
	}
	otherConv, err := chat.New(db).CreateConversation(ctx, users[0].ID, users[2].ID)
	if err != nil {
		t.Fatal(err)
	}
	publisher := &testPublisher{}
	server := httptest.NewServer(newRouter(db, publisher))
	defer server.Close()
	request := func(actor int, method, path string, body any, status int) map[string]json.RawMessage {
		t.Helper()
		encoded, _ := json.Marshal(body)
		req, _ := http.NewRequest(method, server.URL+path, strings.NewReader(string(encoded)))
		req.Header.Set("Content-Type", "application/json")
		if actor >= 0 {
			req.AddCookie(&http.Cookie{Name: sessionCookie, Value: tokens[actor]})
		}
		response, err := server.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		var result map[string]json.RawMessage
		_ = json.NewDecoder(response.Body).Decode(&result)
		if response.StatusCode != status {
			t.Fatalf("%s %s actor %d: status %d want %d; body=%s", method, path, actor, response.StatusCode, status, result)
		}
		return result
	}
	var sequence int
	newID := func() string { sequence++; return fmt.Sprintf("20000000-0000-0000-0000-%012d", sequence) }
	createPath := "/api/conversations/" + conv.ID + "/calls"
	request(-1, "POST", createPath, map[string]any{"client_call_id": newID()}, 401)
	request(2, "POST", createPath, map[string]any{"client_call_id": newID()}, 404)
	clientID := newID()
	result := request(0, "POST", createPath, map[string]any{"client_call_id": clientID}, 201)
	var call calls.Call
	_ = json.Unmarshal(result["call"], &call)
	if call.Status != "ringing" || call.CallerID != users[0].ID || call.CalleeID != users[1].ID || publisher.event != "call.updated" {
		t.Fatal("incorrect incoming call")
	}
	path := "/api/calls/" + call.ID
	replay := request(0, "POST", createPath, map[string]any{"client_call_id": clientID}, 200)
	var same calls.Call
	_ = json.Unmarshal(replay["call"], &same)
	if same.ID != call.ID {
		t.Fatal("duplicate call")
	}
	request(0, "POST", "/api/conversations/"+otherConv.ID+"/calls", map[string]any{"client_call_id": clientID}, 409)
	request(0, "POST", createPath, map[string]any{"client_call_id": newID()}, 409)
	request(2, "GET", path, nil, 404)
	active := request(1, "GET", "/api/calls", nil, 200)
	var activeCalls []calls.Call
	_ = json.Unmarshal(active["calls"], &activeCalls)
	if len(activeCalls) != 1 {
		t.Fatal("incoming call not listed")
	}
	request(0, "POST", path+"/actions", map[string]any{"action": "accept"}, 409)
	request(2, "POST", path+"/actions", map[string]any{"action": "accept"}, 404)
	request(0, "POST", path+"/signals", map[string]any{"client_signal_id": newID(), "type": "offer", "payload": map[string]any{"type": "offer", "sdp": "v=0\r\n"}}, 409)
	accepted := request(1, "POST", path+"/actions", map[string]any{"action": "accept"}, 200)
	_ = json.Unmarshal(accepted["call"], &same)
	if same.Status != "accepted" || same.Version != 2 {
		t.Fatal("accept failed")
	}
	request(1, "POST", path+"/actions", map[string]any{"action": "accept"}, 200)
	// SDP larger than Pusher's event limit travels via HTTP, with only its ID in Pusher.
	signalID := newID()
	offer := map[string]any{"client_signal_id": signalID, "type": "offer", "payload": map[string]any{"type": "offer", "sdp": "v=0\r\n" + strings.Repeat("a", 12000)}}
	posted := request(0, "POST", path+"/signals", offer, 201)
	var postedID string
	_ = json.Unmarshal(posted["signal_id"], &postedID)
	again := request(0, "POST", path+"/signals", offer, 200)
	if string(again["signal_id"]) != string(posted["signal_id"]) {
		t.Fatal("duplicate signal")
	}
	eventBody, _ := json.Marshal(publisher.data)
	if len(eventBody) > 1000 || publisher.channel != "private-user-"+users[1].ID || publisher.event != "call.signal" {
		t.Fatal("signal leaked into event or wrong recipient")
	}
	changed := map[string]any{"client_signal_id": signalID, "type": "offer", "payload": map[string]any{"type": "offer", "sdp": "v=0 changed"}}
	request(0, "POST", path+"/signals", changed, 409)
	request(1, "POST", path+"/signals", map[string]any{"client_signal_id": newID(), "type": "offer", "payload": map[string]any{"type": "offer", "sdp": "v=0\r\n"}}, 409)
	inbox := request(1, "GET", path+"/signals", nil, 200)
	var signals []calls.Signal
	_ = json.Unmarshal(inbox["signals"], &signals)
	if len(signals) != 1 || signals[0].ID != postedID {
		t.Fatal("missing offer")
	}
	own := request(0, "GET", path+"/signals", nil, 200)
	if string(own["signals"]) != "[]" {
		t.Fatal("sender received own signal")
	}
	request(2, "GET", path+"/signals", nil, 404)
	request(1, "GET", path+"/signals?after="+postedID, nil, 200)
	request(1, "GET", path+"/signals?after=-1", nil, 400)
	request(1, "POST", path+"/signals", map[string]any{"client_signal_id": newID(), "type": "answer", "payload": map[string]any{"type": "answer", "sdp": "v=0\r\n"}}, 201)
	request(0, "POST", path+"/signals", map[string]any{"client_signal_id": newID(), "type": "ice", "payload": map[string]any{"candidate": "candidate:1 1 UDP 1 127.0.0.1 5000 typ host", "sdpMid": "0", "sdpMLineIndex": 0}}, 201)
	request(1, "POST", path+"/signals", map[string]any{"client_signal_id": newID(), "type": "ice", "payload": nil}, 400)
	personal := map[string]any{"socket_id": "123.456", "channel_name": "private-user-" + users[0].ID}
	request(0, "POST", "/api/pusher/auth", personal, 200)
	request(1, "POST", "/api/pusher/auth", personal, 400)
	publisher.fail = true
	ended := request(0, "POST", path+"/actions", map[string]any{"action": "end"}, 200)
	if string(ended["realtime"]) != `"failed"` {
		t.Fatal("outage not reported")
	}
	publisher.fail = false
	request(0, "POST", path+"/actions", map[string]any{"action": "end"}, 200)
	request(1, "POST", path+"/actions", map[string]any{"action": "accept"}, 409)
	request(1, "GET", path+"/signals", nil, 409)
	var signalCount int
	if err := db.QueryRow(ctx, "SELECT count(*) FROM call_signals WHERE call_id=$1", call.ID).Scan(&signalCount); err != nil || signalCount != 0 {
		t.Fatal("signals not removed on end")
	}
	// Ringing expiry releases the participants for the next call.
	next := request(0, "POST", createPath, map[string]any{"client_call_id": newID()}, 201)
	_ = json.Unmarshal(next["call"], &call)
	if _, err := db.Exec(ctx, "UPDATE calls SET expires_at=now()-interval '1 second' WHERE id=$1", call.ID); err != nil {
		t.Fatal(err)
	}
	expired := request(1, "GET", "/api/calls/"+call.ID, nil, 200)
	_ = json.Unmarshal(expired["call"], &same)
	if same.Status != "expired" {
		t.Fatal("call did not expire")
	}
	rejected := request(0, "POST", createPath, map[string]any{"client_call_id": newID()}, 201)
	_ = json.Unmarshal(rejected["call"], &call)
	request(1, "POST", "/api/calls/"+call.ID+"/actions", map[string]any{"action": "reject"}, 200)
	cancelled := request(0, "POST", createPath, map[string]any{"client_call_id": newID()}, 201)
	_ = json.Unmarshal(cancelled["call"], &call)
	request(0, "POST", "/api/calls/"+call.ID+"/actions", map[string]any{"action": "cancel"}, 200)
}
