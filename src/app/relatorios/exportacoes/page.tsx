"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Button, Panel, PanelHeader, Badge } from "@/components/ui/primitives";
import { Download, Loader2, AlertCircle, Package, Sparkles, ChartNoAxesCombined, CalendarDays, Megaphone, Tags, type LucideIcon } from "lucide-react";
import { Disclosure } from "@/components/ui/disclosure";

/**
 * Exportações.
 *
 * A versão anterior tinha seis botões que não faziam nada e tamanhos
 * escritos à mão no código ("~2,4 MB", "~480 KB"). Botão de download que
 * não baixa é pior que a ausência dele: a pessoa clica, nada acontece, e
 * fica sem saber se o problema é o arquivo ou a conexão.
 *
 * Agora cada botão chama /api/exportar e o arquivo vem montado do banco.
 * Não há tamanho estimado porque o tamanho depende do que existe no
 * período — número inventado num rótulo é do mesmo tipo que o resto que
 * saiu do sistema.
 */

type Formato = {
  id: string;
  titulo: string;
  descricao: string;
  extensao: "CSV" | "XLSX";
  icone: LucideIcon;
  tom: string;
};

const FORMATOS: Formato[] = [
  {
    id: "vendas_diarias",
    titulo: "Lançamentos diários",
    descricao:
      "Uma linha por canal por dia, com visitas, receita, pedidos, mídia, cancelamentos, ticket, ACOS e ROAS.",
    extensao: "CSV",
    icone: ChartNoAxesCombined,
    tom: "bg-info-wash text-info",
  },
  {
    id: "consolidado_mensal",
    titulo: "Consolidado mensal",
    descricao:
      "Uma linha por canal por mês, com ticket, conversão e TACOS já calculados.",
    extensao: "CSV",
    icone: CalendarDays,
    tom: "bg-up-wash text-up",
  },
  {
    id: "desempenho_anuncios",
    titulo: "Desempenho de anúncios",
    descricao:
      "Histórico semanal por anúncio: visitas, unidades, receita, preço pago, comissão real e conversão.",
    extensao: "XLSX",
    icone: Megaphone,
    tom: "bg-brand-wash text-brand",
  },
  {
    id: "historico_promocoes",
    titulo: "Histórico de promoções",
    descricao:
      "Cada decisão com os quatro preços — ofertado pelo canal, tabela, piso e com desconto extra.",
    extensao: "CSV",
    icone: Tags,
    tom: "bg-warn-wash text-warn",
  },
];

export default function Exportacoes() {
  const [baixando, setBaixando] = React.useState<string | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  async function exportar(formato: Formato) {
    return baixarDe(`/api/exportar?formato=${formato.id}`, formato.id, `${formato.id}.csv`);
  }

  async function baixarDe(rota: string, id: string, nomePadrao: string) {
    setBaixando(id);
    setErro(null);
    try {
      const r = await fetch(rota);
      if (!r.ok) {
        const corpo = await r.json().catch(() => ({}));
        setErro(corpo.erro ?? `Falha ao gerar (HTTP ${r.status})`);
        return;
      }

      /*
       * O nome vem do cabeçalho do servidor, não montado aqui: assim o
       * arquivo baixado e o que o servidor registrou têm o mesmo nome.
       */
      const cd = r.headers.get("content-disposition") ?? "";
      const nome = cd.match(/filename="([^"]+)"/)?.[1] ?? nomePadrao;

      const blob = await r.blob();
      if (blob.size === 0) {
        setErro("O arquivo veio vazio — não há dados no período.");
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Sem revoke, cada download deixa o arquivo inteiro na memória da aba.
      URL.revokeObjectURL(url);
    } catch {
      setErro("Sem conexão — nada foi baixado.");
    } finally {
      setBaixando(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Exportações"
        breadcrumb="Relatórios"
        description="Seus resultados prontos para analisar e compartilhar"
      />

      <PageBody>
        {/* O pacote fica antes da lista: é o que a maioria quer quando
            chega aqui, e os arquivos avulsos são o caso específico. */}
        <Panel className="p-4 mb-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 mb-1.5">
                <Package className="w-4 h-4 text-brand shrink-0" strokeWidth={2} />
                <p className="text-[14px] font-semibold text-ink">
                  Pacote completo da operação
                </p>
                <span className="inline-flex items-center gap-1 text-[12px] text-ink-3">
                  <Sparkles className="w-3 h-3" strokeWidth={2} />
                  para IA
                </span>
              </span>
              <p className="text-[12.5px] text-ink-2 leading-relaxed max-w-xl">
                Seis arquivos CSV num zip (pedidos, itens, anúncios, desempenho semanal, KPIs diários e canais), com os
                mesmos números das telas.
              </p>
              <Disclosure title="Como o arquivo vem" className="mt-2.5 max-w-xl">
                Vem em formato de máquina — vírgula, decimal com ponto, data
                aaaa-mm-dd. E um <span className="num">LEIA-ME.md</span> que diz
                o que os dados <span className="font-medium text-ink-2">não</span>{" "}
                permitem concluir: margem não é calculável sem custo, e visita
                fora do Mercado Livre é desconhecida, não zero. Sem isso, quem
                analisar inventa os dois.
              </Disclosure>
            </div>
            <Button
              variant="primary"
              disabled={baixando !== null}
              onClick={() => baixarDe("/api/exportar/pacote", "pacote", "operacao.zip")}
              className="shrink-0 max-sm:w-full max-sm:h-11"
            >
              {baixando === "pacote" ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Montando
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" strokeWidth={2.25} />
                  Baixar pacote
                </>
              )}
            </Button>
          </div>
        </Panel>

        {/* Evolução por anúncio: a planilha que responde "por que caiu"
            sem precisar cruzar três exportações à mão. */}
        <Panel className="p-4 mb-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-ink mb-1.5">
                Evolução semanal por anúncio
              </p>
              <p className="text-[12.5px] text-ink-2 leading-relaxed max-w-xl">
                Um anúncio por linha, e as semanas andam para o lado. Cada
                semana traz visitas, vendas, unidades, conversão, receita,
                preço praticado e o retido pelo canal — a queda aparece lendo
                da esquerda para a direita.
              </p>
              <Disclosure title="Como ler a comissão" className="mt-2.5 max-w-xl">
                A comissão vem em duas colunas —{" "}
                <span className="font-medium text-ink-2">tarifa de tabela</span>{" "}
                e <span className="font-medium text-ink-2">retido</span>. Elas
                discordam quando houve redução por campanha, e a diferença entre
                as duas é o que a campanha economizou. Célula vazia significa
                sem informação, nunca zero.
              </Disclosure>
            </div>
            <Button
              variant="default"
              disabled={baixando !== null}
              onClick={() =>
                baixarDe("/api/exportar/evolucao", "evolucao", "evolucao-anuncios.xlsx")
              }
              className="shrink-0 max-sm:w-full max-sm:h-11"
            >
              {baixando === "evolucao" ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Montando
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" strokeWidth={2.25} />
                  Baixar Excel
                </>
              )}
            </Button>
          </div>
        </Panel>

        {erro && (
          <Panel className="px-4 py-3 flex items-start gap-2.5 border-down/30">
            <AlertCircle className="w-4 h-4 text-down shrink-0 mt-0.5" />
            <p className="text-[12.5px] text-ink-2">{erro}</p>
          </Panel>
        )}

        <Panel className="overflow-hidden">
          <PanelHeader
            title="Formatos disponíveis"
            hint="Arquivos gerados com os dados atuais"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 p-3">
            {FORMATOS.map((f) => (
              <div key={f.id} className="rounded-r2 border border-line bg-panel p-4 flex flex-col gap-3">
                <span className={`grid h-12 w-12 place-items-center rounded-r2 ${f.tom}`} aria-hidden="true"><f.icone size={24} strokeWidth={1.7} /></span>
                <span>
                  <span className="flex flex-wrap items-start justify-between gap-2 mb-2">
                    <span className="text-[13.5px] font-semibold text-ink">
                      {f.titulo}
                    </span>
                    <Badge tone="neutral">{f.extensao}</Badge>
                  </span>
                  <p className="text-[12.5px] text-ink-2 leading-relaxed">
                    {f.descricao}
                  </p>
                </span>
                {/* Secundário: a ação principal da tela é o pacote completo. */}
                <Button
                  variant="default"
                  className="mt-auto w-full"
                  onClick={() => exportar(f)}
                  disabled={baixando !== null}
                >
                  {baixando === f.id ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Gerando
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      Exportar
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>
        </Panel>

      </PageBody>
    </>
  );
}
