---
name: stemsplitter
description: Launch or stop Stem Splitter, a free tool that splits a song into vocals, drums, bass and melody. Use when the user says /stemsplitter, "launch stem splitter", "start the stem splitter tool", "open stem splitter", or "stop stem splitter".
---

# Stem Splitter

## Launch it

Run `${CLAUDE_PLUGIN_ROOT}/start.command`.

The first time this runs on a machine it also quietly sets everything up (creates a Python
environment, installs dependencies, installs the web app's packages), which can take a few
minutes. Every run after that just launches straight away. It finishes by opening the tool at
http://localhost:3000 in the browser.

## Stop it

Run `${CLAUDE_PLUGIN_ROOT}/stop.command`.

## Notes

- If nothing responds on localhost:3000 when the user asks for the tool, just run
  `start.command` again, no need to debug first.
- Logs land in `/tmp/stem-engine.log` and `/tmp/stem-web.log` if something fails to come up.
- If `python3` or `npm` aren't installed, `start.command` says so and stops, rather than failing
  with a confusing error partway through.
