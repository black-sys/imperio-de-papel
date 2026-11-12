# Império de Papel

Estratégia em tempo real de 1760 a 1918, jogada sobre um mapa cartográfico antigo: funde a capital, colonize
províncias, explore veios, ligue as cidades por rotas, treine exércitos de batalhões, negocie (paz, comércio,
alianças) e segure a ordem interna (greves, revoltas, leis de emergência) contra até quatro nações rivais.
Offline, um jogador; cada semente gera um continente diferente.

## Baixar (build de teste)

Veja a página **Releases** do repositório:

- **Windows:** `Imperio-de-Papel-<versão>-portable.exe` (dois cliques, sem instalar) ou o `.zip`.
  O executável não é assinado: no aviso do Windows, use "Mais informações" → "Executar assim mesmo".
- **Linux:** `.AppImage` (`chmod +x` e rodar) ou `.tar.gz`.

## Rodar a partir do código

```bash
npm install
npm run dev          # navegador: http://localhost:5173/?seed=860
npm test             # testes da simulação
npm run app          # abre em janela própria (Electron)
npm run dist:win     # gera os pacotes de Windows em release/
npm run dist:linux   # gera os pacotes de Linux em release/
```

## Controles

Arrastar com o botão direito/do meio ou WASD: mover · roda: zoom · M: continente · espaço: pausa ·
clique/caixa: selecionar exércitos · clique direito: mandar · Shift+1–9: salvar grupo · 1–9: chamar · Esc: soltar
