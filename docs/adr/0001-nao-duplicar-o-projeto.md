# 0001 — Não duplicar o projeto; isolar por ambiente

- **Data:** 2026-09-16
- **Situação:** proposta, aguardando decisão do Eduardo
- **Contexto:** raiz

## O problema

O Eduardo pediu, mais de uma vez, para duplicar o projeto antes de começar
a mexer no SaaS: *"assim, não mexo nesse que tá funcionando"*.

O medo é legítimo e concreto. A plataforma está no ar, a operação depende
dela todo dia, e uma mudança errada quebra o trabalho de quem está usando.

Este ADR existe porque a solução pedida não resolve esse medo — resolve
outro problema, e cria um terceiro.

## O que uma duplicata de repositório realmente dá

Duplicar significa dois repositórios com o mesmo código, evoluindo em
separado.

**O que ela resolve:** mexer no código B sem tocar no A.

**O que ela não resolve, e é o que importa:** os dois apontam para o
**mesmo banco**. O risco real não está no código — está na migração que
altera uma tabela, na RLS que muda de regra, no `operacao_id` que passa a
ser exigido. Uma migração rodada pelo projeto B quebra o projeto A na
mesma hora, com repositórios separados ou não.

**O que ela cria:** duas cópias do mesmo código divergindo. Toda correção
de bug precisa ser feita duas vezes; em algumas semanas elas já não são
mais o mesmo sistema, e juntá-las de volta vira um projeto por si só. Este
é um custo que cresce sozinho, todo dia, sem ninguém decidir pagá-lo.

## O detalhe que muda tudo

**A plataforma já é multi-empresa.** Isso não estava claro na conversa e
muda o tamanho do trabalho:

- `organizacoes` → `operacoes` → `membros` com papéis já existem
- toda tabela de dado carrega `operacao_id`
- RLS forçado em todas elas
- `integracoes` por operação e por conta de canal
- cofre de segredos (Supabase Vault) com função `SECURITY DEFINER`

O banco foi desenhado multi-tenant desde o início. Não há um "sistema da
Probel" para transformar num "sistema SaaS" — há um sistema SaaS com **uma
organização cadastrada**, que é a Probel.

Isso remove a premissa da duplicação: não existem dois produtos a separar.

## A decisão

**Não duplicar o repositório.** Isolar por ambiente:

1. **Um repositório, duas branches.** `main` é o que está no ar; o trabalho
   do SaaS vive em `saas` até estar pronto.
2. **Dois bancos.** Um projeto Supabase novo para desenvolvimento, com uma
   cópia do schema e dados de mentira. É aqui que o isolamento de verdade
   acontece, e é o que a duplicata de repo não daria.
3. **Dois deploys.** A branch `saas` publica numa URL de prévia. A
   operação continua usando a de produção, sem saber que a outra existe.
4. **Migração só entra em produção por decisão explícita** — a mesma regra
   que já vale hoje.

## O que se perde

A duplicata tem uma vantagem real que este caminho não tem: **liberdade
total para quebrar**. Numa cópia separada dá para reescrever o schema
inteiro sem pensar em compatibilidade.

Se o SaaS exigir um schema incompatível com o atual — e hoje não parece
exigir —, esta decisão precisa ser revista. O gatilho para revisar é
concreto: **a primeira migração que não conseguir ser escrita de forma
compatível com os dados da Probel.**

## O que se ganha

- Uma correção de bug, um lugar.
- O SaaS nasce testado contra dados reais de uma operação de verdade, que é
  a melhor coisa que um produto multiempresa pode ter no começo.
- Não existe o dia de "juntar as duas versões".

## Alternativas consideradas

**Duplicar repo e banco.** O isolamento máximo, e o custo máximo: duas
bases de código e duas bases de dados divergindo, sem data para reunir.
Faria sentido se o SaaS fosse um produto diferente — não é, é o mesmo
produto com mais de um cliente.

**Não isolar nada, mexer direto em produção.** É o que vinha sendo feito, e
funcionou até agora porque as mudanças eram pequenas. Fluxo de entrada de
cliente e cobrança não são mudanças pequenas.
