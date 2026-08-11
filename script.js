const CATEGORIAS = ["Comida","Transporte","Vivienda","Educación","Salud","Ropa","Suscripciones","Ahorro","Otros"];
const MEDIOS = ["Efectivo","Débito","Crédito","Transferencia"];
const LS_URL_KEY = "gastos_script_url";

let selectedCat = null;
let selectedMed = null;

const $ = (id) => document.getElementById(id);

let pendingPop = false;
let toastTimer = null;

function showToast(text){
  const t = $("toast");
  t.innerHTML = '<div class="toast-inner"><span class="tick">✓</span>' + text + "</div>";
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
}

function haptic(){
  try{
    if(navigator.vibrate) navigator.vibrate([30,40,30]);
  }catch(e){}
}

function fmt(n){
  const v = Number(n) || 0;
  return "RD$ " + v.toLocaleString("es-DO", {maximumFractionDigits:0});
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

function getScriptUrl(){
  return localStorage.getItem(LS_URL_KEY) || "";
}

function openSettings(){
  $("scriptUrl").value = getScriptUrl();
  $("settingsOverlay").classList.add("show");
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

  if(data.categorias && data.categorias.length){
    $("catCard").style.display = "block";
    const body = $("catBody");
    body.innerHTML = "";
    data.categorias.forEach(c => {
      const div = document.createElement("div");
      div.className = "catbar";
      const pctCat = c.presupuesto > 0 ? Math.min(100, Math.round((c.gastado / c.presupuesto)*100)) : 0;
      const over = c.presupuesto > 0 && c.gastado > c.presupuesto;
      div.innerHTML = `
        <div class="catbar-top">
          <span class="catbar-name">${c.nombre}</span>
          <span class="catbar-nums">${fmt(c.gastado)} / ${fmt(c.presupuesto)}</span>
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
    const body = $("entriesBody");
    body.innerHTML = "";
    data.recientes.slice().reverse().forEach(e => {
      const div = document.createElement("div");
      div.className = "entry";
      div.innerHTML = `
        <div class="entry-left">
          <span class="entry-cat">${e.categoria}</span>
          <span class="entry-meta">${e.fecha}${e.nota ? " · " + e.nota : ""}</span>
        </div>
        <span class="entry-amt">${fmt(e.monto)}</span>
      `;
      body.appendChild(div);
    });
  }
}

async function registrarFijo(nombre, btn){
  const url = getScriptUrl();
  if(!url) return;
  btn.disabled = true;
  btn.textContent = "Guardando…";
  try{
    await fetch(url, {
      method: "POST",
      headers: {"Content-Type":"text/plain;charset=utf-8"},
      body: JSON.stringify({action:"registrarFijo", nombre: nombre})
    });
    loadSummary();
  }catch(err){
    btn.disabled = false;
    btn.textContent = "Reintentar";
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
    await fetch(url, {
      method: "POST",
      headers: {"Content-Type":"text/plain;charset=utf-8"},
      body: JSON.stringify(payload)
    });
    showToast(" Gasto anotado · " + fmt(monto));
    haptic();
    pendingPop = true;
    $("monto").value = "";
    $("nota").value = "";
    $("fecha").value = todayISO();
    loadSummary();
  }catch(err){
    msg.textContent = "No se pudo guardar. Revisá tu conexión.";
    msg.classList.add("err");
  }finally{
    btn.disabled = false;
    btn.textContent = "Anotar gasto";
  }
}

buildChips($("catChips"), CATEGORIAS, (v)=>selectedCat=v);
buildChips($("medChips"), MEDIOS, (v)=>selectedMed=v);
$("fecha").value = todayISO();

$("btnSettings").addEventListener("click", openSettings);
$("btnCloseSettings").addEventListener("click", closeSettings);
$("btnSaveUrl").addEventListener("click", () => {
  localStorage.setItem(LS_URL_KEY, $("scriptUrl").value.trim());
  closeSettings();
  loadSummary();
});
$("btnSubmit").addEventListener("click", submitGasto);

loadSummary();
