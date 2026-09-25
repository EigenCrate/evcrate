# OMP `/cmd-plan__hard` — All-project advisor history

Status: planning complete; implementation **not started**. [Full plan](./plan.md) · [source review](./reports/summary-review.md) · [proposed architecture](../../docs/system-architecture.md#proposed-cross-project-history-design-not-implemented).

Implementation roots: EVCrate `/home/loidinh/WS/evcrate/`; **DamHopper host `/home/loidinh/WS/dam-hopper-ws/feat-plugin-platform/`**. `Host modify` paths in phase files are relative to the latter. The older `/home/loidinh/WS/dam-hopper/` companion-plan path is not this task's host checkout.

| Phase | Status / progress | Link |
|---|---|---|
| 00 Production auth/dev compatibility | Pending / 0% | [phase-00](./phase-00-secure-auth-prerequisite.md) |
| 01 Contract freeze | Pending / 0% | [phase-01](./phase-01-cross-project-contract.md) |
| 02 Host grants/context | Pending / 0% | [phase-02](./phase-02-host-authorization-context.md) |
| 03 Worker scan/provider | Pending / 0% | [phase-03](./phase-03-worker-history-provider.md) |
| 04 Filter UI | Pending / 0% | [phase-04](./phase-04-project-filter-ui.md) |
| 05 Paired qualification | Pending / 0% | [phase-05](./phase-05-cross-repo-qualification.md) |

Dependencies: 00 → 01 → 02+03 → 04 → 05. Trusted installation binds the owner history root once; every authenticated account sees All Projects by default, without registering historical projects. Keep intentional dev tokens, guard missing production MongoDB; 230/21 is an observed count, not a constant.

## Unresolved questions

- No user decision pending. Implementation still needs owner-runner deployment and measured scan budgets before release.
