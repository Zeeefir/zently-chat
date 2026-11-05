CREATE TABLE calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    caller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    callee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_call_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'ringing'
        CHECK (status IN ('ringing','accepted','rejected','cancelled','ended','expired')),
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '60 seconds',
    CHECK (caller_id <> callee_id),
    UNIQUE (caller_id, client_call_id)
);
CREATE INDEX calls_caller_idx ON calls(caller_id, created_at DESC);
CREATE INDEX calls_callee_idx ON calls(callee_id, created_at DESC);

-- A user cannot be ringing/connected in two calls at once.
CREATE TABLE active_call_participants (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE
);
CREATE INDEX active_call_participants_call_idx ON active_call_participants(call_id);

CREATE TABLE call_signals (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_signal_id UUID NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('offer','answer','ice')),
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (sender_id, client_signal_id)
);
CREATE INDEX call_signals_inbox_idx ON call_signals(call_id, recipient_id, id);
