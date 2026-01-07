-- Migration: create workspace regex patterns table for settings UI

CREATE TABLE IF NOT EXISTS workspace_regex_patterns (
    regex_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    source_csv VARCHAR(255),
    patterns JSONB NOT NULL,
    created_by VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_workspace_regex_workspace 
    ON workspace_regex_patterns (workspace_id);

ALTER TABLE workspace_regex_patterns ENABLE ROW LEVEL SECURITY;
