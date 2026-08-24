import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Label, Loader } from '@gravity-ui/uikit';
import AddNodeDialog from '../../components/AddNodeDialog';
import EditNodeDialog from '../../components/EditNodeDialog';
import FlagIcon from '../../components/FlagIcon';
import { useNodes } from '../../hooks/useNodes';
import type { NodeData } from '../../api';
import s from './Nodes.module.scss';

export default function Nodes() {
  const navigate = useNavigate();
  const {
    nodes, loading, showAdd, setShowAdd,
    healthMap, updatingMap, proxiesMap, geoMap, versionMap,
    loadNodes, handleDelete, handleUpdate,
  } = useNodes();

  const [editing, setEditing] = useState<NodeData | null>(null);

  const healthDotClass = (id: number) =>
    healthMap[id] === null ? s.healthDotChecking : healthMap[id] ? s.healthDotOnline : s.healthDotOffline;

  const healthTitle = (id: number) =>
    healthMap[id] === null ? 'Проверка...' : healthMap[id] ? 'Онлайн' : 'Офлайн';

  return (
    <>
      <div className={s.header}>
        <h2>Ноды</h2>
        <Button view="action" onClick={() => setShowAdd(true)}>
          + Добавить ноду
        </Button>
      </div>

      {loading ? (
        <div className={s.loader}><Loader size="l" /></div>
      ) : nodes.length === 0 ? (
        <div className={s.empty}>
          <p>Ноды ещё не добавлены.</p>
          <p>Добавьте ноду для управления MTProto прокси.</p>
        </div>
      ) : (
        <div className={s.grid}>
          {nodes.map((node) => (
            <Card
              key={node.id}
              className={s.card}
              type="action"
              view="outlined"
              onClick={() => navigate(`/nodes/${node.id}`)}
              style={{ padding: 20 }}
            >
              <div className={s.cardTop}>
                <div className={s.cardTopLeft}>
                  <span className={`${s.healthDot} ${healthDotClass(node.id)}`} title={healthTitle(node.id)} />
                  <h3 className={s.cardName}>{geoMap[node.ip] && <FlagIcon code={geoMap[node.ip]} />}{node.name}</h3>
                </div>
                <Label theme="info" size="s">Нода #{node.id}</Label>
              </div>

              <div className="proxy-card-field"><span className="label">IP</span><span>{node.ip}</span></div>
              {node.domain && <div className="proxy-card-field"><span className="label">Домен</span><span>{node.domain}</span></div>}
              <div className="proxy-card-field"><span className="label">Порт</span><span>{node.port}</span></div>
              <div className="proxy-card-field"><span className="label">Добавлено</span><span>{new Date(node.created_at).toLocaleDateString()}</span></div>
              {versionMap[node.id] && <div className="proxy-card-field"><span className="label">Версия</span><span>v{versionMap[node.id]}</span></div>}

              {proxiesMap[node.id] && proxiesMap[node.id].length > 0 && (
                <div className={s.proxiesSection}>
                  <div className={s.proxiesSectionTitle}>Прокси ({proxiesMap[node.id].length}):</div>
                  {proxiesMap[node.id].map((p) => (
                    <div key={p.id} className={s.proxyRow}>
                      <span>{p.name || `Proxy ${p.id}`}</span>
                      <div className={s.proxyRowRight}>
                        <span className={s.proxyRowConns}>{p.connectedIps?.length || 0} подк.</span>
                        <Label
                          theme={p.status === 'running' ? 'success' : p.status === 'stopped' || p.status === 'paused' ? 'warning' : 'danger'}
                          size="xs"
                        >
                          {p.status === 'running' ? 'работает' : p.status === 'paused' ? 'пауза' : p.status === 'stopped' ? 'остановлен' : 'ошибка'}
                        </Label>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className={s.cardActions}>
                <Button
                  view="outlined"
                  size="s"
                  onClick={(e) => { e.stopPropagation(); setEditing(node); }}
                >
                  Изменить
                </Button>
                <Button view="outlined" size="s" loading={updatingMap[node.id] || false} onClick={(e) => handleUpdate(node.id, e)}>
                  Обновить
                </Button>
                <Button view="flat-danger" size="s" onClick={(e) => handleDelete(node.id, e)}>
                  Удалить
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <EditNodeDialog
        open={editing !== null}
        node={editing}
        onClose={() => setEditing(null)}
        onUpdated={() => { setEditing(null); loadNodes(); }}
      />

      <AddNodeDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={() => { setShowAdd(false); loadNodes(); }}
      />
    </>
  );
}
