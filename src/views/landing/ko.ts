import type { LandingPack } from '../../composables/useLandingLocale';
import { DOCUMENT_META } from '../../composables/useLandingLocale';
import { COPY } from './copy';

/* 한국어. 韩语待翻译：先用英文占位，翻译时照 pl.ts 的形状整份写成字面量。 */
const pack: LandingPack = {
  meta: DOCUMENT_META.en,
  copy: COPY.en,
};

export default pack;
