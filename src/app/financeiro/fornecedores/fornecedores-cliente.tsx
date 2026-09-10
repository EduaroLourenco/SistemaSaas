"use client";

import * as React from "react";
import { Badge } from "@/components/ui/primitives";
import { Cadastro, type Coluna, type CampoForm } from "@/components/financeiro/cadastro";
import { money } from "@/lib/format";
import type { Fornecedor, Categoria } from "@/lib/dados/financeiro";

/** 12345678000199 → 12.345.678/0001-99 */
function cnpjBonito(v: string | null) {
  if (!v) return null;
  const d = v.replace(/\D/g, "");
  if (d.length !== 14) return v;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export default function FornecedoresCliente({
  linhas,
  categorias,
  faltaMigracao,
}: {
  linhas: Fornecedor[];
  categorias: Categoria[];
  faltaMigracao: string | null;
}) {
  const nomeCategoria = React.useMemo(
    () => new Map(categorias.map((c) => [c.id, c.nome])),
    [categorias]
  );

  const campos: CampoForm[] = [
    { chave: "razaoSocial", rotulo: "Razão social", tipo: "texto", obrigatorio: true, largo: true },
    { chave: "nomeFantasia", rotulo: "Nome fantasia", tipo: "texto" },
    {
      chave: "cnpj",
      rotulo: "CNPJ",
      tipo: "texto",
      dica: "Só os números — a pontuação é aplicada na exibição.",
    },
    {
      chave: "categoriaId",
      rotulo: "Categoria",
      tipo: "select",
      dica: "É por ela que a DRE agrupa o gasto com este fornecedor.",
      opcoes: categorias
        .filter((c) => c.ativa && c.tipo === "saida")
        .map((c) => ({ valor: c.id, rotulo: c.nome })),
    },
    { chave: "condicaoPagamento", rotulo: "Condição", tipo: "texto", dica: "30/60/90, à vista…" },
    {
      chave: "diaVencimento",
      rotulo: "Dia de vencimento",
      tipo: "numero",
      dica: "Dia do mês. Sugere o vencimento ao lançar uma conta.",
    },
    { chave: "contatoNome", rotulo: "Contato", tipo: "texto" },
    { chave: "contatoTelefone", rotulo: "Telefone", tipo: "texto" },
    { chave: "contatoEmail", rotulo: "E-mail", tipo: "texto", largo: true },
    { chave: "observacao", rotulo: "Observação", tipo: "textarea", largo: true },
    { chave: "ativo", rotulo: "Ativo", tipo: "booleano", padrao: true },
  ];

  const colunas: Coluna<Fornecedor>[] = [
    {
      chave: "razaoSocial",
      titulo: "Fornecedor",
      render: (f) => (
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-ink font-medium">{f.nomeFantasia || f.razaoSocial}</span>
          {f.nomeFantasia && (
            <span className="text-[11.5px] text-ink-3 truncate max-w-xs">{f.razaoSocial}</span>
          )}
        </div>
      ),
    },
    {
      chave: "cnpj",
      titulo: "CNPJ",
      render: (f) =>
        f.cnpj ? (
          <span className="num text-[12.5px] text-ink-2">{cnpjBonito(f.cnpj)}</span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      chave: "categoria",
      titulo: "Categoria",
      render: (f) =>
        f.categoriaId && nomeCategoria.has(f.categoriaId) ? (
          <Badge tone="neutral">{nomeCategoria.get(f.categoriaId)}</Badge>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      chave: "condicao",
      titulo: "Condição",
      render: (f) => (
        <span className="text-ink-2 text-[12.5px]">
          {f.condicaoPagamento || "—"}
          {f.diaVencimento ? (
            <span className="text-ink-3"> · dia {f.diaVencimento}</span>
          ) : null}
        </span>
      ),
    },
    {
      chave: "totalLancado",
      titulo: "Total lançado",
      numerica: true,
      render: (f) =>
        f.totalLancado > 0 ? money(f.totalLancado) : <span className="text-ink-3">—</span>,
    },
    {
      chave: "abertas",
      titulo: "Em aberto",
      numerica: true,
      render: (f) =>
        f.contasAbertas > 0 ? (
          <Badge tone="warn">{f.contasAbertas}</Badge>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      chave: "ativo",
      titulo: "Situação",
      render: (f) =>
        f.ativo ? (
          <span className="text-ink-3 text-[12px]">Ativo</span>
        ) : (
          <Badge tone="warn">Inativo</Badge>
        ),
    },
  ];

  const totalAberto = linhas.reduce((s, f) => s + f.contasAbertas, 0);

  return (
    <Cadastro<Fornecedor>
      recurso="fornecedores"
      titulo="Fornecedores"
      singular="Fornecedor"
      linhas={linhas}
      colunas={colunas}
      campos={campos}
      faltaMigracao={faltaMigracao}
      busca={(f) =>
        `${f.razaoSocial} ${f.nomeFantasia ?? ""} ${f.cnpj ?? ""} ${f.contatoNome ?? ""}`
      }
      paraForm={(f) => ({
        razaoSocial: f.razaoSocial,
        nomeFantasia: f.nomeFantasia,
        cnpj: f.cnpj,
        categoriaId: f.categoriaId,
        condicaoPagamento: f.condicaoPagamento,
        diaVencimento: f.diaVencimento,
        contatoNome: f.contatoNome,
        contatoTelefone: f.contatoTelefone,
        contatoEmail: f.contatoEmail,
        observacao: f.observacao,
        ativo: f.ativo,
      })}
      aoGravar={(v) => ({
        ...v,
        // O CNPJ é gravado só com dígitos: o banco reserva 14 caracteres, e
        // a máscara faria "12.345.678/0001-99" estourar a coluna.
        cnpj: typeof v.cnpj === "string" ? v.cnpj.replace(/\D/g, "") || null : v.cnpj,
      })}
      vazio={{
        titulo: "Nenhum fornecedor",
        descricao:
          "Cadastre o fornecedor uma vez; depois cada boleto vira uma conta apontando para ele.",
      }}
      resumo={
        totalAberto > 0 ? (
          <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-r2 border border-line bg-panel">
            <span className="text-[12px] text-ink-2">
              <b className="num text-ink">{totalAberto}</b> contas em aberto entre todos os
              fornecedores
            </span>
          </div>
        ) : undefined
      }
    />
  );
}
