# Guía de Estilos — Archery Reservas PWA

## Tipografía

| Variable | Fuente | Uso |
|---|---|---|
| `--font-body` | **Inter** (Google Fonts) | Texto general, párrafos, labels |
| `--font-heading` | **Poppins 500/600/700** | Títulos h1–h6 |

Tailwind: `font-sans` = body, `font-heading` = encabezados.

---

## Paleta de Colores

| Token Tailwind | Hex | Uso |
|---|---|---|
| `bg` | `#F8F9FA` | Fondo de la app |
| `card` | `#FFFFFF` | Fondo de tarjetas |
| `textpri` | `#1F2937` | Texto principal |
| `textsec` | `#6B7280` | Texto secundario, labels |
| `accent` | `#F97316` | Botones primarios, highlights |
| `success` | `#22C55E` | Estados positivos (asistió, activo) |
| `danger` | `#EF4444` | Errores, eliminar |
| `warning` | `#F59E0B` | Alertas, notas |
| `info` | `#38BDF8` | Información, ya reservado |
| `line` | `#E5E7EB` | Bordes, separadores |

### Reglas de Color
- **Texto primario**: `text-textpri` — NUNCA `text-white`, `text-black` ni `text-slate-*`
- **Texto secundario**: `text-textsec` — NUNCA `text-gray-*`, `text-slate-300/400/500`
- **Fondos de tarjeta**: `bg-card` — NUNCA `bg-gray-800`, `bg-slate-*`
- **Fondos internos**: `bg-bg/40` o `bg-white/5`
- **Bordes**: `border-line` (sólido) o `border-white/10` (sutil)
- **Badges de estado**: usar los tokens semánticos (`success`, `danger`, `warning`, `info`)

---

## Componentes CSS

### Botones

```
.btn         → Primario (accent, texto blanco, sombra)
.btn-outline → Secundario (borde line, fondo blanco)
.btn-ghost   → Terciario (fondo transparente, borde sutil)
.btn-sm      → Modificador de tamaño (texto más pequeño, padding reducido)
```

### Tarjetas

```
.card → rounded-2xl, border-line, bg-card, shadow-card
```

### Inputs

```
.input → rounded-xl, border-line, bg-white, focus:accent
```

---

## Sombras

| Token | Valor | Uso |
|---|---|---|
| `shadow-soft` | `0 10px 30px rgba(15,23,42,0.06)` | Elevación mayor |
| `shadow-card` | `0 4px 12px rgba(15,23,42,0.05)` | Cards, botones |

---

## Espaciado y Layout

- Cards principales: `p-5` o `p-6`
- Cards internas: `rounded-2xl border border-white/10 bg-bg/40 p-4`
- Separación entre secciones: `space-y-6`
- Grid responsivo: `grid gap-4 sm:grid-cols-2 xl:grid-cols-3`

---

## Patrones de UI

### Section Card
```tsx
<section className="rounded-3xl border border-white/10 bg-card p-5">
  <h2 className="text-lg font-semibold text-textpri">Título</h2>
  <div className="mt-4">...</div>
</section>
```

### Items en listas
```tsx
<div className="rounded-2xl border border-white/10 bg-bg/40 p-4">
  <p className="font-medium text-textpri">Nombre</p>
  <p className="mt-1 text-sm text-textsec">Detalle</p>
</div>
```

### Badges de estado
```tsx
<span className="rounded-full px-3 py-1 text-xs font-medium bg-emerald-500/15 text-emerald-300">
  activo
</span>
```
Tonos: `emerald` (positivo), `blue` (pendiente), `red` (negativo/expirado).

### Paginación
```tsx
<div className="mt-4 flex items-center justify-between text-sm">
  <span className="text-textsec">1/3</span>
  <div className="flex gap-2">
    <button className="btn-outline !px-3 !py-1 text-xs">← Ant</button>
    <button className="btn-outline !px-3 !py-1 text-xs">Sig →</button>
  </div>
</div>
```

### Stats cards
```tsx
<div className="card p-4">
  <p className="text-sm text-textsec">Label</p>
  <p className="mt-2 text-3xl font-bold text-textpri">42</p>
</div>
```

### Labels de formulario
```tsx
<label className="text-xs uppercase tracking-[0.16em] text-textsec">Campo</label>
```
O la versión simple: `text-sm font-medium text-textsec`

### Modales
```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
  <div className="w-full max-w-md rounded-2xl border border-white/10 bg-card p-6 shadow-xl">
    <h3 className="mb-4 text-lg font-semibold text-textpri">Título</h3>
    ...
  </div>
</div>
```

---

## Anti-patrones (PROHIBIDO)

| ❌ Prohibido | ✅ Usar en su lugar |
|---|---|
| `text-white` (en fondos claros) | `text-textpri` |
| `text-slate-300/400/500` | `text-textsec` |
| `bg-gray-800` | `bg-card` o `bg-bg/40` |
| `border-gray-700` | `border-white/10` o `border-line` |
| `style={{ backgroundColor: 'var(--accent-color)' }}` | clase `btn` |
| `window.alert()` | `toast.push({ message, type })` |
| `window.location.reload()` | React Query `invalidateQueries()` |
| `window.confirm()` | `useConfirm()` hook |
| Colores hardcoded (`#334155`, etc.) | Tokens del sistema |

---

## Feedback al usuario

| Tipo | Herramienta |
|---|---|
| Éxito/Error/Info | `useToast().push({ message, type: 'success' \| 'error' })` |
| Confirmación destructiva | `useConfirm()` → retorna `Promise<boolean>` |
| Loading inline | `<Spinner />` component |
