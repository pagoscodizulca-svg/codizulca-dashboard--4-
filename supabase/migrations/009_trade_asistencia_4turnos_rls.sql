-- ====================================================================
-- MIGRACIÓN 009: Control Diario de Asistencia Trade Marketing (4 Turnos),
--                Promotoras Fijas y Eventuales, Bucket Privado
--                `trade-asistencia-fotos` (2 MB, WebP), RLS y RPC Atómica.
-- Zona Horaria Oficial: America/Caracas
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. FUNCIÓN AUXILIAR DE ROLES AUTORIZADOS (SECURITY INVOKER)
-- Verifica que el usuario autenticado tenga un rol autorizado en
-- `public.profiles` o reclamos de aplicación (`app_metadata`).
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_authorized_trade_attendance_role()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_uid UUID;
    v_profile_role TEXT;
    v_app_role TEXT;
BEGIN
    v_uid := (SELECT auth.uid());
    IF v_uid IS NULL THEN
        RETURN FALSE;
    END IF;

    -- 1. Consultar rol en public.profiles si existe registro para auth.uid()
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'profiles'
    ) THEN
        SELECT lower(trim(role::text))
        INTO v_profile_role
        FROM public.profiles
        WHERE id = v_uid
          AND COALESCE(is_active, true) = true
        LIMIT 1;
    END IF;

    IF v_profile_role IN (
        'admin',
        'presidente',
        'gerente',
        'gerencia',
        'supervisor_trade',
        'coordinador',
        'supervisor',
        'trade_marketing',
        'promotora'
    ) THEN
        RETURN TRUE;
    END IF;

    -- 2. Respaldo sobre app_metadata (nunca user_metadata)
    v_app_role := lower(trim(COALESCE((SELECT auth.jwt() -> 'app_metadata' ->> 'role'), '')));
    IF v_app_role IN (
        'admin',
        'presidente',
        'gerente',
        'gerencia',
        'supervisor_trade',
        'coordinador',
        'supervisor',
        'trade_marketing',
        'promotora'
    ) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;

-- --------------------------------------------------------------------
-- 2. TABLA MAESTRA: public.trade_promotoras
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trade_promotoras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo TEXT UNIQUE,
    cedula TEXT NOT NULL UNIQUE,
    nombre_completo TEXT NOT NULL,
    telefono TEXT,
    tipo_promotora TEXT NOT NULL CHECK (tipo_promotora IN ('fija', 'eventual')),
    zona TEXT,
    supervisor_nombre TEXT,
    cliente_habitual_id UUID NULL,
    punto_venta_habitual TEXT,
    activa BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_trade_promotoras_cedula_sin_espacios CHECK (cedula = regexp_replace(cedula, '\s+', '', 'g'))
);

COMMENT ON TABLE public.trade_promotoras IS 'Catálogo maestro de Promotoras Fijas y Eventuales del módulo Trade Marketing.';

-- Enlace opcional dinámico de cliente_habitual_id hacia public.clientes(id) o public.clients(id)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'clientes'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE table_schema = 'public'
              AND table_name = 'trade_promotoras'
              AND constraint_name = 'fk_trade_promotoras_cliente_habitual'
        ) THEN
            ALTER TABLE public.trade_promotoras
                ADD CONSTRAINT fk_trade_promotoras_cliente_habitual
                FOREIGN KEY (cliente_habitual_id) REFERENCES public.clientes(id) ON DELETE SET NULL;
        END IF;
    ELSIF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'clients'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE table_schema = 'public'
              AND table_name = 'trade_promotoras'
              AND constraint_name = 'fk_trade_promotoras_cliente_habitual'
        ) THEN
            ALTER TABLE public.trade_promotoras
                ADD CONSTRAINT fk_trade_promotoras_cliente_habitual
                FOREIGN KEY (cliente_habitual_id) REFERENCES public.clients(id) ON DELETE SET NULL;
        END IF;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_trade_promotoras_tipo_activa
    ON public.trade_promotoras (tipo_promotora, activa);
CREATE INDEX IF NOT EXISTS idx_trade_promotoras_cliente_habitual
    ON public.trade_promotoras (cliente_habitual_id);

-- Trigger para normalizar cédula sin espacios y actualizar updated_at
CREATE OR REPLACE FUNCTION public.trg_fn_normalize_trade_promotora()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    NEW.cedula := upper(regexp_replace(trim(COALESCE(NEW.cedula, '')), '\s+', '', 'g'));
    NEW.nombre_completo := trim(COALESCE(NEW.nombre_completo, ''));
    IF NEW.codigo IS NOT NULL THEN
        NEW.codigo := upper(trim(NEW.codigo));
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_trade_promotora ON public.trade_promotoras;
CREATE TRIGGER trg_normalize_trade_promotora
BEFORE INSERT OR UPDATE ON public.trade_promotoras
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_normalize_trade_promotora();

-- --------------------------------------------------------------------
-- 3. TABLA OPERATIVA: public.trade_asistencia_jornadas
-- Gestiona exactamente 4 turnos fotográficos por jornada diaria:
-- 1) manana_entrada  2) manana_salida  3) tarde_entrada  4) tarde_salida
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trade_asistencia_jornadas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promotora_id UUID NOT NULL REFERENCES public.trade_promotoras(id) ON DELETE RESTRICT,
    fecha_jornada DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/Caracas')::date,
    tipo_promotora_snapshot TEXT NOT NULL CHECK (tipo_promotora_snapshot IN ('fija', 'eventual')),
    cliente_id UUID NULL,
    punto_venta TEXT NOT NULL,
    zona TEXT,

    -- Turno 1 - Mañana Entrada
    foto_manana_entrada_path TEXT,
    hora_manana_entrada TIMESTAMPTZ,
    usuario_manana_entrada UUID REFERENCES auth.users(id),

    -- Turno 2 - Mañana Salida
    foto_manana_salida_path TEXT,
    hora_manana_salida TIMESTAMPTZ,
    usuario_manana_salida UUID REFERENCES auth.users(id),

    -- Turno 3 - Tarde Entrada
    foto_tarde_entrada_path TEXT,
    hora_tarde_entrada TIMESTAMPTZ,
    usuario_tarde_entrada UUID REFERENCES auth.users(id),

    -- Turno 4 - Tarde Salida
    foto_tarde_salida_path TEXT,
    hora_tarde_salida TIMESTAMPTZ,
    usuario_tarde_salida UUID REFERENCES auth.users(id),

    -- Control y Auditoría
    marcajes_completados SMALLINT GENERATED ALWAYS AS (
        (CASE WHEN foto_manana_entrada_path IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN foto_manana_salida_path IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN foto_tarde_entrada_path IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN foto_tarde_salida_path IS NOT NULL THEN 1 ELSE 0 END)
    ) STORED,
    estado_jornada TEXT NOT NULL DEFAULT 'pendiente' CHECK (
        estado_jornada IN ('pendiente', 'en_progreso', 'parcial_justificada', 'completa', 'incidencia')
    ),
    observaciones TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_trade_asistencia_promotora_fecha UNIQUE (promotora_id, fecha_jornada),
    CONSTRAINT chk_foto_manana_entrada_storage_path CHECK (
        foto_manana_entrada_path IS NULL OR
        foto_manana_entrada_path ~ '^[0-9]{4}/[0-9]{2}/[0-9]{4}-[0-9]{2}-[0-9]{2}/(fija|eventual)/[0-9a-fA-F-]{36}/manana_entrada_[0-9]+\.webp$'
    ),
    CONSTRAINT chk_foto_manana_salida_storage_path CHECK (
        foto_manana_salida_path IS NULL OR
        foto_manana_salida_path ~ '^[0-9]{4}/[0-9]{2}/[0-9]{4}-[0-9]{2}-[0-9]{2}/(fija|eventual)/[0-9a-fA-F-]{36}/manana_salida_[0-9]+\.webp$'
    ),
    CONSTRAINT chk_foto_tarde_entrada_storage_path CHECK (
        foto_tarde_entrada_path IS NULL OR
        foto_tarde_entrada_path ~ '^[0-9]{4}/[0-9]{2}/[0-9]{4}-[0-9]{2}-[0-9]{2}/(fija|eventual)/[0-9a-fA-F-]{36}/tarde_entrada_[0-9]+\.webp$'
    ),
    CONSTRAINT chk_foto_tarde_salida_storage_path CHECK (
        foto_tarde_salida_path IS NULL OR
        foto_tarde_salida_path ~ '^[0-9]{4}/[0-9]{2}/[0-9]{4}-[0-9]{2}-[0-9]{2}/(fija|eventual)/[0-9a-fA-F-]{36}/tarde_salida_[0-9]+\.webp$'
    )
);

COMMENT ON TABLE public.trade_asistencia_jornadas IS 'Control diario de asistencia de promotoras con 4 evidencias fotográficas por jornada (Mañana Entrada/Salida y Tarde Entrada/Salida).';

-- Índices obligatorios de rendimiento y filtrado
CREATE INDEX IF NOT EXISTS idx_trade_asistencia_fecha_jornada
    ON public.trade_asistencia_jornadas (fecha_jornada);
CREATE INDEX IF NOT EXISTS idx_trade_asistencia_tipo_fecha
    ON public.trade_asistencia_jornadas (tipo_promotora_snapshot, fecha_jornada);
CREATE INDEX IF NOT EXISTS idx_trade_asistencia_estado
    ON public.trade_asistencia_jornadas (estado_jornada);
CREATE INDEX IF NOT EXISTS idx_trade_asistencia_promotora_id
    ON public.trade_asistencia_jornadas (promotora_id);

-- Trigger para preservar inmutabilidad del snapshot histórico `tipo_promotora_snapshot` y actualizar `updated_at`
CREATE OR REPLACE FUNCTION public.trg_fn_protect_trade_asistencia_jornada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.tipo_promotora_snapshot IS DISTINCT FROM NEW.tipo_promotora_snapshot THEN
        RAISE EXCEPTION 'SNAPSHOT_IMMUTABILITY_VIOLATION: No se puede alterar tipo_promotora_snapshot (%) de una jornada ya registrada.', OLD.tipo_promotora_snapshot;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_trade_asistencia_jornada ON public.trade_asistencia_jornadas;
CREATE TRIGGER trg_protect_trade_asistencia_jornada
BEFORE UPDATE ON public.trade_asistencia_jornadas
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_protect_trade_asistencia_jornada();

-- --------------------------------------------------------------------
-- 4. FUNCIÓN RPC TRANSACCIONAL: public.rpc_registrar_turno_asistencia_trade
-- Actualiza de forma aislada y atómica únicamente el turno indicado
-- sin sobrescribir las otras 3 ranuras fotográficas de la fecha.
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_registrar_turno_asistencia_trade(
    p_promotora_id UUID,
    p_fecha DATE,
    p_turno TEXT,
    p_storage_path TEXT,
    p_punto_venta TEXT,
    p_cliente_id UUID DEFAULT NULL,
    p_zona TEXT DEFAULT NULL,
    p_observaciones TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_turno TEXT := lower(trim(COALESCE(p_turno, '')));
    v_fecha DATE := COALESCE(p_fecha, (now() AT TIME ZONE 'America/Caracas')::date);
    v_now TIMESTAMPTZ := now();
    v_uid UUID := (SELECT auth.uid());
    v_promotora RECORD;
    v_jornada public.trade_asistencia_jornadas%ROWTYPE;
    v_prev_storage_path TEXT := NULL;
    v_punto_venta TEXT;
    v_zona TEXT;
    v_observaciones_final TEXT;
    v_auto_warning TEXT := NULL;
    v_foto_me TEXT;
    v_foto_ms TEXT;
    v_foto_te TEXT;
    v_foto_ts TEXT;
    v_count INT;
    v_nuevo_estado TEXT;
BEGIN
    -- 1. Validar turno permitido
    IF v_turno NOT IN ('manana_entrada', 'manana_salida', 'tarde_entrada', 'tarde_salida') THEN
        RAISE EXCEPTION 'INVALID_TURNO: El turno "%" no es válido. Valores permitidos: manana_entrada, manana_salida, tarde_entrada, tarde_salida.', p_turno;
    END IF;

    -- 2. Validar ruta interna de Storage (nunca Base64 ni URLs externas)
    IF p_storage_path IS NULL OR trim(p_storage_path) = '' OR p_storage_path LIKE 'data:%' OR p_storage_path LIKE 'http%' THEN
        RAISE EXCEPTION 'INVALID_STORAGE_PATH: Debe proporcionar una ruta interna válida del bucket privado trade-asistencia-fotos.';
    END IF;

    -- 3. Obtener promotora maestra para snapshot y valores por defecto
    SELECT id, tipo_promotora, punto_venta_habitual, zona, cliente_habitual_id
    INTO v_promotora
    FROM public.trade_promotoras
    WHERE id = p_promotora_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PROMOTORA_NOT_FOUND: No existe la promotora con id %.', p_promotora_id;
    END IF;

    v_punto_venta := COALESCE(NULLIF(trim(p_punto_venta), ''), NULLIF(trim(v_promotora.punto_venta_habitual), ''), 'Punto de Venta Asignado');
    v_zona := COALESCE(NULLIF(trim(p_zona), ''), v_promotora.zona);

    -- 4. Asegurar existencia de la fila diaria sin sobrescribir turnos previos
    INSERT INTO public.trade_asistencia_jornadas (
        promotora_id,
        fecha_jornada,
        tipo_promotora_snapshot,
        cliente_id,
        punto_venta,
        zona,
        estado_jornada
    )
    VALUES (
        p_promotora_id,
        v_fecha,
        v_promotora.tipo_promotora,
        COALESCE(p_cliente_id, v_promotora.cliente_habitual_id),
        v_punto_venta,
        v_zona,
        'pendiente'
    )
    ON CONFLICT (promotora_id, fecha_jornada) DO NOTHING;

    -- 5. Bloquear la fila del día para actualización atómica por ranura
    SELECT *
    INTO v_jornada
    FROM public.trade_asistencia_jornadas
    WHERE promotora_id = p_promotora_id
      AND fecha_jornada = v_fecha
    FOR UPDATE;

    -- Conservar los 4 paths actuales y reemplazar únicamente el del turno invocado
    v_foto_me := v_jornada.foto_manana_entrada_path;
    v_foto_ms := v_jornada.foto_manana_salida_path;
    v_foto_te := v_jornada.foto_tarde_entrada_path;
    v_foto_ts := v_jornada.foto_tarde_salida_path;

    IF v_turno = 'manana_entrada' THEN
        v_prev_storage_path := v_jornada.foto_manana_entrada_path;
        v_foto_me := p_storage_path;
    ELSIF v_turno = 'manana_salida' THEN
        v_prev_storage_path := v_jornada.foto_manana_salida_path;
        v_foto_ms := p_storage_path;
        IF v_foto_me IS NULL THEN
            v_auto_warning := '[Auditoría: Salida Mañana registrada sin Entrada Mañana previa]';
        END IF;
    ELSIF v_turno = 'tarde_entrada' THEN
        v_prev_storage_path := v_jornada.foto_tarde_entrada_path;
        v_foto_te := p_storage_path;
        IF v_foto_me IS NULL AND v_foto_ms IS NULL AND NULLIF(trim(COALESCE(p_observaciones, v_jornada.observaciones, '')), '') IS NULL THEN
            v_auto_warning := '[Auditoría: Inicio en bloque Tarde sin marcajes de Mañana]';
        END IF;
    ELSIF v_turno = 'tarde_salida' THEN
        v_prev_storage_path := v_jornada.foto_tarde_salida_path;
        v_foto_ts := p_storage_path;
        IF v_foto_te IS NULL THEN
            v_auto_warning := '[Auditoría: Salida Tarde registrada sin Entrada Tarde previa]';
        END IF;
    END IF;

    -- Consolidar observaciones preservando notas previas
    v_observaciones_final := COALESCE(NULLIF(trim(p_observaciones), ''), v_jornada.observaciones);
    IF v_auto_warning IS NOT NULL THEN
        IF v_observaciones_final IS NULL OR v_observaciones_final = '' THEN
            v_observaciones_final := v_auto_warning;
        ELSIF position(v_auto_warning IN v_observaciones_final) = 0 THEN
            v_observaciones_final := v_observaciones_final || ' ' || v_auto_warning;
        END IF;
    END IF;

    -- Calcular conteo de fotos tras aplicar el turno
    v_count :=
        (CASE WHEN v_foto_me IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN v_foto_ms IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN v_foto_te IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN v_foto_ts IS NOT NULL THEN 1 ELSE 0 END);

    -- Determinar estado_jornada automáticamente
    IF v_count = 4 THEN
        v_nuevo_estado := 'completa';
    ELSIF v_count = 0 THEN
        v_nuevo_estado := 'pendiente';
    ELSE
        IF (v_turno = 'manana_salida' AND v_foto_me IS NULL AND NULLIF(trim(COALESCE(p_observaciones, '')), '') IS NULL)
           OR (v_turno = 'tarde_salida' AND v_foto_te IS NULL AND NULLIF(trim(COALESCE(p_observaciones, '')), '') IS NULL) THEN
            v_nuevo_estado := 'incidencia';
        ELSIF NULLIF(trim(COALESCE(p_observaciones, '')), '') IS NOT NULL
              AND (
                  (v_turno = 'tarde_entrada' AND v_foto_me IS NULL AND v_foto_ms IS NULL)
                  OR v_jornada.estado_jornada = 'parcial_justificada'
              ) THEN
            v_nuevo_estado := 'parcial_justificada';
        ELSIF v_jornada.estado_jornada IN ('parcial_justificada', 'incidencia') AND v_count < 4 THEN
            v_nuevo_estado := v_jornada.estado_jornada;
        ELSE
            v_nuevo_estado := 'en_progreso';
        END IF;
    END IF;

    -- 6. Actualizar aisladamente sólo las columnas del turno correspondiente
    UPDATE public.trade_asistencia_jornadas
    SET punto_venta = COALESCE(NULLIF(trim(p_punto_venta), ''), punto_venta),
        cliente_id = COALESCE(p_cliente_id, cliente_id),
        zona = COALESCE(NULLIF(trim(p_zona), ''), zona),
        foto_manana_entrada_path = CASE WHEN v_turno = 'manana_entrada' THEN p_storage_path ELSE foto_manana_entrada_path END,
        hora_manana_entrada      = CASE WHEN v_turno = 'manana_entrada' THEN v_now ELSE hora_manana_entrada END,
        usuario_manana_entrada   = CASE WHEN v_turno = 'manana_entrada' THEN COALESCE(v_uid, usuario_manana_entrada) ELSE usuario_manana_entrada END,
        foto_manana_salida_path  = CASE WHEN v_turno = 'manana_salida'  THEN p_storage_path ELSE foto_manana_salida_path END,
        hora_manana_salida       = CASE WHEN v_turno = 'manana_salida'  THEN v_now ELSE hora_manana_salida END,
        usuario_manana_salida    = CASE WHEN v_turno = 'manana_salida'  THEN COALESCE(v_uid, usuario_manana_salida) ELSE usuario_manana_salida END,
        foto_tarde_entrada_path  = CASE WHEN v_turno = 'tarde_entrada'  THEN p_storage_path ELSE foto_tarde_entrada_path END,
        hora_tarde_entrada       = CASE WHEN v_turno = 'tarde_entrada'  THEN v_now ELSE hora_tarde_entrada END,
        usuario_tarde_entrada    = CASE WHEN v_turno = 'tarde_entrada'  THEN COALESCE(v_uid, usuario_tarde_entrada) ELSE usuario_tarde_entrada END,
        foto_tarde_salida_path   = CASE WHEN v_turno = 'tarde_salida'   THEN p_storage_path ELSE foto_tarde_salida_path END,
        hora_tarde_salida        = CASE WHEN v_turno = 'tarde_salida'   THEN v_now ELSE hora_tarde_salida END,
        usuario_tarde_salida     = CASE WHEN v_turno = 'tarde_salida'   THEN COALESCE(v_uid, usuario_tarde_salida) ELSE usuario_tarde_salida END,
        estado_jornada           = v_nuevo_estado,
        observaciones            = v_observaciones_final,
        updated_at               = v_now
    WHERE id = v_jornada.id
    RETURNING * INTO v_jornada;

    RETURN jsonb_build_object(
        'jornada', to_jsonb(v_jornada),
        'turno_actualizado', v_turno,
        'previous_storage_path', v_prev_storage_path,
        'server_timestamp_utc', v_now,
        'fecha_caracas', (v_now AT TIME ZONE 'America/Caracas')::date
    );
END;
$$;

-- Permisos de ejecución explícitos solo para usuarios autenticados (nunca anon)
REVOKE ALL ON FUNCTION public.rpc_registrar_turno_asistencia_trade(UUID, DATE, TEXT, TEXT, TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_registrar_turno_asistencia_trade(UUID, DATE, TEXT, TEXT, TEXT, UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_registrar_turno_asistencia_trade(UUID, DATE, TEXT, TEXT, TEXT, UUID, TEXT, TEXT) TO authenticated;

-- Permisos de tablas sobre el Data API (protegidos por RLS)
REVOKE ALL ON public.trade_promotoras FROM anon;
REVOKE ALL ON public.trade_asistencia_jornadas FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.trade_promotoras TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.trade_asistencia_jornadas TO authenticated;

-- --------------------------------------------------------------------
-- 5. SEGURIDAD RLS EN TABLAS DE NEGOCIO
-- --------------------------------------------------------------------
ALTER TABLE public.trade_promotoras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_asistencia_jornadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trade_promotoras_select_authenticated" ON public.trade_promotoras;
CREATE POLICY "trade_promotoras_select_authenticated"
ON public.trade_promotoras
FOR SELECT
TO authenticated
USING (public.is_authorized_trade_attendance_role());

DROP POLICY IF EXISTS "trade_promotoras_insert_authenticated" ON public.trade_promotoras;
CREATE POLICY "trade_promotoras_insert_authenticated"
ON public.trade_promotoras
FOR INSERT
TO authenticated
WITH CHECK (public.is_authorized_trade_attendance_role());

DROP POLICY IF EXISTS "trade_promotoras_update_authenticated" ON public.trade_promotoras;
CREATE POLICY "trade_promotoras_update_authenticated"
ON public.trade_promotoras
FOR UPDATE
TO authenticated
USING (public.is_authorized_trade_attendance_role())
WITH CHECK (public.is_authorized_trade_attendance_role());

DROP POLICY IF EXISTS "trade_asistencia_jornadas_select_authenticated" ON public.trade_asistencia_jornadas;
CREATE POLICY "trade_asistencia_jornadas_select_authenticated"
ON public.trade_asistencia_jornadas
FOR SELECT
TO authenticated
USING (public.is_authorized_trade_attendance_role());

DROP POLICY IF EXISTS "trade_asistencia_jornadas_insert_authenticated" ON public.trade_asistencia_jornadas;
CREATE POLICY "trade_asistencia_jornadas_insert_authenticated"
ON public.trade_asistencia_jornadas
FOR INSERT
TO authenticated
WITH CHECK (public.is_authorized_trade_attendance_role());

DROP POLICY IF EXISTS "trade_asistencia_jornadas_update_authenticated" ON public.trade_asistencia_jornadas;
CREATE POLICY "trade_asistencia_jornadas_update_authenticated"
ON public.trade_asistencia_jornadas
FOR UPDATE
TO authenticated
USING (public.is_authorized_trade_attendance_role())
WITH CHECK (public.is_authorized_trade_attendance_role());

-- --------------------------------------------------------------------
-- 6. SUPABASE STORAGE: BUCKET PRIVADO `trade-asistencia-fotos` Y RLS
-- Límite estricto: 2 MB (2,097,152 bytes)
-- Tipos MIME: image/webp, image/jpeg, image/png
-- Estructura de ruta: {anio}/{mes}/{fecha_jornada}/{tipo_promotora}/{promotora_id}/{turno}_{timestamp}.webp
-- --------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES (
            'trade-asistencia-fotos',
            'trade-asistencia-fotos',
            false,
            2097152,
            ARRAY['image/webp', 'image/jpeg', 'image/png']
        )
        ON CONFLICT (id) DO UPDATE
        SET public = false,
            file_size_limit = 2097152,
            allowed_mime_types = ARRAY['image/webp', 'image/jpeg', 'image/png'];
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
        DROP POLICY IF EXISTS "trade_asistencia_fotos_select_auth" ON storage.objects;
        CREATE POLICY "trade_asistencia_fotos_select_auth"
        ON storage.objects
        FOR SELECT
        TO authenticated
        USING (
            bucket_id = 'trade-asistencia-fotos'
            AND public.is_authorized_trade_attendance_role()
        );

        DROP POLICY IF EXISTS "trade_asistencia_fotos_insert_auth" ON storage.objects;
        CREATE POLICY "trade_asistencia_fotos_insert_auth"
        ON storage.objects
        FOR INSERT
        TO authenticated
        WITH CHECK (
            bucket_id = 'trade-asistencia-fotos'
            AND public.is_authorized_trade_attendance_role()
            AND name ~ '^[0-9]{4}/[0-9]{2}/[0-9]{4}-[0-9]{2}-[0-9]{2}/(fija|eventual)/[0-9a-fA-F-]{36}/(manana_entrada|manana_salida|tarde_entrada|tarde_salida)_[0-9]+\.webp$'
        );

        DROP POLICY IF EXISTS "trade_asistencia_fotos_update_auth" ON storage.objects;
        CREATE POLICY "trade_asistencia_fotos_update_auth"
        ON storage.objects
        FOR UPDATE
        TO authenticated
        USING (
            bucket_id = 'trade-asistencia-fotos'
            AND public.is_authorized_trade_attendance_role()
        )
        WITH CHECK (
            bucket_id = 'trade-asistencia-fotos'
            AND public.is_authorized_trade_attendance_role()
            AND name ~ '^[0-9]{4}/[0-9]{2}/[0-9]{4}-[0-9]{2}-[0-9]{2}/(fija|eventual)/[0-9a-fA-F-]{36}/(manana_entrada|manana_salida|tarde_entrada|tarde_salida)_[0-9]+\.webp$'
        );

        DROP POLICY IF EXISTS "trade_asistencia_fotos_delete_auth" ON storage.objects;
        CREATE POLICY "trade_asistencia_fotos_delete_auth"
        ON storage.objects
        FOR DELETE
        TO authenticated
        USING (
            bucket_id = 'trade-asistencia-fotos'
            AND public.is_authorized_trade_attendance_role()
        );
    END IF;
END $$;

-- Registrar versión de migración 009 si existe tabla de control
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'schema_versions') THEN
        INSERT INTO public.schema_versions (version, description)
        VALUES ('009', 'Control diario de Asistencia Trade Marketing (4 turnos fotográficos, bucket privado trade-asistencia-fotos y RPC atómica)')
        ON CONFLICT (version) DO NOTHING;
    END IF;
END $$;
