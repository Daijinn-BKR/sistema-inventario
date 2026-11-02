# Inventario Omega Eléctrica

Sistema de inventario para el taller de una empresa eléctrica: varias personas registran entradas y salidas de materiales desde el celular o el PC, y todos ven los cambios **al instante**. Pensado para usuarios sin conocimientos de informática: se escanea el QR del producto, se indica la cantidad y listo.

> **Stack:** HTML + JavaScript (sin framework) · Supabase (PostgreSQL, Auth, Realtime) · PWA instalable · Electron (.exe de Windows) · GitHub Actions

## Características

- **Productos** con stock, ubicación, categoría, unidad y **alerta de stock bajo**
- **Entradas y salidas** con motivo y usuario; el historial no se puede borrar
- **Escaneo de QR / código de barras** con la cámara del celular
- **Tiempo real:** lo que registra una persona aparece en los demás dispositivos sin recargar
- **Stock consistente:** un trigger en PostgreSQL actualiza el stock dentro de la misma transacción, así que no se pierden descuentos si dos personas registran a la vez, y una salida nunca deja el stock en negativo
- **Seguridad:** inicio de sesión obligatorio y Row Level Security en todas las tablas
- Búsqueda, filtro por categoría y exportación a CSV (Excel)
- Tres formas de usarlo: navegador, **app de celular** (PWA) y **programa de Windows** (.exe)

## Guía para quienes lo usan

### En el celular (Android o iPhone)
1. Abre el enlace del inventario que te entregaron.
2. **Android (Chrome):** toca **Instalar app** (arriba) o menú ⋮ → *Instalar aplicación*.
   **iPhone (Safari):** botón Compartir → *Agregar a pantalla de inicio*.
3. Quedará un ícono "Inventario" en tu pantalla, como cualquier otra app.

### En el computador (Windows)
1. Descarga `Inventario-Omega-…-nsis.exe` desde la sección **Releases** de este repositorio y ábrelo (se instala solo y crea un acceso directo).
   También hay una versión `portable` que no necesita instalación.
2. Si Windows muestra "Windows protegió su PC", pulsa *Más información → Ejecutar de todas formas* (el programa no está firmado digitalmente).

### Uso diario
- **Retirar material:** botón **Escanear** → apunta al QR → cantidad → *Guardar*. (O busca el producto y toca **− Salida**.)
- **Llegó mercadería:** **+ Entrada** en el producto.
- **Corregir un error:** registra una entrada o salida con motivo "ajuste" (el stock solo cambia con movimientos, para que quede historial).

## Para quien lo instala y mantiene

### 1. Base de datos (Supabase)
1. Crea un proyecto gratis en [supabase.com](https://supabase.com).
2. **SQL Editor →** pega `schema.sql` → *Run*. Crea tablas, trigger de stock, reglas de seguridad y tiempo real.
3. **Authentication → Providers → Email:** desactiva *Allow new users to sign up*.
4. **Authentication → Users → Add user:** crea una cuenta por persona (marca *Auto Confirm User*).

### 2. Probar en tu PC
```bash
cp config.example.js config.js     # y completa URL y publishable key (Project Settings → API)
npm install
npm start                          # abre la versión de escritorio
# o la versión web:  python -m http.server 8000  →  http://localhost:8000
```
`config.js` está en `.gitignore`: tus claves no se suben al repositorio.

### 3. Publicar (GitHub)
En el repositorio: **Settings → Secrets and variables → Actions → New repository secret**, y crea:

| Secreto | Valor |
|---|---|
| `SUPABASE_URL` | la *Project URL* de Supabase |
| `SUPABASE_KEY` | la *publishable (anon) key* |

- **Web / app de celular:** **Settings → Pages → Source: GitHub Actions**. Cada push a `main` publica la web (HTTPS, necesario para la cámara y para instalar la app).
- **Programa de Windows:** crea una versión y GitHub compila el `.exe` solo:
  ```bash
  git tag v1.0.0
  git push origin v1.0.0
  ```
  A los pocos minutos aparece en **Releases** con el instalador y la versión portable.

> La *publishable key* está pensada para ser pública (queda dentro de cualquier web o app). Los datos los protege el inicio de sesión y las políticas RLS de `schema.sql`, no el secreto de la clave.

## Estructura

| Archivo | Función |
|---|---|
| `index.html`, `app.js` | Interfaz y lógica (misma base para web, celular y escritorio) |
| `schema.sql` | Tablas, trigger de stock, RLS, realtime |
| `manifest.webmanifest`, `sw.js`, `icons/` | App instalable (PWA) |
| `main.js`, `package.json`, `build/` | Ventana de escritorio con Electron y empaquetado .exe |
| `.github/workflows/` | Publicación de la web y compilación del .exe |
| `config.example.js` | Plantilla de configuración |

## Ideas a futuro
Roles de usuario, fotos de productos, impresión de etiquetas QR desde la app, aviso por correo o WhatsApp al llegar al stock mínimo, versión APK con Capacitor.

## Licencia
MIT
