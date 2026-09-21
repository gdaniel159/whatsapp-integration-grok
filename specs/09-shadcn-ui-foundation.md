# 09 — shadcn/ui foundation

## Objetivo
Integrar **shadcn/ui** (estilo **new-york**, baseColor **slate**, CSS variables) en `apps/web` existente (Next 14 App Router). No se crea un frontend nuevo. Sin cambios Prisma/API.

## Decisiones
| Ítem | Valor |
|------|--------|
| Style | `new-york` |
| baseColor | `slate` |
| cssVariables | `true` |
| RSC | sí (`components.json`) |
| Aliases | `@/components`, `@/components/ui`, `@/lib/utils` |
| Toasts | `sonner` vía `<Toaster />` en `Providers` |
| Acento WA | paleta `brand` (verdes) usada con moderación en CTAs / burbujas OUT / tags |

## Componentes (`src/components/ui/`)
Button, Input, Textarea, Select, Badge, Switch, Card, Separator, ScrollArea, Tooltip, Dialog, Sheet, DropdownMenu, Avatar, Skeleton, Sonner (+ Label de apoyo).

## Tema
- Variables shadcn en `globals.css`; se conserva `html,body { overflow:hidden; height:100% }` para el shell de chat.
- `tailwind.config.ts`: colores semánticos shadcn + `brand` + plugin `tailwindcss-animate`.
- Look SaaS/CRM (slate); verde solo donde aporta identidad WhatsApp.

## Refactors UI (comportamiento intacto)
- Header: nav con `Button`, auto-reply con `Switch` + `Badge` ON/OFF, `StatusBadge` → `Badge`.
- Contactos: `Card` / `Select` / `Textarea` / `Input` / `Badge` / `Skeleton`; PATCH comercial (`leadStatus`, `notes`, `tags`) sin cambios de lógica.
- Chats: controles con shadcn; **sin** alterar `h-dvh`, scroll solo de mensajes, composer fijo, fade superior, botón ↓ Nuevos, autoscroll.
- KB + Simulador: `Card` + formularios shadcn + toasts Sonner en guardados/simulación.
- Login: `Card` + `Input` + `Button`.

## Validación
`pnpm --filter @wig/web build` (y lint si aplica).
