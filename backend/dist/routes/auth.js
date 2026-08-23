"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../db");
const config_1 = require("../config");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        res.status(400).json({ error: 'Username and password are required' });
        return;
    }
    try {
        const result = await db_1.pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }
        const user = result.rows[0];
        const valid = await bcrypt_1.default.compare(password, user.password_hash);
        if (!valid) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }
        const token = jsonwebtoken_1.default.sign({ userId: user.id, username: user.username }, config_1.config.jwtSecret, { expiresIn: config_1.config.jwtExpiresIn });
        res.json({ token, user: { id: user.id, username: user.username } });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.get('/me', auth_1.authMiddleware, async (req, res) => {
    res.json({ user: req.user });
});
exports.default = router;
//# sourceMappingURL=auth.js.map