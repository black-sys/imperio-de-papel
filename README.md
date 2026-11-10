# Mundo procedural (protótipo)

Gerador de continente determinístico por semente + visualizador isométrico low-poly no navegador.

## Rodar

```bash
npm install
npm run dev        # http://localhost:5173/?seed=860
npm test           # testes do gerador
npm run perf       # tempo da fase global e dos chunks
```

## Compartilhar com amigos (seu PC como servidor)

```bash
npm run build
npm run preview    # serve dist/ em 0.0.0.0:4173
```

Escolha um jeito de dar acesso, sem abrir porta no roteador:

- **Tailscale** (recomendado para um grupo fixo): todos instalam o Tailscale e entram na mesma tailnet;
  os amigos abrem `http://<ip-tailscale-do-seu-pc>:4173/?seed=860`.
- **Cloudflare Tunnel** (link público temporário, sem conta):
  `cloudflared tunnel --url http://localhost:4173` e envie a URL `https://….trycloudflare.com/?seed=860`.

A mesma semente gera o mesmo mundo para todos — o botão "Copiar link" copia a URL com `?seed=`.

## Controles

WASD ou clique: andar · Q/E: girar câmera · roda do mouse: zoom · M: mapa-múndi (clique para teleportar)
