"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
const pg_1 = require("pg");
const config_1 = require("../config");
exports.pool = new pg_1.Pool({
    host: config_1.config.db.host,
    port: config_1.config.db.port,
    database: config_1.config.db.database,
    user: config_1.config.db.user,
    password: config_1.config.db.password,
});
exports.pool.on('error', (err) => {
    console.error('Unexpected database error:', err);
});
//# sourceMappingURL=index.js.map