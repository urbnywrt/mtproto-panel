import { useState, useEffect } from 'react';
import { getNodes, deleteNode, checkNodeHealth, updateNodeService, getNodeUpdateLog, getProxies, NodeData, ProxyData } from '../api';

export interface UpdateReport {
  nodeName: string;
  success: boolean;
  /** Still running: the dialog shows progress instead of a verdict. */
  pending?: boolean;
  /** Script output, with terminal colour codes stripped for display. */
  output: string;
}

/**
 * The update replaces the node's own container, so the request that started it cannot
 * report the outcome — the node goes unreachable and comes back. Failures here are
 * expected until it does; only the timeout is final.
 */
async function waitForUpdate(id: number, timeoutMs = 360000): Promise<{ success: boolean; output: string }> {
  const started = Date.now();
  let lastError = '';
  while (Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    try {
      const log = await getNodeUpdateLog(id);
      // The node answers again while the sidecar is still restoring proxies, so wait
      // for the sidecar itself rather than for the node to come back.
      if (!log.running) {
        return { success: log.exitCode === 0, output: log.output || 'Журнал обновления пуст.' };
      }
    } catch (err: any) {
      lastError = err?.message || String(err);
    }
  }
  return {
    success: false,
    output: lastError
      ? `Нода не сообщила о результате за 6 минут. Последняя ошибка связи: ${lastError}`
      : 'Нода не сообщила о результате за 6 минут.',
  };
}

/** update.sh colours its progress; the codes are noise in a dialog. */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

export function useNodes() {
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [healthMap, setHealthMap] = useState<Record<number, boolean | null>>({});
  const [updatingMap, setUpdatingMap] = useState<Record<number, boolean>>({});
  const [proxiesMap, setProxiesMap] = useState<Record<number, ProxyData[]>>({});
  const [geoMap, setGeoMap] = useState<Record<string, string>>({});
  const [versionMap, setVersionMap] = useState<Record<number, string | null>>({});
  const [updateResult, setUpdateResult] = useState<UpdateReport | null>(null);

  const lookupNodeGeo = async (nodeList: NodeData[]) => {
    const ips = nodeList.map((n) => n.ip).filter((ip) => !geoMap[ip]);
    if (ips.length === 0) return;
    try {
      const resp = await fetch('http://ip-api.com/batch?fields=query,countryCode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ips.map((ip) => ({ query: ip }))),
      });
      if (resp.ok) {
        const data = await resp.json() as Array<{ query: string; countryCode?: string }>;
        const map: Record<string, string> = {};
        for (const entry of data) {
          if (entry.countryCode) map[entry.query] = entry.countryCode;
        }
        setGeoMap((prev) => ({ ...prev, ...map }));
      }
    } catch {}
  };

  const loadAllProxies = async (nodeList: NodeData[]) => {
    await Promise.all(
      nodeList.map(async (node) => {
        try {
          const proxies = await getProxies(node.id);
          setProxiesMap((prev) => ({ ...prev, [node.id]: proxies }));
        } catch {
          setProxiesMap((prev) => ({ ...prev, [node.id]: [] }));
        }
      }),
    );
  };

  const checkAllHealth = async (nodeList: NodeData[]) => {
    const map: Record<number, boolean | null> = {};
    nodeList.forEach((n) => (map[n.id] = null));
    setHealthMap(map);

    await Promise.all(
      nodeList.map(async (node) => {
        try {
          const { online, version } = await checkNodeHealth(node.id);
          setHealthMap((prev) => ({ ...prev, [node.id]: online }));
          setVersionMap((prev) => ({ ...prev, [node.id]: version ?? null }));
        } catch {
          setHealthMap((prev) => ({ ...prev, [node.id]: false }));
        }
      }),
    );
  };

  const loadNodes = async () => {
    try {
      const data = await getNodes();
      setNodes(data);
      checkAllHealth(data);
      loadAllProxies(data);
      lookupNodeGeo(data);
    } catch (err) {
      console.error('Failed to load nodes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNodes();
  }, []);

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Удалить эту ноду?')) return;
    try {
      await deleteNode(id);
      setNodes((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error('Failed to delete node:', err);
    }
  };

  const handleUpdate = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const nodeName = nodes.find((n) => n.id === id)?.name || `Нода #${id}`;
    setUpdatingMap((prev) => ({ ...prev, [id]: true }));
    try {
      const result = await updateNodeService(id);

      if (result.async) {
        setUpdateResult({
          nodeName,
          success: true,
          pending: true,
          output: 'Обновление идёт в отдельном контейнере. Нода сейчас перезапустится — это занимает 1–3 минуты.',
        });
        const finished = await waitForUpdate(id);
        setUpdateResult({ nodeName, success: finished.success, output: stripAnsi(finished.output) });
      } else {
        const body = [result.error, result.output].filter(Boolean).join('\n\n');
        setUpdateResult({
          nodeName,
          success: result.success,
          output: stripAnsi(body) || (result.success ? 'Обновление завершено.' : 'Нода не вернула вывод.'),
        });
      }
      // The node reports its version on health, so refresh to show what actually landed.
      await loadNodes();
    } catch (err: any) {
      setUpdateResult({
        nodeName,
        success: false,
        output: err?.message || 'Не удалось связаться с нодой.',
      });
    } finally {
      setUpdatingMap((prev) => ({ ...prev, [id]: false }));
    }
  };

  return {
    nodes, loading, showAdd, setShowAdd,
    healthMap, updatingMap, proxiesMap, geoMap, versionMap,
    updateResult, setUpdateResult,
    loadNodes, handleDelete, handleUpdate,
  };
}
