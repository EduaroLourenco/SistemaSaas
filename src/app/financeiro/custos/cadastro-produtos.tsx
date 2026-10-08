"use client";

import * as React from "react";
import { Download, Plus, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { Field, Input, Sheet } from "@/components/ui/controls";

/**
 * As três portas de entrada de produto e custo:
 *
 *   · Trazer produtos — cria um produto para cada SKU anunciado ou vendido
 *     que ainda não tem (a sincronização faz o mesmo sozinha, duas vezes
 *     ao dia; o botão é para não esperar).
 *   · Planilha — baixa todos os produtos, preenche custo, sobe. É o
 *     primeiro abastecimento de uma empresa nova.
 *   · Novo produto — um SKU que ainda não vendeu nem foi anunciado.
 */
export function CadastroProdutos({ aoMudar }: { aoMudar: (msg: string) => void }) {
  const [ocupado, setOcupado] = React.useState<string | null>(null);
  const [novo, setNovo] = React.useState(false);
  const arquivo = React.useRef<HTMLInputElement>(null);

  async function trazer() {
    setOcupado("trazer");
    try {
      const r = await fetch("/api/custos/produto", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acao: "abastecer" }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return aoMudar(j.erro ?? "Não consegui trazer os produtos.");
      aoMudar(
        j.criados
          ? `${j.criados} produto(s) novo(s), ${j.ligados} anúncio(s) ligados. Preencha os custos.`
          : "Todos os SKUs anunciados e vendidos já têm produto."
      );
      if (j.criados || j.ligados) window.location.reload();
    } finally {
      setOcupado(null);
    }
  }

  async function subir(f: File) {
    setOcupado("subir");
    try {
      const form = new FormData();
      form.set("arquivo", f);
      const r = await fetch("/api/custos/planilha", { method: "POST", body: form });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return aoMudar(j.erro ?? "Não consegui ler a planilha.");
      const recusa = j.recusadas?.length
        ? ` ${j.recusadas.length} linha(s) recusada(s): ${j.recusadas.slice(0, 3).join("; ")}${j.recusadas.length > 3 ? "…" : ""}`
        : "";
      aoMudar(`Planilha lida: ${j.atualizados} produto(s) atualizados, ${j.criados} criados.${recusa}`);
      if (j.atualizados || j.criados) setTimeout(() => window.location.reload(), recusa ? 4000 : 800);
    } finally {
      setOcupado(null);
      if (arquivo.current) arquivo.current.value = "";
    }
  }

  return (
    <>
      <Button size="sm" onClick={trazer} disabled={!!ocupado} title="Cria produto para todo SKU anunciado ou vendido">
        <RefreshCw className="h-3.5 w-3.5" /> {ocupado === "trazer" ? "Trazendo…" : "Trazer produtos"}
      </Button>
      <a
        href="/api/custos/planilha"
        className="inline-flex h-9 items-center gap-1.5 rounded-r1 border border-line-2 bg-panel px-3 text-[12px] font-medium text-ink hover:bg-panel-3"
      >
        <Download className="h-3.5 w-3.5" /> Baixar planilha
      </a>
      <Button size="sm" onClick={() => arquivo.current?.click()} disabled={!!ocupado}>
        <Upload className="h-3.5 w-3.5" /> {ocupado === "subir" ? "Lendo…" : "Subir planilha"}
      </Button>
      <input
        ref={arquivo}
        type="file"
        accept=".xlsx"
        hidden
        onChange={(e) => e.target.files?.[0] && subir(e.target.files[0])}
      />
      <Button size="sm" variant="primary" onClick={() => setNovo(true)}>
        <Plus className="h-3.5 w-3.5" /> Novo produto
      </Button>
      {novo && <NovoProduto aoFechar={() => setNovo(false)} aoMudar={aoMudar} />}
    </>
  );
}

function NovoProduto({ aoFechar, aoMudar }: { aoFechar: () => void; aoMudar: (m: string) => void }) {
  const [v, setV] = React.useState({ sku: "", titulo: "", custo: "", embalagem: "", imposto: "", peso: "" });
  const [erro, setErro] = React.useState<string | null>(null);
  const [gravando, setGravando] = React.useState(false);
  const campo = (k: keyof typeof v) => ({
    value: v[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value }),
  });

  async function gravar(e: React.FormEvent) {
    e.preventDefault();
    setGravando(true);
    setErro(null);
    try {
      const r = await fetch("/api/custos/produto", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acao: "novo", ...v }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setErro(j.erro ?? "Não consegui gravar.");
      aoMudar(`Produto ${v.sku} cadastrado.`);
      window.location.reload();
    } finally {
      setGravando(false);
    }
  }

  return (
    <Sheet
      title="Novo produto"
      subtitle="Para um SKU que ainda não foi anunciado nem vendido. Os que já venderam entram sozinhos."
      onClose={aoFechar}
    >
      <form id="novo-produto" onSubmit={gravar} className="flex flex-col gap-3">
        <Field label="SKU">
          <Input required maxLength={80} placeholder="Ex.: PA85352" {...campo("sku")} />
        </Field>
        <Field label="Nome do produto">
          <Input placeholder="Como aparece nos relatórios" {...campo("titulo")} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Custo da mercadoria (R$)" hint="por unidade">
            <Input inputMode="decimal" {...campo("custo")} />
          </Field>
          <Field label="Embalagem (R$)">
            <Input inputMode="decimal" {...campo("embalagem")} />
          </Field>
          <Field label="Imposto (%)" hint="sobre a venda">
            <Input inputMode="decimal" {...campo("imposto")} />
          </Field>
          <Field label="Peso (kg)" hint="do pacote">
            <Input inputMode="decimal" {...campo("peso")} />
          </Field>
        </div>
        {erro && <p className="text-[13px] text-down">{erro}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={gravando}>
            {gravando ? "Gravando…" : "Cadastrar"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
