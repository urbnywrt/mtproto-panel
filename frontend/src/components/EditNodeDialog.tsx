import { useState, useEffect, FormEvent } from 'react';
import { Dialog, TextInput, Alert, HelpMark } from '@gravity-ui/uikit';
import { updateNode, NodeData } from '../api';

interface Props {
  open: boolean;
  onClose: () => void;
  node: NodeData | null;
  onUpdated: () => void;
}

export default function EditNodeDialog({ open, onClose, node, onUpdated }: Props) {
  const [name, setName] = useState('');
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('');
  const [domain, setDomain] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Refill whenever a different node is opened, so the form never shows stale values.
  useEffect(() => {
    if (!node) return;
    setName(node.name || '');
    setIp(node.ip);
    setPort(String(node.port));
    setDomain(node.domain || '');
    setToken('');
    setError('');
  }, [node, open]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!node) return;
    setError('');

    if (!ip.trim() || !port.trim()) {
      setError('IP и порт обязательны');
      return;
    }
    const parsedPort = parseInt(port, 10);
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      setError('Порт должен быть числом от 1 до 65535');
      return;
    }

    setLoading(true);
    try {
      await updateNode(node.id, {
        name,
        ip: ip.trim(),
        port: parsedPort,
        // Empty clears the domain — the column stores '' for "not set".
        domain: domain.trim(),
        // Left blank means "keep the current token": the panel never sends it back to
        // the browser, so there is nothing to prefill and blanking it must not wipe it.
        token: token.trim() || undefined,
      });
      onUpdated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} size="m">
      <Dialog.Header caption={node ? `Изменить ноду #${node.id}` : 'Изменить ноду'} />
      <Dialog.Body>
        <form onSubmit={handleSubmit} id="edit-node-form">
          {error && (
            <div style={{ marginBottom: 16 }}>
              <Alert theme="danger" message={error} />
            </div>
          )}
          <div className="dialog-field">
            <label>Название</label>
            <TextInput value={name} onUpdate={setName} placeholder="Мой сервер" size="l" />
          </div>
          <div className="dialog-field">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <label style={{ margin: 0 }}>IP адрес *</label>
              <HelpMark>Адрес, по которому панель ходит к ноде. Он же сверяется с A-записью домена при создании WEB-прокси.</HelpMark>
            </div>
            <TextInput value={ip} onUpdate={setIp} placeholder="123.45.67.89" size="l" />
          </div>
          <div className="dialog-field">
            <label>Порт *</label>
            <TextInput value={port} onUpdate={setPort} placeholder="8443" size="l" type="number" />
          </div>
          <div className="dialog-field">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <label style={{ margin: 0 }}>Домен</label>
              <HelpMark>Подставляется в ссылки fake TLS прокси вместо IP. Пусто — будет использоваться IP.</HelpMark>
            </div>
            <TextInput value={domain} onUpdate={setDomain} placeholder="proxy.example.com" size="l" />
          </div>
          <div className="dialog-field">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <label style={{ margin: 0 }}>Токен доступа</label>
              <HelpMark>Оставьте пустым, чтобы не менять. Заполните, только если токен на ноде был перевыпущен.</HelpMark>
            </div>
            <TextInput value={token} onUpdate={setToken} placeholder="не меняется" size="l" />
          </div>
          {node && ip.trim() !== node.ip && (
            <div style={{ marginBottom: 16 }}>
              <Alert
                theme="warning"
                message={
                  'WEB-прокси этой ноды придётся пересоздать: их public_addr записан в конфиг при создании и участвует во внутреннем маршруте релея. A-записи их доменов тоже нужно перенаправить.' +
                  (domain.trim()
                    ? ' Ссылки fake TLS прокси не изменятся — в них подставляется домен ноды, достаточно перенаправить его A-запись.'
                    : ' У ноды не задан домен, поэтому в ссылках fake TLS прокси стоит IP: после смены их придётся раздать заново. Задайте домен — тогда IP станет внутренней деталью и ссылки перестанут от него зависеть.')
                }
              />
            </div>
          )}
          <Alert
            theme="info"
            message="Доступность ноды после сохранения покажет индикатор на карточке. Проверка не блокирует сохранение — это позволяет починить неверный адрес, пока нода недоступна."
          />
        </form>
      </Dialog.Body>
      <Dialog.Footer
        onClickButtonApply={handleSubmit as any}
        onClickButtonCancel={onClose}
        textButtonApply="Сохранить"
        textButtonCancel="Отмена"
        loading={loading}
      />
    </Dialog>
  );
}
