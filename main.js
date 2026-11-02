// Ventana de escritorio (Electron) para el inventario de Omega Eléctrica.
// Solo carga index.html; los datos viven en Supabase.
const { app, BrowserWindow, Menu, session, shell } = require("electron");
const path = require("path");

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let win = null;

  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  function crearVentana() {
    win = new BrowserWindow({
      width: 1100,
      height: 800,
      minWidth: 420,
      minHeight: 560,
      title: "Inventario · Omega Eléctrica",
      icon: path.join(__dirname, "build", "icon.png"),
      backgroundColor: "#12171d",
      autoHideMenuBar: true,
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    Menu.setApplicationMenu(null);
    win.loadFile(path.join(__dirname, "index.html"));
    // Enlaces externos se abren en el navegador, nunca dentro de la app
    win.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: "deny" };
    });
    win.webContents.on("will-navigate", (e) => e.preventDefault());
    win.on("closed", () => (win = null));
  }

  app.whenReady().then(() => {
    // Solo se permite la cámara (para escanear códigos)
    session.defaultSession.setPermissionRequestHandler((_wc, permiso, cb) => cb(permiso === "media"));
    crearVentana();
  });

  app.on("window-all-closed", () => app.quit());
}
