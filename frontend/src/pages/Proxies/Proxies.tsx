import { Button, Loader, Alert, Select } from '@gravity-ui/uikit';
import EditProxyDialog from '../../components/EditProxyDialog';
import ProxyCard from '../../components/ProxyCard';
import AddProxyDialog from '../../components/AddProxyDialog';
import { useProxies } from '../../hooks/useProxies';
import s from './Proxies.module.scss';

export default function Proxies() {
  const {
    nodes, loading, error, setError,
    showAdd, setShowAdd, editProxy, setEditProxy, copiedId,
    filterNodeId, setFilterNodeId, filterOptions,
    allProxies, totalProxies,
    loadData, handleDelete, handleCopyLink,
  } = useProxies();

  return (
    <>
      <div className={s.header}>
        <div className={s.headerLeft}>
          <h2>Прокси ({totalProxies})</h2>
          {nodes.length > 1 && (
            <Select value={filterNodeId} onUpdate={setFilterNodeId} options={filterOptions} width={200} />
          )}
        </div>
        <Button view="action" onClick={() => setShowAdd(true)}>+ Добавить прокси</Button>
      </div>

      {error && (
        <div className={s.errorWrap}>
          <Alert theme="danger" message={error} onClose={() => setError('')} />
        </div>
      )}

      {loading ? (
        <div className={s.loader}><Loader size="l" /></div>
      ) : allProxies.length === 0 ? (
        <div className={s.empty}>
          <p>Прокси не найдены.</p>
          <p>Добавьте прокси для начала работы.</p>
        </div>
      ) : (
        <div className={s.grid}>
          {allProxies.map((proxy) => (
            <ProxyCard
              key={`${proxy.nodeId}-${proxy.id}`}
              proxy={proxy}
              nodeId={proxy.nodeId}
              nodeName={proxy.nodeName}
              copied={copiedId === proxy.id}
              onEdit={() => setEditProxy({ proxy, nodeId: proxy.nodeId })}
              onDelete={() => handleDelete(proxy.nodeId, proxy.id)}
              onCopyLink={() => handleCopyLink(proxy.nodeId, proxy.id)}
              onStatusChange={loadData}
              onError={setError}
            />
          ))}
        </div>
      )}

      <AddProxyDialog open={showAdd} onClose={() => setShowAdd(false)} nodes={nodes} onCreated={() => { setShowAdd(false); loadData(); }} />

      {editProxy && (
        <EditProxyDialog open={!!editProxy} onClose={() => setEditProxy(null)} nodeId={editProxy.nodeId} proxy={editProxy.proxy} onUpdated={() => { setEditProxy(null); loadData(); }} />
      )}
    </>
  );
}
