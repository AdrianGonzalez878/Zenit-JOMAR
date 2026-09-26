# ARGI · JOMAR — Bot de WhatsApp + panel admin

Asistente de WhatsApp con IA para **JOMAR**, inmobiliaria de terrenos en Puerto Escondido, Oaxaca.

- El negocio es **JOMAR**.
- La asistente se llama **ARGI**. Nunca se presenta como JOMAR.
- No hay tienda ni checkout. ARGI asesora, filtra lotes y agenda visita o llamada.
- No cierra ventas ni pide depósitos por WhatsApp.
- Nunca inventa precios, medidas ni disponibilidad: solo el catálogo en Supabase (`lots`).

Arquitectura clonada de Conchita Plata BOT (Next.js App Router, Supabase, Meta WhatsApp Cloud API, QStash, Anthropic, dashboard estilo WhatsApp claro), con **proyecto, número y URL propios**.

---

## Stack

| Capa | Tecnología |
|---|---|
| App | Next.js (App Router) en Vercel |
| Datos | Supabase (`conversations`, `messages`, `lots`) |
| WhatsApp | Meta WhatsApp Cloud API |
| Cola | Upstash QStash |
| IA | Anthropic Claude (Vercel AI SDK) |

**No reutilices** el número de Meta, el proyecto de Supabase ni la URL de Vercel de Conchita Plata BOT. Crea recursos nuevos y pégalos en `.env.local`.

---

## Arranque

```bash
cp .env.example .env.local
# llena credenciales NUEVAS
npm install
npm run dev
```

1. Crea un proyecto **nuevo** en [Supabase](https://supabase.com).
2. En SQL Editor ejecuta `supabase/schema.sql`.
3. Carga inventario y precios: `supabase/schema.sql` (o migración `003_lot_pricing.sql` si ya corriste el schema) y luego `supabase/seed_lots.sql`.
4. Crea un usuario en Authentication → Users para entrar al panel (`/login`).
5. En Meta, una app/número **nuevo**. Webhook: `https://TU-URL-VERCEL/api/whatsapp/webhook` con el `WHATSAPP_VERIFY_TOKEN` de `.env.local`.
6. QStash debe apuntar a esa misma URL pública (localhost no recibe el process).

PWA: en el teléfono, abre el panel en Safari/Chrome → **Agregar a pantalla de inicio**. El sitio va con `noindex`.

---

## Flujo de un mensaje

```
WhatsApp
  → POST /api/whatsapp/webhook     (200 inmediato a Meta)
  → QStash
  → POST /api/whatsapp/process
       ¿paused? → guarda mensaje + unread, no responde IA
       si no → lee lots en Supabase → Claude → WhatsApp
```

Pausar IA en el dashboard permite que un asesor responda a mano.

---

## Catálogo (`lots`)

Cada lote: código, zona/fraccionamiento, m², frente, fondo, precio, enganche, mensualidades, servicios (luz/agua/drenaje), estatus (`disponible` / `apartado` / `vendido`), fotos (`photo_urls`), Maps, notas de plusvalía.

Inventario (plano 27-08-26): 21 disponibles, 3 apartados, 4 vendidos.
Precios: tabla de preventa agosto 2026 (lista 24 MSI, enganche 10%, 36, 48, 12 meses al 4% y contado al 8%).
Ficha: `docs/zenit-comercial.md`.

Si un campo va `NULL`, ARGI dice que un **asesor lo confirma**. No inventa.

---

## Estructura

```
src/app/api/whatsapp/webhook|process
src/app/api/admin/...
src/app/dashboard          panel mínimo (lista, preview, unread, pausar IA)
src/lib/ai/prompts/system  identidad ARGI + reglas de inventario
src/lib/lots/catalog       formato del catálogo para la IA
supabase/schema.sql
```

Siguiente (cuando el inventario real esté listo): editor de lotes en el panel, tabla de citas y fotos públicas de cada terreno.
