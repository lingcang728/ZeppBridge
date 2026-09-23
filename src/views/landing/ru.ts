import type { LandingPack } from '../../composables/useLandingLocale';

/**
 * Русский (ru) landing pack.
 *
 * Polite «вы» register, « » quotation marks — matching the app's Russian pack.
 * Product terms (ZeppBridge, HAR, appToken, MCP, SQLite, EXE/MSI, Apple Silicon,
 * AI-ready) stay untranslated. Decorative overlines stay in English, matching
 * zh/en.
 */
const pack: LandingPack = {
  copy: {
    nav: {
      home: 'Главная страница ZeppBridge',
      site: 'Навигация по сайту',
      features: 'Что он читает',
      local: 'Локальные выходы',
      connect: 'Подключение',
      privacy: 'Приватность',
      star: 'Звезда на GitHub',
      language: 'Язык',
    },
    downloads: {
      windows: { label: 'Скачать для Windows', hint: 'Рекомендуется · установщик EXE x64', msi: 'Для управляемого развёртывания: скачать MSI' },
      macos: { label: 'Скачать для macOS', hint: 'Apple Silicon · установщик DMG' },
      linux: {
        label: 'Linux',
        previewBadge: 'Превью',
        note: 'Пакеты deb / rpm / AppImage / Flatpak собираются в CI, но пока никто до конца не прошёл вход и связку ключей (Secret Service / KWallet) на настоящем Linux-десктопе. Попробуйте, если хочется — и откройте issue, когда что-то сломается. Именно этого он сейчас и ждёт.',
      },
      status: {
        loading: 'Запрашиваем свежий релиз на GitHub…',
        ready: 'Скачивается напрямую — без страницы GitHub',
        fallback: 'Прямые ссылки временно недоступны; откроется страница релиза',
      },
    },
    hero: {
      headlineLead: 'Ваши данные Zepp,',
      headlineAccent: 'возвращены целиком.',
      lead: 'ZeppBridge подключает, упорядочивает и визуализирует данные вашего wearable Amazfit на вашем собственном компьютере с Windows, Mac или Linux. Каждое поле хранит свой источник — читайте сами или передавайте ИИ на ваших условиях.',
      starNudge: {
        title: 'Загрузка началась',
        copy: 'Если ZeppBridge заслужил место на вашем компьютере, звезда на GitHub поможет большему числу пользователей Amazfit его найти.',
        action: 'Поставить звезду на GitHub',
        dismiss: 'Может, позже',
      },
      trust: [
        { icon: 'secure', label: 'Сначала локально' },
        { icon: 'private', label: 'Приватно по умолчанию' },
        { icon: 'structured-data', label: 'Структурированные данные' },
      ],
      stageLabel: 'Актуальные устройства Amazfit передают данные в ZeppBridge и выходят структурированными',
      coreCaption: 'Декодирование · Порядок · Визуализация',
      outputs: [
        { title: 'Структурированные записи', copy: 'Источник и метки времени сохранены' },
        { title: 'AI-ready', copy: 'Данные уходят, только когда вы скажете' },
      ],
      status: { title: 'Локальный конвейер готов', copy: 'Ничего не проходит через сервер ZeppBridge' },
    },
    principlesLabel: 'Принципы продукта',
    principles: [
      { icon: 'secure', title: 'Безопасно', copy: 'Остаётся на вашем компьютере' },
      { icon: 'private', title: 'Приватно', copy: 'Ничего не отправляется и не утекает' },
      { icon: 'database', title: 'Происхождение', copy: 'Источники никогда не смешиваются' },
      { icon: 'ai-ready', title: 'AI-ready', copy: 'Ясная структура, по запросу' },
    ],
    features: {
      overline: 'WHAT YOU CAN READ',
      heading: 'От сегодняшних цифр до каждой тренировки.',
      lead: 'Интерфейс показывает только поля, которые действительно пришли. Отсутствующее помечается как отсутствующее — никаких выдуманных чисел ради заполнения панели.',
      items: [
        { icon: 'heart-rate', title: 'Непрерывный пульс', copy: 'Метки времени и источник сохранены: вы видите настоящую кривую.', tone: 'red' },
        { icon: 'sleep-waves', title: 'Структура сна', copy: 'Фазы глубокого, лёгкого, REM-сна и бодрствования, разобраны локально.', tone: 'purple' },
        { icon: 'outdoor-run', title: 'Детали тренировки', copy: 'Маршрут, темп, каденс, высота и тренировочная нагрузка.', tone: 'green' },
        { icon: 'vo2-max', title: 'Метрики восстановления', copy: 'VO₂ Max, HRV и показатели восстановления — по каждому источнику.', tone: 'blue' },
      ],
    },
    local: {
      overline: 'NOT ONLY A WINDOW',
      heading: 'Его даже не нужно открывать.',
      lead: 'Десктопное приложение, командная строка, MCP и локальный read-only API делят одно ядро — единицы, часовые пояса, источники и отсутствующие значения говорят одно и то же. Отсутствует — значит отсутствует: ни один выход не заполнит дыру нулём.',
      items: [
        {
          icon: 'structured-data',
          title: 'Полная история и снапшоты',
          copy: 'Возвращайте облачную историю месяц за месяцем, с учётом по каждому куску. Снапшоты всей базы идут с контрольной суммой, а перед восстановлением видна разница в числе строк.',
          tag: 'Локально',
        },
        {
          icon: 'document',
          title: 'Командная строка',
          copy: 'status / sync / export. Без вопросов, стабильные коды выхода — спокойно вешайте на Планировщик задач или cron.',
          tag: 'CLI',
        },
        {
          icon: 'ai-ready',
          title: 'MCP только на чтение',
          copy: 'Пусть ИИ сам спрашивает ваши локальные данные. Транспорт stdio: ни открытого порта, ни доступа в сеть.',
          tag: 'MCP',
        },
      ],
    },
    connect: {
      overline: 'THREE PATHS, ONE LOCAL VAULT',
      heading: 'Выберите способ подключения, который вам подходит.',
      lead: 'От простого официального входа через веб до полностью проверяемой ручной передачи. Состояние подключения и причины ошибок всегда проговариваются явно.',
      items: [
        { icon: 'browser-login', title: 'Официальный вход через веб', copy: 'Авторизация внутри официального сценария. Учётные данные остаются на вашем компьютере.', tag: 'Рекомендуется' },
        { icon: 'document', title: 'Импорт HAR', copy: 'Для отладки и опытных: переиспользуйте уже захваченный авторизованный запрос.', tag: 'Продвинутый' },
        { icon: 'manual-entry', title: 'Ручной ввод', copy: 'Введите appToken и id пользователя сами, всё на виду.', tag: 'Под контролем' },
      ],
    },
    privacy: {
      overline: 'PRIVACY BY ARCHITECTURE',
      heading: 'Данные вашего wearable не должны становиться чужим облачным активом.',
      lead: 'Локальная база, замаскированные идентификаторы и изолированные источники — это умолчание. Когда нужен ИИ, вы сами выбираете, что уходит и куда приземляется.',
      points: [
        { icon: 'database', label: 'Локальное хранилище SQLite' },
        { icon: 'profile', label: 'ID аккаунта замаскированы по умолчанию' },
        { icon: 'cloud-output', label: 'Экспорт только по вашему действию' },
      ],
      vault: 'У ZeppBridge нет бэкенда, который передавал бы ваши данные о здоровье.',
    },
    footer: {
      tagline: 'Open-source мост для данных Amazfit · Windows и Mac (Apple Silicon)',
      disclaimer: 'Независимый неофициальный open-source проект, не связанный с Zepp Health, Huami или Amazfit и не одобренный ими. Только для аккаунтов и данных, к которым у вас есть право доступа.',
      download: 'Скачать',
    },
  },
  meta: {
    title: 'ZeppBridge · Локальный мост данных',
    description:
      'ZeppBridge — локальный open-source мост и просмотрщик для данных wearable Amazfit / Zepp. Работает на вашем собственном компьютере с Windows, Mac или Linux.',
    ogTitle: 'ZeppBridge · Ваши данные Zepp, возвращённые целиком',
    ogDescription:
      'Подключайте, упорядочивайте и визуализируйте данные wearable Amazfit на своём компьютере. Источники сохраняются, и ничего не уходит, пока вы не отправите.',
  },
};

export default pack;
