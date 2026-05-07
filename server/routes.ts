import type { Express } from "express";
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import {
  channels, years, months, kpis, products,
  materials, purchaseOrders, expenses, alerts, integrationPhases,
  dailyPerformance, glossaryTerms, accountingSuggestions,
  incomeDetails, restockRecommendations,
  ceoMetrics, pnlRows, cashFlowSnapshots, inventoryAccountingRows, closeChecklist,
} from './seed';

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // KPIs / dashboard
  app.get('/api/kpis', (_req, res) => res.json(kpis));
  app.get('/api/channels', (_req, res) => res.json(channels));
  app.get('/api/years', (_req, res) => res.json(years));
  app.get('/api/months', (_req, res) => res.json(months));
  app.get('/api/ceo-metrics', (_req, res) => res.json(ceoMetrics));

  // Tabs
  app.get('/api/products', (_req, res) => res.json(products));
  app.get('/api/materials', (_req, res) => res.json(materials));
  app.get('/api/purchase-orders', (_req, res) => res.json(purchaseOrders));
  app.get('/api/income-details', (_req, res) => res.json(incomeDetails));
  app.get('/api/expenses', (_req, res) => res.json(expenses));
  app.get('/api/daily-performance', (_req, res) => res.json(dailyPerformance));
  app.get('/api/alerts', (_req, res) => res.json(alerts));
  app.get('/api/integration-phases', (_req, res) => res.json(integrationPhases));
  app.get('/api/glossary', (_req, res) => res.json(glossaryTerms));
  app.get('/api/accounting-suggestions', (_req, res) => res.json(accountingSuggestions));
  app.get('/api/restock-plan', (_req, res) => res.json(restockRecommendations));
  app.get('/api/pnl', (_req, res) => res.json(pnlRows));
  app.get('/api/cash-flow', (_req, res) => res.json(cashFlowSnapshots));
  app.get('/api/inventory-accounting', (_req, res) => res.json(inventoryAccountingRows));
  app.get('/api/close-checklist', (_req, res) => res.json(closeChecklist));

  // Shopify connection status (placeholder — no live OAuth in MVP)
  app.get('/api/shopify/status', (_req, res) => res.json({
    connected: false,
    mode: 'mock-seed',
    shopDomain: null,
    apiVersion: null,
    lastSync: null,
    note: 'MVP usa datos sembrados. Ver Plan de integración para conectar Shopify Admin API.',
  }));

  return httpServer;
}
