CREATE TABLE IF NOT EXISTS feedback_reports (
  id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL,
  app_version TEXT NOT NULL,
  operating_system TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  normalizer_revision TEXT NOT NULL,
  device_status TEXT NOT NULL,
  unknown_device_count INTEGER NOT NULL,
  device_evidence_json TEXT NOT NULL,
  unknown_workout_codes_json TEXT NOT NULL,
  workout_type_conflicts INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'resolved', 'ignored'))
);

CREATE INDEX IF NOT EXISTS idx_feedback_reports_received_at
  ON feedback_reports(received_at DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_reports_status
  ON feedback_reports(status, received_at DESC);
