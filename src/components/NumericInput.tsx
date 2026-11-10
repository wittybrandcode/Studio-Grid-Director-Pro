import React, { useEffect, useState } from 'react';
import { Minus, Plus } from '@phosphor-icons/react';

interface NumericInputProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (newValue: number) => void;
  suffix?: string;
  className?: string;
  showSteppers?: boolean;
}

/**
 * Normalize Arabic-Indic (٠-٩) and Eastern Arabic-Indic (۰-۹) digits to standard 0-9 (allowing decimal point when needed)
 */
function normalizeDigits(input: string, allowFloat: boolean): string {
  const converted = input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/٫/g, '.');
  return allowFloat ? converted.replace(/[^0-9.]/g, '') : converted.replace(/[^0-9]/g, '');
}

export const NumericInput: React.FC<NumericInputProps> = ({
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix,
  className = '',
  showSteppers = true,
}) => {
  const isFloat = step < 1 || !Number.isInteger(value);
  const [draft, setDraft] = useState<string>(String(value));
  const [isFocused, setIsFocused] = useState<boolean>(false);

  // Sync from external value when not actively editing
  useEffect(() => {
    if (!isFocused) {
      setDraft(String(value));
    }
  }, [value, isFocused]);

  const formatNumber = (num: number): number => {
    return isFloat ? Number(num.toFixed(2)) : Math.round(num);
  };

  const commitDraft = (raw: string) => {
    const cleaned = normalizeDigits(raw, isFloat);
    if (!cleaned) {
      setDraft(String(value));
      return;
    }
    const parsed = isFloat ? parseFloat(cleaned) : parseInt(cleaned, 10);
    if (Number.isNaN(parsed)) {
      setDraft(String(value));
      return;
    }
    const clamped = formatNumber(Math.max(min, Math.min(max, parsed)));
    setDraft(String(clamped));
    if (clamped !== value) {
      onChange(clamped);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const normalized = normalizeDigits(e.target.value, isFloat);
    setDraft(normalized);

    if (normalized.length > 0 && !normalized.endsWith('.')) {
      const parsed = isFloat ? parseFloat(normalized) : parseInt(normalized, 10);
      if (!Number.isNaN(parsed) && parsed >= min && parsed <= max) {
        onChange(formatNumber(parsed));
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitDraft(draft);
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(String(value));
      e.currentTarget.blur();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const delta = e.shiftKey ? step * 10 : step;
      const base = isFloat ? parseFloat(draft) : parseInt(draft, 10);
      const next = formatNumber(Math.min(max, (Number.isNaN(base) ? value : base) + delta));
      setDraft(String(next));
      onChange(next);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const delta = e.shiftKey ? step * 10 : step;
      const base = isFloat ? parseFloat(draft) : parseInt(draft, 10);
      const next = formatNumber(Math.max(min, (Number.isNaN(base) ? value : base) - delta));
      setDraft(String(next));
      onChange(next);
    }
  };

  const stepBy = (delta: number) => {
    const base = isFloat ? parseFloat(draft) : parseInt(draft, 10);
    const current = Number.isNaN(base) ? value : base;
    const next = formatNumber(Math.max(min, Math.min(max, current + delta)));
    setDraft(String(next));
    onChange(next);
  };

  return (
    <div
      dir="ltr"
      className={`flex items-center h-7 bg-[#1B1E24] border border-[#3F4552] focus-within:border-[#38BDF8] rounded-none overflow-hidden transition-colors ${className}`}
    >
      {showSteppers && (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => stepBy(-step)}
          className="w-6 h-full flex items-center justify-center bg-[#282C35] hover:bg-[#434956] text-[#AEB5C2] hover:text-[#FFFFFF] border-r border-[#363B46] transition-colors cursor-pointer shrink-0 rounded-none"
          title={`-${step}`}
        >
          <Minus weight="bold" className="w-2.5 h-2.5" />
        </button>
      )}

      <input
        type="text"
        inputMode="numeric"
        dir="ltr"
        value={draft}
        onFocus={(e) => {
          setIsFocused(true);
          e.target.select();
        }}
        onBlur={() => {
          setIsFocused(false);
          commitDraft(draft);
        }}
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
        className="w-full min-w-0 bg-transparent px-1.5 py-0.5 text-[11px] font-mono font-bold tabular-nums text-[#E2E6EE] text-center outline-none selection:bg-[#38BDF8] selection:text-[#111317] rounded-none"
      />

      {suffix && !showSteppers && (
        <span className="pr-1.5 text-[9px] font-mono text-[#8E95A2] select-none shrink-0">
          {suffix}
        </span>
      )}

      {showSteppers && (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => stepBy(step)}
          className="w-6 h-full flex items-center justify-center bg-[#282C35] hover:bg-[#434956] text-[#AEB5C2] hover:text-[#FFFFFF] border-l border-[#363B46] transition-colors cursor-pointer shrink-0 rounded-none"
          title={`+${step}`}
        >
          <Plus weight="bold" className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
};
