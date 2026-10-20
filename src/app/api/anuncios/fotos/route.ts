import { NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "@/lib/dados/paginar";
import { temColunaFoto } from "@/lib/dados/coluna-foto";

export const runtime = "nodejs";

/**
 * O mapa MLB → capa, para a operação de quem está logado.
 *
 * ── Por que um mapa e não uma coluna em cada consulta ──
 *
 * Dezoito telas listam anúncio, cada uma com a própria função de carga,
 * o próprio tipo de linha e a própria montagem. Levar a foto por dentro
 * de todas significaria o mesmo campo repetido em dezoito lugares — e a
 * foto não entra em conta nenhuma: ela é só reconhecimento visual.
 *
 * Aqui ela viaja uma vez, à parte, e cada tela só acrescenta a etiqueta
 * <FotoAnuncio mlb={...} />. São ~1.700 anúncios por operação, uma URL
 * curta cada: o corpo fica na casa de 150 KB, e o navegador busca uma
 * vez por aba.
 *
 * ── Por que não quebra antes da migração ──
 *
 * As migrações daqui são coladas à mão no editor SQL do Supabase, então
 * o código chega antes do banco. Sem a coluna, isto devolve um mapa
 * vazio e as telas desenham o quadrado cinza — em vez de o PostgREST
 * recusar a consulta e derrubar a lista inteira.
 */
export async function GET() {
  const sb = await clienteServidor();
  const { data: sessao } = await sb.auth.getUser();
  if (!sessao?.user) {
    return NextResponse.json({ fotos: {} }, { status: 401 });
  }

  if (!(await temColunaFoto(sb))) {
    return NextResponse.json({ fotos: {}, pendente: "db/41_foto_do_anuncio.sql" });
  }

  /* O RLS já recorta pela operação ativa; a ordem por id é o desempate
     que a paginação do PostgREST exige para não repetir nem pular linha. */
  const linhas = (await paginar(() =>
    sb.from("anuncios").select("codigo_externo,foto").not("foto", "is", null),
  )) as unknown as { codigo_externo: string; foto: string | null }[];

  const fotos: Record<string, string> = {};
  for (const l of linhas) {
    if (l.foto) fotos[String(l.codigo_externo).toUpperCase()] = l.foto;
  }

  return NextResponse.json(
    { fotos },
    {
      /* A capa muda quando o vendedor troca a foto do anúncio: uma hora
         de cache privado é mais do que suficiente e evita refazer a
         consulta a cada navegação dentro do app. */
      headers: { "cache-control": "private, max-age=3600" },
    },
  );
}
