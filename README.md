# 🧅 OnionSearch — Busca na deep web via Tor (Termux)

Interface web para fazer buscas anônimas roteando **todo o tráfego pelo Tor**.
O servidor foi feito para rodar dentro do **Termux** no seu celular Android: o
Termux executa o daemon do Tor e este app Node.js, e você acessa a interface
pelo navegador (do próprio celular ou de outro aparelho na mesma rede Wi-Fi).

![Node.js](https://img.shields.io/badge/Node.js-20%2B-2cb67d?logo=node.js)
![Tor](https://img.shields.io/badge/Tor-SOCKS5-7f5af0)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite)
![React](https://img.shields.io/badge/React-18-61dafb?logo=react)

> **O que este projeto é — e o que não é.** "Deep web" é toda a parte da
> internet que não aparece em buscadores comuns (sites atrás de login, bancos
> de dados, intranets…). O Tor te dá **anonimato** e acesso a serviços `.onion`
> (a chamada "dark web"). Nenhuma ferramenta "busca a deep web inteira": este
> app faz (1) **busca anônima na web indexada** (DuckDuckGo) e (2) **busca em
> serviços `.onion`** (Ahmia), além de (3) **abrir páginas `.onion`** pelo Tor.
> Use com responsabilidade: anonimato ≠ licença para atividades ilegais, e
> este projeto não se destina a isso.

## Recursos

| Recurso | O que faz |
| --- | --- |
| **Status do Tor** | Mostra se o Tor está conectado, o IP do nó de saída e a latência |
| **Nova identidade** | Troca o circuito do Tor (`SIGNAL NEWNYM`) para mudar de IP |
| **DuckDuckGo anônimo** | Busca na web indexada sem rastreamento, via Tor |
| **Ahmia `.onion`** | Busca em serviços ocultos da rede Tor (índice curado, seguro) |
| **Abrir `.onion`** | Baixa e exibe páginas `.onion` direto na interface, via Tor |
| **Proteção opcional** | `AUTH_TOKEN` para proteger a API/proxy |

## Como funciona

```
Seu navegador ──► servidor Node.js (Termux) ──► proxy SOCKS5 ──► rede Tor ──► destino
   (localhost)      server/index.js            socks5h:9050
```

Toda requisição sai pelo SocksPort do Tor (`127.0.0.1:9050`). O proxy usa
`socks5h`, então a resolução de DNS acontece **dentro** do Tor — requisito
obrigatório para funcionar com endereços `.onion`.

## Instalação no Termux (Android)

```bash
# 1) Instale os pacotes
pkg update && pkg upgrade
pkg install tor nodejs-lts git

# 2) Clone o projeto
git clone https://github.com/rafaelbruno0419-arch/Futebolista-Kickv2.git
cd Futebolista-Kickv2

# 3) Configure o Tor (cria $PREFIX/etc/tor/torrc se não existir)
cp scripts/torrc.example $PREFIX/etc/tor/torrc

# 4) Instale as dependências e compile a interface
npm install
npm run build
```

Ou faça tudo de uma vez com o script:

```bash
bash scripts/termux-setup.sh
```

## Rodando

```bash
# Terminal 1 — inicia o Tor
tor

# Terminal 2 — inicia o app
npm start
```

Abra no navegador do celular:

- **No próprio celular:** `http://localhost:3000`
- **De outro aparelho na mesma rede Wi-Fi:** `http://IP_DO_CELULAR:3000`
  (descubra o IP com `ip -4 addr`)

### Botão "Nova identidade" (opcional)

Para o botão funcionar, o `torrc` precisa de `ControlPort 9051`:

```bash
# gere a senha e veja o hash
tor --hash-password minha_senha

# edite $PREFIX/etc/tor/torrc
#   ControlPort 9051
#   HashedControlPassword <hash-gerado-acima>

# depois informe a senha ao servidor:
TOR_CONTROL_PASSWORD=minha_senha npm start
```

## Variáveis de ambiente

Todas têm padrão sensato (veja `.env.example`):

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `PORT` | `3000` | Porta do servidor web |
| `HOST` | `0.0.0.0` | Interface (use `127.0.0.1` para só acesso local) |
| `TOR_PROXY_HOST` | `127.0.0.1` | Endereço do SocksPort do Tor |
| `TOR_PROXY_PORT` | `9050` | Porta SOCKS do Tor |
| `TOR_CONTROL_HOST` | `127.0.0.1` | Endereço do ControlPort |
| `TOR_CONTROL_PORT` | `9051` | Porta de controle do Tor |
| `TOR_CONTROL_PASSWORD` | *(vazio)* | Senha do ControlPort |
| `AUTH_TOKEN` | *(vazio)* | Token de acesso opcional para a API |

Exemplo:

```bash
AUTH_TOKEN=segredo PORT=8080 npm start
```

> **Atenção com a rede.** Com `HOST=0.0.0.0`, qualquer aparelho na sua rede
> Wi-Fi acessa o app (e, por ele, o Tor). Em rede que você não controla, use
> `HOST=127.0.0.1` e/ou defina `AUTH_TOKEN`.

## Desenvolvimento

```bash
npm run dev      # frontend com hot reload em http://localhost:5173
npm run server   # servidor (API) em http://localhost:3000
```

Durante o `dev`, o Vite repassa `/api` para o servidor Node
(`VITE_API_TARGET`, padrão `http://127.0.0.1:3000`).

```bash
npm run build    # compila a interface para dist/
npm run typecheck
```

## Estrutura

```
server/
  index.js   servidor Express (API + frontend estático)
  tor.js     proxy SOCKS5 do Tor, status, novo circuito (NEWNYM)
  search.js  motores de busca: DuckDuckGo (web) e Ahmia (.onion)
  onion.js   visualizador de páginas .onion (rewrite de links via proxy)
  util.js    helpers de parsing/escaping de HTML
src/
  App.tsx    interface React
  api.ts     cliente HTTP (configurável para outro host)
  types.ts   tipos compartilhados
  styles.css tema escuro
scripts/
  termux-setup.sh   instalação guiada no Termux
  torrc.example     configuração de exemplo do Tor
```

## Limitações conhecidas

- O DuckDuckGo pode pedir CAPTCHA para alguns nós de saída do Tor — use
  **Nova identidade** e tente de novo.
- O visualizador `.onion` é uma navegação **simplificada**: sites com muito
  JavaScript, formulários complexos ou streaming podem não funcionar. Para uso
  completo, use o [Tor Browser](https://www.torproject.org/download/).
- O Ahmia filtra conteúdos abusivos por política própria — é um índice curado.

## Privacidade

- O app **não** salva histórico, cookies ou consultas. Tudo acontece em memória.
- Nenhuma dependência de terceiros recebe seus dados: as requisições saem
  direto do seu aparelho, pelo Tor.
- Ainda assim, **não entre com contas pessoais** em sites `.onion` e lembre-se
  de que o anonimato do Tor depende do seu comportamento (não de uma única
  ferramenta).
