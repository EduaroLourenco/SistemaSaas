"use client";

import * as React from "react";
import { Badge } from "@/components/ui/primitives";
import { Cadastro, type Coluna, type CampoForm } from "@/components/financeiro/cadastro";
import type { Categoria } from "@/lib/dados/financeiro";

/**
 * A categoria carrega uma decisão que a DRE depende: variável ou fixa.
 *
 * Variável é o custo que só existe porque houve venda — mercadoria,
 * comissão, frete, imposto. Ele desce na margem de contribuição.
 *
 * Fixa é o que sai exista venda ou não — aluguel, folha, mensalidade.
 * Ela entra só no resultado, depois da contribuição.
 *
 * Marcar errado não quebra nada visivelmente: a DRE continua fechando,
 * só que a margem de contribuição passa a incluir custo que não varia, e
 * a conta "vender mais uma unidade melhora o resultado?" para de valer.
 * Por isso a coluna tem explicação na tela, e não só um checkbox.
 */

const CAMPOS: CampoForm[] = [
  { chave: "nome", rotulo: "Nome", tipo: "texto", obrigatorio: true, largo: true },
  {
    chave: "tipo",
    rotulo: "Tipo",
    tipo: "select",
    obrigatorio: true,
    padrao: "saida",
    opcoes: [
      { valor: "saida", rotulo: "Saída — dinheiro que sai" },
      { valor: "entrada", rotulo: "Entrada — dinheiro que entra" },
    ],
  },
  {
    chave: "variavel",
    rotulo: "Comportamento",
    tipo: "select",
    padrao: "nao",
    dica: "Variável desce na margem de contribuição; fixa entra só no resultado.",
    opcoes: [
      { valor: "sim", rotulo: "Variável — só existe se houver venda" },
      { valor: "nao", rotulo: "Fixa — sai de qualquer jeito" },
    ],
  },
  { chave: "grupo", rotulo: "Grupo", tipo: "texto", dica: "Mercadoria, Estrutura, Pessoal…" },
  { chave: "ordem", rotulo: "Ordem na DRE", tipo: "numero", padrao: 100, dica: "Menor aparece antes." },
  { chave: "descricao", rotulo: "Descrição", tipo: "textarea", largo: true },
  { chave: "ativa", rotulo: "Ativa", tipo: "booleano", padrao: true },
];

const COLUNAS: Coluna<Categoria>[] = [
  {
    chave: "nome",
    titulo: "Categoria",
    render: (c) => (
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-ink font-medium">{c.nome}</span>
        {c.descricao && (
          <span className="text-[11.5px] text-ink-3 truncate max-w-md">{c.descricao}</span>
        )}
      </div>
    ),
  },
  {
    chave: "tipo",
    titulo: "Tipo",
    render: (c) => (
      <Badge tone={c.tipo === "entrada" ? "up" : "neutral"}>
        {c.tipo === "entrada" ? "Entrada" : "Saída"}
      </Badge>
    ),
  },
  {
    chave: "variavel",
    titulo: "Comportamento",
    render: (c) => (
      <Badge tone={c.variavel ? "brand" : "neutral"}>
        {c.variavel ? "Variável" : "Fixa"}
      </Badge>
    ),
  },
  {
    chave: "grupo",
    titulo: "Grupo",
    render: (c) =>
      c.grupo ? (
        <span className="text-ink-2">{c.grupo}</span>
      ) : (
        <span className="text-ink-3">—</span>
      ),
  },
  { chave: "ordem", titulo: "Ordem", numerica: true, render: (c) => c.ordem },
  {
    chave: "ativa",
    titulo: "Situação",
    render: (c) =>
      c.ativa ? (
        <span className="text-ink-3 text-[12px]">Ativa</span>
      ) : (
        <Badge tone="warn">Inativa</Badge>
      ),
  },
];

export default function CategoriasCliente({ linhas }: { linhas: Categoria[] }) {
  const variaveis = linhas.filter((c) => c.variavel && c.ativa).length;
  const fixas = linhas.filter((c) => !c.variavel && c.ativa).length;

  return (
    <Cadastro<Categoria>
      recurso="categorias"
      titulo="Categorias"
      singular="Categoria"
      linhas={linhas}
      colunas={COLUNAS}
      campos={CAMPOS}
      busca={(c) => `${c.nome} ${c.grupo ?? ""} ${c.descricao ?? ""}`}
      paraForm={(c) => ({
        nome: c.nome,
        tipo: c.tipo,
        variavel: c.variavel ? "sim" : "nao",
        grupo: c.grupo,
        ordem: c.ordem,
        descricao: c.descricao,
        ativa: c.ativa,
      })}
      aoGravar={(v) => ({ ...v, variavel: v.variavel === "sim" })}
      vazio={{
        titulo: "Nenhuma categoria",
        descricao:
          "Cadastre as categorias antes das contas — é por elas que a DRE agrupa o custo.",
      }}
      resumo={
        <div className="flex items-center gap-4 px-3.5 py-2.5 rounded-r2 border border-line bg-panel">
          <span className="text-[12px] text-ink-2">
            <b className="num text-ink">{variaveis}</b> variáveis
          </span>
          <span className="text-[12px] text-ink-2">
            <b className="num text-ink">{fixas}</b> fixas
          </span>
          <span className="text-[11.5px] text-ink-3 ml-auto">
            Variável desce na margem de contribuição. Fixa entra só no resultado.
          </span>
        </div>
      }
    />
  );
}
