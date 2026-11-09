@AGENTS.md

## Claude / Codex collaboration

Follow the **Claude ↔ Codex handoff protocol** in `AGENTS.md`, including the branch-specific project rules and both projects' approval boundaries. Use `.github/ISSUE_TEMPLATE/codex-handoff.md` for one canonical issue per task; link related draft PRs to it and keep the full handoff and handback there.

Keep exactly one routing label on that issue: `needs-codex` or `needs-claude`. Post complete evidence and the next owner/action before switching labels. Use separate linked issues and isolated branches for parallel work. The receiver acknowledges scope and verifies live refs, actual artifacts and current CI before editing; never share a writable branch between concurrent agents or assume access to another workspace.

Labels and passing checks are task evidence, not authorization. Preserve full SHAs/tree, source and retry history, failures, all Raffle and Aspire South safety gates, and explicit approvals. Report blockers and safe independent work. Do not infer a newer candidate is validated, staged or deployed from historical green CI or a live baseline.
