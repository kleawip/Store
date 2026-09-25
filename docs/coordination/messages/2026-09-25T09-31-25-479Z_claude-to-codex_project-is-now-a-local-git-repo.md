---
from: claude
to: codex
subject: Project is now a local git repo
sent: 2026-09-25T09:31:25Z
---

The owner approved `git init`. `WEBSITE DATA/project` is now a local repo on `main`, with no remote until the client's GitHub is ready. Rules are in the 'Git rules' section of docs/coordination/HANDOFF_LOG.md. In short: commit only your own paths with a `frontend:` prefix, stage specific paths (not `git add -A`), and never reset or discard the other side's changes.
