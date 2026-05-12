# Connabis Accounting OS — TROUBLESHOOTING

## Ingresos no cuadran con Shopify Analytics

1. Verificar que el período en la app coincida con Shopify.
2. Verificar timezone y corte de día.
3. Revisar si Shopify Analytics está mostrando ventas totales, ventas netas u otra métrica.
4. Revisar órdenes canceladas, test o refunds.
5. Ajustar solo el helper central de ingresos en `server/routes.ts`.

## COGS se ve demasiado bajo

1. Abrir `/api/bom-coverage`.
2. Revisar `missingSkus`.
3. Confirmar si el SKU/variantId existe en Material Manager.
4. Corregir el match Shopify ↔ MM.
5. Si MM no tiene BOM, marcar pendiente; no inventar costo.

## Utilidad neta parece demasiado alta

1. Revisar BOM coverage.
2. Revisar gastos sin categoría.
3. Confirmar que gastos operativos estén bien clasificados.
4. Verificar que compras de inventario no estén mezcladas como gasto operativo.

## Gastos no afectan caja correctamente

1. Confirmar `pagado con`.
2. Para Nu crédito, debe subir deuda.
3. Para Nequi/Nu débito/Mercado Pago liberado, debe bajar balance.
4. Si el gasto es USD, confirmar `originalAmount` y `fxRate`.
5. Si se borra un gasto manual, revisar que el efecto de caja se haya revertido.

## Productos aparecen sin margen

1. Revisar si el producto está activo en Shopify.
2. Confirmar SKU o variante.
3. Confirmar BOM en Material Manager.
4. Verificar si el producto vendido usa variante histórica borrada.
5. Usar alerta de SKUs sin BOM como lista de corrección.

## Performance mensual no muestra todos los días

La gráfica muestra días con ingresos o gastos reales. Días sin actividad pueden no aparecer si no existe registro para ese día. Si se necesita calendario completo con ceros, agregar date spine en backend.

