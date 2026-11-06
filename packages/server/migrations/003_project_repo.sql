-- GitHub repository of a project (https://github.com/<owner>/<repo>): #1234 in tasks links to its issues
ALTER TABLE projects ADD COLUMN repo_url TEXT;
