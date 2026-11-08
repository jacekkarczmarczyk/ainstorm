---
description: Continue an earlier ainstorm session here: take over its open tasks and archive it
argument-hint: "<session id or its first 8 characters>"
---

The user wants this session to continue the ainstorm session $ARGUMENTS.

1. Call `session_continue` with `from` set to that id, without `confirm`. If no id was given, ask the user for it (the
   map's session view has a button that copies this command with it). If the tool refuses, tell the user why and stop.
2. Show the user, in the conversation language, which session it is: its title, project, how many open tasks it has
   and the task it was working on. Ask them to confirm that this session takes it over (the old one is then archived).
   Do nothing more until they answer.
3. Only after they agree: call `session_continue` again with the full session id from step 1 and `confirm: true`.
   Then call `context_get`, and say in two or three lines where the work stands. If it was working on a task, read it
   with `task_get` and go on with it; otherwise ask which open task to take up.
