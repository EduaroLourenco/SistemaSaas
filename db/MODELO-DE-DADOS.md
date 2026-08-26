# Modelo de dados — documento de construção

Banco novo e isolado. **Nada aqui toca os projetos atuais**: o Supabase antigo (com `historico_promocoes` e `catalogo_ml`) continua intacto e em produção enquanto este sobe em paralelo.

---

## 1. Como executar

Ordem obrigatória — cada arquivo depende do anterior:

```bash
psql "$DATABASE_URL" -f db/01_schema.sql
```
```bash
psql "$DATABASE_URL" -f db/02_rls.sql
```
```bash
psql "$DATABASE_URL" -f db/03_views.sql
```
```bash
psql "$DATABASE_URL" -f db/04_seed.sql
```
```bash
psql "$DATABASE_URL" -f db/05_storage.sql
```

No Supabase, cole o conteúdo de cada arquivo no SQL Editor, na mesma ordem. Requer PostgreSQL 15 ou superior (as colunas geradas e `nulls not distinct` dependem disso).

| Arquivo | O que faz |
|---|---|
| `01_schema.sql` | 46 tabelas, 16 tipos enumerados, índices e gatilhos |
| `02_rls.sql` | Isolamento por operação, aplicado no banco |
| `03_views.sql` | 12 visões de leitura — a fonte única de cada indicador |
| `04_seed.sql` | Organização, operações, canais, categorias e 30 termos de glossário |
| `05_storage.sql` | 3 buckets de arquivo, políticas e faxina de exportações |

---

## 2. Convenções de nomenclatura

Foram escolhidas para casar com o que já existe (`historico_promocoes`, `catalogo_ml`) e não obrigar ninguém a trocar de idioma no meio do caminho.

| Regra | Exemplo |
|---|---|
| `snake_case`, sempre | `vendas_diarias`, `preco_oferta` |
| Português, sem abreviar | `fornecedores`, não `fornec` nem `suppliers` |
| Tabela no **plural**, coluna no **singular** | `campanhas` · `campanha_itens.preco_tabela` |
| Chave estrangeira = singular da tabela + `_id` | `canal_id`, `fornecedor_id` |
| Tabela de ligação = as duas no plural | `membros_operacoes`, `campanha_itens` |
| Booleano é adjetivo, sem `is_`/`flag_` | `ativo`, `padrao`, `tem_reducao_tarifa` |
| Data/hora termina em `_em`, data pura não | `criado_em` · `vencimento`, `competencia` |
| Visão de leitura começa com `vw_` | `vw_vendas_dia` |
| Enumerado no singular | `status_lancamento`, `tipo_canal` |

**Tipos fixos:**

| Natureza | Tipo | Por quê |
|---|---|---|
| Chave | `uuid` (`gen_random_uuid()`) | não vaza volume de negócio, não colide entre ambientes |
| Dinheiro | `numeric(14,2)` | `float` erra centavo — nunca use em valor |
| Percentual | `numeric(7,4)` | `16.5` = 16,5%. Guarde sempre a mesma escala |
| Data e hora | `timestamptz` | `timestamp` sem fuso é armadilha garantida |
| Texto | `text` | `varchar(n)` só cria migração desnecessária |
| E-mail | `citext` | comparação sem diferenciar maiúsculas |

---

## 3. As 46 tabelas

### Núcleo (7)
| Tabela | Papel |
|---|---|
| `organizacoes` | A empresa. Uma por instalação, no começo |
| `operacoes` | **O que o seletor do topo troca.** Isola dados: "Operação principal", "B2B", "Loja própria" |
| `usuarios` | Espelha `auth.users` do Supabase |
| `membros` | Quem participa de qual organização, com qual papel |
| `membros_operacoes` | Restringe um membro a operações específicas. Sem linha = vê todas |
| `preferencias_usuario` | Tema, densidade, operação padrão, notificações |
| `auditoria` | Quem mudou o quê, com `antes`/`depois` em JSON |

### Catálogo (4)
| Tabela | Papel |
|---|---|
| `canais` | Mercado Livre, Shopee, Amazon… com `cor_serie` apontando para `--s1..--s10` |
| `contas_canal` | Mais de um seller no mesmo canal — o caso real das duas contas do ML |
| `produtos` | O SKU de verdade, com custo, peso e dimensões |
| `anuncios` | O SKU **publicado num canal**. Um produto vira N anúncios |

### Vendas (5)
| Tabela | Papel |
|---|---|
| `vendas_diarias` | Consolidado por conta de canal por dia — é o que alimenta os painéis |
| `pedidos` | **O grão fino.** Pedido a pedido, com data e status |
| `pedido_itens` | Item a item, com o `preco_unitario` **pago**. Sustenta o "quando e a quanto" |
| `visitas_mensais` | Visitas em grão mensal, como o canal entrega |
| `metas` | Meta de receita por canal/mês, ou geral |

### Anúncios (5)
| Tabela | Papel |
|---|---|
| `importacoes` | Toda planilha que entra. Dá rastreabilidade de cada número |
| `importacao_linhas` | As linhas cruas da planilha, em `jsonb`, antes de casar com o cadastro |
| `anuncio_desempenho_semanal` | Visitas, vendas, receita e preço por anúncio por semana ISO |
| `precos_ideais` | Série do preço ideal, com a data-base do cálculo |
| `anuncio_precos_vitrine` | Retrato semanal do preço publicado — é o que o botão grava |

### Promoções (6)
| Tabela | Papel |
|---|---|
| `formula_base_itens` | Aba "Base MLB": tipo do anúncio e comissão padrão, versionados |
| `formula_base_precos` | A matriz chave × comissão → preço de tabela. O motor **consulta**, não recalcula |
| `campanhas` | Nome, vigência e se tem redução de tarifa |
| `campanha_itens` | Item a item, com a decisão Participar / Não participar |
| `processamentos_promocao` | Cada rodada de processamento de planilha |
| `historico_promocoes` | Registro linha a linha. **Mantém o nome da tabela antiga**, para migrar direto |

### Monitoramento (6)
| Tabela | Papel |
|---|---|
| `monitoramentos_preco` | O que o busca-preço deve varrer, e com que frequência |
| `concorrentes` | Vendedores rastreados por monitoramento |
| `precos_coletados` | Série temporal dos preços |
| `monitoramentos_frete` | Faixa de CEP e modalidade a acompanhar |
| `fretes_coletados` | Série temporal dos fretes |
| `alertas` | O que alimenta o painel "Precisa de atenção" |

### Financeiro (7)
| Tabela | Papel |
|---|---|
| `categorias_financeiras` | Plano de contas simples, entrada/saída com grupo |
| `fornecedores` | Terceiros e fornecedores de mercadoria |
| `lancamentos_financeiros` | **Livro-caixa.** Contas a pagar é um filtro daqui, não outra tabela |
| `funcionarios` | Cadastro de pessoal |
| `folha_pagamento` | Uma linha por funcionário por competência |
| `lotes_compra` | Pagamento de lotes e produtos |
| `lote_itens` | Itens do lote |

### Sistema (5)
`integracoes`, `sincronizacoes`, `exportacoes`, `agendamentos`, `glossario`.

---

## 4. Três decisões que valem explicação

**Anúncio ≠ produto.** O mesmo colchão vira um anúncio no Mercado Livre e outro na Amazon, com preços e comissões diferentes. Separar `produtos` de `anuncios` é o que torna possível a pergunta "quanto esse produto faturou somando todos os canais?" — e é o que o modelo antigo, ancorado no MLB, não conseguia responder.

**Contas a pagar não é tabela.** É `lancamentos_financeiros` filtrado por `tipo = 'saida'` e status em aberto. Uma tabela separada exigiria sincronizar dois lugares toda vez que uma conta fosse paga — e um dia eles divergiriam.

**Indicador é calculado no banco.** `receita_liquida`, `ticket_medio`, `conversao`, `desconto_percentual` e `custo_total` são colunas geradas ou visões. Se a tela calculasse, o painel, o relatório e a exportação acabariam discordando entre si — que é exatamente o problema que este sistema existe para resolver.

---

## 5. De onde cada tela lê

| Tela | Fonte |
|---|---|
| Visão geral | `vw_vendas_dia`, `vw_vendas_mes_canal`, `alertas`, `vw_anuncio_acumulado` |
| Vendas · Por canal | `vw_vendas_mes_canal` |
| Vendas · Anual | `vw_vendas_mes_canal` + `metas` |
| Vendas · Semanal | `vw_vendas_semana` |
| Vendas · Diário | `vw_vendas_dia` |
| Vendas · Comparativos | `vw_vendas_dia` agrupado por `dia_semana` × `mes` |
| Vendas · Metas | `metas` + `vw_vendas_mes_canal` |
| Vendas · Lançamentos | `vendas_diarias` (leitura **e escrita**) |
| Anúncios · Análise | `vw_anuncio_acumulado` + `anuncio_desempenho_semanal` |
| Anúncios · Catálogo | `anuncios` + `produtos` |
| Anúncios · Preço ideal | `precos_ideais` + `importacoes` |
| Promoções · Campanhas | `vw_campanhas_resumo` + `campanha_itens` |
| Promoções · Processar | `processamentos_promocao` + `importacoes` |
| Promoções · Histórico | `historico_promocoes` |
| Monitoramento · Preços | `vw_monitoramento_precos` + `precos_coletados` |
| Monitoramento · Fretes | `monitoramentos_frete` + `fretes_coletados` |
| Financeiro · Painel | `vw_fluxo_mensal` + `vw_contas_a_pagar` |
| Financeiro · Custos | `lancamentos_financeiros` por categoria |
| Financeiro · Folha | `vw_custo_folha` |
| Financeiro · Fornecedores | `fornecedores` + `lancamentos_financeiros` |
| Financeiro · Contas a pagar | `vw_contas_a_pagar` |
| Integrações | `integracoes` + `sincronizacoes` |
| Glossário | `glossario` |
| Configurações | `operacoes`, `membros`, `preferencias_usuario` |

---

## 6. Segurança

**O isolamento está no banco, não na aplicação.** `02_rls.sql` liga RLS em todas as 31 tabelas com `operacao_id`. Mesmo que a chave anônima do Supabase vaze, ninguém lê dados de uma operação de que não é membro.

Três funções sustentam isso: `operacoes_do_usuario()`, `pode_ver_operacao(uuid)` e `pode_editar_operacao(uuid)`. Papel `leitor` só lê; `editor` em diante escreve.

**Duas regras que não podem ser quebradas:**

1. **Token de integração nunca em texto puro.** A coluna `integracoes.credencial_ref` guarda só a *referência* ao cofre (Supabase Vault, AWS Secrets Manager). O token em si não entra nesta tabela.
2. **`service_role` nunca chega ao navegador.** As rotinas de coleta e sincronização ignoram RLS por definição — elas rodam em rota de API ou worker, jamais em componente de cliente.

---

## 7. Migrar o que já existe

As duas tabelas atuais entram quase direto:

```sql
-- catalogo_ml → produtos + anuncios
insert into produtos (operacao_id, sku, titulo)
select distinct :op, c.sku, coalesce(c.sku, c.mlb)
from legado.catalogo_ml c
where c.sku is not null
on conflict (operacao_id, sku) do nothing;
```

```sql
insert into anuncios (operacao_id, canal_id, conta_canal_id, produto_id,
                      codigo_externo, titulo, sku_canal, tipo, status,
                      preco_atual, comissao_atual)
select :op, :canal_ml, :conta_ml, p.id,
       c.mlb, coalesce(c.sku, c.mlb), c.sku,
       case lower(coalesce(c.tipo_anuncio,'')) when 'premium' then 'premium'::tipo_anuncio
                                               else 'classico'::tipo_anuncio end,
       case lower(coalesce(c.status,'ativo'))  when 'pausado' then 'pausado'::status_anuncio
                                               else 'ativo'::status_anuncio end,
       c.preco_atual, c.comissao_atual
from legado.catalogo_ml c
left join produtos p on p.sku = c.sku and p.operacao_id = :op
on conflict (canal_id, codigo_externo) do nothing;
```

`historico_promocoes` mantém os mesmos nomes de coluna — só ganha `operacao_id`, `anuncio_id` e `motivo`. A cópia é um `insert … select` direto, resolvendo `anuncio_id` por `codigo_externo = mlb`.

O `preco_ideal_db.json` (que hoje é arquivo em disco) vira linhas em `importacoes` + `precos_ideais`.

---

## 8. Crescimento

A única tabela que cresce rápido é `precos_coletados`: 200 monitoramentos × 5 concorrentes × 4 coletas por dia ≈ **1,5 milhão de linhas por ano**. Quando passar de uns 10 milhões, particione por mês:

```sql
create table precos_coletados (…) partition by range (coletado_em);
create table precos_coletados_2027_01 partition of precos_coletados
  for values from ('2027-01-01') to ('2027-02-01');
```

`vw_anuncio_acumulado` usa funções de janela sobre a carteira inteira. Acima de ~50 mil anúncios, troque por *materialized view* com `refresh concurrently` após cada importação — a instrução está comentada no fim de `03_views.sql`.

`vendas_diarias` não preocupa: 10 canais × 365 dias são 3.650 linhas por ano.
