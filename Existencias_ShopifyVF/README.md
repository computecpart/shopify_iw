# Comparador de existencias Shopify + IW

Web estática en HTML, CSS y JavaScript puro para cruzar productos de Shopify, inventario de Shopify y existencias de IW, con el objetivo de generar un CSV de actualización de inventario por sucursal para Shopify.

## Uso

1. Abre la carpeta con un servidor local o publica esta carpeta en GitHub Pages.
2. Asegúrate de activar el seguimiento de inventario manualmente en Shopify para los productos que aplique, antes de exportar.
3. Carga los archivos de productos Shopify, inventario Shopify e IW.
4. Revisa el mapeo de sucursales:
   - `Sucursal Chalchuapa` -> `ALMACEN`
   - `Sucursal Santa Ana Independencia` -> `ALMACEN SANTA ANA`
   - `Sucursal Santa Ana Zarzamora` -> `ALMACEN ZARZAMORA`
5. Mantén la opción "Eliminar 'On hand (current)' del CSV de inventario" activada para evitar rechazos de Shopify.
6. Ejecuta `Comparar y generar archivos`.
7. Revisa la pestaña `Actualizados` para ver exactamente qué productos entrarán al CSV de inventario.
8. Descarga el CSV de inventario generado.
9. Ve a la sección de Inventario en Shopify y haz clic en Importar, subiendo el archivo generado.

Para probar localmente:

```powershell
py -3 -m http.server 8766 --bind 127.0.0.1
```

Luego abre `http://127.0.0.1:8766/index.html`.

## Reglas principales

- La validación contra IW se hace estrictamente por UPC (Código de barras). El SKU solo se usa para ubicar la fila en Shopify.
- En formato Shopify `All states`, solo se llena `On hand (new)` para las tres sucursales mapeadas.
- El CSV subible solo escribe existencias cuando la fila tiene SKU, el producto tiene UPC, y la coincidencia con IW es única y segura por UPC.
- Si el tracking no está activo en Shopify, la app te avisará pero **no bloqueará** la generación del CSV.
- Los productos sin UPC, ambiguos, o no encontrados quedan omitidos y pasan a revisión.
- Los UPC se comparan normalizados (sin apóstrofes, guiones, ni ceros iniciales).
- Si no hay coincidencia segura, se deja `On hand (new)` vacío para evitar sobrescrituras accidentales.
- No se editan precios ni otros datos del producto.
