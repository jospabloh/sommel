// Sommel: prepare a USB receipt printer on Windows (one time per PC).
//
// Windows binds every USB printer to its own usbprint.sys driver as soon as it
// is plugged in, and Chrome can only open WinUSB devices over WebUSB. This tool
// finds the USB printers on usbprint and switches them to the WinUSB driver
// that ships with Windows 8 and later, so Sommel can print straight from the
// browser. It uses libwdi (the library behind Zadig), patched to need no
// Microsoft redistributables: see libwdi-inbox-winusb.patch and build.sh.
//
// After this, Windows no longer lists the printer as a printer. To undo it:
// Device Manager > the printer > Uninstall device (tick "delete the driver"),
// then unplug and plug it back in.
//
// Every message here is read by someone at a bar's cash register, so it says
// what happened and what to do next, in Spanish.

#include <windows.h>
#include <stdio.h>
#include <string.h>
#include "libwdi.h"

#define TITLE L"Sommel: preparar impresora"
#define INF_NAME "sommel_impresora.inf"
#define MAX_PRINTERS 8

static int is_printer(const struct wdi_device_info *d)
{
	if (d->driver != NULL && _stricmp(d->driver, "usbprint") == 0)
		return 1;
	// USB printer class (07), in case another printer driver holds it.
	if (d->compatible_id != NULL && strstr(d->compatible_id, "Class_07") != NULL)
		return 1;
	return 0;
}

static int is_winusb(const struct wdi_device_info *d)
{
	return d->driver != NULL && _stricmp(d->driver, "WinUSB") == 0;
}

static void say(UINT icon, const wchar_t *text)
{
	MessageBoxW(NULL, text, TITLE, MB_OK | icon | MB_SETFOREGROUND);
}

static void to_wide(const char *src, wchar_t *dst, int cap)
{
	if (src == NULL || MultiByteToWideChar(CP_UTF8, 0, src, -1, dst, cap) == 0)
		wcsncpy(dst, L"Impresora USB", cap - 1);
	dst[cap - 1] = 0;
}

int WINAPI wWinMain(HINSTANCE inst, HINSTANCE prev, PWSTR cmd, int show)
{
	struct wdi_device_info *list = NULL, *d;
	struct wdi_device_info *todo[MAX_PRINTERS];
	struct wdi_options_create_list ocl = { 0 };
	struct wdi_options_prepare_driver opd = { 0 };
	struct wdi_options_install_driver oid = { 0 };
	char dir[MAX_PATH];
	wchar_t names[1024] = L"", name[256], msg[2048];
	int n = 0, already = 0, ok = 0, r, i;
	(void)inst; (void)prev; (void)cmd; (void)show;

	ocl.list_all = TRUE;
	ocl.trim_whitespaces = TRUE;
	r = wdi_create_list(&list, &ocl);
	if (r != WDI_SUCCESS && r != WDI_ERROR_NO_DEVICE) {
		swprintf(msg, 2048, L"No se pudo leer la lista de dispositivos USB (%hs).\n\n"
			L"Escribe a soporte@acaciaco.com.mx con este mensaje.", wdi_strerror(r));
		say(MB_ICONERROR, msg);
		return 1;
	}
	for (d = list; d != NULL; d = d->next) {
		if (is_winusb(d) && d->compatible_id != NULL && strstr(d->compatible_id, "Class_07") != NULL)
			already++;
		if (!is_printer(d) || is_winusb(d) || n >= MAX_PRINTERS)
			continue;
		todo[n++] = d;
		to_wide(d->desc, name, 256);
		wcsncat(names, L"\n   \x2022 ", 1023 - wcslen(names));
		wcsncat(names, name, 1023 - wcslen(names));
	}

	if (n == 0) {
		if (already > 0)
			say(MB_ICONINFORMATION, L"La impresora ya est\x00e1 lista para Sommel.\n\n"
				L"Vuelve a Sommel, entra a Impresi\x00f3n y pulsa \"Conectar impresora\".");
		else
			say(MB_ICONWARNING, L"No encontr\x00e9 una impresora de tickets conectada por USB.\n\n"
				L"Revisa que est\x00e9 encendida y conectada a esta computadora, y vuelve a abrir este programa.");
		wdi_destroy_list(list);
		return n == 0 && already > 0 ? 0 : 2;
	}

	swprintf(msg, 2048, L"Encontr\x00e9 esta impresora:%ls\n\n"
		L"Voy a prepararla para que Sommel imprima directo, sin cuadro de impresi\x00f3n. "
		L"Tarda menos de un minuto y solo se hace una vez en esta computadora.\n\n"
		L"Despu\x00e9s, Windows ya no la mostrar\x00e1 en su lista de impresoras: "
		L"solo Sommel imprimir\x00e1 en ella.\n\n\x00bfContinuar?", names);
	if (MessageBoxW(NULL, msg, TITLE, MB_YESNO | MB_ICONQUESTION | MB_SETFOREGROUND) != IDYES) {
		wdi_destroy_list(list);
		return 3;
	}

	if (GetTempPathA(MAX_PATH - 32, dir) == 0) strcpy(dir, "C:\\Windows\\Temp\\");
	strcat(dir, "sommel-impresora");
	opd.driver_type = WDI_WINUSB;
	opd.vendor_name = "Sommel";
	opd.cert_subject = "CN=Sommel impresora (generado en este equipo)";

	for (i = 0; i < n; i++) {
		d = todo[i];
		r = wdi_prepare_driver(d, dir, INF_NAME, &opd);
		if (r == WDI_SUCCESS)
			r = wdi_install_driver(d, dir, INF_NAME, &oid);
		if (r == WDI_SUCCESS) {
			ok++;
		} else {
			to_wide(d->desc, name, 256);
			swprintf(msg, 2048, L"No se pudo preparar \"%ls\": %hs.\n\n"
				L"Escribe a soporte@acaciaco.com.mx con este mensaje.", name, wdi_strerror(r));
			say(MB_ICONERROR, msg);
		}
	}
	wdi_destroy_list(list);

	if (ok == 0)
		return 4;
	say(MB_ICONINFORMATION, L"Listo, la impresora qued\x00f3 preparada.\n\n"
		L"1. Descon\x00e9ctala del USB y vuelve a conectarla.\n"
		L"2. En Sommel, entra a Impresi\x00f3n y pulsa \"Conectar impresora\".\n"
		L"3. Elige la impresora y pulsa \"Imprimir prueba\".");
	return 0;
}
