# Gestor de gastos — web + Google Sheet

App web para anotar gastos desde el celular. Cada gasto se guarda directo en
tu Google Sheet, en la pestaña "Gastos". La web es estática (HTML puro), la
subís a GitHub Pages gratis, y el "servidor" es un Google Apps Script gratis.

## Paso 1 — Preparar el Google Sheet

1. Subí el archivo `gestor_gastos.xlsx` (el que armamos antes) a Google Drive.
2. Abrilo con Google Sheets (clic derecho > Abrir con > Google Sheets).
   Debe quedar con las pestañas **Config** y **Gastos**.
3. En **Config**, completá tu ingreso quincenal fijo (celda B4) y, si
   querés, un presupuesto por categoría.

## Paso 2 — Conectar el backend (Google Apps Script)

1. Con el Sheet abierto: **Extensiones > Apps Script**.
2. Borrá lo que haya en `Code.gs` y pegá el contenido del archivo
   `Code.gs` de esta carpeta.
3. Arriba a la derecha: **Implementar > Nueva implementación**.
4. Tipo: **Aplicación web**.
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
5. Autorizá los permisos (te va a pedir confirmar que es tu propio script).
6. Copiá la URL que te da, termina en `/exec`. La vas a necesitar en el paso 4.

> Cada vez que edites `Code.gs`, tenés que hacer **Implementar > Administrar
> implementaciones > Editar (lápiz) > Nueva versión** para que los cambios
> se reflejen en la URL.

## Paso 3 — Subir la web a GitHub Pages

1. Creá un repositorio nuevo en GitHub (puede ser público o privado).
2. Subí el archivo `index.html` de esta carpeta a la raíz del repo.
3. En el repo: **Settings > Pages**.
4. En "Source" elegí la rama `main` y carpeta `/ (root)`, guardá.
5. GitHub te da una URL tipo `https://tu-usuario.github.io/tu-repo/`.
   Esa es tu app.

## Paso 4 — Conectar la web con tu Sheet

1. Abrí la URL de GitHub Pages desde tu celular.
2. Tocá el ícono ⚙ arriba a la derecha.
3. Pegá la URL de Apps Script del paso 2 (la que termina en `/exec`).
4. Guardar. Ya podés anotar gastos.
5. En iPhone: Safari > compartir > "Agregar a pantalla de inicio", para
   que quede como una app. En Android: Chrome > menú > "Instalar app".

## Paso 5 — Gastos fijos mensuales (opcional)

1. En tu Google Sheet, creá una pestaña nueva llamada exactamente `Fijos`.
2. Ponele estos encabezados en la fila 1: `Nombre | Monto | Categoría | Día de cobro | Activo | Último período`.
3. Cargá una fila por cada gasto fijo (alquiler, streaming, gimnasio...).
   Dejá "Último período" vacío, lo completa el script solo.
4. Volvé a **Extensiones > Apps Script**, reemplazá todo el contenido de
   `Code.gs` por la versión nueva de este mismo archivo.
5. **Implementar > Administrar implementaciones > lápiz > Nueva versión**,
   para que la URL /exec use el código actualizado.
6. Para que se registren solos en la fecha: en Apps Script, ícono del
   reloj (Activadores, en el menú izquierdo) > **Añadir activador** >
   función `registrarFijosAutomaticos` > tipo de activador basado en tiempo
   > temporizador diario > guardar.

Con esto, cada gasto fijo activo se anota solo en "Gastos" apenas llega o
pasa su día de cobro, una sola vez por mes. Si necesitás anotarlo antes de
esa fecha (por ejemplo, pagaste el alquiler adelantado), desde la web vas
a ver un botón "Registrar ahora" junto a ese gasto fijo.

## Notas

- La URL de Apps Script queda guardada solo en tu celular (localStorage),
  nadie más la ve a menos que la compartas.
- Si algún día cambiás de Sheet, solo tenés que republicar el Apps Script
  apuntando al nuevo archivo y actualizar la URL en el ⚙ de la web.
- Los presupuestos y el ingreso los editás siempre desde **Config** en el
  Sheet, no desde la web.
