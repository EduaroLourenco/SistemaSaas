import Link from "next/link";
import { redirect } from "next/navigation";
import { clienteServidor } from "@/lib/supabase/servidor";
import AceitarConvite from "./aceitar";

export const dynamic = "force-dynamic";

/**
 * Onde um convite vira acesso.
 *
 * `convite_por_token` é executável por `anon` de propósito: quem recebeu o
 * link precisa saber de qual empresa ele é ANTES de criar conta, senão
 * estaria sendo levado a se cadastrar às cegas.
 *
 * O aceite em si exige sessão — `aceitar_convite` usa `auth.uid()` para
 * saber quem está entrando. Por isso, sem login, a página manda cadastrar
 * e volta para cá.
 */

type Convite = {
  empresa: string;
  email: string;
  papel: string;
  expira_em: string;
  aceito: boolean;
};

const PAPEL: Record<string, string> = {
  proprietario: "Proprietário",
  administrador: "Administrador",
  editor: "Editor",
  leitor: "Leitor",
};

function Aviso({
  titulo,
  texto,
  acao,
}: {
  titulo: string;
  texto: string;
  acao?: { href: string; rotulo: string };
}) {
  return (
    <main className="min-h-screen grid place-items-center px-4 bg-canvas">
      <div className="w-full max-w-sm flex flex-col gap-4 text-center">
        <h1 className="text-[18px] font-semibold text-ink">{titulo}</h1>
        <p className="text-[13px] text-ink-2 leading-relaxed">{texto}</p>
        {acao && (
          <Link
            href={acao.href}
            className="text-[13px] font-medium text-brand hover:underline"
          >
            {acao.rotulo}
          </Link>
        )}
      </div>
    </main>
  );
}

export default async function Pagina({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = await clienteServidor();

  const { data, error } = await sb.rpc("convite_por_token", { p_token: token });
  if (error) {
    return (
      <Aviso
        titulo="Não consegui ler o convite"
        texto={
          error.code === "42883"
            ? "Falta rodar a migração db/20_cadastro_e_convites.sql no Supabase."
            : "Tente de novo em instantes."
        }
      />
    );
  }

  const convite = (data as Convite[] | null)?.[0];
  if (!convite) {
    return (
      <Aviso
        titulo="Convite não encontrado"
        texto="O link pode ter sido cancelado ou digitado errado. Peça um novo a quem administra a empresa."
      />
    );
  }
  if (convite.aceito) {
    return (
      <Aviso
        titulo="Este convite já foi usado"
        texto={`O acesso a ${convite.empresa} já está valendo.`}
        acao={{ href: "/", rotulo: "Ir para o sistema" }}
      />
    );
  }
  if (new Date(convite.expira_em).getTime() < Date.now()) {
    return (
      <Aviso
        titulo="Convite vencido"
        texto={`O prazo de sete dias terminou. Peça a quem administra ${convite.empresa} para reconvidar você.`}
      />
    );
  }

  const { data: sessao } = await sb.auth.getUser();
  if (!sessao?.user) {
    /*
     * Leva ao cadastro com o e-mail do convite já preenchido e o destino de
     * volta. Entrar com OUTRO e-mail não é bloqueado aqui — é
     * `aceitar_convite` que recusa, e a mensagem de lá é mais exata do que
     * um palpite desta tela.
     */
    const volta = `/convite/${encodeURIComponent(token)}`;
    return (
      <Aviso
        titulo={`Você foi convidado para ${convite.empresa}`}
        texto={`O convite é para ${convite.email}, como ${
          PAPEL[convite.papel] ?? convite.papel
        }. Entre ou crie sua conta com esse e-mail para aceitar.`}
        acao={{
          href: `/cadastro?email=${encodeURIComponent(convite.email)}&destino=${encodeURIComponent(volta)}`,
          rotulo: "Criar conta ou entrar",
        }}
      />
    );
  }

  // Já tem sessão: só falta confirmar.
  return (
    <AceitarConvite
      token={token}
      empresa={convite.empresa}
      email={convite.email}
      papel={PAPEL[convite.papel] ?? convite.papel}
      meuEmail={sessao.user.email ?? ""}
    />
  );
}
