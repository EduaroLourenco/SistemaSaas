import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";
import { carregarBaseMargem } from "./margem";
import {
  margemDoPreco,
  type Componentes,
  type Decomposicao,
} from "./formula-preco";

/**
 * Carrega o que a tela de preço-alvo precisa.
 *
 * A fórmula em si mora em `formula-preco.ts`, sem dependência de
 * servidor — é o que permite testá-la fora do Next, e é onde está
 * documentado por que preço se resolve em vez de se multiplicar.
 */

const r2 = (v: number) => Number(v.toFixed(2));
const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;

/* ── Carga ─────────────────────────────────────────────────────────── */

export type TipoAnuncio = "classico" | "premium" | "outro";

export type ComissaoCanal = {
  id: string;
  canalId: string;
  canalNome: string;
  tipo: TipoAnuncio | null;
  comissao: number;
  vigenciaInicio: string;
};

export type CenarioSku = {
  tipo: TipoAnuncio | null;
  /** Alíquota usada, e de onde saiu. */
  comissaoPct: number;
  /** Preço médio praticado hoje nesse tipo, quando houve venda. */
  precoAtual: number | null;
  unidades: number;
  /** A margem que o preço de hoje entrega. */
  atual: Decomposicao | null;
};

export type LinhaPrecoAlvo = {
  produtoId: string;
  sku: string;
  titulo: string;
  receita: number;

  mercadoria: number | null;
  embalagem: number | null;
  impostoPct: number | null;
  /** Frete por unidade: o praticado quando existe, senão a faixa de peso. */
  frete: number | null;
  freteOrigem: "praticado" | "tabela" | null;

  cenarios: CenarioSku[];
  /** Nomeia o que impede o cálculo. Vazio = dá para calcular. */
  faltando: string[];
};

export type DadosPrecoAlvo = {
  linhas: LinhaPrecoAlvo[];
  comissoes: ComissaoCanal[];
  canais: { id: string; nome: string }[];
  canalId: string | null;
  /** Tipos que o canal escolhido tem alíquota cadastrada. */
  tipos: (TipoAnuncio | null)[];
};

export async function carregarPrecoAlvo(
  canalId?: string
): Promise<DadosPrecoAlvo> {
  const sb = await clienteServidor();

  const [produtosRaw, comissoesRaw, canaisRaw, faixasRaw, base] =
    await Promise.all([
      paginar(() =>
        sb
          .from("produtos")
          .select("id,sku,titulo,custo_unitario,embalagem,aliquota_impostos,peso_kg")
          .order("sku")
      ),
      paginar(() =>
        sb
          .from("comissoes_canal")
          .select("id,canal_id,tipo,comissao,vigencia_inicio,canais(nome)")
          .order("vigencia_inicio", { ascending: false })
      ),
      sb.from("canais").select("id,nome").order("nome"),
      paginar(() =>
        sb
          .from("faixas_frete")
          .select("canal_id,peso_min_kg,peso_max_kg,valor,vigencia_inicio")
          .order("peso_min_kg")
      ),
      carregarBaseMargem(),
    ]);

  type Prod = {
    id: string;
    sku: string;
    titulo: string;
    custo_unitario: string | number | null;
    embalagem: string | number | null;
    aliquota_impostos: string | number | null;
    peso_kg: string | number | null;
  };

  const produtos = produtosRaw as unknown as Prod[];
  const canais = (canaisRaw.data ?? []) as { id: string; nome: string }[];

  const comissoes: ComissaoCanal[] = (
    comissoesRaw as unknown as {
      id: string;
      canal_id: string;
      tipo: TipoAnuncio | null;
      comissao: string | number;
      vigencia_inicio: string;
      canais: { nome: string } | null;
    }[]
  ).map((c) => ({
    id: c.id,
    canalId: c.canal_id,
    canalNome: c.canais?.nome ?? "—",
    tipo: c.tipo,
    comissao: n(c.comissao),
    vigenciaInicio: String(c.vigencia_inicio).slice(0, 10),
  }));

  // Sem canal escolhido, o que tiver mais alíquotas cadastradas: é o
  // único que produz tela útil na primeira visita.
  const contagem = new Map<string, number>();
  for (const c of comissoes) {
    contagem.set(c.canalId, (contagem.get(c.canalId) ?? 0) + 1);
  }
  const canalEscolhido =
    canalId ??
    [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
    null;

  const doCanal = comissoes.filter((c) => c.canalId === canalEscolhido);
  // Vigência mais recente por tipo: reajuste não duplica a linha na tela.
  const porTipo = new Map<string, ComissaoCanal>();
  for (const c of doCanal) {
    const chave = c.tipo ?? "";
    const at = porTipo.get(chave);
    if (!at || c.vigenciaInicio > at.vigenciaInicio) porTipo.set(chave, c);
  }
  const tipos = [...porTipo.values()]
    .sort((a, b) => (a.tipo ?? "").localeCompare(b.tipo ?? ""))
    .map((c) => c.tipo);

  /* ── Frete de tabela ── */

  const faixas = (
    faixasRaw as unknown as {
      canal_id: string | null;
      peso_min_kg: string | number;
      peso_max_kg: string | number;
      valor: string | number;
      vigencia_inicio: string;
    }[]
  ).map((f) => ({
    canalId: f.canal_id,
    min: n(f.peso_min_kg),
    max: n(f.peso_max_kg),
    valor: n(f.valor),
    vigencia: String(f.vigencia_inicio).slice(0, 10),
  }));

  function freteDeTabela(pesoKg: number | null): number | null {
    if (pesoKg == null) return null;
    const cobrem = faixas.filter((f) => pesoKg >= f.min && pesoKg <= f.max);
    if (!cobrem.length) return null;
    const especifica = cobrem.filter((f) => f.canalId === canalEscolhido);
    return (especifica.length ? especifica : cobrem).sort((a, b) =>
      b.vigencia.localeCompare(a.vigencia)
    )[0].valor;
  }

  /* ── Preço e frete praticados, por SKU e tipo ── */

  type Ac = {
    receita: number;
    unidades: number;
    frete: number;
    unidadesComFrete: number;
    porTipo: Map<string, { receita: number; unidades: number }>;
  };
  const acum = new Map<string, Ac>();

  for (const it of base.itens) {
    if (!it.produtoId) continue;
    if (canalEscolhido && it.canalId !== canalEscolhido) continue;

    const at =
      acum.get(it.produtoId) ??
      { receita: 0, unidades: 0, frete: 0, unidadesComFrete: 0, porTipo: new Map() };

    at.receita += it.receita;
    at.unidades += it.quantidade;
    if (it.freteOrigem === "praticado" && it.frete != null) {
      at.frete += it.frete;
      at.unidadesComFrete += it.quantidade;
    }

    const t = at.porTipo.get(it.anuncioTipo) ?? { receita: 0, unidades: 0 };
    t.receita += it.receita;
    t.unidades += it.quantidade;
    at.porTipo.set(it.anuncioTipo, t);

    acum.set(it.produtoId, at);
  }

  /* ── Monta ── */

  const linhas: LinhaPrecoAlvo[] = produtos.map((prod) => {
    const ac = acum.get(prod.id);
    const mercadoria = prod.custo_unitario == null ? null : n(prod.custo_unitario);
    const embalagem = prod.embalagem == null ? null : n(prod.embalagem);
    const impostoPct =
      prod.aliquota_impostos == null ? null : n(prod.aliquota_impostos);
    const pesoKg = prod.peso_kg == null ? null : n(prod.peso_kg);

    // O frete praticado ganha do de tabela: ele é o que a operação de
    // fato paga hoje, e é sobre ele que o preço precisa fechar.
    const fretePraticado =
      ac && ac.unidadesComFrete > 0 ? r2(ac.frete / ac.unidadesComFrete) : null;
    const freteTabela = freteDeTabela(pesoKg);
    const frete = fretePraticado ?? freteTabela;
    const freteOrigem: "praticado" | "tabela" | null =
      fretePraticado != null ? "praticado" : freteTabela != null ? "tabela" : null;

    const faltando: string[] = [];
    if (mercadoria == null) faltando.push("custo de mercadoria");
    if (embalagem == null) faltando.push("embalagem");
    if (impostoPct == null) faltando.push("alíquota de impostos");
    if (frete == null) {
      faltando.push(pesoKg == null ? "peso do produto" : "faixa de frete");
    }
    if (!tipos.length) faltando.push("comissão do canal");

    const cenarios: CenarioSku[] = [...porTipo.values()]
      .sort((a, b) => (a.tipo ?? "").localeCompare(b.tipo ?? ""))
      .map((c) => {
        const t = c.tipo ? ac?.porTipo.get(c.tipo) : undefined;
        // Sem tipo cadastrado, o praticado é o do SKU inteiro: o canal
        // não separa, então separar aqui seria inventar distinção.
        const vendas = c.tipo ? t : ac ? { receita: ac.receita, unidades: ac.unidades } : undefined;
        const precoAtual =
          vendas && vendas.unidades > 0 ? r2(vendas.receita / vendas.unidades) : null;

        const podeCalcular =
          mercadoria != null && embalagem != null && impostoPct != null && frete != null;

        return {
          tipo: c.tipo,
          comissaoPct: c.comissao,
          precoAtual,
          unidades: vendas?.unidades ?? 0,
          atual:
            podeCalcular && precoAtual != null
              ? margemDoPreco(
                  {
                    mercadoria: mercadoria!,
                    embalagem: embalagem!,
                    frete: frete!,
                    comissaoPct: c.comissao,
                    impostoPct: impostoPct!,
                  },
                  precoAtual
                )
              : null,
        };
      });

    return {
      produtoId: prod.id,
      sku: prod.sku,
      titulo: prod.titulo,
      receita: r2(ac?.receita ?? 0),
      mercadoria,
      embalagem,
      impostoPct,
      frete,
      freteOrigem,
      cenarios,
      faltando,
    };
  });

  linhas.sort((a, b) => b.receita - a.receita);

  return {
    linhas,
    comissoes,
    canais,
    canalId: canalEscolhido,
    tipos,
  };
}

export { precoParaMargem, margemDoPreco } from "./formula-preco";
export type { Componentes, Decomposicao };
