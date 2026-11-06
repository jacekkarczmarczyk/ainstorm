---
description: Set your focus in this project's ainstorm map (a task id), or clear it with "none"
argument-hint: "<task id> | none"
---

Set the user's focus in the ainstorm map of this project: $ARGUMENTS

Call project_set_focus with that task id (or null for "none"). If the id does not exist in the project, say so and
offer close matches from task_search. Confirm in one line; do not change anything else.
