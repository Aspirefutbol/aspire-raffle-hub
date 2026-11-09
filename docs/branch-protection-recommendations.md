# Branch protection recommendations

Agent: Claude (implementation lane). **Recommendation only.** Nothing here has been applied. Changing repository security settings needs explicit director approval.

**State on 2026-11-09:** `main`, `feat/phase-1-fundraising-slice` and `feat/calendar-fundraiser-aspire-south` all report `protected: false`, and the repository has no rulesets. Any account with write access, including agents acting through the director's account, can push, force-push or delete these branches.

## The constraint that shapes this

Claude and Codex currently act through the director's `Aspirefutbol` account, which is an administrator. That has three consequences:

- **Required approvals would block every merge.** GitHub does not let a PR's author approve it, and every PR is authored by `Aspirefutbol`.
- **A bypass list cannot tell people from agents.** Exempting `Aspirefutbol` would exempt the agents too.
- So the protection worth having today is the kind that stops *mistakes* (force-push, deletion, unreviewed direct push, merging red CI). Stopping *unauthorized actors* needs separate agent accounts first (phase 2).

## Phase 1: apply now, after approval (works with one account)

One ruleset, "Protected application branches", targeting `main`, `feat/phase-1-fundraising-slice` and `feat/calendar-fundraiser-aspire-south`. Enforcement: Active. Bypass list: **empty** (applies to admins too).

| Rule | Setting | Why |
|---|---|---|
| Restrict deletions | on | No branch can be deleted by accident |
| Block force pushes | on | History and tested SHAs cannot be rewritten |
| Require a pull request before merging | on; required approvals **0** | No direct pushes; every change is visible as a PR. 0 approvals because self-approval is impossible today. |
| Require status checks to pass | on: `Lint, types, unit tests, build` and `Database (migrations, pgTAP, types) + E2E` | Nothing merges with red or missing CI |
| Require branches to be up to date before merging | on | The merged tree equals the tree CI tested (see below) |
| Require conversation resolution | on | Open review findings block the merge |
| Allowed merge methods | merge commit only | Keeps the original commit SHAs in history |

### What this changes about integration

- **Exact-SHA fast-forwards stop working.** Batch 1 was integrated by pushing the tested commit directly. With "require a pull request", that push is refused.
- Integration then happens through the PR's merge button with **merge commit**. The new merge commit has a new SHA, but with "up to date" enforced, **its tree is exactly the tree PR CI tested**. Evidence becomes "merge tree = tested tree", which the handoff protocol already records. The original commits stay in history unchanged.
- Squash and rebase merges create new SHAs for the work itself, which is why they are excluded.
- **Merging is still a deployment.** The rules don't change which workflows a push starts (see "Merges and pushes that deploy" in `AGENTS.md`).

### Per-branch notes

- **`main`.** `staging.yml` runs on push. Consider adding "Require deployments to succeed" only after staging secrets and the staging workflow are confirmed. Today that workflow fails at its configuration check, so the rule would block every merge.
- **`feat/phase-1-fundraising-slice`.** `hosted-qa.yml` migrates the hosted staging database and deploys the staging site on every push. This branch benefits most from "no direct pushes".
- **`feat/calendar-fundraiser-aspire-south`.** It is PR #19's head. Protecting it does not affect #19's own CI. Integrations (such as Batch 1) move to merging an isolated child PR with a merge commit, as above.

## Phase 2: after agents have their own accounts (director decision)

1. Create machine accounts, for example `aspire-claude-bot` and `aspire-codex-bot`, with **Write** (not Admin) access and fine-grained tokens limited to this repository. Remove the agents' use of the director's credentials.
2. Raise required approvals to **1**, and add a code-owner rule (`.github/CODEOWNERS`) naming the director for all files, so only the director's approval counts.
3. Add the director (and only the director) to the ruleset bypass list if emergency fixes need it. Every bypass is logged.
4. GitHub authorship then distinguishes the director from the agents. The `Agent:` attribution lines and two-step `DIRECTOR APPROVAL:` confirmation in `AGENTS.md` become a second check instead of the only one.

## Related settings to review (not changed)

- Actions → "Allow GitHub Actions to create and approve pull requests": keep **off**.
- Environments → `staging`: add the director as a required reviewer, so every deploying workflow (`staging.yml`, `hosted-qa.yml`, `aspire-south-synthetic-preview.yml`) waits for explicit approval at run time. This is the most direct way to separate "merge approved" from "deployment approved", and it works with today's single account.
- Default token permissions for workflows: read-only.
