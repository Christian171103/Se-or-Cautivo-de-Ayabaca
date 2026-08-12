# Cancionero Señor Cautivo — versión lista para GitHub Pages

Esta versión está preparada para subir **los archivos directamente a la raíz del repositorio**. No subas el ZIP como un solo archivo: primero descomprímelo y sube su contenido.

## Qué incluye

- `index.html`: cancionero público.
- `admin.html`: panel privado para crear, editar y eliminar canciones.
- `canciones.js`: las canciones iniciales; sirve como respaldo y para la primera importación.
- `script.js`: buscador, reproductor y generación del libro PDF.
- `admin.js`: lógica del panel privado.
- `data-service.js`: conexión entre la web y Supabase.
- `config.js`: aquí se pegan la URL y la clave pública de Supabase.
- `supabase.sql`: crea la tabla y permisos de la base de datos.
- `style.css`: diseño de la web y del panel.
- `enhancements.js`: favoritos, compartir, tamaño de letra y modo nocturno.
- `manifest.webmanifest` y `service-worker.js`: instalación y funcionamiento sin conexión después de la primera visita.

## Experiencia renovada

- Diseño pensado primero para celular y adaptado a pantallas amplias.
- Navegación pública limpia; la administración continúa disponible directamente en `admin.html`.
- Canciones favoritas guardadas en el dispositivo.
- Enlaces para compartir y abrir directamente cada canción.
- Tamaño de letra regulable y modo nocturno.
- Imágenes WebP ligeras para conexiones móviles.
- Charango y Zampoña con controles más cómodos para ensayar en celular y laptop.

## PARTE 1 — Crear la base de datos (solo una vez)

1. Entra a Supabase y crea un proyecto.
2. Dentro del proyecto abre **SQL Editor**.
3. Abre `supabase.sql`, copia todo su contenido, pégalo en SQL Editor y pulsa **Run**.
4. Ve a **Authentication > Users** y crea tu único usuario (correo + contraseña).
5. Ve a la configuración/API de tu proyecto y copia:
   - Project URL
   - anon/public key (o Publishable key, según lo que muestre tu panel)
6. Abre `config.js` y reemplaza:

```js
supabaseUrl: "PEGA_AQUI_TU_SUPABASE_URL",
supabaseAnonKey: "PEGA_AQUI_TU_SUPABASE_ANON_KEY"
```

Nunca pongas una `service_role`/secret key en GitHub.

## PARTE 2 — Subirlo a GitHub

1. En GitHub abre el repositorio `CANCIONERO-DE-CAUTIVO`.
2. Pulsa **Add file > Upload files**.
3. Descomprime este paquete en tu PC.
4. Selecciona **todos los archivos que están dentro de la carpeta**, no la carpeta ZIP.
5. Arrástralos a GitHub. `index.html` debe quedar visible en la página principal del repositorio, junto a `admin.html`, `style.css`, etc.
6. Pulsa **Commit changes**.
7. Ve a **Settings > Pages**.
8. En **Build and deployment**, selecciona **Deploy from a branch**.
9. Branch: `main`. Folder: `/ (root)`.
10. Guarda y espera uno o dos minutos.

La página pública será aproximadamente:
`https://TU-USUARIO.github.io/CANCIONERO-DE-CAUTIVO/`

El panel privado será:
`https://TU-USUARIO.github.io/CANCIONERO-DE-CAUTIVO/admin.html`

## PARTE 3 — Importar tus canciones (solo una vez)

1. Abre `admin.html` desde tu página publicada.
2. Inicia sesión con el usuario creado en Supabase.
3. Pulsa **Importar canciones iniciales**.
4. Confirma.
5. El sistema importará las canciones de `canciones.js` a la base de datos.

El botón bloquea una segunda importación cuando la tabla ya tiene canciones, para evitar duplicados.

## Desde ese momento

Ya no necesitas entrar a GitHub para cambiar canciones. Desde `admin.html` puedes:

- agregar canciones;
- editar título y letra;
- eliminar canciones;
- cambiar enlace de YouTube;
- indicar minuto y segundo de inicio;
- cambiar orden y categoría;
- marcar canciones como destacadas.

El botón **Generar libro para imprimir** crea 4 páginas A6 dentro de cada hoja A4, ya impuestas para el sistema de cortar y apilar. Imprime a una sola cara, al 100 %, sin encabezados ni pies. Después corta el bloque completo en cuatro y apila: superior izquierdo → superior derecho → inferior izquierdo → inferior derecho. El cancionero queda consecutivo y listo para engrapar.

## Si todavía no configuras Supabase

La página pública seguirá mostrando las canciones de `canciones.js` como respaldo. El panel administrativo no permitirá guardar cambios hasta completar la configuración de Supabase.
