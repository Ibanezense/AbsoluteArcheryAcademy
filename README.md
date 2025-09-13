
# Absolute Archery – PWA de Reservas (Next.js + Supabase)

Este proyecto es un **MVP funcional** para que tus alumnos reserven clases de tiro con arco desde una **Web App instalable (PWA)**.

Incluye:
- Login (email/contraseña con Supabase Auth)
- Dashboard con datos de membresía y próximas reservas
- Pantalla para **reservar por fecha** con cupos y botón **Reservar**
- Pantalla de **confirmación de reserva**
- Modelo de datos + SQL: tablas, vistas, políticas RLS y **funciones RPC** atómicas (`book_session`, `cancel_booking`)

---

## 1) Crea tu proyecto en Supabase
1. Entra a https://supabase.com → Sign Up → New Project.
2. Copia **Project URL** y **anon/public API key**.

**En la pestaña SQL Editor** pega y ejecuta todo el contenido de `supabase_schema.sql` (incluye tablas, políticas y funciones).

> **Nota:** Puedes crear perfiles iniciales y sesiones de ejemplo desde la UI de Table Editor.

---

## 2) Configura variables de entorno
Crea un archivo `.env.local` en la raíz del proyecto con:

```
NEXT_PUBLIC_SUPABASE_URL=TU_URL_DE_SUPABASE
NEXT_PUBLIC_SUPABASE_ANON_KEY=TU_ANON_KEY
```

---

## 3) Ejecuta el proyecto localmente
```bash
npm install
npm run dev
```
Abre http://localhost:3000

---

## 4) Flujo de prueba
1. **Crea un usuario** desde la pestaña **Authentication** de Supabase (o regístrate desde la UI si habilitas Sign-Up).
2. En **profiles**, pon `full_name`, `membership_type` y `classes_remaining` > 0, y fechas de inicio/fin.
3. En **sessions**, crea clases con `start_at`, `end_at`, `capacity`, `status='scheduled'` y opcionalmente `coach_id`.
4. Inicia sesión en `/login`, entra a **Reservar**, elige una fecha con sesiones y presiona **Reservar**.
5. Serás redirigido a la **confirmación** con los datos de la reserva.

- La función `book_session(p_session uuid)` valida cupos, fecha futura y **descuenta 1 crédito**.
- `cancel_booking(p_booking uuid)` cancela y **devuelve crédito** si faltan **≥12h** para la clase.

---

## 5) Estructura básica
- `app/login/page.tsx` → Login.
- `app/page.tsx` → Inicio/Dashboard del alumno.
- `app/reservar/page.tsx` → Listado de sesiones por fecha + botón Reservar.
- `app/reserva/[id]/page.tsx` → Confirmación de reserva.
- `components/NavBar.tsx` → Menú inferior.
- `lib/supabaseClient.ts` → Cliente Supabase en el navegador.
- `supabase_schema.sql` → Tablas, vistas, RLS y funciones.

---

## 6) Personalización posterior
- Estilos: `tailwind.config.js` y `app/globals.css` (tema oscuro acorde a tus mockups).
- Agrega reglas de negocio: máximos por semana, lista de espera, bloqueo de solapamientos, etc.
- Integra **Web Push** y/o **WhatsApp Cloud API** para recordatorios de reservas.

---

## 7) Deploy
- **Vercel**: crea un proyecto, conecta el repo y define `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en **Environment Variables**.
- Habilita **PWA** más adelante (Workbox o `next-pwa`).

---

## 8) Soporte
Si necesitas, te guío para añadir **página de Admin/Coach** (crear sesiones, pasar asistencia, ver no-shows) y **pagos** (Culqi / Mercado Pago).
