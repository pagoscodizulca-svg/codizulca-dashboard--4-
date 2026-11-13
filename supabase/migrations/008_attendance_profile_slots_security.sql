-- ====================================================================
-- MIGRACIÓN 008: Lógica Condicional de Asistencia (FIJA vs EVENTUAL),
--                Inmutabilidad Histórica (perfil_aplicado), Unicidad por
--                Ranura (Idempotencia) y Bucket Privado de Evidencias.
-- Sistema: Codizulca Dashboard & Portal Móvil (Informes > Asistencia)
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. TABLA: asistencias_diarias
-- Cabecera diaria por promotora con snapshot inmutable de `perfil_aplicado`
-- y marca de tiempo oficial en zona horaria America/Caracas (UTC-4).
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.asistencias_diarias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fecha DATE NOT NULL,
    promotora_id TEXT NOT NULL,
    promotora_nombre TEXT NOT NULL,
    perfil_aplicado TEXT NOT NULL CHECK (perfil_aplicado IN ('FIJA', 'EVENTUAL')),
    pdv_store TEXT NOT NULL DEFAULT 'Punto de Venta',
    opened_at_server TIMESTAMPTZ NOT NULL DEFAULT now(),
    opened_at_caracas TIMESTAMP WITHOUT TIME ZONE GENERATED ALWAYS AS (timezone('America/Caracas', opened_at_server)) STORED,
    updated_at_server TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_asistencias_diarias_fecha_promotora UNIQUE (fecha, promotora_id)
);

COMMENT ON TABLE public.asistencias_diarias IS 'Registro maestro diario de asistencia con snapshot inmutable de perfil_aplicado (FIJA o EVENTUAL).';

CREATE INDEX IF NOT EXISTS idx_asistencias_diarias_fecha ON public.asistencias_diarias(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_asistencias_diarias_promotora ON public.asistencias_diarias(promotora_id, fecha DESC);

-- Trigger para garantizar la Inmutabilidad Histórica de `perfil_aplicado`
CREATE OR REPLACE FUNCTION public.enforce_asistencia_perfil_snapshot_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    IF OLD.perfil_aplicado IS DISTINCT FROM NEW.perfil_aplicado THEN
        RAISE EXCEPTION 'SNAPSHOT_IMMUTABILITY_VIOLATION: No se permite modificar perfil_aplicado (%) de un registro histórico ya abierto.', OLD.perfil_aplicado;
    END IF;
    NEW.updated_at_server := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_asistencia_perfil_snapshot ON public.asistencias_diarias;
CREATE TRIGGER trg_freeze_asistencia_perfil_snapshot
BEFORE UPDATE ON public.asistencias_diarias
FOR EACH ROW
EXECUTE FUNCTION public.enforce_asistencia_perfil_snapshot_immutability();

-- --------------------------------------------------------------------
-- 2. TABLA: asistencia_evidencias
-- Evidencias fotográficas por ranura con restricción única (asistencia_id, slot_foto)
-- y coherencia estricta entre perfil_aplicado y slot_foto.
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.asistencia_evidencias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asistencia_id UUID NOT NULL REFERENCES public.asistencias_diarias(id) ON DELETE CASCADE,
    promotora_id TEXT NOT NULL,
    perfil_aplicado TEXT NOT NULL CHECK (perfil_aplicado IN ('FIJA', 'EVENTUAL')),
    slot_foto TEXT NOT NULL CHECK (
        slot_foto IN (
            'JORNADA_INGRESO',
            'JORNADA_SALIDA',
            'MANANA_INGRESO',
            'MANANA_SALIDA',
            'TARDE_INGRESO',
            'TARDE_SALIDA'
        )
    ),
    storage_path TEXT NOT NULL CHECK (
        storage_path ~ '^asistencia/[0-9]{4}-[0-9]{2}-[0-9]{2}/[A-Za-z0-9_-]+/(JORNADA_INGRESO|JORNADA_SALIDA|MANANA_INGRESO|MANANA_SALIDA|TARDE_INGRESO|TARDE_SALIDA)_[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
    ),
    mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
    byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 5242880),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    accuracy_meters DOUBLE PRECISION,
    server_uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    caracas_uploaded_at TIMESTAMP WITHOUT TIME ZONE GENERATED ALWAYS AS (timezone('America/Caracas', server_uploaded_at)) STORED,
    CONSTRAINT uq_asistencia_evidencias_slot UNIQUE (asistencia_id, slot_foto),
    CONSTRAINT chk_asistencia_perfil_slot_coherence CHECK (
        (perfil_aplicado = 'FIJA' AND slot_foto IN ('JORNADA_INGRESO', 'JORNADA_SALIDA'))
        OR
        (perfil_aplicado = 'EVENTUAL' AND slot_foto IN ('MANANA_INGRESO', 'MANANA_SALIDA', 'TARDE_INGRESO', 'TARDE_SALIDA'))
    )
);

COMMENT ON TABLE public.asistencia_evidencias IS 'Evidencias fotográficas diarias validadas por ranura (FIJA: 2 fotos; EVENTUAL: 4 fotos).';

CREATE INDEX IF NOT EXISTS idx_asistencia_evidencias_asistencia_id ON public.asistencia_evidencias(asistencia_id);
CREATE INDEX IF NOT EXISTS idx_asistencia_evidencias_promotora ON public.asistencia_evidencias(promotora_id);

-- Trigger de servidor en PostgreSQL para validar coherencia con cabecera y límite de fotos (2 FIJA / 4 EVENTUAL)
CREATE OR REPLACE FUNCTION public.validate_asistencia_evidencia_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_header_perfil TEXT;
    v_current_count INTEGER;
    v_max_allowed INTEGER;
BEGIN
    SELECT perfil_aplicado INTO v_header_perfil
    FROM public.asistencias_diarias
    WHERE id = NEW.asistencia_id;

    IF v_header_perfil IS NULL THEN
        RAISE EXCEPTION 'ASISTENCIA_HEADER_NOT_FOUND: No existe cabecera diaria para asistencia_id %', NEW.asistencia_id;
    END IF;

    IF NEW.perfil_aplicado IS DISTINCT FROM v_header_perfil THEN
        RAISE EXCEPTION 'PROFILE_SNAPSHOT_MISMATCH: El perfil de la evidencia (%) no coincide con el perfil_aplicado del día (%).', NEW.perfil_aplicado, v_header_perfil;
    END IF;

    v_max_allowed := CASE WHEN v_header_perfil = 'EVENTUAL' THEN 4 ELSE 2 END;

    SELECT COUNT(*) INTO v_current_count
    FROM public.asistencia_evidencias
    WHERE asistencia_id = NEW.asistencia_id
      AND slot_foto <> NEW.slot_foto;

    IF (v_current_count + 1) > v_max_allowed THEN
        RAISE EXCEPTION 'MAX_SLOTS_EXCEEDED: El perfil % permite máximo % evidencias por jornada.', v_header_perfil, v_max_allowed;
    END IF;

    NEW.server_uploaded_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_asistencia_max_photos ON public.asistencia_evidencias;
CREATE TRIGGER trg_enforce_asistencia_max_photos
BEFORE INSERT OR UPDATE ON public.asistencia_evidencias
FOR EACH ROW
EXECUTE FUNCTION public.validate_asistencia_evidencia_quota();

-- --------------------------------------------------------------------
-- 3. EXTENSIÓN COMPATIBLE SOBRE public.checkins
-- --------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'checkins') THEN
        ALTER TABLE public.checkins
            ADD COLUMN IF NOT EXISTS asistencia_id TEXT,
            ADD COLUMN IF NOT EXISTS perfil_aplicado TEXT CHECK (perfil_aplicado IS NULL OR perfil_aplicado IN ('FIJA', 'EVENTUAL')),
            ADD COLUMN IF NOT EXISTS slot_foto TEXT CHECK (
                slot_foto IS NULL OR slot_foto IN (
                    'JORNADA_INGRESO',
                    'JORNADA_SALIDA',
                    'MANANA_INGRESO',
                    'MANANA_SALIDA',
                    'TARDE_INGRESO',
                    'TARDE_SALIDA'
                )
            ),
            ADD COLUMN IF NOT EXISTS storage_path TEXT,
            ADD COLUMN IF NOT EXISTS server_uploaded_at TIMESTAMPTZ DEFAULT now();

        ALTER TABLE public.checkins DROP CONSTRAINT IF EXISTS chk_checkins_perfil_slot_coherence;
        ALTER TABLE public.checkins ADD CONSTRAINT chk_checkins_perfil_slot_coherence CHECK (
            perfil_aplicado IS NULL OR slot_foto IS NULL OR
            (perfil_aplicado = 'FIJA' AND slot_foto IN ('JORNADA_INGRESO', 'JORNADA_SALIDA')) OR
            (perfil_aplicado = 'EVENTUAL' AND slot_foto IN ('MANANA_INGRESO', 'MANANA_SALIDA', 'TARDE_INGRESO', 'TARDE_SALIDA'))
        );

        CREATE UNIQUE INDEX IF NOT EXISTS uq_checkins_asistencia_slot
            ON public.checkins (asistencia_id, slot_foto)
            WHERE asistencia_id IS NOT NULL AND slot_foto IS NOT NULL;
    END IF;
END $$;

-- --------------------------------------------------------------------
-- 4. POLÍTICAS RLS (ROW LEVEL SECURITY)
-- Siguiendo las mejores prácticas de Supabase: uso de TO authenticated
-- y predicados explícitos de propiedad o rol con USING + WITH CHECK.
-- --------------------------------------------------------------------
ALTER TABLE public.asistencias_diarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asistencia_evidencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asistencias_diarias_select_policy" ON public.asistencias_diarias;
CREATE POLICY "asistencias_diarias_select_policy"
ON public.asistencias_diarias
FOR SELECT
TO authenticated
USING (
    (select auth.uid())::text = promotora_id
    OR public.get_user_role() IN ('admin', 'presidente', 'gerente', 'supervisor')
);

DROP POLICY IF EXISTS "asistencias_diarias_insert_policy" ON public.asistencias_diarias;
CREATE POLICY "asistencias_diarias_insert_policy"
ON public.asistencias_diarias
FOR INSERT
TO authenticated
WITH CHECK (
    (select auth.uid())::text = promotora_id
    OR public.get_user_role() IN ('admin', 'gerente', 'supervisor')
);

DROP POLICY IF EXISTS "asistencias_diarias_update_policy" ON public.asistencias_diarias;
CREATE POLICY "asistencias_diarias_update_policy"
ON public.asistencias_diarias
FOR UPDATE
TO authenticated
USING (
    (select auth.uid())::text = promotora_id
    OR public.get_user_role() IN ('admin', 'gerente', 'supervisor')
)
WITH CHECK (
    (select auth.uid())::text = promotora_id
    OR public.get_user_role() IN ('admin', 'gerente', 'supervisor')
);

DROP POLICY IF EXISTS "asistencia_evidencias_select_policy" ON public.asistencia_evidencias;
CREATE POLICY "asistencia_evidencias_select_policy"
ON public.asistencia_evidencias
FOR SELECT
TO authenticated
USING (
    (select auth.uid())::text = promotora_id
    OR public.get_user_role() IN ('admin', 'presidente', 'gerente', 'supervisor')
);

DROP POLICY IF EXISTS "asistencia_evidencias_insert_policy" ON public.asistencia_evidencias;
CREATE POLICY "asistencia_evidencias_insert_policy"
ON public.asistencia_evidencias
FOR INSERT
TO authenticated
WITH CHECK (
    (
        (select auth.uid())::text = promotora_id
        OR public.get_user_role() IN ('admin', 'gerente', 'supervisor')
    )
    AND (
        (perfil_aplicado = 'FIJA' AND slot_foto IN ('JORNADA_INGRESO', 'JORNADA_SALIDA'))
        OR
        (perfil_aplicado = 'EVENTUAL' AND slot_foto IN ('MANANA_INGRESO', 'MANANA_SALIDA', 'TARDE_INGRESO', 'TARDE_SALIDA'))
    )
);

DROP POLICY IF EXISTS "asistencia_evidencias_update_policy" ON public.asistencia_evidencias;
CREATE POLICY "asistencia_evidencias_update_policy"
ON public.asistencia_evidencias
FOR UPDATE
TO authenticated
USING (
    (select auth.uid())::text = promotora_id
    OR public.get_user_role() IN ('admin', 'gerente', 'supervisor')
)
WITH CHECK (
    (
        (select auth.uid())::text = promotora_id
        OR public.get_user_role() IN ('admin', 'gerente', 'supervisor')
    )
    AND (
        (perfil_aplicado = 'FIJA' AND slot_foto IN ('JORNADA_INGRESO', 'JORNADA_SALIDA'))
        OR
        (perfil_aplicado = 'EVENTUAL' AND slot_foto IN ('MANANA_INGRESO', 'MANANA_SALIDA', 'TARDE_INGRESO', 'TARDE_SALIDA'))
    )
);

-- --------------------------------------------------------------------
-- 5. BUCKET PRIVADO DE SUPABASE STORAGE (`asistencia-evidencias`)
-- Bucket privado (public = false), máx 5 MB, solo JPEG, PNG, WEBP.
-- --------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES (
            'asistencia-evidencias',
            'asistencia-evidencias',
            false,
            5242880,
            ARRAY['image/jpeg', 'image/png', 'image/webp']
        )
        ON CONFLICT (id) DO UPDATE
        SET public = false,
            file_size_limit = 5242880,
            allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];
    END IF;
END $$;

-- Registrar versión de migración 008
INSERT INTO public.schema_versions (version, description)
VALUES ('008', 'Lógica condicional FIJA (2 fotos) vs EVENTUAL (4 fotos), snapshot histórico inmutable y bucket privado')
ON CONFLICT (version) DO NOTHING;
