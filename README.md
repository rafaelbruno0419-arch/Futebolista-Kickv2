# Futebolista Kick

Um jogo de futebol casual completo para navegador, inspirado em jogos como Super Goal: desenhe a trajetória do chute e marque gols em partidas com lances aleatórios — com identidade, arte e implementação próprias.

## Recursos

- **Modo Partida** em perspectiva 2.5D: estádio, torcida animada, placar e cronômetro
- Lances gerados **aleatoriamente a cada momento**: falta com barreira, escanteio, pênalti, cara a cara e chute de longe
- Adversário também ataca: seu goleiro precisa defender os lances do rival
- 5 rivais com dificuldade progressiva, desbloqueados por vitórias
- Slow-motion no gol, zoom de câmera, confete e comemoração da torcida
- Física de curva, vento, barreira que pula, goleiros que se adiantam e defensores móveis
- Jornada com 12 fases em 4 distritos (modo clássico de quebra-cabeça)
- Sistema de 3 estrelas, pontuação, moedas e progressão persistente
- Vestiário com jogadores e bolas desbloqueáveis
- Missões de carreira e recompensas resgatáveis
- Recompensa diária e giro da sorte
- Efeitos sonoros sintetizados com Web Audio (apito, torcida, chute) e resposta háptica opcional
- Layout responsivo para desktop, tablet e celular
- Manifesto PWA e configuração pronta para Vercel
- Salvamento automático local (`localStorage`), sem necessidade de backend

## Como jogar

1. No início, toque em **JOGAR AGORA** e escolha um rival.
2. Cada lance é um momento aleatório da partida: falta, escanteio, pênalti ou jogada em movimento.
3. Pressione sobre a bola e **desenhe a trajetória** até o gol, desviando de defensores e da barreira.
4. Solte para chutar — traços longos levantam a bola por cima da barreira.
5. Colete moedas no caminho, marque gols e vença o rival no placar.
6. Entre os seus lances, o adversário ataca: torça pelo seu goleiro.

## Desenvolvimento

```bash
npm install
npm run dev
```

O servidor de desenvolvimento usa `0.0.0.0` para também funcionar em ambientes de preview.

## Validação de produção

```bash
npm run typecheck
npm run build
npm run preview
```

## Deploy na Vercel

O projeto pode ser importado diretamente na Vercel. As configurações esperadas são detectadas automaticamente:

- **Framework Preset:** Vite
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

O `vercel.json` já inclui o fallback de SPA para que todas as rotas sirvam o jogo corretamente.

## Stack

React, TypeScript, Vite, Canvas 2D, Web Audio API e Lucide Icons.
