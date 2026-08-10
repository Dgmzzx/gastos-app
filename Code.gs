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
const CAT_COUNT = 8;      // cantidad de categorías listadas en Config

function doGet(e) {
  const action = (e.parameter.action || "resumen");
  if (action === "resumen") {
    return jsonResponse(buildResumen());
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
  const dia1 = sh.getRange("B6").getValue();
  const dia2 = sh.getRange("D6").getValue();
  const cats = [];
  const range = sh.getRange(CAT_START_ROW, 1, CAT_COUNT, 2).getValues();
  range.forEach(r => {
    if (r[0]) cats.push({ nombre: r[0], presupuesto: Number(r[1]) || 0 });
  });
  return { ingreso: Number(ingreso) || 0, dia1: Number(dia1) || 10, dia2: Number(dia2) || 24, categorias: cats };
}

function periodBounds_(today, dia1, dia2) {
  const day = today.getDate();
  const year = today.getFullYear();
  const month = today.getMonth();
  let start, end, label;
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

function periodLabelForDate_(d, dia1, dia2) {
  const day = d.getDate();
  const year = d.getFullYear();
  const month = d.getMonth();
  if (day < dia1) {
    return labelFor_(new Date(year, month - 1, 1), "B");
  } else if (day < dia2) {
    return labelFor_(new Date(year, month, 1), "A");
  } else {
    return labelFor_(new Date(year, month, 1), "B");
  }
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
  const periodo = periodLabelForDate_(fecha, cfg.dia1, cfg.dia2);
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
  const bounds = periodBounds_(today, cfg.dia1, cfg.dia2);
  const mk = currentMonthKey_(today);

  const diasTotales = Math.round((bounds.end - bounds.start) / 86400000) + 1;
  let diasTranscurridos = Math.round((today - bounds.start) / 86400000) + 1;
  diasTranscurridos = Math.max(1, Math.min(diasTotales, diasTranscurridos));
  const diasRestantes = diasTotales - diasTranscurridos;

  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_GASTOS);
  const lastRow = sh.getLastRow();
  let gastado = 0;
  const porCategoria = {};
  cfg.categorias.forEach(c => porCategoria[c.nombre] = 0);
  const recientes = [];

  if (lastRow >= 5) {
    const data = sh.getRange(5, 1, lastRow - 4, 6).getValues(); // A:F
    data.forEach(row => {
      const fecha = row[1];
      const monto = Number(row[2]) || 0;
      const categoria = row[3];
      const nota = row[5];
      if (!(fecha instanceof Date) || !monto) return;
      const label = periodLabelForDate_(fecha, cfg.dia1, cfg.dia2);
      if (label === bounds.label) {
        gastado += monto;
        if (porCategoria.hasOwnProperty(categoria)) porCategoria[categoria] += monto;
      }
      recientes.push({
        fecha: Utilities.formatDate(fecha, tz, "dd/MM"),
        monto: monto,
        categoria: categoria,
        nota: nota
      });
    });
  }

  const categorias = cfg.categorias.map(c => ({
    nombre: c.nombre,
    presupuesto: c.presupuesto,
    gastado: porCategoria[c.nombre] || 0
  }));

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
    periodoLabel: "Quincena " + cfg.dia1 + "–" + cfg.dia2,
    rangoTexto: Utilities.formatDate(bounds.start, tz, "dd MMM") + " – " + Utilities.formatDate(bounds.end, tz, "dd MMM"),
    ingreso: cfg.ingreso,
    gastado: gastado,
    balance: cfg.ingreso - gastado,
    diasTotales: diasTotales,
    diasTranscurridos: diasTranscurridos,
    diasRestantes: diasRestantes,
    categorias: categorias,
    fijos: fijos,
    recientes: recientes.slice(-15)
  };
}

function appendGasto(body) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_GASTOS);
  const cfg = getConfig_();
  const fecha = new Date(body.fecha + "T00:00:00");
  const monto = Number(body.monto) || 0;
  const categoria = body.categoria || "";
  const medio = body.medio || "";
  const nota = body.nota || "";
  const periodo = periodLabelForDate_(fecha, cfg.dia1, cfg.dia2);

  const lastRow = Math.max(sh.getLastRow(), 4) + 1;
  sh.getRange(lastRow, 1, 1, 7).setValues([[
    new Date(), fecha, monto, categoria, medio, nota, periodo
  ]]);
}
