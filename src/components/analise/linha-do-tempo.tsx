"use client";

import * as React from "react";
import { Badge, Button } from "@/components/ui/primitives";
import { Field, Input, Select } from "@/components/ui/controls";
import { money, count } from "@/lib/format";
import type { AnuncioAnalisado } from "@/lib/analise";
import {
  Tag,
  Percent,
  Package,
  FileText,
  MessageSquare,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

/**
 * Linha do tempo do anúncio.
 *
 * Junta duas coisas numa régua só:
 *
 *  · o que o SISTEMA detectou — preço mudou, entrou em campanha, vendas
 *    despencaram. Sai dos próprios dados semanais, sem ninguém digitar.
 *  · o que VOCÊ fez — trocou foto, mudou título, acabou estoque, subiu
 *    preço fora do sistema.
 *
 * O segundo é o que falta em todo painel. Boa parte da queda de um anúncio
 * é ação interna, não mercado — e sem registrar isso a pessoa fica
 * procurando culpa do lado de fora.
 *
 * Enquanto o banco não existe, a anotação vive no navegador. Quando a
 * tabela `anotacoes_anuncio` subir, troca-se o `localStorage` por `fetch`
 * e nada mais muda aqui.
 */

type TipoAnotacao = "preco" | "campanha" | "estoque" | "ficha" | "outro";

type Anotacao = {
  id: string;
  mlb: string;
  data: string;
  tipo: TipoAnotacao;
  texto: string;
};

type Evento = {
  chave: string;
  data: string;
  semana: string;
  tipo: TipoAnotacao | "venda";
  texto: string;
  tom: "neutro" | "bom" | "ruim";
  automatico: boolean;
  anotacaoId?: string;
};

const TIPOS: { valor: TipoAnotacao; rotulo: string }[] = [
  { valor: "preco", rotulo: "Mudança de preço" },
  { valor: "campanha", rotulo: "Campanha" },
  { valor: "estoque", rotulo: "Estoque" },
  { valor: "ficha", rotulo: "Foto, título ou ficha" },
  { valor: "outro", rotulo: "Outro" },
];

const ICONE: Record<string, React.ElementType> = {
  preco: Tag,
  campanha: Percent,
  estoque: Package,
  ficha: FileText,
  outro: MessageSquare,
  venda: TrendingDown,
};

const CHAVE = "anotacoes-anuncio";

function lerAnotacoes(): Anotacao[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) ?? "[]");
  } catch {
    return [];
  }
}

function gravarAnotacoes(lista: Anotacao[]) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(lista));
  } catch {
    // navegador com armazenamento bloqueado: a sessão segue, sem persistir
  }
}

/** dd/mm a partir do ISO. */
function dataCurta(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function LinhaDoTempo({ item }: { item: AnuncioAnalisado }) {
  const [anotacoes, setAnotacoes] = React.useState<Anotacao[]>([]);
  const [aberto, setAberto] = React.useState(false);
  const [tipo, setTipo] = React.useState<TipoAnotacao>("preco");
  const [texto, setTexto] = React.useState("");
  const [data, setData] = React.useState("");

  React.useEffect(() => {
    setAnotacoes(lerAnotacoes().filter((a) => a.mlb === item.mlb));
    // data padrão: início da última semana do recorte
    const ultima = item.semanas[item.semanas.length - 1];
    setData(ultima?.dias[0]?.data ?? "");
  }, [item.mlb, item.semanas]);

  /** Eventos que o sistema detecta sozinho, comparando semana a semana. */
  const automaticos = React.useMemo<Evento[]>(() => {
    const saida: Evento[] = [];

    item.semanas.forEach((w, i) => {
      const ant = item.semanas[i - 1];
      const dia = w.dias[0]?.data ?? "";
      if (!ant) return;

      // preço da vitrine mudou mais de 1%
      const variacaoPreco =
        ant.precoAnunciado > 0
          ? ((w.precoAnunciado - ant.precoAnunciado) / ant.precoAnunciado) * 100
          : 0;
      if (Math.abs(variacaoPreco) >= 1) {
        const subiu = variacaoPreco > 0;
        saida.push({
          chave: `preco-${w.semana}`,
          data: dia,
          semana: w.semana,
          tipo: "preco",
          tom: subiu ? "ruim" : "neutro",
          texto: `Preço da vitrine ${subiu ? "subiu" : "caiu"} de ${money(
            ant.precoAnunciado
          )} para ${money(w.precoAnunciado)}`,
          automatico: true,
        });
      }

      // entrou ou saiu de campanha
      if (w.campanhas.length > 0 && ant.campanhas.length === 0) {
        saida.push({
          chave: `camp-in-${w.semana}`,
          data: dia,
          semana: w.semana,
          tipo: "campanha",
          tom: "neutro",
          texto: `Entrou em campanha: ${w.campanhas[0].nome}`,
          automatico: true,
        });
      } else if (w.campanhas.length === 0 && ant.campanhas.length > 0) {
        saida.push({
          chave: `camp-out-${w.semana}`,
          data: dia,
          semana: w.semana,
          tipo: "campanha",
          tom: "neutro",
          texto: "Saiu de campanha",
          automatico: true,
        });
      }

      // salto de venda para cima ou para baixo
      if (ant.vendas > 0) {
        const variacao = ((w.vendas - ant.vendas) / ant.vendas) * 100;
        if (Math.abs(variacao) >= 20) {
          saida.push({
            chave: `venda-${w.semana}`,
            data: dia,
            semana: w.semana,
            tipo: "venda",
            tom: variacao > 0 ? "bom" : "ruim",
            texto: `Vendas ${variacao > 0 ? "subiram" : "caíram"} ${Math.abs(
              variacao
            ).toFixed(0)}% — de ${count(ant.vendas)} para ${count(w.vendas)} un`,
            automatico: true,
          });
        }
      }
    });

    return saida;
  }, [item.semanas]);

  const linha = React.useMemo<Evento[]>(() => {
    const manuais: Evento[] = anotacoes.map((a) => ({
      chave: `anot-${a.id}`,
      data: a.data,
      semana:
        item.semanas.find((w) => w.dias.some((d) => d.data >= a.data))?.semana ??
        "",
      tipo: a.tipo,
      texto: a.texto,
      tom: "neutro",
      automatico: false,
      anotacaoId: a.id,
    }));

    return [...automaticos, ...manuais].sort((a, b) =>
      b.data.localeCompare(a.data)
    );
  }, [automaticos, anotacoes, item.semanas]);

  function adicionar() {
    if (!texto.trim() || !data) return;
    const nova: Anotacao = {
      id: `${Date.now().toString(36)}`,
      mlb: item.mlb,
      data,
      tipo,
      texto: texto.trim(),
    };
    const todas = [...lerAnotacoes(), nova];
    gravarAnotacoes(todas);
    setAnotacoes(todas.filter((a) => a.mlb === item.mlb));
    setTexto("");
    setAberto(false);
  }

  function remover(id: string) {
    const todas = lerAnotacoes().filter((a) => a.id !== id);
    gravarAnotacoes(todas);
    setAnotacoes(todas.filter((a) => a.mlb === item.mlb));
  }

  return (
    <div className="px-4 py-3.5 border-b border-line">
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <div className="min-w-0">
          <p className="label">Linha do tempo</p>
          <p className="text-[11px] text-ink-3 mt-0.5">
            o que o sistema detectou e o que você fez, na mesma régua
          </p>
        </div>
        <Button size="sm" onClick={() => setAberto((v) => !v)}>
          <Plus className="w-3.5 h-3.5" />
          Anotar
        </Button>
      </div>

      {aberto && (
        <div className="panel bg-panel-2 p-3 mb-3 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <Field label="O que foi">
              <Select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoAnotacao)}
                className="max-sm:h-11"
              >
                {TIPOS.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.rotulo}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Quando">
              <Input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="max-sm:h-11"
              />
            </Field>
          </div>
          <Field label="Descrição">
            <Input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && adicionar()}
              placeholder="Troquei a foto principal / subi o preço fora do sistema"
              className="max-sm:h-11"
            />
          </Field>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={adicionar}
              disabled={!texto.trim() || !data}
            >
              Salvar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
          </div>
          <p className="text-[11px] text-ink-3">
            Fica gravado neste navegador até o banco entrar no ar.
          </p>
        </div>
      )}

      {linha.length === 0 ? (
        <p className="text-[12px] text-ink-3 py-2">
          Nada registrado no período. Anote o que você mudou — é o que explica
          a curva depois.
        </p>
      ) : (
        <ul className="relative">
          {/* a régua vertical */}
          <span
            className="absolute left-[11px] top-2 bottom-2 w-px bg-line"
            aria-hidden
          />
          {linha.map((e) => {
            const Icone =
              e.tipo === "venda" && e.tom === "bom" ? TrendingUp : ICONE[e.tipo];
            return (
              <li key={e.chave} className="relative flex gap-3 py-2 group">
                <span
                  className={
                    "w-[23px] h-[23px] rounded-full border-2 border-panel flex items-center justify-center shrink-0 z-10 " +
                    (e.tom === "ruim"
                      ? "bg-down-wash text-down"
                      : e.tom === "bom"
                        ? "bg-up-wash text-up"
                        : "bg-panel-3 text-ink-3")
                  }
                >
                  <Icone className="w-3 h-3" strokeWidth={2.2} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2 flex-wrap">
                    <span className="num text-[11px] text-ink-3">
                      {dataCurta(e.data)}
                    </span>
                    {e.semana && (
                      <span className="num text-[11px] text-ink-3">{e.semana}</span>
                    )}
                    {!e.automatico && <Badge tone="brand">sua nota</Badge>}
                  </span>
                  <span className="block text-[12px] text-ink mt-0.5 leading-snug">
                    {e.texto}
                  </span>
                </span>

                {e.anotacaoId && (
                  <button
                    onClick={() => remover(e.anotacaoId!)}
                    title="Apagar anotação"
                    className="w-6 h-6 shrink-0 rounded-r1 hidden group-hover:flex items-center justify-center text-ink-3 hover:text-down transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
