#!/data/data/com.termux/files/usr/bin/bash
# Setup e inicialização do OnionSearch no Termux (Android).
# Uso:  bash scripts/termux-setup.sh
set -e

echo "==> Atualizando pacotes do Termux"
pkg update -y
pkg upgrade -y

echo "==> Instalando dependências (tor, nodejs, git)"
pkg install -y tor nodejs-lts git

echo "==> Configurando o torrc (se ainda não existir)"
TORRC="$PREFIX/etc/tor/torrc"
if [ ! -f "$TORRC" ]; then
  cp scripts/torrc.example "$TORRC"
  echo "    torrc criado em $TORRC"
else
  echo "    torrc já existe — mantenha SocksPort 9050 (e ControlPort 9051 para 'Nova identidade')"
fi

echo "==> Instalando dependências do Node"
npm install

echo "==> Compilando a interface"
npm run build

echo ""
echo "Pronto! Agora:"
echo "  1) Inicie o Tor:      tor &"
echo "  2) Inicie o servidor: npm start"
echo "  3) No celular, abra:  http://localhost:3000"
echo "     (de outro aparelho na mesma rede: http://IP_DO_CELULAR:3000)"
echo ""
echo "  Dica: veja o IP com  ip -4 addr  ou  ifconfig"
