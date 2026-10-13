# Preparar impresora (Windows)

`public/descargas/sommel-impresora.exe` cambia el controlador de las
impresoras USB de `usbprint.sys` a WinUSB, el que trae Windows 8 y posteriores,
para que Chrome pueda usarlas por WebUSB. Sommel lo ofrece desde Impresión
cuando detecta que Windows tiene tomada la impresora (`checkAccess` en
`src/components/printing/usbPrinter.js`).

- `sommel-impresora.c`: busca las impresoras USB en `usbprint`, pide
  confirmación, prepara un `.inf` firmado en el equipo y lo instala.
- `libwdi-inbox-winusb.patch`: libwdi (la librería de Zadig) sin los
  coinstaladores de Microsoft, que no hacen falta desde Windows 8.
- `build.sh`: compila todo en Linux con MinGW y deja el `.exe` en
  `public/descargas/`.

**Licencia.** libwdi es LGPL-3.0 (c) Pete Batard, <https://github.com/pbatard/libwdi>.
El `.exe` la enlaza estáticamente. Aquí están el parche, el código propio y el
script de compilación, así que cualquiera puede volver a generarlo con otra
versión de libwdi.

**Solo Windows x64.** Se compiló con `--disable-32bit`. Un Windows de 32 bits
no lo puede abrir.

**Sin firma de código.** Windows muestra "Windows protegió su PC" hasta que se
firme con un certificado de firma de código.

**Deshacer en un equipo:** Administrador de dispositivos, en la impresora,
"Desinstalar el dispositivo" con "Eliminar el controlador" marcado. Después se
desconecta y se vuelve a conectar.
