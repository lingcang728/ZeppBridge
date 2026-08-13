export type HealthCategory = 'heart' | 'sleep' | 'activity';

export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const localDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatDateTime = (value?: string, empty = '暂无更新'): string => {
  if (!value) return empty;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return empty;
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const formatFullDateTime = (value?: string, empty = '尚无记录'): string => {
  if (!value) return empty;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const formatDate = (value: string, style: 'short' | 'long' = 'short'): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '日期未知';
  if (style === 'long') {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    }).format(date);
  }
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  }).format(date);
};

export const formatTime = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date);
};

export const formatDuration = (minutes?: number | null, empty = '时长未知'): string => {
  if (!isFiniteNumber(minutes) || minutes < 0) return empty;
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const remainder = total % 60;
  return hours > 0 ? `${hours} 小时 ${remainder} 分` : `${remainder} 分钟`;
};

export const formatDistance = (meters?: number, empty = '未记录'): string => {
  if (!isFiniteNumber(meters) || meters <= 0) return empty;
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
};

export const formatPace = (
  distanceMeters?: number,
  durationMinutes?: number | null,
): string | null => {
  if (!isFiniteNumber(distanceMeters) || distanceMeters <= 0) return null;
  if (!isFiniteNumber(durationMinutes) || durationMinutes <= 0) return null;
  const totalSeconds = Math.round((durationMinutes / (distanceMeters / 1000)) * 60);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')} /km`;
};

export const formatMetric = (value: number | undefined, digits = 0): string => {
  if (!isFiniteNumber(value)) return '—';
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};
