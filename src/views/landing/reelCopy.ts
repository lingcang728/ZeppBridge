import type { LandingLocale } from '../../composables/useLandingLocale';

export interface ReelCopy {
  preparing: string;
  failed: string;
  retry: string;
  replay: string;
  pause: string;
  play: string;
}

const COPY: Record<LandingLocale, ReelCopy> = {
  zh: {
    preparing: '正在准备演示',
    failed: '演示暂时未能继续',
    retry: '重试',
    replay: '重播',
    pause: '暂停',
    play: '播放',
  },
  en: {
    preparing: 'Preparing demo',
    failed: 'The demo could not continue',
    retry: 'Retry',
    replay: 'Replay',
    pause: 'Pause',
    play: 'Play',
  },
  es: {
    preparing: 'Preparando la demostración',
    failed: 'La demostración no pudo continuar',
    retry: 'Reintentar',
    replay: 'Repetir',
    pause: 'Pausar',
    play: 'Reproducir',
  },
  de: {
    preparing: 'Demo wird vorbereitet',
    failed: 'Die Demo konnte nicht fortgesetzt werden',
    retry: 'Wiederholen',
    replay: 'Erneut abspielen',
    pause: 'Pause',
    play: 'Abspielen',
  },
  fr: {
    preparing: 'Préparation de la démo',
    failed: 'La démo n’a pas pu continuer',
    retry: 'Réessayer',
    replay: 'Rejouer',
    pause: 'Pause',
    play: 'Lecture',
  },
  nl: {
    preparing: 'Demo voorbereiden',
    failed: 'De demo kon niet worden voortgezet',
    retry: 'Opnieuw proberen',
    replay: 'Opnieuw afspelen',
    pause: 'Pauzeren',
    play: 'Afspelen',
  },
  'pt-BR': {
    preparing: 'Preparando a demonstração',
    failed: 'Não foi possível continuar a demonstração',
    retry: 'Tentar novamente',
    replay: 'Repetir',
    pause: 'Pausar',
    play: 'Reproduzir',
  },
  'pt-PT': {
    preparing: 'A preparar a demonstração',
    failed: 'A demonstração não pôde continuar',
    retry: 'Tentar novamente',
    replay: 'Repetir',
    pause: 'Pausa',
    play: 'Reproduzir',
  },
  ru: {
    preparing: 'Подготовка демонстрации',
    failed: 'Демонстрацию не удалось продолжить',
    retry: 'Повторить',
    replay: 'Повторить воспроизведение',
    pause: 'Пауза',
    play: 'Воспроизвести',
  },
  'hi-IN': {
    preparing: 'डेमो तैयार किया जा रहा है',
    failed: 'डेमो आगे नहीं बढ़ सका',
    retry: 'पुनः प्रयास करें',
    replay: 'फिर से चलाएं',
    pause: 'रोकें',
    play: 'चलाएं',
  },
};

export const reelCopy = (locale: LandingLocale): ReelCopy => COPY[locale] ?? COPY.en;
