#!/usr/bin/env node
/**
 * Checks for proxy payload validation.
 *
 * The proxies route was a verbatim pass-through before WEB support, so these rules are
 * the only thing standing between a malformed form submission and a node-side failure
 * deep inside preflight. They also keep fake-TLS-only fields out of a WEB payload and
 * the stored Cloudflare token out of responses.
 *
 * Run: npm run check   (requires npm run build first)
 */
const path = require('path');
const {
  validateCreateProxy,
  validateUpdateProxy,
  redactProxy,
  isValidWebDomain,
  isValidEmail,
} = require(path.resolve(__dirname, '../dist/validation'));

let failures = 0;
function check(name, condition, detail) {
  if (condition) return console.log(`  ok   ${name}`);
  failures++;
  console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
}

const NODE_IP = '203.0.113.10';

console.log('\nСоздание: fake TLS не меняется');
{
  const { error, body } = validateCreateProxy({ name: 'p', domain: 'www.google.com' }, NODE_IP);
  check('без type трактуется как faketls', !error && body.type === 'faketls');
  check('домен из пула не проверяется как FQDN оператора', !error);
  check('nodeIp не добавляется', body.nodeIp === undefined);
}
{
  const { body } = validateCreateProxy(
    { type: 'faketls', acmeEmail: 'a@b.co', webCarrier: 'https', acmeDnsToken: 'tok', webSecretMode: 'dd' },
    NODE_IP
  );
  check('web-поля отбрасываются у faketls',
    body.acmeEmail === undefined && body.webCarrier === undefined &&
    body.acmeDnsToken === undefined && body.webSecretMode === undefined);
}

console.log('\nСоздание: WEB');
{
  const { error, body } = validateCreateProxy(
    { type: 'web', domain: 'proxy.example.com', acmeEmail: 'ops@example.com' },
    NODE_IP
  );
  check('валидный payload проходит', !error, error);
  check('carrier по умолчанию https-lanes', body.webCarrier === 'https-lanes');
  check('режим секрета по умолчанию plain', body.webSecretMode === 'plain');
  check('nodeIp проставлен', body.nodeIp === NODE_IP);
}
{
  const cases = [
    ['без домена', { type: 'web', acmeEmail: 'a@b.co' }],
    ['домен с портом', { type: 'web', domain: 'proxy.example.com:443', acmeEmail: 'a@b.co' }],
    ['домен со схемой', { type: 'web', domain: 'https://proxy.example.com', acmeEmail: 'a@b.co' }],
    ['домен в верхнем регистре', { type: 'web', domain: 'Proxy.Example.com', acmeEmail: 'a@b.co' }],
    ['без email', { type: 'web', domain: 'proxy.example.com' }],
    ['битый email', { type: 'web', domain: 'proxy.example.com', acmeEmail: 'not-an-email' }],
    ['неизвестный carrier', { type: 'web', domain: 'proxy.example.com', acmeEmail: 'a@b.co', webCarrier: 'websocket' }],
    ['неизвестный режим секрета', { type: 'web', domain: 'proxy.example.com', acmeEmail: 'a@b.co', webSecretMode: 'ee' }],
    ['неизвестный тип', { type: 'socks' }],
    ['не объект', 'строка'],
  ];
  for (const [label, input] of cases) {
    const { error } = validateCreateProxy(input, NODE_IP);
    check(`отвергнуто: ${label}`, !!error, 'ожидалась ошибка');
  }
}
{
  // websocket carriers exist in the protocol spec but telemt does not implement them.
  const { error } = validateCreateProxy(
    { type: 'web', domain: 'p.example.com', acmeEmail: 'a@b.co', webCarrier: 'websocket-lanes' },
    NODE_IP
  );
  check('websocket-lanes отвергнут (telemt его не реализует)', !!error);
}
{
  const { body } = validateCreateProxy(
    { type: 'web', domain: 'p.example.com', acmeEmail: 'a@b.co', listenPort: 8443 },
    NODE_IP
  );
  check('listenPort выброшен — WEB всегда на 443', body.listenPort === undefined);
}

console.log('\nОбновление');
{
  check('тип менять нельзя', !!validateUpdateProxy({ type: 'web' }).error);
  check('битый email отвергнут', !!validateUpdateProxy({ acmeEmail: 'nope' }).error);
  check('неизвестный carrier отвергнут', !!validateUpdateProxy({ webCarrier: 'websocket' }).error);
  check('обычное обновление проходит', !validateUpdateProxy({ name: 'new', note: 'x' }).error);
  check('смена carrier проходит', !validateUpdateProxy({ webCarrier: 'https' }).error);
}

console.log('\nРедактирование ответов');
{
  const one = redactProxy({ id: 'a', acmeDnsToken: 'secret', domain: 'p.example.com' });
  check('токен убран из объекта', one.acmeDnsToken === undefined && one.domain === 'p.example.com');
  const many = redactProxy([{ id: 'a', acmeDnsToken: 's' }, { id: 'b' }]);
  check('токен убран из массива', many.every((p) => p.acmeDnsToken === undefined));
  check('не объект проходит как есть', redactProxy(null) === null && redactProxy('x') === 'x');
}

console.log('\nВспомогательные предикаты');
check('домен: валидный', isValidWebDomain('a.b.example.org'));
check('домен: localhost отвергнут', !isValidWebDomain('localhost'));
check('домен: IP отвергнут', !isValidWebDomain('192.0.2.1'));
check('email: валидный', isValidEmail('ops@example.com'));
check('email: без домена отвергнут', !isValidEmail('ops@example'));

console.log('');
if (failures > 0) {
  console.error(`${failures} проверок провалено`);
  process.exit(1);
}
console.log('Все проверки пройдены.');
