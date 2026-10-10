import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import AppShell from "./components/AppShell";
import LoginPage from "./pages/LoginPage";
import WelcomePage from "./pages/WelcomePage";
import DashboardPage from "./pages/DashboardPage";
import CustomersHubPage from "./pages/CustomersHubPage";
import ProjectHubPage from "./pages/ProjectHubPage";
import ShopsPage from "./pages/ShopsPage";
import SettingsHubPage from "./pages/SettingsHubPage";
import SettingsPage from "./pages/SettingsPage";
import UsersPage from "./pages/UsersPage";
import RolesPage from "./pages/RolesPage";
import AuditLogPage from "./pages/AuditLogPage";
import TrashPage from "./pages/TrashPage";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import UnitTypesPage from "./pages/UnitTypesPage";
import JournalPage from "./pages/JournalPage";
import CashAccountsPage from "./pages/CashAccountsPage";
import PartiesPage from "./pages/PartiesPage";
import PartyDetailPage from "./pages/PartyDetailPage";
import SalesPage from "./pages/SalesPage";
import SaleDetailPage from "./pages/SaleDetailPage";
import RentalsPage from "./pages/RentalsPage";
import RentalDetailPage from "./pages/RentalDetailPage";
import ExpensesPage from "./pages/ExpensesPage";
import PurchasesHubPage from "./pages/PurchasesHubPage";
import PurchasesPage from "./pages/PurchasesPage";
import MarketTransactionsPage from "./pages/MarketTransactionsPage";
import PurchaseDetailPage from "./pages/PurchaseDetailPage";
import PurchaseReturnsPage from "./pages/PurchaseReturnsPage";
import EmployeesPage from "./pages/EmployeesPage";
import EmployeeDetailPage from "./pages/EmployeeDetailPage";
import AttendancePage from "./pages/AttendancePage";
import MiscWorkersPage from "./pages/MiscWorkersPage";
import ExchangePage from "./pages/ExchangePage";
import ExchangeDealerTransactionsPage from "./pages/ExchangeDealerTransactionsPage";
import PartnersPage from "./pages/PartnersPage";
import HajiLedgerPage from "./pages/HajiLedgerPage";
import HajiLedgerDetailPage from "./pages/HajiLedgerDetailPage";
import ProfitLossPage from "./pages/ProfitLossPage";
import GeneralReportPage from "./pages/GeneralReportPage";
import KafilManagementPage from "./pages/KafilManagementPage";
import AppTitle from "./components/AppTitle";

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading, justLoggedIn } = useAuth();
  const location = useLocation();
  if (loading) {
    return <div className="flex h-screen items-center justify-center text-gray-500">... بارېدل</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (justLoggedIn && location.pathname !== "/welcome") {
    return <Navigate to="/welcome" replace />;
  }
  return <>{children}</>;
}

function RequireRole({ role, children }: { role: string; children: React.ReactNode }) {
  const { hasRole } = useAuth();
  if (!hasRole(role) && !hasRole("admin")) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function RedirectPartnerLedger() {
  const { id } = useParams();
  return <Navigate to={id ? `/haji-ledger/${id}` : "/haji-ledger"} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppTitle />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/welcome"
          element={
            <Protected>
              <WelcomePage />
            </Protected>
          }
        />
        <Route
          path="/"
          element={
            <Protected>
              <AppShell />
            </Protected>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="customers" element={<CustomersHubPage />} />
          <Route path="settings" element={<SettingsHubPage />} />
          <Route path="settings/system" element={<SettingsPage />} />
          <Route path="projects" element={<ProjectHubPage />} />
          <Route path="projects/list" element={<ProjectsPage />} />
          <Route path="shops" element={<ShopsPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="unit-types" element={<UnitTypesPage />} />
          <Route path="parties" element={<PartiesPage />} />
          <Route path="parties/:id" element={<PartyDetailPage />} />
          <Route path="sales" element={<SalesPage />} />
          <Route path="sales/:id" element={<SaleDetailPage />} />
          <Route path="rentals" element={<RentalsPage />} />
          <Route path="rentals/:id" element={<RentalDetailPage />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="purchases" element={<PurchasesHubPage />} />
          <Route path="purchases/list" element={<PurchasesPage />} />
          <Route path="purchases/market-transactions" element={<MarketTransactionsPage />} />
          <Route path="purchase-returns" element={<PurchaseReturnsPage />} />
          <Route path="purchases/:id" element={<PurchaseDetailPage />} />
          <Route path="attendance" element={<AttendancePage />} />
          <Route path="misc-workers" element={<MiscWorkersPage />} />
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="employees/:id" element={<EmployeeDetailPage />} />
          <Route path="exchange" element={<ExchangePage />} />
          <Route path="exchange/transactions" element={<ExchangeDealerTransactionsPage />} />
          <Route path="partners" element={<PartnersPage />} />
          <Route path="partners/:id" element={<RedirectPartnerLedger />} />
          <Route path="haji-ledger" element={<HajiLedgerPage />} />
          <Route path="haji-ledger/:id" element={<HajiLedgerDetailPage />} />
          <Route path="reports/profit-loss" element={<ProfitLossPage />} />
          <Route path="reports/general" element={<GeneralReportPage />} />
          <Route
            path="kafil"
            element={
              <RequireRole role="admin">
                <KafilManagementPage />
              </RequireRole>
            }
          />
          <Route
            path="journal"
            element={
              <RequireRole role="admin">
                <JournalPage />
              </RequireRole>
            }
          />
          <Route
            path="cash-accounts"
            element={
              <RequireRole role="admin">
                <CashAccountsPage />
              </RequireRole>
            }
          />
          <Route
            path="settings/users"
            element={
              <RequireRole role="admin">
                <UsersPage />
              </RequireRole>
            }
          />
          <Route
            path="settings/roles"
            element={
              <RequireRole role="admin">
                <RolesPage />
              </RequireRole>
            }
          />
          <Route
            path="settings/audit-log"
            element={
              <RequireRole role="admin">
                <AuditLogPage />
              </RequireRole>
            }
          />
          <Route
            path="settings/trash"
            element={
              <RequireRole role="admin">
                <TrashPage />
              </RequireRole>
            }
          />
          <Route
            path="users"
            element={
              <RequireRole role="admin">
                <UsersPage />
              </RequireRole>
            }
          />
          <Route
            path="roles"
            element={
              <RequireRole role="admin">
                <RolesPage />
              </RequireRole>
            }
          />
          <Route
            path="audit-log"
            element={
              <RequireRole role="admin">
                <AuditLogPage />
              </RequireRole>
            }
          />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
