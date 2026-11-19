#!/usr/bin/env bash
set -euo pipefail
archive="$HOME/elara-server.tar.gz"
site=/etc/nginx/conf.d/elara-fichas-servidor.conf
service=/etc/systemd/system/elara-fichas.service
release="/opt/elara-fichas/$(date +%Y%m%d%H%M%S)"
test -f "$archive"
node_bin=$(command -v node)
test "$(node -p 'Number(process.versions.node.split(".")[0])')" -ge 22 || { echo 'Requer Node.js 22 ou superior.'; exit 1; }
if sudo test -e "$site" || sudo test -e "$service"; then
  echo 'O serviço de fichas já existe. Nenhuma alteração feita; use um procedimento de atualização.'
  exit 1
fi
if sudo ss -ltn | awk '{print $4}' | grep -Eq ':(8089|8788)$'; then
  echo 'Porta 8089 ou 8788 ocupada. Nenhuma alteração feita.'
  exit 1
fi
sudo mkdir -p "$release"
sudo tar -xzf "$archive" -C "$release" --no-same-owner
sudo install -d -m 700 -o ubuntu -g ubuntu /var/lib/elara-fichas
sudo tee "$service" >/dev/null <<EOF
[Unit]
Description=Ascensia RPG
After=network.target
[Service]
User=ubuntu
Group=ubuntu
WorkingDirectory=$release
Environment=HOST=127.0.0.1
Environment=PORT=8788
Environment=DATA_DIR=/var/lib/elara-fichas
ExecStart=$node_bin $release/server/index.js
Restart=on-failure
UMask=0077
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/elara-fichas
[Install]
WantedBy=multi-user.target
EOF
sudo tee "$site" >/dev/null <<'EOF'
server {
    listen 100.124.152.1:8089;
    server_name _;
    client_max_body_size 1m;
    location / {
        proxy_pass http://127.0.0.1:8788;
        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
if ! sudo nginx -t; then
  sudo rm -- "$site" "$service"
  echo 'Configuração rejeitada; Nginx não foi recarregado.'
  exit 1
fi
sudo systemctl daemon-reload
sudo systemctl enable --now elara-fichas
for attempt in 1 2 3 4 5; do
  if curl --fail --silent --output /dev/null http://127.0.0.1:8788/api/characters; then break; fi
  sleep 1
done
curl --fail --silent --output /dev/null http://127.0.0.1:8788/api/characters
sudo systemctl reload nginx
echo 'Publicado: http://100.124.152.1:8089 (Tailscale). Dados persistentes em /var/lib/elara-fichas.'
