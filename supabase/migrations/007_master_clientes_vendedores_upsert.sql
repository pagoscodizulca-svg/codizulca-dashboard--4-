-- =============================================================================
-- MIGRACIÓN 007: MOTOR DE ACTUALIZACIÓN SEGURA (UPSERT) DE CLIENTES Y VENDEDORES
-- Sistema Unificado: Dashboard de Gerencia <-> Dashboard de Ventas / Planificador
-- PROHIBIDO USAR DELETE MASIVO: Todo cambio aplica ON CONFLICT DO UPDATE y baja lógica.
-- =============================================================================

BEGIN;

-- 1. TABLA MAESTRA DE VENDEDORES Y RUTAS COMERCIALES
CREATE TABLE IF NOT EXISTS public.vendedores_maestro (
  vendedor_id TEXT PRIMARY KEY,
  codigo_erp TEXT,
  nombre_canonico TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  ruta_oficial TEXT NOT NULL,
  aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  supervisor TEXT NOT NULL DEFAULT 'NELSON FINOL',
  zona TEXT NOT NULL DEFAULT 'MARACAIBO',
  region TEXT NOT NULL DEFAULT 'OCCIDENTE',
  role TEXT NOT NULL DEFAULT 'VENDEDOR',
  is_supervisor_route BOOLEAN NOT NULL DEFAULT false,
  incluir_en_volumen BOOLEAN NOT NULL DEFAULT true,
  meta_activacion INTEGER NOT NULL DEFAULT 0,
  meta_volumen NUMERIC(14, 2) NOT NULL DEFAULT 0,
  email TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendedores_maestro_supervisor ON public.vendedores_maestro (supervisor);
CREATE INDEX IF NOT EXISTS idx_vendedores_maestro_activo ON public.vendedores_maestro (activo);

-- 2. TABLA MAESTRA DE CLIENTES (SOPORTA SUJECIÓN POR RUTA + CLIENTE PARA IDs COMPARTIDOS EJ. 8377)
CREATE TABLE IF NOT EXISTS public.clientes_maestro (
  composite_key TEXT PRIMARY KEY, -- Formato: <RUTA_VENDEDOR>::<CLIENTE_CODIGO>
  cliente_codigo TEXT NOT NULL,
  razon_social TEXT NOT NULL,
  rif TEXT DEFAULT 'PENDIENTE',
  sucursal TEXT DEFAULT 'PRINCIPAL',
  direccion TEXT DEFAULT '',
  tipo_cliente TEXT DEFAULT 'POR CLASIFICAR',
  vendedor_id TEXT,
  vendedor_nombre TEXT NOT NULL,
  vendedor_canonico TEXT NOT NULL,
  supervisor TEXT NOT NULL DEFAULT 'NELSON FINOL',
  zona TEXT NOT NULL DEFAULT 'ZULIA',
  region TEXT NOT NULL DEFAULT 'OCCIDENTE',
  latitud DOUBLE PRECISION,
  longitud DOUBLE PRECISION,
  frecuencia_visita TEXT DEFAULT 'SEMANAL',
  dia_visita TEXT DEFAULT '',
  estatus TEXT NOT NULL DEFAULT 'ACTIVO',
  activo BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clientes_maestro_codigo ON public.clientes_maestro (cliente_codigo);
CREATE INDEX IF NOT EXISTS idx_clientes_maestro_vendedor ON public.clientes_maestro (vendedor_canonico);
CREATE INDEX IF NOT EXISTS idx_clientes_maestro_supervisor ON public.clientes_maestro (supervisor);
CREATE INDEX IF NOT EXISTS idx_clientes_maestro_activo ON public.clientes_maestro (activo);

-- 3. EXTENSIÓN NO DESTRUCTIVA DE public.activacion_clientes
ALTER TABLE IF EXISTS public.activacion_clientes
  ADD COLUMN IF NOT EXISTS rif TEXT DEFAULT 'PENDIENTE',
  ADD COLUMN IF NOT EXISTS tipo_cliente TEXT DEFAULT 'POR CLASIFICAR',
  ADD COLUMN IF NOT EXISTS direccion TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS sucursal TEXT DEFAULT 'PRINCIPAL',
  ADD COLUMN IF NOT EXISTS supervisor TEXT DEFAULT 'NELSON FINOL',
  ADD COLUMN IF NOT EXISTS zona TEXT DEFAULT 'ZULIA',
  ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_activacion_clientes_periodo_vendedor_codigo
  ON public.activacion_clientes (periodo, vendedor_nombre, cliente_codigo);

-- 4. TABLA DE METADATOS DE SINCRONIZACIÓN E INVALIDACIÓN DE CACHÉ ENTRE DASHBOARDS
CREATE TABLE IF NOT EXISTS public.catalog_sync_meta (
  id TEXT PRIMARY KEY DEFAULT 'MASTER_CATALOG',
  sync_version BIGINT NOT NULL DEFAULT 1,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_clientes_activos INTEGER NOT NULL DEFAULT 0,
  total_clientes_unicos INTEGER NOT NULL DEFAULT 0,
  total_vendedores_activos INTEGER NOT NULL DEFAULT 0,
  source_hash TEXT DEFAULT ''
);

INSERT INTO public.catalog_sync_meta (id, sync_version, last_synced_at)
VALUES ('MASTER_CATALOG', 1, now())
ON CONFLICT (id) DO NOTHING;

-- 5. FUNCIÓN RPC DE UPSERT MASIVO PARA VENDEDORES (ON CONFLICT DO UPDATE)
CREATE OR REPLACE FUNCTION public.fn_upsert_vendedores_maestro(p_rows JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_upserted INTEGER := 0;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_rows debe ser un arreglo JSON');
  END IF;

  INSERT INTO public.vendedores_maestro (
    vendedor_id,
    codigo_erp,
    nombre_canonico,
    display_name,
    ruta_oficial,
    aliases,
    supervisor,
    zona,
    region,
    role,
    is_supervisor_route,
    incluir_en_volumen,
    meta_activacion,
    meta_volumen,
    email,
    activo,
    updated_at
  )
  SELECT
    TRIM(COALESCE(r->>'vendedor_id', r->>'nombre_canonico')),
    TRIM(COALESCE(r->>'codigo_erp', '')),
    UPPER(TRIM(COALESCE(r->>'nombre_canonico', ''))),
    TRIM(COALESCE(r->>'display_name', r->>'nombre_canonico', '')),
    UPPER(TRIM(COALESCE(r->>'ruta_oficial', r->>'nombre_canonico', ''))),
    COALESCE(r->'aliases', '[]'::jsonb),
    UPPER(TRIM(COALESCE(r->>'supervisor', 'NELSON FINOL'))),
    TRIM(COALESCE(r->>'zona', 'MARACAIBO')),
    TRIM(COALESCE(r->>'region', 'OCCIDENTE')),
    UPPER(TRIM(COALESCE(r->>'role', 'VENDEDOR'))),
    COALESCE((r->>'is_supervisor_route')::boolean, false),
    COALESCE((r->>'incluir_en_volumen')::boolean, true),
    COALESCE((r->>'meta_activacion')::integer, 0),
    COALESCE((r->>'meta_volumen')::numeric, 0),
    NULLIF(TRIM(COALESCE(r->>'email', '')), ''),
    COALESCE((r->>'activo')::boolean, true),
    now()
  FROM jsonb_array_elements(p_rows) AS r
  WHERE TRIM(COALESCE(r->>'nombre_canonico', '')) <> ''
  ON CONFLICT (vendedor_id) DO UPDATE SET
    codigo_erp = EXCLUDED.codigo_erp,
    nombre_canonico = EXCLUDED.nombre_canonico,
    display_name = EXCLUDED.display_name,
    ruta_oficial = EXCLUDED.ruta_oficial,
    aliases = EXCLUDED.aliases,
    supervisor = EXCLUDED.supervisor,
    zona = EXCLUDED.zona,
    region = EXCLUDED.region,
    role = EXCLUDED.role,
    is_supervisor_route = EXCLUDED.is_supervisor_route,
    incluir_en_volumen = EXCLUDED.incluir_en_volumen,
    meta_activacion = CASE WHEN EXCLUDED.meta_activacion > 0 THEN EXCLUDED.meta_activacion ELSE public.vendedores_maestro.meta_activacion END,
    meta_volumen = CASE WHEN EXCLUDED.meta_volumen > 0 THEN EXCLUDED.meta_volumen ELSE public.vendedores_maestro.meta_volumen END,
    email = COALESCE(EXCLUDED.email, public.vendedores_maestro.email),
    activo = EXCLUDED.activo,
    updated_at = now();

  GET DIAGNOSTICS v_upserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'upserted_count', v_upserted,
    'synced_at', now()
  );
END;
$$;

-- 6. FUNCIÓN RPC DE UPSERT MASIVO PARA CLIENTES (ON CONFLICT DO UPDATE, CERO DELETE)
CREATE OR REPLACE FUNCTION public.fn_upsert_clientes_maestro(p_rows JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_upserted INTEGER := 0;
  v_active_total INTEGER := 0;
  v_unique_clients INTEGER := 0;
  v_active_sellers INTEGER := 0;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_rows debe ser un arreglo JSON');
  END IF;

  INSERT INTO public.clientes_maestro (
    composite_key,
    cliente_codigo,
    razon_social,
    rif,
    sucursal,
    direccion,
    tipo_cliente,
    vendedor_id,
    vendedor_nombre,
    vendedor_canonico,
    supervisor,
    zona,
    region,
    latitud,
    longitud,
    frecuencia_visita,
    dia_visita,
    estatus,
    activo,
    updated_at
  )
  SELECT
    UPPER(TRIM(COALESCE(r->>'composite_key', (r->>'vendedor_nombre') || '::' || (r->>'cliente_codigo')))),
    TRIM(COALESCE(r->>'cliente_codigo', '')),
    UPPER(TRIM(REGEXP_REPLACE(COALESCE(r->>'razon_social', ''), '\s+', ' ', 'g'))),
    UPPER(TRIM(COALESCE(NULLIF(r->>'rif', ''), 'PENDIENTE'))),
    UPPER(TRIM(COALESCE(NULLIF(r->>'sucursal', ''), 'PRINCIPAL'))),
    TRIM(COALESCE(r->>'direccion', '')),
    UPPER(TRIM(COALESCE(NULLIF(r->>'tipo_cliente', ''), 'POR CLASIFICAR'))),
    TRIM(COALESCE(r->>'vendedor_id', r->>'vendedor_nombre', '')),
    UPPER(TRIM(REGEXP_REPLACE(COALESCE(r->>'vendedor_nombre', ''), '\s+', ' ', 'g'))),
    UPPER(TRIM(REGEXP_REPLACE(COALESCE(r->>'vendedor_canonico', r->>'vendedor_nombre', ''), '\s+', ' ', 'g'))),
    UPPER(TRIM(COALESCE(r->>'supervisor', 'NELSON FINOL'))),
    TRIM(COALESCE(r->>'zona', 'ZULIA')),
    TRIM(COALESCE(r->>'region', 'OCCIDENTE')),
    (r->>'latitud')::double precision,
    (r->>'longitud')::double precision,
    UPPER(TRIM(COALESCE(r->>'frecuencia_visita', 'SEMANAL'))),
    UPPER(TRIM(COALESCE(r->>'dia_visita', ''))),
    UPPER(TRIM(COALESCE(r->>'estatus', 'ACTIVO'))),
    COALESCE((r->>'activo')::boolean, true),
    now()
  FROM jsonb_array_elements(p_rows) AS r
  WHERE TRIM(COALESCE(r->>'cliente_codigo', '')) <> ''
  ON CONFLICT (composite_key) DO UPDATE SET
    cliente_codigo = EXCLUDED.cliente_codigo,
    razon_social = EXCLUDED.razon_social,
    rif = CASE WHEN EXCLUDED.rif <> 'PENDIENTE' THEN EXCLUDED.rif ELSE public.clientes_maestro.rif END,
    sucursal = EXCLUDED.sucursal,
    direccion = CASE WHEN EXCLUDED.direccion <> '' THEN EXCLUDED.direccion ELSE public.clientes_maestro.direccion END,
    tipo_cliente = CASE WHEN EXCLUDED.tipo_cliente <> 'POR CLASIFICAR' THEN EXCLUDED.tipo_cliente ELSE public.clientes_maestro.tipo_cliente END,
    vendedor_id = EXCLUDED.vendedor_id,
    vendedor_nombre = EXCLUDED.vendedor_nombre,
    vendedor_canonico = EXCLUDED.vendedor_canonico,
    supervisor = EXCLUDED.supervisor,
    zona = EXCLUDED.zona,
    region = EXCLUDED.region,
    latitud = COALESCE(EXCLUDED.latitud, public.clientes_maestro.latitud),
    longitud = COALESCE(EXCLUDED.longitud, public.clientes_maestro.longitud),
    estatus = EXCLUDED.estatus,
    activo = EXCLUDED.activo,
    updated_at = now();

  GET DIAGNOSTICS v_upserted = ROW_COUNT;

  SELECT COUNT(*), COUNT(DISTINCT cliente_codigo), COUNT(DISTINCT vendedor_canonico)
  INTO v_active_total, v_unique_clients, v_active_sellers
  FROM public.clientes_maestro
  WHERE activo = true;

  UPDATE public.catalog_sync_meta
  SET
    sync_version = sync_version + 1,
    last_synced_at = now(),
    total_clientes_activos = v_active_total,
    total_clientes_unicos = v_unique_clients,
    total_vendedores_activos = v_active_sellers
  WHERE id = 'MASTER_CATALOG';

  RETURN jsonb_build_object(
    'success', true,
    'upserted_count', v_upserted,
    'total_clientes_activos', v_active_total,
    'total_clientes_unicos', v_unique_clients,
    'total_vendedores_activos', v_active_sellers,
    'synced_at', now()
  );
END;
$$;

COMMIT;
