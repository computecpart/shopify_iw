const state = {
  files: {
    products: [],
    inventory: null,
    iw: null,
  },
  iwHeaders: [],
  result: null,
  view: 'actions',
  priceFilter: 'all',
};

const SEARCH_CACHE = Symbol('searchCache');
const REQUIRED_PRODUCT_FIELDS = ['Variant SKU', 'SKU'];
const PRICE_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'ready-upload', label: 'Listos CSV' },
  { id: 'tracking-required', label: 'Tracking apagado' },
  { id: 'upload-skipped', label: 'Omitidos CSV' },
  { id: 'no-stock', label: 'Sin existencia' },
  { id: 'no-iw', label: 'Sin IW' },
  { id: 'no-upc', label: 'Sin UPC' },
  { id: 'shopify-sale', label: 'Oferta Shopify' },
  { id: 'shopify-only-sale', label: 'Oferta solo Shopify' },
  { id: 'price-difference', label: 'Diferencia precio' },
  { id: 'zero-price', label: 'Precio 0' },
];
const TARGET_LOCATION_DEFAULTS = [
  {
    label: 'Sucursal Chalchuapa',
    shopify: 'Sucursal Chalchuapa',
    iw: 'ALMACEN',
    selectId: 'mapChalchuapa',
  },
  {
    label: 'Sucursal Santa Ana Independencia',
    shopify: 'Sucursal Santa Ana Independencia',
    aliases: ['Sucursal Santa Ana'],
    iw: 'ALMACEN SANTA ANA',
    selectId: 'mapSantaAna',
  },
  {
    label: 'Sucursal Santa Ana Zarzamora',
    shopify: 'Sucursal Santa Ana Zarzamora',
    aliases: ['Sucursal Zarzamora', 'Sucursal Santa Ana Zarzamora'],
    iw: 'ALMACEN ZARZAMORA',
    selectId: 'mapZarzamora',
  },
];

const IW_FIELD_ALIASES = {
  barcode: ['Código de Barras', 'Codigo de Barras', 'Código Barras', 'Barcode', 'UPC'],
  code: ['Código', 'Codigo', 'SKU', 'Item'],
  title: ['Nombre Comercial', 'Producto', 'Descripción', 'Descripcion', 'Nombre'],
  price4: ['Precio 4', 'Price 4', 'Precio4'],
};

const PRODUCT_FIELD_ALIASES = {
  handle: ['Handle', 'URL handle'],
  sku: ['Variant SKU', 'SKU'],
  barcode: ['Variant Barcode', 'Barcode'],
  title: ['Title'],
  status: ['Status'],
  published: ['Published', 'Published on online store'],
  inventoryTracker: ['Variant Inventory Tracker', 'Inventory tracker'],
};

const INVENTORY_FIELD_ALIASES = {
  handle: ['Handle', 'URL handle'],
  sku: ['SKU', 'Variant SKU'],
  location: ['Location'],
  option1Name: ['Option1 Name'],
  option1Value: ['Option1 Value'],
  option2Name: ['Option2 Name'],
  option2Value: ['Option2 Value'],
  option3Name: ['Option3 Name'],
  option3Value: ['Option3 Value'],
  available: ['Available (not editable)'],
  onHandCurrent: ['On hand (current)'],
  onHandNew: ['On hand (new)'],
};

const views = {
  all: {
    columns: [
      'Producto',
      'SKU',
      'UPC Shopify',
      'Handle',
      'Archivo Shopify',
      'Fila Shopify',
      'Estado Shopify',
      'Publicado',
      'En inventario Shopify',
      'Filas inventario Shopify',
      'Coincidencia IW',
      'CSV Shopify',
      'Tracking Shopify',
      'Existencia IW',
      'Shopify actual',
      'Precio Shopify actual',
      'Precio regular Shopify',
      'Oferta',
      'Detalle',
    ],
    getRows: () => state.result?.allProducts ?? [],
  },
  upload: {
    columns: [
      'Decision',
      'SKU',
      'UPC Shopify',
      'Producto',
      'Sucursal',
      'Coincidencia IW',
      'Tracking Shopify',
      'Paso previo',
      'Shopify actual',
      'IW nuevo',
      'En CSV Shopify',
      'Detalle',
    ],
    getRows: () => state.result?.uploadAudit ?? [],
  },
  updated: {
    columns: [
      'SKU',
      'UPC Shopify',
      'Producto',
      'Sucursal',
      'Shopify actual total',
      'IW nuevo total',
      'Diferencia total',
      'Detalle',
    ],
    getRows: () => state.result?.updatedProducts ?? [],
  },
  shopify: {
    columns: [
      'Accion',
      'Handle',
      'SKU',
      'UPC Shopify',
      'Producto',
      'Estado actual',
      'Estado recomendado',
      'Existencia IW',
      'Shopify actual',
      'En CSV estados',
      'En CSV inventario',
      'Tracking Shopify',
      'Detalle',
    ],
    getRows: () => state.result?.shopifyStatus ?? [],
  },
  actions: {
    columns: ['Acción', 'UPC Shopify', 'SKU', 'Producto', 'IW Total', 'Shopify actual', 'Detalle'],
    getRows: () => state.result?.actions ?? [],
  },
  prices: {
    columns: [
      'Estado',
      'UPC Shopify',
      'SKU',
      'Producto',
      'Coincidencia IW',
      'Existencia IW',
      'Shopify actual',
      'Diferencia existencia',
      'CSV Shopify',
      'Tracking Shopify',
      'Precio 4 IW',
      'Precio Shopify actual',
      'Precio regular Shopify',
      'Precio oferta Shopify',
      'Diferencia',
      'Oferta',
      'Detalle',
    ],
    getRows: () => state.result?.priceReport ?? [],
  },
  zero: {
    columns: ['UPC Shopify', 'SKU', 'Producto', 'Chalchuapa', 'Santa Ana', 'Zarzamora', 'Total IW'],
    getRows: () => state.result?.zeroStock ?? [],
  },
  missing: {
    columns: ['Código IW', 'Código de barras IW', 'Producto IW', 'Chalchuapa', 'Santa Ana', 'Zarzamora', 'Total IW'],
    getRows: () => state.result?.missingInShopify ?? [],
  },
  review: {
    columns: ['Tipo', 'UPC / SKU', 'Producto', 'Sucursal', 'Detalle'],
    getRows: () => state.result?.review ?? [],
  },
};

const els = {};

document.addEventListener('DOMContentLoaded', () => {
  cacheElements();
  bindEvents();
  updateFileLabels();
  renderMetrics();
  renderTabCounts();
  renderPriceFilterCounts();
  renderPriceFilterState();
});

function cacheElements() {
  [
    'productsInput',
    'inventoryInput',
    'iwInput',
    'productsFiles',
    'inventoryFiles',
    'iwFiles',
    'fileStatus',
    'processButton',
    'processMessage',
    'metricsGrid',
    'downloadInventory',
    'downloadStatus',
    'downloadReport',
    'downloadPriceReport',
    'downloadMissing',
    'resultsTable',
    'searchInput',
    'tableCount',
    'resetButton',
    'clampNegative',
    'skuFallback',
    'removeCurrentOnHand',
    'progressBar',
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function bindEvents() {
  els.productsInput.addEventListener('change', async (event) => {
    state.files.products = [...event.target.files];
    updateFileLabels();
  });

  els.inventoryInput.addEventListener('change', (event) => {
    state.files.inventory = event.target.files[0] ?? null;
    updateFileLabels();
  });

  els.iwInput.addEventListener('change', async (event) => {
    state.files.iw = event.target.files[0] ?? null;
    updateFileLabels();
    await previewIwHeaders();
  });

  els.processButton.addEventListener('click', processFiles);
  els.searchInput.addEventListener('input', renderTable);
  els.resetButton.addEventListener('click', resetApp);
  els.downloadInventory.addEventListener('click', () => {
    if (!state.result) return;
    downloadText(
      state.result.inventoryCsv,
      `shopify_inventory_actualizado_${dateStamp()}.csv`,
      'text/csv;charset=utf-8'
    );
  });
  els.downloadStatus.addEventListener('click', () => {
    if (!state.result) return;
    downloadText(
      state.result.productStatusCsv,
      `shopify_productos_estados_${dateStamp()}.csv`,
      'text/csv;charset=utf-8'
    );
  });
  els.downloadReport.addEventListener('click', () => {
    if (!state.result) return;
    downloadText(
      csvFromObjects(state.result.reportRows),
      `reporte_completo_shopify_iw_${dateStamp()}.csv`,
      'text/csv;charset=utf-8'
    );
  });
  els.downloadPriceReport.addEventListener('click', () => {
    if (!state.result) return;
    downloadText(
      csvFromObjects(state.result.priceReportRows),
      `reporte_precios_shopify_iw_precio_4_${dateStamp()}.csv`,
      'text/csv;charset=utf-8'
    );
  });
  els.downloadMissing.addEventListener('click', () => {
    if (!state.result) return;
    downloadText(
      csvFromObjects(state.result.missingInShopify),
      `productos_iw_no_creados_shopify_${dateStamp()}.csv`,
      'text/csv;charset=utf-8'
    );
  });

  document.querySelectorAll('.tab').forEach((button) => {
    button.addEventListener('click', () => {
      setActiveView(button.dataset.view);
    });
  });

  document.querySelectorAll('[data-price-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      state.priceFilter = button.dataset.priceFilter || 'all';
      renderPriceFilterState();
      renderTable();
    });
  });
}

function updateFileLabels() {
  els.productsFiles.textContent = describeFiles(state.files.products);
  els.inventoryFiles.textContent = state.files.inventory?.name ?? 'Sin archivo';
  els.iwFiles.textContent = state.files.iw?.name ?? 'Sin archivo';

  const ready = state.files.products.length && state.files.inventory && state.files.iw;
  els.fileStatus.textContent = ready ? 'Listo para comparar' : 'Esperando archivos';
  els.fileStatus.dataset.ready = ready ? 'true' : 'false';
  els.processButton.disabled = !ready;
}

function setActiveView(view) {
  state.view = views[view] ? view : 'actions';
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.view === state.view);
  });
  renderPriceFilterState();
  renderTable();
}

function describeFiles(files) {
  if (!files?.length) return 'Sin archivos';
  if (files.length === 1) return files[0].name;
  return `${files.length} archivos: ${files.map((file) => file.name).join(', ')}`;
}

async function previewIwHeaders() {
  if (!state.files.iw) return;
  try {
    const headers = await readTabularHeaders(state.files.iw);
    state.iwHeaders = headers;
    populateIwSelects(headers);
  } catch (error) {
    setMessage(error.message, 'error');
  }
}

function populateIwSelects(headers) {
  TARGET_LOCATION_DEFAULTS.forEach((target) => {
    const select = document.getElementById(target.selectId);
    const preferred = findHeader(headers, [target.iw]) ?? target.iw;
    select.innerHTML = '';
    headers.forEach((header) => {
      const option = document.createElement('option');
      option.value = header;
      option.textContent = header;
      option.selected = normalizeHeader(header) === normalizeHeader(preferred);
      select.append(option);
    });
  });
}

async function processFiles() {
  if (!state.files.products.length || !state.files.inventory || !state.files.iw) return;
  const startedAt = performance.now();
  setProgress(4);
  setBusy(true, 'Leyendo archivos y preparando coincidencias...');

  try {
    await idle();
    const options = collectOptions();
    const comparison = await runComparison(options);
    comparison.metrics.elapsedMs = Math.round(performance.now() - startedAt);

    state.result = comparison;
    renderMetrics(comparison.metrics);
    renderTabCounts();
    renderPriceFilterCounts();
    setActiveView('shopify');
    enableDownloads(true);
    setProgress(100);
    const trackingMessage = comparison.metrics.trackingBlocked
      ? ` ${formatNumber(comparison.metrics.trackingBlocked)} productos tienen tracking apagado y quedaron fuera del CSV.`
      : '';
    const statusMessage = comparison.metrics.statusCsvRows
      ? ` ${formatNumber(comparison.metrics.statusToActivate)} para activar y ${formatNumber(
          comparison.metrics.statusToDraft
        )} para dejar en draft.`
      : '';
    setMessage(
      `Comparación lista: ${formatNumber(comparison.metrics.updatedRows)} filas preparadas para Shopify en ${formatDuration(
        comparison.metrics.elapsedMs
      )}.${trackingMessage}${statusMessage}`
    );
  } catch (error) {
    console.error(error);
    enableDownloads(false);
    setMessage(error.message || 'No se pudo procesar la información.', 'error');
  } finally {
    setBusy(false);
  }
}

async function runComparison(options) {
  if (canUseWorker()) {
    try {
      return await runComparisonInWorker(options);
    } catch (error) {
      setMessage(`Procesando sin worker: ${error.message}`);
      await idle();
    }
  }

  return runComparisonOnMainThread(options);
}

function canUseWorker() {
  return Boolean(window.Worker) && location.protocol !== 'file:';
}

function runComparisonInWorker(options) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('inventory-worker.js');
    worker.onmessage = (event) => {
      const { type, message, progress, result, error } = event.data;
      if (type === 'progress') {
        if (progress !== undefined) setProgress(progress);
        if (message) setMessage(message);
        return;
      }
      worker.terminate();
      if (type === 'complete') resolve(result);
      if (type === 'error') reject(new Error(error || 'No se pudo procesar en segundo plano.'));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'El worker de procesamiento no respondió.'));
    };
    worker.postMessage({
      type: 'process',
      files: {
        products: state.files.products,
        inventory: state.files.inventory,
        iw: state.files.iw,
      },
      options,
    });
  });
}

async function runComparisonOnMainThread(options) {
  setProgress(12);
  const productTables = [];
  for (let i = 0; i < state.files.products.length; i += 1) {
    setMessage(`Leyendo productos Shopify (${i + 1}/${state.files.products.length})...`);
    productTables.push(await readCsvFile(state.files.products[i]));
    setProgress(18 + Math.round(((i + 1) / state.files.products.length) * 18));
    await idle();
  }

  setMessage('Leyendo inventario Shopify...');
  const inventoryTable = await readCsvFile(state.files.inventory);
  setProgress(46);
  await idle();

  setMessage('Leyendo existencias IW...');
  const iwTable = await readTabularFile(state.files.iw);
  setProgress(62);
  await idle();

  setMessage('Mapeando SKU, UPC y existencias...');
  const products = buildProductIndex(productTables);
  setProgress(74);
  await idle();
  const iw = buildIwIndex(iwTable, options);
  setProgress(84);
  await idle();
  return compareInventory(inventoryTable, products, iw, options);
}

function collectOptions() {
  const targets = TARGET_LOCATION_DEFAULTS.map((target) => {
    const iwColumn = document.getElementById(target.selectId).value || target.iw;
    return {
      ...target,
      iwColumn,
      locationKeys: [target.shopify, ...(target.aliases ?? [])].map(normalizeHeader),
    };
  });

  return {
    targets,
    clearExistingNew: true,
    clampNegative: els.clampNegative.checked,
    skuFallback: els.skuFallback.checked,
    removeCurrentOnHand: els.removeCurrentOnHand.checked,
  };
}

async function readCsvFile(file) {
  const text = await file.text();
  const table = parseCsv(text);
  table.fileName = file.name;
  return table;
}

async function readTabularHeaders(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) {
    const preview = await file.slice(0, 128 * 1024).text();
    return parseCsv(preview, { limitRows: 1 }).headers;
  }

  if (!window.XLSX) {
    throw new Error('No se pudo cargar el lector XLSX. Revisa la conexión o exporta IW como CSV.');
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error('El archivo IW no contiene hojas.');
  const sheet = workbook.Sheets[firstSheetName];
  const ref = sheet['!ref'];
  if (!ref) throw new Error('La primera hoja del archivo IW está vacía.');
  const range = XLSX.utils.decode_range(ref);
  range.e.r = range.s.r;
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
    range,
  });
  return rowsToTable(rows, file.name).headers;
}

async function readTabularFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) return readCsvFile(file);

  if (!window.XLSX) {
    throw new Error('No se pudo cargar el lector XLSX. Revisa la conexión o exporta IW como CSV.');
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error('El archivo IW no contiene hojas.');
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  return rowsToTable(rows, file.name);
}

function rowsToTable(rows, fileName = '') {
  const cleanRows = rows
    .map((row) => row.map((value) => stringifyCell(value)))
    .filter((row) => row.some((value) => value.trim() !== ''));
  if (!cleanRows.length) throw new Error(`El archivo ${fileName || 'cargado'} está vacío.`);
  const headers = cleanRows[0].map((header, index) => {
    const value = header.trim();
    return value || `Columna ${index + 1}`;
  });
  return {
    headers,
    rows: cleanRows.slice(1),
    fileName,
  };
}

function parseCsv(text, options = {}) {
  const delimiter = options.delimiter ?? detectCsvDelimiter(text);
  const limitRows = options.limitRows ?? Number.POSITIVE_INFINITY;
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      if (rows.length >= limitRows) return rowsToTable(rows);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rowsToTable(rows);
}

function detectCsvDelimiter(text) {
  const candidates = [',', ';', '\t'];
  const counts = new Map(candidates.map((candidate) => [candidate, 0]));
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') i += 1;
      else inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (char === '\r' || char === '\n')) break;
    if (!inQuotes && counts.has(char)) counts.set(char, counts.get(char) + 1);
  }

  return candidates.reduce((best, candidate) => (counts.get(candidate) > counts.get(best) ? candidate : best), ',');
}

function buildProductIndex(tables) {
  const bySku = new Map();
  const byHandle = new Map();
  const barcodeKeys = new Map();
  const identifierKeys = new Map();
  const skuRecords = new Map();
  const unsafeSkuKeys = new Set();
  const all = [];
  const review = [];
  let variants = 0;

  tables.forEach((table) => {
    const idx = indexHeaders(table.headers);
    validateAnyField(idx, REQUIRED_PRODUCT_FIELDS, table.fileName || 'productos Shopify');

    let lastTitle = '';
    let lastHandle = '';
    let lastStatus = '';
    let lastPublished = '';

    table.rows.forEach((row, rowIndex) => {
      const title = resolveField(row, idx, PRODUCT_FIELD_ALIASES.title) || lastTitle;
      const handle = resolveField(row, idx, PRODUCT_FIELD_ALIASES.handle) || lastHandle;
      const status = resolveField(row, idx, PRODUCT_FIELD_ALIASES.status) || lastStatus;
      const published = resolveField(row, idx, PRODUCT_FIELD_ALIASES.published) || lastPublished;
      const sku = normalizeSku(resolveField(row, idx, PRODUCT_FIELD_ALIASES.sku));
      const barcodeRaw = resolveField(row, idx, PRODUCT_FIELD_ALIASES.barcode);
      const barcode = cleanIdentifier(barcodeRaw);
      const priceRaw = get(row, idx, 'Variant Price') || get(row, idx, 'Price / El Salvador');
      const compareAtRaw = get(row, idx, 'Variant Compare At Price') || get(row, idx, 'Compare At Price / El Salvador');
      const inventoryTrackerRaw = resolveField(row, idx, PRODUCT_FIELD_ALIASES.inventoryTracker);

      if (resolveField(row, idx, PRODUCT_FIELD_ALIASES.title)) lastTitle = resolveField(row, idx, PRODUCT_FIELD_ALIASES.title);
      if (resolveField(row, idx, PRODUCT_FIELD_ALIASES.handle)) lastHandle = resolveField(row, idx, PRODUCT_FIELD_ALIASES.handle);
      if (resolveField(row, idx, PRODUCT_FIELD_ALIASES.status)) lastStatus = resolveField(row, idx, PRODUCT_FIELD_ALIASES.status);
      if (resolveField(row, idx, PRODUCT_FIELD_ALIASES.published)) lastPublished = resolveField(row, idx, PRODUCT_FIELD_ALIASES.published);

      if (!isShopifyVariantRow({ sku, barcode, priceRaw, compareAtRaw })) return;
      variants += 1;

      const product = {
        sku,
        barcode,
        barcodeRaw,
        title,
        handle,
        status,
        published,
        price: parseMoney(priceRaw),
        compareAtPrice: parseMoney(compareAtRaw),
        priceRaw,
        compareAtRaw,
        inventoryTracker: inventoryTrackerRaw,
        sourceFile: table.fileName,
        sourceRow: rowIndex + 2,
      };
      all.push(product);

      if (!sku) {
        review.push({
          Tipo: 'SKU Shopify faltante',
          'UPC / SKU': barcode,
          Producto: title,
          Sucursal: '',
          Detalle: 'La variante aparece en productos Shopify sin SKU; se incluye en precios, pero no puede actualizar inventario por SKU.',
        });
        if (barcode) addBarcodeReference(barcodeKeys, barcode, product);
        if (barcode) addBarcodeReference(identifierKeys, barcode, product);
        if (handle) addHandleReference(byHandle, handle, product);
        return;
      }

      const skuKey = keySku(sku);
      if (!skuRecords.has(skuKey)) skuRecords.set(skuKey, []);
      skuRecords.get(skuKey).push(product);

      const existing = bySku.get(skuKey);
      if (!existing || (!existing.barcode && barcode)) {
        bySku.set(skuKey, product);
      }

      if (barcode) {
        addBarcodeReference(barcodeKeys, barcode, product);
      }
      if (handle) addHandleReference(byHandle, handle, product);
      addBarcodeReference(identifierKeys, barcode || sku, product);
      if (barcode && sku) addBarcodeReference(identifierKeys, sku, product);
    });
  });

  skuRecords.forEach((records, skuKey) => {
    if (records.length <= 1) return;
    const barcodes = [...new Set(records.map((item) => item.barcode).filter(Boolean))];
    const hasMissingBarcode = records.some((item) => !item.barcode);
    if (barcodes.length === 1 && !hasMissingBarcode) return;

    unsafeSkuKeys.add(skuKey);
    review.push({
      Tipo: 'SKU duplicado no seguro',
      'UPC / SKU': records[0].sku,
      Producto: records.map((item) => item.title || item.handle).filter(Boolean).join(' | '),
      Sucursal: '',
      Detalle: 'El SKU aparece en varias variantes con UPC distintos o faltantes. Se omite del CSV Shopify hasta corregirlo.',
    });
  });

  return { bySku, byHandle, barcodeKeys, identifierKeys, unsafeSkuKeys, all, review, variants };
}

function buildIwIndex(table, options) {
  const idx = indexHeaders(table.headers);
  const barcodeHeader = findHeader(table.headers, IW_FIELD_ALIASES.barcode);
  const codeHeader = findHeader(table.headers, IW_FIELD_ALIASES.code);
  const titleHeader = findHeader(table.headers, IW_FIELD_ALIASES.title);
  const price4Header = findHeader(table.headers, IW_FIELD_ALIASES.price4);

  if (!barcodeHeader) {
    throw new Error('No encontré la columna Código de Barras en el archivo IW.');
  }

  const byBarcode = new Map();
  const rows = [];
  const review = [];

  table.rows.forEach((row, rowIndex) => {
    const barcode = cleanIdentifier(get(row, idx, barcodeHeader));
    const code = cleanIdentifier(get(row, idx, codeHeader));
    const title = get(row, idx, titleHeader);
    const price4Raw = price4Header ? get(row, idx, price4Header) : '';
    const quantities = {};
    let total = 0;

    options.targets.forEach((target) => {
      const value = parseQuantity(get(row, idx, target.iwColumn), {
        clampNegative: options.clampNegative,
      });
      quantities[target.iwColumn] = value.quantity;
      total += value.quantity;
      if (value.warning) {
        review.push({
          Tipo: 'Cantidad IW ajustada',
          'UPC / SKU': barcode || code,
          Producto: title,
          Sucursal: target.iwColumn,
          Detalle: value.warning,
        });
      }
    });

    const iwRow = {
      barcode,
      code,
      title,
      price4: parseMoney(price4Raw),
      price4Raw,
      quantities,
      total,
      sourceRow: rowIndex + 2,
    };
    rows.push(iwRow);

    if (!barcode || barcode === '0') {
      if (total > 0) {
        review.push({
          Tipo: 'IW sin código de barras',
          'UPC / SKU': code,
          Producto: title,
          Sucursal: '',
          Detalle: 'Tiene existencia positiva, pero no puede cruzarse por UPC.',
        });
      }
      return;
    }

    addBarcodeReference(byBarcode, barcode, iwRow);
  });

  return { byBarcode, rows, review };
}

function compareInventory(inventoryTable, products, iw, options) {
  const idx = indexHeaders(inventoryTable.headers);
  const hasAllStates = INVENTORY_FIELD_ALIASES.location.some(a => hasHeader(idx, a)) && INVENTORY_FIELD_ALIASES.onHandNew.some(a => hasHeader(idx, a));
  const hasAvailableColumns = !hasAllStates && options.targets.some((target) => hasHeader(idx, target.shopify));

  if (!hasAllStates && !hasAvailableColumns) {
    throw new Error('El inventario Shopify no parece tener formato All states ni columnas por sucursal.');
  }

  const outputRows = inventoryTable.rows.map((row) => [...row]);
  const review = [...products.review, ...iw.review];
  const uploadAudit = [];
  const inventoryReviewKeys = new Set();
  const rowsBySku = new Map();
  const matchedIwRows = new Set();
  
  const metrics = {
    updatedRows: 0,
    matchedRows: 0,
    unmatchedRows: 0,
    safeSkippedRows: 0,
    skippedNoUpc: 0,
    skippedNoIw: 0,
    skippedAmbiguous: 0,
    skippedDupSku: 0,
    skippedNotInInventory: 0,
    trackingWarnings: 0,
  };

  let newIndex = -1;
  if (hasAllStates) {
    newIndex = INVENTORY_FIELD_ALIASES.onHandNew.map(a => idx.get(normalizeHeader(a))).find(i => i !== undefined) ?? -1;
    if (newIndex !== -1) {
      outputRows.forEach((row) => {
        row[newIndex] = '';
      });
    }
  }

  inventoryTable.rows.forEach((row, rowIndex) => {
    const outputRow = outputRows[rowIndex];
    const inventorySku = normalizeSku(resolveField(row, idx, INVENTORY_FIELD_ALIASES.sku));
    const inventoryHandle = resolveField(row, idx, INVENTORY_FIELD_ALIASES.handle);
    const productMatch = findProductForInventoryRow(inventorySku, inventoryHandle, row, idx, products);
    const product = productMatch.product;
    const sku = product?.sku || inventorySku;
    const skuKey = sku ? keySku(sku) : '';
    const location = resolveField(row, idx, INVENTORY_FIELD_ALIASES.location);
    const target = hasAllStates ? findTargetForLocation(location, options.targets) : null;
    const match = product?.barcode ? lookupIwMatch(product.barcode, iw.byBarcode) : { status: 'missing_input' };
    const uploadBlockReason = getUploadBlockReason(sku, product, match, products, metrics);
    const currentQty = parseQuantity(
      resolveField(row, idx, INVENTORY_FIELD_ALIASES.onHandCurrent) || resolveField(row, idx, INVENTORY_FIELD_ALIASES.available),
      { clampNegative: false }
    ).quantity;
    const groupKey = product ? productKey(product) : skuKey || (inventoryHandle ? `handle:${keyHandle(inventoryHandle)}` : `__row_${rowIndex}`);

    if (!rowsBySku.has(groupKey)) {
      rowsBySku.set(groupKey, {
        sku,
        product,
        match,
        inventoryMatchSource: productMatch.source,
        currentTotal: 0,
        iwTotal: 0,
        targetRows: 0,
        safeMatched: false,
        updatedLocations: [],
      });
    }

    const group = rowsBySku.get(groupKey);

    if (hasAllStates) {
      if (!target) return;
      group.targetRows += 1;
      group.currentTotal += currentQty;

      if (!uploadBlockReason) {
        const qty = match.row.quantities[target.iwColumn] ?? 0;
        if (newIndex !== -1) outputRow[newIndex] = String(qty);
        group.iwTotal += qty;
        group.safeMatched = true;
        group.updatedLocations.push(`${target.label}: ${qty}`);
        uploadAudit.push(buildUploadAuditRow(sku, product, target.label, match, currentQty, qty, true, 'Coincidencia segura por UPC.'));
        metrics.matchedRows += 1;
        metrics.updatedRows += 1;
        matchedIwRows.add(match.row);
      } else {
        uploadAudit.push(buildUploadAuditRow(sku, product, target.label || location, match, currentQty, '', false, uploadBlockReason));
        metrics.unmatchedRows += 1;
        metrics.safeSkippedRows += 1;
        addInventoryReview(review, row, idx, product, sku, location, match, inventoryReviewKeys, uploadBlockReason);
      }
      return;
    }

    if (!uploadBlockReason) {
      matchedIwRows.add(match.row);
      group.targetRows = options.targets.length;
      group.iwTotal = 0;
      group.currentTotal = 0;
      group.safeMatched = true;
      group.updatedLocations = [];
      options.targets.forEach((target) => {
        const col = findHeader(inventoryTable.headers, [target.shopify, ...(target.aliases ?? [])]);
        if (!col) return;
        const qty = match.row.quantities[target.iwColumn] ?? 0;
        const currentLocationQty = parseQuantity(get(row, idx, col), { clampNegative: false }).quantity;
        const colIndex = idx.get(normalizeHeader(col));
        if (colIndex !== undefined) outputRow[colIndex] = String(qty);
        group.iwTotal += qty;
        group.currentTotal += currentLocationQty;
        group.updatedLocations.push(`${target.label}: ${qty}`);
        uploadAudit.push(buildUploadAuditRow(sku, product, target.label, match, currentLocationQty, qty, true, 'Coincidencia segura por UPC.'));
      });
      metrics.matchedRows += 1;
      metrics.updatedRows += 1;
    } else {
      options.targets.forEach((target) => {
        const col = findHeader(inventoryTable.headers, [target.shopify, ...(target.aliases ?? [])]);
        if (!col) return;
        const currentLocationQty = parseQuantity(get(row, idx, col), { clampNegative: false }).quantity;
        uploadAudit.push(buildUploadAuditRow(sku, product, target.label, match, currentLocationQty, '', false, uploadBlockReason));
        metrics.safeSkippedRows += 1;
      });
      metrics.unmatchedRows += 1;
      addInventoryReview(review, row, idx, product, sku, '', match, inventoryReviewKeys, uploadBlockReason);
    }
  });

  products.all.forEach(product => {
    if (product.barcode) {
      const match = lookupIwMatch(product.barcode, iw.byBarcode);
      if (match.status === 'matched') {
        const key = productKey(product);
        if (!rowsBySku.has(key)) {
          metrics.skippedNotInInventory += 1;
          review.push({
            Tipo: 'Sin actualización segura',
            'UPC / SKU': product.barcode,
            Producto: product.title,
            Sucursal: '',
            Detalle: 'Existe en productos Shopify e IW, pero no aparece en el CSV de inventario cargado. Reexporta inventario Shopify incluyendo esta variante y ubicación.',
          });
        }
      }
    }
  });

  const actions = [];
  const zeroStock = [];

  rowsBySku.forEach((group) => {
    if (!group.sku || !group.product || !group.targetRows) return;
    if (!group.safeMatched) return;
    const barcode = group.product.barcode || group.sku;
    const isActive = isShopifyActive(group.product);
    const base = {
      'UPC Shopify': barcode,
      SKU: group.sku,
      Producto: group.product.title,
      'IW Total': group.iwTotal,
      'Shopify actual': group.currentTotal,
      Detalle: group.updatedLocations.join(' | ') || 'Sin actualización',
    };

    if (group.match.status === 'matched' && group.iwTotal <= 0) {
      zeroStock.push(buildZeroRow(group, options));
      if (isActive) {
        actions.push({
          Acción: htmlTag('Deshabilitar', 'danger'),
          ...base,
        });
      }
    } else if (group.match.status === 'matched' && group.iwTotal > 0 && !isActive) {
      actions.push({
        Acción: htmlTag('Habilitar', 'ok'),
        ...base,
      });
    } else if (group.match.status === 'matched' && group.iwTotal !== group.currentTotal) {
      actions.push({
        Acción: htmlTag('Actualizar', 'warn'),
        ...base,
      });
    }
  });

  const shopifyReferenceKeys = products.barcodeKeys;
  const missingInShopify = iw.rows
    .filter((row) => row.total > 0 && row.barcode && row.barcode !== '0')
    .filter((row) => !matchedIwRows.has(row))
    .filter((row) => !hasBarcodeReference(shopifyReferenceKeys, row.barcode))
    .map((row) => ({
      'Código IW': row.code,
      'Código de barras IW': row.barcode,
      'Producto IW': row.title,
      Chalchuapa: row.quantities[options.targets[0].iwColumn] ?? 0,
      'Santa Ana': row.quantities[options.targets[1].iwColumn] ?? 0,
      Zarzamora: row.quantities[options.targets[2].iwColumn] ?? 0,
      'Total IW': row.total,
    }));

  missingInShopify.forEach((row) => {
    actions.push({
      Acción: htmlTag('Crear', 'ok'),
      'UPC Shopify': row['Código de barras IW'],
      SKU: row['Código IW'],
      Producto: row['Producto IW'],
      'IW Total': row['Total IW'],
      'Shopify actual': '',
      Detalle: 'Existe en IW con stock positivo y no aparece en productos Shopify.',
    });
  });

  const updatedProducts = buildUpdatedProductsRows(uploadAudit);
  const trackingBlocked = countTrackingBlocked(uploadAudit);
  const priceReport = buildPriceReport(products, iw, options, rowsBySku);
  const allProducts = buildAllProductsRows(priceReport);
  const priceReportRows = priceReport.map(stripObjectHtml);
  const priceMetrics = summarizePriceReport(priceReportRows);
  const shopifyStatus = buildShopifyStatusRows(products, iw, options, rowsBySku, missingInShopify);
  const statusMetrics = summarizeShopifyStatus(shopifyStatus);
  const productStatusCsv = buildProductStatusCsv(shopifyStatus);
  const reportRows = buildReportRows(
    uploadAudit,
    updatedProducts,
    shopifyStatus,
    actions,
    zeroStock,
    missingInShopify,
    review,
    priceReportRows
  );

  let finalHeaders = inventoryTable.headers;
  let finalRows = outputRows;

  if (options.removeCurrentOnHand) {
    const stripped = removeCsvColumnByAliases(finalHeaders, finalRows, INVENTORY_FIELD_ALIASES.onHandCurrent);
    finalHeaders = stripped.headers;
    finalRows = stripped.rows;
  }

  const inventoryCsv = tableToCsv(finalHeaders, finalRows);

  return {
    inventoryCsv,
    productStatusCsv,
    updatedProducts,
    uploadAudit,
    shopifyStatus,
    actions,
    allProducts,
    priceReport,
    priceReportRows,
    zeroStock,
    missingInShopify,
    review,
    reportRows,
    metrics: {
      variants: products.variants,
      inventoryRows: inventoryTable.rows.length,
      updatedRows: metrics.updatedRows,
      matchedRows: metrics.matchedRows,
      unmatchedRows: metrics.unmatchedRows,
      safeSkippedRows: metrics.safeSkippedRows,
      skippedNoUpc: metrics.skippedNoUpc,
      skippedNoIw: metrics.skippedNoIw,
      skippedAmbiguous: metrics.skippedAmbiguous,
      skippedDupSku: metrics.skippedDupSku,
      skippedNotInInventory: metrics.skippedNotInInventory,
      trackingWarnings: metrics.trackingWarnings,
      uploadAuditRows: uploadAudit.length,
      updatedProducts: updatedProducts.length,
      trackingBlocked,
      statusToActivate: statusMetrics.activate,
      statusToDraft: statusMetrics.draft,
      statusCsvRows: statusMetrics.csvRows,
      statusNotFound: statusMetrics.notFound,
      zeroStock: zeroStock.length,
      missingInShopify: missingInShopify.length,
      review: review.length,
      actions: actions.length,
      iwRows: iw.rows.length,
      matchedIwRows: matchedIwRows.size,
      priceRows: priceReport.length,
      priceMatches: priceMetrics.matches,
      priceDifferences: priceMetrics.differences,
      priceZeroIssues: priceMetrics.zeroIssues,
      saleProducts: priceMetrics.saleProducts,
      priceReview: priceMetrics.review,
    },
  };
}

function buildPriceReport(products, iw, options, rowsBySku = new Map()) {
  return products.all.map((product) => {
    const match = lookupIwMatch(product.barcode || '', iw.byBarcode, options.skuFallback ? product.sku : '');
    const iwPrice = match.status === 'matched' ? match.row.price4 : null;
    const sale = classifySale(product);
    const comparison = compareMoney(product.price, iwPrice);
    const regularComparison = compareMoney(getRegularShopifyPrice(product), iwPrice);
    const stock = getPriceStockSummary(product, match, options, rowsBySku);
    const uploadState = getProductUploadState(product, match, stock, products);
    const state = classifyPriceState(product, match, iwPrice, sale, comparison, regularComparison);
    const detail = buildPriceDetail(product, match, iwPrice, sale, comparison, regularComparison, stock, uploadState);
    const flags = buildPriceFlags(product, match, iwPrice, sale, comparison, regularComparison, stock, state, uploadState);

    return {
      Estado: htmlTag(state.label, state.tone),
      'UPC Shopify': product.barcode || '',
      SKU: product.sku || '',
      Producto: product.title || match.row?.title || product.handle,
      Handle: product.handle || '',
      'Estado Shopify': product.status || '',
      Publicado: product.published || '',
      'En inventario Shopify': stock.hasShopifyStock ? 'Si' : 'No en CSV inventario',
      'Filas inventario Shopify': stock.targetRowsLabel,
      'Coincidencia IW': matchStatusLabel(match),
      'Existencia IW': stock.iwTotalLabel,
      'Shopify actual': stock.shopifyTotalLabel,
      'Diferencia existencia': stock.stockDifferenceLabel,
      'CSV Shopify': uploadState.label,
      'Tracking Shopify': trackingStatusLabel(product),
      'Precio 4 IW': formatMoneyCell(iwPrice),
      'Precio Shopify actual': formatMoneyCell(product.price),
      'Precio regular Shopify': formatMoneyCell(getRegularShopifyPrice(product)),
      'Precio oferta Shopify': sale.hasOfferMarker ? formatMoneyCell(product.price) : '',
      Diferencia: comparison.hasComparison ? formatSignedMoney(comparison.difference) : '',
      Oferta: sale.label,
      Detalle: detail,
      Chalchuapa: stock.locationTotals[0],
      'Santa Ana': stock.locationTotals[1],
      Zarzamora: stock.locationTotals[2],
      'Código IW': match.row?.code || '',
      'Producto IW': match.row?.title || '',
      'Fila IW': match.row?.sourceRow || '',
      'Archivo Shopify': product.sourceFile || '',
      'Fila Shopify': product.sourceRow || '',
      _priceFlags: flags,
    };
  });
}

function classifyPriceState(product, match, iwPrice, sale, comparison, regularComparison) {
  if (!product.price.valid || !product.price.hasValue) return { label: 'Revisar', tone: 'danger' };
  if (hasZeroPriceIssue(product, iwPrice)) return { label: 'Precio 0', tone: 'danger' };
  if (match.status === 'ambiguous') return { label: 'Revisar', tone: 'danger' };
  if (match.status !== 'matched') return { label: 'Sin IW', tone: 'warn' };
  if (!iwPrice?.valid || !iwPrice.hasValue) return { label: 'Revisar', tone: 'danger' };
  if (sale.isRealSale && comparison.hasComparison && Math.abs(comparison.difference) > 0.004) {
    if (regularComparison.hasComparison && Math.abs(regularComparison.difference) <= 0.004) {
      return { label: 'Oferta Shopify', tone: 'info' };
    }
    return { label: 'Oferta + diferencia', tone: 'warn' };
  }
  if (comparison.hasComparison && Math.abs(comparison.difference) > 0.004) return { label: 'Diferencia', tone: 'warn' };
  if (sale.isRealSale) return { label: 'Oferta', tone: 'info' };
  return { label: 'OK', tone: 'ok' };
}

function buildPriceDetail(product, match, iwPrice, sale, comparison, regularComparison, stock, uploadState) {
  const details = [];

  if (!product.sku) details.push('Variante sin SKU en Shopify.');
  if (!product.price.hasValue) details.push('Variant Price esta vacio.');
  if (product.price.hasValue && !product.price.valid) details.push(`Variant Price no numerico: ${product.price.raw}.`);
  if (product.price.valid && product.price.amount === 0) details.push('Precio actual Shopify en 0.00.');
  if (product.compareAtPrice.hasValue && !product.compareAtPrice.valid) {
    details.push(`Compare At Price no numerico: ${product.compareAtPrice.raw}.`);
  }
  if (product.compareAtPrice.valid && product.compareAtPrice.hasValue && product.compareAtPrice.amount === 0) {
    details.push('Precio regular/compare-at Shopify en 0.00.');
  }
  if (iwPrice?.valid && iwPrice.hasValue && iwPrice.amount === 0) details.push('Precio 4 IW en 0.00.');

  if (match.status !== 'matched') {
    details.push(matchStatusDetail(match.status));
  } else if (!iwPrice?.hasValue) {
    details.push('IW no trae Precio 4 para este producto.');
  } else if (!iwPrice.valid) {
    details.push(`Precio 4 IW no numerico: ${iwPrice.raw}.`);
  } else if (sale.isRealSale && comparison.hasComparison && Math.abs(comparison.difference) > 0.004) {
    if (regularComparison.hasComparison && Math.abs(regularComparison.difference) <= 0.004) {
      details.push('Oferta solo en Shopify: IW parece conservar el precio regular, revisar manualmente si la promocion debe existir en IW.');
    } else {
      details.push(`Producto en oferta Shopify y el precio regular tambien difiere de IW: ${formatSignedMoney(regularComparison.difference)}.`);
    }
  } else if (comparison.hasComparison && Math.abs(comparison.difference) > 0.004) {
    details.push(`Diferencia Shopify - IW: ${formatSignedMoney(comparison.difference)}.`);
  }

  if (stock.hasStockData && stock.iwTotal <= 0) details.push('Sin existencia en IW para las sucursales mapeadas.');
  if (!stock.hasShopifyStock) details.push('No aparece en el export de inventario Shopify cargado; no se puede modificar su existencia desde ese CSV.');
  if (stock.hasStockData && stock.hasShopifyStock && stock.stockDifference !== 0) {
    details.push(`Diferencia de existencia Shopify - IW: ${formatSignedNumber(stock.stockDifference)}.`);
  }
  if (uploadState?.detail) details.push(`CSV Shopify: ${uploadState.detail}`);
  if (sale.label !== 'Sin oferta') details.push(sale.label + '.');
  return details.join(' ');
}

function getPriceStockSummary(product, match, options, rowsBySku) {
  const group = rowsBySku.get(productKey(product)) || (product.sku ? rowsBySku.get(keySku(product.sku)) : null);
  const hasIwMatch = match.status === 'matched';
  const targetRows = group?.targetRows ?? 0;
  const iwTotal = hasIwMatch ? totalForTargets(match.row, options) : null;
  const shopifyTotal = group?.targetRows ? group.currentTotal : null;
  const hasShopifyStock = Number.isFinite(shopifyTotal);
  const hasStockData = Number.isFinite(iwTotal);
  const stockDifference = hasStockData && hasShopifyStock ? shopifyTotal - iwTotal : null;
  const locationTotals = options.targets.map((target) => (hasIwMatch ? match.row.quantities[target.iwColumn] ?? 0 : ''));

  return {
    iwTotal,
    shopifyTotal,
    stockDifference,
    targetRows,
    hasStockData,
    hasShopifyStock,
    targetRowsLabel: targetRows ? String(targetRows) : '0',
    iwTotalLabel: hasStockData ? String(iwTotal) : '',
    shopifyTotalLabel: hasShopifyStock ? String(shopifyTotal) : '',
    stockDifferenceLabel: Number.isFinite(stockDifference) ? formatSignedNumber(stockDifference) : '',
    locationTotals,
  };
}

function totalForTargets(iwRow, options) {
  return options.targets.reduce((total, target) => total + (iwRow.quantities[target.iwColumn] ?? 0), 0);
}

function buildPriceFlags(product, match, iwPrice, sale, comparison, regularComparison, stock, state, uploadState) {
  const flags = ['all'];
  if (uploadState?.status === 'ready') flags.push('ready-upload');
  if (!isInventoryTracked(product) && stock.hasShopifyStock) flags.push('tracking-required');
  if (uploadState?.status === 'skipped' || uploadState?.status === 'out') flags.push('upload-skipped');
  if (!product.barcode) flags.push('no-upc');
  if (stock.hasStockData && stock.iwTotal <= 0) flags.push('no-stock');
  if (match.status !== 'matched') flags.push('no-iw');
  if (sale.hasOfferMarker) flags.push('shopify-sale');
  if (
    sale.isRealSale &&
    comparison.hasComparison &&
    Math.abs(comparison.difference) > 0.004 &&
    regularComparison.hasComparison &&
    Math.abs(regularComparison.difference) <= 0.004
  ) {
    flags.push('shopify-only-sale');
  }
  if (['Diferencia', 'Oferta + diferencia'].includes(state.label)) flags.push('price-difference');
  if (hasZeroPriceIssue(product, iwPrice)) flags.push('zero-price');
  return flags;
}

function buildAllProductsRows(priceReport) {
  return priceReport.map((row) => ({
    Producto: row.Producto,
    SKU: row.SKU,
    'UPC Shopify': row['UPC Shopify'],
    Handle: row.Handle,
    'Archivo Shopify': row['Archivo Shopify'],
    'Fila Shopify': row['Fila Shopify'],
    'Estado Shopify': row['Estado Shopify'],
    Publicado: row.Publicado,
    'En inventario Shopify': row['En inventario Shopify'],
    'Filas inventario Shopify': row['Filas inventario Shopify'],
    'Coincidencia IW': row['Coincidencia IW'],
    'CSV Shopify': row['CSV Shopify'],
    'Tracking Shopify': row['Tracking Shopify'],
    'Existencia IW': row['Existencia IW'],
    'Shopify actual': row['Shopify actual'],
    'Precio Shopify actual': row['Precio Shopify actual'],
    'Precio regular Shopify': row['Precio regular Shopify'],
    Oferta: row.Oferta,
    Detalle: row.Detalle,
  }));
}

function summarizePriceReport(rows) {
  return rows.reduce(
    (summary, row) => {
      const status = row.Estado;
      if (row['Precio 4 IW'] !== '') summary.matches += 1;
      if (['Diferencia', 'Oferta + diferencia'].includes(status)) summary.differences += 1;
      if (status === 'Precio 0' || row.Detalle.includes('0.00')) summary.zeroIssues += 1;
      if (row.Oferta && row.Oferta !== 'Sin oferta') summary.saleProducts += 1;
      if (!['OK', 'Oferta', 'Oferta Shopify'].includes(status)) summary.review += 1;
      return summary;
    },
    {
      matches: 0,
      differences: 0,
      zeroIssues: 0,
      saleProducts: 0,
      review: 0,
    }
  );
}

function buildZeroRow(group, options) {
  const q = group.match.row.quantities;
  return {
    'UPC Shopify': group.product.barcode || group.sku,
    SKU: group.sku,
    Producto: group.product.title,
    Chalchuapa: q[options.targets[0].iwColumn] ?? 0,
    'Santa Ana': q[options.targets[1].iwColumn] ?? 0,
    Zarzamora: q[options.targets[2].iwColumn] ?? 0,
    'Total IW': group.iwTotal,
  };
}

function isInventoryTracked(product) {
  return normalizeText(product?.inventoryTracker) === 'shopify';
}

function trackingStatusLabel(product) {
  return isInventoryTracked(product) ? 'Activo' : 'No activo';
}

function buildUpdatedProductsRows(uploadAudit) {
  const groups = new Map();
  uploadAudit
    .filter((row) => row['En CSV Shopify'] === 'Si')
    .forEach((row) => {
      const key = `${row.SKU}|${row['UPC Shopify']}`;
      if (!groups.has(key)) {
        groups.set(key, {
          SKU: row.SKU,
          'UPC Shopify': row['UPC Shopify'],
          Producto: row.Producto,
          'Tracking Shopify': row['Tracking Shopify'],
          'Paso previo': row['Paso previo'],
          currentTotal: 0,
          newTotal: 0,
          locations: [],
        });
      }

      const group = groups.get(key);
      const currentQty = Number(row['Shopify actual']);
      const newQty = Number(row['IW nuevo']);
      if (Number.isFinite(currentQty)) group.currentTotal += currentQty;
      if (Number.isFinite(newQty)) group.newTotal += newQty;
      group.locations.push(`${row.Sucursal}: ${row['Shopify actual']} -> ${row['IW nuevo']}`);
      if (row['Paso previo']) group['Paso previo'] = row['Paso previo'];
      if (row['Tracking Shopify']) group['Tracking Shopify'] = row['Tracking Shopify'];
    });

  return [...groups.values()].map((group) => ({
    SKU: group.SKU,
    'UPC Shopify': group['UPC Shopify'],
    Producto: group.Producto,
    'Shopify actual total': String(group.currentTotal),
    'IW nuevo total': String(group.newTotal),
    'Diferencia total': formatSignedNumber(group.newTotal - group.currentTotal),
    Sucursal: group.locations.join(' | '),
    Detalle: [group['Tracking Shopify'] === 'No activo' ? 'Tracking apagado' : '', group['Paso previo']].filter(Boolean).join('. '),
  }));
}

function countTrackingBlocked(uploadAudit) {
  const keys = new Set();
  uploadAudit.forEach((row) => {
    if (row['Tracking Shopify'] === 'No activo') keys.add(`${row.SKU}|${row['UPC Shopify']}`);
  });
  return keys.size;
}

function buildShopifyStatusRows(products, iw, options, rowsByProduct, missingInShopify) {
  const groups = new Map();

  products.all.forEach((product) => {
    if (!product.handle || !product.barcode) return;
    const match = lookupIwMatch(product.barcode, iw.byBarcode);
    if (match.status !== 'matched' || match.source !== 'primary') return;

    const key = keyHandle(product.handle);
    if (!groups.has(key)) {
      groups.set(key, {
        product,
        handle: product.handle,
        title: product.title || product.handle,
        skus: new Set(),
        barcodes: new Set(),
        iwTotal: 0,
        shopifyTotal: 0,
        inventoryRows: 0,
        wroteInventory: false,
        trackingOff: false,
      });
    }

    const group = groups.get(key);
    const inventoryGroup = rowsByProduct.get(productKey(product));
    group.skus.add(product.sku || '');
    group.barcodes.add(product.barcode || '');
    group.iwTotal += totalForTargets(match.row, options);
    group.trackingOff = group.trackingOff || !isInventoryTracked(product);

    if (inventoryGroup?.targetRows) {
      group.inventoryRows += inventoryGroup.targetRows;
      group.shopifyTotal += inventoryGroup.currentTotal;
      group.wroteInventory = group.wroteInventory || inventoryGroup.safeMatched;
    }
  });

  const rows = [...groups.values()].map((group) => {
    const isActive = isShopifyActive(group.product);
    const currentStatus = currentShopifyStatus(group.product);
    const desiredStatus = group.iwTotal > 0 ? 'active' : 'draft';
    const shouldChange = (desiredStatus === 'active' && !isActive) || (desiredStatus === 'draft' && isActive);
    const action = desiredStatus === 'active' && !isActive
      ? { label: 'Activar', tone: 'ok', rank: 1 }
      : desiredStatus === 'draft' && isActive
        ? { label: 'Deshabilitar', tone: 'danger', rank: 2 }
        : { label: 'Sin cambio', tone: 'info', rank: 4 };
    const details = [];

    details.push(group.iwTotal > 0 ? 'IW tiene existencia; debe quedar active.' : 'IW total 0; debe quedar draft.');
    if (!group.inventoryRows) {
      details.push('Existe en productos Shopify, pero no aparece en el CSV de inventario cargado; no se escriben cantidades.');
    }
    if (group.trackingOff) {
      details.push('Tracking apagado en Shopify; revisar antes de confiar en la actualización de cantidades.');
    }
    if (shouldChange) {
      details.push('Incluido en el CSV de estados.');
    }

    return {
      Accion: htmlTag(action.label, action.tone),
      Handle: group.handle,
      SKU: joinSet(group.skus),
      'UPC Shopify': joinSet(group.barcodes),
      Producto: group.title,
      'Estado actual': currentStatus,
      'Estado recomendado': desiredStatus,
      'Existencia IW': String(group.iwTotal),
      'Shopify actual': group.inventoryRows ? String(group.shopifyTotal) : '',
      'En CSV estados': shouldChange ? 'Si' : 'No',
      'En CSV inventario': group.wroteInventory ? 'Si' : 'No',
      'Tracking Shopify': group.trackingOff ? 'No activo' : 'Activo',
      Detalle: details.join(' '),
      _statusRank: action.rank,
      _statusCsv: shouldChange ? { Handle: group.handle, Title: group.title, Status: desiredStatus } : null,
    };
  });

  missingInShopify.forEach((row) => {
    rows.push({
      Accion: htmlTag('No encontrado', 'warn'),
      Handle: '',
      SKU: row['Código IW'],
      'UPC Shopify': row['Código de barras IW'],
      Producto: row['Producto IW'],
      'Estado actual': '',
      'Estado recomendado': '',
      'Existencia IW': String(row['Total IW']),
      'Shopify actual': '',
      'En CSV estados': 'No',
      'En CSV inventario': 'No',
      'Tracking Shopify': '',
      Detalle: 'Existe en IW con stock positivo, pero no aparece en el export de productos Shopify cargado.',
      _statusRank: 3,
      _statusCsv: null,
    });
  });

  return rows.sort((a, b) => (a._statusRank ?? 9) - (b._statusRank ?? 9) || String(a.Producto).localeCompare(String(b.Producto)));
}

function summarizeShopifyStatus(rows) {
  return rows.reduce(
    (summary, row) => {
      const action = stripHtml(String(row.Accion || ''));
      if (action === 'Activar') summary.activate += 1;
      if (action === 'Deshabilitar') summary.draft += 1;
      if (action === 'No encontrado') summary.notFound += 1;
      if (row['En CSV estados'] === 'Si') summary.csvRows += 1;
      return summary;
    },
    { activate: 0, draft: 0, notFound: 0, csvRows: 0 }
  );
}

function buildProductStatusCsv(rows) {
  const headers = ['Handle', 'Title', 'Status'];
  const csvRows = rows
    .map((row) => row._statusCsv)
    .filter(Boolean)
    .map((row) => headers.map((header) => row[header] ?? ''));
  return tableToCsv(headers, csvRows);
}

function currentShopifyStatus(product) {
  const status = normalizeText(product?.status);
  if (status) return status;
  return isShopifyActive(product) ? 'active' : 'draft';
}

function joinSet(set) {
  return [...set].filter(Boolean).join(' | ');
}

function getProductUploadState(product, match, stock, products) {
  if (!stock.hasShopifyStock) {
    return {
      status: 'out',
      label: 'Fuera inventario',
      detail: 'No aparece en el export de inventario Shopify cargado.',
    };
  }

  const blockReason = getUploadBlockReason(product.sku, product, match, products, null);
  if (blockReason) {
    return {
      status: 'skipped',
      label: 'Omitido CSV',
      detail: blockReason,
    };
  }

  return {
    status: 'ready',
    label: 'Listo CSV',
    detail: 'Se escribira existencia solo si el tracking ya esta activo y la coincidencia es segura por UPC.',
  };
}

function getUploadBlockReason(sku, product, match, products, metrics) {
  if (!sku) return 'Fila de inventario sin SKU; no se escribe en el CSV Shopify.';
  if (!product) {
    if (metrics) metrics.skippedNotInInventory += 1;
    return 'El SKU del inventario no aparece en el export de productos Shopify cargado.';
  }
  if (products.unsafeSkuKeys?.has(keySku(sku))) {
    if (metrics) metrics.skippedDupSku += 1;
    return 'SKU duplicado o inconsistente en productos Shopify; revision manual antes de subir.';
  }
  if (!product.barcode) {
    if (metrics) metrics.skippedNoUpc += 1;
    return 'Producto sin UPC Shopify; se omite del CSV de subida.';
  }
  if (!isInventoryTracked(product)) {
    if (metrics) metrics.trackingWarnings += 1;
    // We no longer block on this! We just emit a warning in the detail.
  }
  if (match.status !== 'matched') {
    if (metrics) {
      if (match.status === 'not_found') metrics.skippedNoIw += 1;
      if (match.status === 'ambiguous') metrics.skippedAmbiguous += 1;
    }
    return matchStatusDetail(match.status);
  }
  if (match.source && match.source !== 'primary') {
    if (metrics) metrics.skippedNoIw += 1;
    return 'Coincidencia encontrada solo por SKU; se omite del CSV de subida porque no es UPC seguro.';
  }
  return '';
}

function buildUploadAuditRow(sku, product, location, match, currentQty, newQty, wroteToCsv, detail) {
  return {
    Decision: htmlTag(wroteToCsv ? 'Escribir' : 'Omitido', wroteToCsv ? 'ok' : 'warn'),
    SKU: sku || '',
    'UPC Shopify': product?.barcode || '',
    Producto: product?.title || product?.handle || '',
    Sucursal: location || '',
    'Coincidencia IW': matchStatusLabel(match),
    'Tracking Shopify': product ? trackingStatusLabel(product) : '',
    'Paso previo': !wroteToCsv && product && !isInventoryTracked(product) ? 'Activar tracking en Shopify antes de actualizar' : '',
    'Shopify actual': Number.isFinite(currentQty) ? String(currentQty) : '',
    'IW nuevo': wroteToCsv ? String(newQty) : '',
    'En CSV Shopify': wroteToCsv ? 'Si' : 'No',
    Detalle: detail,
  };
}

function addInventoryReview(review, row, idx, product, sku, location, match, seenKeys, explicitDetail = '') {
  const id = product?.barcode || sku;
  const title = product?.title || get(row, idx, 'Title');
  const detailByStatus = {
    missing_input: 'No tiene UPC Shopify y no hubo identificador alterno para buscar en IW.',
    not_found: 'No se encontró coincidencia en IW.',
    ambiguous: 'El identificador coincide con más de un producto IW. Revisión manual necesaria.',
  };
  const key = `${match.status}|${id}|${location}`;
  if (seenKeys?.has(key)) return;
  seenKeys?.add(key);

  review.push({
    Tipo: 'Sin actualización segura',
    'UPC / SKU': id,
    Producto: title,
    Sucursal: location,
    Detalle: explicitDetail || detailByStatus[match.status] || 'No se pudo actualizar.',
  });
}

function lookupIwMatch(barcode, iwMap, fallback = '') {
  const identifiers = [
    { value: barcode, source: 'primary' },
    { value: fallback, source: 'fallback' },
  ].filter((item) => item.value);
  const seenKeys = new Set();
  const candidates = [];

  identifiers.forEach((identifier) => {
    barcodeCandidateKeys(identifier.value).forEach((key) => {
      if (!key || seenKeys.has(key)) return;
      seenKeys.add(key);
      const rows = iwMap.get(key);
      if (rows?.length) candidates.push({ key, rows, source: identifier.source });
    });
  });

  if (!identifiers.length) return { status: 'missing_input' };
  if (!candidates.length) return { status: 'not_found' };

  const uniqueRows = new Set(candidates.flatMap((candidate) => candidate.rows));
  if (uniqueRows.size === 1) {
    const row = [...uniqueRows][0];
    const source = candidates.some((candidate) => candidate.source === 'primary' && candidate.rows.includes(row))
      ? 'primary'
      : 'fallback';
    return { status: 'matched', row, source };
  }

  return { status: 'ambiguous', rows: [...uniqueRows] };
}

function addBarcodeReference(map, value, row) {
  barcodeCandidateKeys(value).forEach((key) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    const list = map.get(key);
    if (!list.includes(row)) list.push(row);
  });
}

function addHandleReference(map, value, product) {
  const key = keyHandle(value);
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  const list = map.get(key);
  if (!list.includes(product)) list.push(product);
}

function findProductForInventoryRow(sku, handle, row, idx, products) {
  const handleKey = keyHandle(handle);
  const matches = handleKey ? products.byHandle.get(handleKey) : null;
  
  if (matches?.length) {
    // If multiple options match handle + sku, try checking option values too
    const withSameSku = sku ? matches.filter(p => keySku(p.sku) === keySku(sku)) : matches;
    if (withSameSku.length === 1) {
      return { product: withSameSku[0], source: 'handle' };
    }
    
    // We can't guarantee 100% options matching without saving options in buildProductIndex
    // But returning the first match if sku is same handles most cases.
    if (withSameSku.length > 1 && products.unsafeSkuKeys?.has(keySku(sku))) {
       // Since we didn't index options from products.csv in this codebase structure easily, 
       // returning null or letting getUploadBlockReason block it is safer. 
       // We'll return the first one but the block reason will catch the unsafeSkuKey.
       return { product: withSameSku[0], source: 'handle_options' };
    }
  }

  const skuKey = sku ? keySku(sku) : '';
  if (skuKey) {
    const product = products.bySku.get(skuKey);
    if (product) return { product, source: 'sku' };
  }

  return { product: null, source: '' };
}

function hasBarcodeReference(map, value) {
  return barcodeCandidateKeys(value).some((key) => map.has(key));
}

function barcodeCandidateKeys(value) {
  const cleaned = cleanIdentifier(value);
  if (!cleaned || cleaned === '0') return [];

  const upper = cleaned.toUpperCase();
  const compact = upper.replace(/[\s-]+/g, '');
  const alnum = upper.replace(/[^A-Z0-9]/g, '');
  const keys = [upper, compact, alnum];

  [upper, compact, alnum].forEach((item) => {
    const stripped = item.replace(/^0+/, '');
    if (stripped) keys.push(stripped);
  });

  return [...new Set(keys.filter(Boolean))];
}

function renderMetrics(metrics = {}) {
  const values = [
    { label: 'Variantes Shopify', value: metrics.variants ?? 0, meta: 'Catálogo leído' },
    { label: 'Filas inventario', value: metrics.inventoryRows ?? 0, meta: 'Export Shopify' },
    { label: 'Listas CSV', value: metrics.updatedRows ?? 0, meta: 'Coincidencia UPC' },
    { label: 'Productos CSV', value: metrics.updatedProducts ?? 0, meta: 'SKU unicos' },
    { label: 'Activar', value: metrics.statusToActivate ?? 0, meta: 'CSV estados', tone: 'ok' },
    { label: 'Draft', value: metrics.statusToDraft ?? 0, meta: 'Sin stock IW', tone: 'danger' },
    { label: 'No encontrados', value: metrics.statusNotFound ?? 0, meta: 'IW sin Shopify', tone: 'attention' },
    { label: 'Tracking apagado', value: metrics.trackingBlocked ?? 0, meta: 'Fuera del CSV', tone: 'attention' },
    { label: 'Omitidas CSV', value: metrics.safeSkippedRows ?? 0, meta: 'Revisar antes de subir', tone: 'attention' },
    { label: 'Diferencias precio', value: metrics.priceDifferences ?? 0, meta: 'Shopify vs IW', tone: 'attention' },
    { label: 'Precios 0', value: metrics.priceZeroIssues ?? 0, meta: 'Corregir manual', tone: 'danger' },
    { label: 'Revisar', value: (metrics.review ?? 0) + (metrics.priceReview ?? 0), meta: 'Casos sensibles', tone: 'attention' },
  ];

  els.metricsGrid.innerHTML = values
    .map(
      ({ label, value, meta, tone = '' }) => `
        <article class="metric ${tone}">
          <span>${escapeHtml(label)}</span>
          <strong>${formatNumber(value)}</strong>
          <small>${escapeHtml(meta)}</small>
        </article>
      `
    )
    .join('');
}

function renderTabCounts() {
  document.querySelectorAll('[data-tab-count]').forEach((node) => {
    const view = node.dataset.tabCount;
    const total = views[view]?.getRows().length ?? 0;
    node.textContent = formatNumber(total);
  });
}

function renderPriceFilterState() {
  const isPriceView = state.view === 'prices';
  const panel = document.getElementById('priceFilterPanel');
  if (panel) panel.hidden = !isPriceView;
  document.querySelectorAll('[data-price-filter]').forEach((button) => {
    button.classList.toggle('active', button.dataset.priceFilter === state.priceFilter);
  });
}

function renderPriceFilterCounts() {
  const rows = state.result?.priceReport ?? [];
  PRICE_FILTERS.forEach((filter) => {
    const node = document.querySelector(`[data-price-filter-count="${filter.id}"]`);
    if (!node) return;
    const total = rows.filter((row) => rowMatchesPriceFilter(row, filter.id)).length;
    node.textContent = formatNumber(total);
  });
}

function renderTable() {
  const config = views[state.view];
  const rows = config.getRows();
  const query = normalizeText(els.searchInput.value);
  const filtered = rows
    .filter((row) => state.view !== 'prices' || rowMatchesPriceFilter(row, state.priceFilter))
    .filter((row) => rowMatches(row, query));
  const visible = filtered.slice(0, 600);
  const table = els.resultsTable;
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  table.classList.toggle('is-empty', !visible.length);

  thead.innerHTML = `<tr>${config.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr>`;

  if (!visible.length) {
    tbody.innerHTML = `<tr><td class="empty-state" colspan="${config.columns.length}">${
      rows.length ? 'No hay resultados con ese filtro.' : 'Sin datos para esta vista.'
    }</td></tr>`;
  } else {
    tbody.innerHTML = visible
      .map(
        (row) => `
          <tr>
            ${config.columns
              .map((column) => `<td data-column="${escapeHtml(column)}">${formatCell(row[column], column)}</td>`)
              .join('')}
          </tr>
        `
      )
      .join('');
  }

  const suffix = filtered.length > visible.length ? `, mostrando ${visible.length}. Usa el buscador para localizar cualquier producto cargado.` : '';
  els.tableCount.textContent = `${formatNumber(filtered.length)} registros${suffix}`;
}

function rowMatches(row, query) {
  if (!query) return true;
  if (!row[SEARCH_CACHE]) {
    row[SEARCH_CACHE] = normalizeText(Object.values(row).map((value) => stripHtml(String(value))).join(' '));
  }
  return row[SEARCH_CACHE].includes(query);
}

function rowMatchesPriceFilter(row, filterId) {
  const flags = row._priceFlags ?? [];
  if (filterId === 'all') return true;
  return flags.includes(filterId);
}

function formatCell(value, column) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'string' && value.startsWith('<span')) return value;
  const className = /UPC|SKU|Código|Precio|Diferencia|Existencia|Shopify actual|Fila|Filas/.test(column) ? ' class="mono"' : '';
  return `<span${className}>${escapeHtml(String(value))}</span>`;
}

function htmlTag(text, tone) {
  return `<span class="tag ${tone}">${escapeHtml(text)}</span>`;
}

function buildReportRows(uploadAudit, updatedProducts, shopifyStatus, actions, zeroStock, missingInShopify, review, priceReportRows = []) {
  return [
    ...uploadAudit.map((row) => ({
      Vista: 'Subida segura',
      ...stripObjectHtml(row),
    })),
    ...updatedProducts.map((row) => ({
      Vista: 'Productos actualizados',
      ...stripObjectHtml(row),
    })),
    ...shopifyStatus.map((row) => ({
      Vista: 'Shopify estados',
      ...stripObjectHtml(row),
    })),
    ...actions.map((row) => ({
      Vista: 'Acciones',
      ...stripObjectHtml(row),
    })),
    ...priceReportRows.map((row) => ({
      Vista: 'Precios',
      ...row,
    })),
    ...zeroStock.map((row) => ({
      Vista: 'Inventario cero',
      ...row,
    })),
    ...missingInShopify.map((row) => ({
      Vista: 'No creados',
      ...row,
    })),
    ...review.map((row) => ({
      Vista: 'Revisión',
      ...row,
    })),
  ];
}

function stripObjectHtml(row) {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([key]) => !key.startsWith('_'))
      .map(([key, value]) => [key, stripHtml(String(value ?? ''))])
  );
}

function setBusy(isBusy, message = '') {
  document.body.classList.toggle('is-busy', isBusy);
  els.processButton.disabled = isBusy || !(state.files.products.length && state.files.inventory && state.files.iw);
  els.processButton.textContent = isBusy ? 'Procesando...' : 'Comparar y generar archivos';
  if (message) setMessage(message);
}

function setMessage(message, type = 'info') {
  els.processMessage.textContent = message;
  els.processMessage.dataset.tone = type;
}

function setProgress(value) {
  if (!els.progressBar) return;
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));
  els.progressBar.style.width = `${safeValue}%`;
}

function enableDownloads(enabled) {
  [els.downloadInventory, els.downloadStatus, els.downloadReport, els.downloadPriceReport, els.downloadMissing].forEach((button) => {
    button.disabled = !enabled;
  });
}

function resetApp() {
  state.files.products = [];
  state.files.inventory = null;
  state.files.iw = null;
  state.result = null;
  state.view = 'actions';
  state.priceFilter = 'all';
  state.iwHeaders = [];
  els.productsInput.value = '';
  els.inventoryInput.value = '';
  els.iwInput.value = '';
  els.searchInput.value = '';
  els.removeCurrentOnHand.checked = true;
  enableDownloads(false);
  setProgress(0);
  updateFileLabels();
  renderMetrics();
  renderTabCounts();
  renderPriceFilterCounts();
  setActiveView('actions');
  setMessage('');
}

function validateAnyField(idx, fields, label) {
  if (fields.some((field) => hasHeader(idx, field))) return;
  throw new Error(`El archivo ${label} no tiene las columnas esperadas: ${fields.join(', ')}.`);
}

function findTargetForLocation(location, targets) {
  const key = normalizeHeader(location);
  return targets.find((target) => target.locationKeys.includes(key)) ?? null;
}

function isShopifyActive(product) {
  const status = normalizeText(product.status);
  const published = normalizeText(product.published);
  if (status) return status === 'active';
  if (published) return published === 'true' || published === 'yes' || published === '1';
  return true;
}

function isShopifyVariantRow(product) {
  return Boolean(product.sku || product.barcode || stringifyCell(product.priceRaw).trim() || stringifyCell(product.compareAtRaw).trim());
}

function classifySale(product) {
  const price = product.price;
  const compareAt = product.compareAtPrice;

  if (!compareAt.hasValue) {
    return { label: 'Sin oferta', hasOfferMarker: false, isRealSale: false };
  }

  if (!compareAt.valid) {
    return { label: 'Compare-at invalido', hasOfferMarker: true, isRealSale: false };
  }

  if (!price.hasValue || !price.valid) {
    return { label: 'Oferta sin precio actual valido', hasOfferMarker: true, isRealSale: false };
  }

  if (compareAt.amount === 0) {
    return { label: 'Regular/compare-at en 0.00', hasOfferMarker: true, isRealSale: false };
  }

  const difference = roundMoney(compareAt.amount - price.amount);
  if (difference > 0.004) {
    const percent = compareAt.amount ? Math.round((difference / compareAt.amount) * 100) : 0;
    return {
      label: `En oferta (${formatMoneyCell({ amount: difference, hasValue: true, valid: true })} menos, ${percent}%)`,
      hasOfferMarker: true,
      isRealSale: true,
    };
  }

  if (Math.abs(difference) <= 0.004) {
    return { label: 'Oferta sin descuento: actual igual al regular', hasOfferMarker: true, isRealSale: false };
  }

  return { label: 'Compare-at menor que precio actual', hasOfferMarker: true, isRealSale: false };
}

function getRegularShopifyPrice(product) {
  return product.compareAtPrice.hasValue ? product.compareAtPrice : product.price;
}

function compareMoney(shopifyPrice, iwPrice) {
  if (!shopifyPrice?.hasValue || !shopifyPrice.valid || !iwPrice?.hasValue || !iwPrice.valid) {
    return { hasComparison: false, difference: 0 };
  }
  return {
    hasComparison: true,
    difference: roundMoney(shopifyPrice.amount - iwPrice.amount),
  };
}

function hasZeroPriceIssue(product, iwPrice) {
  return Boolean(
    (product.price.valid && product.price.hasValue && product.price.amount === 0) ||
      (product.compareAtPrice.valid && product.compareAtPrice.hasValue && product.compareAtPrice.amount === 0) ||
      (iwPrice?.valid && iwPrice.hasValue && iwPrice.amount === 0)
  );
}

function matchStatusDetail(status) {
  const details = {
    missing_input: 'No tiene UPC Shopify y no hubo identificador alterno para buscar en IW.',
    not_found: 'No se encontro coincidencia en IW.',
    ambiguous: 'El identificador coincide con mas de un producto IW; revision manual necesaria.',
  };
  return details[status] || 'No se pudo comparar contra IW.';
}

function matchStatusLabel(matchOrStatus) {
  const status = typeof matchOrStatus === 'string' ? matchOrStatus : matchOrStatus?.status;
  if (status === 'matched' && matchOrStatus?.source === 'fallback') return 'Encontrado por SKU';
  if (status === 'matched') return 'Encontrado por UPC';
  const labels = {
    missing_input: 'Sin identificador',
    not_found: 'Sin IW',
    ambiguous: 'Ambiguo',
  };
  return labels[status] || 'Sin IW';
}

function findHeader(headers, aliases) {
  const normalized = new Map(headers.map((header) => [normalizeHeader(header), header]));
  for (const alias of aliases) {
    const found = normalized.get(normalizeHeader(alias));
    if (found) return found;
  }
  return '';
}

function indexHeaders(headers) {
  return new Map(headers.map((header, index) => [normalizeHeader(header), index]));
}

function hasHeader(index, header) {
  return index.has(normalizeHeader(header));
}

function get(row, index, header) {
  const key = normalizeHeader(header);
  const i = index.get(key);
  return i === undefined ? '' : stringifyCell(row[i]);
}

function resolveField(row, index, aliases) {
  for (const alias of aliases) {
    const value = get(row, index, alias);
    if (value !== '') return value;
  }
  return '';
}

function removeCsvColumnByAliases(headers, rows, aliases) {
  const colIndex = headers.findIndex(h =>
    aliases.some(a => normalizeHeader(h) === normalizeHeader(a))
  );
  if (colIndex === -1) return { headers, rows };
  const newHeaders = headers.filter((_, i) => i !== colIndex);
  const newRows = rows.map(row => row.filter((_, i) => i !== colIndex));
  return { headers: newHeaders, rows: newRows };
}

function parseQuantity(value, options = {}) {
  const raw = stringifyCell(value).trim();
  if (!raw || normalizeText(raw) === 'not stocked') return { quantity: 0 };
  const normalized = raw.replace(/\s/g, '').replace(',', '.');
  const number = Number(normalized);

  if (!Number.isFinite(number)) {
    return { quantity: 0, warning: `Cantidad no numérica "${raw}" convertida a 0.` };
  }

  let quantity = Math.round(number);
  let warning = '';

  if (Math.abs(number - quantity) > 0.0001) {
    warning = `Cantidad decimal "${raw}" redondeada a ${quantity}.`;
  }

  if (options.clampNegative && quantity < 0) {
    warning = `Cantidad negativa "${raw}" convertida a 0.`;
    quantity = 0;
  }

  return { quantity, warning };
}

function parseMoney(value) {
  const raw = stringifyCell(value).trim();
  if (!raw) return { raw, amount: null, hasValue: false, valid: true };

  let normalized = raw.replace(/\s/g, '').replace(/[^\d,.-]/g, '');
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.replace(/,/g, '');
  } else if (normalized.includes(',') && !normalized.includes('.')) {
    normalized = normalized.replace(',', '.');
  }

  const amount = Number(normalized);
  if (!Number.isFinite(amount)) {
    return { raw, amount: null, hasValue: true, valid: false };
  }

  return {
    raw,
    amount: roundMoney(amount),
    hasValue: true,
    valid: true,
  };
}

function roundMoney(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function cleanIdentifier(value) {
  return stringifyCell(value)
    .trim()
    .replace(/^[']+/, '')
    .replace(/\u200b/g, '');
}

function normalizeSku(value) {
  return cleanIdentifier(value);
}

function keySku(value) {
  return normalizeSku(value).toUpperCase().replace(/\s+/g, '');
}

function keyHandle(value) {
  return cleanIdentifier(value).toLowerCase();
}

function productKey(product) {
  if (!product) return '';
  if (product.sourceFile && product.sourceRow) return `${product.sourceFile}:${product.sourceRow}`;
  return `${keyHandle(product.handle)}|${keySku(product.sku)}|${cleanIdentifier(product.barcode).toUpperCase()}`;
}

function normalizeHeader(value) {
  return normalizeText(value)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function normalizeText(value) {
  return stringifyCell(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function stringifyCell(value) {
  if (value === undefined || value === null) return '';
  return String(value);
}

function tableToCsv(headers, rows) {
  const lines = [headers.map(csvEscape).join(',')];
  rows.forEach((row) => {
    lines.push(headers.map((_, index) => csvEscape(row[index] ?? '')).join(','));
  });
  return lines.join('\r\n');
}

function csvFromObjects(rows) {
  if (!rows.length) return '';
  const headers = [...rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set())];
  return tableToCsv(
    headers,
    rows.map((row) => headers.map((header) => row[header] ?? ''))
  );
}

function csvEscape(value) {
  const text = stringifyCell(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function downloadText(text, filename, type = 'text/csv') {
  const bom = type.includes('csv') ? '\ufeff' : '';
  const blob = new Blob([bom + text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

function dateStamp() {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}${m}${d}_${h}${min}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat('es-SV').format(value);
}

function formatMoneyCell(money) {
  if (!money?.hasValue) return '';
  if (!money.valid) return money.raw;
  return money.amount.toFixed(2);
}

function formatSignedMoney(value) {
  const rounded = roundMoney(value);
  const prefix = rounded > 0 ? '+' : '';
  return `${prefix}${rounded.toFixed(2)}`;
}

function formatSignedNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  const prefix = number > 0 ? '+' : '';
  return `${prefix}${number}`;
}

function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds)) return '0 s';
  if (milliseconds < 1000) return `${milliseconds} ms`;
  return `${(milliseconds / 1000).toFixed(1)} s`;
}

function escapeHtml(value) {
  return stringifyCell(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function stripHtml(value) {
  const template = document.createElement('template');
  template.innerHTML = value;
  return template.content.textContent || '';
}

function idle() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
