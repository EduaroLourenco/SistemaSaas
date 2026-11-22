# Motion com a interface real

O render é offline: usa imagens locais da demonstração, WAVs locais, desenho vetorial e FFmpeg. Não abre navegador nem consulta a operação real. Capture as imagens pelo acesso visual autorizado ao sistema modelo.

Cada vídeo usa master 1080 × 1920 a 24 fps. A tela fica na área superior, preservada por inteiro, sem legenda por cima. A faixa inferior começa em y=1520 e recebe uma pergunta curta, legenda e um personagem vetorial de caixa. Um contorno animado mostra o elemento citado. O personagem permanece fora dos dados.

Para preservar a leitura, capture um recorte útil da tela; de preferência 405 × 500–594. Uma tabela inteira de desktop reduzida perde legibilidade. As coordenadas de `alvo` usam os pixels da imagem original e precisam apontar para dados que existam nela. O render não inventa gráficos ou números.

Manifesto JSON, com caminhos relativos à pasta dele:

```json
{
  "id": "v13",
  "titulo": "O preço mudou. E as vendas?",
  "cenas": [
    {
      "imagem": "telas/preco.png",
      "voz": "voz/cena-01.wav",
      "nuvem": "Foi só o preço?",
      "legenda": "Preço, visitas e vendas: compare os três.",
      "duracao": 6,
      "alvo": { "x": 22, "y": 140, "w": 350, "h": 120 },
      "humor": "curioso"
    }
  ]
}
```

`duracao` é o mínimo; o compositor mede cada WAV e aumenta o tempo para não cortar ou acelerar a fala. `humor` aceita `curioso` ou `feliz`. Use legendas curtas: no máximo três linhas. Divida a cena quando houver mais texto.

Opcionalmente, `recorte: { "x": 14, "y": 56, "w": 377, "h": 440 }` seleciona uma região real da imagem original antes da composição, sem modificar o arquivo de origem. Nesse caso, as coordenadas de `alvo` são relativas ao recorte. Confira se o recorte inclui o título, o intervalo e os dados necessários; não use um corte para ocultar uma comparação que contradiga a narração. `nuvem` tem até 40 caracteres.

```powershell
node scripts/comercial/render-motion.mjs --manifest output/motions/v13/manifesto.json --ffmpeg "C:/caminho/ffmpeg.exe" --out output/motions/renderizados
```

O caminho de FFmpeg pode vir de `GERIZO_FFMPEG`; o executável não faz parte do repositório. Se necessário, passe `--ffprobe` com o executável correspondente. O compositor escolhe `libx264` quando disponível, ou `h264_mf` no Windows; `--encoder` permite escolher outro codificador H.264. `--sem-voz` serve apenas para prévia visual, nunca para dizer que a narração está pronta. Arquivos de saída existentes exigem `--substituir` explícito.

Os roteiros usados estão em `roteiros-profundos.json`. `preparar-voz-direta.mjs` gera a voz a partir desses textos com uma instalação isolada de Edge TTS, sem microfone ou captura do áudio do computador. `preparar-cenas.mjs` cria os três manifestos a partir das capturas locais de `output/comercial-motion/capturas`; eles usam recortes e contornos conferidos nas imagens desta produção. Refaça o enquadramento se a interface mudar. Capturas, vozes intermediárias e saídas de revisão ficam em `output/`, fora do histórico do Git.

As saídas usam `v00-motion.mp4` a `v15-motion.mp4` e pôsteres WebP. O catálogo organiza as dezesseis peças como uma história. Cada capítulo termina puxando a pergunta seguinte.

## História e voz do Gê

`narracao-historia.json` registra as 79 falas e a ordem final. `perfil-voz-ge.json` define a voz Thalita e a intenção de cada cena. Perguntas, pausas e frases curtas fazem parte da entrega; o serviço atual não oferece rótulos expressivos SSML pelo cliente usado.

`preparar-voz-historia.mjs` mantém um cache separado, distinguindo texto, voz, entrega e conversão WAV. `aplicar-narracao-historia.mjs` reaproveita os vídeos: copia a imagem quando a nova fala cabe e ajusta o tempo das cenas existentes quando precisa. A fala não é acelerada ou cortada. As saídas intermediárias ficam em `output/comercial-voz/historia/finais`.

`preparar-contexto-historia.mjs` monta a abertura V00, o V13 com rentabilidade e as quatro aberturas cujos valores precisaram de atualização. `render-motion-rapido.mjs` preserva o desenho original e reutiliza o fundo depois da entrada da cena, redesenhando somente o personagem. Assim não é preciso rasterizar a captura completa a cada quadro.

`preparar-rentabilidade-v13.mjs` deriva o cartão de contribuição das mesmas fontes do cenário. O cartão é identificado como leitura do exemplo; contribuição após Ads não é apresentada como lucro líquido.

`finalizar-historia.mjs` mede todas as mídias, verifica formato e áudio, copia as versões finais locais e atualiza os tempos do catálogo e o inventário. O Git e a Vercel continuam sendo a etapa de publicação.

## Limite das fontes antigas

Os JPEGs antigos já contêm legenda preta sobre a interface. Eles não são fontes limpas. Mover o vídeo ou acrescentar outra faixa não recupera os números escondidos. Para corrigir as doze peças antigas, é necessário capturar as telas novamente, sem o overlay de legenda. Os WAVs podem ser reaproveitados somente quando os valores e a história continuarem correspondendo às novas telas.
