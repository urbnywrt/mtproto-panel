import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Label, DropdownMenu } from '@gravity-ui/uikit';
import { pauseProxy, unpauseProxy, restartProxy, renewProxyCertificate, ProxyData } from '../api';
import { certBadge, isWebProxy } from '../utils/proxyType';
import { formatBytes } from '../utils/format';
import s from './ProxyCard.module.scss';

interface Props {
  proxy: ProxyData;
  nodeId: number;
  nodeName?: string;
  copied: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onCopyLink: () => void;
  onStatusChange?: () => void;
  /** Surfaces action failures in the parent page's alert. */
  onError?: (message: string) => void;
}

export default function ProxyCard({ proxy, nodeId, nodeName, copied, onEdit, onDelete, onCopyLink, onStatusChange, onError }: Props) {
  const navigate = useNavigate();
  const [togglingPause, setTogglingPause] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const isWeb = isWebProxy(proxy);
  const cert = certBadge(proxy);

  const statusTheme = proxy.status === 'running' ? 'success' : proxy.status === 'stopped' || proxy.status === 'paused' ? 'warning' : 'danger';
  const statusLabel = proxy.status === 'running' ? 'работает' : proxy.status === 'paused' ? 'пауза' : proxy.status === 'stopped' ? 'остановлен' : 'ошибка';

  const handleTogglePause = async () => {
    setTogglingPause(true);
    try {
      if (proxy.status === 'paused') {
        await unpauseProxy(nodeId, proxy.id);
      } else {
        await pauseProxy(nodeId, proxy.id);
      }
      onStatusChange?.();
    } catch (err: any) {
      onError?.(err?.message || 'Не удалось изменить состояние прокси');
    } finally {
      setTogglingPause(false);
    }
  };

  const handleRenewCert = async () => {
    setRenewing(true);
    try {
      await renewProxyCertificate(nodeId, proxy.id);
      onStatusChange?.();
    } catch (err: any) {
      onError?.(err?.message || 'Не удалось перевыпустить сертификат');
    } finally {
      setRenewing(false);
    }
  };

  const handleRestart = async () => {
    if (!confirm('Пересоздать контейнер прокси? Он будет недоступен около 20 секунд. Настройки, секрет и ссылка сохранятся.')) return;
    setRestarting(true);
    try {
      await restartProxy(nodeId, proxy.id);
      onStatusChange?.();
    } catch (err: any) {
      onError?.(err?.message || 'Не удалось пересоздать контейнер');
    } finally {
      setRestarting(false);
    }
  };

  const handleCardClick = () => {
    navigate(`/nodes/${nodeId}/proxy/${proxy.id}`);
  };

  const stopProp = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  const menuItems = [
    { text: 'Редактировать', action: () => onEdit() },
    ...(proxy.status === 'running' || proxy.status === 'paused'
      ? [{
          text: proxy.status === 'paused' ? 'Запустить' : 'Пауза',
          action: () => handleTogglePause(),
        }]
      : []),
    { text: restarting ? 'Пересоздаётся…' : 'Пересоздать контейнер', action: () => handleRestart() },
    ...(isWeb
      ? [{ text: renewing ? 'Выпускается…' : 'Перевыпустить сертификат', action: () => handleRenewCert() }]
      : []),
    { text: 'Удалить', action: () => onDelete(), theme: 'danger' as const },
  ];

  return (
    <Card type="action" view="outlined" className={s.card} onClick={handleCardClick}>
      <div className={s.header}>
        <span className={s.name}>{proxy.name || `Proxy ${proxy.id}`}</span>
        <Label theme={isWeb ? 'info' : 'unknown'} size="s">
          {isWeb ? 'WEB' : 'Fake TLS'}
        </Label>
        <Label theme={statusTheme} size="s">
          {statusLabel}
        </Label>
      </div>

      {proxy.note && (
        <div className={s.note}>{proxy.note}</div>
      )}

      {nodeName && (
        <div className={s.field}>
          <span className={s.label}>Нода</span>
          <span>{nodeName}</span>
        </div>
      )}
      <div className={s.field}>
        <span className={s.label}>Порт</span>
        <span>{isWeb ? 443 : proxy.listenPort || proxy.nginxPort || proxy.port}</span>
      </div>
      <div className={s.field}>
        <span className={s.label}>Домен</span>
        <span>{proxy.domain}</span>
      </div>
      {isWeb && (
        <div className={s.field}>
          <span className={s.label}>Сертификат</span>
          <span title={proxy.certLastError || undefined}>
            <Label theme={cert.theme} size="s">{cert.text}</Label>
          </span>
        </div>
      )}
      <div className={s.field}>
        <span className={s.label}>Трафик ↑</span>
        <span>{formatBytes(proxy.trafficUp || 0)}</span>
      </div>
      <div className={s.field}>
        <span className={s.label}>Трафик ↓</span>
        <span>{formatBytes(proxy.trafficDown || 0)}</span>
      </div>
      {proxy.connectedIps && proxy.connectedIps.length > 0 && (
        <div className={s.field}>
          <span className={s.label}>Подключения</span>
          <span>{proxy.connectedIps.length}</span>
        </div>
      )}

      <div className={s.actions}>
        <span onClick={(e) => e.stopPropagation()}>
          <DropdownMenu
            size="s"
            items={menuItems}
          />
        </span>
        <Button
          view="action"
          size="s"
          onClick={stopProp(onCopyLink)}
        >
          {copied ? '✓ Скопировано!' : 'Ссылка'}
        </Button>
      </div>
    </Card>
  );
}
