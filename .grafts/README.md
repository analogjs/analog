# .grafts

Each directory here is a **graft**: a local modification to an upstream package, described
for both humans and coding agents. See `<id>/graft.md` for why each one exists, which
invariants it guarantees, and where an agent should look when upstream changes.

- `graft status` — list grafts and anchor health
- `graft sync` — re-verify grafts against a new upstream version
