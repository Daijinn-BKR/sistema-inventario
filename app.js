// Inventario Omega Eléctrica · app.js
(() => {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.CONFIG || {};
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nf = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 3 });
  const fmtFecha = (iso) => new Date(iso).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });

  if (!SUPABASE_URL || SUPABASE_URL.includes("TU-PROYECTO") || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY === "TU-ANON-KEY") {
    document.body.innerHTML = '<p style="padding:24px;font:16px system-ui">Falta configurar <b>config.js</b> con la URL y la anon key de Supabase (ver README.md).</p>';
    return;
  }

  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let productos = [];
  let movimientos = [];
  let scanner = null;
  let editandoId = null;
  let canal = null;
  let reloadTimer = null;

  // ---------- utilidades UI ----------
  let toastTimer;
  function toast(msg, esError = false) {
    const t = $("#toast");
    t.textContent = msg;
    t.className = esError ? "err" : "";
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), esError ? 6000 : 3000);
  }

  function msgError(error) {
    if (!error) return "";
    if (error.code === "23514" || /productos_stock_check/.test(error.message)) return "Stock insuficiente para esa salida.";
    if (error.code === "23505") return "Ya existe un producto con ese código.";
    return error.message || "Error desconocido";
  }

  // ---------- sesión ----------
  async function iniciar() {
    const { data } = await sb.auth.getSession();
    mostrar(!!data.session);
    sb.auth.onAuthStateChange((_ev, session) => mostrar(!!session));
  }

  let appActiva = false;
  function mostrar(conSesion) {
    $("#login").hidden = conSesion;
    $("#app").hidden = !conSesion;
    if (conSesion && !appActiva) {
      appActiva = true;
      cargar();
      suscribir();
    } else if (!conSesion) {
      appActiva = false;
      if (canal) { sb.removeChannel(canal); canal = null; }
    }
  }

  $("#form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#l-error").textContent = "";
    const { error } = await sb.auth.signInWithPassword({
      email: $("#l-email").value.trim(),
      password: $("#l-pass").value,
    });
    if (error) $("#l-error").textContent = "Correo o contraseña incorrectos.";
  });
  $("#btn-salir").addEventListener("click", () => sb.auth.signOut());

  // ---------- datos ----------
  async function cargar() {
    const [p, m] = await Promise.all([
      sb.from("productos").select("*").eq("activo", true).order("nombre"),
      sb.from("movimientos").select("*, productos(nombre, codigo, unidad)").order("creado_en", { ascending: false }).limit(200),
    ]);
    if (p.error) return toast("No se pudo cargar: " + p.error.message, true);
    productos = p.data || [];
    movimientos = m.data || [];
    render();
  }

  function suscribir() {
    if (canal) sb.removeChannel(canal);
    canal = sb
      .channel("cambios-inventario")
      .on("postgres_changes", { event: "*", schema: "public", table: "productos" }, programarRecarga)
      .on("postgres_changes", { event: "*", schema: "public", table: "movimientos" }, programarRecarga)
      .subscribe();
  }
  function programarRecarga() {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(cargar, 300);
  }

  // ---------- render ----------
  const esBajo = (p) => Number(p.stock_minimo) > 0 && Number(p.stock) <= Number(p.stock_minimo);

  function render() {
    // categorías
    const sel = $("#filtro-cat");
    const actual = sel.value;
    const cats = [...new Set(productos.map((p) => p.categoria).filter(Boolean))].sort();
    sel.innerHTML = '<option value="">Todas las categorías</option>' + cats.map((c) => `<option>${esc(c)}</option>`).join("");
    sel.value = cats.includes(actual) ? actual : "";
    $("#cats").innerHTML = cats.map((c) => `<option value="${esc(c)}">`).join("");

    // filtros
    const q = $("#buscar").value.trim().toLowerCase();
    const soloBajo = $("#solo-bajo").checked;
    const cat = sel.value;
    const lista = productos.filter((p) =>
      (!q || [p.nombre, p.codigo, p.ubicacion, p.categoria].some((v) => (v || "").toLowerCase().includes(q))) &&
      (!soloBajo || esBajo(p)) &&
      (!cat || p.categoria === cat)
    );

    const nBajo = productos.filter(esBajo).length;
    $("#resumen").textContent = `${productos.length} productos` + (nBajo ? ` · ${nBajo} con stock bajo` : "");

    $("#lista").innerHTML = lista.length
      ? lista.map(tarjeta).join("")
      : `<div class="empty" style="grid-column:1/-1">${productos.length ? "Sin resultados." : "Aún no hay productos. Crea el primero con “+ Nuevo”."}</div>`;

    // movimientos
    $("#tabla-mov").innerHTML = movimientos.length
      ? movimientos.map((m) => `<tr>
          <td>${esc(fmtFecha(m.creado_en))}</td>
          <td>${esc(m.productos?.nombre || "—")}<div class="meta">${esc(m.productos?.codigo || "")}</div></td>
          <td class="${m.tipo === "entrada" ? "in" : "out"}">${m.tipo === "entrada" ? "Entrada" : "Salida"}</td>
          <td class="num">${m.tipo === "entrada" ? "+" : "−"}${nf.format(m.cantidad)} ${esc(m.productos?.unidad || "")}</td>
          <td>${esc(m.motivo || "")}</td>
          <td class="meta">${esc((m.usuario || "").split("@")[0])}</td></tr>`).join("")
      : '<tr><td colspan="6" class="empty">Sin movimientos todavía.</td></tr>';
  }

  function tarjeta(p) {
    return `<article class="card ${esBajo(p) ? "low" : ""}">
      <div>
        <h3>${esc(p.nombre)}</h3>
        <div class="meta">${esc(p.codigo)}${p.ubicacion ? " · " + esc(p.ubicacion) : ""}${p.categoria ? " · " + esc(p.categoria) : ""}</div>
      </div>
      <div class="row">
        <div class="stock">${nf.format(p.stock)} <small>${esc(p.unidad)}</small></div>
        ${esBajo(p) ? `<span class="badge">Stock bajo (mín. ${nf.format(p.stock_minimo)})</span>` : ""}
      </div>
      <div class="actions">
        <button data-mov="${p.id}" data-tipo="entrada" class="in">+ Entrada</button>
        <button data-mov="${p.id}" data-tipo="salida" class="out">− Salida</button>
        <button data-edit="${p.id}" class="ghost" aria-label="Editar ${esc(p.nombre)}">Editar</button>
      </div>
    </article>`;
  }

  // ---------- pestañas y filtros ----------
  function pestaña(cual) {
    const inv = cual === "inventario";
    $("#vista-inventario").hidden = !inv;
    $("#vista-movimientos").hidden = inv;
    $("#tab-inventario").setAttribute("aria-selected", inv);
    $("#tab-movimientos").setAttribute("aria-selected", !inv);
  }
  $("#tab-inventario").addEventListener("click", () => pestaña("inventario"));
  $("#tab-movimientos").addEventListener("click", () => pestaña("movimientos"));
  ["#buscar", "#solo-bajo", "#filtro-cat"].forEach((s) => $(s).addEventListener("input", render));

  $("#lista").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.mov) abrirMov(b.dataset.mov, b.dataset.tipo);
    if (b.dataset.edit) abrirProducto(b.dataset.edit);
  });

  document.querySelectorAll("[data-cerrar]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));

  // ---------- movimientos ----------
  function abrirMov(id, tipo = "salida") {
    const p = productos.find((x) => x.id === id);
    if (!p) return;
    $("#form-mov").dataset.id = id;
    $("#m-titulo").textContent = p.nombre;
    $("#m-sub").textContent = `${p.codigo} · Stock actual: ${nf.format(p.stock)} ${p.unidad}`;
    $(tipo === "entrada" ? "#t-ent" : "#t-sal").checked = true;
    $("#m-cant").value = "";
    $("#m-motivo").value = "";
    $("#dlg-mov").showModal();
    $("#m-cant").focus();
  }

  $("#form-mov").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const cantidad = parseFloat($("#m-cant").value);
    if (!(cantidad > 0)) return toast("Ingresa una cantidad mayor que 0", true);
    const btn = f.querySelector('[type=submit]');
    btn.disabled = true;
    const { error } = await sb.from("movimientos").insert({
      producto_id: f.dataset.id,
      tipo: f.querySelector('input[name=tipo]:checked').value,
      cantidad,
      motivo: $("#m-motivo").value.trim() || null,
    });
    btn.disabled = false;
    if (error) return toast(msgError(error), true);
    $("#dlg-mov").close();
    toast("Movimiento registrado");
    cargar();
  });

  // ---------- productos ----------
  function abrirProducto(id, codigoNuevo = "") {
    editandoId = id || null;
    const p = id ? productos.find((x) => x.id === id) : null;
    $("#p-titulo").textContent = p ? "Editar producto" : "Nuevo producto";
    $("#p-codigo").value = p ? p.codigo : codigoNuevo;
    $("#p-nombre").value = p ? p.nombre : "";
    $("#p-cat").value = p?.categoria || "";
    $("#p-ubic").value = p?.ubicacion || "";
    $("#p-unidad").value = p ? p.unidad : "un";
    $("#p-min").value = p ? p.stock_minimo : 0;
    $("#p-stock").value = 0;
    $("#p-stock-wrap").hidden = !!p;      // el stock se cambia solo con movimientos
    $("#p-desactivar").hidden = !p;
    $("#dlg-prod").showModal();
    (p ? $("#p-nombre") : codigoNuevo ? $("#p-nombre") : $("#p-codigo")).focus();
  }
  $("#btn-nuevo").addEventListener("click", () => abrirProducto(null));

  $("#form-prod").addEventListener("submit", async (e) => {
    e.preventDefault();
    const datos = {
      codigo: $("#p-codigo").value.trim(),
      nombre: $("#p-nombre").value.trim(),
      categoria: $("#p-cat").value.trim() || null,
      ubicacion: $("#p-ubic").value.trim() || null,
      unidad: $("#p-unidad").value.trim() || "un",
      stock_minimo: parseFloat($("#p-min").value) || 0,
    };
    if (!datos.codigo || !datos.nombre) return;
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true;
    let error;
    if (editandoId) {
      ({ error } = await sb.from("productos").update(datos).eq("id", editandoId));
    } else {
      datos.stock = parseFloat($("#p-stock").value) || 0;
      ({ error } = await sb.from("productos").insert(datos));
    }
    btn.disabled = false;
    if (error) return toast(msgError(error), true);
    $("#dlg-prod").close();
    toast("Producto guardado");
    cargar();
  });

  $("#p-desactivar").addEventListener("click", async () => {
    const p = productos.find((x) => x.id === editandoId);
    if (!p || !confirm(`¿Dar de baja "${p.nombre}"? Dejará de aparecer en la lista (el historial se conserva).`)) return;
    const { error } = await sb.from("productos").update({ activo: false }).eq("id", p.id);
    if (error) return toast(msgError(error), true);
    $("#dlg-prod").close();
    toast("Producto dado de baja");
    cargar();
  });

  // ---------- escaneo ----------
  async function abrirScan() {
    $("#scan-msg").textContent = "Apunta la cámara al QR o código de barras.";
    $("#dlg-scan").showModal();
    try {
      scanner = new Html5Qrcode("lector");
      await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 240, height: 240 } }, alEscanear, () => {});
    } catch (err) {
      $("#scan-msg").textContent = "No se pudo abrir la cámara (requiere HTTPS y permiso del navegador). Puedes escribir el código en la búsqueda.";
    }
  }
  async function detenerScan() {
    if (!scanner) return;
    const s = scanner;
    scanner = null;
    try { await s.stop(); } catch (_) {}
    try { s.clear(); } catch (_) {}
  }
  async function alEscanear(texto) {
    await detenerScan();
    $("#dlg-scan").close();
    const codigo = texto.trim();
    const p = productos.find((x) => x.codigo.toLowerCase() === codigo.toLowerCase());
    if (p) abrirMov(p.id, "salida");
    else {
      toast("Código nuevo: completa los datos del producto");
      abrirProducto(null, codigo);
    }
  }
  $("#btn-scan").addEventListener("click", abrirScan);
  $("#scan-cerrar").addEventListener("click", () => $("#dlg-scan").close());
  $("#dlg-scan").addEventListener("close", detenerScan);

  // ---------- exportar CSV ----------
  $("#btn-csv").addEventListener("click", () => {
    const celda = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const filas = [["Código", "Nombre", "Categoría", "Ubicación", "Stock", "Unidad", "Stock mínimo"]]
      .concat(productos.map((p) => [p.codigo, p.nombre, p.categoria, p.ubicacion, p.stock, p.unidad, p.stock_minimo]));
    const csv = "﻿" + filas.map((f) => f.map(celda).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `inventario-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // ---------- instalar como app (PWA) ----------
  let evInstalar = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    evInstalar = e;
    $("#btn-instalar").hidden = false;
  });
  $("#btn-instalar").addEventListener("click", async () => {
    if (!evInstalar) return;
    evInstalar.prompt();
    await evInstalar.userChoice;
    evInstalar = null;
    $("#btn-instalar").hidden = true;
  });
  window.addEventListener("appinstalled", () => ($("#btn-instalar").hidden = true));
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  iniciar();
})();
