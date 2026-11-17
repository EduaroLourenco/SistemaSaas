import * as React from "react";
import { cn } from "@/lib/utils";
import { Delta } from "./primitives";

/** A apresentação recebe o resultado pronto; nenhuma regra de cálculo vive aqui. */
export function HeroMetric({ label, value, hint, delta, inverse, children, className }: {
  label: string; value: React.ReactNode; hint?: React.ReactNode; delta?: number;
  inverse?: boolean; children?: React.ReactNode; className?: string;
}) {
  const texto = typeof value === "string" ? value.replace(/\u00a0/g, " ") : null;
  const moeda = texto?.startsWith("R$") ? texto.slice(2).trim() : null;
  return <section className={cn("workspace-hero", className)} aria-label={label}>
    <div className="workspace-hero-reading">
      <p className="workspace-hero-label">{label}</p>
      <div className="workspace-hero-value num" style={moeda ? {fontSize:"clamp(24px, calc(168cqw / var(--hero-chars)), 56px)","--hero-chars":moeda.length} as React.CSSProperties : undefined}>{moeda ? <><span className="workspace-hero-unit">R$</span><span className="workspace-hero-amount">{moeda}</span></> : texto ?? value}</div>
      {(delta !== undefined || hint) && <div className="workspace-hero-context">{delta !== undefined && <Delta value={delta} inverse={inverse} />}{hint && <span>{hint}</span>}</div>}
    </div>
    {children && <div className="workspace-hero-evidence">{children}</div>}
  </section>;
}

export function MetricStrip({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("workspace-metric-strip", className)} {...props}>{children}</div>;
}

export function WorkflowSteps({ steps, current, className }: { steps: string[]; current: number; className?: string }) {
  return <ol className={cn("workspace-steps", className)} aria-label="Etapas">
    {steps.map((step, index) => <li key={step} aria-current={index === current ? "step" : undefined} data-complete={index < current || undefined}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><span>{step}</span></li>)}
  </ol>;
}
