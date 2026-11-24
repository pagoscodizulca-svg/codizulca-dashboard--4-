# Manifiesto de Migración Técnica: Módulo `/portal/` hacia `Programa de Trade Marketing`

## 1. Propósito del Documento
Este manifiesto documenta la arquitectura, tablas de Supabase, columnas, buckets de Storage, funciones RPC, flujo de autenticación, almacenamiento offline (`localStorage`) y componentes React que utilizaba la ruta `/portal/*` dentro de **Dashboard de Gerencia**, con el fin de garantizar **compatibilidad exacta al 100%** al alojar el portal directamente en el proyecto **Programa de Trade Marketing**.

Ambos proyectos comparten la misma instancia de Supabase (**`"dashboard de gerencia"`**), por lo que todo registro capturado por las promotoras en **Programa de Trade Marketing** se reflejará en tiempo real en los módulos gerenciales de **Dashboard de Gerencia**.

---

## 2. Estado en `Dashboard de Gerencia`
1. **Bandera de Interfaz (`src/lib/portalMigrationConfig.ts`)**:
   - `SHOW_LEGACY_PORTAL_LINK = false` oculta todos los botones, tarjetas y enlaces a `/portal/*` en `Sidebar.tsx` y `TradeMarketing.tsx`.
2. **Redirección Segura Anti-*Open Redirect* (`src/components/layout/PortalMigrationRedirect.tsx`)**:
   - Las rutas `/portal` y `/portal/*` están interceptadas por `PortalMigrationRedirect`.
   - Lee `VITE_NEW_TRADE_PORTAL_URL` (y opcionalmente `VITE_NEW_TRADE_PORTAL_ALLOWED_HOSTS`).
   - Exige protocolo `https://`, prohíbe credenciales embebidas, IPs privadas/locales y esquemas peligrosos (`javascript:`, `data:`, `http:`), preserva únicamente subrutas válidas (`/login`, `/ruta`, `/asistencia`, `/encuestas`, `/inventario`, `/precios`, `/merchandising`, `/perfil`, `/checkin`) y filtra query params a la lista blanca (`email`, `user`, `promoter`).

---

## 3. Tablas, Columnas, RPCs y Buckets de Supabase Compartidos

### 3.1. Tabla `public.checkins` (Asistencia Híbrida / Check-In Fotográfico y GPS)
Usada por `src/lib/checkinsService.ts`, `src/lib/campoService.ts` y `src/pages/mobile/CampoAsistencia.tsx`:
- **Columnas principales**:
  - `id` (`uuid`, PK)
  - `date` (`text` / ISO 8601 timestamp en UTC, interpretado en `America/Caracas` `UTC-4`)
  - `store` (`text`): Almacena el nombre del PDV o un JSON serializado con metadatos de ranura:
    ```json
    {
      "__v": 2,
      "store": "ALKOSTO DONDE COMPRAR ES GANAR (BELLA VISTA)",
      "slot_foto": "JORNADA_INGRESO",
      "perfil_aplicado": "FIJA",
      "fecha_operativa": "2026-11-13",
      "promoter_id": "STF-001",
      "timestamp_servidor": "2026-11-13T12:15:00.000Z"
    }
    ```
  - `type` (`text`): `'Ingreso' | 'Salida a almorzar' | 'Vuelta a almorzar' | 'Salida'`
  - `photoUrl` (`text`): DataURL JPEG/WebP comprimido o URL firmada
  - `lat` (`float8`), `lng` (`float8`), `accuracy` (`float8`)
  - `promoter` (`text`): Nombre canónico en mayúsculas (ej. `'NICOLE GODOY'`)
  - `creatorId` (`text`): ID o correo de la promotora

### 3.2. Tablas `public.trade_promotoras` y `public.trade_asistencia_jornadas` (Control de 4 Turnos Diarios)
Usadas por `src/lib/tradeAttendanceService.ts` y `src/components/trade-marketing/TradeAttendanceTab.tsx`:
- **`public.trade_promotoras`**:
  - `id` (`uuid`, PK), `codigo_interno` (`text`, UNIQUE, ej. `'STF-001'`), `nombre_completo` (`text`), `cedula` (`text`), `telefono` (`text`), `email` (`text`), `tipo_contratacion` (`'fija' | 'eventual'`), `zona` (`text`), `pdv_habitual` (`text`), `activa` (`boolean`).
- **`public.trade_asistencia_jornadas`**:
  - `id` (`uuid`, PK), `promotora_id` (`uuid`, FK -> `trade_promotoras.id`), `fecha` (`date`, `UNIQUE(promotora_id, fecha)`), `pdv_asignado` (`text`), `tipo_contratacion_snapshot` (`'fija' | 'eventual'`).
  - Turno 1 (`manana_entrada`): `manana_entrada_foto_path`, `manana_entrada_hora`, `manana_entrada_comentario`, `manana_entrada_usuario_id`.
  - Turno 2 (`manana_salida`): `manana_salida_foto_path`, `manana_salida_hora`, `manana_salida_comentario`, `manana_salida_usuario_id`.
  - Turno 3 (`tarde_entrada`): `tarde_entrada_foto_path`, `tarde_entrada_hora`, `tarde_entrada_comentario`, `tarde_entrada_usuario_id`.
  - Turno 4 (`tarde_salida`): `tarde_salida_foto_path`, `tarde_salida_hora`, `tarde_salida_comentario`, `tarde_salida_usuario_id`.
  - `estado_jornada` (`'pendiente' | 'parcial' | 'completa' | 'observada'`), `observacion_general` (`text`).
- **Bucket Privado de Supabase Storage**:
  - Nombre: `trade-asistencia-fotos` (`public = false`, límite `2 MB`, MIME `image/webp`, `image/jpeg`, `image/png`).
  - Convención de ruta: `{YYYY-MM-DD}/{promotora_id}/{turno}_{timestamp}.webp`.
- **Función RPC Atómica**:
  - `public.rpc_registrar_turno_asistencia_trade(p_promotora_id, p_fecha, p_turno, p_foto_path, p_comentario, p_pdv_asignado, p_observacion_general)` (fija hora oficial `timezone('America/Caracas', now())`).

### 3.3. Tabla `public.prices` (Monitoreo de Precios y Competencia en PDV)
Usada por `src/pages/mobile/CampoPrecios.tsx` y `src/lib/campoService.ts`:
- **Columnas**:
  - `id` (`uuid`, PK)
  - `date` (`text`)
  - `store` (`text`)
  - `ourProduct` (`text`)
  - `ourPrice` (`numeric`)
  - `competitor1Brand` (`text`), `competitor1Price` (`numeric`)
  - `competitor2Brand` (`text`), `competitor2Price` (`numeric`)
  - `competitor3Brand` (`text`), `competitor3Price` (`numeric`)
  - `competitorBrand` (`text`), `competitorPrice` (`numeric`)
  - `comments` (`text`)
  - `creatorId` (`text`), `promoter` (`text`)

### 3.4. Tabla `public.inventory` (Aforo de Inventario y Rotación en PDV)
Usada por `src/pages/mobile/CampoInventario.tsx` y `src/lib/campoService.ts`:
- **Columnas**:
  - `id` (`uuid`, PK)
  - `date` (`text`)
  - `store` (`text`)
  - `product` (`text`)
  - `initialQuantity` (`numeric`)
  - `finalQuantity` (`numeric`)
  - `degustations` (`numeric`)
  - `comments` (`text`)
  - `creatorId` (`text`), `promoter` (`text`)

### 3.5. Tabla `public.surveys` (Encuestas de Degustación + Informes de Merchandising & Escaneo IA)
Usada por `src/pages/mobile/CampoEncuestas.tsx`, `src/pages/mobile/CampoMerchandising.tsx` y `src/lib/merchandisingService.ts`:
- **Columnas**:
  - `id` (`uuid`, PK)
  - `type` (`text`):
    - `'Rapida'` / `'Profunda'` / `'rapida'` / `'extendida'` para encuestas de degustación.
    - `'Merchandising'` para actas de visita de mercaderistas y escaneo IA de góndolas.
  - `date` (`text`)
  - `store` (`text`)
  - `promoter` (`text`)
  - `product` (`text`)
  - `rating` (`numeric`), `intent` (`text`)
  - `comments` (`text`): Texto libre o JSON estructurado (`isMerchandising: true`, `isShelfScan: true`, `activities`, `photos`, `signature`, `metrics`, `aiRecommendations`).
  - `creatorId` (`text`)

### 3.6. Tablas de Planificación, Nómina y Trazabilidad
- **`public.degustaciones`** (`src/lib/degustacionesService.ts`): Cronograma semanal de degustaciones (`id`, `date`, `time`, `client`, `zone`, `product`, `activity`, `promoter`, `promoterRole`, `vendedor`, `status`, `target`, `delivered`, `acceptanceRate`, `comments`).
- **`public.staff_members`** (`src/lib/staffService.ts`): Fichas de promotoras fijas, eventuales y mercaderistas (`id`, `name`, `role`, `category`, `status`, `phone`, `email`, `password`, `address`, `assignedStore`, `photoUrl`).
- **`public.connection_logs`** (`src/lib/trazabilidadService.ts`): Registro de inicios de sesión y telemetría GPS/IP.

---

## 4. Autenticación, Identidad y Persistencia Local (`localStorage`)

### 4.1. Claves de `localStorage` usadas por `/portal/`
| Clave | Propósito |
| :--- | :--- |
| `portal_active_promoter_obj` | Objeto JSON `PromoterProfile` de la promotora o coordinadora autenticada |
| `portal_active_promoter` | Nombre en texto plano de la promotora activa |
| `portal_auth_token` | Token de sesión local (`AUTH-...` o `AUTH-COORD-...`) |
| `portal_authenticated_user_id` | ID canónico de la promotora (`STF-001`..`STF-027` o `COORD-TM-01`) |
| `portal_sync_queue` | Cola offline-first (`SyncQueueItem[]`) para sincronización automática al recuperar red |
| `codizulca_bcv_rate_v3` | Última tasa oficial BCV cacheada en el dispositivo |
| `codizulca_custom_stores_v1` | Puntos de venta personalizados agregados desde campo |

### 4.2. Normalización de Identidad (`src/lib/campoService.ts`)
Para que los reportes subidos desde **Programa de Trade Marketing** coincidan con las fichas de **Dashboard de Gerencia**, se debe mantener la función `resolvePromoterNameFromRaw(rawPromoter, creatorId)` y el mapa `PROMOTER_CREATOR_MAP` que traduce correos y UIDs de Supabase Auth al nombre canónico en mayúsculas (ej. `'godoyaraujonicole@gmail.com'` -> `'NICOLE GODOY'`).

---

## 5. Inventario de Componentes Históricos Conservados en este Repositorio
Los siguientes archivos se conservan intactos como referencia histórica y fuente para `Programa de Trade Marketing`:
- Layout y Navegación Móvil:
  - `src/components/layout/CampoLayout.tsx`
- Vistas Móviles (`/portal/*`):
  - `src/pages/mobile/PortalLogin.tsx` (`/portal/login`)
  - `src/pages/mobile/CampoRuta.tsx` (`/portal/ruta`)
  - `src/pages/mobile/CampoAsistencia.tsx` (`/portal/asistencia` y `/portal/checkin`)
  - `src/pages/mobile/CampoEncuestas.tsx` (`/portal/encuestas`)
  - `src/pages/mobile/CampoInventario.tsx` (`/portal/inventario`)
  - `src/pages/mobile/CampoPrecios.tsx` (`/portal/precios`)
  - `src/pages/mobile/CampoMerchandising.tsx` (`/portal/merchandising`)
  - `src/pages/mobile/PortalPerfil.tsx` (`/portal/perfil`)
  - `src/pages/mobile/CheckIn.tsx` (vista histórica auxiliar)
- Servicios de Datos y Sincronización:
  - `src/lib/campoService.ts`
  - `src/lib/checkinsService.ts`
  - `src/lib/tradeAttendanceService.ts`
  - `src/lib/imageCompressor.ts`
  - `src/lib/merchandisingService.ts`
  - `src/lib/degustacionesService.ts`
  - `src/lib/staffService.ts`
