/**
 * Server-side validation for proxy payloads.
 *
 * The proxies route is otherwise a pass-through: it forwards req.body to the node
 * verbatim. That was fine while every proxy looked the same, but a WEB proxy that
 * reaches the node with a missing or malformed domain fails deep inside preflight,
 * or worse, leaks fake-TLS-only fields into a WEB config. Validating here keeps the
 * failure close to the operator and the payload clean.
 *
 * The node validates independently — this is not a substitute for that.
 */
export type ProxyType = 'faketls' | 'web';
/** Canonical lowercase FQDN: no scheme, port, path or trailing dot. Mirrors the node. */
export declare function isValidWebDomain(domain: unknown): domain is string;
export declare function isValidEmail(email: unknown): email is string;
export interface ValidationOutcome {
    error?: string;
    body?: Record<string, unknown>;
}
export declare function validateCreateProxy(input: unknown, nodeIp: string): ValidationOutcome;
export declare function validateUpdateProxy(input: unknown): ValidationOutcome;
/** Strip secrets before a node response goes back to the browser. */
export declare function redactProxy<T>(data: T): T;
