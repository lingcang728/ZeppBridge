import chatgptIcon from '../assets/ai/chatgpt.webp';
import claudeIcon from '../assets/ai/claude.png';
import geminiIcon from '../assets/ai/gemini.png';
import kimiIcon from '../assets/ai/kimi.png';
import doubaoIcon from '../assets/ai/doubao.png';
import deepseekIcon from '../assets/ai/deepseek.png';
import grokIcon from '../assets/ai/grok.png';

export type AiProviderId =
  | 'chatgpt'
  | 'claude'
  | 'gemini'
  | 'kimi'
  | 'doubao'
  | 'deepseek'
  | 'grok';

export interface AiProvider {
  readonly id: AiProviderId;
  readonly label: string;
  readonly url: string;
  readonly localIcon: string;
  readonly brandColor: string;
  readonly fallback: string;
}

/**
 * Fixed, reviewed destinations. URLs are intentionally not user-editable and
 * are also mirrored by the Tauri opener capability allow-list.
 */
export const AI_PROVIDERS: readonly AiProvider[] = [
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    url: 'https://chatgpt.com/',
    localIcon: chatgptIcon,
    brandColor: '#10a37f',
    fallback: 'G',
  },
  {
    id: 'claude',
    label: 'Claude',
    url: 'https://claude.ai/',
    localIcon: claudeIcon,
    brandColor: '#d97757',
    fallback: 'C',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    url: 'https://gemini.google.com/app',
    localIcon: geminiIcon,
    brandColor: '#4285f4',
    fallback: 'G',
  },
  {
    id: 'kimi',
    label: 'Kimi',
    url: 'https://www.kimi.com/',
    localIcon: kimiIcon,
    brandColor: '#377dff',
    fallback: 'K',
  },
  {
    id: 'doubao',
    // 品牌名不翻译，但英文界面上写它的官方英文名，不然读者连搜都搜不到。
    label: 'Doubao',
    url: 'https://www.doubao.com/chat/',
    localIcon: doubaoIcon,
    brandColor: '#1769ff',
    fallback: 'D',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    url: 'https://chat.deepseek.com/',
    localIcon: deepseekIcon,
    brandColor: '#4d6bfe',
    fallback: 'D',
  },
  {
    id: 'grok',
    label: 'Grok',
    url: 'https://grok.com/',
    localIcon: grokIcon,
    brandColor: '#111827',
    fallback: 'X',
  },
];

export const AI_PROVIDER_BY_ID: Readonly<Record<AiProviderId, AiProvider>> =
  Object.fromEntries(AI_PROVIDERS.map((provider) => [provider.id, provider])) as Record<AiProviderId, AiProvider>;

const AI_PROVIDER_URLS = new Set(AI_PROVIDERS.map((provider) => provider.url));

/** Defense-in-depth check before invoking the Tauri opener. */
export const isFixedAiProviderUrl = (url: string) => AI_PROVIDER_URLS.has(url);
