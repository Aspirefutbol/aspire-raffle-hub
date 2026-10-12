# Dependency security review

Reviewed on October 12, 2026. This review covers the targeted patch from
`next@16.3.6` and `eslint-config-next@16.3.6` to `16.3.8`.

## Approved patch

Both direct packages remain pinned to exact patch versions. Their related Next
environment, compiler, and ESLint-plugin packages follow the same patch.

After the patch:

- `npm audit --omit=dev --json` exits successfully with **zero vulnerabilities**.
- `npm audit --json` exits with status 1 and reports **five high-severity affected
  package entries**, all from one development-tooling advisory.

An audit result describes the installed dependency graph. It is not a guarantee
that all application security risks have been addressed.

## Accepted and monitored development-tooling risk

The user approved retaining the current transitive `braces@3.0.3` advisory until
upstream supplies a patched dependency path.

| Package | Relationship | Use | Finding |
| --- | --- | --- | --- |
| `eslint-config-next@16.3.8` | Direct | Development/lint | Inherits the braces advisory |
| `@next/eslint-plugin-next@16.3.8` | Transitive | Development/lint | Inherits the braces advisory |
| `fast-glob@3.3.1` | Transitive | Development/lint | Inherits the braces advisory |
| `micromatch@4.0.8` | Transitive | Development/lint | Inherits the braces advisory |
| `braces@3.0.3` | Transitive | Development/lint | High-severity stack exhaustion |

Dependency path:

`eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces`

[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
describes process-stack exhaustion from deeply nested, attacker-controlled brace
patterns. The official advisory and npm metadata did not identify a patched
braces release or a compatible patched chain at review time. These five affected
package entries do not represent five independent vulnerabilities.

The reviewed path is ESLint tooling. The application does not import it or pass
HTTP/CSV input into it. Current ESLint configuration also does not supply
`settings.next.rootDir` glob patterns to the affected plugin path. This limits
the observed exposure; it does not lower the advisory's severity or prove that
every future configuration will be safe.

No dependency overrides, forced resolutions, major downgrades, or
`npm audit fix --force` were used to suppress the finding.

## Monitoring and reassessment

Re-run the full and production-only audits when updating Next, its ESLint
configuration, or this dependency chain. Reassess reachability if lint root/glob
configuration changes or untrusted patterns are introduced.

When upstream publishes a compatible patched path, apply a targeted update and
run lint, typecheck, unit tests, build, database tests, and existing E2E tests.
Update this document with the resolved versions and remove the accepted-risk
entry only after the installed graph is verified.

## Regression validation

The approved patch passed the following checks on October 12, 2026:

| Check | Result |
| --- | --- |
| Lint | Passed |
| Typecheck | Passed |
| Unit tests | 69 passed across 12 files; zero skipped |
| Production build | Passed with Next 16.3.8 |
| Fresh local database reset | All 11 existing migrations applied |
| Database / pgTAP tests | 197 assertions passed across 3 files |
| Existing E2E tests | 19 passed; zero skipped, failed, or flaky |
| Database type generation | Generated output exactly matches the tracked file |
| Audit checkpoints | All chains verified before and after E2E; continuity passed |

The E2E run used the real local Mailpit invitation flow and included the existing
desktop and 360px mobile checks. Phase 0 remains green. Application source,
role grants, permissions, RLS policies, and migrations were unchanged.
