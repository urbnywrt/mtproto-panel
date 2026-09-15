import type { ProxyData } from '../api';

/**
 * Proxies created before WEB support have no `type` field, so absence means fake TLS.
 * Centralised so every view agrees rather than each re-deciding.
 */
export function isWebProxy(proxy: Pick<ProxyData, 'type'>): boolean {
  return proxy.type === 'web';
}

export type BadgeTheme = 'success' | 'warning' | 'danger' | 'info' | 'unknown';

export interface CertBadge {
  theme: BadgeTheme;
  text: string;
}

function daysUntil(iso: string): number {
  return Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

/**
 * Certificate state for a WEB proxy.
 *
 * A certificate that exists but failed to renew still serves traffic, so it is not an
 * error — but the operator needs to see that renewal is failing well before it expires.
 */
export function certBadge(proxy: Pick<ProxyData, 'certStatus' | 'certExpiresAt' | 'certLastError'>): CertBadge {
  if (proxy.certStatus === 'error') {
    return { theme: 'danger', text: 'ошибка' };
  }

  if (proxy.certStatus === 'active' && proxy.certExpiresAt) {
    const days = daysUntil(proxy.certExpiresAt);
    if (days < 0) return { theme: 'danger', text: 'истёк' };
    if (proxy.certLastError) return { theme: 'warning', text: `продление не удаётся, ${days} дн.` };
    if (days <= 7) return { theme: 'warning', text: `${days} дн.` };
    return { theme: 'success', text: `${days} дн.` };
  }

  if (proxy.certStatus === 'active') return { theme: 'success', text: 'выпущен' };
  return { theme: 'warning', text: 'выпускается' };
}

export interface TelemtBadge {
  theme: BadgeTheme;
  text: string;
  hint: string;
}

/**
 * Which telemt a proxy container runs. Updating the node rebuilds the image but leaves
 * running containers on the old binary, so an outdated one is flagged until recreated.
 * null for nodes too old to report it.
 */
export function telemtBadge(proxy: Pick<ProxyData, 'telemtVersion' | 'telemtOutdated' | 'status'>): TelemtBadge | null {
  if (proxy.telemtVersion === undefined) return null;
  if (proxy.status === 'error' && !proxy.telemtVersion) return null;
  if (proxy.telemtOutdated) {
    return {
      theme: 'warning',
      text: proxy.telemtVersion ? `${proxy.telemtVersion}, устарел` : 'старая версия',
      hint: 'Контейнер работает на прежней версии telemt. Пересоздайте контейнер, чтобы обновить.',
    };
  }
  return { theme: 'unknown', text: proxy.telemtVersion || 'неизвестно', hint: 'Версия telemt в контейнере прокси' };
}
