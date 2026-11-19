"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

export function InterestForm() {
  const [estado, setEstado] = useState<"pronto" | "enviando" | "sucesso" | "erro">("pronto");
  const [erro, setErro] = useState("");
  return <div className="commercial-interest-form">
    {estado === "sucesso" ? <div className="commercial-form-success" role="status"><CheckCircle2 size={30} aria-hidden="true" /><h3>Interesse registrado.</h3><p>Recebemos seus dados para entrar em contato sobre o acesso ao Gerizo.</p><button type="button" onClick={() => setEstado("pronto")}>Cadastrar outro contato</button></div> : <form onSubmit={async e => {
      e.preventDefault();
      if (estado === "enviando") return;
      const form = e.currentTarget;
      const valores = new FormData(form);
      setEstado("enviando"); setErro("");
      try {
        const r = await fetch("/api/interesse", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nome: valores.get("nome"), telefone: valores.get("telefone"), website: valores.get("website") }) });
        const resultado = await r.json().catch(() => ({}));
        if (!r.ok || resultado.ok !== true) throw new Error(resultado.erro || "Não foi possível registrar agora. Tente novamente.");
        form.reset(); setEstado("sucesso");
      } catch (e) { setEstado("erro"); setErro(e instanceof Error ? e.message : "Falha de conexão. Tente novamente."); }
    }}>
      <label>Seu nome<input name="nome" autoComplete="name" required minLength={2} maxLength={100} placeholder="Como podemos chamar você?" disabled={estado === "enviando"} /></label>
      <label>Telefone de contato<input name="telefone" type="tel" inputMode="tel" autoComplete="tel" required minLength={10} maxLength={24} placeholder="(11) 99999-9999" disabled={estado === "enviando"} /></label>
      <div className="commercial-bot-field" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <p className="commercial-form-purpose">Usaremos esses dados para conversar sobre o produto e avisar sobre o acesso. <Link href="/privacidade">Política de privacidade</Link></p>
      {erro && <p className="commercial-form-error" role="alert">{erro}</p>}
      <button className="commercial-button commercial-button-primary" type="submit" disabled={estado === "enviando"}>{estado === "enviando" ? "Registrando…" : "Quero conhecer o Gerizo"}</button>
    </form>}
  </div>;
}
