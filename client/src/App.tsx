import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Financiero from "@/pages/financiero";
import Ingresos from "@/pages/ingresos";
import Gastos from "@/pages/gastos";
import Productos from "@/pages/productos";
import Performance from "@/pages/performance";
import MaterialManager from "@/pages/material-manager";
import Alertas from "@/pages/alertas";
import Sugerencias from "@/pages/sugerencias";
import Integracion from "@/pages/integracion";
import Glosario from "@/pages/glosario";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/financiero" component={Financiero} />
      <Route path="/ingresos" component={Ingresos} />
      <Route path="/gastos" component={Gastos} />
      <Route path="/productos" component={Productos} />
      <Route path="/performance" component={Performance} />
      {/* Both /inventario (legacy) and /material-manager point to the consolidated module. */}
      <Route path="/inventario" component={MaterialManager} />
      <Route path="/material-manager" component={MaterialManager} />
      <Route path="/alertas" component={Alertas} />
      <Route path="/sugerencias" component={Sugerencias} />
      <Route path="/integracion" component={Integracion} />
      <Route path="/glosario" component={Glosario} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider delayDuration={150}>
          <Toaster />
          <Router hook={useHashLocation}>
            <AppRouter />
          </Router>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
