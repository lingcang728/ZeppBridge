# Official Amazfit device catalog

[简体中文](device-catalog.zh-CN.md)

`src/assets/devices/catalog.json` is a maintenance-time snapshot; the model
list was checked on 2026-08-15 and `device_source_codes` was added on
2026-09-01 and switched to Zepp's official table on 2026-11-02. It contains 64 total entries, of which 63 are `active`/`supported`,
covering 61 canonical model keys. The 48-card baseline is the supplied official
Amazfit Japan store capture set (`design_picture/Product`, 12 rows × 4 cards);
the duplicate GTR 4 black colour card shares the canonical GTR 4 material and
is not counted as a second model. Three active official extras (Helio Strap Pro,
Helio Core, and Helio Ring) bring the canonical count above 48. Helio Armband
remains listed for provenance as `status=accessory` and `supported=false`, so it
is not counted as a connectable device.

Balance 2 XT, Mi Body Composition Scale 2 and the older models added in 3.1.1
(Amazfit Pop, Zepp E Circle / Square, Amazfit Neo, Bip S, Mi Smart Band 4 NFC and
others) are also selectable. Their product art is unavailable, so they use the
existing placeholder. Source numbers are maintained in `device_source_codes` in
the catalog (the ones from the official table are also listed in
`device_source_official`) and in `OFFICIAL_DEVICE_SOURCE_CODES` /
`CROWD_DEVICE_SOURCE_CODES` in `scripts/assets/build-device-catalog.py`.

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

**Zepp's official developer table is the source of truth**:
[docs.zepp.com › Reference › Device List](https://docs.zepp.com/docs/reference/related-resources/device-list/)
(the Chinese and English versions agree; `*` marks China-market models; checked
entry by entry on 2026-11-02). It also settles the numbers that crowd reports
never agreed on (`10813699` = Active Max, `11141376` = Balance 3, `7995649` =
GTS 4, `8454401` = Bip 5).

Before 3.1.1, numbers came from users assigning a model by hand in the app and
opting in to share it. That upload has been removed. The few numbers accepted
that way that the official table does not list (Helio Strap / Strap Pro / Ring,
Balance 2 XT, Balance 2's `10486017` and others) are **frozen**: kept, never
extended. Feedback reports now carry only the `deviceSource` numbers the catalog
cannot resolve, as a way to notice when the official table has moved on; see
[feedback triage](./feedback-triage.md) for the tooling.

Rules, enforced by
[`scripts/assets/build-device-catalog.py`](../../scripts/assets/build-device-catalog.py)
and asserted by the `device_catalog` unit tests:

* **Models are identified by `deviceSource` only — never `deviceType`.**
  `deviceType` is a family code (0 = watch/band, 1 = body composition scale,
  7 = earbuds): in the feedback data, `deviceType:0` alone spans twenty
  different models. It is used only for the family: a device whose model is
  unknown and whose `deviceType` is 1 is shown as a "Body composition scale"
  rather than an unidentified device.
* **Low numbers (< 1,000,000) only when the official table lists them.** Older
  watches really are low (`418` = T-Rex 2, `254` = Band 7). `15` and `101`–`104`
  are not in the table and stay unresolved — every `101`–`104` in the feedback
  data carries `deviceType:1`: users picked their scale's row as their watch.
* **One number, one model.** The script fails if the official table and the
  frozen crowd list ever claim the same number.

Several adjacent numbers mapping to one product is normal: the low bits encode
the colour/size/China-market variant.

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
py -3 scripts/assets/build-device-catalog.py --catalog-only
py -3 scripts/assets/verify-device-assets.py
```

For source-number changes alone, use `--catalog-only`. It updates the catalog
from `DEVICE_SOURCE_CODES` while retaining the existing art, hashes and provenance;
it requires only Python's standard library. Device-source matching runs when the
device list is refreshed, independently of the health-record normalizer revision.
Existing caches do not retain the source number, so they require that refresh.

The historical `design_picture/Product` captures are no longer retained locally.
A full image rebuild requires supplying the original captures named in the
script first; normal application builds use the checked-in images directly.

Use `--refresh-official` only when deliberately refreshing the four official
CDN extras. The verifier checks the exact catalog/asset counts, card audit
coverage, unique IDs/aliases/model codes, RGBA transparency, dimensions, local
WebP/thumbnail one-to-one references, and catalog SHA-256 hashes.
