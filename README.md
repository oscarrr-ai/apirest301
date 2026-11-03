# API REST de productos

API REST sencilla construida con Node.js, Express y `mysql2` para la tabla
`db_tienda_oscar.tb_productos`.

## Instalación

```bash
npm install
```

Copia `.env.example` como `.env` y configura las credenciales de MySQL:

```bash
copy .env.example .env
```

La tabla debe existir previamente con la definición proporcionada:

```sql
USE db_tienda_oscar;

CREATE TABLE tb_productos (
  pk_clave_pro int NOT NULL AUTO_INCREMENT,
  nombre varchar(150) NOT NULL,
  precio decimal(10,2) NOT NULL,
  PRIMARY KEY (pk_clave_pro)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## Ejecución

```bash
npm start
```

Para desarrollo:

```bash
npm run dev
```

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Comprueba que la API y MySQL estén disponibles |
| GET | `/api/productos` | Lista todos los productos |
| GET | `/api/productos/:id` | Obtiene un producto |
| POST | `/api/productos` | Crea un producto |
| PUT | `/api/productos/:id` | Actualiza un producto |
| DELETE | `/api/productos/:id` | Elimina un producto |

Ejemplo de cuerpo para `POST` y `PUT`:

```json
{
  "nombre": "Teclado",
  "precio": 599.90
}
```
