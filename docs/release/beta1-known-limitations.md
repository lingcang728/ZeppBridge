# Beta1 Known Limitations

- Official webhook delivery is unsigned; Beta use must remain controlled, rate-limited, bound to an installation, and retain unsigned provenance.
- The repository has no real official payload fixture or confirmed production entitlement for every documented data type. Official capabilities are therefore represented as explicit unknown/not-provided states until verified.
- Backfill returns asynchronous acceptance without a completion signal; accepted or partially delivered data is never described as a complete local copy.
- Official HRV `lastNightAvg` is kept semantically separate from legacy SDNN/RMSSD. `hybridCharge` is not used as Charge, and sparse pulse oximetry is not converted into ODI.
- A public stable release requires a separately configured updater signing key and external service credentials; this Beta artifact is not evidence of a completed official cloud deployment.
