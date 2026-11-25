import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Database } from '../../types/database';
import { AlertTriangle } from 'lucide-react';

type SystemSettings = Database['public']['Tables']['system_settings']['Row'];

export const KillSwitchGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isActive, setIsActive] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('codizulca_kill_switch_active') === 'true';
    } catch {
      return false;
    }
  });
  const [message, setMessage] = useState<string | null>('Mantenimiento programado');

  useEffect(() => {
    // Non-blocking background check so the first module mounts and starts fetching immediately
    const fetchSettings = async () => {
      try {
        const { data } = await supabase
          .from('system_settings')
          .select('kill_switch_active, kill_switch_message')
          .limit(1)
          .single();

        if (data) {
          const settings = data as SystemSettings;
          setIsActive(Boolean(settings.kill_switch_active));
          setMessage(settings.kill_switch_message);
          try {
            sessionStorage.setItem(
              'codizulca_kill_switch_active',
              settings.kill_switch_active ? 'true' : 'false'
            );
          } catch {}
        }
      } catch {
        // fail open on transient network issue
      }
    };

    fetchSettings();

    // Subscribe to changes in system_settings using Realtime
    const channel = supabase
      .channel('system_settings_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'system_settings',
        },
        (payload) => {
          const newData = payload.new as SystemSettings;
          setIsActive(Boolean(newData.kill_switch_active));
          setMessage(newData.kill_switch_message);
          try {
            sessionStorage.setItem(
              'codizulca_kill_switch_active',
              newData.kill_switch_active ? 'true' : 'false'
            );
          } catch {}
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (isActive) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-gray-50 p-4 text-center">
        <div className="flex max-w-md flex-col items-center space-y-4 rounded-xl border border-red-100 bg-red-50 p-8 shadow-sm">
          <AlertTriangle className="h-12 w-12 text-red-500" />
          <h1 className="text-xl font-bold text-red-900">Sistema Suspendido</h1>
          <p className="text-sm text-red-700">
            {message || 'La aplicación se encuentra en mantenimiento. Por favor intente más tarde.'}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
