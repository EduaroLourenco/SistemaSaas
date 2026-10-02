/**
 * Os papéis de um membro, e o que cada um pode.
 *
 * Fica fora de `equipe.ts` porque a tela precisa desta lista e `equipe.ts`
 * é `server-only` — importar de lá arrastaria `next/headers` para o
 * navegador. Aqui não há nada de servidor: é vocabulário.
 *
 * As descrições espelham as travas de `db/22_equipe.sql`. Quem mudar uma
 * tem que mudar a outra: a tela que promete o que o banco recusa produz
 * erro depois do clique.
 */

export type Papel = "proprietario" | "administrador" | "editor" | "leitor";

export const PAPEIS: { valor: Papel; rotulo: string; descricao: string }[] = [
  {
    valor: "proprietario",
    rotulo: "Proprietário",
    descricao: "Tudo, inclusive promover e remover outro proprietário.",
  },
  {
    valor: "administrador",
    rotulo: "Administrador",
    descricao: "Convida, remove e configura. Não promove a proprietário.",
  },
  { valor: "editor", rotulo: "Editor", descricao: "Lança, importa e edita dados." },
  { valor: "leitor", rotulo: "Leitor", descricao: "Só vê. Não grava nada." },
];

/** A ordem em que a equipe é listada: quem manda primeiro. */
export const ORDEM_PAPEL: Papel[] = ["proprietario", "administrador", "editor", "leitor"];

export const rotuloPapel = (p: Papel) => PAPEIS.find((x) => x.valor === p)?.rotulo ?? p;
