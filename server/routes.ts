import type { Express } from "express";
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { insertExpenseSchema, updateCashAccountSchema, updateCloseChecklistSchema } from '@shared/schema';
import { storage } from './storage';
import {
  channels, years, months, kpis, products,
  materials, purchaseOrders, expenses, alerts, integrationPhases,
  dailyPerformance, glossaryTerms, accountingSuggestions,
  incomeDetails, restockRecommendations,
  ceoMetrics, pnlRows, cashFlowSnapshots, inventoryAccountingRows, closeChecklist,
} from './seed';

const SHOPIFY_API_VERSION = '2026-04';
const MATERIAL_MANAGER_BOM_PATH = '/home/user/workspace/material-manager-export-material-product.csv';
const MATERIAL_MANAGER_MATERIALS_PATH = '/home/user/workspace/material-manager-export.csv';

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function parseCsv(path: string) {
  if (!fs.existsSync(path)) return [] as Record<string, string>[];
  const lines = fs.readFileSync(path, 'utf-8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

function loadMaterialManagerData() {
  const materials = parseCsv(MATERIAL_MANAGER_MATERIALS_PATH);
  const bomRows = parseCsv(MATERIAL_MANAGER_BOM_PATH);
  const materialsById = new Map(materials.map(material => [
    material.ID,
    {
      name: material.Name,
      category: material.Category || 'Material',
      measurement: material.Measurement || 'unidad',
      cost: Number(material.Cost) || 0,
      currency: material['Currency Code'] || 'COP',
      stock: Number(material['Calle 36 #22a-108 (4bf83698-ff9e-4857-9da3-e4f44bc3b447)']) || 0,
    },
  ]));

  const bomByVariantId = new Map<string, Array<{
    materialId: string;
    materialName: string;
    quantity: number;
    unitCost: number;
    amount: number;
    category: string;
    measurement: string;
    stock: number;
  }>>();

  for (const row of bomRows) {
    const variantId = row['Variant ID'];
    const material = materialsById.get(row['Material ID']);
    if (!variantId || !material) continue;
    const quantity = Number(row['Quantity of material used']) || 0;
    const amount = quantity * material.cost;
    const item = {
      materialId: row['Material ID'],
      materialName: row['Material name'] || material.name,
      quantity,
      unitCost: material.cost,
      amount,
      category: material.category,
      measurement: material.measurement,
      stock: material.stock,
    };
    bomByVariantId.set(variantId, [...(bomByVariantId.get(variantId) ?? []), item]);
  }

  return { bomByVariantId };
}

async function getShopifyAccessToken() {
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  const shop = process.env.SHOPIFY_SHOP_DOMAIN || '2f979e-24.myshopify.com';

  if (!clientId || !clientSecret) {
    throw new Error('missing_shopify_credentials');
  }

  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const data = await response.json() as { access_token?: string; error?: string; error_description?: string };

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'shopify_token_exchange_failed');
  }

  return { token: data.access_token, shop };
}

async function shopifyGraphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const { token, shop } = await getShopifyAccessToken();
  const response = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json() as { data?: T; errors?: Array<{ message: string }> };

  if (!response.ok || payload.errors?.length) {
    throw new Error(payload.errors?.map(error => error.message).join('; ') || `shopify_graphql_${response.status}`);
  }

  return payload.data as T;
}

function inferProductFamily(title: string) {
  const value = title.toLowerCase();
  if (value.includes('soluble')) return 'Solubles';
  if (value.includes('melena') || value.includes('cola de pavo') || value.includes('reishi') || value.includes('ganoderma')) return 'Hongos funcionales';
  if (value.includes('cartucho')) return 'Cartuchos';
  if (value.includes('desechable')) return 'Desechables';
  if (value.includes('recarga') || value.includes('jeringa')) return 'Recargas';
  if (value.includes('kit') || value.includes('bundle')) return 'Bundles';
  return 'Shopify activo';
}

function defaultPackaging(title: string) {
  const value = title.toLowerCase();
  if (value.includes('cartucho') || value.includes('desechable')) return 3_500;
  if (value.includes('recarga') || value.includes('jeringa')) return 2_500;
  if (value.includes('soluble') || value.includes('melena') || value.includes('cola de pavo') || value.includes('reishi')) return 4_500;
  return 3_000;
}

function shouldSplitProductVariants(title: string) {
  const value = title.toLowerCase();
  return value.includes('recarga') || value.includes('destilado');
}

function getVariantPresentation(title: string) {
  const pieces = title.split('/').map(piece => piece.trim()).filter(Boolean);
  return pieces.length > 1 ? pieces[pieces.length - 1] : title.trim();
}

function variantsHaveSameEconomics(variants: Array<{ price: string; inventoryItem: { unitCost: { amount: string; currencyCode: string } | null } }>) {
  const prices = new Set(variants.map(variant => Number(variant.price).toFixed(2)));
  const costs = new Set(variants.map(variant => Number(variant.inventoryItem.unitCost?.amount ?? 0).toFixed(2)));
  return prices.size <= 1 && costs.size <= 1;
}

function getBomComponentKey(materialName: string) {
  return materialName.toLowerCase().includes('terpenos') ? 'Terpeno según sabor' : materialName;
}

function buildGroupedBomBreakdown(variantLegacyIds: string[]) {
  const { bomByVariantId } = loadMaterialManagerData();
  const variantBoms = variantLegacyIds
    .map(id => bomByVariantId.get(id) ?? [])
    .filter(items => items.length > 0);

  if (variantBoms.length === 0) return null;

  const componentMap = new Map<string, {
    label: string;
    amount: number;
    source: 'bom';
    note: string;
  }>();

  for (const items of variantBoms) {
    for (const item of items) {
      const key = getBomComponentKey(item.materialName);
      const current = componentMap.get(key);
      const note = key === 'Terpeno según sabor'
        ? `Promedio del terpeno específico de cada sabor. MM: ${item.quantity} ${item.measurement} × ${item.unitCost.toLocaleString('es-CO')} COP.`
        : `MM: ${item.quantity} ${item.measurement} × ${item.unitCost.toLocaleString('es-CO')} COP · Stock material: ${item.stock.toLocaleString('es-CO')}.`;
      componentMap.set(key, {
        label: key,
        amount: (current?.amount ?? 0) + item.amount,
        source: 'bom',
        note: current?.note ?? note,
      });
    }
  }

  const divisor = variantBoms.length;
  const breakdown = Array.from(componentMap.values())
    .map(item => ({ ...item, amount: item.amount / divisor }))
    .sort((a, b) => b.amount - a.amount);
  const total = breakdown.reduce((sum, item) => sum + item.amount, 0);
  return { breakdown, total, matchedVariants: variantBoms.length };
}

async function loadLiveShopifyProducts() {
  type LiveVariant = {
    id: string;
    legacyResourceId: string;
    title: string;
    sku: string | null;
    price: string;
    inventoryQuantity: number;
    inventoryItem: { id: string; tracked: boolean; unitCost: { amount: string; currencyCode: string } | null };
  };
  type LiveProduct = {
    id: string;
    title: string;
    status: string;
    handle: string;
    variants: { edges: Array<{ node: LiveVariant }> };
  };

  const query = `
    query LiveProducts($cursor: String) {
      products(first: 100, after: $cursor, query: "status:active") {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            title
            status
            handle
            variants(first: 100) {
              edges {
                node {
                  id
                  legacyResourceId
                  title
                  sku
                  price
                  inventoryQuantity
                  inventoryItem { id tracked unitCost { amount currencyCode } }
                }
              }
            }
          }
        }
      }
    }
  `;

  const allProducts: LiveProduct[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;
  while (hasNextPage) {
    const data = await shopifyGraphql<{
      products: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        edges: Array<{ node: LiveProduct }>;
      };
    }>(query, { cursor });
    allProducts.push(...data.products.edges.map(edge => edge.node));
    hasNextPage = data.products.pageInfo.hasNextPage;
    cursor = data.products.pageInfo.endCursor;
  }

  return allProducts.flatMap(product => {
    const variants = product.variants.edges.map(edge => edge.node);
    const variantGroups = shouldSplitProductVariants(product.title)
      ? Array.from(
          variants.reduce((map, item) => {
            const key = getVariantPresentation(item.title);
            map.set(key, [...(map.get(key) ?? []), item]);
            return map;
          }, new Map<string, LiveVariant[]>())
        ).map(([presentation, items]) => ({ presentation, variants: items }))
      : variantsHaveSameEconomics(variants)
      ? [{ presentation: null, variants }]
      : variants.map(item => ({ presentation: item.title === 'Default Title' ? null : item.title, variants: [item] }));

    return variantGroups.map(group => {
    const variant = group.variants[0];
    const price = Number(variant.price) || 0;
    const shopifyCost = variant.inventoryItem.unitCost ? Number(variant.inventoryItem.unitCost.amount) : null;
    const bom = buildGroupedBomBreakdown(group.variants.map(item => String(item.legacyResourceId)));
    const cogsUsed = bom?.total ?? shopifyCost ?? 0;
    const packaging = defaultPackaging(product.title);
    const fees = 0.035;
    const shippingSubsidy = 0;
    const idealPrice = cogsUsed > 0 ? Math.ceil((cogsUsed + packaging + shippingSubsidy) / (1 - fees - 0.45) / 100) * 100 : price;
    const maxProfitableDiscount = price > 0
      ? Math.max(0, Math.min(0.7, 1 - ((cogsUsed + packaging + shippingSubsidy) / (price * (1 - fees))) / 0.30))
      : 0;
    const flavorOptions = group.variants
      .map(item => item.title)
      .filter(title => title && title !== 'Default Title');
    const inventoryQuantity = group.variants.reduce((sum, item) => sum + (item.inventoryQuantity || 0), 0);
    const name = group.presentation ? `${product.title} · ${group.presentation}` : product.title;

    return {
      id: group.presentation ? `${product.id}-${group.presentation}` : product.id,
      name,
      family: inferProductFamily(product.title),
      sku: group.variants.find(item => item.sku)?.sku ?? undefined,
      active: product.status === 'ACTIVE',
      unitsSold: 0,
      unitPrice: price,
      revenue: 0,
      cogsShopify: shopifyCost,
      cogsFallback: 0,
      cogsBreakdown: bom?.breakdown ?? [
        {
          label: 'Costo unitario Shopify',
          amount: cogsUsed,
          source: shopifyCost === null ? 'fallback' : 'shopify',
          note: shopifyCost === null
            ? 'Sin unitCost en Shopify; cargar costo para margen real.'
            : `Costo base tomado de Shopify. ${flavorOptions.length || group.variants.length} variantes agrupadas en esta fila.`,
        },
      ],
      packaging,
      fees,
      shippingSubsidy,
      cogsUsed,
      cogsSource: cogsUsed === 0 ? 'fallback' : 'shopify',
      marginSource: bom ? 'material_manager' : 'shopify',
      dataCompleteness: shopifyCost === null ? 'partial' : 'real',
      idealPrice,
      competitorPrice: price,
      maxProfitableDiscount,
      grossMargin: price > 0 ? (price - cogsUsed) / price : 0,
      contributionMargin: price > 0 ? (price - cogsUsed - packaging - price * fees - shippingSubsidy) / price : 0,
      alert: cogsUsed === 0 ? 'warn' : 'ok',
      alertReason: cogsUsed === 0 ? 'Falta BOM/costo unitario en Material Manager y Shopify.' : undefined,
      inventoryQuantity,
      variantCount: group.variants.length,
      flavorOptions,
      presentation: group.presentation,
      shopifyProductId: product.id,
      shopifyHandle: product.handle,
    };
    });
  });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // KPIs / dashboard
  app.get('/api/kpis', (_req, res) => res.json(kpis));
  app.get('/api/channels', (_req, res) => res.json(channels));
  app.get('/api/years', (_req, res) => res.json(years));
  app.get('/api/months', (_req, res) => res.json(months));
  app.get('/api/ceo-metrics', async (_req, res) => {
    const accounts = await storage.listCashAccounts();
    const netCash = accounts.reduce((sum, account) => {
      if (account.type === 'liability') return sum - account.amount;
      return sum + account.amount;
    }, 0);
    res.json(ceoMetrics.map(metric => metric.id === 'cash' ? { ...metric, value: netCash } : metric));
  });

  // Tabs
  app.get('/api/products', async (_req, res) => {
    try {
      res.json(await loadLiveShopifyProducts());
    } catch {
      res.json(products);
    }
  });
  app.get('/api/materials', (_req, res) => res.json(materials));
  app.get('/api/purchase-orders', (_req, res) => res.json(purchaseOrders));
  app.get('/api/income-details', (_req, res) => res.json(incomeDetails));
  app.get('/api/expenses', async (_req, res) => {
    const manualExpenses = await storage.listManualExpenses();
    res.json([...manualExpenses, ...expenses]);
  });
  app.post('/api/expenses', async (req, res) => {
    const parsed = insertExpenseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid expense', details: parsed.error.flatten() });
    }
    const created = await storage.createManualExpense(parsed.data);
    res.status(201).json(created);
  });
  app.delete('/api/expenses/:id', async (req, res) => {
    if (!req.params.id.startsWith('manual-')) {
      return res.status(400).json({ error: 'Solo se pueden eliminar gastos manuales antes de conectar contabilidad.' });
    }
    const deleted = await storage.deleteManualExpense(req.params.id);
    res.json({ deleted });
  });
  app.get('/api/daily-performance', (_req, res) => res.json(dailyPerformance));
  app.get('/api/alerts', (_req, res) => res.json(alerts));
  app.get('/api/integration-phases', (_req, res) => res.json(integrationPhases));
  app.get('/api/glossary', (_req, res) => res.json(glossaryTerms));
  app.get('/api/accounting-suggestions', (_req, res) => res.json(accountingSuggestions));
  app.get('/api/restock-plan', (_req, res) => res.json(restockRecommendations));
  app.get('/api/pnl', (_req, res) => res.json(pnlRows));
  app.get('/api/cash-accounts', async (_req, res) => res.json(await storage.listCashAccounts()));
  app.patch('/api/cash-accounts/:id', async (req, res) => {
    const parsed = updateCashAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid cash account amount', details: parsed.error.flatten() });
    }
    const updated = await storage.updateCashAccount(req.params.id as never, parsed.data.amount);
    if (!updated) return res.status(404).json({ error: 'Cash account not found' });
    res.json(updated);
  });
  app.get('/api/cash-flow', async (_req, res) => {
    const accounts = await storage.listCashAccounts();
    const netCash = accounts.reduce((sum, account) => account.type === 'liability' ? sum - account.amount : sum + account.amount, 0);
    const usableCash = accounts
      .filter(account => account.type === 'asset')
      .reduce((sum, account) => sum + account.amount, 0);
    const pendingCash = accounts
      .filter(account => account.type === 'pending_asset')
      .reduce((sum, account) => sum + account.amount, 0);
    res.json(cashFlowSnapshots.map(item => {
      if (item.id === 'cash-on-hand') {
        return {
          ...item,
          amount: netCash,
          explanation: `Caja neta editable. Disponible hoy: ${usableCash.toLocaleString('es-CO')} COP; pendiente Mercado Pago: ${pendingCash.toLocaleString('es-CO')} COP.`,
        };
      }
      return item;
    }));
  });
  app.get('/api/inventory-accounting', (_req, res) => res.json(inventoryAccountingRows));
  app.get('/api/close-checklist', async (_req, res) => {
    res.json(await storage.mergeCloseChecklist(closeChecklist));
  });
  app.patch('/api/close-checklist/:id', async (req, res) => {
    const parsed = updateCloseChecklistSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid checklist status', details: parsed.error.flatten() });
    }
    await storage.updateCloseChecklistStatus(req.params.id, parsed.data.status);
    const merged = await storage.mergeCloseChecklist(closeChecklist);
    res.json(merged.find(item => item.id === req.params.id));
  });

  app.get('/api/shopify/status', async (_req, res) => {
    try {
      const data = await shopifyGraphql<{
        shop: { name: string; myshopifyDomain: string; primaryDomain: { host: string; url: string } };
        currentAppInstallation: { accessScopes: Array<{ handle: string }> };
      }>(`
        query ShopifyStatus {
          shop { name myshopifyDomain primaryDomain { host url } }
          currentAppInstallation { accessScopes { handle } }
        }
      `);
      const scopes = data.currentAppInstallation.accessScopes.map(scope => scope.handle);
      res.json({
        connected: true,
        mode: 'live-read-only',
        shopName: data.shop.name,
        shopDomain: data.shop.myshopifyDomain,
        primaryDomain: data.shop.primaryDomain.host,
        apiVersion: SHOPIFY_API_VERSION,
        lastSync: new Date().toISOString(),
        scopes,
        hasReadProducts: scopes.includes('read_products'),
        hasReadOrders: scopes.includes('read_orders'),
        note: 'Shopify Admin API conectado en modo solo lectura. Los dashboards principales siguen en seed hasta activar sync persistente.',
      });
    } catch (error) {
      res.json({
        connected: false,
        mode: 'mock-seed',
        shopDomain: null,
        apiVersion: null,
        lastSync: null,
        scopes: [],
        note: error instanceof Error && error.message === 'missing_shopify_credentials'
          ? 'Faltan variables Shopify en el servidor. El MVP usa datos sembrados.'
          : 'Shopify no respondió correctamente. El MVP usa datos sembrados.',
      });
    }
  });

  app.get('/api/shopify/products-live', async (_req, res) => {
    try {
      res.json(await loadLiveShopifyProducts());
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : 'shopify_products_failed' });
    }
  });

  app.get('/api/shopify/orders-live', async (_req, res) => {
    try {
      const data = await shopifyGraphql<{
        orders: {
          edges: Array<{
            node: {
              id: string;
              name: string;
              createdAt: string;
              displayFinancialStatus: string;
              totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
              lineItems: { edges: Array<{ node: { title: string; quantity: number; variant: { id: string; sku: string | null; price: string } | null } }> };
            };
          }>;
        };
      }>(`
        query LiveOrders {
          orders(first: 20, sortKey: CREATED_AT, reverse: true) {
            edges {
              node {
                id
                name
                createdAt
                displayFinancialStatus
                totalPriceSet { shopMoney { amount currencyCode } }
                lineItems(first: 25) {
                  edges { node { title quantity variant { id sku price } } }
                }
              }
            }
          }
        }
      `);
      res.json(data.orders.edges.map(edge => edge.node));
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : 'shopify_orders_failed' });
    }
  });

  app.get('/api/shopify/install', (req, res) => {
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
    const rawShop = typeof req.query.shop === 'string' ? req.query.shop : '';
    const shop = rawShop.endsWith('.myshopify.com') ? rawShop : `${rawShop}.myshopify.com`;

    if (!clientId || !clientSecret) {
      return res.status(500).send('Shopify OAuth no está configurado en el servidor. Falta SHOPIFY_CLIENT_ID o SHOPIFY_CLIENT_SECRET.');
    }

    if (!/^[-a-z0-9]+\.myshopify\.com$/i.test(shop)) {
      return res.status(400).send('Shopify shop inválido. Usa /api/shopify/install?shop=2f979e-24.myshopify.com');
    }

    const host = req.get('x-forwarded-host') || req.get('host');
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
    const redirectUri = `${protocol}://${host}/api/shopify/callback`;
    const scopes = [
      'read_products',
      'read_inventory',
      'read_locations',
      'read_orders',
      'read_draft_orders',
      'read_customers',
      'read_reports',
    ].join(',');
    const state = crypto.randomBytes(16).toString('hex');
    const authUrl = new URL(`https://${shop}/admin/oauth/authorize`);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);

    res.redirect(authUrl.toString());
  });

  app.get('/api/shopify/callback', async (req, res) => {
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
    const shop = typeof req.query.shop === 'string' ? req.query.shop : '';
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const hmac = typeof req.query.hmac === 'string' ? req.query.hmac : '';

    if (!clientId || !clientSecret) {
      return res.status(500).send('Shopify OAuth no está configurado en el servidor.');
    }

    if (!/^[-a-z0-9]+\.myshopify\.com$/i.test(shop) || !code || !hmac) {
      return res.status(400).send('Callback Shopify incompleto.');
    }

    const message = Object.entries(req.query)
      .filter(([key]) => key !== 'hmac' && key !== 'signature')
      .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(',') : value}`)
      .sort()
      .join('&');
    const digest = crypto.createHmac('sha256', clientSecret).update(message).digest('hex');
    const isValid = crypto.timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(hmac, 'hex'));
    if (!isValid) {
      return res.status(401).send('Firma Shopify inválida.');
    }

    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    const tokenData = await tokenResponse.json() as { access_token?: string; scope?: string; error?: string; error_description?: string };

    if (!tokenResponse.ok || !tokenData.access_token) {
      return res.status(400).send(`Shopify no completó instalación: ${tokenData.error_description || tokenData.error || 'error desconocido'}`);
    }

    res.send(`
      <main style="font-family: Inter, system-ui, sans-serif; padding: 32px; max-width: 720px; margin: auto;">
        <h1>Connabis Accounting OS conectado</h1>
        <p>Shop instalado: <strong>${shop}</strong></p>
        <p>Scopes concedidos: <code>${tokenData.scope || 'sin scopes reportados'}</code></p>
        <p>Ya puedes volver a Perplexity para validar productos, órdenes e inventario en modo solo lectura.</p>
      </main>
    `);
  });

  return httpServer;
}
