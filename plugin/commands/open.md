---
description: Open the ainstorm task map in the browser (one-time link)
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/open.ts" "${CLAUDE_SESSION_ID}"`

If the output above is a link: show it to the user as a clickable link and say it works once, within a minute. Do nothing else.

If it says NOT A PROJECT YET: this folder is not in the ainstorm map. Ask the user, in the conversation language, whether to
register it as a project with the suggested key and name; they may change either, in their own words (a key is 1–10
capital letters or digits starting with a letter). Do not create anything until they agree. Once they do, call
`project_create` with the key, the name and the path shown, then show the `openUrl` from its result as a clickable link
(it opens this session and works once, within a minute). If they decline, do nothing.
