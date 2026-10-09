import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';

import UserLayout from './layouts/UserLayout';
import AdminLayout from './layouts/AdminLayout';
import DocsLayout from './layouts/DocsLayout';
import AuthLayout from './layouts/AuthLayout';

import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ActivatePage from './pages/auth/ActivatePage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';

import DashboardPage from './pages/user/DashboardPage';
import AccountsPage from './pages/user/AccountsPage';
import AccountGroupsPage from './pages/user/AccountGroupsPage';
import FollowersPage from './pages/user/FollowersPage';
import CommentsPage from './pages/user/CommentsPage';
import MessagesPage from './pages/user/MessagesPage';

import PublishCreatePage from './pages/publish/PublishCreatePage';
import PublishBatchVideoPage from './pages/publish/PublishBatchVideoPage';
import PublishBatchImagePage from './pages/publish/PublishBatchImagePage';
import PublishDraftsPage from './pages/publish/PublishDraftsPage';
import PublishTasksPage from './pages/publish/PublishTasksPage';
import PublishStatsPage from './pages/publish/PublishStatsPage';
import ContentRecordsPage from './pages/publish/ContentRecordsPage';
import ContentCreateRealPage from './pages/publish/ContentCreateRealPage';

import EngageCommentsPage from './pages/engage/EngageCommentsPage';
import EngageCommentsAggPage from './pages/engage/EngageCommentsAggPage';
import EngageAutoCommentPage from './pages/engage/EngageAutoCommentPage';
import EngageBatchTasksPage from './pages/engage/EngageBatchTasksPage';
import EngageMessagesPage from './pages/engage/EngageMessagesPage';
import EngageMessagesAggPage from './pages/engage/EngageMessagesAggPage';
import EngageAutoMessagePage from './pages/engage/EngageAutoMessagePage';
import EngageFollowersPage from './pages/engage/EngageFollowersPage';
import EngageFollowerMonitorPage from './pages/engage/EngageFollowerMonitorPage';

import AutomationKeywordsPage from './pages/automation/AutomationKeywordsPage';
import AutomationWelcomePage from './pages/automation/AutomationWelcomePage';
import AutomationOfflinePage from './pages/automation/AutomationOfflinePage';
import AutomationActiveMessagesPage from './pages/automation/AutomationActiveMessagesPage';
import AutomationMonitorPage from './pages/automation/AutomationMonitorPage';
import AutomationTemplatesPage from './pages/automation/AutomationTemplatesPage';
import AutomationLogsPage from './pages/automation/AutomationLogsPage';

import AnalyticsMonitorPage from './pages/analytics/AnalyticsMonitorPage';
import AnalyticsPage from './pages/user/AnalyticsPage';
import AnalyticsFlowPage from './pages/analytics/AnalyticsFlowPage';
import AnalyticsAccountMonitorPage from './pages/analytics/AnalyticsAccountMonitorPage';
import AnalyticsNotifyMonitorPage from './pages/analytics/AnalyticsNotifyMonitorPage';
import AnalyticsViolationPage from './pages/analytics/AnalyticsViolationPage';
import AnalyticsDraftsPage from './pages/analytics/AnalyticsDraftsPage';
import AnalyticsDataScreenPage from './pages/analytics/DataScreenPage';

import SettingsProfilePage from './pages/user/SettingsProfilePage';
import SettingsPasswordPage from './pages/user/SettingsPasswordPage';
import SettingsVipPage from './pages/user/SettingsVipPage';
import SettingsLoginsPage from './pages/user/SettingsLoginsPage';
import SettingsNotifyPage from './pages/user/SettingsNotifyPage';
import SettingsThemePage from './pages/user/SettingsThemePage';
import SettingsDataPage from './pages/user/SettingsDataPage';

import AdminLoginPage from './pages/admin/LoginPage';
import AdminDashboardPage from './pages/admin/DashboardPage';
import AdminUsersPage from './pages/admin/UsersPage';
import AdminCodesPage from './pages/admin/CodesPage';
import AdminPlansPage from './pages/admin/PlansPage';
import AdminLogsPage from './pages/admin/LogsPage';
import AdminSettingsPage from './pages/admin/SettingsPage';
import AdminRealDashboardPage from './pages/admin/RealDashboardPage';
import AdminRealLogsPage from './pages/admin/RealLogsPage';
import AdminRealUsersPage from './pages/admin/RealUsersPage';
import AdminRealPlansPage from './pages/admin/RealPlansPage';
import AdminRealSettingsPage from './pages/admin/RealSettingsPage';

import DocsOverviewPage from './pages/docs/OverviewPage';
import DocsRequirementsPage from './pages/docs/RequirementsPage';
import DocsNonFunctionalPage from './pages/docs/NonFunctionalPage';
import DocsRoadmapPage from './pages/docs/RoadmapPage';
import DocsTestingPage from './pages/docs/TestingPage';
import DocsPlatformsPage from './pages/docs/PlatformsPage';

import NotFound from './pages/NotFound/NotFound';
import CapabilityPendingPage from './pages/CapabilityPendingPage';

const RoutesComponent = () => {
  return (
    <ThemeProvider>
      <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/activate" element={<ActivatePage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
      </Route>

      <Route element={<UserLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />

        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/accounts/groups" element={<AccountGroupsPage />} />

        <Route path="/publish" element={<ContentRecordsPage />} />
        <Route path="/publish/tasks" element={<ContentRecordsPage />} />
        <Route path="/publish/create" element={<ContentCreateRealPage />} />
        <Route path="/publish/batch-video" element={<CapabilityPendingPage />} />
        <Route path="/publish/batch-image" element={<CapabilityPendingPage />} />
        <Route path="/publish/drafts" element={<ContentRecordsPage />} />
        <Route path="/publish/stats" element={<AnalyticsPage />} />

        <Route path="/engage/comments" element={<CommentsPage />} />
        <Route path="/engage/comments-agg" element={<CapabilityPendingPage />} />
        <Route path="/engage/auto-comment" element={<CapabilityPendingPage />} />
        <Route path="/engage/batch-tasks" element={<CapabilityPendingPage />} />
        <Route path="/engage/messages" element={<MessagesPage />} />
        <Route path="/engage/messages-agg" element={<CapabilityPendingPage />} />
        <Route path="/engage/auto-message" element={<CapabilityPendingPage />} />
        <Route path="/engage/followers" element={<FollowersPage />} />
        <Route path="/engage/follower-monitor" element={<CapabilityPendingPage />} />

        <Route path="/automation/keywords" element={<CapabilityPendingPage />} />
        <Route path="/automation/welcome" element={<CapabilityPendingPage />} />
        <Route path="/automation/offline" element={<CapabilityPendingPage />} />
        <Route path="/automation/active-messages" element={<CapabilityPendingPage />} />
        <Route path="/automation/monitor" element={<CapabilityPendingPage />} />
        <Route path="/automation/templates" element={<CapabilityPendingPage />} />
        <Route path="/automation/logs" element={<CapabilityPendingPage />} />

        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/analytics/flow" element={<CapabilityPendingPage />} />
        <Route path="/analytics/account-monitor" element={<CapabilityPendingPage />} />
        <Route path="/analytics/notify-monitor" element={<CapabilityPendingPage />} />
        <Route path="/analytics/violation" element={<CapabilityPendingPage />} />
        <Route path="/analytics/drafts" element={<CapabilityPendingPage />} />
        <Route path="/analytics/data-screen" element={<CapabilityPendingPage />} />

        <Route path="/settings/profile" element={<SettingsProfilePage />} />
        <Route path="/settings/password" element={<SettingsPasswordPage />} />
        <Route path="/settings/vip" element={<SettingsVipPage />} />
        <Route path="/settings/logins" element={<SettingsLoginsPage />} />
        <Route path="/settings/notify" element={<SettingsNotifyPage />} />
        <Route path="/settings/theme" element={<SettingsThemePage />} />
        <Route path="/settings/data" element={<SettingsDataPage />} />
      </Route>

      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminRealDashboardPage />} />
        <Route path="dashboard" element={<AdminRealDashboardPage />} />
        <Route path="users" element={<AdminRealUsersPage />} />
        <Route path="codes" element={<AdminCodesPage />} />
        <Route path="plans" element={<AdminRealPlansPage />} />
        <Route path="logs" element={<AdminRealLogsPage />} />
        <Route path="settings" element={<AdminRealSettingsPage />} />
      </Route>

      <Route path="/docs" element={<DocsLayout />}>
        <Route index element={<DocsOverviewPage />} />
        <Route path="overview" element={<DocsOverviewPage />} />
        <Route path="requirements" element={<DocsRequirementsPage />} />
        <Route path="non-functional" element={<DocsNonFunctionalPage />} />
        <Route path="roadmap" element={<DocsRoadmapPage />} />
        <Route path="testing" element={<DocsTestingPage />} />
        <Route path="platforms" element={<DocsPlatformsPage />} />
      </Route>

      <Route path="*" element={<NotFound />} />
      </Routes>
    </ThemeProvider>
  );
};

export default RoutesComponent;
