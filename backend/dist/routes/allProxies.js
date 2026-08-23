"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
// Get all proxies from all nodes
router.get('/all', async (req, res) => {
    try {
        const nodesResult = await db_1.pool.query('SELECT * FROM nodes ORDER BY id');
        const nodes = nodesResult.rows;
        const results = await Promise.allSettled(nodes.map(async (node) => {
            const url = `http://${node.ip}:${node.port}/api/proxies`;
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${node.token}`,
                },
            });
            const proxies = await response.json();
            return {
                nodeId: node.id,
                nodeName: node.name,
                nodeIp: node.ip,
                proxies: Array.isArray(proxies) ? proxies : [],
            };
        }));
        const data = results
            .filter((r) => r.status === 'fulfilled')
            .map((r) => r.value);
        res.json(data);
    }
    catch (error) {
        res.status(500).json({ error: `Failed to fetch proxies: ${error.message}` });
    }
});
exports.default = router;
//# sourceMappingURL=allProxies.js.map