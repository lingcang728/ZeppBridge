import type { DesignIconName } from '../../components/DesignIcon.vue';

type IconEntry = { icon: DesignIconName; title: string; copy: string };
type TaggedEntry = IconEntry & { tag: string };

/**
 * Shape of one language's landing-page copy.
 *
 * zh and en are inlined in LandingPage.vue so first paint never waits on a
 * fetch; the other eight locales ship as lazy packs (`./<locale>.ts` next to
 * this file) that must satisfy this same contract. The type is enforced at
 * compile time, so a pack that misses a key fails `npm run build`.
 */
export interface LandingCopy {
  nav: {
    home: string;
    site: string;
    features: string;
    local: string;
    connect: string;
    privacy: string;
    star: string;
    /** aria-label for the language dropdown trigger and listbox. */
    language: string;
  };
  downloads: {
    windows: { label: string; hint: string; msi: string };
    macos: { label: string; hint: string };
    linux: { label: string; previewBadge: string; note: string };
    status: { loading: string; ready: string; fallback: string };
  };
  hero: {
    headlineLead: string;
    headlineAccent: string;
    lead: string;
    starNudge: { title: string; copy: string; action: string; dismiss: string };
    trust: Array<{ icon: DesignIconName; label: string }>;
    stageLabel: string;
    coreCaption: string;
    outputs: [{ title: string; copy: string }, { title: string; copy: string }];
    status: { title: string; copy: string };
  };
  principlesLabel: string;
  principles: Array<{ icon: DesignIconName; title: string; copy: string }>;
  features: { overline: string; heading: string; lead: string; items: Array<IconEntry & { tone: string }> };
  local: { overline: string; heading: string; lead: string; items: TaggedEntry[] };
  connect: { overline: string; heading: string; lead: string; items: TaggedEntry[] };
  privacy: {
    overline: string;
    heading: string;
    lead: string;
    points: Array<{ icon: DesignIconName; label: string }>;
    vault: string;
  };
  footer: { tagline: string; disclaimer: string; download: string };
}
