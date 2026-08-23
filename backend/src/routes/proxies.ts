import { Router, Response } from 'express';
import { pool } from '../db';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { redactProxy, validateCreateProxy, validateUpdateProxy } from '../validation';

const router = Router();

router.use(authMiddleware);

async function getNodeWithToken(nodeId: string) {
  const result = await pool.query('SELECT * FROM nodes WHERE id = $1', [nodeId]);
  if (result.rows.length === 0) return null;
  return result.rows[0];
}

async function proxyToNode(
  node: { ip: string; port: number; token: string },
  method: string,
  path: string,
  body?: any
): Promise<{ status: number; data: any }> {
  const url = `http://${node.ip}:${node.port}/api/proxies${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${node.token}`,
  };

  const options: RequestInit = { method, headers };
  if (body && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json();
  return { status: response.status, data };
}

// List proxies on a node
router.get('/:nodeId/proxies', async (req: AuthRequest, res: Response) => {
  try {
    const node = await getNodeWithToken(req.params.nodeId);
    if (!node) {
      res.status(404).json({ error: 'Node not found' });
      return;
    }
    const result = await proxyToNode(node, 'GET', '');
    res.status(result.status).json(redactProxy(result.data));
  } catch (error: any) {
    res.status(502).json({ error: `Failed to connect to node: ${error.message}` });
  }
});

// Create proxy on a node
router.post('/:nodeId/proxies', async (req: AuthRequest, res: Response) => {
  try {
    const node = await getNodeWithToken(req.params.nodeId);
    if (!node) {
      res.status(404).json({ error: 'Node not found' });
      return;
    }
    const { error, body } = validateCreateProxy(req.body, node.ip);
    if (error) {
      res.status(400).json({ error });
      return;
    }
    const result = await proxyToNode(node, 'POST', '', body);
    res.status(result.status).json(redactProxy(result.data));
  } catch (error: any) {
    res.status(502).json({ error: `Failed to connect to node: ${error.message}` });
  }
});

// Get proxy details
router.get('/:nodeId/proxies/:proxyId', async (req: AuthRequest, res: Response) => {
  try {
    const node = await getNodeWithToken(req.params.nodeId);
    if (!node) {
      res.status(404).json({ error: 'Node not found' });
      return;
    }
    const result = await proxyToNode(node, 'GET', `/${req.params.proxyId}`);
    res.status(result.status).json(redactProxy(result.data));
  } catch (error: any) {
    res.status(502).json({ error: `Failed to connect to node: ${error.message}` });
  }
});

// Update proxy
router.put('/:nodeId/proxies/:proxyId', async (req: AuthRequest, res: Response) => {
  try {
    const node = await getNodeWithToken(req.params.nodeId);
    if (!node) {
      res.status(404).json({ error: 'Node not found' });
      return;
    }
    const { error, body } = validateUpdateProxy(req.body);
    if (error) {
      res.status(400).json({ error });
      return;
    }
    const result = await proxyToNode(node, 'PUT', `/${req.params.proxyId}`, body);
    res.status(result.status).json(redactProxy(result.data));
  } catch (error: any) {
    res.status(502).json({ error: `Failed to connect to node: ${error.message}` });
  }
});

// Delete proxy
router.delete('/:nodeId/proxies/:proxyId', async (req: AuthRequest, res: Response) => {
  try {
    const node = await getNodeWithToken(req.params.nodeId);
    if (!node) {
      res.status(404).json({ error: 'Node not found' });
      return;
    }
    const result = await proxyToNode(node, 'DELETE', `/${req.params.proxyId}`);
    res.status(result.status).json(result.data);
  } catch (error: any) {
    res.status(502).json({ error: `Failed to connect to node: ${error.message}` });
  }
});

// Get proxy stats
router.get('/:nodeId/proxies/:proxyId/stats', async (req: AuthRequest, res: Response) => {
  try {
    const node = await getNodeWithToken(req.params.nodeId);
    if (!node) {
      res.status(404).json({ error: 'Node not found' });
      return;
    }
    const result = await proxyToNode(node, 'GET', `/${req.params.proxyId}/stats`);
    res.status(result.status).json(result.data);
  } catch (error: any) {
    res.status(502).json({ error: `Failed to connect to node: ${error.message}` });
  }
});

// Get proxy link
router.get('/:nodeId/proxies/:proxyId/link', async (req: AuthRequest, res: Response) => {
  try {
    const node = await getNodeWithToken(req.params.nodeId);
    if (!node) {
      res.status(404).json({ error: 'Node not found' });
      return;
    }
    const serverHost = node.domain || node.ip;
    const result = await proxyToNode(node, 'GET', `/${req.params.proxyId}/link?server_ip=${serverHost}`);
    res.status(result.status).json(result.data);
  } catch (error: any) {
    res.status(502).json({ error: `Failed to connect to node: ${error.message}` });
  }
});

// Pause proxy
router.post('/:nodeId/proxies/:proxyId/pause', async (req: AuthRequest, res: Response) => {
  try {
    const node = await getNodeWithToken(req.params.nodeId);
    if (!node) {
      res.status(404).json({ error: 'Node not found' });
      return;
    }
    const result = await proxyToNode(node, 'POST', `/${req.params.proxyId}/pause`);
    res.status(result.status).json(result.data);
  } catch (error: any) {
    res.status(502).json({ error: `Failed to connect to node: ${error.message}` });
  }
});

// Unpause proxy
router.post('/:nodeId/proxies/:proxyId/unpause', async (req: AuthRequest, res: Response) => {
  try {
    const node = await getNodeWithToken(req.params.nodeId);
    if (!node) {
      res.status(404).json({ error: 'Node not found' });
      return;
    }
    const result = await proxyToNode(node, 'POST', `/${req.params.proxyId}/unpause`);
    res.status(result.status).json(result.data);
  } catch (error: any) {
    res.status(502).json({ error: `Failed to connect to node: ${error.message}` });
  }
});

// Re-issue the certificate for a WEB proxy
router.post('/:nodeId/proxies/:proxyId/renew-cert', async (req: AuthRequest, res: Response) => {
  try {
    const node = await getNodeWithToken(req.params.nodeId);
    if (!node) {
      res.status(404).json({ error: 'Node not found' });
      return;
    }
    const result = await proxyToNode(node, 'POST', `/${req.params.proxyId}/renew-cert`);
    res.status(result.status).json(redactProxy(result.data));
  } catch (error: any) {
    res.status(502).json({ error: `Failed to connect to node: ${error.message}` });
  }
});

// Get proxy stats history
router.get('/:nodeId/proxies/:proxyId/stats-history', async (req: AuthRequest, res: Response) => {
  try {
    const node = await getNodeWithToken(req.params.nodeId);
    if (!node) {
      res.status(404).json({ error: 'Node not found' });
      return;
    }
    const result = await proxyToNode(node, 'GET', `/${req.params.proxyId}/stats-history`);
    res.status(result.status).json(result.data);
  } catch (error: any) {
    res.status(502).json({ error: `Failed to connect to node: ${error.message}` });
  }
});

// Get proxy IP history
router.get('/:nodeId/proxies/:proxyId/ip-history', async (req: AuthRequest, res: Response) => {
  try {
    const node = await getNodeWithToken(req.params.nodeId);
    if (!node) {
      res.status(404).json({ error: 'Node not found' });
      return;
    }
    const result = await proxyToNode(node, 'GET', `/${req.params.proxyId}/ip-history`);
    res.status(result.status).json(result.data);
  } catch (error: any) {
    res.status(502).json({ error: `Failed to connect to node: ${error.message}` });
  }
});

// Clear proxy history
router.delete('/:nodeId/proxies/:proxyId/clear-history', async (req: AuthRequest, res: Response) => {
  try {
    const node = await getNodeWithToken(req.params.nodeId);
    if (!node) {
      res.status(404).json({ error: 'Node not found' });
      return;
    }
    const result = await proxyToNode(node, 'DELETE', `/${req.params.proxyId}/clear-history`);
    res.status(result.status).json(result.data);
  } catch (error: any) {
    res.status(502).json({ error: `Failed to connect to node: ${error.message}` });
  }
});

// Export all proxies from a node
router.get('/:nodeId/export', async (req: AuthRequest, res: Response) => {
  try {
    const node = await getNodeWithToken(req.params.nodeId);
    if (!node) {
      res.status(404).json({ error: 'Node not found' });
      return;
    }
    const url = `http://${node.ip}:${node.port}/api/export`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${node.token}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await resp.json();
      res.status(resp.status).json(data);
    } catch (err: any) {
      clearTimeout(timeout);
      res.status(502).json({ error: `Failed to connect to node: ${err.message}` });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Import proxies to a node
router.post('/:nodeId/import', async (req: AuthRequest, res: Response) => {
  try {
    const node = await getNodeWithToken(req.params.nodeId);
    if (!node) {
      res.status(404).json({ error: 'Node not found' });
      return;
    }
    const url = `http://${node.ip}:${node.port}/api/import`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${node.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await resp.json();
      res.status(resp.status).json(data);
    } catch (err: any) {
      clearTimeout(timeout);
      res.status(502).json({ error: `Failed to connect to node: ${err.message}` });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
