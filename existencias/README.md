# Comparador de existencias Shopify + IW

Web estática en HTML, CSS y JavaScript puro para cruzar:

- CSV de productos Shopify, una o varias partes.
- CSV de inventario Shopify.
- XLSX o CSV de existencias IW.

## Uso

1. Publica esta carpeta en GitHub Pages o abre la carpeta con un servidor local.
2. Carga los archivos de productos Shopify, inventario Shopify e IW.
3. Revisa el mapeo:
   - `Sucursal Chalchuapa` -> `ALMACEN`
   - `Sucursal Santa Ana Independencia` -> `ALMACEN SANTA ANA`
   - `Sucursal Santa Ana Zarzamora` -> `ALMACEN ZARZAMORA`
4. Ejecuta `Comparar y generar archivos`.
5. Descarga el CSV de Shopify y súbelo desde el importador de inventario.

Para probar localmente:

```powershell
py -3 -m http.server 8765
```

Luego abre `http://127.0.0.1:8765/index.html`.

## Reglas principales

- El CSV de inventario Shopify se conserva con sus mismas columnas.
- En formato Shopify `All states`, solo se llena `On hand (new)` para las tres sucursales mapeadas.
- Los UPC se comparan normalizados, quitando apostrofes, espacios, guiones y ceros iniciales para cubrir los casos donde IW perdió el cero inicial.
- Si no hay coincidencia segura, por defecto se deja `On hand (new)` vacío para evitar sobrescrituras accidentales.
- Las existencias negativas de IW se convierten a `0` por defecto porque Shopify requiere cantidades enteras para el importador.
- Cuando la página corre desde un servidor, el cruce se hace en segundo plano con `inventory-worker.js` para soportar archivos grandes sin congelar la interfaz.
