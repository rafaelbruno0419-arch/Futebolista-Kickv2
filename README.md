# Solar System 3D — Simulador Realista do Sistema Solar

Simulador 3D do Sistema Solar em tempo real, direto no navegador. Órbitas calculadas
com mecânica kepleriana a partir de elementos orbitais reais (J2000), planetas
renderizados com shaders procedurais e eclipses geometricamente corretos.

![Saturno](https://img.shields.io/badge/three.js-WebGL-000?logo=three.js) ![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript)

## O que tem de real

| Item | Fonte / precisão |
| --- | --- |
| Elementos orbitais | *JPL Approximate Positions of the Major Planets* (J2000) |
| Equação de Kepler | Newton-Raphson, tolerância 1e-10 |
| Distância Terra–Sol | 1,012 UA em agosto (afélio em julho) ✔ |
| Velocidade orbital | Terra 29,45 km/s · Mercúrio 48,6 · Netuno 5,47 ✔ |
| Órbita da Lua | 363.348 – 405.501 km (real: 356.500 – 406.700) ✔ |
| Cometa Halley | periélio 0,587 UA · afélio 35,1 UA (real: 0,586 / 35,1) ✔ |
| Rotação e obliquidade | Períodos reais, incluindo rotação retrógrada de Vênus e Urano |
| Eclipses | Umbra/penumbra por raio angular do ocultador vs. do Sol |

## Recursos

- **22 corpos**: Sol, 8 planetas, Plutão, 11 luas e o cometa Halley.
- **Superfícies procedurais** — sem texturas externas, tudo gerado em GLSL:
  - Terra com continentes, vegetação por latitude, calotas, nuvens em movimento,
    reflexo especular no oceano e luzes de cidades no lado noturno;
  - Júpiter e Saturno com bandas por *domain warping*, Grande Mancha Vermelha
    e ovais brancos;
  - Marte com regiões de albedo escuro, cânions e calotas sazonais;
  - mundos rochosos com campos de crateras (Worley) e relevo por normal mapping;
  - luas geladas com fraturas (Europa, Encélado, Tritão).
- **Anéis de Saturno** com divisão de Cassini, estrutura fina e sombra do planeta
  projetada sobre eles.
- **Cometa** com coma que infla perto do Sol, cauda de íons (azul, reta) e de
  poeira (amarela, encurvada), ambas apontando para longe do Sol.
- **Céu real**: 14.000 estrelas com cores por temperatura (lei de Planck) e a
  faixa da Via Láctea inclinada 60° em relação à eclíptica.
- **Escalas**: de "escala real" (onde os planetas somem no vazio, como na
  realidade) até 60× de ampliação.
- **Controle de tempo**: de tempo real a 10 anos por segundo, para frente e para trás.

## Controles

| Ação | Como |
| --- | --- |
| Orbitar | arrastar |
| Zoom | rolagem ou pinça |
| Focar um corpo | clicar nele ou no chip lateral |
| Pausar | `Espaço` |
| Acelerar / desacelerar | `.` e `,` |
| Órbitas / rótulos / escala real | `O` · `L` · `R` |
| Modo foto (esconder UI) | `H` |

## Rodando

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # gera dist/
```

## Arquitetura

```
src/
  sim/
    data.ts      elementos orbitais, físicos e parâmetros de shader dos 22 corpos
    kepler.ts    equação de Kepler, posições e traçado de órbitas
    shaders.ts   GLSL: superfícies, atmosferas, anéis, coroa solar
    stars.ts     campo estelar e Via Láctea
    engine.ts    cena three.js, câmera, LOD, eclipses, laço de render
  App.tsx        interface (React)
```

Detalhes de implementação que importam:

- **Profundidade logarítmica** — a cena vai de metros a dezenas de UA; sem isso,
  o z-buffer colapsa.
- **Céu em cena separada** — renderizado antes, com o depth limpo em seguida, para
  que estrelas nunca vazem através dos planetas.
- **Câmera travada no alvo** — segue a posição exata do corpo e só interpola o
  *resíduo* da troca de foco; interpolar o alvo faria a câmera ficar para trás
  de um planeta a 29 km/s.
- **LOD por tamanho aparente** — crateras finas e normal mapping só entram quando
  o corpo ocupa área relevante da tela.
- **Billboards para brilho** — o halo do Sol é um quad que encara a câmera, então
  não há como "entrar dentro" da esfera de brilho.

## Deploy

Projeto Vite estático; `vercel.json` já faz o rewrite de SPA e o cache dos assets.
