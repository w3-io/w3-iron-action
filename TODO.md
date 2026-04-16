# TODO

## Sandbox limitations (blocked on Iron)

Three commands currently can't be exercised end-to-end because Iron's
sandbox doesn't support them. Revisit when Iron opens these up or we
move to a production-tier account.

- [ ] `get-exchange-rate` — sandbox returns a stub payload; live
      rates need a prod account.
- [ ] `create-customer` — sandbox customer creation is disabled;
      exists only on upgraded sandboxes.
- [ ] KYC / signing / bank / quote chain — all depend on a created
      customer. Unblock once `create-customer` works.

## Re-verify after re-run

- [ ] RESULTS.md says "YAML fixed, not yet run" (2026-04-15). Re-run
      the E2E with current credentials so the PASS/FAIL column in
      RESULTS.md reflects real output, not "not yet run."

## Docs

- [ ] Document which Iron tier is needed for the KYC + signing +
      bank chain to work. Today the skip reasons say "sandbox
      limitation" without specifying which tier unlocks what.
