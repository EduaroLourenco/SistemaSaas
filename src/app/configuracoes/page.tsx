"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Button, Panel, PanelHeader, Badge } from "@/components/ui/primitives";
import {
  Tabs,
  Field,
  Input,
  Select,
  Toggle,
  SectionTitle,
} from "@/components/ui/controls";
import { Check, Download, Upload, TriangleAlert, Pencil } from "lucide-react";

type Aba = "geral" | "aparencia" | "contas" | "notificacoes" | "dados";

const ABAS = [
  { value: "geral" as const, label: "Geral" },
  { value: "aparencia" as const, label: "Aparência" },
  { value: "contas" as const, label: "Contas e operações" },
  { value: "notificacoes" as const, label: "Notificações" },
  { value: "dados" as const, label: "Dados" },
];

type Tema = "claro" | "escuro" | "sistema";
type Densidade = "compacta" | "confortavel";

export default function Configuracoes() {
  /*
   * As abas Geral, Contas e operações, Notificações e Dados saíram: eram
   * de demonstração — salvavam nada, convidavam ninguém, o backup não
   * baixava. Voltam quando houver cadastro de verdade por trás.
   */
  return (
    <>
      <PageHeader title="Configurações" description="Preferências deste navegador" />
      <PageBody>
        <Panel className="overflow-hidden">
          <Aparencia />
        </Panel>
      </PageBody>
    </>
  );
}

/* ── Aparência ──────────────────────────────────────────────── */

const AMOSTRAS: { id: Tema; rotulo: string; descricao: string; fundo: string; painel: string; tinta: string; marca: string }[] = [
  {
    id: "claro",
    rotulo: "Claro",
    descricao: "Padrão. Melhor para tabela densa sob luz forte.",
    fundo: "#f5f6f8",
    painel: "#ffffff",
    tinta: "#101828",
    marca: "#0f5c57",
  },
  {
    id: "escuro",
    rotulo: "Escuro",
    descricao: "Menos brilho em sala fechada e à noite.",
    fundo: "#0b0d12",
    painel: "#14171f",
    tinta: "#e9edf4",
    marca: "#3aa396",
  },
  {
    id: "sistema",
    rotulo: "Sistema",
    descricao: "Acompanha a preferência do aparelho.",
    fundo: "linear-gradient(90deg, #f5f6f8 50%, #0b0d12 50%)",
    painel: "#ffffff",
    tinta: "#101828",
    marca: "#0f5c57",
  },
];

function Aparencia() {
  const [tema, setTema] = React.useState<Tema>("sistema");
  const [densidade, setDensidade] = React.useState<Densidade>("compacta");

  // Lê o que já está aplicado, para a tela não mentir sobre o estado atual.
  React.useEffect(() => {
    try {
      const t = localStorage.getItem("tema");
      setTema(t === "dark" ? "escuro" : t === "light" ? "claro" : "sistema");
      const d = localStorage.getItem("densidade");
      setDensidade(d === "comfortable" ? "confortavel" : "compacta");
    } catch {
      // navegador com armazenamento bloqueado: fica no padrão
    }
  }, []);

  function aplicarTema(t: Tema) {
    setTema(t);
    const raiz = document.documentElement;
    try {
      if (t === "sistema") {
        raiz.removeAttribute("data-theme");
        localStorage.removeItem("tema");
      } else {
        const valor = t === "escuro" ? "dark" : "light";
        raiz.setAttribute("data-theme", valor);
        localStorage.setItem("tema", valor);
      }
    } catch {
      // sem persistência, mas o tema da sessão continua valendo
    }
  }

  function aplicarDensidade(d: Densidade) {
    setDensidade(d);
    const raiz = document.documentElement;
    try {
      if (d === "confortavel") {
        raiz.setAttribute("data-density", "comfortable");
        localStorage.setItem("densidade", "comfortable");
      } else {
        raiz.removeAttribute("data-density");
        localStorage.removeItem("densidade");
      }
    } catch {
      // idem
    }
  }

  return (
    <div className="p-4 sm:p-5 space-y-6">
      <div>
        <SectionTitle
          title="Tema"
          hint="A mudança vale para este navegador, não para os outros usuários."
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          {AMOSTRAS.map((a) => {
            const ativo = tema === a.id;
            return (
              <button
                key={a.id}
                onClick={() => aplicarTema(a.id)}
                className={
                  "text-left rounded-r2 border overflow-hidden transition-colors " +
                  (ativo
                    ? "border-brand ring-2 ring-brand-edge"
                    : "border-line hover:border-line-2")
                }
              >
                {/* miniatura da interface */}
                <span
                  className="block h-24 p-2.5"
                  style={{ background: a.fundo }}
                  aria-hidden
                >
                  <span
                    className="block rounded-[4px] h-full p-2"
                    style={{ background: a.painel }}
                  >
                    <span
                      className="block h-1.5 w-10 rounded-full mb-1.5"
                      style={{ background: a.marca }}
                    />
                    <span
                      className="block h-1 w-16 rounded-full mb-1 opacity-70"
                      style={{ background: a.tinta }}
                    />
                    <span
                      className="block h-1 w-12 rounded-full mb-1 opacity-40"
                      style={{ background: a.tinta }}
                    />
                    <span
                      className="block h-1 w-14 rounded-full opacity-40"
                      style={{ background: a.tinta }}
                    />
                  </span>
                </span>

                <span className="flex items-start justify-between gap-2 px-3 py-2.5 bg-panel border-t border-line">
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-ink">
                      {a.rotulo}
                    </span>
                    <span className="block text-[11px] text-ink-3 leading-snug mt-0.5">
                      {a.descricao}
                    </span>
                  </span>
                  {ativo && (
                    <span className="w-4 h-4 rounded-full bg-brand flex items-center justify-center shrink-0 mt-px">
                      <Check
                        className="w-2.5 h-2.5 text-brand-ink"
                        strokeWidth={3.5}
                      />
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-4 border-t border-line">
        <SectionTitle
          title="Densidade das tabelas"
          hint="Compacta mostra mais linhas por tela; confortável facilita o toque no celular."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 max-w-xl">
          {(
            [
              { id: "compacta" as const, rotulo: "Compacta", altura: "32 px por linha" },
              { id: "confortavel" as const, rotulo: "Confortável", altura: "42 px por linha" },
            ]
          ).map((d) => {
            const ativo = densidade === d.id;
            return (
              <button
                key={d.id}
                onClick={() => aplicarDensidade(d.id)}
                className={
                  "flex items-center justify-between gap-3 px-3 h-14 rounded-r2 border transition-colors " +
                  (ativo
                    ? "border-brand bg-brand-wash"
                    : "border-line hover:border-line-2")
                }
              >
                <span className="min-w-0 text-left">
                  <span
                    className={
                      "block text-[13px] font-medium " +
                      (ativo ? "text-brand" : "text-ink")
                    }
                  >
                    {d.rotulo}
                  </span>
                  <span className="num block text-[11px] text-ink-3">
                    {d.altura}
                  </span>
                </span>
                {ativo && (
                  <span className="w-4 h-4 rounded-full bg-brand flex items-center justify-center shrink-0">
                    <Check className="w-2.5 h-2.5 text-brand-ink" strokeWidth={3.5} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

