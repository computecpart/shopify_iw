const IW_FIELD_ALIASES = {
  barcode: ['Código de Barras', 'Codigo de Barras', 'Código Barras', 'Barcode', 'UPC'],
  code: ['Código', 'Codigo', 'SKU', 'Item'],
  title: ['Nombre Comercial', 'Producto', 'Descripción', 'Descripcion', 'Nombre'],
  price4: ['Precio 4', 'Price 4', 'Precio4'],
};

let xlsxReady = false;

self.onmessage = async (event) => {
  if (event.data?.type !== 'process') return;

  try {
    const { files, options } = event.data;
    postProgress('Leyendo productos Shopify...', 10);
    const productTables = [];
    for (let i = 0; i < files.products.length; i += 1) {
      productTables.push(await readCsvFile(files.products[i]));
      postProgress(
        `Leyendo productos Shopify (${i + 1}/${files.products.length})...`,
        12 + Math.round(((i + 1) / files.products.length) * 20)
      );
    }

    postProgress('Leyendo inventario Shopify...', 38);
    const inventoryTable = await readCsvFile(files.inventory);

    postProgress('Leyendo existencias IW...', 52);
    const iwTable = await readTabularFile(files.iw);

    postProgress('Mapeando SKU y UPC de Shopify...', 66);
    const products = buildProductIndex(productTables);

    postProgress('Indexando existencias IW...', 76);
    const iw = buildIwIndex(iwTable, options);

    postProgress('Generando comparación y CSV Shopify...', 86);
    const result = compareInventory(inventoryTable, products, iw, options);
    postMessage({ type: 'complete', result });
  } catch (error) {
    postMessage({
      type: 'error',
      error: error?.message || 'No se pudo procesar la información.',
    });
  }
};

function postProgress(message, progress) {
  postMessage({ type: 'progress', message, progress });
}

async function readCsvFile(file) {
  const text = await file.text();
  const table = parseCsv(text);
  table.fileName = file.name;
  return table;
}

async function readTabularFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) return readCsvFile(file);

  ensureXlsx();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error('El archivo IW no contiene hojas.');
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  return rowsToTable(rows, file.name);
}

function ensureXlsx() {
  if (xlsxReady) return;
  importScripts('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
  xlsxReady = true;
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
  const all = [];
  const review = [];
  let variants = 0;

  tables.forEach((table) => {
    const idx = indexHeaders(table.headers);
    validateAnyField(idx, ['Variant SKU', 'SKU'], table.fileName || 'productos Shopify');

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
      const priceRaw = get(row, idx, 'Variant Price') || get(row, idx, 'Price / El Salvador');
      const compareAtRaw = get(row, idx, 'Variant Compare At Price') || get(row, idx, 'Compare At Price / El Salvador');

      if (get(row, idx, 'Title')) lastTitle = get(row, idx, 'Title');
      if (get(row, idx, 'Handle')) lastHandle = get(row, idx, 'Handle');
      if (get(row, idx, 'Status')) lastStatus = get(row, idx, 'Status');
      if (get(row, idx, 'Published')) lastPublished = get(row, idx, 'Published');

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
        return;
      }

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

      if (barcode) addBarcodeReference(barcodeKeys, barcode, product);
      addBarcodeReference(identifierKeys, barcode || sku, product);
      if (barcode && sku) addBarcodeReference(identifierKeys, sku, product);
    });
  });

  return { bySku, barcodeKeys, identifierKeys, all, review, variants };
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

  const priceReport = buildPriceReport(products, iw, options);
  const priceReportRows = priceReport.map(stripObjectHtml);
  const priceMetrics = summarizePriceReport(priceReportRows);
  const reportRows = buildReportRows(actions, zeroStock, missingInShopify, review, priceReportRows);
  const inventoryCsv = tableToCsv(inventoryTable.headers, outputRows);

  return {
    inventoryCsv,
    actions,
    priceReport,
    priceReportRows,
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
      priceRows: priceReport.length,
      priceMatches: priceMetrics.matches,
      priceDifferences: priceMetrics.differences,
      priceZeroIssues: priceMetrics.zeroIssues,
      saleProducts: priceMetrics.saleProducts,
      priceReview: priceMetrics.review,
    },
  };
}

function buildPriceReport(products, iw, options) {
  return products.all.map((product) => {
    const match = lookupIwMatch(product.barcode || '', iw.byBarcode, options.skuFallback ? product.sku : '');
    const iwPrice = match.status === 'matched' ? match.row.price4 : null;
    const sale = classifySale(product);
    const comparison = compareMoney(product.price, iwPrice);
    const state = classifyPriceState(product, match, iwPrice, sale, comparison);
    const detail = buildPriceDetail(product, match, iwPrice, sale, comparison);

    return {
      Estado: htmlTag(state.label, state.tone),
      'UPC Shopify': product.barcode || '',
      SKU: product.sku || '',
      Producto: product.title || match.row?.title || product.handle,
      'Precio 4 IW': formatMoneyCell(iwPrice),
      'Precio Shopify actual': formatMoneyCell(product.price),
      'Precio regular Shopify': formatMoneyCell(getRegularShopifyPrice(product)),
      'Precio oferta Shopify': sale.hasOfferMarker ? formatMoneyCell(product.price) : '',
      Diferencia: comparison.hasComparison ? formatSignedMoney(comparison.difference) : '',
      Oferta: sale.label,
      Detalle: detail,
      'Código IW': match.row?.code || '',
      'Producto IW': match.row?.title || '',
      'Fila IW': match.row?.sourceRow || '',
      'Archivo Shopify': product.sourceFile || '',
      'Fila Shopify': product.sourceRow || '',
    };
  });
}

function classifyPriceState(product, match, iwPrice, sale, comparison) {
  if (!product.price.valid || !product.price.hasValue) return { label: 'Revisar', tone: 'danger' };
  if (hasZeroPriceIssue(product, iwPrice)) return { label: 'Precio 0', tone: 'danger' };
  if (match.status === 'ambiguous') return { label: 'Revisar', tone: 'danger' };
  if (match.status !== 'matched') return { label: 'Sin IW', tone: 'warn' };
  if (!iwPrice?.valid || !iwPrice.hasValue) return { label: 'Revisar', tone: 'danger' };
  if (comparison.hasComparison && Math.abs(comparison.difference) > 0.004) return { label: 'Diferencia', tone: 'warn' };
  if (sale.isRealSale) return { label: 'Oferta', tone: 'info' };
  return { label: 'OK', tone: 'ok' };
}

function buildPriceDetail(product, match, iwPrice, sale, comparison) {
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
  } else if (comparison.hasComparison && Math.abs(comparison.difference) > 0.004) {
    details.push(`Diferencia Shopify - IW: ${formatSignedMoney(comparison.difference)}.`);
  }

  if (sale.label !== 'Sin oferta') details.push(sale.label + '.');
  return details.join(' ');
}

function summarizePriceReport(rows) {
  return rows.reduce(
    (summary, row) => {
      const status = row.Estado;
      if (row['Precio 4 IW'] !== '') summary.matches += 1;
      if (status === 'Diferencia') summary.differences += 1;
      if (status === 'Precio 0' || row.Detalle.includes('0.00')) summary.zeroIssues += 1;
      if (row.Oferta && row.Oferta !== 'Sin oferta') summary.saleProducts += 1;
      if (!['OK', 'Oferta'].includes(status)) summary.review += 1;
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
    if (list[list.length - 1] !== row && !list.includes(row)) list.push(row);
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

function buildReportRows(actions, zeroStock, missingInShopify, review, priceReportRows = []) {
  return [
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

function htmlTag(text, tone) {
  return `<span class="tag ${tone}">${escapeHtml(text)}</span>`;
}

function stripObjectHtml(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, stripHtml(String(value ?? ''))]));
}

function stripHtml(value) {
  return value.replace(/<[^>]*>/g, '');
}

function escapeHtml(value) {
  return stringifyCell(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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

function csvEscape(value) {
  const text = stringifyCell(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}
