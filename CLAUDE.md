@AGENTS.md

## Claude / Codex collaboration

Follow the **Claude ↔ Codex handoff protocol** in `AGENTS.md`, including the branch-specific project rules and both projects' approval boundaries. Use `.github/ISSUE_TEMPLATE/codex-handoff.md` for one canonical issue per task; link related draft PRs to it and keep the full handoff and handback there.

Keep exactly one routing label on that issue: `needs-codex`, `needs-claude` or `needs-director`. Post complete evidence and the next owner/action before switching labels. Use separate linked issues and isolated branches for parallel work. The receiver acknowledges scope and verifies live refs, actual artifacts and current CI before editing; never share a writable branch between concurrent agents or assume access to another workspace.

Start everything you write on GitHub with `Agent: Claude` and add an `Agent: Claude` trailer to every commit. Never write text that states or implies a director approval; act only on approvals the director recorded as `DIRECTOR APPROVAL:` on the canonical issue **and** confirmed to you in this session. Merging or pushing to `main`, `feat/phase-1-fundraising-slice` or `feat/calendar-fundraiser-aspire-south` starts deployment workflows; treat it as a deployment.

Labels and passing checks are task evidence, not authorization. Preserve full SHAs/tree, source and retry history, failures, all Raffle and Aspire South safety gates, and explicit approvals. Report blockers and safe independent work. Do not infer a newer candidate is validated, staged or deployed from historical green CI or a live baseline.
