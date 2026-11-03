const express = require('express');
const pool = require('./db');

const app = express();

app.use(express.json());

app.get('/health', async (req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    next(error);
  }
});

app.get('/api/productos', async (req, res, next) => {
  try {
    const [productos] = await pool.query(
      'SELECT pk_clave_pro, nombre, precio FROM tb_productos ORDER BY pk_clave_pro'
    );
    res.json(productos);
  } catch (error) {
    next(error);
  }
});

app.get('/api/productos/:id', async (req, res, next) => {
  try {
    const id = parseProductId(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'El id debe ser un entero positivo' });
    }

    const [productos] = await pool.execute(
      'SELECT pk_clave_pro, nombre, precio FROM tb_productos WHERE pk_clave_pro = ?',
      [id]
    );

    if (productos.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json(productos[0]);
  } catch (error) {
    next(error);
  }
});

app.post('/api/productos', async (req, res, next) => {
  try {
    const producto = validateProduct(req.body);
    if (producto.error) {
      return res.status(400).json({ error: producto.error });
    }

    const [result] = await pool.execute(
      'INSERT INTO tb_productos (nombre, precio) VALUES (?, ?)',
      [producto.nombre, producto.precio]
    );
    const [productos] = await pool.execute(
      'SELECT pk_clave_pro, nombre, precio FROM tb_productos WHERE pk_clave_pro = ?',
      [result.insertId]
    );

    res.status(201).json(productos[0]);
  } catch (error) {
    next(error);
  }
});

app.put('/api/productos/:id', async (req, res, next) => {
  try {
    const id = parseProductId(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'El id debe ser un entero positivo' });
    }

    const producto = validateProduct(req.body);
    if (producto.error) {
      return res.status(400).json({ error: producto.error });
    }

    const [result] = await pool.execute(
      'UPDATE tb_productos SET nombre = ?, precio = ? WHERE pk_clave_pro = ?',
      [producto.nombre, producto.precio, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const [productos] = await pool.execute(
      'SELECT pk_clave_pro, nombre, precio FROM tb_productos WHERE pk_clave_pro = ?',
      [id]
    );
    res.json(productos[0]);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/productos/:id', async (req, res, next) => {
  try {
    const id = parseProductId(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'El id debe ser un entero positivo' });
    }

    const [result] = await pool.execute(
      'DELETE FROM tb_productos WHERE pk_clave_pro = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: 'Error interno del servidor' });
});

function parseProductId(value) {
  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function validateProduct(body) {
  if (!body || typeof body.nombre !== 'string' || body.nombre.trim() === '') {
    return { error: 'El campo nombre es obligatorio' };
  }

  if (
    body.precio === undefined ||
    body.precio === null ||
    (typeof body.precio === 'string' && body.precio.trim() === '')
  ) {
    return { error: 'El campo precio es obligatorio' };
  }

  if (body.nombre.trim().length > 150) {
    return { error: 'El nombre no puede superar 150 caracteres' };
  }

  const precio = Number(body.precio);
  if (!Number.isFinite(precio) || precio < 0 || precio > 99999999.99) {
    return { error: 'El precio debe ser un número entre 0 y 99999999.99' };
  }

  return {
    nombre: body.nombre.trim(),
    precio: Math.round(precio * 100) / 100
  };
}

module.exports = { app, pool };
