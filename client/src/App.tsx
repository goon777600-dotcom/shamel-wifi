import DashboardLayout from "@/components/DashboardLayout";
import AppLockGate from "@/components/AppLockGate";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Router as WouterRouter, Switch } from "wouter";
import { lazy, Suspense } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

const AccountingDashboard = lazy(() => import("@/pages/AccountingDashboard"));
const CashPage = lazy(() => import("@/pages/CashPage"));
const CategoriesPage = lazy(() => import("@/pages/CategoriesPage"));
const ClientAccountPage = lazy(() => import("@/pages/ClientAccountPage"));
const ContactsPage = lazy(() => import("@/pages/ContactsPage"));
const ExpensesPage = lazy(() => import("@/pages/ExpensesPage"));
const InvoicesPage = lazy(() => import("@/pages/InvoicesPage"));
const IndividualSubscriptionAccountPage = lazy(() => import("@/pages/IndividualSubscriptionAccountPage"));
const IndividualSubscriptionsPage = lazy(() => import("@/pages/IndividualSubscriptionsPage"));
const ReceiptsPage = lazy(() => import("@/pages/ReceiptsPage"));
const ReportsPage = lazy(() => import("@/pages/ReportsPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const SubscriptionsPage = lazy(() => import("@/pages/SubscriptionsPage"));

function AppRoutes() {
  return (
    <Switch>
      <Route path="/"><Page><AccountingDashboard /></Page></Route>
      <Route path="/contacts/:contactId"><Page><ClientAccountPage /></Page></Route>
      <Route path="/contacts"><Page><ContactsPage /></Page></Route>
      <Route path="/invoices"><Page><InvoicesPage /></Page></Route>
      <Route path="/receipts"><Page><ReceiptsPage /></Page></Route>
      <Route path="/expenses"><Page><ExpensesPage /></Page></Route>
      <Route path="/cash"><Page><CashPage /></Page></Route>
      <Route path="/individual-subscriptions/:accountId"><Page><IndividualSubscriptionAccountPage /></Page></Route>
      <Route path="/individual-subscriptions"><Page><IndividualSubscriptionsPage /></Page></Route>
      <Route path="/subscriptions"><Page><SubscriptionsPage /></Page></Route>
      <Route path="/reports"><Page><ReportsPage /></Page></Route>
      <Route path="/categories"><Page><CategoriesPage /></Page></Route>
      <Route path="/settings"><Page><SettingsPage /></Page></Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout>
      <Suspense fallback={<div className="p-6 text-center text-muted-foreground">جارٍ تحميل الصفحة…</div>}>
        {children}
      </Suspense>
    </DashboardLayout>
  );
}

function App() {
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/api/app")) {
    window.location.replace("/api/app/");
    return null;
  }

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
          <TooltipProvider>
            <Toaster />
            <AppLockGate><WouterRouter base="/api/app"><AppRoutes /></WouterRouter></AppLockGate>
          </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
