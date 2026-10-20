import { Badge } from "@/components/ui/primitives";

/**
 * A situação do anúncio, onde ele for listado.
 *
 * ── Por que existe ──
 *
 * As telas de análise listam anúncio para alguém AGIR: baixar preço,
 * entrar numa campanha, ligar mídia. Anúncio pausado ou encerrado não
 * aceita nenhuma dessas ações, e sem a etiqueta ele parece igual aos
 * outros — a disputa de catálogo mandava baixar preço de anúncio que já
 * estava fora do ar.
 *
 * ── Por que ATIVO não aparece ──
 *
 * Etiqueta em toda linha vira ruído e para de ser lida. O que precisa
 * saltar é a exceção: o que está parado no meio de uma lista de coisas
 * para fazer. Ativo é o esperado e fica sem marca.
 */
const ROTULO: Record<string, { texto: string; tom: "warn" | "down" | "neutral" }> = {
  pausado: { texto: "pausado", tom: "warn" },
  paused: { texto: "pausado", tom: "warn" },
  encerrado: { texto: "encerrado", tom: "down" },
  closed: { texto: "encerrado", tom: "down" },
  inativo: { texto: "inativo", tom: "down" },
  inactive: { texto: "inativo", tom: "down" },
  under_review: { texto: "em revisão", tom: "warn" },
  em_revisao: { texto: "em revisão", tom: "warn" },
  payment_required: { texto: "pagamento pendente", tom: "warn" },
};

export function TagAnuncio({ status }: { status: string | null | undefined }) {
  const chave = String(status ?? "").trim().toLowerCase();
  if (!chave || chave === "ativo" || chave === "active") return null;
  const r = ROTULO[chave] ?? { texto: chave.replace(/_/g, " "), tom: "neutral" as const };
  return <Badge tone={r.tom}>{r.texto}</Badge>;
}

/** O anúncio aceita ação agora? É o que decide se a recomendação cabe. */
export function anuncioNoAr(status: string | null | undefined) {
  const chave = String(status ?? "").trim().toLowerCase();
  return chave === "ativo" || chave === "active";
}
