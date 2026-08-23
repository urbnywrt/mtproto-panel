"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
const config_1 = require("./config");
const migrations_1 = require("./db/migrations");
const auth_1 = require("./middleware/auth");
const auth_2 = __importDefault(require("./routes/auth"));
const nodes_1 = __importDefault(require("./routes/nodes"));
const proxies_1 = __importDefault(require("./routes/proxies"));
const allProxies_1 = __importDefault(require("./routes/allProxies"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use('/api/auth', auth_2.default);
app.use('/api/nodes', nodes_1.default);
app.use('/api/nodes', proxies_1.default);
app.use('/api/proxies', allProxies_1.default);
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
});
app.get('/api/system/version', auth_1.authMiddleware, (_req, res) => {
    let version = 'unknown';
    try {
        const pkg = JSON.parse((0, fs_1.readFileSync)((0, path_1.join)(__dirname, '../package.json'), 'utf-8'));
        version = pkg.version || 'unknown';
    }
    catch { }
    res.json({ version });
});
// Trigger panel self-update (fires update.sh and returns immediately)
app.post('/api/system/update', auth_1.authMiddleware, (_req, res) => {
    const scriptPath = '/app/project/update.sh';
    // Fire and forget — container will rebuild itself
    (0, child_process_1.execFile)('/bin/bash', [scriptPath], { cwd: '/app/project', timeout: 300000 }, () => { });
    res.json({ success: true, message: 'Обновление запущено. Панель перезапустится через несколько минут.' });
});
async function bootstrap() {
    try {
        await (0, migrations_1.runMigrations)();
        const adminUser = process.env.ADMIN_USERNAME;
        const adminPass = process.env.ADMIN_PASSWORD;
        if (adminUser && adminPass) {
            await (0, migrations_1.createAdminUser)(adminUser, adminPass);
        }
        app.listen(config_1.config.port, '0.0.0.0', () => {
            console.log(`Panel backend running on port ${config_1.config.port}`);
        });
    }
    catch (error) {
        console.error('Failed to start panel backend:', error);
        process.exit(1);
    }
}
bootstrap();
//# sourceMappingURL=index.js.map