// Janela do jogo para as builds de Windows e Linux. Serve o `dist/` por um protocolo próprio (app://):
// em file:// o Chromium bloqueia o Web Worker e os módulos que o mapa usa. Nada sai para a rede.
const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

app.whenReady().then(() => {
  const root = path.join(__dirname, '..', 'dist');
  protocol.handle('app', req => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(root, decodeURIComponent(pathname === '/' ? '/index.html' : pathname)));
    if (!file.startsWith(root + path.sep)) return new Response('', { status: 403 }); // só arquivos do jogo
    return net.fetch(pathToFileURL(file).toString());
  });
  const win = new BrowserWindow({
    width: 1400, height: 900, title: 'Império de Papel', backgroundColor: '#e9dcbc', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.removeMenu();
  win.loadURL('app://game/index.html');
});
app.on('window-all-closed', () => app.quit());
