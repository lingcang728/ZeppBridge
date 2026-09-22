# Beta1 Known Limitations

- Official webhook delivery is unsigned; Beta use must remain controlled, rate-limited, bound to an installation, and retain unsigned provenance.
- The repository has no real official payload fixture or confirmed production entitlement for every documented data type. Official capabilities are therefore represented as explicit unknown/not-provided states until verified.
- Backfill returns asynchronous acceptance without a completion signal; accepted or partially delivered data is never described as a complete local copy.
- Official HRV `lastNightAvg` is kept semantically separate from legacy SDNN/RMSSD. `hybridCharge` is not used as Charge, and sparse pulse oximetry is not converted into ODI.
- A public stable release requires a separately configured updater signing key and external service credentials; this Beta artifact is not evidence of a completed official cloud deployment.
- Migration v31 reserves `provider`/`account_id` columns and the official dual-source tables, but the unique indexes on `metric_samples`/`daily_metrics` do not include `provider` yet; official writes must not reuse legacy unique keys until a follow-up index-rebuild migration lands.
- The v3 beta disables self-update entirely (`self_update_supported()` returns `false`) so it can never install a 2.x release or launch the hard-coded 2.x path; relocation of 2.x `%APPDATA%` legacy data is likewise skipped on the 3.x line.
