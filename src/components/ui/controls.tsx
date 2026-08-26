"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, UploadCloud, X } from "lucide-react";

/* ── Segmented control ──────────────────────────────────────── */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  /**
   * Aceita `["A","B"]` ou `[{value:"a",label:"A"}]`. As duas formas moram no
   * mesmo array de propósito: como união de dois arrays, o TypeScript
   * desistia da inferência e alargava T para `string`, o que quebrava todo
   * `onChange` tipado com um literal.
   */
  options: readonly (T | { value: T; label: string })[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  const items = options.map((o) =>
    typeof o === "string" ? { value: o, label: o as string } : o
  );
  return (
    <div
      className={cn(
        "flex items-center gap-1 p-0.5 rounded-r1 bg-panel-3 border border-line shrink-0",
        className
      )}
    >
      {items.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-6 px-2.5 rounded-[4px] text-[12px] font-medium transition-colors whitespace-nowrap",
            value === o.value
              ? "bg-panel text-ink shadow-[var(--sh-1)]"
              : "text-ink-3 hover:text-ink"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Abas ───────────────────────────────────────────────────── */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: readonly { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 border-b border-line overflow-x-auto px-4",
        className
      )}
    >
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            "relative h-9 text-[13px] font-medium whitespace-nowrap transition-colors",
            value === t.value ? "text-ink" : "text-ink-3 hover:text-ink-2"
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className="num ml-1.5 text-[11px] text-ink-3">{t.count}</span>
          )}
          {value === t.value && (
            <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-brand rounded-full" />
          )}
        </button>
      ))}
    </div>
  );
}

/* ── Campo de texto ─────────────────────────────────────────── */

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function Input({ className, invalid, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-8 px-2.5 rounded-r1 border bg-panel text-[13px] text-ink w-full",
        "placeholder:text-ink-3 transition-colors focus:border-brand",
        invalid ? "border-down" : "border-line",
        props.type === "number" || props.inputMode === "decimal"
          ? "num text-right"
          : "",
        className
      )}
      {...props}
    />
  );
});

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5 min-w-0", className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-ink-3">{hint}</span>}
    </label>
  );
}

/* ── Select nativo, estilizado ──────────────────────────────── */

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cn(
          "h-8 pl-2.5 pr-7 rounded-r1 border border-line bg-panel text-[13px] text-ink w-full",
          "appearance-none transition-colors focus:border-brand cursor-pointer",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3 pointer-events-none" />
    </div>
  );
}

/* ── Interruptor ────────────────────────────────────────────── */

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  hint?: string;
}) {
  const body = (
    <span
      role="switch"
      aria-checked={checked}
      className={cn(
        "w-9 h-5 rounded-full transition-colors relative shrink-0 block",
        checked ? "bg-brand" : "bg-line-2"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 w-4 h-4 rounded-full bg-panel transition-all",
          checked ? "left-[18px]" : "left-0.5"
        )}
      />
    </span>
  );

  if (!label) {
    return (
      <button onClick={() => onChange(!checked)} className="shrink-0">
        {body}
      </button>
    );
  }

  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center gap-3 w-full text-left min-h-11 md:min-h-0"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-ink">{label}</span>
        {hint && <span className="block text-[11px] text-ink-3">{hint}</span>}
      </span>
      {body}
    </button>
  );
}

/* ── Caixa de seleção ───────────────────────────────────────── */

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-left"
    >
      <span
        className={cn(
          "w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors",
          checked ? "bg-brand border-brand" : "bg-panel border-line-2"
        )}
      >
        {checked && (
          <Check className="w-3 h-3 text-brand-ink" strokeWidth={3} />
        )}
      </span>
      {label && <span className="text-[13px] text-ink">{label}</span>}
    </button>
  );
}

/* ── Barra de progresso ─────────────────────────────────────── */

export function Progress({
  value,
  tone = "brand",
  className,
}: {
  /** 0–100. Acima de 100 satura visualmente mas mantém o rótulo. */
  value: number;
  tone?: "brand" | "up" | "warn" | "down";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "block h-1.5 rounded-full bg-panel-3 overflow-hidden",
        className
      )}
    >
      <span
        className="block h-full rounded-full transition-[width] duration-300"
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          background: `var(--${tone})`,
        }}
      />
    </span>
  );
}

/* ── Área de upload ─────────────────────────────────────────── */

export function FileDrop({
  hint = "Arraste a planilha ou clique para escolher",
  accept = ".xlsx, .xls, .csv",
  onFiles,
  files = [],
  onRemove,
}: {
  hint?: string;
  accept?: string;
  onFiles?: (files: File[]) => void;
  files?: { name: string; size?: number }[];
  onRemove?: (i: number) => void;
}) {
  const [dragging, setDragging] = React.useState(false);
  const ref = React.useRef<HTMLInputElement>(null);

  return (
    <div>
      <button
        onClick={() => ref.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onFiles?.(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          "w-full rounded-r2 border border-dashed flex flex-col items-center justify-center py-8 px-4 transition-colors",
          dragging
            ? "border-brand bg-brand-wash"
            : "border-line-2 bg-panel-2 hover:bg-panel-3"
        )}
      >
        <UploadCloud
          className={cn("w-5 h-5 mb-2", dragging ? "text-brand" : "text-ink-3")}
          strokeWidth={1.75}
        />
        <span className="text-[13px] font-medium text-ink">{hint}</span>
        <span className="text-[11px] text-ink-3 mt-0.5">{accept}</span>
      </button>

      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={(e) => onFiles?.(Array.from(e.target.files ?? []))}
      />

      {files.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {files.map((f, i) => (
            <li
              key={i}
              className="flex items-center gap-2 h-8 px-2.5 rounded-r1 border border-line bg-panel-2"
            >
              <span className="text-[12px] text-ink truncate flex-1">
                {f.name}
              </span>
              {f.size !== undefined && (
                <span className="num text-[11px] text-ink-3 shrink-0">
                  {(f.size / 1024).toFixed(0)} KB
                </span>
              )}
              {onRemove && (
                <button
                  onClick={() => onRemove(i)}
                  className="w-5 h-5 flex items-center justify-center text-ink-3 hover:text-down shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Folha lateral / de baixo ───────────────────────────────── */

export function Sheet({
  title,
  subtitle,
  onClose,
  footer,
  children,
  width = "520px",
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
  width?: string;
}) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="absolute inset-0"
        style={{ background: "var(--veil)" }}
        onClick={onClose}
      />
      <div
        className="relative ml-auto w-full bg-panel border-l border-line flex flex-col max-sm:mt-auto max-sm:max-h-[92vh] max-sm:rounded-t-r3 max-sm:border-l-0 max-sm:border-t"
        style={{ maxWidth: width, boxShadow: "var(--sh-3)" }}
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-line shrink-0">
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-ink leading-snug">
              {title}
            </p>
            {subtitle && (
              <p className="text-[11px] text-ink-3 mt-0.5 truncate">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 -mr-1 shrink-0 flex items-center justify-center rounded-r1 text-ink-2 hover:bg-panel-3 hover:text-ink transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">{children}</div>

        {footer && (
          <div
            className="px-4 py-3 border-t border-line flex gap-2 shrink-0"
            style={{
              paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Folha de filtros do mobile ─────────────────────────────── */

export function FilterSheet({
  title = "Filtros",
  onClose,
  onClear,
  applyLabel = "Aplicar",
  children,
}: {
  title?: string;
  onClose: () => void;
  onClear?: () => void;
  applyLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="md:hidden fixed inset-0 z-50">
      <div
        className="absolute inset-0"
        style={{ background: "var(--veil)" }}
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 max-h-[85vh] bg-panel rounded-t-r3 border-t border-line flex flex-col">
        <div className="flex items-center justify-between px-4 h-12 border-b border-line shrink-0">
          <span className="text-[13px] font-semibold text-ink">{title}</span>
          <button
            onClick={onClose}
            className="w-8 h-8 -mr-2 flex items-center justify-center text-ink-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4">{children}</div>

        <div
          className="p-4 pt-0 flex gap-2 shrink-0"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        >
          {onClear && (
            <button
              onClick={onClear}
              className="flex-1 h-10 rounded-r1 border border-line-2 bg-panel text-[13px] font-medium text-ink"
            >
              Limpar
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-r1 border border-brand bg-brand text-brand-ink text-[13px] font-medium"
          >
            {applyLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Linha rótulo/valor ─────────────────────────────────────── */

export function KeyValue({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "up" | "down" | "warn";
}) {
  return (
    <div className="flex items-center justify-between gap-3 h-8 border-b border-line last:border-0">
      <span className="text-[12px] text-ink-3 truncate">{label}</span>
      <span
        className={cn(
          "num text-[13px] shrink-0",
          tone === "up" && "text-up",
          tone === "down" && "text-down",
          tone === "warn" && "text-warn",
          !tone && "text-ink"
        )}
      >
        {value}
      </span>
    </div>
  );
}

/* ── Título de seção dentro da página ───────────────────────── */

export function SectionTitle({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 pt-1">
      <div className="min-w-0">
        <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
        {hint && <p className="text-[12px] text-ink-3 mt-0.5">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/* ── Mapa de calor ──────────────────────────────────────────── */

export function HeatCell({
  intensity,
  children,
  title,
}: {
  /** 0–1 */
  intensity: number;
  children: React.ReactNode;
  title?: string;
}) {
  const i = Math.max(0, Math.min(1, intensity));
  return (
    <span
      title={title}
      className="num flex items-center justify-end px-2 h-full text-[12px] tabular-nums"
      style={{
        background: `color-mix(in srgb, var(--brand) ${(i * 78).toFixed(0)}%, var(--panel))`,
        color: i > 0.55 ? "var(--brand-ink)" : "var(--ink)",
      }}
    >
      {children}
    </span>
  );
}
