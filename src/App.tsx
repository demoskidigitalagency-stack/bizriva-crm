import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { DashboardPage } from "@/pages/DashboardPage";
import { TodayPage } from "@/pages/TodayPage";
import { CrmPage } from "@/pages/CrmPage";
import { Customer360Page } from "@/pages/Customer360Page";
import { PlaceholderPage } from "@/pages/PlaceholderPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/today" element={<TodayPage />} />
        <Route path="/crm" element={<CrmPage />} />
        <Route path="/crm/:view" element={<CrmPage />} />
        <Route path="/contacts/:contactId" element={<Customer360Page />} />
        <Route path="/:module" element={<PlaceholderPage />} />
      </Route>
    </Routes>
  );
}
