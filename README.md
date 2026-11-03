# API REST de la tienda

API con Node.js, Express y MySQL para las seis tablas existentes en
`db_tienda_oscar`. Devuelve JSON y no incluye una interfaz visual.

## Instalación y ejecución

```powershell
npm install
copy .env.example .env
```

Configura en `.env` el servidor, puerto, usuario, contraseña y nombre de tu base.
Si ya tienes `.env`, conserva tu configuración. `.env` no se sube a GitHub.
Las tablas deben existir previamente; la API no crea ni modifica su estructura.

```powershell
npm start
```

Para reiniciar automáticamente al editar código:

```powershell
npm run dev
```

Abre `http://localhost:3000/` para ver las rutas disponibles.
`GET /health` comprueba la conexión a MySQL.

## Recursos

| Ruta | Tabla | Clave primaria |
| --- | --- | --- |
| `/api/categorias` | `tb_categorias` | `pk_clave_cat` |
| `/api/productos` | `tb_productos` | `pk_clave_pro` |
| `/api/usuarios` | `tb_usuarios` | `pk_clave_usu` |
| `/api/estatuspedidos` | `tb_estatuspedidos` | `pk_clave_est` |
| `/api/pedidos` | `tb_pedidos` | `pk_clave_ped` |
| `/api/detallepedidos` | `tb_detallepedidos` | `pk_clave_det` |

Cada recurso tiene estas cinco operaciones (sustituye `recurso` por una ruta de la tabla):

| Método | Ruta | Resultado |
| --- | --- | --- |
| GET | `/api/recurso` | Lista de registros, ordenados por clave primaria |
| GET | `/api/recurso/:id` | Un registro |
| POST | `/api/recurso` | Crea un registro y responde 201 |
| PUT | `/api/recurso/:id` | Actualiza un registro y responde 200 |
| DELETE | `/api/recurso/:id` | Elimina un registro y responde 204 sin cuerpo |

## Cuerpos JSON para POST y PUT

Envía `Content-Type: application/json`. No envíes la clave primaria: MySQL la genera.
Los campos mostrados son obligatorios tanto al crear como al actualizar,
excepto `contrasena`, que puede omitirse en PUT para conservar la contraseña actual.
Los campos desconocidos se rechazan con 400.

**Categorías** — nombre de hasta 100 caracteres:

```json
{ "nombre": "Accesorios" }
```

**Productos** — nombre de hasta 150 caracteres, precio entre 0 y 99999999.99
(redondeado a dos decimales) y categoría existente:

```json
{ "nombre": "Teclado", "precio": 599.90, "fk_clave_cat": 1 }
```

**Usuarios** — nombre y correo de hasta 100 caracteres, correo único y contraseña
de hasta 255 caracteres:

```json
{ "nombre": "Usuario de ejemplo", "correo": "ejemplo@example.com", "contrasena": "Una clave de ejemplo" }
```

Las nuevas contraseñas se guardan como hash scrypt con sal aleatoria.
Las respuestas nunca incluyen `contrasena`. Los registros anteriores no se modifican
hasta que se envía una nueva contraseña. Este proyecto no incluye inicio de sesión
ni autorización; sus endpoints están disponibles para quien pueda acceder al servidor.

**Estatus de pedidos** — nombre de hasta 50 caracteres:

```json
{ "nombre": "Pendiente" }
```

**Pedidos** — usuario y estatus existentes, fecha válida en formato AAAA-MM-DD:

```json
{ "fk_clave_usu": 1, "fk_clave_est": 1, "fecha": "2026-11-03" }
```

**Detalle de pedidos** — pedido y producto existentes, cantidad entera positiva:

```json
{ "fk_clave_ped": 1, "fk_clave_pro": 1, "cantidad": 2 }
```

Los IDs, referencias y cantidades deben ser enteros entre 1 y 2147483647.
Los valores `1` de los ejemplos deben sustituirse por IDs que existan en tu base.
Crea primero categorías, usuarios y estatus; después productos y pedidos;
finalmente, sus detalles. MySQL impide borrar registros que tengan referencias.

## Ejemplos en PowerShell

```powershell
Invoke-RestMethod http://localhost:3000/api/categorias
Invoke-RestMethod http://localhost:3000/api/pedidos/1
Invoke-RestMethod http://localhost:3000/api/categorias -Method Post -ContentType 'application/json' -Body '{"nombre":"Accesorios"}'
```

## Errores

| Estado | Motivo |
| --- | --- |
| 400 | JSON, campos, ID o referencia inválidos |
| 404 | Ruta o registro inexistente |
| 409 | Correo duplicado o eliminación impedida por relaciones |
| 500 | Error interno o conexión a MySQL no disponible |

## Pruebas

```powershell
npm test
```

Las pruebas HTTP usan una base simulada y no modifican tu MySQL. Cubren las cinco
operaciones de cada recurso, validaciones, parámetros SQL, hashes de contraseñas,
registros inexistentes y errores de relaciones y duplicados.
