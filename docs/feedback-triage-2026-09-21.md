# Feedback follow-up — 2026-09-21

Scope: the four D1 reports supplied by the maintainer. The excerpts contain no
raw sleep response or per-request HTTP error, so reporter-specific resolution
cannot be inferred from local regression tests. No D1 rows are marked resolved.

| D1 report | Change and remaining evidence |
| --- | --- |
| `05f2580d-7989-46eb-94a1-3cb9f140e318` | Prefer actual top-level/nested device IDs and MACs over the legacy source-only identity fallback. This prevents a model source number hiding the nested ID or collapsing two devices with the same source. Keep `102` and `8257793` unmapped; there is insufficient evidence to associate the latter with Cheetah Square or Active 2 Square. Refresh the device list and identify unknown entries; two independent reports remain required for a source mapping. |
| `7cbf9afe-2da5-4c0d-a747-0e4f93624247` | A failed sleep slice no longer discards successful slices or prevents later nights from being fetched. Persist successful results but mark the aggregate fetch/sync failed and history chunk partial, so retry remains possible. Authentication and cancellation still abort immediately. This repairs reproducible failure handling, not a confirmed Balance-specific endpoint fault. Retest the missing night; if it still fails, collect the sanitized sleep request error and date range. |
| `4092a9ee-292f-4c05-9160-853427ef30cc` | Empty/null outer metadata no longer masks nested product names and IDs. Existing Helio Core aliases can then match. Source `62` alone remains unknown; use the existing manual identification picker when no name is supplied. |
| `5bf0a448-dec6-40eb-816b-691097cda1f4` | Add Amazfit Pace and Pace aliases to the catalog and manual picker, with placeholder art. The model name is confirmed by [official Amazfit support](https://support.amazfit.com/it/amazfit_pace/user-guide). Source `400` remains unmapped. |

`DEVICE_SOURCE_CODES` is unchanged. `deviceType` is not promoted to a source
mapping, and no low-band or single-report numeric code is added.

Regression coverage checks nested IDs, empty outer names, distinct devices
sharing a source, name-only catalog matching, rejection of all four unconfirmed
codes, sleep success/failure/success windows, all-failed windows, abort behavior,
and persistence of partial results with failed sync status.

The maintainer also requested a Smart Scale art correction. The bundled cutout
and thumbnail now have transparent padding, with the edited provenance and
WebP hash recorded in the catalog. The asset pipeline can preserve an existing
alpha channel and creates padding even when the subject touches the input edge.
Two pixel-level regression tests cover both behaviors. Bundled image quality
checks pass; the full source-capture audit cannot complete in this checkout
because the original `design_picture/Product` store captures are absent.
