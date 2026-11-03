// Esquema explícito de las tablas existentes en db_tienda_oscar.
module.exports = {
  categorias: {
    table: 'tb_categorias', key: 'pk_clave_cat',
    fields: { nombre: { type: 'text', max: 100 } }
  },
  productos: {
    table: 'tb_productos', key: 'pk_clave_pro',
    fields: {
      nombre: { type: 'text', max: 150 },
      precio: { type: 'price' },
      fk_clave_cat: { type: 'integer' }
    }
  },
  usuarios: {
    table: 'tb_usuarios', key: 'pk_clave_usu',
    fields: {
      nombre: { type: 'text', max: 100 },
      correo: { type: 'email', max: 100 },
      contrasena: { type: 'text', max: 255, optionalOnUpdate: true }
    }
  },
  estatuspedidos: {
    table: 'tb_estatuspedidos', key: 'pk_clave_est',
    fields: { nombre: { type: 'text', max: 50 } }
  },
  pedidos: {
    table: 'tb_pedidos', key: 'pk_clave_ped',
    fields: {
      fk_clave_usu: { type: 'integer' },
      fk_clave_est: { type: 'integer' },
      fecha: { type: 'date' }
    }
  },
  detallepedidos: {
    table: 'tb_detallepedidos', key: 'pk_clave_det',
    fields: {
      fk_clave_ped: { type: 'integer' },
      fk_clave_pro: { type: 'integer' },
      cantidad: { type: 'integer' }
    }
  }
};
