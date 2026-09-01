# Official Amazfit device catalog

`src/assets/devices/catalog.json` is a maintenance-time snapshot; the model
list was checked on 2026-08-15 and `device_source_codes` was added on
2026-09-01. It contains 52 total entries, of which 51 are `active`/`supported`,
covering 50 canonical model keys. The 48-card baseline is the supplied official
Amazfit Japan store capture set (`design_picture/Product`, 12 rows × 4 cards);
the duplicate GTR 4 black colour card shares the canonical GTR 4 material and
is not counted as a second model. Three active official extras (Helio Strap Pro,
Helio Core, and Helio Ring) bring the canonical count above 48. Helio Armband
remains listed for provenance as `status=accessory` and `supported=false`, so it
is not counted as a connectable device.

The card-by-card mapping is kept in
[`device-catalog-audit.json`](./device-catalog-audit.json) and
[`device-catalog-audit.csv`](./device-catalog-audit.csv). Each record preserves
the source row/column, display name, size/colour variant, merge relation,
catalog ID, canonical model key, and material source.

## Matching contract

1. A `deviceSource` number is matched first against `device_source_codes`.
   Some accounts return a device list with no product-name field at all
   (issue #4), and these integers are then the only model-class fact in the
   payload.
2. A stable model code is matched next (known examples are `A2322`/`A2323`
   for T-Rex 3 and `A2321` for Helio Ring).
3. `productName`/`deviceName` is matched against an exact normalized alias.
4. A complete multi-word or numbered alias may occur in a display nickname
   (for example, `我的 T-Rex 3`).
5. Generic fuzzy matching is never used. A value that does not pass one of
   these checks remains `unknown`.

### How `device_source_codes` is populated

Huami publishes no lookup table for these integers, so every entry comes from
users assigning a model by hand in the app and opting in to share it. The
assignments are aggregated in the feedback database; see
[feedback triage](./feedback-triage.md) for the tooling.

Admission rules, enforced by `DEVICE_SOURCE_CODES` in
[`scripts/assets/build-device-catalog.py`](../../scripts/assets/build-device-catalog.py)
and asserted by the `device_catalog` unit tests:

* **`deviceSource` only — never `deviceType`.** `deviceType` is a family code:
  in the feedback data, `deviceType:0` alone spans twenty different models.
* **High band only (>= 1,000,000).** The low band is self-contradictory in the
  same data: `deviceSource:102` was assigned to four different models by four
  different people.
* **At least two independent reports per number.**
* **Conflicts are adjudicated by hand, never by majority vote.** Two were
  accepted (`9568513` -> Balance 2, `10289411` -> Helio Strap): their
  neighbouring numbers are unanimous for the same product, and every
  dissenting report also assigned a second watch, i.e. the reporter picked the
  wrong device in the picker. One was rejected (`10813699`, Active MAX 2 vs
  Active 2 44mm 2) — a tie is not evidence.

Several adjacent numbers mapping to one product is normal: the low bits encode
the colour/size variant.

The original account nickname remains in `name`/`display_name`; the catalog
adds `canonical_name`, `display_name`, `name_zh`, and `catalog_id`. `user_fused`
and unknown source records never claim ownership by a physical device.

## Local art and provenance

Every active/supported entry resolves to a local RGBA WebP and RGBA PNG
thumbnail under [`src/assets/devices/`](../../src/assets/devices/). The image
hash in `catalog.json` is the SHA-256 of the bundled WebP, so the offline gate
can detect drift. `src/lib/deviceCatalog.ts` discovers the files with
`import.meta.glob`; adding a new pair does not require a hand-written import.

Most of the 48 baseline assets are `screenshot-derived`: the product-only
component was cropped from the official Japan store capture, then store text,
prices, award badges, UI controls, and white background were removed. The four
extra entries use public official Amazfit US Shopify CDN images. No image is
hot-linked at runtime.

The official pages do not grant a separate redistribution licence in this
repository. These files are bundled as local/internal product-reference art at
the user's request. Before a public release, confirm Amazfit trademark and
image-redistribution terms, replace screenshot-derived art with licensed
press assets where required, and retain the provenance/hash audit.

## Image QA

All 51 local WebP/thumbnail asset pairs (50 canonical connectable model keys
plus the unsupported Helio Armband provenance key; the duplicate GTR 4 colour
entry shares one key) were rebuilt from the original `design_picture/Product`
captures and the recorded official CDN sources; no damaged bundled WebP was
used as an input. Pillow and OpenCV GrabCut provide a
conservative foreground seed from dark/coloured product pixels, with explicit
source crops for the multi-product Helio Core/Armband frames. The Helio Ring
centre and the GTS 4 Mini strap opening are intentional transparent holes. A
binary transparent mask is padded before trim, RGB is zeroed wherever alpha is
zero, and lossless WebP is written with `exact=True` to prevent decoder colour
bleed. The Strap Pro receives edge-only white decontamination that preserves
its pale metal hardware.

The offline verifier checks the exact 52-entry/51-supported/50-canonical/51-asset
counts, one-to-one WebP and thumbnail key sets, RGBA mode, dimensions, SHA-256
catalog hashes, transparent corners/border, at least 8 px transparent padding,
edge-connected neutral background residual, tiny saturated-noise components,
and unreasonable enclosed holes (while allowing intentional strap/ring/band
openings and the GTS 4 Mini strap opening). The 12 required manual spot checks
all pass:
`balance-3`, `active-2-square`, `t-rex-ultra-2`, `band-7`, `helio-strap`,
`helio-ring`, `helio-strap-pro`, `cheetah-2-pro`, `bip-6`, `gtr-4-46mm`,
`gts-4-mini`, and `amazfit-up`.

## Rebuild and verify

Pillow/OpenCV are the only image dependencies used by the maintenance script;
the repository does not install a second copy of either tool.

```powershell
py -3 scripts/assets/build-device-catalog.py
py -3 scripts/assets/verify-device-assets.py
```

Use `--refresh-official` only when deliberately refreshing the four official
CDN extras. The verifier checks the exact catalog/asset counts, card audit
coverage, unique IDs/aliases/model codes, RGBA transparency, dimensions, local
WebP/thumbnail one-to-one references, and catalog SHA-256 hashes.
