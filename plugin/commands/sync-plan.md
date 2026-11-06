---
description: Bring the plan file and the ainstorm map in line with each other
---

Synchronise the plan of this session's work with the ainstorm map, both ways.

1. Find the plan: the planPath of the task this session is running (task_get), or of its nearest ancestor with one.
   If there is none, ask the user which plan file to use and stop.
2. Read the plan. Its sections and steps are marked with task ids in square brackets, e.g. `[PRJ-24]`.
3. Compare with task_tree of the running task's branch:
   - a step without a marker: propose a task for it (title in the conversation language) and its marker;
   - a marker of a task that does not exist or is deleted: report it;
   - a task without a marker in the plan: propose where to add it;
   - a step the plan shows as done while the task is open, or the other way round: report the difference.
4. Show the user the proposed changes as one list, then apply only what they accept: create or update tasks with the
   ainstorm tools and edit the plan file (if you may edit it). Never mark a task done without verifying it.
