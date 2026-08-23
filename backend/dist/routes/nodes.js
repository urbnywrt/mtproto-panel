"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
// List all nodes
router.get('/', async (_req, res) => {
    try {
        const result = await db_1.pool.query('SELECT id, name, ip, port, domain, created_at FROM nodes ORDER BY created_at DESC');
        res.json(result.rows);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Check connectivity before adding a node
router.post('/check-health', async (req, res) => {
    const { ip, port, token } = req.body;
    if (!ip || !port || !token) {
        res.status(400).json({ error: 'ip, port, and token are required' });
        return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
        const resp = await fetch(`http://${ip}:${port}/api/health`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
        });
        clearTimeout(timeout);
        res.json({ online: resp.ok });
    }
    catch {
        clearTimeout(timeout);
        res.json({ online: false });
    }
});
// Add a node
router.post('/', async (req, res) => {
    const { name, ip, port, token, domain } = req.body;
    if (!ip || !port || !token) {
        res.status(400).json({ error: 'ip, port, and token are required' });
        return;
    }
    try {
        const result = await db_1.pool.query('INSERT INTO nodes (name, ip, port, token, domain) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, ip, port, domain, created_at', [name || `Node ${ip}`, ip, port, token, domain || '']);
        res.status(201).json(result.rows[0]);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Get a node
router.get('/:id', async (req, res) => {
    try {
        const result = await db_1.pool.query('SELECT id, name, ip, port, token, domain, created_at FROM nodes WHERE id = $1', [
            req.params.id,
        ]);
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Node not found' });
            return;
        }
        res.json(result.rows[0]);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Update node
router.put('/:id', async (req, res) => {
    const { name, ip, port, token, domain } = req.body;
    try {
        const result = await db_1.pool.query('UPDATE nodes SET name = COALESCE($1, name), ip = COALESCE($2, ip), port = COALESCE($3, port), token = COALESCE($4, token), domain = COALESCE($5, domain) WHERE id = $6 RETURNING id, name, ip, port, domain, created_at', [name, ip, port, token, domain, req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Node not found' });
            return;
        }
        res.json(result.rows[0]);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Health check a node
router.get('/:id/health', async (req, res) => {
    try {
        const result = await db_1.pool.query('SELECT ip, port, token FROM nodes WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Node not found' });
            return;
        }
        const node = result.rows[0];
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
            const resp = await fetch(`http://${node.ip}:${node.port}/api/health`, {
                headers: { Authorization: `Bearer ${node.token}` },
                signal: controller.signal,
            });
            clearTimeout(timeout);
            if (resp.ok) {
                const body = await resp.json().catch(() => ({}));
                res.json({ online: true, version: body.version ?? null });
            }
            else {
                res.json({ online: false });
            }
        }
        catch {
            clearTimeout(timeout);
            res.json({ online: false });
        }
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Delete a node
router.delete('/:id', async (req, res) => {
    try {
        const result = await db_1.pool.query('DELETE FROM nodes WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Node not found' });
            return;
        }
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Trigger update on a node
router.post('/:id/update', async (req, res) => {
    try {
        const result = await db_1.pool.query('SELECT ip, port, token FROM nodes WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Node not found' });
            return;
        }
        const node = result.rows[0];
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000);
        try {
            const resp = await fetch(`http://${node.ip}:${node.port}/api/update`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${node.token}`, 'Content-Type': 'application/json' },
                signal: controller.signal,
            });
            clearTimeout(timeout);
            const data = await resp.json();
            res.status(resp.status).json(data);
        }
        catch (err) {
            clearTimeout(timeout);
            res.status(502).json({ error: `Failed to connect to node: ${err.message}` });
        }
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Get node domains
// Node capabilities — whether it can host WEB proxies, and under which 443 scheme.
// The form uses this to avoid offering WEB where it cannot possibly work.
router.get('/:id/capabilities', async (req, res) => {
    try {
        const result = await db_1.pool.query('SELECT ip, port, token FROM nodes WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Node not found' });
            return;
        }
        const node = result.rows[0];
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
            const resp = await fetch(`http://${node.ip}:${node.port}/api/capabilities`, {
                headers: { Authorization: `Bearer ${node.token}` },
                signal: controller.signal,
            });
            clearTimeout(timeout);
            if (resp.status === 404) {
                // Node predates WEB support.
                res.json({ web: false, mode: null, bindIp: null, acmeTokenConfigured: false, telemtVersion: null, reason: 'Нода не обновлена до версии с поддержкой WEB' });
                return;
            }
            const data = await resp.json();
            // In mode 1 the node cannot know its own public address; fill in what we have.
            if (data && data.bindIp === null)
                data.bindIp = node.ip;
            res.status(resp.status).json(data);
        }
        catch (err) {
            clearTimeout(timeout);
            res.status(502).json({ error: `Failed to connect to node: ${err.message}` });
        }
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.get('/:id/domains', async (req, res) => {
    try {
        const result = await db_1.pool.query('SELECT ip, port, token FROM nodes WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Node not found' });
            return;
        }
        const node = result.rows[0];
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
            const resp = await fetch(`http://${node.ip}:${node.port}/api/domains`, {
                headers: { Authorization: `Bearer ${node.token}` },
                signal: controller.signal,
            });
            clearTimeout(timeout);
            const data = await resp.json();
            res.status(resp.status).json(data);
        }
        catch (err) {
            clearTimeout(timeout);
            res.status(502).json({ error: `Failed to connect to node: ${err.message}` });
        }
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Update node domains
router.put('/:id/domains', async (req, res) => {
    try {
        const result = await db_1.pool.query('SELECT ip, port, token FROM nodes WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Node not found' });
            return;
        }
        const node = result.rows[0];
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
            const resp = await fetch(`http://${node.ip}:${node.port}/api/domains`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${node.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(req.body),
                signal: controller.signal,
            });
            clearTimeout(timeout);
            const data = await resp.json();
            res.status(resp.status).json(data);
        }
        catch (err) {
            clearTimeout(timeout);
            res.status(502).json({ error: `Failed to connect to node: ${err.message}` });
        }
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Get node IP blacklist
router.get('/:id/blacklist', async (req, res) => {
    try {
        const result = await db_1.pool.query('SELECT ip, port, token FROM nodes WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Node not found' });
            return;
        }
        const node = result.rows[0];
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
            const resp = await fetch(`http://${node.ip}:${node.port}/api/blacklist`, {
                headers: { Authorization: `Bearer ${node.token}` },
                signal: controller.signal,
            });
            clearTimeout(timeout);
            const data = await resp.json();
            res.status(resp.status).json(data);
        }
        catch (err) {
            clearTimeout(timeout);
            res.status(502).json({ error: `Failed to connect to node: ${err.message}` });
        }
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Update node IP blacklist
router.put('/:id/blacklist', async (req, res) => {
    try {
        const result = await db_1.pool.query('SELECT ip, port, token FROM nodes WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Node not found' });
            return;
        }
        const node = result.rows[0];
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
            const resp = await fetch(`http://${node.ip}:${node.port}/api/blacklist`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${node.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(req.body),
                signal: controller.signal,
            });
            clearTimeout(timeout);
            const data = await resp.json();
            res.status(resp.status).json(data);
        }
        catch (err) {
            clearTimeout(timeout);
            res.status(502).json({ error: `Failed to connect to node: ${err.message}` });
        }
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Export proxy configuration from node
router.get('/:id/export', async (req, res) => {
    try {
        const result = await db_1.pool.query('SELECT ip, port, token FROM nodes WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Node not found' });
            return;
        }
        const node = result.rows[0];
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
            const resp = await fetch(`http://${node.ip}:${node.port}/api/export`, {
                headers: { Authorization: `Bearer ${node.token}` },
                signal: controller.signal,
            });
            clearTimeout(timeout);
            const data = await resp.json();
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', resp.headers.get('Content-Disposition') || 'attachment; filename="proxies-export.json"');
            res.status(resp.status).json(data);
        }
        catch (err) {
            clearTimeout(timeout);
            res.status(502).json({ error: `Failed to connect to node: ${err.message}` });
        }
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Import proxy configuration to node
router.post('/:id/import', async (req, res) => {
    try {
        const result = await db_1.pool.query('SELECT ip, port, token FROM nodes WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Node not found' });
            return;
        }
        const node = result.rows[0];
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000);
        try {
            const resp = await fetch(`http://${node.ip}:${node.port}/api/import`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${node.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(req.body),
                signal: controller.signal,
            });
            clearTimeout(timeout);
            const data = await resp.json();
            res.status(resp.status).json(data);
        }
        catch (err) {
            clearTimeout(timeout);
            res.status(502).json({ error: `Failed to connect to node: ${err.message}` });
        }
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
//# sourceMappingURL=nodes.js.map