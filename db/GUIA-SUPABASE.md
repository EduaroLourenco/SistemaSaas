# Guia de instalação no Supabase

Tudo que o sistema precisa: 46 tabelas, isolamento por operação, 12 visões de leitura, 3 buckets de arquivo e o seed inicial. **Banco novo — nada aqui toca o Supabase atual** (o que tem `historico_promocoes` e `catalogo_ml` continua rodando).

Tempo estimado: 20 minutos.

---

## Passo 1 — Criar o projeto

1. Entre em [supabase.com/dashboard](https://supabase.com/dashboard) e clique em **New project**.
2. Preencha:
   - **Name**: `plataforma`
   - **Database Password**: gere uma forte e **guarde num gerenciador de senhas** — o Supabase não mostra de novo.
   - **Region**: `South America (São Paulo)` — é o que dá menor latência daqui.
3. Aguarde uns 2 minutos até o projeto ficar verde.

---

## Passo 2 — Rodar os scripts, nesta ordem

No menu lateral, **SQL Editor** → **New query**. Cole o conteúdo de cada arquivo, um por vez, e clique em **Run**. A ordem importa: cada script depende do anterior.

| Ordem | Arquivo | O que cria | Como saber que deu certo |
|---|---|---|---|
| 1 | `01_schema.sql` | 46 tabelas, 16 tipos, índices, gatilhos | `Success. No rows returned` |
| 2 | `02_rls.sql` | Isolamento por operação | idem |
| 3 | `03_views.sql` | 12 visões de leitura | idem |
| 4 | `04_seed.sql` | Organização, operações, canais, categorias, glossário | idem |
| 5 | `05_storage.sql` | 3 buckets e políticas de arquivo | idem |

**Conferência rápida.** Rode isto depois do passo 5:

```sql
select
  (select count(*) from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE') as tabelas,
  (select count(*) from information_schema.views
     where table_schema = 'public') as visoes,
  (select count(*) from storage.buckets) as buckets,
  (select count(*) from canais) as canais,
  (select count(*) from glossario) as termos;
```

Deve devolver **46 tabelas, 12 visões, 3 buckets, 9 canais, 30 termos**. Qualquer número menor significa que um script parou no meio — role a saída do SQL Editor procurando a linha em vermelho.

---

## Passo 3 — Pegar as chaves

**Project Settings → API**. Copie três coisas:

| Chave | Onde vai | Pode aparecer no navegador? |
|---|---|---|
| `Project URL` | `NEXT_PUBLIC_SUPABASE_URL` | Sim |
| `anon public` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sim — o RLS protege |
| `service_role` | `SUPABASE_SERVICE_ROLE_KEY` | **Nunca** |

A `service_role` **ignora todo o RLS por definição**. Ela só pode existir em rota de API, worker ou Edge Function. Se ela vazar para o cliente, qualquer visitante lê a folha de pagamento inteira. Nunca prefixe essa variável com `NEXT_PUBLIC_`.

Crie `.env.local` na raiz do projeto:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
```

Confirme que `.env*` está no `.gitignore` — já está neste projeto.

---

## Passo 4 — Criar seu usuário e virar proprietário

1. **Authentication → Users → Add user → Create new user**. Use seu e-mail e marque *Auto Confirm User*.
2. Copie o **UID** que aparece na lista.
3. No SQL Editor, troque o UID e rode:

```sql
insert into usuarios (id, nome, email)
values ('COLE-O-UID-AQUI', 'Eduardo Lourenço', 'dudu43.elo@gmail.com')
on conflict (id) do nothing;

insert into membros (organizacao_id, usuario_id, papel)
values (
  '00000000-0000-0000-0000-000000000001',
  'COLE-O-UID-AQUI',
  'proprietario'
)
on conflict (organizacao_id, usuario_id) do update set papel = 'proprietario';
```

**Teste se o RLS está mesmo funcionando** — este é o passo que as pessoas pulam e se arrependem depois. Abra uma aba anônima, chame a API com a chave `anon` sem estar logado:

```bash
curl "https://xxxxxxxx.supabase.co/rest/v1/vendas_diarias?select=*" -H "apikey: SUA_ANON_KEY"
```

Tem que voltar `[]`, lista vazia. Se voltar dados, o RLS não subiu — rode `02_rls.sql` de novo e confira a saída.

---

## Passo 5 — Ligar o front

O projeto hoje lê de `src/mock/`. A troca é **uma linha por tela**, porque cada mock já tem o mesmo formato que a consulta devolve.

Instale o cliente:

```bash
npm install @supabase/supabase-js
```

Crie `src/lib/supabase.ts`:

```ts
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

E no servidor, `src/lib/supabase-admin.ts` — só importe isto de rota de API:

```ts
import { createClient } from "@supabase/supabase-js";

// Ignora RLS. Nunca importe deste arquivo em componente de cliente.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);
```

Exemplo da troca, na tela Vendas por canal:

```ts
// antes
import { CANAIS } from "@/mock";

// depois
const { data: CANAIS } = await supabase
  .from("vw_vendas_mes_canal")
  .select("*")
  .eq("competencia", "2026-08-01");
```

---

## Passo 6 — Fluxo das planilhas

Esta é a parte que você pediu para ficar inteira no Supabase. São dois caminhos, e os dois guardam **o arquivo** no Storage e **os dados** nas tabelas.

### Importar (análise de anúncios e promoções)

```
navegador                rota de API (service_role)          Supabase
   │                              │                              │
   ├─ envia .xlsx ───────────────►│                              │
   │                              ├─ sobe o arquivo ────────────►│ Storage: importacoes/{operacao}/{ano}/{id}.xlsx
   │                              ├─ cria o registro ───────────►│ tabela: importacoes
   │                              ├─ lê com exceljs              │
   │                              ├─ grava linha a linha ───────►│ tabela: importacao_linhas  (cru, com jsonb)
   │                              ├─ casa MLB com anuncios       │
   │                              └─ grava o resultado ─────────►│ anuncio_desempenho_semanal / precos_ideais
   │                                                             │
   ◄─ resumo: 28 lidas, 26 casadas, 2 sem cadastro ──────────────┘
```

Por que a `importacao_linhas` existe: se um MLB ainda não está em `anuncios`, sem ela a linha simplesmente sumiria e ninguém descobriria por quê. Com ela, o item fica gravado com `erro` preenchido, aparece na conferência, e a importação inteira pode ser reprocessada sem pedir o arquivo de novo.

**Antes de gravar, evite o arquivo repetido.** Calcule o sha256 do buffer e verifique:

```ts
const hash = createHash("sha256").update(buffer).digest("hex");

const { data: jaExiste } = await supabaseAdmin
  .from("importacoes")
  .select("id, nome_arquivo, criado_em")
  .eq("operacao_id", operacaoId)
  .eq("hash_arquivo", hash)
  .maybeSingle();

if (jaExiste) return { erro: "Esta planilha já foi importada em " + jaExiste.criado_em };
```

Sem isso, subir a mesma planilha duas vezes dobra o faturamento do período — e o erro só aparece semanas depois, quando alguém estranha o número.

### Processar promoções

A Fórmula base vira **tabela**, no mesmo formato da planilha que o motor já lê hoje. São duas partes, não um cadastro de custo:

| Tabela | Vem da aba | O que guarda |
|---|---|---|
| `formula_base_itens` | Base MLB | por anúncio: tipo (Clássico/Premium) e comissão padrão |
| `formula_base_precos` | Base com preços · Boa forma | matriz chave × comissão → **preço de tabela já calculado** |

O motor não recalcula preço a partir de custo e margem — ele **consulta**: descobre a comissão a considerar e procura o preço daquela comissão, tentando primeiro por SKU e caindo para MLB. Reconstruir esse cálculo daria número diferente do que a operação usa hoje.

Ambas versionadas por `vigente_de`, porque um preço decidido em julho precisa continuar explicável com a base de julho.

```sql
-- preço de tabela vigente na data da campanha, tentando SKU e caindo para MLB
select distinct on (chave_tipo, chave, comissao) *
from formula_base_precos
where operacao_id = $1 and vigente_de <= $2
order by chave_tipo, chave, comissao, vigente_de desc;
```

O resultado do processamento vai para `campanha_itens` (a decisão viva) e `historico_promocoes` (o registro imutável do que foi decidido e por quê). A planilha gerada sobe para o bucket `exportacoes` e o registro entra em `exportacoes`.

### Exportar

Gere o arquivo na rota de API, suba no bucket `exportacoes` e devolva uma **URL assinada** com validade curta:

```ts
const { data } = await supabaseAdmin.storage
  .from("exportacoes")
  .createSignedUrl(caminho, 300); // 5 minutos
```

Nunca torne o bucket público. São dados de custo, margem e folha de pagamento.

---

## O que cada funcionalidade usa

| Tela | Tabelas e visões |
|---|---|
| Visão geral | `vw_vendas_dia`, `vw_vendas_mes_canal`, `alertas`, `vw_anuncio_acumulado` |
| Vendas · Por canal | `vw_vendas_mes_canal` |
| Vendas · Anual | `vw_vendas_mes_canal` + `metas` |
| Vendas · Semanal | `vw_vendas_semana` |
| Vendas · Diário | `vw_vendas_dia` |
| Vendas · Comparativos | `vw_vendas_dia` agrupado por `dia_semana` × `mes` |
| Vendas · Metas | `metas` + `vw_vendas_mes_canal` |
| Vendas · Lançamentos | `vendas_diarias` — **única tela que escreve direto** |
| Anúncios · Análise | `vw_anuncio_acumulado`, `anuncio_desempenho_semanal`, `precos_ideais` |
| Anúncios · Catálogo | `anuncios` + `produtos` |
| Anúncios · Preço ideal | `precos_ideais` + `importacoes` |
| Promoções · Campanhas | `vw_campanhas_resumo` + `campanha_itens` |
| Promoções · Processar | `importacoes`, `importacao_linhas`, `formula_base_itens`, `formula_base_precos`, `processamentos_promocao` |
| Promoções · Histórico | `historico_promocoes` |
| Monitoramento · Preços | `vw_monitoramento_precos`, `precos_coletados`, `concorrentes` |
| Monitoramento · Fretes | `monitoramentos_frete` + `fretes_coletados` |
| Financeiro · Painel | `vw_fluxo_mensal` + `vw_contas_a_pagar` |
| Financeiro · Custos | `lancamentos_financeiros` por categoria |
| Financeiro · Folha | `vw_custo_folha` |
| Financeiro · Fornecedores | `fornecedores` + `lancamentos_financeiros` |
| Financeiro · Contas a pagar | `vw_contas_a_pagar` |
| Relatórios · Apresentação | as mesmas visões da Visão geral |
| Relatórios · Exportações | `exportacoes` + bucket `exportacoes` |
| Integrações | `integracoes` + `sincronizacoes` |
| Glossário | `glossario` |
| Configurações | `operacoes`, `membros`, `usuarios`, `preferencias_usuario` |

---

## Passo 7 — Coletores automáticos (fase 4)

Busca-preço e busca-frete precisam rodar sozinhos, de hora em hora. Duas opções:

**pg_cron dentro do Supabase** — mais simples, sem servidor extra. Em **Database → Extensions**, ative `pg_cron` e `pg_net`. Depois:

```sql
select cron.schedule(
  'coleta-precos',
  '0 */6 * * *',                    -- a cada 6 horas
  $$
  select net.http_post(
    url     := 'https://seu-app.vercel.app/api/coleta/precos',
    headers := '{"Authorization": "Bearer SEU_TOKEN_INTERNO"}'::jsonb
  );
  $$
);
```

**Vercel Cron** — se o app estiver na Vercel, é um `vercel.json` e pronto. Escolha um dos dois, não os dois: rodando em paralelo, a coleta duplica.

Os agendamentos que o usuário liga e desliga na tela de Exportações ficam em `agendamentos` — o cron lê essa tabela em vez de ter a lista fixa no código.

---

## Migrar o que já existe

`catalogo_ml` e `historico_promocoes` do projeto antigo entram quase direto — os nomes de coluna de `historico_promocoes` foram mantidos justamente para isso. Os scripts estão na seção 7 de `MODELO-DE-DADOS.md`.

O `preco_ideal_db.json` e o `analise_db.json`, que hoje são arquivo em disco, viram linhas em `importacoes` + `precos_ideais` / `anuncio_desempenho_semanal`.

---

## Cuidados que evitam dor de cabeça depois

**Faça backup antes de qualquer migração.** No painel, **Database → Backups**. O plano gratuito guarda 7 dias; a partir do Pro, 30 dias com recuperação para um ponto no tempo.

**Ative a proteção de senha vazada.** Authentication → Providers → Password → *Leaked password protection*.

**Nunca desligue RLS "só para testar".** Se uma consulta volta vazia, o problema é a política ou o login — não o RLS. Desligar e esquecer de religar é o jeito mais comum de expor um banco inteiro.

**A tabela que cresce rápido é `precos_coletados`.** Cerca de 1,5 milhão de linhas por ano com 200 monitoramentos. Passando de 10 milhões, particione por mês — o exemplo está no fim de `MODELO-DE-DADOS.md`. `vendas_diarias`, por comparação, faz 3.650 linhas por ano.
