import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { DashboardPage } from "@/pages/DashboardPage";
import { TodayPage } from "@/pages/TodayPage";
import { CrmPage } from "@/pages/CrmPage";
import { Customer360Page } from "@/pages/Customer360Page";
import {
  InboxPage, OrdersPage, ProductsPage, InventoryPage, StorePage, DeliveryPage,
  MarketingPage, AdsPage, AutomationPage, FinancePage, AnalyticsPage, TeamPage,
  IntegrationsPage, SettingsPage, HelpPage
} from "@/pages/ModulePages";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/today" element={<TodayPage />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/crm" element={<CrmPage />} />
        <Route path="/crm/:view" element={<CrmPage />} />
        <Route path="/contacts/:contactId" element={<Customer360Page />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/store" element={<StorePage />} />
        <Route path="/delivery" element={<DeliveryPage />} />
        <Route path="/marketing" element={<MarketingPage />} />
        <Route path="/ads" element={<AdsPage />} />
        <Route path="/automation" element={<AutomationPage />} />
        <Route path="/finance" element={<FinancePage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/integrations" element={<IntegrationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
