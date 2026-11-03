import { DOCUMENT_META, type LandingPack } from '../../composables/useLandingLocale';
import { COPY } from './copy';

/**
 * 落地页繁體中文语言包。繁体译文还没到（翻译.md 第三十四批）：先整页用简体，
 * 翻译到了就把 meta 和 copy 换成和 `de.ts` 一样的完整对象。
 */
const pack: LandingPack = {
  meta: DOCUMENT_META.zh,
  copy: COPY.zh,
};

export default pack;
