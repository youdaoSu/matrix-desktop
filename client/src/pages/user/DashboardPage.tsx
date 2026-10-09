import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Megaphone,
  Play,
  Video,
  MessageCircle,
  Crown,
  Check,
  X,
  Sparkles,
  BarChart3,
  Search,
  ChevronRight,
  ChevronLeft,
  Clock,
  History,
  QrCode,
  KeyRound,
  GraduationCap,
  X as XIcon,
  Users,
  FileText,
  UserPlus,
} from 'lucide-react';
import { Card, CardContent } from '@client/src/components/ui/card';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import { Input } from '@client/src/components/ui/input';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@client/src/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@client/src/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@client/src/components/ui/dialog';
import {
  ScrollArea,
} from '@client/src/components/ui/scroll-area';
import RightSidebar from './RightSidebar';
import {
  tutorialSections,
  faqCategories,
  vipPlans,
  onboardingSteps,
} from './dashboard-data';
import type { TutorialItem, TutorialStep } from './dashboard-data';
import type { Announcement } from '@shared/api.interface';
import { cn } from '@/lib/utils';
import OnboardingGuide from './OnboardingGuide';
import { axiosForBackend } from '@/api';

const DashboardPage = () => {
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dashboardStats, setDashboardStats] = useState({ accounts: 0, posts: 0, followers: 0 });
  const latestAnnouncement: Announcement = announcements[0] || {
    id: 'none',
    title: '暂无公告',
    content: '管理员尚未发布公告。',
    summary: '管理员尚未发布公告',
    category: 'system',
    isPublished: true,
    sortOrder: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  useEffect(() => {
    Promise.all([
      axiosForBackend.get('/api/notifications/announcements', { params: { limit: 50 } }),
      axiosForBackend.get('/api/platform/stats'),
      axiosForBackend.get('/api/analytics/overview'),
    ]).then(([announcementResponse, platformResponse, analyticsResponse]) => {
      setAnnouncements(announcementResponse.data?.data || []);
      setDashboardStats({
        accounts: Number(platformResponse.data?.data?.total || 0),
        posts: Number(analyticsResponse.data?.data?.totalPosts || 0),
        followers: Number(analyticsResponse.data?.data?.totalFollowers || 0),
      });
    }).catch(() => {
      setAnnouncements([]);
      setDashboardStats({ accounts: 0, posts: 0, followers: 0 });
    });
  }, []);

  const statCards = [
    { label: '账号数', value: dashboardStats.accounts.toLocaleString(), icon: Users, color: 'text-primary', bg: 'bg-primary/10', navigateTo: '/accounts' },
    { label: '作品总数', value: dashboardStats.posts.toLocaleString(), icon: FileText, color: 'text-[hsl(130_54%_42%)]', bg: 'bg-[hsl(130_54%_42%)/10]', navigateTo: '/publish/tasks' },
    { label: '粉丝总数', value: dashboardStats.followers.toLocaleString(), icon: UserPlus, color: 'text-[hsl(26_90%_49%)]', bg: 'bg-[hsl(26_90%_49%)/10]', navigateTo: '/engage/followers' },
  ];

  // ─── 公告相关 state ─────────────────────────────────────
  const [announcementDetailOpen, setAnnouncementDetailOpen] = useState(false);
  const [announcementHistoryOpen, setAnnouncementHistoryOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 5;
  const totalHistoryPages = Math.ceil(announcements.length / historyPageSize);
  const historyPageItems = announcements.slice(
    (historyPage - 1) * historyPageSize,
    historyPage * historyPageSize
  );

  // ─── 教程分步弹窗 state ────────────────────────────────
  const [tutorialDialogOpen, setTutorialDialogOpen] = useState(false);
  const [currentTutorial, setCurrentTutorial] = useState<TutorialItem | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const handleTutorialClick = (tutorial: TutorialItem) => {
    setCurrentTutorial(tutorial);
    setCurrentStepIndex(0);
    setTutorialDialogOpen(true);
  };

  const handlePrevStep = () => {
    setCurrentStepIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNextStep = () => {
    if (!currentTutorial) return;
    setCurrentStepIndex((prev) => Math.min(currentTutorial.steps.length - 1, prev + 1));
  };

  // ─── FAQ 搜索 state ────────────────────────────────────
  const [faqSearchKeyword, setFaqSearchKeyword] = useState('');

  const filteredFaqCategories = useMemo(() => {
    if (!faqSearchKeyword.trim()) return faqCategories;
    const keyword = faqSearchKeyword.toLowerCase();
    return faqCategories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) =>
            item.q.toLowerCase().includes(keyword) ||
            item.a.toLowerCase().includes(keyword)
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [faqSearchKeyword]);

  const hasFaqResults = filteredFaqCategories.length > 0;

  // ─── 续费 / 购买弹窗 state ─────────────────────────────
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [paymentStep, setPaymentStep] = useState<'select' | 'payment'>('select');

  const handleRenewClick = () => {
    setPaymentStep('select');
    setSelectedPlan(null);
    setPlanDialogOpen(true);
  };

  const handleSelectPlan = (planName: string) => {
    setSelectedPlan(planName);
    setPaymentStep('payment');
  };

  const handleClosePlanDialog = () => {
    setPlanDialogOpen(false);
    setTimeout(() => {
      setPaymentStep('select');
      setSelectedPlan(null);
    }, 300);
  };

  // ─── 新手引导 state ────────────────────────────────────
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const categoryLabels: Record<string, string> = {
    system: '系统',
    update: '更新',
    activity: '活动',
    compliance: '合规',
  };

  return (
    <div className="space-y-4">
      <div className="text-xs text-primary bg-primary/5 border border-primary/20 rounded-md px-3 py-1.5 flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5" />
        首页统计来自本地真实数据库；未同步的平台指标显示为 0
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
        {/* Left main area */}
        <div className="space-y-4">
          {/* Announcement card */}
          <Card className="bg-gradient-to-br from-[hsl(26_90%_49%)/8] via-card to-card border-[hsl(26_90%_49%)/20] overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-[hsl(26_90%_49%)]/10 flex items-center justify-center">
                  <Megaphone className="w-4 h-4 text-[hsl(26_90%_49%)]" />
                </div>
                <h3 className="text-base font-semibold text-foreground">公告</h3>
                <Badge
                  variant="secondary"
                  className="text-xs bg-[hsl(26_90%_49%)]/10 text-[hsl(26_90%_49%)] border-0"
                >
                  {formatDate(latestAnnouncement.createdAt)}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-7 text-xs text-muted-foreground hover:text-foreground px-2"
                  onClick={() => setAnnouncementHistoryOpen(true)}
                >
                  <History className="w-3.5 h-3.5" />
                  历史公告
                </Button>
              </div>
              <div className="mb-3">
                <h4 className="text-sm font-semibold text-foreground mb-1">
                  {latestAnnouncement.title}
                </h4>
                <p className="text-sm text-muted-foreground leading-5 line-clamp-2">
                  {latestAnnouncement.summary}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-7 bg-[hsl(26_90%_49%)] hover:bg-[hsl(26_90%_45%)] text-white border-0"
                  onClick={() => setAnnouncementDetailOpen(true)}
                >
                  查看详情
                </Button>
                <Badge
                  variant="secondary"
                  className="text-[10px] h-5 px-1.5 bg-muted/60 border-0"
                >
                  {categoryLabels[latestAnnouncement.category] || '公告'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Three stat cards */}
          <div className="grid grid-cols-3 gap-4" data-ai-section-type="card-stat">
            {statCards.map((stat, index: number) => (
              <Card
                key={index}
                className="cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                onClick={() => navigate(stat.navigateTo)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-xs text-muted-foreground">{stat.label}</span>
                    <div className={`w-8 h-8 rounded-md ${stat.bg} flex items-center justify-center`}>
                      <stat.icon className={`w-4 h-4 ${stat.color}`} />
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                  <div className="flex items-center gap-1 mt-2 text-[11px] text-[hsl(26_90%_49%)]">
                    点击查看详情
                    <ChevronRight className="w-3 h-3" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="text-right -mt-2">
            <Link
              to="/analytics"
              className="text-xs text-[hsl(26_90%_49%)] hover:underline inline-flex items-center gap-1"
            >
              数据中心查看
              <BarChart3 className="w-3 h-3" />
            </Link>
          </div>

          {/* Tabs section */}
          <Card>
            <CardContent className="p-5">
              <Tabs defaultValue="tutorials">
                <TabsList className="mb-5 bg-muted/60">
                  <TabsTrigger value="tutorials" className="text-xs px-3">
                    <Play className="w-3.5 h-3.5" />
                    视频教程
                  </TabsTrigger>
                  <TabsTrigger value="faq" className="text-xs px-3">
                    <MessageCircle className="w-3.5 h-3.5" />
                    常见问题
                  </TabsTrigger>
                  <TabsTrigger value="compare" className="text-xs px-3">
                    <Crown className="w-3.5 h-3.5" />
                    会员功能对比
                  </TabsTrigger>
                </TabsList>

                {/* Tutorials tab */}
                <TabsContent value="tutorials" className="mt-0 space-y-5">
                  {tutorialSections.map((section) => (
                    <div key={section.title}>
                      <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                        <Video className="w-4 h-4 text-primary" />
                        {section.title}
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {section.items.map((item, idx: number) => (
                          <div
                            key={idx}
                            className="group cursor-pointer hover:-translate-y-0.5 transition-transform"
                            onClick={() => handleTutorialClick(item)}
                          >
                            <div
                              className={`aspect-video rounded-lg bg-gradient-to-br ${item.gradient} flex items-center justify-center relative overflow-hidden shadow-sm`}
                            >
                              <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:bg-white/30 transition-colors">
                                <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                              </div>
                              <div className="absolute bottom-1.5 right-2 text-[10px] text-white/80 bg-black/20 rounded px-1 flex items-center gap-0.5">
                                <Clock className="w-2.5 h-2.5" />
                                {item.steps.length} 步
                              </div>
                            </div>
                            <p className="text-xs text-foreground/80 mt-2 leading-4 line-clamp-2 group-hover:text-primary transition-colors">
                              {item.title}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </TabsContent>

                {/* FAQ tab */}
                <TabsContent value="faq" className="mt-0">
                  {/* Search input */}
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="搜索常见问题..."
                      className="pl-9 h-9 text-sm"
                      value={faqSearchKeyword}
                      onChange={(e) => setFaqSearchKeyword(e.target.value)}
                    />
                    {faqSearchKeyword && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 hover:bg-transparent"
                        onClick={() => setFaqSearchKeyword('')}
                      >
                        <XIcon className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    )}
                  </div>

                  {!hasFaqResults ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <Search className="w-10 h-10 mb-2 opacity-30" />
                      <p className="text-sm">未找到相关问题</p>
                      <p className="text-xs mt-1">试试其他关键词，或联系客服咨询</p>
                    </div>
                  ) : (
                    <Tabs defaultValue={filteredFaqCategories[0]?.value || 'register'} orientation="vertical">
                      <div className="flex gap-6">
                        <TabsList className="flex-col h-auto w-32 bg-transparent p-0 gap-1">
                          {filteredFaqCategories.map((cat) => (
                            <TabsTrigger
                              key={cat.value}
                              value={cat.value}
                              className="justify-start text-xs px-3 h-8 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                            >
                              {cat.label}
                              <Badge
                                variant="secondary"
                                className="ml-auto text-[10px] h-4 min-w-4 px-1 bg-muted border-0"
                              >
                                {cat.items.length}
                              </Badge>
                            </TabsTrigger>
                          ))}
                        </TabsList>
                        <div className="flex-1 min-w-0">
                          {filteredFaqCategories.map((cat) => (
                            <TabsContent key={cat.value} value={cat.value} className="mt-0">
                              <Accordion type="single" collapsible className="w-full">
                                {cat.items.map((item, idx: number) => (
                                  <AccordionItem key={idx} value={`item-${idx}`}>
                                    <AccordionTrigger className="text-sm py-3 hover:no-underline">
                                      {item.q}
                                    </AccordionTrigger>
                                    <AccordionContent className="text-sm text-muted-foreground leading-6">
                                      {item.a}
                                    </AccordionContent>
                                  </AccordionItem>
                                ))}
                              </Accordion>
                            </TabsContent>
                          ))}
                        </div>
                      </div>
                    </Tabs>
                  )}
                </TabsContent>

                {/* Compare tab */}
                <TabsContent value="compare" className="mt-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left text-xs font-medium text-muted-foreground pb-3 pl-2">功能</th>
                          {vipPlans.map((plan) => (
                            <th key={plan.name} className="text-center pb-3 px-2 relative">
                              {plan.popular && (
                                <Badge
                                  variant="default"
                                  className="absolute -top-1 left-1/2 -translate-x-1/2 text-[10px] py-0 px-1.5 bg-[hsl(26_90%_49%)] border-0"
                                >
                                  推荐
                                </Badge>
                              )}
                              <div className="text-sm font-semibold text-foreground mt-2">{plan.name}</div>
                              <div className="text-base font-bold text-primary mt-1">
                                {plan.price}
                                <span className="text-xs font-normal text-muted-foreground">{plan.period}</span>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { label: '可绑定账号数', key: 'accounts' },
                          { label: '自动回复', key: 'autoReply' },
                          { label: '私信聚合', key: 'messageAgg' },
                          { label: '数据监控', key: 'dataMonitor' },
                          { label: '优先客服', key: 'priorityService' },
                        ].map((row) => (
                          <tr key={row.key} className="border-b border-border/50 last:border-b-0">
                            <td className="py-3 pl-2 text-xs text-muted-foreground">{row.label}</td>
                            {vipPlans.map((plan, idx: number) => (
                              <td key={idx} className="text-center py-3">
                                {row.key === 'accounts' ? (
                                  <span className="text-sm font-medium">{plan.accounts}</span>
                                ) : plan.features[row.key as keyof typeof plan.features] ? (
                                  <Check className="w-4 h-4 text-[hsl(130_54%_42%)] mx-auto" />
                                ) : (
                                  <X className="w-4 h-4 text-muted-foreground/40 mx-auto" />
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4 text-center">
                    <Button
                      size="sm"
                      className="bg-[hsl(26_90%_49%)] hover:bg-[hsl(26_90%_45%)] text-white border-0"
                      onClick={handleRenewClick}
                    >
                      <Crown className="w-4 h-4" />
                      立即开通
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Right sidebar */}
        <RightSidebar onRenewClick={handleRenewClick} onOnboardingClick={() => setOnboardingOpen(true)} />
      </div>

      {/* ─── 公告详情弹窗 ─────────────────────────────── */}
      <Dialog open={announcementDetailOpen} onOpenChange={setAnnouncementDetailOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Badge
                variant="secondary"
                className="text-[10px] h-5 px-1.5 bg-[hsl(26_90%_49%)]/10 text-[hsl(26_90%_49%)] border-0"
              >
                {categoryLabels[latestAnnouncement.category] || '公告'}
              </Badge>
              {latestAnnouncement.title}
            </DialogTitle>
            <DialogDescription className="text-xs">
              发布于 {formatDate(latestAnnouncement.createdAt)}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-2">
            <div className="text-sm text-foreground/90 leading-6 whitespace-pre-line">
              {latestAnnouncement.content}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAnnouncementDetailOpen(false);
                setAnnouncementHistoryOpen(true);
              }}
            >
              查看历史公告
            </Button>
            <Button
              size="sm"
              className="bg-[hsl(26_90%_49%)] hover:bg-[hsl(26_90%_45%)] text-white border-0"
              onClick={() => setAnnouncementDetailOpen(false)}
            >
              我知道了
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── 历史公告弹窗 ─────────────────────────────── */}
      <Dialog open={announcementHistoryOpen} onOpenChange={setAnnouncementHistoryOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">历史公告</DialogTitle>
            <DialogDescription className="text-xs">
              共 {announcements.length} 条公告
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-1">
            <div className="space-y-2">
              {historyPageItems.map((announcement) => (
                <Card
                  key={announcement.id}
                  className="cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => {
                    setAnnouncementHistoryOpen(false);
                    // 简单实现：点击后打开详情（这里复用详情弹窗展示最新公告逻辑不够，
                    // 实际项目应做详情页或参数化弹窗。mock 阶段直接打开详情页效果）
                    setAnnouncementDetailOpen(true);
                  }}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h4 className="text-sm font-medium text-foreground line-clamp-1">
                        {announcement.title}
                      </h4>
                      <Badge
                        variant="secondary"
                        className="text-[10px] h-4 px-1.5 bg-muted/60 border-0 shrink-0"
                      >
                        {categoryLabels[announcement.category] || '公告'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-4 mb-1.5">
                      {announcement.summary}
                    </p>
                    <div className="text-[11px] text-muted-foreground/70 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(announcement.createdAt)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
          {totalHistoryPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setHistoryPage((prev) => Math.max(1, prev - 1))}
                disabled={historyPage === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                {historyPage} / {totalHistoryPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setHistoryPage((prev) => Math.min(totalHistoryPages, prev + 1))}
                disabled={historyPage === totalHistoryPages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── 教程分步弹窗 ─────────────────────────────── */}
      <Dialog open={tutorialDialogOpen} onOpenChange={setTutorialDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base">{currentTutorial?.title}</DialogTitle>
            <DialogDescription className="text-xs">
              {currentTutorial && currentStepIndex < currentTutorial.steps.length
                ? `第 ${currentStepIndex + 1} / ${currentTutorial.steps.length} 步`
                : ''}
            </DialogDescription>
          </DialogHeader>

          {currentTutorial && currentStepIndex < currentTutorial.steps.length && (
            <>
              {/* Step image placeholder */}
              <div
                className={`w-full aspect-video rounded-lg bg-gradient-to-br ${currentTutorial.gradient} flex items-center justify-center`}
              >
                <div className="text-center text-white">
                  <Play className="w-12 h-12 mx-auto mb-2 opacity-60" />
                  <p className="text-sm opacity-80">
                    {currentTutorial.steps[currentStepIndex].imageHint}
                  </p>
                </div>
              </div>

              {/* Step content */}
              <div className="py-2">
                <h4 className="text-sm font-semibold text-foreground mb-2">
                  {currentTutorial.steps[currentStepIndex].title}
                </h4>
                <p className="text-sm text-muted-foreground leading-6">
                  {currentTutorial.steps[currentStepIndex].description}
                </p>
              </div>

              {/* Step indicator dots */}
              <div className="flex items-center justify-center gap-1.5">
                {currentTutorial.steps.map((_: TutorialStep, idx: number) => (
                  <button
                    key={idx}
                    className={cn(
                      'w-2 h-2 rounded-full transition-all',
                      idx === currentStepIndex
                        ? 'bg-primary w-4'
                        : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                    )}
                    onClick={() => setCurrentStepIndex(idx)}
                    aria-label={`跳转到第 ${idx + 1} 步`}
                  />
                ))}
              </div>

              <DialogFooter className="flex-row sm:justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevStep}
                  disabled={currentStepIndex === 0}
                >
                  <ChevronLeft className="w-4 h-4" />
                  上一步
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setTutorialDialogOpen(false)}
                  >
                    跳过
                  </Button>
                  {currentStepIndex < currentTutorial.steps.length - 1 ? (
                    <Button
                      size="sm"
                      className="bg-[hsl(26_90%_49%)] hover:bg-[hsl(26_90%_45%)] text-white border-0"
                      onClick={handleNextStep}
                    >
                      下一步
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="bg-[hsl(26_90%_49%)] hover:bg-[hsl(26_90%_45%)] text-white border-0"
                      onClick={() => setTutorialDialogOpen(false)}
                    >
                      完成教程
                      <Check className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── 套餐选择 / 购买指引弹窗 ───────────────────── */}
      <Dialog open={planDialogOpen} onOpenChange={handleClosePlanDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              {paymentStep === 'select' ? '选择套餐' : '支付指引'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {paymentStep === 'select'
                ? '选择适合您的套餐，联系客服获取授权码即可激活'
                : `已选择「${selectedPlan}」套餐`}
            </DialogDescription>
          </DialogHeader>

          {paymentStep === 'select' ? (
            <>
              <div className="grid grid-cols-3 gap-3 py-2">
                {vipPlans.map((plan) => (
                  <Card
                    key={plan.name}
                    className={cn(
                      'cursor-pointer transition-all hover:shadow-md relative overflow-hidden',
                      plan.popular && 'border-[hsl(26_90%_49%)]/50'
                    )}
                    onClick={() => handleSelectPlan(plan.name)}
                  >
                    {plan.popular && (
                      <div className="absolute top-0 right-0">
                        <Badge
                          variant="default"
                          className="rounded-none rounded-bl-md text-[10px] bg-[hsl(26_90%_49%)] border-0 px-2 py-0.5"
                        >
                          推荐
                        </Badge>
                      </div>
                    )}
                    <CardContent className="p-4">
                      <div className="text-sm font-semibold text-foreground mb-1">
                        {plan.name}
                      </div>
                      <div className="flex items-baseline gap-0.5 mb-3">
                        <span className="text-xl font-bold text-primary">{plan.price}</span>
                        <span className="text-xs text-muted-foreground">{plan.period}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mb-3">
                        可绑定 {plan.accounts} 账号
                      </div>
                      <div className="space-y-1.5 mb-4">
                        {Object.entries(plan.features).map(([key, value]) => (
                          <div key={key} className="flex items-center gap-1.5 text-[11px]">
                            {value ? (
                              <Check className="w-3 h-3 text-[hsl(130_54%_42%)] shrink-0" />
                            ) : (
                              <X className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                            )}
                            <span className={value ? 'text-foreground/70' : 'text-muted-foreground/60'}>
                              {key === 'autoReply' && '自动回复'}
                              {key === 'messageAgg' && '私信聚合'}
                              {key === 'dataMonitor' && '数据监控'}
                              {key === 'priorityService' && '优先客服'}
                            </span>
                          </div>
                        ))}
                      </div>
                      <Button
                        size="sm"
                        className="w-full bg-[hsl(26_90%_49%)] hover:bg-[hsl(26_90%_45%)] text-white border-0"
                      >
                        选择套餐
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="text-[11px] text-muted-foreground text-center">
                选择套餐后联系客服获取授权码，在设置-VIP激活页面输入即可开通
              </div>
            </>
          ) : (
            <div className="py-4">
              <div className="bg-[hsl(26_90%_49%)/8] border border-[hsl(26_90%_49%)/20] rounded-lg p-4 mb-4">
                <div className="text-sm font-medium text-foreground mb-2 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-[hsl(26_90%_49%)]" />
                  激活流程
                </div>
                <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside leading-5">
                  <li>添加客服微信，告知需开通「{selectedPlan}」套餐</li>
                  <li>完成支付后，客服将发放授权码</li>
                  <li>进入「设置 - VIP 状态」页面</li>
                  <li>输入授权码，点击激活即可立即生效</li>
                </ol>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-28 h-28 rounded-lg bg-muted border border-border flex items-center justify-center mb-2">
                    <QrCode className="w-20 h-20 text-foreground/40" />
                  </div>
                  <div className="text-xs font-medium text-foreground">客服微信</div>
                  <div className="text-[11px] text-muted-foreground">扫码添加咨询</div>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-28 h-28 rounded-lg bg-muted border border-border flex items-center justify-center mb-2">
                    <KeyRound className="w-20 h-20 text-foreground/40" />
                  </div>
                  <div className="text-xs font-medium text-foreground">授权码激活</div>
                  <div className="text-[11px] text-muted-foreground">设置 - VIP 状态</div>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setPaymentStep('select')}
                >
                  <ChevronLeft className="w-4 h-4" />
                  重新选择
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-[hsl(26_90%_49%)] hover:bg-[hsl(26_90%_45%)] text-white border-0"
                  onClick={() => {
                    handleClosePlanDialog();
                    navigate('/settings/vip');
                  }}
                >
                  前往激活页面
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── 新手引导 ─────────────────────────────────── */}
      <OnboardingGuide
        open={onboardingOpen}
        steps={onboardingSteps}
        onClose={() => setOnboardingOpen(false)}
      />
    </div>
  );
};

export default DashboardPage;
