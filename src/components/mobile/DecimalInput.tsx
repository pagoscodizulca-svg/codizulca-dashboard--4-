import React, { useEffect, useState } from 'react';

/**
 * Convierte texto con coma o punto decimal ("4,5" / "4.5") a número.
 * Retorna 0 si el texto está vacío o no es válido.
 */
export const parseDecimal = (raw: string): number => {
  const normalized = String(raw || '').replace(',', '.').trim();
  if (normalized === '' || normalized === '.') return 0;
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Redondea a 3 decimales para evitar ruido de punto flotante (ej. 0.1 + 0.2). */
export const roundQty = (value: number): number => Math.round(value * 1000) / 1000;

interface DecimalInputProps {
  value: number;
  onValueChange: (value: number) => void;
  className?: string;
  readOnly?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}

/**
 * Input numérico con soporte de decimales (coma o punto) optimizado para teclados móviles.
 * Mantiene el texto escrito por el usuario ("4.", "0,5") sin perder el separador mientras se digita.
 */
export const DecimalInput: React.FC<DecimalInputProps> = ({
  value,
  onValueChange,
  className,
  readOnly,
  placeholder,
  ariaLabel
}) => {
  const [text, setText] = useState<string>(() => (value === 0 ? '' : String(value)));

  // Sincroniza cuando el valor externo cambia (ej. cálculo automático o reinicio de formulario)
  useEffect(() => {
    if (parseDecimal(text) !== value) {
      setText(value === 0 ? '' : String(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      translate="no"
      aria-label={ariaLabel}
      readOnly={readOnly}
      placeholder={placeholder ?? '0'}
      value={text}
      onChange={(e) => {
        if (readOnly) return;
        const cleaned = String(e.target.value || '').replace(/[^0-9.,]/g, '');
        // Permitir solo un separador decimal (coma o punto)
        const parts = cleaned.split(/[.,]/);
        const normalizedText =
          parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned;
        setText(normalizedText);
        onValueChange(parseDecimal(normalizedText));
      }}
      className={`notranslate ${className || ''}`}
    />
  );
};
