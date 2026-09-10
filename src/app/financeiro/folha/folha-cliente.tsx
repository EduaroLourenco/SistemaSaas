"use client";

import * as React from "react";
import { Badge } from "@/components/ui/primitives";
import { Cadastro, type Coluna, type CampoForm } from "@/components/financeiro/cadastro";
import { money } from "@/lib/format";
import type { Funcionario, Categoria, FolhaLinha } from "@/lib/dados/financeiro";

const PERIODICIDADE = [
  { valor: "mensal", rotulo: "Mensal" },
  { valor: "bimestral", rotulo: "Bimestral" },
  { valor: "trimestral", rotulo: "Trimestral" },
  { valor: "semestral", rotulo: "Semestral" },
  { valor: "anual", rotulo: "Anual" },
  { valor: "unica", rotulo: "Pagamento único" },
];

export default function FolhaCliente({
  linhas,
  categorias,
  folha,
  faltaMigracao,
}: {
  linhas: Funcionario[];
  categorias: Categoria[];
  folha: FolhaLinha[];
  faltaMigracao: string | null;
}) {
  const campos: CampoForm[] = [
    { chave: "nome", rotulo: "Nome", tipo: "texto", obrigatorio: true, largo: true },
    { chave: "cargo", rotulo: "Cargo", tipo: "texto" },
    { chave: "setor", rotulo: "Setor", tipo: "texto" },
    {
      chave: "salarioBase",
      rotulo: "Salário bruto",
      tipo: "dinheiro",
      dica: "O que está no contrato, antes dos descontos.",
    },
    {
      chave: "salarioLiquido",
      rotulo: "Salário líquido",
      tipo: "dinheiro",
      dica: "O que cai na conta da pessoa.",
    },
    {
      chave: "beneficios",
      rotulo: "Benefícios",
      tipo: "dinheiro",
      dica: "VR, VT, plano. Somam ao custo, não ao líquido.",
    },
    {
      chave: "encargos",
      rotulo: "Encargos",
      tipo: "dinheiro",
      dica: "FGTS, INSS patronal, provisões.",
    },
    {
      chave: "diaPagamento",
      rotulo: "Dia do pagamento",
      tipo: "numero",
      dica: "Dia do mês. 5 = todo dia 5.",
    },
    {
      chave: "periodicidade",
      rotulo: "Periodicidade",
      tipo: "select",
      padrao: "mensal",
      opcoes: PERIODICIDADE,
    },
    {
      chave: "categoriaId",
      rotulo: "Categoria na DRE",
      tipo: "select",
      opcoes: categorias
        .filter((c) => c.ativa && c.tipo === "saida")
        .map((c) => ({ valor: c.id, rotulo: c.nome })),
    },
    { chave: "admissao", rotulo: "Admissão", tipo: "data" },
    {
      chave: "demissao",
      rotulo: "Demissão",
      tipo: "data",
      dica: "Preenchida, tira a pessoa do custo dos meses seguintes.",
    },
    { chave: "observacao", rotulo: "Observação", tipo: "textarea", largo: true },
    { chave: "ativo", rotulo: "Ativo", tipo: "booleano", padrao: true },
  ];

  const colunas: Coluna<Funcionario>[] = [
    {
      chave: "nome",
      titulo: "Funcionário",
      render: (f) => (
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-ink font-medium">{f.nome}</span>
          {(f.cargo || f.setor) && (
            <span className="text-[11.5px] text-ink-3 truncate max-w-xs">
              {[f.cargo, f.setor].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>
      ),
    },
    {
      chave: "bruto",
      titulo: "Bruto",
      numerica: true,
      render: (f) =>
        f.salarioBase > 0 ? money(f.salarioBase) : <span className="text-ink-3">—</span>,
    },
    {
      chave: "liquido",
      titulo: "Líquido",
      numerica: true,
      render: (f) =>
        f.salarioLiquido != null ? (
          money(f.salarioLiquido)
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      chave: "beneficios",
      titulo: "Benef. + enc.",
      numerica: true,
      render: (f) => {
        const v = f.beneficios + f.encargos;
        return v > 0 ? money(v) : <span className="text-ink-3">—</span>;
      },
    },
    {
      chave: "custo",
      titulo: "Custo mensal",
      numerica: true,
      render: (f) => <span className="text-ink font-semibold">{money(f.custoMensal)}</span>,
    },
    {
      chave: "dia",
      titulo: "Paga dia",
      numerica: true,
      render: (f) =>
        f.diaPagamento ? f.diaPagamento : <span className="text-ink-3">—</span>,
    },
    {
      chave: "ativo",
      titulo: "Situação",
      render: (f) =>
        f.demissao ? (
          <Badge tone="neutral">Desligado</Badge>
        ) : f.ativo ? (
          <span className="text-ink-3 text-[12px]">Ativo</span>
        ) : (
          <Badge tone="warn">Inativo</Badge>
        ),
    },
  ];

  const naEquipe = linhas.filter((f) => f.ativo && !f.demissao);
  const custoTotal = naEquipe.reduce((s, f) => s + f.custoMensal, 0);
  const liquidoTotal = naEquipe.reduce((s, f) => s + (f.salarioLiquido ?? 0), 0);
  const semLiquido = naEquipe.filter((f) => f.salarioLiquido == null).length;

  return (
    <Cadastro<Funcionario>
      recurso="funcionarios"
      titulo="Folha de pagamento"
      singular="Funcionário"
      linhas={linhas}
      colunas={colunas}
      campos={campos}
      faltaMigracao={faltaMigracao}
      busca={(f) => `${f.nome} ${f.cargo ?? ""} ${f.setor ?? ""}`}
      paraForm={(f) => ({
        nome: f.nome,
        cargo: f.cargo,
        setor: f.setor,
        salarioBase: f.salarioBase || null,
        salarioLiquido: f.salarioLiquido,
        beneficios: f.beneficios || null,
        encargos: f.encargos || null,
        diaPagamento: f.diaPagamento,
        periodicidade: f.periodicidade,
        categoriaId: f.categoriaId,
        admissao: f.admissao,
        demissao: f.demissao,
        observacao: f.observacao,
        ativo: f.ativo,
      })}
      vazio={{
        titulo: "Nenhum funcionário",
        descricao:
          "Cadastre a equipe para a folha entrar no resultado. Sem ela, a DRE mostra margem de contribuição mas não o que sobra de verdade.",
      }}
      resumo={
        naEquipe.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-px bg-line border border-line rounded-r2 overflow-hidden">
            <div className="bg-panel px-3.5 py-2.5 flex flex-col gap-0.5">
              <span className="label">Na equipe</span>
              <span className="num text-[19px] font-semibold text-ink">{naEquipe.length}</span>
            </div>
            <div className="bg-panel px-3.5 py-2.5 flex flex-col gap-0.5">
              <span className="label">Custo mensal</span>
              <span className="num text-[19px] font-semibold text-ink">{money(custoTotal)}</span>
              <span className="text-[11px] text-ink-3">bruto + benefícios + encargos</span>
            </div>
            <div className="bg-panel px-3.5 py-2.5 flex flex-col gap-0.5">
              <span className="label">Líquido somado</span>
              <span className="num text-[19px] font-semibold text-ink">
                {liquidoTotal > 0 ? money(liquidoTotal) : "—"}
              </span>
              {semLiquido > 0 && (
                <span className="text-[11px] text-warn">
                  {semLiquido} sem líquido preenchido
                </span>
              )}
            </div>
            <div className="bg-panel px-3.5 py-2.5 flex flex-col gap-0.5">
              <span className="label">Competências fechadas</span>
              <span className="num text-[19px] font-semibold text-ink">{folha.length}</span>
              <span className="text-[11px] text-ink-3">
                {folha.length === 0 ? "nenhum mês lançado ainda" : "meses com folha gravada"}
              </span>
            </div>
          </div>
        ) : undefined
      }
    />
  );
}
