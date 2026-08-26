"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { delta as fmtDelta, tone } from "@/lib/format";

/* ── Botão ──────────────────────────────────────────────────── */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "default" | "ghost" | "danger";
  size?: "sm" | "md";
};

export function Button({
  className,
  variant = "default",
  size = "md",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-r1 border font-medium whitespace-nowrap",
        "transition-colors duration-100 disabled:opacity-45 disabled:pointer-events-none",
        size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8 px-3 text-[13px]",
        variant === "primary" &&
          "bg-brand text-brand-ink border-brand hover:bg-brand-2 hover:border-brand-2",
        variant === "default" &&
          "bg-panel text-ink border-line-2 hover:bg-panel-3",
        variant === "ghost" &&
          "bg-transparent text-ink-2 border-transparent hover:bg-panel-3 hover:text-ink",
        variant === "danger" &&
          "bg-panel text-down border-line-2 hover:bg-down-wash",
        className
      )}
      {...props}
    />
  );
}

/* ── Painel ─────────────────────────────────────────────────── */

export function Panel({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("panel panel-1", className)} {...props}>
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 h-11 border-b border-line">
      <div className="flex items-baseline gap-2 min-w-0">
        <h3 className="text-[13px] font-semibold text-ink truncate">{title}</h3>
        {hint && (
          <span className="text-[11px] text-ink-3 truncate hidden sm:inline">
            {hint}
          </span>
        )}
      </div>
      {action}
    </div>
  );
}

/* ── Selo ───────────────────────────────────────────────────── */

type BadgeTone = "neutral" | "brand" | "up" | "warn" | "down" | "info";

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "bg-panel-3 text-ink-2 border-line",
  brand: "bg-brand-wash text-brand border-brand-edge",
  up: "bg-up-wash text-up border-transparent",
  warn: "bg-warn-wash text-warn border-transparent",
  down: "bg-down-wash text-down border-transparent",
  info: "bg-info-wash text-info border-transparent",
};

export function Badge({
  tone: t = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center h-5 px-1.5 rounded-r1 border text-[11px] font-semibold whitespace-nowrap",
        BADGE_TONE[t],
        className
      )}
    >
      {children}
    </span>
  );
}

/* ── Variação (delta) ───────────────────────────────────────── */

export function Delta({
  value,
  inverse = false,
  className,
}: {
  value: number;
  /** true quando cair é bom (ex.: custo, tempo de entrega) */
  inverse?: boolean;
  className?: string;
}) {
  const t = tone(value, inverse);
  const Icon = t === "flat" ? Minus : value > 0 ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[12px] font-semibold num",
        t === "up" && "text-up",
        t === "down" && "text-down",
        t === "flat" && "text-ink-3",
        className
      )}
    >
      <Icon className="w-3 h-3 shrink-0" strokeWidth={2.5} />
      {fmtDelta(value)}
    </span>
  );
}

/* ── Estado vazio ───────────────────────────────────────────── */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      {Icon && (
        <div className="w-10 h-10 rounded-r2 bg-panel-3 border border-line flex items-center justify-center mb-3">
          <Icon className="w-5 h-5 text-ink-3" strokeWidth={1.75} />
        </div>
      )}
      <p className="text-[13px] font-semibold text-ink">{title}</p>
      {description && (
        <p className="text-[12px] text-ink-3 mt-1 max-w-xs">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ── Esqueleto de carregamento ──────────────────────────────── */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("bg-panel-3 rounded-r1 animate-pulse", className)}
      aria-hidden
    />
  );
}
