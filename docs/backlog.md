# Backlog

Requests recorded for later, in the order they came in.

## GitHub issues

- A project can have a GitHub repository URL.
- `#1234` in task text and the task's Issue field link to that issue in the repository.
- Actions on a task update its issue: create it, edit the title and body, close it when the task is done, add labels, etc.
- Only when Claude has the permission and a suitable token. The daemon stays offline (no outbound traffic, see
  docs/security.md): the issue changes are done by Claude in the session (e.g. with `gh`), under its own permissions;
  the map stores the repository and the issue number and shows the link.
