export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string
          role: 'admin' | 'presidente' | 'gerente' | 'supervisor' | 'vendedor' | 'promotora'
          zone: string | null
          phone: string | null
          avatar_url: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'> & { created_at?: string, updated_at?: string }
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      clients: {
        Row: {
          id: string
          code: string
          name: string
          business_name: string | null
          tax_id: string | null
          zone: string
          address: string | null
          latitude: number | null
          longitude: number | null
          geofence_radius_meters: number
          contact_name: string | null
          contact_phone: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['clients']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string, created_at?: string, updated_at?: string }
        Update: Partial<Database['public']['Tables']['clients']['Insert']>
      }
      products: {
        Row: {
          id: string
          sku: string
          name: string
          category: string
          unit_of_measure: string
          units_per_box: number
          price: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['products']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string, created_at?: string, updated_at?: string }
        Update: Partial<Database['public']['Tables']['products']['Insert']>
      }
      import_logs: {
        Row: {
          id: string
          import_type: 'ventas' | 'cuotas' | 'inventario' | 'maestros'
          filename_or_source: string
          total_rows: number
          processed_rows: number
          rejected_rows: number
          status: 'pending' | 'processing' | 'completed' | 'failed'
          error_details: Json
          imported_by: string
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['import_logs']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string, created_at?: string, updated_at?: string }
        Update: Partial<Database['public']['Tables']['import_logs']['Insert']>
      }
      sales: {
        Row: {
          id: string
          invoice_number: string
          sale_date: string
          seller_id: string
          client_id: string
          product_id: string
          quantity_boxes: number
          unit_price: number
          total_amount: number
          period: string
          import_log_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['sales']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string, created_at?: string, updated_at?: string }
        Update: Partial<Database['public']['Tables']['sales']['Insert']>
      }
      sellers_quotas: {
        Row: {
          id: string
          seller_id: string
          period: string
          quota_boxes: number
          quota_amount: number
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['sellers_quotas']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string, created_at?: string, updated_at?: string }
        Update: Partial<Database['public']['Tables']['sellers_quotas']['Insert']>
      }
      inventory: {
        Row: {
          id: string
          product_id: string
          period: string
          initial_stock: number
          purchases: number
          adjustments: number
          sales_out: number
          final_stock: number
          min_alert_threshold: number
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['inventory']['Row'], 'id' | 'final_stock' | 'created_at' | 'updated_at'> & { id?: string, created_at?: string, updated_at?: string }
        Update: Partial<Database['public']['Tables']['inventory']['Insert']>
      }
      audit_trail: {
        Row: {
          id: string
          table_name: string
          record_id: string
          action: 'INSERT' | 'UPDATE' | 'DELETE'
          old_data: Json | null
          new_data: Json | null
          changed_by: string | null
          client_ip: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['audit_trail']['Row'], 'id' | 'created_at'> & { id?: string, created_at?: string }
        Update: Partial<Database['public']['Tables']['audit_trail']['Insert']>
      }
      check_ins: {
        Row: {
          id: string
          promoter_id: string
          client_id: string
          checkin_time: string
          checkout_time: string | null
          latitude: number
          longitude: number
          accuracy_meters: number | null
          distance_to_client_meters: number
          geofence_valid: boolean
          fake_gps_suspected: boolean
          fake_gps_reasons: Json
          battery_level: number | null
          device_info: Json
          offline_created_at: string | null
          synced_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['check_ins']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string, created_at?: string, updated_at?: string }
        Update: Partial<Database['public']['Tables']['check_ins']['Insert']>
      }
      surveys: {
        Row: {
          id: string
          check_in_id: string | null
          promoter_id: string
          client_id: string
          survey_type: 'breve' | 'profunda'
          responses: Json
          offline_created_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['surveys']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string, created_at?: string, updated_at?: string }
        Update: Partial<Database['public']['Tables']['surveys']['Insert']>
      }
      tastings_schedule: {
        Row: {
          id: string
          title: string
          promoter_id: string
          client_id: string
          scheduled_date: string
          start_time: string
          end_time: string
          status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
          target_samples: number
          delivered_samples: number
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['tastings_schedule']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string, created_at?: string, updated_at?: string }
        Update: Partial<Database['public']['Tables']['tastings_schedule']['Insert']>
      }
      store_audits: {
        Row: {
          id: string
          check_in_id: string | null
          promoter_id: string
          client_id: string
          photo_url: string
          status: 'pending' | 'analyzing' | 'completed' | 'failed'
          ai_analysis: Json | null
          confidence_score: number | null
          detected_skus: Json
          share_of_shelf: number | null
          out_of_stock_detected: boolean
          manual_override: boolean
          manual_notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['store_audits']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string, created_at?: string, updated_at?: string }
        Update: Partial<Database['public']['Tables']['store_audits']['Insert']>
      }
      ai_failed_jobs: {
        Row: {
          id: string
          job_type: 'shelf_audit' | 'dashboard_chat' | 'custom'
          reference_id: string
          payload: Json
          error_message: string
          attempts: number
          max_attempts: number
          next_retry_at: string | null
          status: 'pending' | 'exhausted' | 'resolved'
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['ai_failed_jobs']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string, created_at?: string, updated_at?: string }
        Update: Partial<Database['public']['Tables']['ai_failed_jobs']['Insert']>
      }
      ai_cache: {
        Row: {
          id: string
          cache_key: string
          query_hash: string
          response_content: string
          metadata: Json
          expires_at: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['ai_cache']['Row'], 'id' | 'created_at'> & { id?: string, created_at?: string }
        Update: Partial<Database['public']['Tables']['ai_cache']['Insert']>
      }
      system_settings: {
        Row: {
          id: string
          kill_switch_active: boolean
          kill_switch_message: string | null
          ai_vision_enabled: boolean
          ai_vision_model: string
          ai_daily_budget_max: number
          ai_daily_budget_used: number
          last_budget_reset_date: string
          default_geofence_meters: number
          fake_gps_strict_mode: boolean
          updated_by: string | null
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['system_settings']['Row'], 'id' | 'updated_at'> & { id?: string, updated_at?: string }
        Update: Partial<Database['public']['Tables']['system_settings']['Insert']>
      }
      trade_promotoras: {
        Row: {
          id: string
          codigo: string | null
          cedula: string
          nombre_completo: string
          telefono: string | null
          tipo_promotora: 'fija' | 'eventual'
          zona: string | null
          supervisor_nombre: string | null
          cliente_habitual_id: string | null
          punto_venta_habitual: string | null
          activa: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['trade_promotoras']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['trade_promotoras']['Insert']>
      }
      trade_asistencia_jornadas: {
        Row: {
          id: string
          promotora_id: string
          fecha_jornada: string
          tipo_promotora_snapshot: 'fija' | 'eventual'
          cliente_id: string | null
          punto_venta: string
          zona: string | null
          foto_manana_entrada_path: string | null
          hora_manana_entrada: string | null
          usuario_manana_entrada: string | null
          foto_manana_salida_path: string | null
          hora_manana_salida: string | null
          usuario_manana_salida: string | null
          foto_tarde_entrada_path: string | null
          hora_tarde_entrada: string | null
          usuario_tarde_entrada: string | null
          foto_tarde_salida_path: string | null
          hora_tarde_salida: string | null
          usuario_tarde_salida: string | null
          marcajes_completados: number
          estado_jornada: 'pendiente' | 'en_progreso' | 'parcial_justificada' | 'completa' | 'incidencia'
          observaciones: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['trade_asistencia_jornadas']['Row'], 'id' | 'marcajes_completados' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['trade_asistencia_jornadas']['Insert']>
      }
    }
    Views: {
      vw_quota_progress: {
        Row: {
          quota_id: string
          seller_id: string
          seller_name: string
          seller_email: string
          seller_zone: string | null
          period: string
          quota_boxes: number
          quota_amount: number
          sold_boxes: number
          sold_amount: number
          active_clients_sold: number
          invoices_count: number
          percent_boxes_completed: number
          percent_amount_completed: number
          traffic_light: 'excelente' | 'verde' | 'amarillo' | 'rojo'
        }
      }
      vw_store_health: {
        Row: {
          client_id: string
          client_code: string
          client_name: string
          client_zone: string
          client_address: string | null
          client_is_active: boolean
          period: string
          total_checkins: number
          valid_geofence_checkins: number
          last_checkin_time: string | null
          total_revenue: number
          total_boxes: number
          last_sale_date: string | null
          total_audits: number
          avg_share_of_shelf: number
          out_of_stock_occurrences: number
          last_audit_date: string | null
          health_score: number
        }
      }
      vw_product_sales_pareto: {
        Row: {
          product_id: string
          sku: string
          product_name: string
          product_category: string
          period: string
          total_boxes_sold: number
          total_revenue: number
          share_percentage: number
          cumulative_percentage: number
          pareto_class: 'A' | 'B' | 'C'
        }
      }
      vw_seller_performance: {
        Row: {
          seller_id: string
          seller_name: string
          seller_zone: string | null
          period: string
          quota_boxes: number
          sold_boxes: number
          quota_amount: number
          sold_amount: number
          percent_boxes_completed: number
          percent_amount_completed: number
          traffic_light: string
          active_clients_sold: number
          rank_by_boxes: number
          rank_by_amount: number
        }
      }
    }
    Functions: {
      fn_dashboard_kpis: {
        Args: {
          p_period: string
          p_zone?: string
        }
        Returns: Json
      }
      rpc_registrar_turno_asistencia_trade: {
        Args: {
          p_promotora_id: string
          p_fecha: string
          p_turno: 'manana_entrada' | 'manana_salida' | 'tarde_entrada' | 'tarde_salida'
          p_storage_path: string
          p_punto_venta: string
          p_cliente_id?: string | null
          p_zona?: string | null
          p_observaciones?: string | null
        }
        Returns: Json
      }
    }
  }
}
