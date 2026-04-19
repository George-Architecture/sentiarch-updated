import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import StepNavigator from "./components/StepNavigator";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import ProgramSpec from "./pages/ProgramSpec";
import Settings from "./pages/Settings";
import Zoning from "./pages/Zoning";
import Layout from "./pages/Layout";
import Massing from "./pages/Massing";
import Simulation from "./pages/Simulation";
import Compare from "./pages/Compare";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/program-spec"} component={ProgramSpec} />
      <Route path={"/zoning"} component={Zoning} />
      <Route path={"/layout"} component={Layout} />
      <Route path={"/massing"} component={Massing} />
      <Route path={"/simulation"} component={Simulation} />
      <Route path={"/compare"} component={Compare} />
      <Route path={"/settings"} component={Settings} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <StepNavigator />
          <div className="pt-12">
            <Router />
          </div>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
