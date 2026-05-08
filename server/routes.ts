import type { Express } from "express";
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import crypto from 'node:crypto';
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
  app.get('/api/products', (_req, res) => res.json(products));
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
      const data = await shopifyGraphql<{
        products: {
          edges: Array<{
            node: {
              id: string;
              title: string;
              status: string;
              handle: string;
              variants: {
                edges: Array<{
                  node: {
                    id: string;
                    title: string;
                    sku: string | null;
                    price: string;
                    inventoryQuantity: number;
                    inventoryItem: { id: string; tracked: boolean; unitCost: { amount: string; currencyCode: string } | null };
                  };
                }>;
              };
            };
          }>;
        };
      }>(`
        query LiveProducts {
          products(first: 50, query: "status:active") {
            edges {
              node {
                id
                title
                status
                handle
                variants(first: 50) {
                  edges {
                    node {
                      id
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
      `);
      res.json(data.products.edges.map(edge => {
        const variants = edge.node.variants.edges.map(variantEdge => variantEdge.node);
        return {
          id: edge.node.id,
          title: edge.node.title,
          status: edge.node.status,
          handle: edge.node.handle,
          variantCount: variants.length,
          costedVariantCount: variants.filter(variant => variant.inventoryItem.unitCost).length,
          variants,
        };
      }));
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
