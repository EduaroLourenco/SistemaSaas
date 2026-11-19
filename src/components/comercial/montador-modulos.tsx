"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageCircle, X } from "lucide-react";
import {
  MODULOS, PACOTES, WHATSAPP_COMERCIAL, adicionar, bloqueioParaRemover, moduloPorId, sugestoes, type ModuloId,
} from "@/lib/comercial/modulos";

const CHECK = "M3 15 12 25 31 3";

function Dicas({ escolhidos, aoAdicionar }: { escolhidos: ModuloId[]; aoAdicionar: (id: ModuloId) => void }) {
  const lista = sugestoes(escolhidos);
  if (!lista.length) return null;
  return (
    <div className="gz-dicas" aria-label="Combina com o que você escolheu">
      {lista.map((s) => (
        <p className="gz-dica" key={s.para.id}>
          {s.para.nome} combina: {s.porque}.
          <button type="button" onClick={() => aoAdicionar(s.para.id)}>incluir</button>
        </p>
      ))}
    </div>
  );
}

function Pedido({ escolhidos, aoFechar }: { escolhidos: ModuloId[]; aoFechar: () => void }) {
  const [estado, setEstado] = useState<"pronto" | "enviando" | "ok">("pronto");
  const [erro, setErro] = useState("");
  const [nome, setNome] = useState("");
  const primeiro = useRef<HTMLInputElement>(null);
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    primeiro.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") fechar.current(); };
    const rolagem = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("keydown", esc); document.documentElement.style.overflow = rolagem; anterior?.focus?.(); };
  }, []);
  const nomes = escolhidos.map((id) => moduloPorId(id).nome);
  const textoWhats = encodeURIComponent(`Olá! Quero uma demonstração do Gerizo.\nNome: ${nome}\nMódulos: ${nomes.join(", ")}`);

  return (
    <div className="gz-pedido" role="dialog" aria-modal="true" aria-labelledby="pedido-titulo" onClick={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
      <div className="gz-pedido-box">
        <button type="button" className="gz-fechar" onClick={aoFechar} aria-label="Fechar"><X size={20} aria-hidden /></button>
        {estado === "ok" ? (
          <div className="gz-ok" role="status">
            <svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 8C76 8 92 26 91 50 90 74 72 92 48 91 24 90 8 72 9 48 10 26 28 9 54 10" pathLength={1} /><path d="M30 52 44 66 72 36" pathLength={1} /></svg>
            <h3 id="pedido-titulo">Você entrou na fila!</h3>
            <p>Vamos te chamar para mostrar o Gerizo com o que você escolheu.</p>
            <a className="gz-btn gz-btn-primary" href={`https://wa.me/${WHATSAPP_COMERCIAL}?text=${textoWhats}`} target="_blank" rel="noreferrer"><MessageCircle size={18} aria-hidden /> Adiantar pelo WhatsApp</a>
            <button type="button" className="gz-link" onClick={aoFechar}>Voltar ao site</button>
          </div>
        ) : (
          <>
            <h3 id="pedido-titulo">Peça sua demonstração</h3>
            <p className="gz-resumo">{nomes.join(", ")}.</p>
            <form className="gz-form" onSubmit={async (e) => {
              e.preventDefault();
              if (estado === "enviando") return;
              const dados = new FormData(e.currentTarget);
              setEstado("enviando"); setErro("");
              try {
                const r = await fetch("/api/interesse", {
                  method: "POST", headers: { "content-type": "application/json" },
                  body: JSON.stringify({ nome: dados.get("nome"), telefone: dados.get("telefone"), empresa: dados.get("empresa"), website: dados.get("website"), modulos: escolhidos }),
                });
                const j = await r.json().catch(() => ({}));
                if (!r.ok || j.ok !== true) throw new Error(j.erro || "Não deu para enviar agora. Tente de novo.");
                setEstado("ok");
              } catch (falha) { setEstado("pronto"); setErro(falha instanceof Error ? falha.message : "Sem conexão. Tente de novo."); }
            }}>
              <label>Seu nome<input ref={primeiro} name="nome" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" required minLength={2} maxLength={100} placeholder="Como podemos te chamar?" /></label>
              <label>WhatsApp<input name="telefone" type="tel" inputMode="tel" autoComplete="tel" required minLength={10} maxLength={24} placeholder="(16) 99999-9999" /></label>
              <label>Loja ou empresa<input name="empresa" autoComplete="organization" maxLength={80} placeholder="Opcional" /></label>
              <div className="gz-bot" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
              {erro && <p className="gz-erro" role="alert">{erro}</p>}
              <button className="gz-btn gz-btn-primary" type="submit" disabled={estado === "enviando"}>{estado === "enviando" ? "Enviando…" : "Entrar na fila de demonstração"}</button>
              <p className="gz-legal">Usamos seus dados só para falar sobre o Gerizo. <Link href="/privacidade">Privacidade</Link></p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export function MontadorModulos() {
  const [escolhidos, setEscolhidos] = useState<ModuloId[]>(["vendas", "anuncios", "queda"]);
  const [aviso, setAviso] = useState("");
  const [pedindo, setPedindo] = useState(false);
  const [barra, setBarra] = useState(false);
  const area = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => setBarra(e.isIntersecting), { threshold: 0.05 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  function alternar(id: ModuloId) {
    if (escolhidos.includes(id)) {
      const motivo = bloqueioParaRemover(escolhidos, id);
      if (motivo) { setAviso(motivo); return; }
      setEscolhidos(escolhidos.filter((m) => m !== id)); setAviso("");
      return;
    }
    const r = adicionar(escolhidos, id);
    setEscolhidos(r.modulos);
    const def = moduloPorId(id);
    setAviso(r.junto.length ? `Coloquei ${r.junto.map((m) => moduloPorId(m).nome).join(" e ")} junto: ${def.requer?.porque ?? def.requerUm?.porque}.` : "");
  }

  return (
    <div className="gz-monte-grade" ref={area}>
      <div>
        <div className="gz-pacotes" role="group" aria-label="Começar por um pacote">
          <span>Começar por</span>
          {PACOTES.map((p) => <button type="button" key={p.nome} onClick={() => { setEscolhidos(p.modulos); setAviso(""); }}>{p.nome.toLowerCase()}</button>)}
        </div>
        <div className="gz-folha">
          {MODULOS.map((m) => (
            <button type="button" key={m.id} className="gz-item" aria-pressed={escolhidos.includes(m.id)} onClick={() => alternar(m.id)}>
              <span className="gz-quadrado" aria-hidden="true"><svg viewBox="0 0 34 28"><path d={CHECK} pathLength={1} /></svg></span>
              <span>
                <b>{m.nome}{m.obrigatorio && <small>sempre incluído</small>}</b>
                <p>{m.frase}</p>
                <span className="gz-telas">{m.telas.join(", ")}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <aside className="gz-caixa-lado" aria-label="Seu pacote">
        <div className="gz-caixa">
          <span className="gz-caixa-titulo">seu pacote</span>
          <div className="gz-etiquetas">
            {escolhidos.map((id) => { const m = moduloPorId(id); return <span key={id} className="gz-etiqueta" style={{ "--c": m.cor } as React.CSSProperties}><i />{m.nome}</span>; })}
          </div>
          <div className="gz-caixa-rodape"><span>módulos na caixa</span><strong aria-live="polite">{escolhidos.length}</strong></div>
        </div>
        {aviso && <p className="gz-aviso" role="status">{aviso}</p>}
        <Dicas escolhidos={escolhidos} aoAdicionar={alternar} />
        <p className="gz-preco">Preço a consultar. Mostramos tudo funcionando e montamos a proposta com você.</p>
        <button type="button" className="gz-btn gz-btn-primary" onClick={() => setPedindo(true)}>Pedir demonstração</button>
      </aside>

      <div className={`gz-barra${barra && !pedindo ? " is-visible" : ""}`} aria-hidden={!barra}>
        <div><b>{escolhidos.length} módulos</b><span>Preço a consultar</span></div>
        <button type="button" className="gz-btn gz-btn-primary gz-btn-small" tabIndex={barra ? 0 : -1} onClick={() => setPedindo(true)}>Pedir demonstração</button>
      </div>
      {pedindo && <Pedido escolhidos={escolhidos} aoFechar={() => setPedindo(false)} />}
    </div>
  );
}
