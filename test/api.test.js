const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { scryptSync } = require('node:crypto');
const { createApp } = require('../src/app');

async function fixture(t) {
  const calls = [];
  const responses = [];
  const run = async (sql, params) => {
    calls.push({ sql, params });
    assert.ok(responses.length, `Consulta inesperada: ${sql}`);
    const result = responses.shift();
    if (result instanceof Error) throw result;
    return [result];
  };
  const server = createApp({ query: run, execute: run }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    assert.equal(responses.length, 0, 'Quedaron consultas esperadas sin ejecutar');
  });
  const request = async (path, method = 'GET', body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
  return { calls, responses, request };
}

const examples = [
  ['categorias', 'pk_clave_cat', { nombre: 'Prueba' }],
  ['productos', 'pk_clave_pro', { nombre: 'Teclado', precio: 599.9, fk_clave_cat: 1 }],
  ['usuarios', 'pk_clave_usu', { nombre: 'Prueba', correo: 'prueba@example.com', contrasena: 'Clave de prueba' }],
  ['estatuspedidos', 'pk_clave_est', { nombre: 'Pendiente' }],
  ['pedidos', 'pk_clave_ped', { fk_clave_usu: 1, fk_clave_est: 1, fecha: '2026-11-03' }],
  ['detallepedidos', 'pk_clave_det', { fk_clave_ped: 1, fk_clave_pro: 1, cantidad: 2 }]
];

for (const [resource, key, input] of examples) {
  test(`CRUD HTTP de ${resource}, con SQL parametrizado`, async t => {
    const { calls, responses, request } = await fixture(t);
    const row = { [key]: 1, ...input };
    delete row.contrasena;
    const path = `/api/${resource}`;
    responses.push([row], [row], { insertId: 1 }, [row], { affectedRows: 1 }, [row], { affectedRows: 1 });
    assert.deepEqual(await request(path), { status: 200, body: [row] });
    assert.deepEqual(await request(`${path}/1`), { status: 200, body: row });
    assert.deepEqual(await request(path, 'POST', input), { status: 201, body: row });
    assert.deepEqual(await request(`${path}/1`, 'PUT', input), { status: 200, body: row });
    assert.deepEqual(await request(`${path}/1`, 'DELETE'), { status: 204, body: null });
    assert.match(calls[0].sql, new RegExp(`FROM \`tb_${resource}\` ORDER BY \`${key}\``));
    assert.deepEqual(calls[1].params, [1]);
    assert.match(calls[2].sql, /^INSERT INTO/);
    assert.equal(calls[2].params.length, Object.keys(input).length);
    assert.match(calls[4].sql, /^UPDATE/);
    assert.equal(calls[4].params.at(-1), 1);
    assert.match(calls[6].sql, /^DELETE FROM/);
    assert.deepEqual(calls[6].params, [1]);
    if (resource === 'usuarios') {
      for (const call of calls.filter(call => call.sql.startsWith('SELECT'))) {
        assert.doesNotMatch(call.sql, /contrasena/);
      }
      const encoded = calls[2].params[2];
      const [algorithm, salt, hash] = encoded.split(':');
      assert.equal(algorithm, 'scrypt');
      assert.equal(scryptSync(input.contrasena, salt, 64).toString('hex'), hash);
      assert.notEqual(encoded, calls[4].params[2], 'Cada hash debe usar una sal aleatoria');
    }
  });
}

test('Rechaza datos inválidos antes de consultar MySQL', async t => {
  const { calls, request } = await fixture(t);
  const invalid = [
    ['/api/categorias', null],
    ['/api/categorias', []],
    ['/api/categorias', { nombre: ' ' }],
    ['/api/categorias', { nombre: 'x'.repeat(101) }],
    ['/api/categorias', { nombre: 'Prueba', pk_clave_cat: 2 }],
    ['/api/categorias', { nombre: 15 }],
    ['/api/productos', { nombre: 'Prueba', precio: 1 }],
    ['/api/productos', { nombre: 'Prueba', precio: true, fk_clave_cat: 1 }],
    ['/api/productos', { nombre: 'Prueba', precio: -1, fk_clave_cat: 1 }],
    ['/api/productos', { nombre: 'Prueba', precio: 100000000, fk_clave_cat: 1 }],
    ['/api/productos', { nombre: 'Prueba', precio: 1, fk_clave_cat: '1 OR 1=1' }],
    ['/api/usuarios', { nombre: 'Prueba', correo: 'invalido', contrasena: 'clave' }],
    ['/api/usuarios', { nombre: 'Prueba', correo: 'prueba@example.com' }],
    ['/api/pedidos', { fk_clave_usu: 1, fk_clave_est: 1, fecha: '2026-02-30' }],
    ['/api/pedidos', { fk_clave_usu: 1, fk_clave_est: 1, fecha: '03/11/2026' }],
    ['/api/detallepedidos', { fk_clave_ped: 1, fk_clave_pro: 1, cantidad: 0 }],
    ['/api/detallepedidos', { fk_clave_ped: 1, fk_clave_pro: 1, cantidad: 2147483648 }]
  ];
  for (const [path, input] of invalid) {
    assert.equal((await request(path, 'POST', input)).status, 400, JSON.stringify(input));
  }
  for (const id of ['0', '-1', '1.5', 'abc', '2147483648', '1%20OR%201=1']) {
    assert.equal((await request(`/api/productos/${id}`)).status, 400);
  }
  assert.equal(calls.length, 0);
});

test('Actualizar usuario sin contraseña conserva el hash existente', async t => {
  const { calls, responses, request } = await fixture(t);
  const input = { nombre: 'Prueba', correo: 'prueba@example.com' };
  responses.push({ affectedRows: 1 }, [{ pk_clave_usu: 1, ...input }]);
  assert.equal((await request('/api/usuarios/1', 'PUT', input)).status, 200);
  assert.doesNotMatch(calls[0].sql, /contrasena/);
  assert.deepEqual(calls[0].params, ['Prueba', 'prueba@example.com', 1]);
});

test('El texto del usuario se envía como parámetro y no se interpola en SQL', async t => {
  const { calls, responses, request } = await fixture(t);
  const nombre = "Prueba'); DROP TABLE tb_categorias; --";
  responses.push({ insertId: 1 }, [{ pk_clave_cat: 1, nombre }]);
  assert.equal((await request('/api/categorias', 'POST', { nombre })).status, 201);
  assert.doesNotMatch(calls[0].sql, /DROP TABLE/);
  assert.deepEqual(calls[0].params, [nombre]);
});

test('JSON mal formado responde 400 sin consultar MySQL', async t => {
  const calls = [];
  const server = createApp({ query: async () => calls.push('query') }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/categorias`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{'
  });
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test('404 para registros inexistentes y rutas desconocidas', async t => {
  const { responses, request } = await fixture(t);
  responses.push([], { affectedRows: 0 }, { affectedRows: 0 });
  assert.equal((await request('/api/categorias/999')).status, 404);
  assert.equal((await request('/api/categorias/999', 'PUT', { nombre: 'Prueba' })).status, 404);
  assert.equal((await request('/api/categorias/999', 'DELETE')).status, 404);
  assert.equal((await request('/api/otra')).status, 404);
});

test('Relaciones inválidas, eliminaciones restringidas y correo duplicado', async t => {
  const { responses, request } = await fixture(t);
  for (const [code, status, method, path, body] of [
    ['ER_NO_REFERENCED_ROW_2', 400, 'POST', '/api/productos', { nombre: 'Prueba', precio: 1, fk_clave_cat: 999 }],
    ['ER_ROW_IS_REFERENCED_2', 409, 'DELETE', '/api/categorias/1'],
    ['ER_DUP_ENTRY', 409, 'PUT', '/api/usuarios/1', { nombre: 'Prueba', correo: 'prueba@example.com' }]
  ]) {
    responses.push(Object.assign(new Error('No exponer detalles SQL'), { code }));
    const result = await request(path, method, body);
    assert.equal(result.status, status);
    assert.doesNotMatch(result.body.error, /SQL/);
  }
});

test('Inicio enumera recursos y health comprueba MySQL', async t => {
  const { responses, request } = await fixture(t);
  assert.equal((await request('/')).body.recursos.length, 6);
  responses.push([{ 1: 1 }]);
  assert.deepEqual(await request('/health'), { status: 200, body: { status: 'ok', database: 'connected' } });
});
