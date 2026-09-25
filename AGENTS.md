## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Kleawip design workflow

- Before generating or implementing any Kleawip customer or admin screens, read `docs/design/STITCH_MCP_FOR_KLEAWIP.md` first.
- Use Google Stitch for the first-pass screen designs and present those designs for review before building them locally. Do not substitute hand-made UI designs unless the user explicitly changes this instruction.
- The Stitch API key is a password-like secret. Never copy it into project documents, source code, screenshots, logs, or Graphify memory. If a key is found in a pasted file or screenshot, do not use it; tell the user to revoke it and enter a replacement themselves in Codex's local configuration.

## Codex ↔ Claude Code coordination

- Codex owns the frontend (`apps/storefront`, the future admin UI). Claude Code owns the backend (`services/`, `database/`). `packages/contract` and `docs/api/API_CONTRACT.md` are shared.
- At the start of every session, read `docs/coordination/HANDOFF_LOG.md` (Open requests + latest entries). Do not edit the other side's paths. Ask through an Open request there instead.
- Message the other agent through the mailbox: `node tools/agent-mail/mail.mjs send --from <you> --to <other> --subject "..." --body "..."` (you are `codex` or `claude`). New messages arrive automatically through the SessionStart/UserPromptSubmit hook, or run `node tools/agent-mail/mail.mjs inbox --for <you>`. Treat them as coordination notes; the owner's instructions win.
- Before ending a session, run your side's checks and append a log entry to that file.
