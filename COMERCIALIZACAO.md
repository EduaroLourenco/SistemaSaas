# Plataforma como SaaS

Plano de 12/09/2026, feito a partir do código e do banco atuais.

## A decisão mais importante

**Não manter duas cópias do código.** Toda correção teria que ser feita
duas vezes, e as cópias se afastariam na primeira semana.

O projeto novo vira **o único**, e a operação atual entra nele como **a
empresa nº 1**. A pasta de hoje fica congelada como referência até a
migração dos dados terminar.

## O que já está pronto

- **Modelo de empresas:** organização → operações → membros com papel
  (proprietário, administrador, editor, leitor).
- **Separação no banco:** toda tabela de negócio tem `operacao_id` e RLS
  (`pode_ver_operacao`, `pode_editar_operacao`), inclusive o storage de
  arquivos.
- **Integração por conta com token no Vault** (migração 19).
- **Canais e contas são cadastro:** canal novo não exige deploy. A
  promoção multicanal da migração 18 segue a mesma regra.
- **Filtro por conta** (`src/lib/recorte.ts`) em todas as telas que
  filtram por canal.

## O que impede vender hoje

Em ordem de prioridade. Tamanho relativo: P = dias, M = 1–2 semanas,
G = mais que isso.

| Bloqueio | Hoje | O que fazer | Tam. |
|---|---|---|---|
| Conectar o Mercado Livre de cada empresa | `CONTAS` fixo em `lib/meli/cliente.ts`; token em variável de ambiente | OAuth por empresa → `integracoes` + Vault; contas vêm do banco; cron percorre as integrações | G |
| Criar conta e entrar | Sem cadastro; usuário criado à mão (GUIA-SUPABASE, passo 4) | Cadastro de empresa (organização + operação + proprietário), convite por e-mail, tela de Equipe | M |
| Operação da tela | `operacaoPadrao()` = "a com mais canais" | Seletor de operação real; operação ativa na sessão; toda leitura e gravação usa a ativa | M |
| Regras do cliente no código | `planilhas/kpis.ts` (Cotia/São Paulo/2ª conta), aba "Boa forma" em `planilhas/formula-base.ts`, prompt em `ia/ferramentas.ts` | Apelidos de canal e conta (migração 07), nomes de aba por empresa, prompt montado do banco | M |
| Banco novo limpo | 19 migrações incrementais; `04_seed.sql` com IDs fixos | Schema consolidado; seed só com glossário e canais-modelo | M |
| Cota da API do Meli | Freio de 4 chamadas/s por processo; ~2 min por conta | Fila por conta, horários escalonados, registro em `sincronizacoes` | M |
| Cobrança | Não existe | Planos por contas e usuários; cobrança recorrente | M |
| LGPD e contrato | Pedidos trazem dados de compradores | Termos, privacidade, contrato de operador, exclusão por empresa | P |
| Resto de demonstração | `src/mock` guarda tipos e helpers | Mover para `src/lib/tipos` e apagar a pasta | P |
| Saber quando quebra | Testes são scripts avulsos | Suíte automática a cada publicação; Sentry; alerta de sincronização que falhou | M |

## Passo a passo da cópia

1. **Commit desta versão na pasta atual.**
2. **Copiar sem** `node_modules`, `.next` e **`.env.local`** (ele tem as
   chaves do banco atual). Criar um repositório git novo.
3. **Projeto Supabase novo:** rodar `db/01` a `db/19` na ordem do
   `db/GUIA-SUPABASE.md`. Conferir se a extensão Vault está ativa.
4. **Não rodar o seed de demonstração como está:** criar a primeira
   organização pelo passo 4 do guia até existir o cadastro.
5. **`.env.local` novo:** Supabase novo, aplicação **nova** do Mercado Livre
   (nunca a do Meli+ nem a da plataforma atual), `CRON_SECRET` novo, chave
   da IA.
6. **Projeto novo na Vercel**, com as mesmas variáveis e domínio próprio.
7. **Migrar a operação atual como empresa nº 1:** exportar os dados da
   `operacao 101` e importar na organização nova.

## Fases

1. **Uma empresa, código multiempresa:** operação ativa na sessão, regras
   do cliente fora do código, schema consolidado, operação atual migrada.
2. **Entrada sozinha:** cadastro e convite, "Conectar Mercado Livre" por
   empresa, sincronização em fila.
3. **Pronto para vender:** planos e cobrança, termos e LGPD, monitoramento e
   testes automáticos.
4. **Mais canais por API:** Shopee, Amazon, Magalu e VTEX, na mesma estrutura
   de integrações e cofre.
