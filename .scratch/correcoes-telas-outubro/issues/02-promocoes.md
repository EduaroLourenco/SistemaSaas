# 02 — Promoções

Status: concluído no código e recuperação de dados confirmada; publicação pendente

Corrigir o salvamento das regras por empresa e a persistência de planilhas processadas em histórico/campanhas. Melhorar mensagens de erro e a leitura das campanhas, sem enviar alterações ao marketplace.

## Comments

- 12/10/2026: usuário reporta falha em “Salvar para esta empresa” e resultados ausentes depois do processamento na Bom de Compras.
- Causa confirmada: o cliente privilegiado buscava canal pelo nome global, mas cada empresa possui seu Mercado Livre. A busca retornava várias linhas e a campanha ficava sem canal. Agora canal, anúncios e gravações usam explicitamente a operação.
- Regras eram gravadas numa tabela com RLS apenas de leitura. A rota verifica autenticação e permissão de edição, altera só os dois campos da empresa da sessão e confirma a linha retornada. Erros aparecem na tela; tolerância também vale no modo tabela/alvo.
- Rodadas só ficam concluídas após gravar os itens; falhas preservam ofertas anteriores. Histórico mostra tentativas incompletas. Campanhas contam apenas a última rodada e abrem as ofertas por SKU/anúncio.
- Testes de persistência entre duas empresas, falha parcial, permissões e motor de preços passaram; TypeScript passou.
- Recuperação: planilha original da última tentativa da Bom de Compras localizada. Reprocessamento local reproduziu as 186 linhas do relatório já entregue, sem divergência em nenhum campo. Arquivos de conferência/backup permanecem em `output/`, fora do GitHub público.
- Recuperação executada: uma campanha, 186 registros de histórico e 186 ofertas, todos vinculados a anúncios da Bom de Compras. Nenhuma mudança enviada ao Mercado Livre. Tentativas anteriores sem registro foram identificadas como falhas após backup.
- 13/10/2026: texto da opção de piso agora descreve o comportamento real: campanha editável propõe o mínimo, oferta fixa é aceita/recusada. Geração de arquivo não altera o canal.
