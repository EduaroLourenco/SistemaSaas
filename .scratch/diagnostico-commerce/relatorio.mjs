import{readFileSync,writeFileSync,mkdirSync}from'node:fs';
const root='.scratch/diagnostico-commerce',R=t=>JSON.parse(readFileSync(`${root}/${t}.json`)),s=R('resumo'),d=R('aprofundamento');
const out='output/pdf';mkdirSync(out,{recursive:true});
const money=x=>x==null?'n/d':Number(x).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const num=x=>Number(x).toLocaleString('pt-BR',{maximumFractionDigits:2});
const pct=x=>num(x)+'%',delta=(a,b)=>a?((b/a-1)*100):null;
const pages=[],page=(title,kicker)=>{const p={title,kicker,blocks:[]};pages.push(p);return p.blocks};
const para=(b,text)=>b.push({type:'p',text});const h=(b,text)=>b.push({type:'h',text});const table=(b,headers,rows,widths)=>b.push({type:'table',headers,rows,widths});const call=(b,text)=>b.push({type:'callout',text});
const main=s.accounts.find(x=>x.name.includes('São Paulo')),second=s.accounts.find(x=>x.name.includes('2ª conta')),vtex=s.accounts.find(x=>x.name.includes('VTEX'));
const short=x=>x.replace('Mercado Livre | ','ML - ').replace(' | Conta principal','').replace('São Paulo — pronta entrega','Pronta entrega').replace('2ª conta — venda a prazo','Venda a prazo');
const sp=s.productAccounts.filter(x=>x.account===main.name),prod=sku=>sp.find(x=>x.sku===sku);
let b=page('Diagnóstico comercial e plano de recuperação','22 SET 2026 | OPERAÇÃO PRINCIPAL');
para(b,'Análise das duas contas do Mercado Livre e dos demais canais cadastrados. Base consultada em 22/09/2026; comparações recentes encerradas em 20/09 para evitar o dia 21 parcialmente sincronizado. Valores em reais.');
call(b,'A prioridade é recuperar a disponibilidade dos produtos que sustentavam a conta de pronta entrega e reconstruir o tráfego com controle de margem. Os dados não sustentam baixar todos os preços nem ampliar toda a mídia de uma vez.');
table(b,['Indicador','Antes','Depois','Leitura'],[
['ML pronta entrega: produtos, jul. / ago.',money(main.periods.jul.itemNet),money(main.periods.ago.itemNet),pct(delta(main.periods.jul.itemNet,main.periods.ago.itemNet))],
['ML pronta entrega: produtos, dias 1-20 ago. / set.',money(main.periods.ago20.itemNet),money(main.periods.set20.itemNet),pct(delta(main.periods.ago20.itemNet,main.periods.set20.itemNet))],
['ML venda a prazo: produtos, dias 1-20 ago. / set.',money(second.periods.ago20.itemNet),money(second.periods.set20.itemNet),'6 para 9 pedidos não cancelados'],
['Loja própria: produtos, dias 1-20 ago. / set.',money(vtex.periods.ago20.itemNet),money(vtex.periods.set20.itemNet),pct(delta(vtex.periods.ago20.itemNet,vtex.periods.set20.itemNet))],
],[.40,.20,.20,.20]);
h(b,'O que os dados mostram');
para(b,'1. A perda da pronta entrega é real e concentrada: Excede Casal PA85351 e Excede Queen PA85352 eram 33,21% da receita de produtos em julho. Todos os anúncios desses dois SKUs constam pausados em 21/09.');
para(b,'2. Há duas fases: de julho para agosto pioram tráfego, conversão e ticket. De agosto para setembro, o tráfego cai muito, mas a conversão agregada melhora. A recuperação de 14-20/09 ainda vem com ticket menor.');
para(b,'3. O negócio total não acompanha a mesma queda: a soma dos produtos registrados cresce 10,76% nos dias 1-20, puxada pela VTEX. Isso é venda registrada; ainda exige validação da classificação dos canais e da entrega.');
para(b,'4. Margem e caixa permanecem sem resposta: nenhum dos 142 produtos tem custo, imposto ou embalagem preenchidos. Estoque atual, motivo de pausa, reputação, prazo real e mídia detalhada de setembro também faltam.');
h(b,'Decisão recomendada agora');
para(b,'Manter as duas contas, priorizar a recuperação de 8-10 SKUs na pronta entrega, trabalhar a segunda conta com um sortimento pequeno e proteger a expedição da VTEX. Investimento adicional só após validar estoque, preço recebido e contribuição por pedido.');

b=page('Escopo, fontes e confiança','01 | COMO LER OS NÚMEROS');
table(b,['Fonte','Volume / cobertura','Uso e limite'],[
['Pedidos e itens','7.578 pedidos; 8.502 itens; jan.-set.','Pedido não cancelado não equivale a entrega ou lucro.'],
['Catálogo ML','1.266 anúncios; captura em 21/09','468 pronta entrega e 798 venda a prazo. Status atual da captura, sem histórico de mudanças.'],
['Visitas','8.618 linhas diárias; até 21/09','Apenas 54 visitas na pronta entrega no dia 21: dia parcial excluído das comparações.'],
['Desempenho semanal','2.766 linhas; até 09/09','Não somado às visitas diárias. Semana de 07-09/09 é parcial.'],
['Quantidade disponível','457 anúncios; 26/08','Só pronta entrega. 129 tinham zero; isso não prova estoque atual.'],
['Product Ads','1.269 linhas; junho-agosto','Sem detalhamento de setembro ou segunda conta. Não somar à mídia diária.'],
['Preços e promoções','49.755 preços; 6.972 decisões','Fórmula com vigências; decisões locais não confirmam oferta publicada.'],
['Financeiro e monitoramento','Sem custos completos, caixa ou concorrentes','Não permite lucro, capital de giro, preço relativo ou SLA logístico.'],
],[.24,.32,.44]);
h(b,'Regras usadas');
para(b,'Receita de produtos = soma de pedido_itens.total ligada a pedidos não cancelados. É a base preferida para comparar meses porque o cabeçalho do pedido tem composição diferente conforme a origem. Total do pedido aparece somente quando identificado. Não foi usado dado de demonstração de src/mock.');
para(b,'Recorte principal: dias 1-20 de agosto versus 1-20 de setembro, mesma duração, mas composição de dias da semana diferente. Controle adicional: 24/08-06/09 versus 07-20/09, ambos com 14 dias e os mesmos dias da semana. Os períodos recentes ainda podem receber cancelamentos.');
para(b,'A exclusão já configurada da VTEX em 27/08 foi respeitada na visão ajustada. Ela remove 131 pedidos, sendo 117 cancelados: R$ 491.186,05 de total bruto e R$ 19.614,90 não cancelados. Não removi outros eventos por hipótese. A exclusão de um dia inteiro também retira vendas válidas.');
para(b,'Consultas paginadas e limitadas à Operação principal. As 32 tabelas selecionadas foram lidas até a contagem informada pelo banco; não há duplicatas pela chave conta + código do pedido. A extração entre tabelas não é uma transação única.');
call(b,'Confiança alta: somas registradas, preços pagos, status da captura. Confiança média: comparações de tráfego e associação com preço. Não confirmado: causa das pausas, ruptura atual, queda por concorrência, punição reputacional e rentabilidade.');

b=page('Duas contas, histórias diferentes','02 | EVOLUÇÃO DE JANEIRO A SETEMBRO');
para(b,'A tabela abaixo usa o total dos pedidos não cancelados, pois mostra todo o histórico. A mudança de origem e de composição de frete impede tratar pequenas diferenças como comportamento comercial. As quedas grandes requerem auditoria, mas não desaparecem ao usar os itens nos meses recentes.');
table(b,['Mês','Pronta entrega','Venda a prazo','Loja própria (VTEX)'],Array.from({length:9},(_,i)=>{const mo=`2026-${String(i+1).padStart(2,'0')}`;return [i===8?'Set. 1-20 (parcial)':mo,...[main,second,vtex].map(a=>i===8?money(a.periods.set20.net):money(s.monthly.find(r=>r.key===mo+'|'+a.name)?.net??0))]}),[.22,.26,.26,.26]);
b.push({type:'chart',kind:'monthly'});
para(b,'Na venda a prazo, os pedidos não cancelados caem de 173 em março para 18 em abril e de 86 em junho para 10 em julho. A pronta entrega cai mais recentemente, de 376 em julho para 233 em agosto. Datas diferentes pedem investigações diferentes.');
para(b,'Não há ano anterior na base para testar sazonalidade. Mudanças de integração, disponibilidade, sortimento, política de prazo e operação precisam ser verificadas nas datas de ruptura; não atribuo a queda ao mercado em geral.');

b=page('Pronta entrega: onde a venda se perde','03 | TRÁFEGO, CONVERSÃO E MIX');
const aa=main.periods.ago20,ss=main.periods.set20;
table(b,['Indicador','1-20/08','1-20/09','Variação'],[
['Receita de produtos',money(aa.itemNet),money(ss.itemNet),pct(delta(aa.itemNet,ss.itemNet))],
['Pedidos não cancelados',num(aa.orders-aa.cancel),num(ss.orders-ss.cancel),pct(delta(aa.orders-aa.cancel,ss.orders-ss.cancel))],
['Visitas registradas',num(aa.diarias.visits),num(ss.diarias.visits),pct(delta(aa.diarias.visits,ss.diarias.visits))],
['Pedidos não cancelados / visitas',pct((aa.orders-aa.cancel)/aa.diarias.visits*100),pct((ss.orders-ss.cancel)/ss.diarias.visits*100),'Melhora agregada'],
['Produtos por pedido não cancelado',money(aa.itemNet/(aa.orders-aa.cancel)),money(ss.itemNet/(ss.orders-ss.cancel)),pct(delta(aa.itemNet/(aa.orders-aa.cancel),ss.itemNet/(ss.orders-ss.cancel)))],
['Cancelamentos / pedidos registrados',pct(aa.cancel/aa.orders*100),pct(ss.cancel/ss.orders*100),'Não é a taxa reputacional do ML'],
],[.43,.19,.19,.19]);
h(b,'A queda mudou de natureza');
para(b,'Julho-agosto: visitas -12,72%; pedidos não cancelados -38,03%; conversão operacional 0,90% para 0,64%. O valor de produtos por pedido cai de R$ 1.164,94 para R$ 969,06. Há menos gente chegando, menor conversão e uma cesta de menor valor.');
para(b,'Agosto-setembro: visitas -48,90%, mas conversão operacional sobe de 0,62% para 0,77%. O diagnóstico recente é principalmente perda de alcance e de mix de maior valor; não uma piora generalizada da conversão. Visitas são as registradas, sem prova de estabilidade de cobertura por anúncio.');
h(b,'A semana mais recente melhorou, sem estabilizar o mês');
table(b,['Janela','Produtos','Pedidos não cancelados','Visitas'],['w1','w2','w3','w4'].map((k,i)=>{const x=main.periods[k];return[['24-30/08','31/08-06/09','07-13/09','14-20/09'][i],money(x.itemNet),String(x.orders-x.cancel),num(x.diarias.visits)]}),[.25,.25,.25,.25]);
para(b,'De 07-13 para 14-20/09: receita +49,81%, pedidos +88,46%, visitas +29,92%, ticket de produtos -20,51%. Já na comparação de duas quinzenas equivalentes, a receita recua 22,35%. Uma semana de reação não demonstra recuperação sustentada.');
call(b,'Não interpretar “ticket menor” como prova de desconto excessivo em todos os produtos. Os principais itens Excede encareceram de julho para agosto, enquanto perderam unidades. A troca do mix também reduz o ticket da conta.');

b=page('Curva A e fila de recuperação','04 | PRODUTOS QUE MERECEM AÇÃO PRIMEIRO');
para(b,'Curva ABC recalculada por receita dos itens não cancelados em cada mês: A até cruzar 80% do acumulado, B até 95%, C restante. Julho tinha 18 SKUs A entre 69 com vendas. Em agosto, 27 entre 70. Em setembro 1-20, 19 entre 39.');
const priority=['PA85351','PA85352','PA85347','PA56215','PA65752','PA69845','PA66715','PA66716','PA65751','PA69847'];
table(b,['SKU / foco','Julho','Agosto','Set. 1-20','Situação em 21/09'],priority.map(sku=>{const p=prod(sku);return[sku,money(p.periods.jul.revenue),money(p.periods.ago.revenue),money(p.periods.set20.revenue),p.listings.every(x=>x.status==='pausado')?'Todos pausados':'Há anúncio ativo']}),[.16,.20,.20,.20,.24]);
h(b,'Por que começar pelos Excede');
const ex=['PA85351','PA85352','PA85347'].map(prod),j=ex.reduce((v,x)=>v+x.periods.jul.revenue,0),a=ex.reduce((v,x)=>v+x.periods.ago.revenue,0);
para(b,`Os três Excede somavam ${money(j)} em julho e ${money(a)} em agosto. A perda de ${money(j-a)} equivale a ${pct((j-a)/(main.periods.jul.itemNet-main.periods.ago.itemNet)*100)} da queda líquida da receita dos produtos. Isso localiza a perda; não demonstra que a pausa atual já existia em julho ou agosto.`);
para(b,'PA85351: 47 para 9 unidades, preço médio R$ 1.792,40 para R$ 2.028,90. PA85352: 29 para 2 unidades, R$ 2.111,17 para R$ 2.605,90. PA85347: 24 para 6 unidades, R$ 1.119,41 para R$ 1.463,29. Preço, campanha, entrega e disponibilidade podem atuar juntos; não há experimento que isole elasticidade.');
h(b,'Como executar por grupo');
para(b,'P0 - Excede, PA65752, PA69845, Bari: verificar saldo físico, reservado, lote em trânsito, motivo da pausa e prazo. Se não houver produto, programar reposição e retirada da mídia; se houver, corrigir a causa e validar a oferta.');
para(b,'P1 - PA56215 ativo, porém sem venda em setembro: revisar preço final com frete e prazo, visitas por anúncio, competitividade e campanha. P1 - PA65751 e PA69847: preservar disponibilidade e medir contribuição antes de usar o crescimento para escalar mídia.');
para(b,'Os 17 SKUs com venda em julho cujos anúncios estão todos pausados somavam R$ 233.969,07, ou 53,42% da receita de produtos daquele mês. Esse valor é exposição histórica, não previsão de recuperação.');

b=page('Estoque: a hipótese é forte, a prova é incompleta','05 | DISPONIBILIDADE E PAUSAS');
table(b,['Conta','Ativos','Pausados','Participação pausada'],[[short(main.name),'277','191','40,81%'],[short(second.name),'744','54','6,77%']],[.40,.20,.20,.20]);
para(b,'Na pronta entrega, 6 dos 10 SKUs de maior receita em setembro têm todos os anúncios pausados na captura de 21/09. Eles incluem PA66715, PA69845, PA85351, PA85347, PA66406 e PA66716. A indisponibilidade comercial merece tratamento imediato.');
h(b,'O que a quantidade salva permite dizer');
table(b,['SKU','Quantidade em 26/08 por anúncio','Status em 21/09','Interpretação'],[
['PA65752','0','Todos pausados','Sinal coerente com ruptura; saldo atual e duração precisam ser confirmados.'],
['PA52106','0','Todos pausados','Mesma prioridade de conferência, com impacto menor.'],
['PA85351','18','Todos pausados','Pode ter esgotado depois, ou pausa por outra causa.'],
['PA85352','8','Todos pausados','Não usar o saldo de agosto como saldo atual.'],
['PA66747','0','Há ativos','Mostra por que não se deve misturar snapshots de datas diferentes.'],
],[.16,.25,.20,.39]);
para(b,'A mesma quantidade pode aparecer nos anúncios Clássico e Premium de um SKU. Não some essas linhas como se fossem estoques independentes. O relatório não calculou cobertura de dias ou compra de reposição porque faltam saldo físico atual, reservas, depósitos e lead time.');
h(b,'Falha de informação encontrada na integração');
para(b,'O cliente do Mercado Livre lê available_quantity, mas gravarCatalogo em src/lib/meli/sincronizar.ts grava status e preço, sem persistir a quantidade. A tabela de snapshots de vitrine segue em 26/08. Atualização de catálogo não significa atualização de estoque.');
para(b,'Correção proposta: guardar saldo vendável, reservado e depósito por conta/SKU, com data e fonte; manter histórico diário de status, preço visível e motivo de pausa. Alertar primeiro para a curva A ponderada pela receita, e não pela quantidade total de anúncios.');
call(b,'Meta operacional sugerida: 100% dos SKUs A com saldo conferido e responsável definido em 72 horas. Depois, disponibilidade ponderada de pelo menos 95% nas horas comerciais. É uma meta de gestão proposta, não um benchmark do marketplace.');

b=page('Preços, promoções e contribuição','06 | LIMITES PARA CRESCER SEM PERDER DINHEIRO');
para(b,'Não existe custo unitário, imposto ou embalagem preenchido em nenhum dos 142 produtos. Não há caixa, folha, compras ou despesas na base. Portanto, não é possível declarar que a operação lucra, perde dinheiro ou suporta mais capital de giro.');
h(b,'Seis itens de setembro abaixo do menor preço cadastrado');
table(b,['Data / SKU','Preço vendido','Menor preço da fórmula','Diferença'],d.formula.filter(x=>x.below).sort((a,b)=>a.date.localeCompare(b.date)).map(x=>[x.date.slice(8,10)+'/09 '+x.sku,money(x.unitPrice),money(x.floor),money(x.unitPrice-x.floor)]),[.34,.22,.22,.22]);
para(b,'Os seis registros somam R$ 7.566,47 em produtos e R$ 1.938,93 abaixo da referência agregada. Isso não é prejuízo comprovado. A fórmula pode depender de comissão negociada, subsídio, condições de campanha e vigência. Foi escolhida a versão válida na data, com referência por MLB quando existente, senão SKU.');
para(b,'No PA65751 a fórmula de setembro foi revisada: uma média mensal não substitui a comparação por pedido e data. Para aprovar oferta, usar preço efetivo recebido pelo vendedor, subsídio confirmado e tarifa efetiva; o menor piso da tabela é só uma triagem conservadora.');
h(b,'Custos de canal disponíveis, sem margem completa');
para(b,'Pronta entrega, setembro 1-20: comissão registrada R$ 5.793,66 (7,51% da receita de produtos), frete vendedor R$ 10.916,26 (14,15%). Esses dois componentes deixam R$ 60.421,78 antes de mercadoria, imposto, embalagem, publicidade, despesas e ajustes. Não é lucro.');
para(b,'O campo juros soma R$ 3.522,76, mas o código o deriva de total_paid_amount menos transaction_amount do comprador. Antes de tratá-lo como custo do vendedor, reconciliar o extrato de liquidação. O cálculo de margem da aplicação atualmente o deduz.');
h(b,'Promoções precisam de confirmação no canal');
para(b,'Há 5.712 registros aprovados e 1.260 reprovados no histórico de processamento; não são 6.972 ofertas únicas nem prova de participação efetiva. As 7 campanhas estão marcadas ativas, mas não têm início/fim estruturados; alguns nomes citam encerramento em 10/09 ou 13/09.');
call(b,'Antes de novo desconto: validar custo completo, tarifa, preço visível, subsídio e repasse. Testar preço em 3-5 anúncios com estoque e entrega comparáveis por pelo menos duas semanas; alterar uma variável por vez e comparar com um grupo estável.');

b=page('Publicidade: volume e eficiência caíram','07 | PRODUCT ADS DA PRONTA ENTREGA');
const adrows=s.adsPeriods.filter(x=>x.key.includes('São Paulo')).sort((a,b)=>a.key.localeCompare(b.key));
table(b,['Período','Investimento','Receita atribuída','ROAS','ACOS'],adrows.map(x=>[x.key.startsWith('2026-06')?'02-30/06':x.key.startsWith('2026-07')?'Julho':'Agosto',money(x.investment),money(x.revenue),num(x.revenue/x.investment)+'x',pct(x.investment/x.revenue*100)]),[.18,.23,.25,.16,.18]);
para(b,'De julho para agosto: investimento -36,24%, cliques -32,41%, receita atribuída -52,63%; ROAS de 11,28x para 8,38x. Menor investimento explica parte da exposição, mas o retorno por real também piora. Receita atribuída inclui vendas diretas e indiretas e não deve ser somada à receita dos pedidos.');
table(b,['Campanha em agosto','Gasto','Receita atribuída','ACOS'],d.adsCampaign.filter(x=>x.key.startsWith('2026-08')).slice(0,8).map(x=>[x.key.split('|').at(-1),money(x.spend),money(x.revenue),x.revenue?pct(x.spend/x.revenue*100):'Sem venda']),[.43,.19,.22,.16]);
para(b,'74 linhas de anúncios com gasto e nenhuma receita atribuída consumiram R$ 2.245,23 em agosto, 16,20% do gasto de Product Ads. Priorizar auditoria de estoque, preço, clique e atribuição; não concluir que todas devem ser encerradas pelo zero isolado.');
h(b,'Setembro ainda não permite medir ROAS por campanha');
para(b,'Não há Product Ads detalhado de setembro. O consolidado diário soma R$ 5.362,79 de 1-20/09, mas traz zero de 17 a 20/09 e depende de preenchimento manual. Ausência de atualização pode parecer corte de mídia. Portanto, não concluo que a melhora da última semana ocorreu graças à redução de investimento.');
para(b,'As fontes também divergem em agosto: Product Ads R$ 13.860,00; consolidado R$ 16.854,32. A diferença de R$ 2.994,32 deve ser reconciliada com outras modalidades, datas e origem; não prova desperdício ou cobrança duplicada.');
call(b,'Depois da conciliação e da margem: concentrar orçamento em estoque vendável e contribuição positiva, separar recuperação dos Excede de testes, e escalar por contribuição incremental. ROAS é receita atribuída / gasto; não mede lucro.');

b=page('Venda a prazo e demais canais','08 | ONDE CRESCER E ONDE VALIDAR PRIMEIRO');
h(b,'Segunda conta do Mercado Livre');
para(b,'798 anúncios, 744 ativos, mas apenas 9 pedidos não cancelados em 1-20/09. A receita de produtos sobe de R$ 15.344,00 para R$ 26.019,99 frente a 1-20/08, com base pequena. Só o PA66716 representa R$ 10.950,48 (42,08%) de setembro: crescimento concentrado.');
para(b,'Não existe captura de estoque para a segunda conta. A cobertura de visitas começa em 14/08; comparar a conversão integral de agosto com setembro seria incorreto. Em 07-20/09 houve 3.799 visitas e 9 pedidos não cancelados: razão operacional de 0,24%, sem controlar mix, preço, prazo e modalidade.');
para(b,'Manter a conta, mas trabalhar primeiro 5-10 produtos de maior potencial com estoque/produção e prazo confiáveis. Revisar as quedas de abril e julho com o histórico original de pedidos, restrições e mudanças comerciais. Ter 744 anúncios ativos, sozinho, não demonstra demanda nem saúde.');
h(b,'Panorama de receita dos produtos, dias 1-20');
table(b,['Canal / conta','Agosto','Setembro','Leitura'],[
[short(main.name),money(aa.itemNet),money(ss.itemNet),'Recuperação prioritária'],
[short(second.name),money(second.periods.ago20.itemNet),money(second.periods.set20.itemNet),'Potencial, amostra pequena'],
['VTEX',money(vtex.periods.ago20.itemNet),money(vtex.periods.set20.itemNet),'Proteger expedição e retenção'],
['Madeira Madeira','R$ 10.251,58','Sem registro','Último pedido 30/08'],
['Magalu','R$ 3.588,50','Sem registro','Último pedido 25/08'],
['WebContinental','R$ 0,00','R$ 2.137,00','1 pedido não cancelado'],
['Casas Bahia','R$ 0,00','R$ 1.578,00','1 pedido não cancelado'],
['Casa & Video','R$ 2.604,00','Sem registro','Último pedido 02/08'],
],[.31,.22,.22,.25]);
para(b,'Zema: último pedido em 29/08. Carrefour: 15/04. Shopee: 01/04. Lebiscuit: 23/03. Mateus Mais: 03/02. Sicredi: 16/06. Amazon não tem pedidos na base. Outros tem 3 pedidos históricos e falta item para sua venda não cancelada. Ausência de registro não prova canal inativo.');
para(b,'Para esses canais, confirmar alimentação até 20/09 antes de investir ou encerrar operação. Não há dados suficientes de estoque, tráfego, mídia, frete e margem para recomendar escala por canal.');

b=page('VTEX: crescimento com alertas operacionais','09 | CANCELAMENTOS E PEDIDOS A PROCESSAR');
para(b,'Receita de produtos de R$ 699.654,61 para R$ 869.158,60 em 1-20 de agosto/setembro (+24,23%). Pedidos não cancelados de 368 para 471 (+27,99%). A conta cadastrada como loja própria responde por 89,05% dos produtos registrados em setembro. Confirmar a atribuição de canal antes de interpretar isso como migração de clientes do ML.');
h(b,'Cancelamento alto por contagem, menor por valor');
para(b,'De 1-20/09, 247 de 718 pedidos estão cancelados (34,40%), somando R$ 72.629,03, ou 7,48% do total bruto dos pedidos. São denominadores diferentes: ambos são relevantes.');
call(b,'223 cancelamentos têm exatamente R$ 82,80, total de R$ 18.464,40. Eles representam 90,28% dos cancelamentos por quantidade. O padrão merece investigação de produto, origem, pagamento, teste ou fraude; a base não identifica a causa.');
para(b,'Excluindo hipoteticamente esses 223 pedidos, a taxa seria 24 / 495 = 4,85%. Essa é uma análise de sensibilidade, não uma limpeza aplicada. Não apagar os registros nem atribuir fraude sem investigar os motivos originais e a liquidação.');
h(b,'Status a processar: risco a conferir');
para(b,'Na extração há 215 pedidos com status ready-for-handling, total de R$ 460.931,38, com datas desde 04/09 até 21/09. O status pode estar desatualizado ou fazer parte do fluxo esperado; sem data prometida e eventos logísticos, não é possível declarar atraso.');
para(b,'Ação em 24 horas: comparar a lista com o OMS, faturamento, separação e despacho; separar atrasos reais de status não atualizado. Ordenar por promessa de entrega, disponibilidade e valor. O crescimento só se sustenta se os pedidos forem atendidos e não virarem cancelamento depois.');
h(b,'A exclusão de agosto altera a leitura histórica');
para(b,'A exclusão vigente retira todo o dia 27/08, inclusive 14 pedidos não cancelados. Agosto ajustado tem R$ 1.040.918,00 em total de pedidos não cancelados; o bruto sem a exclusão teria R$ 1.060.532,90. Para comparar desempenho operacional, preferir excluir eventos identificados por pedido quando houver evidência.');
para(b,'Também há diferença de R$ 6.898,05 e 3 pedidos entre o consolidado diário e os pedidos de agosto da VTEX. A análise usa pedidos e itens diretamente. Reconciliar antes de cobrar metas ou bônus a partir do painel.');

b=page('Falhas de medição que precisam ser corrigidas','10 | CONFIABILIDADE DO PAINEL');
table(b,['Prioridade','Constatação','Consequência e correção'],[
['P0','Estoque salvo só em 26/08; catálogo em 21/09','Persistir quantidade e histórico com fonte e horário. Pausa não identifica ruptura.'],
['P0','0/142 SKUs com custo, imposto e embalagem','Cadastrar componentes e cobertura. Mostrar margem indisponível, nunca custo zero.'],
['P0','Receita do pedido e dos itens divergem por origem','Separar produtos, frete comprador, frete vendedor, desconto e repasse.'],
['P1','Juros derivados do total pago pelo comprador','Validar quem suporta o custo antes de descontar da margem.'],
['P1','Sem Ads detalhado de setembro; zeros desde 17/09','Separar zero confirmado de dado não recebido; atualizar por campanha e conta.'],
['P1','Diário de anúncios tem só 6 vendas registradas','Usar pedidos/itens para vendas. A integração atual atualiza principalmente visitas; conversão da tabela isolada pode enganar.'],
['P1','Reputação e data de reputação nulas nas duas contas','Buscar métricas e causas reais. Cancelamento total não equivale ao indicador do vendedor.'],
['P1','0 registros de integrações e sincronizações','Há dados API recentes: isso indica falta de rastreabilidade, não prova de desconexão. Registrar sucesso, falha e cobertura por etapa.'],
['P1','7 campanhas ativas sem início e fim estruturados','Consultar vigência e participação efetiva. Nome da planilha não é confirmação.'],
['P2','Sem concorrentes, frete cotado ou lead time','Medir ofertas comparáveis e promessa por CEP. Sem isso, causa preço/prazo permanece hipótese.'],
],[.12,.36,.52]);
para(b,'A composição do cabeçalho explica parte da divergência: na pronta entrega, julho tem R$ 466.016,27 nos pedidos versus R$ 438.016,50 nos itens; agosto, R$ 238.724,27 versus R$ 225.790,69; setembro 1-20 coincide em R$ 77.131,70. O campo frete também muda de significado entre fontes: a sincronização ML grava nele o frete do vendedor.');
para(b,'A integração VTEX consulta pedidos sem filtrar afiliado/canal de venda e grava todos na conta da loja própria. Se o OMS também contiver vendas de marketplace, a atribuição e a soma dos canais precisam de deduplicação externa. Isso é um risco identificado no código; não há prova nesta base de quanto foi classificado incorretamente.');
para(b,'O README descreve uma fase antiga de dados simulados; a análise foi feita na base conectada. Não alterei anúncios, preços, campanhas, estoque, pedidos, configuração ou código da aplicação. Os arquivos gerados são de diagnóstico.');

b=page('Plano de estabilização e crescimento','11 | EXECUÇÃO EM 72 HORAS, 30, 60 E 90 DIAS');
table(b,['Prazo','Ação e responsável sugerido','Critério de conclusão'],[
['0-24 h','Operação + estoque: conferir os 10 SKUs prioritários; identificar motivo de pausa, saldo real, reservas e reposição.','100% com causa, saldo, prazo e dono; nenhuma reativação sem capacidade de atender.'],
['0-24 h','Expedição + atendimento: validar os 215 pedidos ready-for-handling na VTEX.','Lista de pendências reais por promessa de entrega; plano para cada exceção.'],
['24-48 h','Financeiro + comercial: validar os 6 itens abaixo da fórmula, subsídios, tarifas e juros.','Contribuição por pedido dos SKUs prioritários; piso aprovado por conta.'],
['24-72 h','Dados + mídia: conciliar receita, cancelar falsos zeros de cobertura e atualizar Ads de setembro.','Vendas, visitas, gasto e estoque com data de cobertura e diferenças explicadas.'],
['Dias 4-14','Comercial: recuperar anúncios elegíveis e testar preço em 3-5 SKUs; mídia só em estoque e contribuição positiva.','Uma variável por teste; registro antes/depois; controlar tráfego, prazo e mix.'],
['Dias 15-30','Gestão: revisar curva A semanalmente e pactuar compras com reposição e limite de caixa.','Disponibilidade ponderada >=95%; custos completos em >=90% da receita.'],
['Dias 31-60','Comercial + mídia: expandir apenas os testes rentáveis e sortimento adjacente aos vencedores.','Duas revisões semanais positivas em contribuição e cumprimento de entrega.'],
['Dias 61-90','Gestão: avaliar canais menores e ampliar o que tiver giro, margem e operação comprovados.','Decisão por contribuição, capital empregado e esforço; cortar testes improdutivos com evidência.'],
],[.14,.52,.34]);
h(b,'Rotina que reduz a operação por tentativa e erro');
para(b,'Diariamente, 15 minutos: disponibilidade da curva A, pedidos por promessa de envio, cancelamentos novos, gasto e alertas de preço. Semanalmente: receita de produtos, pedidos retidos, ticket, conversão, contribuição, concentração, reposição e resultados dos testes.');
para(b,'Uma pessoa deve responder pela fila comercial, outra pelo saldo e entrega, e outra pela conciliação financeira; se a equipe for pequena, os papéis podem ser acumulados com um responsável claro. Automatizar alertas e preparação da análise; manter decisões de compra, preço e orçamento vinculadas a limites verificáveis.');
call(b,'Sobre manter ou incluir a pessoa mencionada no áudio: os dados não permitem avaliar seu desempenho individual. Antes de decidir, definir função, custo, entregas e indicadores por 30 dias. O trecho transcrito não esclarece quem é a pessoa nem qual decisão está em discussão.');

b=page('Metas, cenários e limites da conclusão','12 | COMO SABER SE O PLANO FUNCIONOU');
h(b,'Metas iniciais propostas, sem promessa de resultado');
table(b,['Indicador','Base disponível','Meta / regra sugerida'],[
['Receita semanal de produtos - pronta entrega','R$ 33.784,05 em 14-20/09','Primeiro sustentar 2 semanas sem deteriorar contribuição e entrega.'],
['Disponibilidade da curva A','Não apurada com saldo atual','>=95% ponderada pela receita histórica, com coleta diária.'],
['Cobertura de custo completo','0% dos produtos cadastrados','>=90% da receita em 30 dias; 100% dos itens escalados.'],
['Mídia rentável','ROAS agosto 8,38x; set. desconhecido','Teto de gasto conforme contribuição; dados de setembro antes de ampliar.'],
['Entrega e cancelamento por motivo','Falta promessa / motivo confiável','100% das exceções classificadas; acompanhar por coorte madura.'],
],[.33,.30,.37]);
h(b,'Cenários de 30 dias para pronta entrega');
para(b,'Simulação aritmética, não previsão: receita de produtos = visitas x taxa de pedidos não cancelados x produtos por pedido. Parte-se dos 12.914 acessos e 99 pedidos de 1-20/09; nenhuma suposição de causalidade ou lucro.');
const scenarios=[['Ritmo observado',12914/20*30,99/12914,77131.7/99],['Recuperação moderada',24000,.008,900],['Recuperação mais forte',30000,.009,950]];
table(b,['Cenário','Visitas / 30 dias','Conversão','Ticket produtos','Receita'],scenarios.map(([l,v,c,t])=>[l,num(v),pct(c*100),money(t),money(v*c*t)]),[.27,.19,.16,.18,.20]);
para(b,'Os dois cenários de recuperação exigem voltar a vender itens de maior valor, recuperar tráfego e confirmar estoque. Não dimensionar compra com essa receita simulada: quantidade de reposição depende de demanda por SKU, saldo líquido de reservas, prazo do fornecedor e caixa.');
para(b,'A meta cadastrada de setembro para o Mercado Livre inteiro é R$ 743.792. O total bruto de pedidos em 1-20/09 é R$ 115.842,95 (15,57%); o ritmo linear daria R$ 173.764,43 no mês. Para alcançar a meta seriam necessários R$ 62.794,91/dia nos 10 dias restantes, cerca de 10,84 vezes o ritmo observado. Não é uma base realista para compras ou mídia sem uma mudança operacional comprovada.');
h(b,'Fórmulas e fontes');
para(b,'Receita de produtos: soma dos itens não cancelados. Ticket: receita de produtos / pedidos não cancelados com itens. Conversão operacional: pedidos não cancelados / visitas registradas, diferente da métrica oficial e sujeita à cobertura. ROAS: receita atribuída / investimento. ACOS: investimento / receita atribuída. Curva A: ordenação de receita até cruzar 80%.');
para(b,'Base principal: tabelas Supabase da Operação principal, extraídas em 22/09/2026; memória de cálculo e tabelas complementares entregues junto. Dados de 2025, ERP de estoque, extratos completos, reputação e logística não estavam disponíveis nesta base. Nenhuma atribuição de responsabilidade individual foi inferida.');
para(b,'Referência externa: o Mercado Livre distingue fatores de reputação e recomenda corrigir falta de estoque. Isso reforça a checagem, mas não comprova penalidade nestas contas. [1] Métricas de publicidade distinguem receita direta/indireta, ROAS e perdas de impressão por ranking; coletar esses campos permite testar a hipótese de exposição. [2]');
b.push({type:'source',text:'[1] Mercado Livre - Por que a reputação do vendedor é importante',url:'https://vendedores.mercadolivre.com.br/nota/por-que-a-reputacao-do-vendedor-e-importante'});
b.push({type:'source',text:'[2] Mercado Livre Developers - Product Ads para Catálogo e User Products',url:'https://developers.mercadolivre.com.br/pt_br/product-ads-para-catalogo-e-user-products-leitura'});

const report={title:'Diagnóstico comercial | Mercado Livre e demais canais',date:'22/09/2026',pages};
writeFileSync(`${root}/relatorio-conteudo.json`,JSON.stringify(report,null,2));
let md='# Diagnóstico comercial e plano de recuperação\n\n22/09/2026 · Operação principal\n\n';
for(const p of pages){md+='## '+p.title+'\n\n';for(const x of p.blocks){if(x.type==='table')md+='| '+x.headers.join(' | ')+' |\n| '+x.headers.map(()=>'---').join(' | ')+' |\n'+x.rows.map(r=>'| '+r.join(' | ')+' |').join('\n')+'\n\n';else if(x.type==='h')md+='### '+x.text+'\n\n';else if(x.type==='source')md+=`[${x.text}](${x.url})\n\n`;else if(x.text)md+=(x.type==='callout'?'> ':'')+x.text+'\n\n';}}
writeFileSync(`${out}/diagnostico-commerce-2026-09-22.md`,md);
let appendix='# Tabelas complementares por SKU e conta\n\nReceita dos itens não cancelados. Datas de comparação: julho, agosto e setembro 1-20. Status dos anúncios: captura de 21/09. Estoque atual não disponível.\n\n';
for(const acc of [main,second,vtex]){const rows=s.productAccounts.filter(p=>p.account===acc.name&&(p.periods.jul.revenue||p.periods.ago.revenue||p.periods.set20.revenue)).sort((a,b)=>b.periods.jul.revenue+b.periods.ago.revenue+b.periods.set20.revenue-a.periods.jul.revenue-a.periods.ago.revenue-a.periods.set20.revenue);appendix+='## '+short(acc.name)+'\n\n| SKU | Produto | Julho | Agosto | Set. 1-20 | Unid. set. | Anúncios pausados / cadastrados |\n|---|---|---:|---:|---:|---:|---|\n'+rows.map(p=>`| ${p.sku} | ${p.title.replaceAll('|','/')} | ${money(p.periods.jul.revenue)} | ${money(p.periods.ago.revenue)} | ${money(p.periods.set20.revenue)} | ${p.periods.set20.units} | ${p.listings.length?p.listings.filter(l=>l.status==='pausado').length+'/'+p.listings.length:'n/d'} |`).join('\n')+'\n\n';}
appendix+='## Anúncios dos 10 SKUs prioritários da pronta entrega\n\n';for(const sku of priority){const p=prod(sku);appendix+='### '+sku+'\n\n'+p.listings.map(l=>`- ${l.mlb}: ${l.status}; preço de vitrine ${money(l.price)}; quantidade de 26/08: ${l.stock?.disponivel??'n/d'}.`).join('\n')+'\n\n';}
writeFileSync(`${out}/anexo-skus-e-anuncios.md`,appendix);
writeFileSync(`${out}/memoria-de-calculo.json`,JSON.stringify({extraidoEm:s.manifest.extraidoEm,operacao:'Operação principal',coverage:s.coverage,accounts:s.accounts,monthly:s.monthly,abc:d.abc,fees:s.feeCoverage,ads:s.adsPeriods,adsCampaigns:d.adsCampaign,formulaExceptions:d.formula.filter(x=>x.below),reconciliation:s.reconciliation},null,2));
console.log(JSON.stringify({pages:pages.length,words:md.split(/\s+/).length,output:out}));
