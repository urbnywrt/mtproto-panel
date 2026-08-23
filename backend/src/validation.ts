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

const CARRIERS = ['https', 'https-lanes'];
const SECRET_MODES = ['plain', 'dd'];

/** Fields that only make sense for type === 'web'. */
const WEB_FIELDS = ['acmeEmail', 'acmeDnsToken', 'webCarrier', 'webSecretMode'] as const;

/** Canonical lowercase FQDN: no scheme, port, path or trailing dot. Mirrors the node. */
export function isValidWebDomain(domain: unknown): domain is string {
  if (typeof domain !== 'string' || !domain || domain.length > 253) return false;
  if (domain !== domain.toLowerCase()) return false;
  if (/[:/\\ ]/.test(domain) || domain.endsWith('.')) return false;
  return /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain);
}

export function isValidEmail(email: unknown): email is string {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export interface ValidationOutcome {
  error?: string;
  body?: Record<string, unknown>;
}

export function validateCreateProxy(input: unknown, nodeIp: string): ValidationOutcome {
  if (!input || typeof input !== 'object') return { error: 'Тело запроса должно быть объектом' };
  const body = { ...(input as Record<string, unknown>) };

  const type = body.type === undefined ? 'faketls' : body.type;
  if (type !== 'faketls' && type !== 'web') {
    return { error: `Неизвестный тип прокси "${String(type)}": допустимы faketls и web` };
  }
  body.type = type;

  if (type === 'faketls') {
    // Keep WEB-only fields out of a fake TLS proxy so they cannot reach its config.
    for (const field of WEB_FIELDS) delete body[field];
    return { body };
  }

  if (!isValidWebDomain(body.domain)) {
    return {
      error: body.domain
        ? `Некорректный домен "${String(body.domain)}": нужен FQDN в нижнем регистре, без схемы, порта и точки в конце`
        : 'Для WEB-прокси нужен собственный домен: из пула fake TLS он не берётся',
    };
  }

  if (!isValidEmail(body.acmeEmail)) {
    return { error: 'Для WEB-прокси нужен корректный email для ACME' };
  }

  if (body.webCarrier === undefined) {
    body.webCarrier = 'https-lanes';
  } else if (!CARRIERS.includes(String(body.webCarrier))) {
    return { error: `Неизвестный carrier "${String(body.webCarrier)}": допустимы ${CARRIERS.join(', ')}` };
  }

  if (body.webSecretMode === undefined) {
    body.webSecretMode = 'plain';
  } else if (!SECRET_MODES.includes(String(body.webSecretMode))) {
    return { error: `Неизвестный режим секрета "${String(body.webSecretMode)}": допустимы ${SECRET_MODES.join(', ')}` };
  }

  if (body.acmeDnsToken !== undefined && typeof body.acmeDnsToken !== 'string') {
    return { error: 'Токен Cloudflare должен быть строкой' };
  }
  if (body.acmeDnsToken === '') delete body.acmeDnsToken;

  // The node compares this against the domain's A record.
  body.nodeIp = nodeIp;

  // A WEB proxy is always reached on 443, so a custom listen port is meaningless.
  delete body.listenPort;

  return { body };
}

export function validateUpdateProxy(input: unknown): ValidationOutcome {
  if (!input || typeof input !== 'object') return { error: 'Тело запроса должно быть объектом' };
  const body = { ...(input as Record<string, unknown>) };

  if (body.type !== undefined) {
    // Changing type means a different domain, config and certificate.
    return { error: 'Тип прокси менять нельзя — пересоздайте прокси' };
  }

  if (body.domain !== undefined && typeof body.domain === 'string' && body.domain.includes('.')) {
    // Only shape-check; whether this domain belongs to a WEB proxy is the node's call.
    const looksLikePoolDomain = !isValidWebDomain(body.domain);
    if (looksLikePoolDomain && !/^[a-z0-9.-]+$/i.test(body.domain)) {
      return { error: `Некорректный домен "${String(body.domain)}"` };
    }
  }

  if (body.acmeEmail !== undefined && !isValidEmail(body.acmeEmail)) {
    return { error: 'Некорректный email для ACME' };
  }
  if (body.webCarrier !== undefined && !CARRIERS.includes(String(body.webCarrier))) {
    return { error: `Неизвестный carrier "${String(body.webCarrier)}": допустимы ${CARRIERS.join(', ')}` };
  }
  if (body.webSecretMode !== undefined && !SECRET_MODES.includes(String(body.webSecretMode))) {
    return { error: `Неизвестный режим секрета "${String(body.webSecretMode)}": допустимы ${SECRET_MODES.join(', ')}` };
  }
  if (body.acmeDnsToken === '') delete body.acmeDnsToken;

  return { body };
}

/** Strip secrets before a node response goes back to the browser. */
export function redactProxy<T>(data: T): T {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(redactProxy) as unknown as T;
  const copy = { ...(data as Record<string, unknown>) };
  if ('acmeDnsToken' in copy) delete copy.acmeDnsToken;
  return copy as T;
}
