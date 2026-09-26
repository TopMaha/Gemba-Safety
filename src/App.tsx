import { Navigate, Route, Routes } from 'react-router-dom';
import { ManagerShell } from '@/components/ManagerShell';
import AdminGate from '@/pages/AdminGate';
import CalendarPage from '@/pages/CalendarPage';
import Coaching from '@/pages/Coaching';
import CoachingDetail from '@/pages/CoachingDetail';
import AdminRoles from '@/pages/AdminRoles';
import CoverageHeatmap from '@/pages/CoverageHeatmap';
import Dashboard from '@/pages/Dashboard';
import FindingDetail from '@/pages/FindingDetail';
import Findings from '@/pages/Findings';
import MyTasks from '@/pages/MyTasks';
import History from '@/pages/History';
import Home from '@/pages/Home';
import Plan from '@/pages/Plan';
import Report from '@/pages/Report';
import Settings from '@/pages/Settings';
import WalkRecordPage from '@/pages/WalkRecord';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/admin" element={<AdminGate />} />

      <Route element={<ManagerShell />}>
        <Route path="/plan" element={<Plan />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/coverage" element={<CoverageHeatmap />} />
        <Route path="/coaching" element={<Coaching />} />
        <Route path="/coaching/:managerId" element={<CoachingDetail />} />
        <Route path="/history" element={<History />} />
        <Route path="/findings" element={<Findings />} />
        <Route path="/findings/:findingId" element={<FindingDetail />} />
        <Route path="/tasks" element={<MyTasks />} />
        <Route path="/admin/roles" element={<AdminRoles />} />
        <Route path="/walk/:planId" element={<WalkRecordPage />} />
        <Route path="/admin/settings" element={<Settings />} />
        <Route path="/admin/report" element={<Report />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
