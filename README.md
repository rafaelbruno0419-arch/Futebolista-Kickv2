# Futebolista Kick

Um jogo de futebol casual completo para navegador, inspirado no conceito de desenhar a trajetória do chute — com identidade, arte e implementação próprias.

## Recursos

- Motor de jogo em Canvas 2D com trajetória desenhada por mouse ou toque
- Física de curva, vento, colisões, goleiros e defensores móveis
- 12 fases em 4 distritos, com dificuldade progressiva
- Sistema de 3 estrelas, pontuação, moedas e progressão persistente
- Campanha, desafio diário e campo de treino
- Vestiário com jogadores e bolas desbloqueáveis
- Missões de carreira e recompensas resgatáveis
- Recompensa diária e giro da sorte
- Efeitos sonoros sintetizados com Web Audio e resposta háptica opcional
- Layout responsivo para desktop, tablet e celular
- Manifesto PWA e configuração pronta para Vercel
- Salvamento automático local (`localStorage`), sem necessidade de backend

## Como jogar

1. Abra uma fase pela campanha ou pelo desafio diário.
2. Pressione sobre a bola.
3. Desenhe uma trajetória até o gol, desviando de defensores e obstáculos.
4. Solte para chutar.
5. Colete moedas no caminho e use uma rota eficiente para conseguir 3 estrelas.

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
