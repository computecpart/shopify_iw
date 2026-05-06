const state = {
  files: {
    products: [],
    inventory: null,
    iw: null,
  },
  iwHeaders: [],
  result: null,
  view: 'actions',
};

const SEARCH_CACHE = Symbol('searchCache');
const REQUIRED_PRODUCT_FIELDS = ['Variant SKU', 'SKU'];
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
};

const views = {
  actions: {
    columns: ['Acción', 'UPC Shopify', 'SKU', 'Producto', 'IW Total', 'Shopify actual', 'Detalle'],
    getRows: () => state.result?.actions ?? [],
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
    'downloadReport',
    'downloadMissing',
    'resultsTable',
    'searchInput',
    'tableCount',
    'resetButton',
    'clearExistingNew',
    'clampNegative',
    'skuFallback',
    'setUnmatchedZero',
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
  els.downloadReport.addEventListener('click', () => {
    if (!state.result) return;
    downloadText(
      csvFromObjects(state.result.reportRows),
      `reporte_comparacion_shopify_iw_${dateStamp()}.csv`,
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
      state.view = button.dataset.view;
      document.querySelectorAll('.tab').forEach((tab) => {
        tab.classList.toggle('active', tab === button);
      });
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
  els.processButton.disabled = !ready;
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
    renderTable();
    enableDownloads(true);
    setProgress(100);
    setMessage(
      `Comparación lista: ${formatNumber(comparison.metrics.updatedRows)} filas preparadas para Shopify en ${formatDuration(
        comparison.metrics.elapsedMs
      )}.`
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
    clearExistingNew: els.clearExistingNew.checked,
    clampNegative: els.clampNegative.checked,
    skuFallback: els.skuFallback.checked,
    setUnmatchedZero: els.setUnmatchedZero.checked,
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
  const barcodeKeys = new Map();
  const identifierKeys = new Map();
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
      const title = get(row, idx, 'Title') || lastTitle;
      const handle = get(row, idx, 'Handle') || lastHandle;
      const status = get(row, idx, 'Status') || lastStatus;
      const published = get(row, idx, 'Published') || lastPublished;
      const sku = normalizeSku(get(row, idx, 'Variant SKU') || get(row, idx, 'SKU'));
      const barcodeRaw = get(row, idx, 'Variant Barcode') || get(row, idx, 'Barcode');
      const barcode = cleanIdentifier(barcodeRaw);

      if (get(row, idx, 'Title')) lastTitle = get(row, idx, 'Title');
      if (get(row, idx, 'Handle')) lastHandle = get(row, idx, 'Handle');
      if (get(row, idx, 'Status')) lastStatus = get(row, idx, 'Status');
      if (get(row, idx, 'Published')) lastPublished = get(row, idx, 'Published');

      if (!sku) return;
      variants += 1;

      const product = {
        sku,
        barcode,
        barcodeRaw,
        title,
        handle,
        status,
        published,
        sourceFile: table.fileName,
        sourceRow: rowIndex + 2,
      };

      const existing = bySku.get(keySku(sku));
      if (existing && existing.barcode && barcode && existing.barcode !== barcode) {
        review.push({
          Tipo: 'SKU duplicado',
          'UPC / SKU': sku,
          Producto: title || existing.title,
          Sucursal: '',
          Detalle: `El SKU aparece con UPC distintos: ${existing.barcode} y ${barcode}.`,
        });
      }

      if (!existing || (!existing.barcode && barcode)) {
        bySku.set(keySku(sku), product);
      }

      if (barcode) {
        addBarcodeReference(barcodeKeys, barcode, product);
      }
      addBarcodeReference(identifierKeys, barcode || sku, product);
      if (barcode && sku) addBarcodeReference(identifierKeys, sku, product);
    });
  });

  return { bySku, barcodeKeys, identifierKeys, review, variants };
}

function buildIwIndex(table, options) {
  const idx = indexHeaders(table.headers);
  const barcodeHeader = findHeader(table.headers, IW_FIELD_ALIASES.barcode);
  const codeHeader = findHeader(table.headers, IW_FIELD_ALIASES.code);
  const titleHeader = findHeader(table.headers, IW_FIELD_ALIASES.title);

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
  const hasAllStates = hasHeader(idx, 'Location') && hasHeader(idx, 'On hand (new)');
  const hasAvailableColumns = !hasAllStates && options.targets.some((target) => hasHeader(idx, target.shopify));

  if (!hasAllStates && !hasAvailableColumns) {
    throw new Error('El inventario Shopify no parece tener formato All states ni columnas por sucursal.');
  }

  const outputRows = inventoryTable.rows.map((row) => [...row]);
  const review = [...products.review, ...iw.review];
  const inventoryReviewKeys = new Set();
  const rowsBySku = new Map();
  const matchedIwRows = new Set();
  let updatedRows = 0;
  let matchedRows = 0;
  let unmatchedRows = 0;

  if (hasAllStates && options.clearExistingNew) {
    const newIndex = idx.get(normalizeHeader('On hand (new)'));
    outputRows.forEach((row) => {
      row[newIndex] = '';
    });
  }

  inventoryTable.rows.forEach((row, rowIndex) => {
    const outputRow = outputRows[rowIndex];
    const sku = normalizeSku(get(row, idx, 'SKU') || get(row, idx, 'Variant SKU'));
    const location = get(row, idx, 'Location');
    const target = hasAllStates ? findTargetForLocation(location, options.targets) : null;
    const product = products.bySku.get(keySku(sku));
    const fallbackId = options.skuFallback ? sku : '';
    const match = lookupIwMatch(product?.barcode || '', iw.byBarcode, fallbackId);
    const currentQty = parseQuantity(
      get(row, idx, 'On hand (current)') || get(row, idx, 'Available (not editable)'),
      { clampNegative: false }
    ).quantity;

    if (!rowsBySku.has(keySku(sku))) {
      rowsBySku.set(keySku(sku), {
        sku,
        product,
        match,
        currentTotal: 0,
        iwTotal: 0,
        targetRows: 0,
        updatedLocations: [],
      });
    }

    const group = rowsBySku.get(keySku(sku));

    if (hasAllStates) {
      if (!target) return;
      group.targetRows += 1;
      group.currentTotal += currentQty;

      if (match.status === 'matched') {
        const qty = match.row.quantities[target.iwColumn] ?? 0;
        outputRow[idx.get(normalizeHeader('On hand (new)'))] = String(qty);
        group.iwTotal += qty;
        group.updatedLocations.push(`${target.label}: ${qty}`);
        matchedRows += 1;
        updatedRows += 1;
        matchedIwRows.add(match.row);
      } else if (options.setUnmatchedZero) {
        outputRow[idx.get(normalizeHeader('On hand (new)'))] = '0';
        unmatchedRows += 1;
        updatedRows += 1;
        addInventoryReview(review, row, idx, product, sku, location, match, inventoryReviewKeys);
      } else {
        unmatchedRows += 1;
        addInventoryReview(review, row, idx, product, sku, location, match, inventoryReviewKeys);
      }
      return;
    }

    if (match.status === 'matched') {
      matchedIwRows.add(match.row);
      group.targetRows = options.targets.length;
      group.iwTotal = 0;
      group.currentTotal = 0;
      group.updatedLocations = [];
      options.targets.forEach((target) => {
        const col = findHeader(inventoryTable.headers, [target.shopify, ...(target.aliases ?? [])]);
        if (!col) return;
        const qty = match.row.quantities[target.iwColumn] ?? 0;
        outputRow[idx.get(normalizeHeader(col))] = String(qty);
        group.iwTotal += qty;
        group.currentTotal += parseQuantity(get(row, idx, col), { clampNegative: false }).quantity;
        group.updatedLocations.push(`${target.label}: ${qty}`);
      });
      matchedRows += 1;
      updatedRows += 1;
    } else {
      unmatchedRows += 1;
      addInventoryReview(review, row, idx, product, sku, '', match, inventoryReviewKeys);
    }
  });

  const actions = [];
  const zeroStock = [];

  rowsBySku.forEach((group) => {
    if (!group.sku || !group.product || !group.targetRows) return;
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

  const shopifyReferenceKeys = options.skuFallback ? products.identifierKeys : products.barcodeKeys;
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

  const reportRows = buildReportRows(actions, zeroStock, missingInShopify, review);
  const inventoryCsv = tableToCsv(inventoryTable.headers, outputRows);

  return {
    inventoryCsv,
    actions,
    zeroStock,
    missingInShopify,
    review,
    reportRows,
    metrics: {
      variants: products.variants,
      inventoryRows: inventoryTable.rows.length,
      updatedRows,
      matchedRows,
      unmatchedRows,
      zeroStock: zeroStock.length,
      missingInShopify: missingInShopify.length,
      review: review.length,
      actions: actions.length,
      iwRows: iw.rows.length,
      matchedIwRows: matchedIwRows.size,
    },
  };
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

function addInventoryReview(review, row, idx, product, sku, location, match, seenKeys) {
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
    Detalle: detailByStatus[match.status] || 'No se pudo actualizar.',
  });
}

function lookupIwMatch(barcode, iwMap, fallback = '') {
  const identifiers = [barcode, fallback].filter(Boolean);
  const seenKeys = new Set();
  const candidates = [];

  identifiers.forEach((identifier) => {
    barcodeCandidateKeys(identifier).forEach((key) => {
      if (!key || seenKeys.has(key)) return;
      seenKeys.add(key);
      const rows = iwMap.get(key);
      if (rows?.length) candidates.push({ key, rows });
    });
  });

  if (!identifiers.length) return { status: 'missing_input' };
  if (!candidates.length) return { status: 'not_found' };

  const uniqueRows = new Set(candidates.flatMap((candidate) => candidate.rows));
  if (uniqueRows.size === 1) return { status: 'matched', row: [...uniqueRows][0] };

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
    ['Variantes Shopify', metrics.variants ?? 0],
    ['Filas inventario', metrics.inventoryRows ?? 0],
    ['Actualizadas', metrics.updatedRows ?? 0],
    ['Revisar', metrics.review ?? 0],
  ];

  els.metricsGrid.innerHTML = values
    .map(
      ([label, value], index) => `
        <article class="metric ${index === 3 ? 'attention' : ''}">
          <span>${escapeHtml(label)}</span>
          <strong>${formatNumber(value)}</strong>
        </article>
      `
    )
    .join('');
}

function renderTable() {
  const config = views[state.view];
  const rows = config.getRows();
  const query = normalizeText(els.searchInput.value);
  const filtered = rows.filter((row) => rowMatches(row, query));
  const visible = filtered.slice(0, 600);
  const table = els.resultsTable;
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');

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
              .map((column) => `<td>${formatCell(row[column], column)}</td>`)
              .join('')}
          </tr>
        `
      )
      .join('');
  }

  const suffix = filtered.length > visible.length ? `, mostrando ${visible.length}` : '';
  els.tableCount.textContent = `${formatNumber(filtered.length)} registros${suffix}`;
}

function rowMatches(row, query) {
  if (!query) return true;
  if (!row[SEARCH_CACHE]) {
    row[SEARCH_CACHE] = normalizeText(Object.values(row).map((value) => stripHtml(String(value))).join(' '));
  }
  return row[SEARCH_CACHE].includes(query);
}

function formatCell(value, column) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'string' && value.startsWith('<span')) return value;
  const className = /UPC|SKU|Código/.test(column) ? ' class="mono"' : '';
  return `<span${className}>${escapeHtml(String(value))}</span>`;
}

function htmlTag(text, tone) {
  return `<span class="tag ${tone}">${escapeHtml(text)}</span>`;
}

function buildReportRows(actions, zeroStock, missingInShopify, review) {
  return [
    ...actions.map((row) => ({
      Vista: 'Acciones',
      ...stripObjectHtml(row),
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
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, stripHtml(String(value ?? ''))]));
}

function setBusy(isBusy, message = '') {
  els.processButton.disabled = isBusy || !(state.files.products.length && state.files.inventory && state.files.iw);
  els.processButton.textContent = isBusy ? 'Procesando...' : 'Comparar y generar archivos';
  if (message) setMessage(message);
}

function setMessage(message, type = 'info') {
  els.processMessage.textContent = message;
  els.processMessage.style.color = type === 'error' ? 'var(--danger)' : 'var(--muted)';
}

function setProgress(value) {
  if (!els.progressBar) return;
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));
  els.progressBar.style.width = `${safeValue}%`;
}

function enableDownloads(enabled) {
  [els.downloadInventory, els.downloadReport, els.downloadMissing].forEach((button) => {
    button.disabled = !enabled;
  });
}

function resetApp() {
  state.files.products = [];
  state.files.inventory = null;
  state.files.iw = null;
  state.result = null;
  state.iwHeaders = [];
  els.productsInput.value = '';
  els.inventoryInput.value = '';
  els.iwInput.value = '';
  els.searchInput.value = '';
  enableDownloads(false);
  setProgress(0);
  updateFileLabels();
  renderMetrics();
  renderTable();
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
  return normalizeSku(value).toUpperCase();
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

function downloadText(text, filename, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
