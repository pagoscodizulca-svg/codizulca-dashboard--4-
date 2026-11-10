import React, { useState, useEffect } from 'react';
import { Clock, Unlock, RefreshCw, CheckCircle2 } from 'lucide-react';
import { campoService, PROMOTER_ENTRY_SCHEDULE } from '../../lib/campoService';

interface FueraDeHorarioScreenProps {
  onBypass: () => void;
}

export const FueraDeHorarioScreen: React.FC<FueraDeHorarioScreenProps> = ({ onBypass }) => {
  const [scheduleStatus, setScheduleStatus] = useState(() => campoService.getCommercialScheduleStatus());

  useEffect(() => {
    const timer = setInterval(() => {
      const nextStatus = campoService.getCommercialScheduleStatus();
      setScheduleStatus(nextStatus);
      if (nextStatus.isOpen) {
        window.dispatchEvent(new Event('codizulca_hours_changed'));
        onBypass();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [onBypass]);

  const handleVerifyScheduleNow = () => {
    const nextStatus = campoService.getCommercialScheduleStatus();
    setScheduleStatus(nextStatus);
    if (nextStatus.isOpen) {
      window.dispatchEvent(new Event('codizulca_hours_changed'));
      onBypass();
    }
  };

  const handleUnlock = () => {
    campoService.setBypassHours(true);
    onBypass();
  };

  return (
    <div className="min-h-screen bg-[#000000] text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-[512px] bg-[#0d0d0d] border border-neutral-800 rounded-3xl p-6 sm:p-8 space-y-6 text-center shadow-2xl shadow-red-950/40">
        
        {/* Icono de advertencia */}
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-500 flex items-center justify-center mx-auto animate-pulse">
          <Clock className="w-8 h-8" />
        </div>

        {/* Títulos */}
        <div className="space-y-2">
          <span className="px-3 py-1 rounded-full bg-amber-950/50 border border-amber-500/40 text-amber-400 text-[10px] font-black uppercase tracking-wider font-mono">
            Bloqueo Preventivo de Jornada
          </span>
          <h2 className="text-xl font-black text-white tracking-tight">Fuera del Horario de Operación</h2>
          <p className="text-xs text-neutral-400 leading-relaxed max-w-sm mx-auto">
            La plataforma móvil de campo habilita el acceso automáticamente a partir de las 7:00 AM (Hora de Venezuela):
          </p>
        </div>

        {/* Horario y Reloj */}
        <div className="bg-[#171717] border border-neutral-800 rounded-2xl p-4 space-y-2.5 text-left">
          <div className="flex items-center justify-between text-xs text-neutral-400 pb-2 border-b border-neutral-800 font-mono">
            <span>Hora Oficial (Venezuela):</span>
            <strong className="text-white text-sm">{scheduleStatus.formattedTime}</strong>
          </div>
          <div className="flex items-center justify-between text-xs pt-0.5">
            <span className="text-neutral-400">Acceso App Promotoras:</span>
            <span className="text-emerald-400 font-bold font-mono">7:00 AM – 8:00 PM</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-400">Horario Oficial de Ingreso PDV:</span>
            <span className="text-sky-400 font-bold font-mono">{PROMOTER_ENTRY_SCHEDULE.targetWindowLabel}</span>
          </div>
          <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-neutral-800/80 text-amber-400 font-mono">
            <span>Estado de Apertura:</span>
            <span className="font-bold">{scheduleStatus.countdownLabel}</span>
          </div>
        </div>

        {/* Acciones */}
        <div className="space-y-2.5 pt-2">
          <button
            type="button"
            onClick={handleVerifyScheduleNow}
            className="w-full py-3.5 px-6 rounded-2xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer"
          >
            <RefreshCw className="w-4 h-4 text-emerald-400" />
            <span>Verificar Horario Ahora</span>
          </button>

          <button
            type="button"
            onClick={handleUnlock}
            className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 active:scale-[0.98] transition-all cursor-pointer"
          >
            <Unlock className="w-4 h-4" />
            <span>Desbloquear Modo Prueba / Supervisión</span>
          </button>

          <p className="text-[10px] text-neutral-500 font-mono">
            * El acceso se desbloquea automáticamente a las 7:00 AM sin necesidad de recargar.
          </p>
        </div>
      </div>
    </div>
  );
};
