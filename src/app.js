const express = require('express');
const { randomBytes, scrypt } = require('node:crypto');
const { promisify } = require('node:util');
const pool = require('./db');
const resources = require('./resources');
const deriveKey = promisify(scrypt);

function createApp(database = pool) {
  const app = express();
  app.use(express.json());
  app.get('/', (req, res) => res.json({ recursos: Object.keys(resources).map(name => `/api/${name}`) }));
  app.get('/health', async (req, res, next) => {
    try {
      await database.query('SELECT 1');
      res.json({ status: 'ok', database: 'connected' });
    } catch (error) { next(error); }
  });

  for (const [name, resource] of Object.entries(resources)) {
    const path = `/api/${name}`;
    // Los identificadores provienen exclusivamente de la configuración local.
    const table = `\`${resource.table}\``;
    const key = `\`${resource.key}\``;
    const columns = [resource.key, ...Object.keys(resource.fields)]
      .filter(column => column !== 'contrasena')
      .map(column => `\`${column}\``).join(', ');
    const select = `SELECT ${columns} FROM ${table}`;

    app.get(path, async (req, res, next) => {
      try {
        const [rows] = await database.query(`${select} ORDER BY ${key}`);
        res.json(rows);
      } catch (error) { next(error); }
    });
    app.use(`${path}/:id`, (req, res, next) => {
      const id = positiveInteger(req.params.id);
      if (id === null) return res.status(400).json({ error: 'El id debe ser un entero entre 1 y 2147483647' });
      res.locals.id = id;
      next();
    });
    app.get(`${path}/:id`, async (req, res, next) => {
      try {
        const [rows] = await database.execute(`${select} WHERE ${key} = ?`, [res.locals.id]);
        if (!rows.length) return res.status(404).json({ error: 'Registro no encontrado' });
        res.json(rows[0]);
      } catch (error) { next(error); }
    });

    for (const method of ['post', 'put']) {
      app[method](method === 'post' ? path : `${path}/:id`, async (req, res, next) => {
        try {
          const result = validateBody(req.body, resource.fields, method);
          if (result.error) return res.status(400).json({ error: result.error });
          const values = result.values;
          if (values.contrasena !== undefined) {
            const salt = randomBytes(16).toString('hex');
            const hash = await deriveKey(values.contrasena, salt, 64);
            values.contrasena = `scrypt:${salt}:${hash.toString('hex')}`;
          }
          const fields = Object.keys(values);
          let id = res.locals.id;
          if (method === 'post') {
            const [insert] = await database.execute(
              `INSERT INTO ${table} (${fields.map(field => `\`${field}\``).join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
              Object.values(values)
            );
            id = insert.insertId;
          } else {
            const [update] = await database.execute(
              `UPDATE ${table} SET ${fields.map(field => `\`${field}\` = ?`).join(', ')} WHERE ${key} = ?`,
              [...Object.values(values), id]
            );
            if (!update.affectedRows) return res.status(404).json({ error: 'Registro no encontrado' });
          }
          const [rows] = await database.execute(`${select} WHERE ${key} = ?`, [id]);
          res.status(method === 'post' ? 201 : 200).json(rows[0]);
        } catch (error) { next(error); }
      });
    }
    app.delete(`${path}/:id`, async (req, res, next) => {
      try {
        const [result] = await database.execute(`DELETE FROM ${table} WHERE ${key} = ?`, [res.locals.id]);
        if (!result.affectedRows) return res.status(404).json({ error: 'Registro no encontrado' });
        res.status(204).send();
      } catch (error) { next(error); }
    });
  }
  app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
  app.use((error, req, res, next) => {
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'El cuerpo debe ser JSON válido' });
    if (error.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ error: 'Una de las referencias no existe; revisa los campos fk_clave_*' });
    if (error.code === 'ER_ROW_IS_REFERENCED_2') return res.status(409).json({ error: 'El registro está relacionado con otros registros y no se puede eliminar' });
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe un registro con ese valor único (por ejemplo, correo)' });
    console.error('Error de API:', error.code || error.name);
    res.status(500).json({ error: 'Error interno del servidor' });
  });
  return app;
}

function positiveInteger(value) {
  if (!['number', 'string'].includes(typeof value) || !/^[1-9]\d*$/.test(String(value))) return null;
  const number = Number(value);
  return Number.isInteger(number) && number <= 2147483647 ? number : null;
}

function validateBody(body, fields, method) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'El cuerpo debe ser un objeto JSON' };
  const unknown = Object.keys(body).find(field => !Object.hasOwn(fields, field));
  if (unknown) return { error: `Campo no permitido: ${unknown}` };
  const values = {};
  for (const [field, rule] of Object.entries(fields)) {
    const input = body[field];
    if (input === undefined && method === 'put' && rule.optionalOnUpdate) continue;
    if (input === undefined || input === null || (typeof input === 'string' && !input.trim())) return { error: `El campo ${field} es obligatorio` };
    if (rule.type === 'integer') {
      const number = positiveInteger(input);
      if (number === null) return { error: `${field} debe ser un entero entre 1 y 2147483647` };
      values[field] = number;
    } else if (rule.type === 'price') {
      if (!['number', 'string'].includes(typeof input) || !/^\d+(\.\d+)?$/.test(String(input)) || !Number.isFinite(Number(input)) || Number(input) > 99999999.99) return { error: 'El precio debe ser un número entre 0 y 99999999.99' };
      values[field] = Math.round(Number(input) * 100) / 100;
    } else if (rule.type === 'date') {
      if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input) || input < '1000-01-01' || !Number.isFinite(Date.parse(input)) || new Date(`${input}T00:00:00Z`).toISOString().slice(0, 10) !== input) return { error: 'La fecha debe ser una fecha válida en formato AAAA-MM-DD' };
      values[field] = input;
    } else {
      if (typeof input !== 'string') return { error: `${field} debe ser texto` };
      const value = field === 'contrasena' ? input : input.trim();
      if ([...value].length > rule.max) return { error: `${field} no puede superar ${rule.max} caracteres` };
      if (rule.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return { error: 'El correo debe tener un formato válido' };
      values[field] = value;
    }
  }
  return { values };
}

const app = createApp();
module.exports = { app, pool, createApp };
