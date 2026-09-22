CREATE TABLE device_quota (
  hash TEXT NOT NULL CHECK (hash ~ '^[0-9a-f]{64}$'),
  day INTEGER NOT NULL CHECK (day >= 0),
  count INTEGER NOT NULL CHECK (count BETWEEN 0 AND 20),
  PRIMARY KEY (hash, day)
);
CREATE INDEX device_quota_day ON device_quota (day);
CREATE TABLE global_quota (
  day INTEGER PRIMARY KEY CHECK (day >= 0),
  count INTEGER NOT NULL CHECK (count BETWEEN 0 AND 20)
);
CREATE TABLE quota_control (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  until_ms BIGINT NOT NULL CHECK (until_ms >= 0)
);
INSERT INTO quota_control (id, until_ms) VALUES (1, 0);
