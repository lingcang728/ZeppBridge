# Contributing translations

The interface ships in ten languages: 中文, English, Español, Nederlands,
Português (Brasil), Português, Deutsch, Русский, हिन्दी and Français.
This page explains where each language lives and how to contribute fixes or
improvements.

[简体中文](translations.zh-CN.md)

## How the language layer works

- The app uses a small in-house i18n layer (`src/i18n/index.ts`), not
  vue-i18n. Strings are defined next to the module that uses them via
  `defineMessages(zh, en, es?, moduleId?)`.
- `zh` and `en` are the inline pair: `zh` defines the shape, `en` must be
  complete (the TypeScript compiler enforces this), `es` may be partial and
  falls back to English.
- The other seven languages ship as lazy packs in `src/i18n/locales/`:
  `de.ts`, `fr.ts`, `hi-IN.ts`, `nl.ts`, `pt-BR.ts`, `pt-PT.ts`, `ru.ts`.
  A pack only loads when the user picks that language. Each pack has a
  `modules` section keyed by moduleId (the file path under `src/` without
  extension or `.i18n` suffix), plus `errors` (backend `err.*` codes) and
  `backendText` (`ui.*` codes) sections.
- Missing keys in a pack fall back to English automatically — a partial
  contribution is still useful.
- The landing page (this site) keeps its own locale switch and lazy copy
  files under `src/views/landing/` — it is deliberately separate from the
  app packs.

## The gate: `npm run i18n:check`

`scripts/release/check-i18n.mjs` audits the packs on every PR:

- Every key in a pack must exist in the module's `zh` source — stale keys
  from an older app version are rejected.
- Keys present in `zh` but missing from a pack must be listed in that
  locale's `<locale>.pending.txt`; regenerate the lists with
  `node scripts/release/check-i18n.mjs --write-pending`.
- A leaf identical to English is rejected unless it is listed in
  `src/i18n/locales/allowlist-en.txt` (brand names, units like `bpm`, and
  other strings that legitimately stay in English).
- Function leaves must take the same number of parameters as the `zh`
  source. Use the pack's `plural()` helper for count-dependent wording —
  never hard-code a plural that breaks on `1`.

## Style conventions per language

Consistency matters more than any single wording choice. Before editing a
pack, skim its existing entries and match them:

| Locale | Register and conventions |
|---|---|
| `de` | informal `du`, `ß` orthography (de-DE, not Swiss `ss`) |
| `fr` | `vous`, « » quotes, space before `:` |
| `nl` | informal `je`/`jouw` |
| `pt-BR` | `você`, gerunds, Brazilian vocabulary |
| `pt-PT` | `tu` imperatives, European vocabulary (ecrã, ficheiro, registos) |
| `ru` | polite `вы`, « » quotes, three-bucket plurals |
| `hi-IN` | polite `आप`, Devanagari prose with Latin technical terms |

Keep placeholders (`${value}`), HTML tags and markdown intact and in the
same positions. Don't translate brand or product names (ZeppBridge, Zepp,
Amazfit), units (`bpm`, `kg`), or code identifiers.

## Ways to help

- **Fix a wording**: edit the leaf in `src/i18n/locales/<locale>.ts` and
  open a PR. Small, focused PRs are easiest to review.
- **Fill pending keys**: everything still missing is listed in
  `<locale>.pending.txt`; remove each line as you translate it.
- **Proofread**: native-speaker review is welcome at any scale — comment
  on the strings directly in a PR or an issue.
- **Propose a new language**: open an issue first. A new locale needs the
  full pack, a landing copy file, and README/docs consideration, so it is
  worth discussing scope before writing.
