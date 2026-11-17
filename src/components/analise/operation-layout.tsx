import type { ReactNode } from "react";
import "./operation-pages.css";

type Statistic = { label: string; value: ReactNode; hint?: ReactNode; tone?: "down" | "warn" | "up" };

/** Leitura operacional: uma decisão focal e o contexto na mesma superfície. */
export function OperationSummary({ items, label = "Resumo do recorte" }: { items: Statistic[]; label?: string }) {
  return <section className="op-summary" aria-label={label}>
    {items.map((item, index) => <div key={item.label} className={index === 0 ? "op-summary-primary" : undefined}>
      <p>{item.label}</p><strong className={item.tone ? `text-${item.tone}` : undefined}>{item.value}</strong>
      {item.hint && <small>{item.hint}</small>}
    </div>)}
  </section>;
}

export function OperationSteps({ steps, current }: { steps: string[]; current: number }) {
  return <ol className="op-steps" aria-label="Etapas do processo">{steps.map((step, index) => <li key={step} aria-current={index === current ? "step" : undefined} data-complete={index < current || undefined}><span>{String(index + 1).padStart(2, "0")}</span><strong>{step}</strong></li>)}</ol>;
}

export function OperationMethod({ title = "Como é calculado", children }: { title?: string; children: ReactNode }) {
  return <details className="op-method"><summary>{title}</summary><div>{children}</div></details>;
}
