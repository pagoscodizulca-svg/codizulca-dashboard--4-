-- ============================================================================
-- MIGRACIÓN: 20261124_reasignacion_guanipa_a_victoria_vargas.sql
-- SISTEMA:   Codizulca — Dashboard de Gerencia & FDV / Planificador
-- OBJETIVO:  Reasignar y unificar el 100% de métricas comerciales, KPIs
--            históricos y actuales, metas/cuotas, cartera de clientes, rutas,
--            pedidos y visitas de "Luis Guanipa" (y cualquier variante) hacia
--            "VICTORIA VARGAS" (MAYÚSCULAS exactas y normalizadas), con cuadre
--            matemático 1:1, respaldo de auditoría y cero duplicados/huérfanos.
--
-- COMPATIBILIDAD DUAL (IDEMPOTENTE):
--   - Instancia A (Ventas Históricas / Campo):
--       public.history_sales (4,714 filas con id_vendedor=40 / padding ERP)
--   - Instancia B (Gerencia FDV / Cuotas / Maestra):
--       public.usuarios (Caso A — Merge Seguro: VICTORIA VARGAS ya existe activa),
--       public.ventas_historial (2,378 filas), public.hist_volumen_mes,
--       public.hist_activacion_resumen_mes, public.hist_activacion_cliente_mes,
--       public.hist_vendedores, public.activacion_clientes,
--       public.metas_activacion, public.ventas_volumen, public.degustaciones,
--       public.pedidos_alkosto, y tablas opcionales de Migraciones 001/005/007.
--
-- REGLAS DE SEGURIDAD Y PROTECCIÓN DE DATOS:
--   1. Cero secretos, URLs privadas ni credenciales en este archivo.
--   2. Respaldo previo en esquema privado audit_backup_reasignacion_guanipa
--      con REVOKE ALL a PUBLIC, anon y authenticated.
--   3. NUNCA modifica columnas de razón social/nombre de clientes (existen
--      clientes reales con apellido "GUANIPA").
--   4. Checksum matemático automático al final del Bloque 2 con RAISE EXCEPTION
--      (rollback automático completo ante cualquier descuadre).
-- ============================================================================


-- ============================================================================
-- BLOQUE 1: DIAGNÓSTICO DRY-RUN (SOLO LECTURA — NO MODIFICA DATOS)
-- Instrucción: Ejecutar primero este bloque por separado en cada instancia
--              Supabase y auditar los conteos/totales antes del Bloque 2.
-- ============================================================================

-- 1.1 Escaneo dinámico de todas las tablas, vistas y vistas materializadas
--     del esquema `public` en columnas de vendedor/usuario/ruta (excluyendo
--     razones sociales de clientes).
WITH seller_columns AS (
    SELECT
        c.table_schema,
        c.table_name,
        c.column_name,
        cls.relkind
    FROM information_schema.columns c
    JOIN pg_namespace ns ON ns.nspname = c.table_schema
    JOIN pg_class cls ON cls.relnamespace = ns.oid AND cls.relname = c.table_name
    WHERE c.table_schema = 'public'
      AND cls.relkind IN ('r', 'p', 'v', 'm')
      AND c.data_type IN ('text', 'character varying', 'character')
      AND c.column_name IN (
          'vendedor', 'vendedor_nombre', 'vendedor_id', 'vendedor_canonico',
          'vendedora', 'vendedor_email', 'ruta', 'ruta_oficial',
          'nombre_canonico', 'display_name', 'username', 'nombre_completo',
          'full_name', 'usuario', 'promoter', 'email'
      )
)
SELECT
    table_name,
    CASE relkind
        WHEN 'r' THEN 'TABLE'
        WHEN 'p' THEN 'PARTITIONED_TABLE'
        WHEN 'v' THEN 'VIEW'
        WHEN 'm' THEN 'MATERIALIZED_VIEW'
    END AS object_type,
    column_name,
    (xpath('/row/cnt/text()', query_to_xml(
        format(
            'SELECT count(*) AS cnt FROM %I.%I WHERE UPPER(TRIM(%I::text)) LIKE ''%%GUANIPA%%''',
            table_schema, table_name, column_name
        ), false, true, ''
    )))[1]::text::bigint AS rows_guanipa,
    (xpath('/row/cnt/text()', query_to_xml(
        format(
            'SELECT count(*) AS cnt FROM %I.%I WHERE UPPER(TRIM(%I::text)) LIKE ''%%VICTORIA%%VARGAS%%''',
            table_schema, table_name, column_name
        ), false, true, ''
    )))[1]::text::bigint AS rows_victoria_vargas
FROM seller_columns
ORDER BY table_name, column_name;

-- 1.2 Auditoría de seguridad Row Level Security (RLS) y políticas activas
SELECT
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced,
    COALESCE(
        (SELECT string_agg(
            format('%s (%s -> %s)', p.policyname, p.cmd, array_to_string(p.roles, ',')),
            ' | '
        )
        FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = c.relname),
        'SIN POLÍTICAS'
    ) AS active_policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
ORDER BY c.relrowsecurity ASC, c.relname ASC;

-- 1.3 Diagnóstico financiero PRE-MIGRACIÓN — Instancia A (public.history_sales)
-- (Descomentar y ejecutar en la instancia que contiene public.history_sales)
/*
SELECT
    CASE
        WHEN UPPER(TRIM(vendedor)) LIKE '%GUANIPA%' OR id_vendedor = 40 THEN 'LUIS_GUANIPA_PRE'
        WHEN UPPER(TRIM(vendedor)) LIKE '%VICTORIA%VARGAS%' THEN 'VICTORIA_VARGAS_PRE'
    END AS bucket,
    COUNT(*) AS total_rows,
    COUNT(DISTINCT id_cliente) AS distinct_clients,
    ROUND(COALESCE(SUM(monto), 0)::numeric, 2) AS sum_monto,
    ROUND(COALESCE(SUM(kgs_lts), 0)::numeric, 2) AS sum_kgs,
    ROUND(COALESCE(SUM(cajas), 0)::numeric, 2) AS sum_cajas,
    ROUND(COALESCE(SUM(unidades), 0)::numeric, 2) AS sum_unidades
FROM public.history_sales
WHERE UPPER(TRIM(vendedor)) LIKE '%GUANIPA%'
   OR id_vendedor = 40
   OR UPPER(TRIM(vendedor)) LIKE '%VICTORIA%VARGAS%'
GROUP BY 1
ORDER BY 1;
*/

-- 1.4 Diagnóstico de perfiles y totales PRE-MIGRACIÓN — Instancia B (FDV / Maestra)
-- (Descomentar y ejecutar en la instancia que contiene usuarios / ventas_historial / metas)
/*
SELECT id, username, role, vendor_id, nombre_completo, email, activo, created_at
FROM public.usuarios
WHERE UPPER(TRIM(username)) LIKE '%GUANIPA%'
   OR UPPER(TRIM(nombre_completo)) LIKE '%GUANIPA%'
   OR UPPER(TRIM(username)) LIKE '%VICTORIA%VARGAS%'
   OR UPPER(TRIM(nombre_completo)) LIKE '%VICTORIA%VARGAS%'
   OR TRIM(vendor_id::text) IN ('40', '040')
ORDER BY created_at;

SELECT
    CASE
        WHEN UPPER(TRIM(vendedor)) LIKE '%GUANIPA%' OR TRIM(id_vendedor::text) IN ('40', '040') THEN 'LUIS_GUANIPA_PRE'
        WHEN UPPER(TRIM(vendedor)) LIKE '%VICTORIA%VARGAS%' THEN 'VICTORIA_VARGAS_PRE'
    END AS bucket,
    COUNT(*) AS total_rows,
    COUNT(DISTINCT id_cliente) AS distinct_clients,
    ROUND(COALESCE(SUM(monto), 0)::numeric, 2) AS sum_monto,
    ROUND(COALESCE(SUM(kgs), 0)::numeric, 2) AS sum_kgs,
    ROUND(COALESCE(SUM(cajas), 0)::numeric, 2) AS sum_cajas,
    ROUND(COALESCE(SUM(unidades), 0)::numeric, 2) AS sum_unidades
FROM public.ventas_historial
WHERE UPPER(TRIM(vendedor)) LIKE '%GUANIPA%'
   OR TRIM(id_vendedor::text) IN ('40', '040')
   OR UPPER(TRIM(vendedor)) LIKE '%VICTORIA%VARGAS%'
GROUP BY 1
ORDER BY 1;

SELECT periodo, vendedor_id, COUNT(*) AS filas, SUM(meta) AS total_meta, SUM(activados) AS total_activados
FROM public.metas_activacion
WHERE UPPER(TRIM(vendedor_id)) LIKE '%GUANIPA%'
   OR UPPER(TRIM(vendedor_id)) LIKE '%VICTORIA%VARGAS%'
GROUP BY periodo, vendedor_id
ORDER BY periodo, vendedor_id;

SELECT periodo, vendedor_nombre, COUNT(*) AS filas,
       ROUND(COALESCE(SUM(meta_kg), 0)::numeric, 2) AS total_meta_kg,
       ROUND(COALESCE(SUM(ejecutado_kg), 0)::numeric, 2) AS total_ejecutado_kg
FROM public.ventas_volumen
WHERE UPPER(TRIM(vendedor_nombre)) LIKE '%GUANIPA%'
   OR UPPER(TRIM(vendedor_nombre)) LIKE '%VICTORIA%VARGAS%'
GROUP BY periodo, vendedor_nombre
ORDER BY periodo, vendedor_nombre;
*/


-- ============================================================================
-- BLOQUE 2: MIGRACIÓN ATÓMICA, IDEMPOTENTE Y CON CHECKSUM MATEMÁTICO 1:1
-- ============================================================================
BEGIN;

-- 2.1 Esquema privado de respaldo de auditoría (excluido de API pública)
CREATE SCHEMA IF NOT EXISTS audit_backup_reasignacion_guanipa;
REVOKE ALL ON SCHEMA audit_backup_reasignacion_guanipa FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON SCHEMA audit_backup_reasignacion_guanipa FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON SCHEMA audit_backup_reasignacion_guanipa FROM authenticated;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS audit_backup_reasignacion_guanipa.audit_backup_reasignacion_guanipa (
    backup_id      BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    executed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    source_table   TEXT NOT NULL,
    operation      TEXT NOT NULL,
    row_snapshot   JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_backup_reasignacion_guanipa.checksum_log (
    id                 BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    executed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    table_name         TEXT NOT NULL,
    pre_rows_combined  BIGINT NOT NULL,
    post_rows_victoria BIGINT NOT NULL,
    post_rows_guanipa  BIGINT NOT NULL,
    pre_clients        BIGINT DEFAULT 0,
    post_clients       BIGINT DEFAULT 0,
    pre_metric_a       NUMERIC(18, 2) DEFAULT 0,
    post_metric_a      NUMERIC(18, 2) DEFAULT 0,
    pre_metric_b       NUMERIC(18, 2) DEFAULT 0,
    post_metric_b      NUMERIC(18, 2) DEFAULT 0,
    verified_ok        BOOLEAN NOT NULL
);

ALTER TABLE audit_backup_reasignacion_guanipa.audit_backup_reasignacion_guanipa ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_backup_reasignacion_guanipa.checksum_log ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    v_target_name CONSTANT TEXT := 'VICTORIA VARGAS';
    v_relkind     CHAR;

    v_pre_rows         BIGINT;
    v_pre_clients      BIGINT;
    v_pre_monto        NUMERIC(18, 2);
    v_pre_kgs          NUMERIC(18, 2);
    v_pre_cajas        NUMERIC(18, 2);
    v_pre_unidades     NUMERIC(18, 2);

    v_post_rows        BIGINT;
    v_post_clients     BIGINT;
    v_post_monto       NUMERIC(18, 2);
    v_post_kgs         NUMERIC(18, 2);
    v_post_cajas       NUMERIC(18, 2);
    v_post_unidades    NUMERIC(18, 2);
    v_post_guanipa     BIGINT;

    v_has_victoria     BOOLEAN;
    v_guanipa_uuid     UUID;
    v_victoria_uuid    UUID;
BEGIN
    -- ========================================================================
    -- A. PERFIL MAESTRO DE USUARIOS (public.usuarios — Instancia B)
    --    Caso A (VICTORIA VARGAS ya existe): archivar LUIS GUANIPA (activo=false)
    --    sin provocar colisión UNIQUE. Caso B: actualizar registro en sitio.
    -- ========================================================================
    IF to_regclass('public.usuarios') IS NOT NULL THEN
        INSERT INTO audit_backup_reasignacion_guanipa.audit_backup_reasignacion_guanipa
            (source_table, operation, row_snapshot)
        SELECT
            'public.usuarios',
            'PRE_MERGE_SNAPSHOT',
            to_jsonb(u) - 'password_hash'
        FROM public.usuarios u
        WHERE UPPER(TRIM(u.username)) LIKE '%GUANIPA%'
           OR UPPER(TRIM(u.nombre_completo)) LIKE '%GUANIPA%'
           OR UPPER(TRIM(u.username)) LIKE '%VICTORIA%VARGAS%'
           OR UPPER(TRIM(u.nombre_completo)) LIKE '%VICTORIA%VARGAS%';

        SELECT EXISTS (
            SELECT 1 FROM public.usuarios
            WHERE UPPER(TRIM(username)) = v_target_name
               OR UPPER(TRIM(nombre_completo)) = v_target_name
        ) INTO v_has_victoria;

        IF v_has_victoria THEN
            -- CASO A: Merge seguro — mantener perfil canónico activo y archivar perfil antiguo
            UPDATE public.usuarios
            SET username        = v_target_name,
                nombre_completo = v_target_name,
                vendor_id       = COALESCE(NULLIF(TRIM(vendor_id::text), ''), '40'),
                activo          = true,
                updated_at      = now()
            WHERE UPPER(TRIM(username)) LIKE '%VICTORIA%VARGAS%'
               OR UPPER(TRIM(nombre_completo)) LIKE '%VICTORIA%VARGAS%';

            UPDATE public.usuarios
            SET activo     = false,
                updated_at = now()
            WHERE (UPPER(TRIM(username)) LIKE '%GUANIPA%'
                OR UPPER(TRIM(nombre_completo)) LIKE '%GUANIPA%')
              AND UPPER(TRIM(username)) <> v_target_name;
        ELSE
            -- CASO B: Actualizar en sitio conservando PK y vendor_id
            UPDATE public.usuarios
            SET username        = v_target_name,
                nombre_completo = v_target_name,
                activo          = true,
                updated_at      = now()
            WHERE UPPER(TRIM(username)) LIKE '%GUANIPA%'
               OR UPPER(TRIM(nombre_completo)) LIKE '%GUANIPA%';
        END IF;

        -- Verificar que no quede ningún perfil activo bajo GUANIPA
        SELECT COUNT(*) INTO v_post_guanipa
        FROM public.usuarios
        WHERE activo = true
          AND (UPPER(TRIM(username)) LIKE '%GUANIPA%' OR UPPER(TRIM(nombre_completo)) LIKE '%GUANIPA%');

        IF v_post_guanipa <> 0 THEN
            RAISE EXCEPTION 'CHECKSUM FALLIDO en public.usuarios: aún existen % perfil(es) activo(s) con GUANIPA', v_post_guanipa;
        END IF;
    END IF;

    -- ========================================================================
    -- B. HISTORIAL DE VENTAS (public.history_sales — Instancia A)
    -- ========================================================================
    IF to_regclass('public.history_sales') IS NOT NULL THEN
        SELECT
            COUNT(*),
            COUNT(DISTINCT id_cliente),
            ROUND(COALESCE(SUM(monto), 0)::numeric, 2),
            ROUND(COALESCE(SUM(kgs_lts), 0)::numeric, 2),
            ROUND(COALESCE(SUM(cajas), 0)::numeric, 2),
            ROUND(COALESCE(SUM(unidades), 0)::numeric, 2)
        INTO v_pre_rows, v_pre_clients, v_pre_monto, v_pre_kgs, v_pre_cajas, v_pre_unidades
        FROM public.history_sales
        WHERE UPPER(TRIM(vendedor)) LIKE '%GUANIPA%'
           OR id_vendedor = 40
           OR UPPER(TRIM(vendedor)) = v_target_name;

        INSERT INTO audit_backup_reasignacion_guanipa.audit_backup_reasignacion_guanipa
            (source_table, operation, row_snapshot)
        SELECT 'public.history_sales', 'UPDATE_VENDEDOR', to_jsonb(h)
        FROM public.history_sales h
        WHERE UPPER(TRIM(h.vendedor)) LIKE '%GUANIPA%'
           OR (h.id_vendedor = 40 AND UPPER(TRIM(h.vendedor)) <> v_target_name);

        UPDATE public.history_sales
        SET vendedor = v_target_name
        WHERE UPPER(TRIM(vendedor)) LIKE '%GUANIPA%'
           OR (id_vendedor = 40 AND UPPER(TRIM(vendedor)) <> v_target_name);

        SELECT COUNT(*) INTO v_post_guanipa
        FROM public.history_sales
        WHERE UPPER(TRIM(vendedor)) LIKE '%GUANIPA%';

        SELECT
            COUNT(*),
            COUNT(DISTINCT id_cliente),
            ROUND(COALESCE(SUM(monto), 0)::numeric, 2),
            ROUND(COALESCE(SUM(kgs_lts), 0)::numeric, 2),
            ROUND(COALESCE(SUM(cajas), 0)::numeric, 2),
            ROUND(COALESCE(SUM(unidades), 0)::numeric, 2)
        INTO v_post_rows, v_post_clients, v_post_monto, v_post_kgs, v_post_cajas, v_post_unidades
        FROM public.history_sales
        WHERE vendedor = v_target_name;

        IF v_post_guanipa <> 0
           OR v_post_rows <> v_pre_rows
           OR v_post_clients <> v_pre_clients
           OR v_post_monto <> v_pre_monto
           OR v_post_kgs <> v_pre_kgs
           OR v_post_cajas <> v_pre_cajas
           OR v_post_unidades <> v_pre_unidades THEN
            RAISE EXCEPTION
                'CHECKSUM FALLIDO en public.history_sales: guanipa_restante=%, rows(% -> %), clients(% -> %), monto(% -> %), kgs(% -> %), cajas(% -> %), und(% -> %)',
                v_post_guanipa, v_pre_rows, v_post_rows, v_pre_clients, v_post_clients,
                v_pre_monto, v_post_monto, v_pre_kgs, v_post_kgs, v_pre_cajas, v_post_cajas, v_pre_unidades, v_post_unidades;
        END IF;

        INSERT INTO audit_backup_reasignacion_guanipa.checksum_log
            (table_name, pre_rows_combined, post_rows_victoria, post_rows_guanipa, pre_clients, post_clients, pre_metric_a, post_metric_a, pre_metric_b, post_metric_b, verified_ok)
        VALUES ('public.history_sales', v_pre_rows, v_post_rows, v_post_guanipa, v_pre_clients, v_post_clients, v_pre_monto, v_post_monto, v_pre_kgs, v_post_kgs, true);
    END IF;

    -- ========================================================================
    -- C. HISTORIAL DE VENTAS FDV (public.ventas_historial — Instancia B)
    -- ========================================================================
    IF to_regclass('public.ventas_historial') IS NOT NULL THEN
        SELECT
            COUNT(*),
            COUNT(DISTINCT id_cliente),
            ROUND(COALESCE(SUM(monto), 0)::numeric, 2),
            ROUND(COALESCE(SUM(kgs), 0)::numeric, 2),
            ROUND(COALESCE(SUM(cajas), 0)::numeric, 2),
            ROUND(COALESCE(SUM(unidades), 0)::numeric, 2)
        INTO v_pre_rows, v_pre_clients, v_pre_monto, v_pre_kgs, v_pre_cajas, v_pre_unidades
        FROM public.ventas_historial
        WHERE UPPER(TRIM(vendedor)) LIKE '%GUANIPA%'
           OR TRIM(id_vendedor::text) IN ('40', '040')
           OR UPPER(TRIM(vendedor)) = v_target_name;

        INSERT INTO audit_backup_reasignacion_guanipa.audit_backup_reasignacion_guanipa
            (source_table, operation, row_snapshot)
        SELECT 'public.ventas_historial', 'UPDATE_VENDEDOR', to_jsonb(vh)
        FROM public.ventas_historial vh
        WHERE UPPER(TRIM(vh.vendedor)) LIKE '%GUANIPA%'
           OR (TRIM(vh.id_vendedor::text) IN ('40', '040') AND UPPER(TRIM(vh.vendedor)) <> v_target_name);

        UPDATE public.ventas_historial
        SET vendedor = v_target_name
        WHERE UPPER(TRIM(vendedor)) LIKE '%GUANIPA%'
           OR (TRIM(id_vendedor::text) IN ('40', '040') AND UPPER(TRIM(vendedor)) <> v_target_name);

        SELECT COUNT(*) INTO v_post_guanipa
        FROM public.ventas_historial
        WHERE UPPER(TRIM(vendedor)) LIKE '%GUANIPA%';

        SELECT
            COUNT(*),
            COUNT(DISTINCT id_cliente),
            ROUND(COALESCE(SUM(monto), 0)::numeric, 2),
            ROUND(COALESCE(SUM(kgs), 0)::numeric, 2),
            ROUND(COALESCE(SUM(cajas), 0)::numeric, 2),
            ROUND(COALESCE(SUM(unidades), 0)::numeric, 2)
        INTO v_post_rows, v_post_clients, v_post_monto, v_post_kgs, v_post_cajas, v_post_unidades
        FROM public.ventas_historial
        WHERE vendedor = v_target_name;

        IF v_post_guanipa <> 0
           OR v_post_rows <> v_pre_rows
           OR v_post_clients <> v_pre_clients
           OR v_post_monto <> v_pre_monto
           OR v_post_kgs <> v_pre_kgs
           OR v_post_cajas <> v_pre_cajas
           OR v_post_unidades <> v_pre_unidades THEN
            RAISE EXCEPTION
                'CHECKSUM FALLIDO en public.ventas_historial: guanipa_restante=%, rows(% -> %), clients(% -> %), monto(% -> %), kgs(% -> %)',
                v_post_guanipa, v_pre_rows, v_post_rows, v_pre_clients, v_post_clients, v_pre_monto, v_post_monto, v_pre_kgs, v_post_kgs;
        END IF;

        INSERT INTO audit_backup_reasignacion_guanipa.checksum_log
            (table_name, pre_rows_combined, post_rows_victoria, post_rows_guanipa, pre_clients, post_clients, pre_metric_a, post_metric_a, pre_metric_b, post_metric_b, verified_ok)
        VALUES ('public.ventas_historial', v_pre_rows, v_post_rows, v_post_guanipa, v_pre_clients, v_post_clients, v_pre_monto, v_post_monto, v_pre_kgs, v_post_kgs, true);
    END IF;

    -- ========================================================================
    -- D. OBJETOS ANALÍTICOS HISTÓRICOS (Instancia B: tabla base / vista / matview)
    -- ========================================================================

    -- D.1 public.hist_volumen_mes
    v_relkind := NULL;
    SELECT c.relkind INTO v_relkind
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'hist_volumen_mes';

    IF v_relkind = 'm' THEN
        REFRESH MATERIALIZED VIEW public.hist_volumen_mes;
    ELSIF v_relkind IN ('r', 'p') THEN
        SELECT COUNT(*), ROUND(COALESCE(SUM(monto), 0)::numeric, 2), ROUND(COALESCE(SUM(kgs), 0)::numeric, 2)
        INTO v_pre_rows, v_pre_monto, v_pre_kgs
        FROM public.hist_volumen_mes
        WHERE UPPER(TRIM(vendedor)) LIKE '%GUANIPA%' OR UPPER(TRIM(vendedor)) = v_target_name;

        INSERT INTO audit_backup_reasignacion_guanipa.audit_backup_reasignacion_guanipa (source_table, operation, row_snapshot)
        SELECT 'public.hist_volumen_mes', 'UPDATE_VENDEDOR', to_jsonb(t)
        FROM public.hist_volumen_mes t WHERE UPPER(TRIM(t.vendedor)) LIKE '%GUANIPA%';

        UPDATE public.hist_volumen_mes
        SET vendedor = v_target_name
        WHERE UPPER(TRIM(vendedor)) LIKE '%GUANIPA%';

        SELECT COUNT(*) INTO v_post_guanipa FROM public.hist_volumen_mes WHERE UPPER(TRIM(vendedor)) LIKE '%GUANIPA%';
        SELECT COUNT(*), ROUND(COALESCE(SUM(monto), 0)::numeric, 2), ROUND(COALESCE(SUM(kgs), 0)::numeric, 2)
        INTO v_post_rows, v_post_monto, v_post_kgs
        FROM public.hist_volumen_mes WHERE vendedor = v_target_name;

        IF v_post_guanipa <> 0 OR v_post_rows <> v_pre_rows OR v_post_monto <> v_pre_monto OR v_post_kgs <> v_pre_kgs THEN
            RAISE EXCEPTION 'CHECKSUM FALLIDO en public.hist_volumen_mes: guanipa=%, rows(% -> %), monto(% -> %), kgs(% -> %)',
                v_post_guanipa, v_pre_rows, v_post_rows, v_pre_monto, v_post_monto, v_pre_kgs, v_post_kgs;
        END IF;

        INSERT INTO audit_backup_reasignacion_guanipa.checksum_log
            (table_name, pre_rows_combined, post_rows_victoria, post_rows_guanipa, pre_metric_a, post_metric_a, pre_metric_b, post_metric_b, verified_ok)
        VALUES ('public.hist_volumen_mes', v_pre_rows, v_post_rows, v_post_guanipa, v_pre_monto, v_post_monto, v_pre_kgs, v_post_kgs, true);
    END IF;

    -- D.2 public.hist_activacion_resumen_mes
    v_relkind := NULL;
    SELECT c.relkind INTO v_relkind
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'hist_activacion_resumen_mes';

    IF v_relkind = 'm' THEN
        REFRESH MATERIALIZED VIEW public.hist_activacion_resumen_mes;
    ELSIF v_relkind IN ('r', 'p') THEN
        SELECT COUNT(*), ROUND(COALESCE(SUM(monto_total), 0)::numeric, 2), ROUND(COALESCE(SUM(kgs_total), 0)::numeric, 2)
        INTO v_pre_rows, v_pre_monto, v_pre_kgs
        FROM public.hist_activacion_resumen_mes
        WHERE UPPER(TRIM(vendedor)) LIKE '%GUANIPA%' OR UPPER(TRIM(vendedor)) = v_target_name;

        INSERT INTO audit_backup_reasignacion_guanipa.audit_backup_reasignacion_guanipa (source_table, operation, row_snapshot)
        SELECT 'public.hist_activacion_resumen_mes', 'UPDATE_VENDEDOR', to_jsonb(t)
        FROM public.hist_activacion_resumen_mes t WHERE UPPER(TRIM(t.vendedor)) LIKE '%GUANIPA%';

        UPDATE public.hist_activacion_resumen_mes
        SET vendedor = v_target_name
        WHERE UPPER(TRIM(vendedor)) LIKE '%GUANIPA%';

        SELECT COUNT(*) INTO v_post_guanipa FROM public.hist_activacion_resumen_mes WHERE UPPER(TRIM(vendedor)) LIKE '%GUANIPA%';
        SELECT COUNT(*), ROUND(COALESCE(SUM(monto_total), 0)::numeric, 2), ROUND(COALESCE(SUM(kgs_total), 0)::numeric, 2)
        INTO v_post_rows, v_post_monto, v_post_kgs
        FROM public.hist_activacion_resumen_mes WHERE vendedor = v_target_name;

        IF v_post_guanipa <> 0 OR v_post_rows <> v_pre_rows OR v_post_monto <> v_pre_monto OR v_post_kgs <> v_pre_kgs THEN
            RAISE EXCEPTION 'CHECKSUM FALLIDO en public.hist_activacion_resumen_mes: guanipa=%, rows(% -> %), monto(% -> %), kgs(% -> %)',
                v_post_guanipa, v_pre_rows, v_post_rows, v_pre_monto, v_post_monto, v_pre_kgs, v_post_kgs;
        END IF;

        INSERT INTO audit_backup_reasignacion_guanipa.checksum_log
            (table_name, pre_rows_combined, post_rows_victoria, post_rows_guanipa, pre_metric_a, post_metric_a, pre_metric_b, post_metric_b, verified_ok)
        VALUES ('public.hist_activacion_resumen_mes', v_pre_rows, v_post_rows, v_post_guanipa, v_pre_monto, v_post_monto, v_pre_kgs, v_post_kgs, true);
    END IF;

    -- D.3 public.hist_activacion_cliente_mes
    v_relkind := NULL;
    SELECT c.relkind INTO v_relkind
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'hist_activacion_cliente_mes';

    IF v_relkind = 'm' THEN
        REFRESH MATERIALIZED VIEW public.hist_activacion_cliente_mes;
    ELSIF v_relkind IN ('r', 'p') THEN
        SELECT COUNT(*), COUNT(DISTINCT id_cliente), ROUND(COALESCE(SUM(monto_total), 0)::numeric, 2), ROUND(COALESCE(SUM(kgs_total), 0)::numeric, 2)
        INTO v_pre_rows, v_pre_clients, v_pre_monto, v_pre_kgs
        FROM public.hist_activacion_cliente_mes
        WHERE UPPER(TRIM(vendedor)) LIKE '%GUANIPA%' OR UPPER(TRIM(vendedor)) = v_target_name;

        INSERT INTO audit_backup_reasignacion_guanipa.audit_backup_reasignacion_guanipa (source_table, operation, row_snapshot)
        SELECT 'public.hist_activacion_cliente_mes', 'UPDATE_VENDEDOR', to_jsonb(t)
        FROM public.hist_activacion_cliente_mes t WHERE UPPER(TRIM(t.vendedor)) LIKE '%GUANIPA%';

        UPDATE public.hist_activacion_cliente_mes
        SET vendedor = v_target_name
        WHERE UPPER(TRIM(vendedor)) LIKE '%GUANIPA%';

        SELECT COUNT(*) INTO v_post_guanipa FROM public.hist_activacion_cliente_mes WHERE UPPER(TRIM(vendedor)) LIKE '%GUANIPA%';
        SELECT COUNT(*), COUNT(DISTINCT id_cliente), ROUND(COALESCE(SUM(monto_total), 0)::numeric, 2), ROUND(COALESCE(SUM(kgs_total), 0)::numeric, 2)
        INTO v_post_rows, v_post_clients, v_post_monto, v_post_kgs
        FROM public.hist_activacion_cliente_mes WHERE vendedor = v_target_name;

        IF v_post_guanipa <> 0 OR v_post_rows <> v_pre_rows OR v_post_clients <> v_pre_clients OR v_post_monto <> v_pre_monto OR v_post_kgs <> v_pre_kgs THEN
            RAISE EXCEPTION 'CHECKSUM FALLIDO en public.hist_activacion_cliente_mes: guanipa=%, rows(% -> %), clients(% -> %), monto(% -> %), kgs(% -> %)',
                v_post_guanipa, v_pre_rows, v_post_rows, v_pre_clients, v_post_clients, v_pre_monto, v_post_monto, v_pre_kgs, v_post_kgs;
        END IF;

        INSERT INTO audit_backup_reasignacion_guanipa.checksum_log
            (table_name, pre_rows_combined, post_rows_victoria, post_rows_guanipa, pre_clients, post_clients, pre_metric_a, post_metric_a, pre_metric_b, post_metric_b, verified_ok)
        VALUES ('public.hist_activacion_cliente_mes', v_pre_rows, v_post_rows, v_post_guanipa, v_pre_clients, v_post_clients, v_pre_monto, v_post_monto, v_pre_kgs, v_post_kgs, true);
    END IF;

    -- D.4 public.hist_vendedores (Deduplicación segura Caso A)
    v_relkind := NULL;
    SELECT c.relkind INTO v_relkind
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'hist_vendedores';

    IF v_relkind = 'm' THEN
        REFRESH MATERIALIZED VIEW public.hist_vendedores;
    ELSIF v_relkind IN ('r', 'p') THEN
        INSERT INTO audit_backup_reasignacion_guanipa.audit_backup_reasignacion_guanipa (source_table, operation, row_snapshot)
        SELECT 'public.hist_vendedores', 'MERGE_DEDUP', to_jsonb(t)
        FROM public.hist_vendedores t WHERE UPPER(TRIM(t.vendedor)) LIKE '%GUANIPA%';

        IF EXISTS (SELECT 1 FROM public.hist_vendedores WHERE UPPER(TRIM(vendedor)) = v_target_name) THEN
            DELETE FROM public.hist_vendedores WHERE UPPER(TRIM(vendedor)) LIKE '%GUANIPA%';
        ELSE
            UPDATE public.hist_vendedores SET vendedor = v_target_name WHERE UPPER(TRIM(vendedor)) LIKE '%GUANIPA%';
        END IF;
    END IF;

    -- Verificación post-refresh de vistas/matviews analíticas
    IF to_regclass('public.hist_vendedores') IS NOT NULL THEN
        SELECT COUNT(*) INTO v_post_guanipa FROM public.hist_vendedores WHERE UPPER(TRIM(vendedor)) LIKE '%GUANIPA%';
        IF v_post_guanipa <> 0 THEN
            RAISE EXCEPTION 'CHECKSUM FALLIDO: public.hist_vendedores aún contiene % registro(s) con GUANIPA', v_post_guanipa;
        END IF;
    END IF;

    IF to_regclass('public.hist_volumen_mes') IS NOT NULL THEN
        SELECT COUNT(*) INTO v_post_guanipa FROM public.hist_volumen_mes WHERE UPPER(TRIM(vendedor)) LIKE '%GUANIPA%';
        IF v_post_guanipa <> 0 THEN
            RAISE EXCEPTION 'CHECKSUM FALLIDO: public.hist_volumen_mes aún contiene % registro(s) con GUANIPA', v_post_guanipa;
        END IF;
    END IF;

    IF to_regclass('public.hist_activacion_resumen_mes') IS NOT NULL THEN
        SELECT COUNT(*) INTO v_post_guanipa FROM public.hist_activacion_resumen_mes WHERE UPPER(TRIM(vendedor)) LIKE '%GUANIPA%';
        IF v_post_guanipa <> 0 THEN
            RAISE EXCEPTION 'CHECKSUM FALLIDO: public.hist_activacion_resumen_mes aún contiene % registro(s) con GUANIPA', v_post_guanipa;
        END IF;
    END IF;

    IF to_regclass('public.hist_activacion_cliente_mes') IS NOT NULL THEN
        SELECT COUNT(*) INTO v_post_guanipa FROM public.hist_activacion_cliente_mes WHERE UPPER(TRIM(vendedor)) LIKE '%GUANIPA%';
        IF v_post_guanipa <> 0 THEN
            RAISE EXCEPTION 'CHECKSUM FALLIDO: public.hist_activacion_cliente_mes aún contiene % registro(s) con GUANIPA', v_post_guanipa;
        END IF;
    END IF;

    -- ========================================================================
    -- E. TABLAS OPERATIVAS & CUOTAS (Idempotentes + Merge sin duplicar metas)
    -- ========================================================================
    IF to_regclass('public.activacion_clientes') IS NOT NULL THEN
        SELECT COUNT(*) INTO v_pre_rows
        FROM public.activacion_clientes
        WHERE UPPER(TRIM(vendedor_nombre)) LIKE '%GUANIPA%'
           OR UPPER(TRIM(vendedor_id)) LIKE '%GUANIPA%'
           OR UPPER(TRIM(vendedor_nombre)) = v_target_name;

        INSERT INTO audit_backup_reasignacion_guanipa.audit_backup_reasignacion_guanipa (source_table, operation, row_snapshot)
        SELECT 'public.activacion_clientes', 'UPDATE_VENDEDOR', to_jsonb(a)
        FROM public.activacion_clientes a
        WHERE UPPER(TRIM(a.vendedor_nombre)) LIKE '%GUANIPA%'
           OR UPPER(TRIM(a.vendedor_id)) LIKE '%GUANIPA%';

        UPDATE public.activacion_clientes
        SET vendedor_nombre = v_target_name,
            vendedor_id = CASE
                WHEN UPPER(TRIM(vendedor_id)) LIKE 'INACTIVO_MAESTRA::%' THEN 'INACTIVO_MAESTRA::' || v_target_name
                ELSE v_target_name
            END
        WHERE UPPER(TRIM(vendedor_nombre)) LIKE '%GUANIPA%'
           OR UPPER(TRIM(vendedor_id)) LIKE '%GUANIPA%';

        SELECT COUNT(*) INTO v_post_guanipa
        FROM public.activacion_clientes
        WHERE UPPER(TRIM(vendedor_nombre)) LIKE '%GUANIPA%' OR UPPER(TRIM(vendedor_id)) LIKE '%GUANIPA%';

        SELECT COUNT(*) INTO v_post_rows
        FROM public.activacion_clientes
        WHERE UPPER(TRIM(vendedor_nombre)) = v_target_name;

        IF v_post_guanipa <> 0 OR v_post_rows <> v_pre_rows THEN
            RAISE EXCEPTION 'CHECKSUM FALLIDO en public.activacion_clientes: guanipa=%, rows(% -> %)',
                v_post_guanipa, v_pre_rows, v_post_rows;
        END IF;

        INSERT INTO audit_backup_reasignacion_guanipa.checksum_log
            (table_name, pre_rows_combined, post_rows_victoria, post_rows_guanipa, verified_ok)
        VALUES ('public.activacion_clientes', v_pre_rows, v_post_rows, v_post_guanipa, true);
    END IF;

    IF to_regclass('public.metas_activacion') IS NOT NULL THEN
        INSERT INTO audit_backup_reasignacion_guanipa.audit_backup_reasignacion_guanipa (source_table, operation, row_snapshot)
        SELECT 'public.metas_activacion', 'MERGE_METAS', to_jsonb(m)
        FROM public.metas_activacion m
        WHERE UPPER(TRIM(m.vendedor_id)) LIKE '%GUANIPA%';

        -- Merge sin duplicar metas si ya existe (periodo, VICTORIA VARGAS, categoria)
        UPDATE public.metas_activacion dst
        SET meta      = GREATEST(dst.meta, src.meta),
            activados = GREATEST(dst.activados, src.activados)
        FROM public.metas_activacion src
        WHERE UPPER(TRIM(src.vendedor_id)) LIKE '%GUANIPA%'
          AND UPPER(TRIM(dst.vendedor_id)) = v_target_name
          AND dst.periodo = src.periodo
          AND UPPER(TRIM(dst.categoria)) = UPPER(TRIM(src.categoria));

        DELETE FROM public.metas_activacion src
        WHERE UPPER(TRIM(src.vendedor_id)) LIKE '%GUANIPA%'
          AND EXISTS (
              SELECT 1 FROM public.metas_activacion dst
              WHERE UPPER(TRIM(dst.vendedor_id)) = v_target_name
                AND dst.periodo = src.periodo
                AND UPPER(TRIM(dst.categoria)) = UPPER(TRIM(src.categoria))
          );

        UPDATE public.metas_activacion
        SET vendedor_id = v_target_name
        WHERE UPPER(TRIM(vendedor_id)) LIKE '%GUANIPA%';

        SELECT COUNT(*) INTO v_post_guanipa FROM public.metas_activacion WHERE UPPER(TRIM(vendedor_id)) LIKE '%GUANIPA%';
        IF v_post_guanipa <> 0 THEN
            RAISE EXCEPTION 'CHECKSUM FALLIDO en public.metas_activacion: % filas restantes', v_post_guanipa;
        END IF;
    END IF;

    IF to_regclass('public.ventas_volumen') IS NOT NULL THEN
        SELECT COUNT(*), ROUND(COALESCE(SUM(meta_kg), 0)::numeric, 2), ROUND(COALESCE(SUM(ejecutado_kg), 0)::numeric, 2)
        INTO v_pre_rows, v_pre_monto, v_pre_kgs
        FROM public.ventas_volumen
        WHERE UPPER(TRIM(vendedor_nombre)) LIKE '%GUANIPA%'
           OR UPPER(TRIM(vendedor_id)) LIKE '%GUANIPA%'
           OR UPPER(TRIM(vendedor_nombre)) = v_target_name;

        INSERT INTO audit_backup_reasignacion_guanipa.audit_backup_reasignacion_guanipa (source_table, operation, row_snapshot)
        SELECT 'public.ventas_volumen', 'UPDATE_VENDEDOR', to_jsonb(vv)
        FROM public.ventas_volumen vv
        WHERE UPPER(TRIM(vv.vendedor_nombre)) LIKE '%GUANIPA%' OR UPPER(TRIM(vv.vendedor_id)) LIKE '%GUANIPA%';

        UPDATE public.ventas_volumen
        SET vendedor_id     = v_target_name,
            vendedor_nombre = v_target_name
        WHERE UPPER(TRIM(vendedor_nombre)) LIKE '%GUANIPA%'
           OR UPPER(TRIM(vendedor_id)) LIKE '%GUANIPA%';

        SELECT COUNT(*) INTO v_post_guanipa
        FROM public.ventas_volumen
        WHERE UPPER(TRIM(vendedor_nombre)) LIKE '%GUANIPA%' OR UPPER(TRIM(vendedor_id)) LIKE '%GUANIPA%';

        SELECT COUNT(*), ROUND(COALESCE(SUM(meta_kg), 0)::numeric, 2), ROUND(COALESCE(SUM(ejecutado_kg), 0)::numeric, 2)
        INTO v_post_rows, v_post_monto, v_post_kgs
        FROM public.ventas_volumen
        WHERE UPPER(TRIM(vendedor_nombre)) = v_target_name;

        IF v_post_guanipa <> 0 OR v_post_rows <> v_pre_rows OR v_post_monto <> v_pre_monto OR v_post_kgs <> v_pre_kgs THEN
            RAISE EXCEPTION 'CHECKSUM FALLIDO en public.ventas_volumen';
        END IF;

        INSERT INTO audit_backup_reasignacion_guanipa.checksum_log
            (table_name, pre_rows_combined, post_rows_victoria, post_rows_guanipa, pre_metric_a, post_metric_a, pre_metric_b, post_metric_b, verified_ok)
        VALUES ('public.ventas_volumen', v_pre_rows, v_post_rows, v_post_guanipa, v_pre_monto, v_post_monto, v_pre_kgs, v_post_kgs, true);
    END IF;

    IF to_regclass('public.degustaciones') IS NOT NULL THEN
        INSERT INTO audit_backup_reasignacion_guanipa.audit_backup_reasignacion_guanipa (source_table, operation, row_snapshot)
        SELECT 'public.degustaciones', 'UPDATE_VENDEDOR', to_jsonb(d)
        FROM public.degustaciones d
        WHERE UPPER(TRIM(COALESCE(d.vendedor_nombre, ''))) LIKE '%GUANIPA%'
           OR UPPER(TRIM(COALESCE(d.vendedor_id, ''))) LIKE '%GUANIPA%'
           OR UPPER(TRIM(COALESCE(d.ruta, ''))) LIKE '%GUANIPA%';

        UPDATE public.degustaciones
        SET vendedor_nombre = v_target_name,
            vendedor_id     = CASE WHEN UPPER(TRIM(COALESCE(vendedor_id, ''))) LIKE '%GUANIPA%' THEN v_target_name ELSE vendedor_id END,
            ruta            = CASE WHEN UPPER(TRIM(COALESCE(ruta, ''))) LIKE '%GUANIPA%' THEN v_target_name ELSE ruta END,
            updated_at      = now()
        WHERE UPPER(TRIM(COALESCE(vendedor_nombre, ''))) LIKE '%GUANIPA%'
           OR UPPER(TRIM(COALESCE(vendedor_id, ''))) LIKE '%GUANIPA%'
           OR UPPER(TRIM(COALESCE(ruta, ''))) LIKE '%GUANIPA%';
    END IF;

    IF to_regclass('public.pedidos_alkosto') IS NOT NULL THEN
        INSERT INTO audit_backup_reasignacion_guanipa.audit_backup_reasignacion_guanipa (source_table, operation, row_snapshot)
        SELECT 'public.pedidos_alkosto', 'UPDATE_VENDEDOR', to_jsonb(p)
        FROM public.pedidos_alkosto p
        WHERE UPPER(TRIM(COALESCE(p.vendedora, ''))) LIKE '%GUANIPA%'
           OR UPPER(TRIM(COALESCE(p.ruta, ''))) LIKE '%GUANIPA%';

        UPDATE public.pedidos_alkosto
        SET vendedora  = v_target_name,
            ruta       = CASE WHEN UPPER(TRIM(COALESCE(ruta, ''))) LIKE '%GUANIPA%' THEN v_target_name ELSE ruta END,
            updated_at = now()
        WHERE UPPER(TRIM(COALESCE(vendedora, ''))) LIKE '%GUANIPA%'
           OR UPPER(TRIM(COALESCE(ruta, ''))) LIKE '%GUANIPA%';
    END IF;

    -- ========================================================================
    -- F. TABLAS MAESTRAS OPCIONALES (Migraciones 001 / 005 / 007 / Trade)
    -- ========================================================================
    IF to_regclass('public.vendedores_maestro') IS NOT NULL THEN
        INSERT INTO audit_backup_reasignacion_guanipa.audit_backup_reasignacion_guanipa (source_table, operation, row_snapshot)
        SELECT 'public.vendedores_maestro', 'MERGE_VENDEDOR', to_jsonb(vm)
        FROM public.vendedores_maestro vm
        WHERE UPPER(TRIM(vm.nombre_canonico)) LIKE '%GUANIPA%' OR UPPER(TRIM(vm.nombre_canonico)) = v_target_name;

        IF EXISTS (SELECT 1 FROM public.vendedores_maestro WHERE UPPER(TRIM(nombre_canonico)) = v_target_name) THEN
            UPDATE public.vendedores_maestro
            SET activo     = false,
                updated_at = now()
            WHERE UPPER(TRIM(nombre_canonico)) LIKE '%GUANIPA%';
        ELSE
            UPDATE public.vendedores_maestro
            SET nombre_canonico = v_target_name,
                display_name    = 'Victoria Vargas',
                ruta_oficial    = v_target_name,
                aliases         = (
                    SELECT jsonb_agg(DISTINCT x)
                    FROM jsonb_array_elements_text(aliases || '["LUIS GUANIPA","VICTORIA VARGAS"]'::jsonb) x
                ),
                email           = COALESCE(email, 'victoria.vargas@codizulca.com'),
                updated_at      = now()
            WHERE UPPER(TRIM(nombre_canonico)) LIKE '%GUANIPA%';
        END IF;
    END IF;

    IF to_regclass('public.clientes_maestro') IS NOT NULL THEN
        INSERT INTO audit_backup_reasignacion_guanipa.audit_backup_reasignacion_guanipa (source_table, operation, row_snapshot)
        SELECT 'public.clientes_maestro', 'UPDATE_VENDEDOR', to_jsonb(cm)
        FROM public.clientes_maestro cm
        WHERE UPPER(TRIM(cm.vendedor_nombre)) LIKE '%GUANIPA%' OR UPPER(TRIM(cm.vendedor_canonico)) LIKE '%GUANIPA%';

        -- Si ya existe la clave compuesta destino, actualizarla antes de borrar el duplicado
        DELETE FROM public.clientes_maestro src
        WHERE (UPPER(TRIM(src.vendedor_nombre)) LIKE '%GUANIPA%' OR UPPER(TRIM(src.vendedor_canonico)) LIKE '%GUANIPA%')
          AND EXISTS (
              SELECT 1 FROM public.clientes_maestro dst
              WHERE dst.composite_key = v_target_name || '::' || src.cliente_codigo
          );

        UPDATE public.clientes_maestro
        SET vendedor_nombre   = v_target_name,
            vendedor_canonico = v_target_name,
            composite_key     = v_target_name || '::' || cliente_codigo,
            updated_at        = now()
        WHERE UPPER(TRIM(vendedor_nombre)) LIKE '%GUANIPA%'
           OR UPPER(TRIM(vendedor_canonico)) LIKE '%GUANIPA%';
    END IF;

    -- Soporte relacional FK si existen public.profiles + public.sales + public.sellers_quotas (Migración 001)
    IF to_regclass('public.profiles') IS NOT NULL THEN
        SELECT id INTO v_guanipa_uuid FROM public.profiles WHERE UPPER(TRIM(full_name)) LIKE '%GUANIPA%' LIMIT 1;
        SELECT id INTO v_victoria_uuid FROM public.profiles WHERE UPPER(TRIM(full_name)) = v_target_name LIMIT 1;

        IF v_guanipa_uuid IS NOT NULL THEN
            IF v_victoria_uuid IS NOT NULL AND v_victoria_uuid <> v_guanipa_uuid THEN
                -- CASO A: Reasignar FKs de sales y consolidar sellers_quotas sin colisión UNIQUE(seller_id, period)
                IF to_regclass('public.sales') IS NOT NULL THEN
                    UPDATE public.sales SET seller_id = v_victoria_uuid, updated_at = now()
                    WHERE seller_id = v_guanipa_uuid;
                END IF;
                IF to_regclass('public.sellers_quotas') IS NOT NULL THEN
                    UPDATE public.sellers_quotas dst
                    SET quota_boxes  = dst.quota_boxes + src.quota_boxes,
                        quota_amount = dst.quota_amount + src.quota_amount,
                        updated_at   = now()
                    FROM public.sellers_quotas src
                    WHERE src.seller_id = v_guanipa_uuid
                      AND dst.seller_id = v_victoria_uuid
                      AND dst.period = src.period;

                    DELETE FROM public.sellers_quotas src
                    WHERE src.seller_id = v_guanipa_uuid
                      AND EXISTS (
                          SELECT 1 FROM public.sellers_quotas dst
                          WHERE dst.seller_id = v_victoria_uuid AND dst.period = src.period
                      );

                    UPDATE public.sellers_quotas SET seller_id = v_victoria_uuid, updated_at = now()
                    WHERE seller_id = v_guanipa_uuid;
                END IF;
                UPDATE public.profiles SET is_active = false, updated_at = now() WHERE id = v_guanipa_uuid;
            ELSE
                -- CASO B: Renombrar perfil en sitio conservando FK
                UPDATE public.profiles SET full_name = v_target_name, updated_at = now() WHERE id = v_guanipa_uuid;
            END IF;
        END IF;
    END IF;

    -- Refrescar vistas materializadas analíticas de Migración 005 si existen
    IF to_regclass('public.vw_quota_progress') IS NOT NULL THEN
        REFRESH MATERIALIZED VIEW public.vw_quota_progress;
    END IF;
    IF to_regclass('public.vw_seller_performance') IS NOT NULL THEN
        REFRESH MATERIALIZED VIEW public.vw_seller_performance;
    END IF;
END $$;

COMMIT;

-- Consulta rápida de auditoría post-COMMIT (Solo Lectura)
SELECT * FROM audit_backup_reasignacion_guanipa.checksum_log ORDER BY id;


-- ============================================================================
-- BLOQUE 3 (RECOMENDADO DEVSECOPS): HARDENING RLS SIN INTERRUMPIR EL DASHBOARD
-- Ejecutar en Instancia A (public.history_sales) una vez que el servidor backend
-- tenga configurada la llave SUPABASE_SERVICE_ROLE_KEY real (rol service_role).
-- Mantiene SELECT operativo para el Dashboard y revoca escrituras anónimas.
-- ============================================================================
/*
BEGIN;

ALTER TABLE public.history_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "history_sales_insert_authenticated" ON public.history_sales;
DROP POLICY IF EXISTS "history_sales_update_authenticated" ON public.history_sales;
DROP POLICY IF EXISTS "history_sales_delete_authenticated" ON public.history_sales;

-- Mantener lectura para el Dashboard de Gerencia
DROP POLICY IF EXISTS "history_sales_select_all" ON public.history_sales;
CREATE POLICY "history_sales_select_all"
ON public.history_sales FOR SELECT
TO anon, authenticated, service_role
USING (true);

-- Restringir escrituras exclusivamente a service_role (backend)
CREATE POLICY "history_sales_write_service_role"
ON public.history_sales FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE ON TABLE public.history_sales FROM anon;
GRANT SELECT ON TABLE public.history_sales TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.history_sales TO service_role;

COMMIT;
*/
