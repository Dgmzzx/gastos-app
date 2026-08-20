const MEDIOS = ["Efectivo","Débito","Crédito","Transferencia"];
const LS_URL_KEY = "gastos_script_url";
const LS_CURRENCY_KEY = "gastos_currency";
const CURRENCIES = {
  RD: { code: "RD$", locale: "es-DO" },
  US: { code: "$", locale: "en-US" }
};

let selectedCat = null;
let selectedMed = null;
let recientes = [];
let editingFila = null;
let editCat = null;
let editMed = null;
let pendingDeleteFila = null;
let pendingPop = false;
let categorias = [];
let fijosCfg = [];
let editingFijoFila = null;
let fijoCat = null;

const $ = (id) => document.getElementById(id);

function getCurrency(){
  return localStorage.getItem(LS_CURRENCY_KEY) || "RD";
}

function fmt(n){
  const v = Number(n) || 0;
  const c = CURRENCIES[getCurrency()] || CURRENCIES.RD;
  return c.code + " " + v.toLocaleString(c.locale, {maximumFractionDigits:0});
}

function todayISO(){
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off*60000);
  return local.toISOString().slice(0,10);
}

function buildChips(container, options, onPick){
  container.innerHTML = "";
  options.forEach(opt => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = opt;
    b.addEventListener("click", () => {
      [...container.children].forEach(c => c.classList.remove("active"));
      b.classList.add("active");
      onPick(opt);
    });
    container.appendChild(b);
  });
}

function rebuildChips(){
  const names = categorias.map(c => c.nombre);
  buildChips($("catChips"), names, (v)=>selectedCat=v);
  buildChips($("editCatChips"), names, (v)=>editCat=v);
  buildChips($("fijoCatChips"), names, (v)=>fijoCat=v);
  buildChips($("medChips"), MEDIOS, (v)=>selectedMed=v);
  buildChips($("editMedChips"), MEDIOS, (v)=>editMed=v);
  if(selectedCat && names.includes(selectedCat)) markChip($("catChips"), selectedCat);
  if(editCat && names.includes(editCat)) markChip($("editCatChips"), editCat);
  if(fijoCat && names.includes(fijoCat)) markChip($("fijoCatChips"), fijoCat);
  if(selectedMed && MEDIOS.includes(selectedMed)) markChip($("medChips"), selectedMed);
  if(editMed && MEDIOS.includes(editMed)) markChip($("editMedChips"), editMed);
}

function getScriptUrl(){
  return localStorage.getItem(LS_URL_KEY) || "";
}

async function postJson(url, payload){
  const res = await fetch(url, {
    method: "POST",
    headers: {"Content-Type":"text/plain;charset=utf-8"},
    body: JSON.stringify(payload)
  });
  let data;
  try{
    data = await res.json();
  }catch(e){
    throw new Error("respuesta inválida del servidor");
  }
  if(!data || data.ok !== true){
    throw new Error((data && data.error) || "error del servidor");
  }
  return data;
}

function openSettings(){
  $("scriptUrl").value = getScriptUrl();
  $("cfgCurrency").value = getCurrency();
  $("settingsOverlay").classList.add("show");
  loadSettingsData();
}
function closeSettings(){
  $("settingsOverlay").classList.remove("show");
}

async function loadSummary(){
  const url = getScriptUrl();
  if(!url){
    $("summaryLoading").textContent = "Conectá tu Google Sheet desde el ícono de arriba.";
    return;
  }
  $("summaryLoading").style.display = "block";
  $("summaryBody").style.display = "none";
  try{
    const res = await fetch(url + "?action=resumen");
    const data = await res.json();
    renderSummary(data);
  }catch(err){
    $("summaryLoading").textContent = "No se pudo conectar. Revisá la URL en configuración.";
  }
}

function renderSummary(data){
  $("summaryLoading").style.display = "none";
  $("summaryBody").style.display = "block";

  $("periodSub").textContent = data.periodoLabel || "Quincena actual";
  $("periodDates").textContent = data.rangoTexto || "";

  $("statIngreso").textContent = fmt(data.ingreso);
  $("statGastado").textContent = fmt(data.gastado);

  const deltaEl = $("statDelta");
  if(data.prevGastado > 0){
    const abs = Math.abs(data.deltaGastado);
    const absPct = Math.abs(data.pctCambio || 0);
    if(data.deltaGastado > 0){
      deltaEl.textContent = `↑ ${fmt(abs)} (+${absPct}%) vs anterior`;
      deltaEl.className = "stat-delta neg";
    }else if(data.deltaGastado < 0){
      deltaEl.textContent = `↓ ${fmt(abs)} (−${absPct}%) vs anterior`;
      deltaEl.className = "stat-delta pos";
    }else{
      deltaEl.textContent = "igual que la anterior";
      deltaEl.className = "stat-delta";
    }
  }else{
    deltaEl.textContent = "sin datos previos";
    deltaEl.className = "stat-delta muted";
  }
  const balEl = $("statBalance");
  balEl.textContent = fmt(data.balance);
  balEl.className = "stat-val " + (data.balance >= 0 ? "pos" : "neg");

  const hb = $("headerBal");
  hb.textContent = fmt(data.balance);
  hb.classList.toggle("neg", data.balance < 0);

  if(pendingPop){
    pendingPop = false;
    balEl.classList.remove("pop");
    hb.classList.remove("pop");
    void balEl.offsetWidth;
    balEl.classList.add("pop");
    hb.classList.add("pop");
  }

  const pct = Math.min(100, Math.round((data.diasTranscurridos / data.diasTotales) * 100));
  $("dayBar").style.width = pct + "%";
  $("dayCaption").textContent = "Día " + data.diasTranscurridos + " de " + data.diasTotales;
  $("dayLeft").textContent = data.diasRestantes + " días restantes";

  const perDia = $("perDia");
  perDia.classList.remove("neg");
  if(data.diasRestantes > 0){
    if(data.balance >= 0){
      perDia.textContent = fmt(Math.floor(data.balance / data.diasRestantes)) + " por día";
    }else{
      perDia.textContent = "Sin margen esta quincena";
      perDia.classList.add("neg");
    }
  }else{
    perDia.textContent = "";
  }

  const ingCard = $("ingresosCard");
  if(data.ingresoManual){
    ingCard.style.display = "block";
    renderIngresos(data.ingresos || []);
  }else{
    ingCard.style.display = "none";
  }

  if(data.categorias && data.categorias.length){
    $("catCard").style.display = "block";
    const body = $("catBody");
    body.innerHTML = "";
    data.categorias.forEach(c => {
      const div = document.createElement("div");
      div.className = "catbar";
      const pctCat = c.presupuesto > 0 ? Math.min(100, Math.round((c.gastado / c.presupuesto)*100)) : 0;
      const over = c.presupuesto > 0 && c.gastado > c.presupuesto;
      const diff = (c.gastado || 0) - (c.prev || 0);
      let deltaHtml = "";
      if(c.prev > 0 && diff !== 0){
        const cls = diff > 0 ? "neg" : "pos";
        const arrow = diff > 0 ? "↑" : "↓";
        deltaHtml = `<span class="catbar-delta ${cls}">${arrow} ${fmt(Math.abs(diff))}</span>`;
      }else if(c.prev === 0 && (c.gastado || 0) > 0){
        deltaHtml = `<span class="catbar-delta">nuevo</span>`;
      }
      div.innerHTML = `
        <div class="catbar-top">
          <span class="catbar-name">${c.nombre}</span>
          <span class="catbar-nums">${fmt(c.gastado)} / ${fmt(c.presupuesto)}${deltaHtml}</span>
        </div>
        <div class="catbar-track"><div class="catbar-fill ${over ? 'over':''}" style="width:${pctCat}%"></div></div>
      `;
      body.appendChild(div);
    });
  }

  if(data.fijos && data.fijos.length){
    $("fijosCard").style.display = "block";
    const body = $("fijosBody");
    body.innerHTML = "";
    data.fijos.forEach(f => {
      const div = document.createElement("div");
      div.className = "fijo-row";
      const estado = f.pagado
        ? `<span class="pill paid">Pagado</span>`
        : `<button class="pill-btn" data-fijo="${f.nombre}">Registrar ahora</button>`;
      div.innerHTML = `
        <div class="fijo-left">
          <span class="fijo-name">${f.nombre}</span>
          <span class="fijo-meta">${f.categoria} · vence día ${f.dia} · ${fmt(f.monto)}</span>
        </div>
        ${estado}
      `;
      body.appendChild(div);
    });
    body.querySelectorAll(".pill-btn").forEach(btn => {
      btn.addEventListener("click", () => registrarFijo(btn.dataset.fijo, btn));
    });
  }

  if(data.recientes && data.recientes.length){
    recientes = data.recientes.slice();
    const body = $("entriesBody");
    body.innerHTML = "";
    recientes.slice().reverse().forEach(e => {
      const div = document.createElement("div");
      div.className = "entry";
      div.innerHTML = `
        <div class="entry-left">
          <span class="entry-cat">${e.categoria}</span>
          <span class="entry-meta">${e.fecha}${e.nota ? " · " + e.nota : ""}</span>
        </div>
        <div class="entry-right">
          <span class="entry-amt">${fmt(e.monto)}</span>
          <span class="entry-actions">
            <button type="button" class="btn-icon" data-action="editar" data-fila="${e.fila}" aria-label="Editar">✎</button>
            <button type="button" class="btn-icon danger" data-action="borrar" data-fila="${e.fila}" aria-label="Eliminar">✕</button>
          </span>
        </div>
      `;
      body.appendChild(div);
    });
  }
  categorias = data.categorias || [];
  rebuildChips();
}

async function registrarFijo(nombre, btn){
  const url = getScriptUrl();
  if(!url) return;
  btn.disabled = true;
  btn.textContent = "Guardando…";
  try{
    await postJson(url, {action:"registrarFijo", nombre: nombre});
    loadSummary();
  }catch(err){
    btn.disabled = false;
    btn.textContent = "Reintentar";
  }
}

let toastTimer = null;
function showToast(text, tick = true){
  const t = $("toast");
  t.innerHTML = `<div class="toast-inner">${tick ? '<span class="tick"></span>' : ""}<span>${text}</span></div>`;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

function haptic(){
  try{
    if(navigator.vibrate) navigator.vibrate([30,40,30]);
  }catch(e){}
}

function markChip(container, value){
  [...container.children].forEach(c => c.classList.toggle("active", c.textContent === (value || "")));
}

function openEdit(fila, e){
  editingFila = fila;
  editCat = e.categoria;
  editMed = e.medio || "";
  $("editMonto").value = e.monto;
  $("editFecha").value = e.fechaISO || todayISO();
  $("editNota").value = e.nota || "";
  markChip($("editCatChips"), editCat);
  markChip($("editMedChips"), editMed);
  $("editMsg").textContent = "";
  $("editMsg").className = "msg";
  $("editOverlay").classList.add("show");
}

function closeEdit(){
  $("editOverlay").classList.remove("show");
}

async function saveEdit(){
  const url = getScriptUrl();
  const msg = $("editMsg");
  msg.textContent = "";
  msg.className = "msg";

  const monto = parseFloat($("editMonto").value);
  if(!url){
    msg.textContent = "Primero conectá tu Google Sheet (ícono de arriba).";
    msg.classList.add("err");
    return;
  }
  if(!monto || monto <= 0){
    msg.textContent = "Ingresá un monto válido.";
    msg.classList.add("err");
    return;
  }
  if(!editCat){
    msg.textContent = "Elegí una categoría.";
    msg.classList.add("err");
    return;
  }

  const btn = $("btnSaveEdit");
  btn.disabled = true;
  btn.textContent = "Guardando…";

  try{
    await postJson(url, {
      action: "editarGasto",
      fila: editingFila,
      monto: monto,
      categoria: editCat,
      medio: editMed || "",
      fecha: $("editFecha").value || todayISO(),
      nota: $("editNota").value || ""
    });
    closeEdit();
    loadSummary();
    showToast("Gasto actualizado");
  }catch(err){
    msg.textContent = err.message || "No se pudo guardar. Revisá tu conexión.";
    msg.classList.add("err");
  }finally{
    btn.disabled = false;
    btn.textContent = "Guardar cambios";
  }
}

function askDelete(fila, e){
  pendingDeleteFila = fila;
  $("deleteText").textContent = `¿Borrar "${e.categoria}" por ${fmt(e.monto)} del ${e.fecha}?`;
  $("deleteOverlay").classList.add("show");
}

function closeDelete(){
  pendingDeleteFila = null;
  $("deleteOverlay").classList.remove("show");
}

async function confirmDelete(){
  const url = getScriptUrl();
  if(!url || !pendingDeleteFila) return;
  const btn = $("btnConfirmDelete");
  btn.disabled = true;
  btn.textContent = "Borrando…";
  try{
    await postJson(url, {action: "borrarGasto", fila: pendingDeleteFila});
    closeDelete();
    loadSummary();
    showToast("Gasto borrado");
  }catch(err){
    btn.disabled = false;
    btn.textContent = "Borrar";
  }
}

async function submitGasto(){
  const url = getScriptUrl();
  const msg = $("formMsg");
  msg.textContent = "";
  msg.className = "msg";

  const monto = parseFloat($("monto").value);
  if(!url){
    msg.textContent = "Primero conectá tu Google Sheet (ícono de arriba).";
    msg.classList.add("err");
    return;
  }
  if(!monto || monto <= 0){
    msg.textContent = "Ingresá un monto válido.";
    msg.classList.add("err");
    return;
  }
  if(!selectedCat){
    msg.textContent = "Elegí una categoría.";
    msg.classList.add("err");
    return;
  }

  const payload = {
    monto: monto,
    categoria: selectedCat,
    medio: selectedMed || "",
    fecha: $("fecha").value || todayISO(),
    nota: $("nota").value || ""
  };

  const btn = $("btnSubmit");
  btn.disabled = true;
  btn.textContent = "Guardando…";

  try{
    await postJson(url, payload);
    showToast(" Gasto anotado · " + fmt(monto));
    haptic();
    pendingPop = true;
    $("monto").value = "";
    $("nota").value = "";
    $("fecha").value = todayISO();
    loadSummary();
  }catch(err){
    msg.textContent = err.message || "No se pudo guardar. Revisá tu conexión.";
    msg.classList.add("err");
  }finally{
    btn.disabled = false;
    btn.textContent = "Anotar gasto";
  }
}

/* ---------------- Gestión desde la web ---------------- */

async function loadSettingsData(){
  const url = getScriptUrl();
  if(!url) return;
  try{
    const res = await fetch(url + "?action=configWeb");
    const data = await res.json();
    fijosCfg = data.fijos || [];
    renderConfigForm(data);
    renderFijosList(fijosCfg);
  }catch(err){
    $("cfgMsg").textContent = "No se pudo cargar la configuración.";
    $("cfgMsg").className = "msg err";
  }
}

function renderConfigForm(data){
  $("cfgModo").value = data.modo || "quincenal";
  $("cfgIngreso").value = data.ingreso || "";
  $("cfgIngresoMensual").value = data.ingresoMensual || "";
  $("cfgDia1").value = data.dia1 || "";
  $("cfgDia2").value = data.dia2 || "";
  setModoUI(data.modo || "quincenal");
  const body = $("cfgCats");
  body.innerHTML = "";
  const list = (data.categorias && data.categorias.length) ? data.categorias : [{nombre:"", presupuesto:""}];
  list.forEach(c => addCatRow(c.nombre, c.presupuesto));
}

function setModoUI(modo){
  const manual = modo === "manual";
  const mensual = modo === "mensual";
  $("cfgIngresoField").style.display = (mensual || manual) ? "none" : "";
  $("cfgIngresoMesField").style.display = mensual ? "" : "none";
  $("cfgDia1Field").style.display = manual ? "none" : "";
  $("cfgDia2Field").style.display = (mensual || manual) ? "none" : "";
  $("cfgDia1Label").textContent = mensual ? "Día de cobro" : "Día de cobro 1";
  $("cfgModoHint").style.display = manual ? "" : "none";
}

function addCatRow(nombre, presupuesto){
  const body = $("cfgCats");
  const row = document.createElement("div");
  row.className = "cfg-cat-row";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "cfg-cat-name";
  nameInput.placeholder = "Categoría";
  nameInput.value = nombre || "";
  const budgetInput = document.createElement("input");
  budgetInput.type = "number";
  budgetInput.className = "cfg-cat-budget";
  budgetInput.inputMode = "decimal";
  budgetInput.min = "0";
  budgetInput.step = "0.01";
  budgetInput.placeholder = "Presupuesto";
  budgetInput.value = presupuesto || "";
  const del = document.createElement("button");
  del.type = "button";
  del.className = "cfg-del";
  del.setAttribute("aria-label", "Quitar categoría");
  del.textContent = "✕";
  row.appendChild(nameInput);
  row.appendChild(budgetInput);
  row.appendChild(del);
  body.appendChild(row);
  updateCatRemoveButtons();
}

function updateCatRemoveButtons(){
  const rows = $("cfgCats").children;
  const single = rows.length <= 1;
  [...rows].forEach(row => {
    row.querySelector(".cfg-del").style.visibility = single ? "hidden" : "visible";
  });
}

async function saveConfig(){
  const url = getScriptUrl();
  const msg = $("cfgMsg");
  msg.textContent = "";
  msg.className = "msg";
  if(!url){
    msg.textContent = "Primero conectá tu Google Sheet.";
    msg.className = "msg err";
    return;
  }
  const cats = [];
  let invalid = false;
  [...$("cfgCats").children].forEach(row => {
    const nombre = row.querySelector(".cfg-cat-name").value.trim();
    const presupuesto = Number(row.querySelector(".cfg-cat-budget").value) || 0;
    if(!nombre){ invalid = true; return; }
    cats.push({ nombre, presupuesto });
  });
  if(invalid){
    msg.textContent = "Completá el nombre de cada categoría.";
    msg.className = "msg err";
    return;
  }
  const modo = $("cfgModo").value;
  const ingreso = Number($("cfgIngreso").value) || 0;
  const ingresoMensual = Number($("cfgIngresoMensual").value) || 0;
  const dia1 = Number($("cfgDia1").value) || 10;
  const dia2 = Number($("cfgDia2").value) || 24;
  const btn = $("btnSaveConfig");
  btn.disabled = true;
  btn.textContent = "Guardando…";
  try{
    await postJson(url, { action:"guardarConfig", modo, ingreso, ingresoMensual, dia1, dia2, categorias: cats });
    closeSettings();
    loadSettingsData();
    loadSummary();
    showToast("Configuración guardada");
  }catch(err){
    msg.textContent = err.message || "No se pudo guardar. Revisá tu conexión.";
    msg.className = "msg err";
  }finally{
    btn.disabled = false;
    btn.textContent = "Guardar configuración";
  }
}

function renderFijosList(fijos){
  const body = $("cfgFijos");
  body.innerHTML = "";
  if(!fijos.length){
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML = `<div>No hay gastos fijos</div><div class="empty-hint">Agregá el primero acá abajo</div>`;
    body.appendChild(empty);
    return;
  }
  fijos.forEach(f => {
    const div = document.createElement("div");
    div.className = "cfg-fijo-row";
    const estado = f.activo ? "" : `<span class="pill off">Inactivo</span>`;
    div.innerHTML = `
      <div class="cfg-fijo-info">
        <span class="cfg-fijo-name">${f.nombre} ${estado}</span>
        <span class="cfg-fijo-meta">${f.categoria || "sin categoría"} · día ${f.dia} · ${fmt(f.monto)}</span>
      </div>
      <div class="cfg-fijo-actions">
        <label class="switch" title="Activo">
          <input type="checkbox" class="cfg-fijo-activo" data-fila="${f.rowIndex}" ${f.activo ? "checked" : ""}>
          <span></span>
        </label>
        <button type="button" class="btn-icon" data-fijo-edit="${f.rowIndex}" aria-label="Editar">✎</button>
        <button type="button" class="btn-icon danger" data-fijo-del="${f.rowIndex}" aria-label="Borrar">✕</button>
      </div>
    `;
    body.appendChild(div);
  });
}

async function toggleFijoActivo(fila, activo){
  const url = getScriptUrl();
  if(!url) return;
  const f = fijosCfg.find(x => x.rowIndex === fila);
  if(!f) return;
  try{
    await postJson(url, {
      action: "editarFijo",
      fila: fila,
      nombre: f.nombre,
      monto: f.monto,
      categoria: f.categoria,
      dia: f.dia,
      activo: activo
    });
    f.activo = activo;
    loadSummary();
  }catch(err){
    renderFijosList(fijosCfg);
  }
}

function openFijoForm(fila){
  editingFijoFila = fila || null;
  const f = fila ? fijosCfg.find(x => x.rowIndex === fila) : null;
  $("fijoTitle").textContent = f ? "Editar gasto fijo" : "Agregar gasto fijo";
  $("fijoNombre").value = f ? f.nombre : "";
  $("fijoMonto").value = f ? f.monto : "";
  $("fijoDia").value = f ? f.dia : 1;
  $("fijoActivo").checked = f ? f.activo : true;
  fijoCat = f ? f.categoria : null;
  markChip($("fijoCatChips"), fijoCat);
  $("fijoMsg").textContent = "";
  $("fijoMsg").className = "msg";
  $("fijoOverlay").classList.add("show");
}

async function saveFijo(){
  const url = getScriptUrl();
  const msg = $("fijoMsg");
  msg.textContent = "";
  msg.className = "msg";
  if(!url){
    msg.textContent = "Primero conectá tu Google Sheet.";
    msg.className = "msg err";
    return;
  }
  const nombre = $("fijoNombre").value.trim();
  const monto = parseFloat($("fijoMonto").value);
  const dia = Number($("fijoDia").value) || 1;
  if(!nombre){
    msg.textContent = "Ingresá un nombre.";
    msg.className = "msg err";
    return;
  }
  if(!monto || monto <= 0){
    msg.textContent = "Ingresá un monto válido.";
    msg.className = "msg err";
    return;
  }
  const payload = {
    action: editingFijoFila ? "editarFijo" : "agregarFijo",
    nombre: nombre,
    monto: monto,
    dia: dia,
    categoria: fijoCat || "",
    activo: $("fijoActivo").checked
  };
  if(editingFijoFila) payload.fila = editingFijoFila;
  const btn = $("btnSaveFijo");
  btn.disabled = true;
  btn.textContent = "Guardando…";
  try{
    await postJson(url, payload);
    $("fijoOverlay").classList.remove("show");
    loadSettingsData();
    loadSummary();
    showToast(editingFijoFila ? "Gasto fijo actualizado" : "Gasto fijo agregado");
  }catch(err){
    msg.textContent = err.message || "No se pudo guardar. Revisá tu conexión.";
    msg.className = "msg err";
  }finally{
    btn.disabled = false;
    btn.textContent = "Guardar";
  }
}

async function borrarFijo(fila){
  const url = getScriptUrl();
  if(!url) return;
  try{
    await postJson(url, { action: "borrarFijo", fila: fila });
    loadSettingsData();
    loadSummary();
    showToast("Gasto fijo borrado");
  }catch(err){
    $("cfgFijosMsg").textContent = err.message || "No se pudo borrar.";
    $("cfgFijosMsg").className = "msg err";
  }
}

/* ---------------- Ingresos manuales ---------------- */

function renderIngresos(list){
  const body = $("ingresosBody");
  body.innerHTML = "";
  if(!list.length){
    body.innerHTML = `<div class="empty"><div>Sin ingresos este mes</div><div class="empty-hint">Cada vez que cobres, anotá tu ingreso.</div></div>`;
    return;
  }
  list.forEach(en => {
    const div = document.createElement("div");
    div.className = "entry";
    div.innerHTML = `
      <div class="entry-left">
        <span class="entry-cat">Ingreso</span>
        <span class="entry-meta">${en.fecha}${en.nota ? " · " + en.nota : ""}</span>
      </div>
      <div class="entry-right">
        <span class="entry-amt pos">${fmt(en.monto)}</span>
        <button type="button" class="btn-icon danger" data-ingreso-del="${en.fila}" aria-label="Borrar">✕</button>
      </div>
    `;
    body.appendChild(div);
  });
}

function openIngresoForm(){
  $("ingresoMonto").value = "";
  $("ingresoFecha").value = todayISO();
  $("ingresoNota").value = "";
  $("ingresoMsg").textContent = "";
  $("ingresoMsg").className = "msg";
  $("ingresoOverlay").classList.add("show");
}

async function saveIngreso(){
  const url = getScriptUrl();
  const msg = $("ingresoMsg");
  msg.textContent = "";
  msg.className = "msg";
  if(!url){
    msg.textContent = "Primero conectá tu Google Sheet.";
    msg.className = "msg err";
    return;
  }
  const monto = parseFloat($("ingresoMonto").value);
  if(!monto || monto <= 0){
    msg.textContent = "Ingresá un monto válido.";
    msg.className = "msg err";
    return;
  }
  const btn = $("btnSaveIngreso");
  btn.disabled = true;
  btn.textContent = "Guardando…";
  try{
    await postJson(url, {
      action: "agregarIngreso",
      monto: monto,
      fecha: $("ingresoFecha").value || todayISO(),
      nota: $("ingresoNota").value || ""
    });
    $("ingresoOverlay").classList.remove("show");
    loadSummary();
    showToast("Ingreso anotado · " + fmt(monto));
    haptic();
  }catch(err){
    msg.textContent = err.message || "No se pudo guardar. Revisá tu conexión.";
    msg.className = "msg err";
  }finally{
    btn.disabled = false;
    btn.textContent = "Guardar";
  }
}

async function borrarIngreso(fila){
  const url = getScriptUrl();
  if(!url) return;
  try{
    await postJson(url, { action: "borrarIngreso", fila: fila });
    loadSummary();
    showToast("Ingreso borrado");
  }catch(err){
    showToast(err.message || "No se pudo borrar", false);
  }
}

rebuildChips();
$("fecha").value = todayISO();

$("btnSettings").addEventListener("click", openSettings);
$("btnCloseSettings").addEventListener("click", closeSettings);
$("cfgCurrency").addEventListener("change", (ev) => {
  localStorage.setItem(LS_CURRENCY_KEY, ev.target.value);
  loadSummary();
  showToast(ev.target.value === "US" ? "Moneda: US$" : "Moneda: RD$");
});
$("btnSaveUrl").addEventListener("click", () => {
  localStorage.setItem(LS_URL_KEY, $("scriptUrl").value.trim());
  closeSettings();
  loadSummary();
});
$("btnAddCat").addEventListener("click", () => {
  if($("cfgCats").children.length >= 8){
    $("cfgMsg").textContent = "Máximo 8 categorías.";
    $("cfgMsg").className = "msg err";
    return;
  }
  addCatRow();
  $("cfgMsg").textContent = "";
  $("cfgMsg").className = "msg";
});
$("btnSaveConfig").addEventListener("click", saveConfig);
$("cfgModo").addEventListener("change", (ev) => setModoUI(ev.target.value));
$("btnAddFijo").addEventListener("click", () => openFijoForm());
$("btnSaveFijo").addEventListener("click", saveFijo);
$("btnCloseFijo").addEventListener("click", () => $("fijoOverlay").classList.remove("show"));
$("btnSubmit").addEventListener("click", submitGasto);
$("btnSaveEdit").addEventListener("click", saveEdit);
$("btnCloseEdit").addEventListener("click", closeEdit);
$("btnConfirmDelete").addEventListener("click", confirmDelete);
$("btnCancelDelete").addEventListener("click", closeDelete);
$("btnAddIngreso").addEventListener("click", openIngresoForm);
$("btnSaveIngreso").addEventListener("click", saveIngreso);
$("btnCloseIngreso").addEventListener("click", () => $("ingresoOverlay").classList.remove("show"));

$("ingresosBody").addEventListener("click", (ev) => {
  const del = ev.target.closest("[data-ingreso-del]");
  if(del) borrarIngreso(Number(del.dataset.ingresoDel));
});

$("cfgCats").addEventListener("click", (ev) => {
  const del = ev.target.closest(".cfg-del");
  if(!del) return;
  del.closest(".cfg-cat-row").remove();
  updateCatRemoveButtons();
  $("cfgMsg").textContent = "";
  $("cfgMsg").className = "msg";
});

$("cfgFijos").addEventListener("click", (ev) => {
  const del = ev.target.closest("[data-fijo-del]");
  if(del) return borrarFijo(Number(del.dataset.fijoDel));
  const edit = ev.target.closest("[data-fijo-edit]");
  if(edit) return openFijoForm(Number(edit.dataset.fijoEdit));
});

$("cfgFijos").addEventListener("change", (ev) => {
  const t = ev.target.closest(".cfg-fijo-activo");
  if(t) toggleFijoActivo(Number(t.dataset.fila), t.checked);
});

$("entriesBody").addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-action]");
  if(!btn) return;
  const fila = Number(btn.dataset.fila);
  const entry = recientes.find(e => e.fila === fila);
  if(!entry) return;
  if(btn.dataset.action === "editar") openEdit(fila, entry);
  else if(btn.dataset.action === "borrar") askDelete(fila, entry);
});

loadSummary();
