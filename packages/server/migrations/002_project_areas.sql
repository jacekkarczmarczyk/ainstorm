-- Areas registered for a project with the area_create tool. Areas already used by tasks need no row:
-- they count as known to the project anyway.
CREATE TABLE project_areas (
  project_key  TEXT NOT NULL REFERENCES projects(key) ON DELETE CASCADE,
  area         TEXT NOT NULL,
  PRIMARY KEY (project_key, area)
);
