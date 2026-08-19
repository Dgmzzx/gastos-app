/**
 * GESTOR DE GASTOS — backend en Google Apps Script
 *
 * Instalación:
 * 1. Abrí tu Google Sheet (pestañas "Config", "Gastos" y "Fijos").
 * 2. Extensiones > Apps Script.
 * 3. Borrá el contenido de Code.gs y pegá TODO este archivo.
 * 4. Implementar > Nueva implementación > tipo "Aplicación web".
 *      - Ejecutar como: Yo (tu cuenta)
 *      - Quién tiene acceso: Cualquier usuario
 * 5. Copiá la URL que termina en /exec y pegala en la app web (ícono ⚙).
 * 6. Para que los gastos fijos se registren solos: en el editor de Apps
 *    Script, ícono del reloj (Activadores) > Añadir activador >
 *    función "registrarFijosAutomaticos" > Basado en tiempo >
 *    Temporizador diario > guardar.
 */

const SHEET_GASTOS = "Gastos";
const SHEET_CONFIG = "Config";
const SHEET_FIJOS = "Fijos";

const CAT_START_ROW = 11; // fila donde empieza la tabla de categorías en Config
const CAT_MAX = 8;        // máximo de categorías (hasta la fila del total)
const CAT_TOTAL_ROW = 19; // fila del "Total presupuestado" en Config

const MESES_ES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

function doGet(e) {
  const action = (e.parameter.action || "resumen");
  if (action === "resumen") {
    return jsonResponse(buildResumen());
  }
  if (action === "configWeb") {
    return jsonResponse(buildConfigWeb());
  }
  return jsonResponse({ error: "acción desconocida" });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === "registrarFijo") {
      registrarFijoManual_(body.nombre);
      return jsonResponse({ ok: true });
    }
    if (body.action === "borrarGasto") {
      const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_GASTOS);
      const fila = Number(body.fila);
      if (!fila || fila < 5) throw new Error("fila inválida");
      sh.deleteRow(fila);
      return jsonResponse({ ok: true });
    }
    if (body.action === "editarGasto") {
      editarGasto_(body);
      return jsonResponse({ ok: true });
    }
    if (body.action === "guardarConfig") {
      guardarConfig_(body);
      return jsonResponse({ ok: true });
    }
    if (body.action === "agregarFijo") {
      agregarFijo_(body);
      return jsonResponse({ ok: true });
    }
    if (body.action === "editarFijo") {
      editarFijo_(body);
      return jsonResponse({ ok: true });
    }
    if (body.action === "borrarFijo") {
      borrarFijo_(body);
      return jsonResponse({ ok: true });
    }
    appendGasto(body);
    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getConfig_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_CONFIG);
  const ingreso = sh.getRange("B4").getValue();
  const ingresoMensual = sh.getRange("B5").getValue();
  const dia1 = sh.getRange("B6").getValue();
  const dia2 = sh.getRange("D6").getValue();
  const modo = String(sh.getRange("B8").getValue() || "").trim().toLowerCase();
  return {
    ingreso: Number(ingreso) || 0,
    ingresoMensual: Number(ingresoMensual) || 0,
    dia1: Number(dia1) || 10,
    dia2: Number(dia2) || 24,
    modo: modo === "mensual" ? "mensual" : "quincenal",
    categorias: readCategorias_(sh)
  };
}

function readCategorias_(sh) {
  const cats = [];
  const range = sh.getRange(CAT_START_ROW, 1, CAT_MAX, 2).getValues();
  range.forEach(r => {
    if (r[0]) cats.push({ nombre: r[0], presupuesto: Number(r[1]) || 0 });
  });
  return cats;
}

function periodBounds_(today, cfg) {
  const year = today.getFullYear();
  const month = today.getMonth();
  let start, end, label;
  if (cfg.modo === "mensual") {
    start = new Date(year, month, 1);
    end = new Date(year, month + 1, 0);
    label = currentMonthKey_(today);
    return { start, end, label };
  }
  const day = today.getDate();
  const dia1 = cfg.dia1;
  const dia2 = cfg.dia2;
  if (day < dia1) {
    start = new Date(year, month - 1, dia2);
    end = new Date(year, month, dia1 - 1);
    label = labelFor_(start, "B");
  } else if (day < dia2) {
    start = new Date(year, month, dia1);
    end = new Date(year, month, dia2 - 1);
    label = labelFor_(start, "A");
  } else {
    start = new Date(year, month, dia2);
    end = new Date(year, month + 1, dia1 - 1);
    label = labelFor_(start, "B");
  }
  return { start, end, label };
}

function labelFor_(d, suffix) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return y + "-" + m + "-" + suffix;
}

function periodLabelForDate_(d, cfg) {
  const year = d.getFullYear();
  const month = d.getMonth();
  if (cfg.modo === "mensual") {
    return currentMonthKey_(d);
  }
  const day = d.getDate();
  const dia1 = cfg.dia1;
  const dia2 = cfg.dia2;
  if (day < dia1) {
    return labelFor_(new Date(year, month - 1, 1), "B");
  } else if (day < dia2) {
    return labelFor_(new Date(year, month, 1), "A");
  } else {
    return labelFor_(new Date(year, month, 1), "B");
  }
}

function prevPeriodLabel_(label) {
  const mm = label.match(/^(\d{4})-(\d{2})$/);
  if (mm) {
    const d = new Date(Number(mm[1]), Number(mm[2]) - 2, 1);
    return d.getFullYear() + "-" + pad2_(d.getMonth() + 1);
  }
  const m = label.match(/^(\d{4})-(\d{2})-([AB])$/);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (m[3] === "B") return y + "-" + pad2_(mo) + "-A";
  const d = new Date(y, mo - 2, 1);
  return d.getFullYear() + "-" + pad2_(d.getMonth() + 1) + "-B";
}

function pad2_(n) {
  return String(n).padStart(2, "0");
}

function currentMonthKey_(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

/* ---------------- Fijos ---------------- */

function getFijos_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_FIJOS);
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const data = sh.getRange(2, 1, lastRow - 1, 6).getValues();
  const out = [];
  data.forEach((row, i) => {
    const [nombre, monto, categoria, dia, activo, ultimoPeriodo] = row;
    if (!nombre) return;
    out.push({
      rowIndex: i + 2,
      nombre: nombre,
      monto: Number(monto) || 0,
      categoria: categoria,
      dia: Number(dia) || 1,
      activo: activo === true || activo === "TRUE",
      ultimoPeriodo: ultimoPeriodo || ""
    });
  });
  return out;
}

function registrarFijosAutomaticos() {
  const today = new Date();
  const mk = currentMonthKey_(today);
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_FIJOS);
  getFijos_().forEach(f => {
    if (!f.activo) return;
    if (f.ultimoPeriodo === mk) return; // ya se registró este mes
    if (today.getDate() >= f.dia) {
      registrarFijoGasto_(f);
      sh.getRange(f.rowIndex, 6).setValue(mk);
    }
  });
}

function registrarFijoManual_(nombre) {
  const fijos = getFijos_();
  const f = fijos.find(x => x.nombre === nombre);
  if (!f) throw new Error("gasto fijo no encontrado: " + nombre);
  registrarFijoGasto_(f);
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_FIJOS);
  sh.getRange(f.rowIndex, 6).setValue(currentMonthKey_(new Date()));
}

function registrarFijoGasto_(f) {
  const cfg = getConfig_();
  const fecha = new Date();
  const periodo = periodLabelForDate_(fecha, cfg);
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_GASTOS);
  const lastRow = Math.max(sh.getLastRow(), 4) + 1;
  sh.getRange(lastRow, 1, 1, 7).setValues([[
    new Date(), fecha, f.monto, f.categoria, "Fijo", "Fijo: " + f.nombre, periodo
  ]]);
}

/* ---------------- Resumen ---------------- */

function buildResumen() {
  const cfg = getConfig_();
  const tz = Session.getScriptTimeZone();
  const today = new Date();
  const bounds = periodBounds_(today, cfg);
  const prevLabel = prevPeriodLabel_(bounds.label);
  const mk = currentMonthKey_(today);
  const ingreso = cfg.modo === "mensual" ? cfg.ingresoMensual : cfg.ingreso;

  const diasTotales = Math.round((bounds.end - bounds.start) / 86400000) + 1;
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let diasTranscurridos = Math.round((todayMid - bounds.start) / 86400000) + 1;
  diasTranscurridos = Math.max(1, Math.min(diasTotales, diasTranscurridos));
  const diasRestantes = diasTotales - diasTranscurridos;

  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_GASTOS);
  const lastRow = sh.getLastRow();
  let gastado = 0;
  let prevGastado = 0;
  const porCategoria = {};
  const prevPorCategoria = {};
  cfg.categorias.forEach(c => { porCategoria[c.nombre] = 0; prevPorCategoria[c.nombre] = 0; });
  const recientes = [];

  if (lastRow >= 5) {
    const data = sh.getRange(5, 1, lastRow - 4, 6).getValues(); // A:F
    data.forEach((row, i) => {
      const fecha = row[1];
      const monto = Number(row[2]) || 0;
      const categoria = row[3];
      const nota = row[5];
      if (!(fecha instanceof Date) || !monto) return;
      const label = periodLabelForDate_(fecha, cfg);
      if (label === bounds.label) {
        gastado += monto;
        if (porCategoria.hasOwnProperty(categoria)) porCategoria[categoria] += monto;
      } else if (label === prevLabel) {
        prevGastado += monto;
        if (prevPorCategoria.hasOwnProperty(categoria)) prevPorCategoria[categoria] += monto;
      }
      recientes.push({
        fila: i + 5,
        fecha: Utilities.formatDate(fecha, tz, "dd/MM"),
        fechaISO: Utilities.formatDate(fecha, tz, "yyyy-MM-dd"),
        monto: monto,
        categoria: categoria,
        medio: row[4],
        nota: nota
      });
    });
  }

  const categorias = cfg.categorias.map(c => ({
    nombre: c.nombre,
    presupuesto: c.presupuesto,
    gastado: porCategoria[c.nombre] || 0,
    prev: prevPorCategoria[c.nombre] || 0
  }));

  const deltaGastado = gastado - prevGastado;
  const pctCambio = prevGastado > 0 ? Math.round((deltaGastado / prevGastado) * 100) : null;

  const fijos = getFijos_()
    .filter(f => f.activo)
    .map(f => ({
      nombre: f.nombre,
      monto: f.monto,
      categoria: f.categoria,
      dia: f.dia,
      pagado: f.ultimoPeriodo === mk
    }));

  return {
    periodoLabel: cfg.modo === "mensual"
      ? "Mes de " + MESES_ES[today.getMonth()] + " " + today.getFullYear()
      : "Quincena " + cfg.dia1 + "–" + cfg.dia2,
    rangoTexto: Utilities.formatDate(bounds.start, tz, "dd MMM") + " – " + Utilities.formatDate(bounds.end, tz, "dd MMM"),
    ingreso: ingreso,
    gastado: gastado,
    prevGastado: prevGastado,
    deltaGastado: deltaGastado,
    pctCambio: pctCambio,
    balance: ingreso - gastado,
    diasTotales: diasTotales,
    diasTranscurridos: diasTranscurridos,
    diasRestantes: diasRestantes,
    categorias: categorias,
    fijos: fijos,
    recientes: recientes.slice(-15)
  };
}

function editarGasto_(body) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_GASTOS);
  const fila = Number(body.fila);
  if (!fila || fila < 5) throw new Error("fila inválida");
  const cfg = getConfig_();
  const fecha = new Date(body.fecha + "T00:00:00");
  const monto = Number(body.monto) || 0;
  if (!monto) throw new Error("monto inválido");
  const categoria = body.categoria || "";
  const medio = body.medio || "";
  const nota = body.nota || "";
  const periodo = periodLabelForDate_(fecha, cfg);
  sh.getRange(fila, 2, 1, 6).setValues([[
    fecha, monto, categoria, medio, nota, periodo
  ]]);
}

function appendGasto(body) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_GASTOS);
  const cfg = getConfig_();
  const fecha = new Date(body.fecha + "T00:00:00");
  const monto = Number(body.monto) || 0;
  const categoria = body.categoria || "";
  const medio = body.medio || "";
  const nota = body.nota || "";
  const periodo = periodLabelForDate_(fecha, cfg);

  const lastRow = Math.max(sh.getLastRow(), 4) + 1;
  sh.getRange(lastRow, 1, 1, 7).setValues([[
    new Date(), fecha, monto, categoria, medio, nota, periodo
  ]]);
}

/* ---------------- Gestión desde la web ---------------- */

function buildConfigWeb() {
  const cfg = getConfig_();
  return {
    modo: cfg.modo,
    ingreso: cfg.ingreso,
    ingresoMensual: cfg.ingresoMensual,
    dia1: cfg.dia1,
    dia2: cfg.dia2,
    categorias: cfg.categorias,
    fijos: getFijos_()
  };
}

function guardarConfig_(body) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_CONFIG);
  const ingreso = Number(body.ingreso) || 0;
  const ingresoMensual = Number(body.ingresoMensual) || 0;
  const dia1 = Number(body.dia1) || 10;
  const dia2 = Number(body.dia2) || 24;
  const modo = body.modo === "mensual" ? "mensual" : "quincenal";
  const cats = (body.categorias || [])
    .map(c => ({ nombre: String(c.nombre || "").trim(), presupuesto: Number(c.presupuesto) || 0 }))
    .filter(c => c.nombre);
  if (cats.length > CAT_MAX) throw new Error("máximo " + CAT_MAX + " categorías");
  if (new Set(cats.map(c => c.nombre)).size !== cats.length) throw new Error("categorías repetidas");

  sh.getRange("B4").setValue(ingreso);
  sh.getRange("B5").setValue(ingresoMensual);
  sh.getRange("B6").setValue(dia1);
  sh.getRange("D6").setValue(dia2);
  sh.getRange("B8").setValue(modo);

  sh.getRange(CAT_START_ROW, 1, CAT_MAX, 2).clearContent();
  if (cats.length) {
    sh.getRange(CAT_START_ROW, 1, cats.length, 2).setValues(cats.map(c => [c.nombre, c.presupuesto]));
    sh.getRange(CAT_TOTAL_ROW, 2).setFormula("=SUM(B" + CAT_START_ROW + ":B" + (CAT_START_ROW + cats.length - 1) + ")");
  } else {
    sh.getRange(CAT_TOTAL_ROW, 2).clearContent();
  }
}

function ensureFijosSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_FIJOS);
  if (sh) return sh;
  sh = ss.insertSheet(SHEET_FIJOS);
  sh.appendRow(["Nombre", "Monto", "Categoría", "Día de cobro", "Activo", "Último período"]);
  return sh;
}

function agregarFijo_(body) {
  const nombre = String(body.nombre || "").trim();
  const monto = Number(body.monto) || 0;
  const categoria = String(body.categoria || "").trim();
  const dia = Number(body.dia) || 1;
  const activo = body.activo === undefined ? true : (body.activo === true || body.activo === "true");
  if (!nombre) throw new Error("nombre inválido");
  if (!monto || monto <= 0) throw new Error("monto inválido");
  ensureFijosSheet_().appendRow([nombre, monto, categoria, dia, activo, ""]);
}

function editarFijo_(body) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_FIJOS);
  if (!sh) throw new Error("no hay gastos fijos");
  const fila = Number(body.fila);
  if (!fila || fila < 2) throw new Error("fila inválida");
  const nombre = String(body.nombre || "").trim();
  const monto = Number(body.monto) || 0;
  const categoria = String(body.categoria || "").trim();
  const dia = Number(body.dia) || 1;
  const activo = body.activo === true || body.activo === "true";
  if (!nombre) throw new Error("nombre inválido");
  if (!monto || monto <= 0) throw new Error("monto inválido");
  sh.getRange(fila, 1, 1, 5).setValues([[nombre, monto, categoria, dia, activo]]);
}

function borrarFijo_(body) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_FIJOS);
  if (!sh) throw new Error("no hay gastos fijos");
  const fila = Number(body.fila);
  if (!fila || fila < 2) throw new Error("fila inválida");
  sh.deleteRow(fila);
}
