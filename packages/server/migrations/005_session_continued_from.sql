-- The session a session continues (/ainstorm:continue): it took over its open tasks, and the old one was archived
ALTER TABLE sessions ADD COLUMN continued_from TEXT;
