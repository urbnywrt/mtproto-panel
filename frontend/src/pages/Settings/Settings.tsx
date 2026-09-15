import { useState, useEffect } from 'react';
import { Card, TextInput, Label, Button, Alert } from '@gravity-ui/uikit';
import { getMe, getPanelVersion, getPanelUpdateLog, updatePanel } from '../../api';
import { stripAnsi } from '../../utils/format';
import s from './Settings.module.scss';

interface UpdateReport {
  state: 'pending' | 'success' | 'error';
  message: string;
  output: string;
}

/**
 * The update replaces the backend and frontend containers, so the request that started
 * it cannot report the outcome. Requests fail while they restart — only the timeout is final.
 */
async function waitForPanelUpdate(timeoutMs = 600000): Promise<{ success: boolean; output: string }> {
  const started = Date.now();
  let lastError = '';
  while (Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    try {
      const log = await getPanelUpdateLog();
      if (log.exists && !log.running) {
        return { success: log.exitCode === 0, output: log.output || 'Журнал обновления пуст.' };
      }
    } catch (err: any) {
      lastError = err?.message || String(err);
    }
  }
  return {
    success: false,
    output: lastError
      ? `Панель не сообщила о результате за 10 минут. Последняя ошибка связи: ${lastError}`
      : 'Панель не сообщила о результате за 10 минут.',
  };
}

export default function Settings() {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [panelVersion, setPanelVersion] = useState('');
  const [updating, setUpdating] = useState(false);
  const [report, setReport] = useState<UpdateReport | null>(null);

  const loadVersion = () => {
    getPanelVersion()
      .then((data) => setPanelVersion(data.version))
      .catch(() => {});
  };

  useEffect(() => {
    getMe()
      .then((data) => setUsername(data.user.username))
      .catch(() => {})
      .finally(() => setLoading(false));

    loadVersion();
  }, []);

  const handleUpdate = async () => {
    if (!confirm('Запустить обновление панели? Панель перезапустится.')) return;
    setUpdating(true);
    setReport(null);
    try {
      const result = await updatePanel();
      if (!result.async) {
        setReport({
          state: result.success ? 'success' : 'error',
          message: result.error || (result.success ? 'Обновление завершено.' : 'Не удалось запустить обновление.'),
          output: stripAnsi(result.output || ''),
        });
        return;
      }

      setReport({
        state: 'pending',
        message: 'Обновление идёт в отдельном контейнере. Панель сейчас перезапустится — это занимает 1–5 минут.',
        output: '',
      });
      const finished = await waitForPanelUpdate();
      setReport({
        state: finished.success ? 'success' : 'error',
        message: finished.success ? 'Панель обновлена.' : 'Обновление завершилось с ошибкой.',
        output: stripAnsi(finished.output),
      });
      loadVersion();
    } catch (err: any) {
      setReport({ state: 'error', message: err?.message || 'Ошибка запуска обновления', output: '' });
    } finally {
      setUpdating(false);
    }
  };

  const alertTheme = report?.state === 'pending' ? 'info' : report?.state === 'success' ? 'success' : 'danger';

  return (
    <>
      <h2 className={s.title}>Настройки</h2>

      <Card view="outlined" className={s.card}>
        <h3>Аккаунт</h3>
        <div className={s.field}>
          <label>Имя пользователя</label>
          <TextInput value={username} size="l" disabled />
        </div>
        <div className={s.hint}>
          <Label theme="info" size="xs">
            Для смены пароля обновите переменную ADMIN_PASSWORD и перезапустите бэкенд.
          </Label>
        </div>
      </Card>

      <Card view="outlined" className={s.card} style={{ marginTop: 16 }}>
        <h3>Панель</h3>
        <div className={s.field}>
          <label>Версия</label>
          <TextInput value={panelVersion ? `v${panelVersion}` : '—'} size="l" disabled />
        </div>
        {report && (
          <div style={{ marginBottom: 12 }}>
            <Alert theme={alertTheme} message={report.message} />
            {report.output && <pre className={s.updateOutput}>{report.output}</pre>}
          </div>
        )}
        <Button view="action" size="l" loading={updating} onClick={handleUpdate}>
          Обновить панель
        </Button>
      </Card>
    </>
  );
}
