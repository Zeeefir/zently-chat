package realtime

import (
	"errors"
	"net/http"
	"net/url"
	"os"
	"time"

	pusher "github.com/pusher/pusher-http-go/v5"
)

type Publisher interface {
	Enabled() bool
	PublicConfig() map[string]any
	Publish(channel, event string, data any) error
	Authorize(socketID, channel string) ([]byte, error)
}

type Client struct{ sdk *pusher.Client }

func FromEnv() (*Client, error) {
	values := []string{os.Getenv("PUSHER_APP_ID"), os.Getenv("PUSHER_KEY"), os.Getenv("PUSHER_SECRET"), os.Getenv("PUSHER_CLUSTER")}
	count := 0
	for _, value := range values {
		if value != "" {
			count++
		}
	}
	if count == 0 {
		return &Client{}, nil
	}
	if count != 4 {
		return nil, errors.New("заполните все четыре настройки PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER")
	}
	return &Client{sdk: &pusher.Client{AppID: values[0], Key: values[1], Secret: values[2], Cluster: values[3], Secure: true, HTTPClient: &http.Client{Timeout: 3 * time.Second}}}, nil
}

func (c *Client) Enabled() bool { return c.sdk != nil }
func (c *Client) PublicConfig() map[string]any {
	if !c.Enabled() {
		return map[string]any{"enabled": false}
	}
	return map[string]any{"enabled": true, "key": c.sdk.Key, "cluster": c.sdk.Cluster}
}
func (c *Client) Publish(channel, event string, data any) error {
	if !c.Enabled() {
		return errors.New("pusher not configured")
	}
	return c.sdk.Trigger(channel, event, data)
}
func (c *Client) Authorize(socketID, channel string) ([]byte, error) {
	if !c.Enabled() {
		return nil, errors.New("pusher not configured")
	}
	return c.sdk.AuthorizePrivateChannel([]byte(url.Values{"socket_id": {socketID}, "channel_name": {channel}}.Encode()))
}
