package httpapi

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestSignalValidation(t *testing.T) {
	for _, tc := range []struct {
		name, kind, payload string
		valid               bool
	}{
		{"offer", "offer", `{"type":"offer","sdp":"v=0\r\n"}`, true},
		{"answer", "answer", `{"type":"answer","sdp":"v=0\r\n"}`, true},
		{"wrong type", "answer", `{"type":"offer","sdp":"v=0\r\n"}`, false},
		{"null", "ice", `null`, false},
		{"candidate", "ice", `{"candidate":"candidate:1","sdpMid":"0","sdpMLineIndex":0,"usernameFragment":"abcd"}`, true},
		{"end of candidates", "ice", `{"candidate":""}`, true},
		{"bad candidate", "ice", `{"candidate":"hello"}`, false},
		{"nul", "offer", `{"type":"offer","sdp":"v=0\u0000"}`, false},
		{"unknown field", "offer", `{"type":"offer","sdp":"v=0\r\n","extra":"x"}`, false},
		{"too large", "offer", `{"type":"offer","sdp":"v=0` + strings.Repeat("a", 61*1024) + `"}`, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := validSignal(tc.kind, json.RawMessage(tc.payload)); got != tc.valid {
				t.Fatalf("valid=%v want=%v", got, tc.valid)
			}
		})
	}
}
