"use client";

import * as React from "react";
import { Badge } from "@/components/ui/primitives";
import { Checkbox } from "@/components/ui/controls";
import {
  Cadastro,
  StatusBadge,
  type Coluna,
  type CampoForm,
  type Registro,
} from "@/components/financeiro/cadastro";
import { money } from "@/lib/format";
import { Repeat } from "lucide-react";
import type { Conta, Categoria } from "@/lib/dados/financeiro";

const PERIODICIDADE = [
  { valor: "unica", rotulo: "Não se repete" },
  { valor: "mensal", rotulo: "Mensal" },
  { valor: "bimestral", rotulo: "Bimestral" },
  { valor: "trimestral", rotulo: "Trimestral" },
  { valor: "semestral", rotulo: "Semestral" },
  { valor: "anual", rotulo: "Anual" },
];

const STATUS = [
  { valor: "previsto", rotulo: "Previsto — ainda não é dívida" },
  { valor: "em_aberto", rotulo: "Em aberto — a pagar" },
  { valor: "pago", rotulo: "Pago" },
  { valor: "atrasado", rotulo: "Atrasado" },
  { valor: "cancelado", rotulo: "Cancelado" },
];

const br = (iso: string | null) =>
  iso ? iso.slice(0, 10).split("-").reverse().join("/") : null;

export default function ContasCliente({
  linhas,
  categorias,
  fornecedores,
  funcionarios,
  canais,
  faltaMigracao,
}: {
  linhas: Conta[];
  categorias: Categoria[];
  fornecedores: { id: string; nome: string }[];
  funcionarios: { id: string; nome: string }[];
  canais: { id: string; nome: string }[];
  faltaMigracao: string | null;
}) {
  const nomeCat = React.useMemo(
    () => new Map(categorias.map((c) => [c.id, c.nome])),
    [categorias]
  );
  const nomeForn = React.useMemo(
    () => new Map(fornecedores.map((f) => [f.id, f.nome])),
    [fornecedores]
  );

  const hoje = new Date().toISOString().slice(0, 10);

  const campos: CampoForm[] = [
    { chave: "descricao", rotulo: "Descrição", tipo: "texto", obrigatorio: true, largo: true },
    {
      chave: "tipo",
      rotulo: "Tipo",
      tipo: "select",
      obrigatorio: true,
      padrao: "saida",
      opcoes: [
        { valor: "saida", rotulo: "Saída — a pagar" },
        { valor: "entrada", rotulo: "Entrada — a receber" },
      ],
    },
    { chave: "valor", rotulo: "Valor", tipo: "dinheiro", obrigatorio: true },
    {
      chave: "categoriaId",
      rotulo: "Categoria",
      tipo: "select",
      opcoes: categorias.filter((c) => c.ativa).map((c) => ({ valor: c.id, rotulo: c.nome })),
    },
    {
      chave: "fornecedorId",
      rotulo: "Fornecedor",
      tipo: "select",
      opcoes: fornecedores.map((f) => ({ valor: f.id, rotulo: f.nome })),
    },
    {
      chave: "funcionarioId",
      rotulo: "Funcionário",
      tipo: "select",
      opcoes: funcionarios.map((f) => ({ valor: f.id, rotulo: f.nome })),
    },
    {
      chave: "canalId",
      rotulo: "Canal",
      tipo: "select",
      dica: "Preenchido, o custo entra na margem daquele canal na DRE.",
      opcoes: canais.map((c) => ({ valor: c.id, rotulo: c.nome })),
    },
    {
      chave: "competencia",
      rotulo: "Competência",
      tipo: "data",
      obrigatorio: true,
      dica: "O mês a que a conta se refere, não o dia do pagamento.",
    },
    { chave: "vencimento", rotulo: "Vencimento", tipo: "data" },
    { chave: "documento", rotulo: "Boleto / NF", tipo: "texto" },
    { chave: "status", rotulo: "Situação", tipo: "select", padrao: "em_aberto", opcoes: STATUS },
    {
      chave: "pagamento",
      rotulo: "Pago em",
      tipo: "data",
      dica: "Obrigatório quando a situação é Pago.",
      visivel: (v) => v.status === "pago",
    },
    { chave: "formaPagamento", rotulo: "Forma", tipo: "texto", dica: "Boleto, PIX, cartão…" },
    {
      chave: "periodicidade",
      rotulo: "Repete",
      tipo: "select",
      padrao: "unica",
      opcoes: PERIODICIDADE,
    },
    {
      chave: "recorrenciaFim",
      rotulo: "Repetir até",
      tipo: "data",
      dica: "Vazio = sem fim previsto. Gera no máximo 36 ocorrências.",
      visivel: (v) => v.periodicidade !== "unica" && v.periodicidade !== undefined,
    },
    { chave: "observacao", rotulo: "Observação", tipo: "textarea", largo: true },
  ];

  const colunas: Coluna<Conta>[] = [
    {
      chave: "descricao",
      titulo: "Conta",
      render: (c) => (
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-ink font-medium flex items-center gap-1.5">
            {c.descricao}
            {c.origemRecorrenciaId && (
              <Repeat className="w-3 h-3 text-ink-3 shrink-0" aria-label="ocorrência de recorrência" />
            )}
          </span>
          <span className="text-[11.5px] text-ink-3 truncate max-w-xs">
            {[
              c.fornecedorId ? nomeForn.get(c.fornecedorId) : null,
              c.documento,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </span>
        </div>
      ),
    },
    {
      chave: "categoria",
      titulo: "Categoria",
      render: (c) =>
        c.categoriaId && nomeCat.has(c.categoriaId) ? (
          <Badge tone="neutral">{nomeCat.get(c.categoriaId)}</Badge>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      chave: "competencia",
      titulo: "Competência",
      numerica: true,
      render: (c) => <span className="text-ink-2">{br(c.competencia) ?? "—"}</span>,
    },
    {
      chave: "vencimento",
      titulo: "Vence",
      numerica: true,
      render: (c) => {
        if (!c.vencimento) return <span className="text-ink-3">—</span>;
        const atrasada =
          c.vencimento < hoje && c.status !== "pago" && c.status !== "cancelado";
        return (
          <span className={atrasada ? "text-down font-semibold" : "text-ink-2"}>
            {br(c.vencimento)}
          </span>
        );
      },
    },
    {
      chave: "valor",
      titulo: "Valor",
      numerica: true,
      render: (c) => (
        <span className={c.tipo === "entrada" ? "text-up font-semibold" : "text-ink font-semibold"}>
          {c.tipo === "entrada" ? "+" : ""}
          {money(c.valor)}
        </span>
      ),
    },
    { chave: "status", titulo: "Situação", render: (c) => <StatusBadge status={c.status} /> },
  ];

  /*
   * Três totais, porque são três perguntas diferentes: o que já saiu, o
   * que vai sair este mês e o que está vencido. Somar tudo numa linha só
   * esconde exatamente a que importa.
   */
  const saidas = linhas.filter((c) => c.tipo === "saida");
  const pago = saidas.filter((c) => c.status === "pago").reduce((s, c) => s + c.valor, 0);
  const aberto = saidas
    .filter((c) => c.status === "em_aberto" || c.status === "atrasado")
    .reduce((s, c) => s + c.valor, 0);
  const vencidas = saidas.filter(
    (c) => c.vencimento && c.vencimento < hoje && c.status !== "pago" && c.status !== "cancelado"
  );
  const previsto = saidas
    .filter((c) => c.status === "previsto")
    .reduce((s, c) => s + c.valor, 0);

  return (
    <Cadastro<Conta>
      recurso="contas"
      titulo="Contas a pagar"
      singular="Conta"
      linhas={linhas}
      colunas={colunas}
      campos={campos}
      faltaMigracao={faltaMigracao}
      busca={(c) =>
        `${c.descricao} ${c.documento ?? ""} ${
          c.fornecedorId ? nomeForn.get(c.fornecedorId) ?? "" : ""
        } ${c.categoriaId ? nomeCat.get(c.categoriaId) ?? "" : ""}`
      }
      paraForm={(c) => ({
        descricao: c.descricao,
        tipo: c.tipo,
        valor: c.valor,
        categoriaId: c.categoriaId,
        fornecedorId: c.fornecedorId,
        funcionarioId: c.funcionarioId,
        canalId: c.canalId,
        competencia: c.competencia,
        vencimento: c.vencimento,
        documento: c.documento,
        status: c.status,
        pagamento: c.pagamento,
        formaPagamento: c.formaPagamento,
        periodicidade: c.periodicidade,
        recorrenciaFim: c.recorrenciaFim,
        observacao: c.observacao,
      })}
      extraFooter={(v: Registro, set) =>
        v.periodicidade && v.periodicidade !== "unica" ? (
          <div className="ml-auto flex items-center">
            <Checkbox
              checked={v.__replicar === true}
              onChange={(marcado) => set("__replicar", marcado)}
              label="Já criar as próximas"
            />
          </div>
        ) : null
      }
      vazio={{
        titulo: "Nenhuma conta lançada",
        descricao:
          "Lance o primeiro boleto. Contas fixas podem repetir sozinhas: escolha a periodicidade e marque “já criar as próximas”.",
      }}
      resumo={
        linhas.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-px bg-line border border-line rounded-r2 overflow-hidden">
            <div className="bg-panel px-3.5 py-2.5 flex flex-col gap-0.5">
              <span className="label">Em aberto</span>
              <span className="num text-[19px] font-semibold text-ink">{money(aberto)}</span>
            </div>
            <div className="bg-panel px-3.5 py-2.5 flex flex-col gap-0.5">
              <span className="label">Vencidas</span>
              <span
                className={`num text-[19px] font-semibold ${
                  vencidas.length ? "text-down" : "text-ink"
                }`}
              >
                {vencidas.length}
              </span>
              {vencidas.length > 0 && (
                <span className="text-[11px] text-down">
                  {money(vencidas.reduce((s, c) => s + c.valor, 0))}
                </span>
              )}
            </div>
            <div className="bg-panel px-3.5 py-2.5 flex flex-col gap-0.5">
              <span className="label">Já pago</span>
              <span className="num text-[19px] font-semibold text-ink">{money(pago)}</span>
            </div>
            <div className="bg-panel px-3.5 py-2.5 flex flex-col gap-0.5">
              <span className="label">Previsto</span>
              <span className="num text-[19px] font-semibold text-ink">{money(previsto)}</span>
              <span className="text-[11px] text-ink-3">gerado por recorrência</span>
            </div>
          </div>
        ) : undefined
      }
    />
  );
}
