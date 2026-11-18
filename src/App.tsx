import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bot,
  Box,
  ChevronDown,
  ChevronUp,
  Compass,
  Crosshair,
  Hash,
  Menu,
  MessageSquare,
  Monitor,
  Network,
  Play,
  RotateCcw,
  RefreshCw,
  Send,
  Shield,
  Sparkles,
  StepForward,
  Terminal,
  X,
} from 'lucide-react';
import {
  AGENTS,
  DEPARTMENTS,
  INITIAL_CHAT_MESSAGES,
  RECENT_MT5_ORDERS,
  SIMULATION_STEPS,
  STEP_DURATION_MS,
} from './data/agentsData';
import { buildFloorLayout } from './lib/floorLayout';
import { parseRiskPct, parseSlPips, routeCommand } from './lib/commandRouter';
import {
  ACCOUNT_BALANCE,
  CURRENT_DAILY_DD_PCT,
  DEFAULT_RISK_PCT,
  MAX_DAILY_DD_PCT,
  MAX_SPREAD_PIPS,
  PIP_VALUE_PER_LOT,
  SAMPLE_SETUP,
  calcLotSize,
  fmtUsd,
} from './lib/risk';
import { VirtualTradingFloor } from './components/VirtualTradingFloor';
import { KpiMyfxbookModal } from './components/KpiMyfxbookModal';
import { OrgChart2D } from './components/OrgChart2D';
import { ChatMessage, MT5OrderRecord } from './types/trading';

export function App() {
  // Navigation & View Mode ('3d' | 'org')
  const [viewMode, setViewMode] = useState<'3d' | 'org'>('3d');

  // Mobile Sidebar Drawer state
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);

  // Selected Agent / Channel in Sidebar & 3D Desk List
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string>('all');

  // Top Header Toolbar Controls
  const [isKpiModalOpen, setIsKpiModalOpen] = useState<boolean>(false);
  const [isSimulating, setIsSimulating] = useState<boolean>(true);
  const [simStepIndex, setSimStepIndex] = useState<number>(0);
  const [showMT5Screens, setShowMT5Screens] = useState<boolean>(true);
  const [followSelected, setFollowSelected] = useState<boolean>(false);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [resetCameraTrigger, setResetCameraTrigger] = useState<number>(0);

  // Floating 3D Panels Collapsible States (auto-collapse on small mobile screens so 3D view is clear)
  const [isDeskListCollapsed, setIsDeskListCollapsed] = useState<boolean>(
    () => typeof window !== 'undefined' && window.innerWidth < 768
  );
  const [isLiveFeedOpen, setIsLiveFeedOpen] = useState<boolean>(
    () => typeof window === 'undefined' || window.innerWidth >= 768
  );

  // Live Market Ticker State (default anchored around XAUUSD: 2,685.40 | DXY: 104.25 | Spread: 1.2 pips)
  const [liveGoldPrice, setLiveGoldPrice] = useState<number>(2685.4);
  const [liveDxyPrice, setLiveDxyPrice] = useState<number>(104.25);
  const [liveSpread, setLiveSpread] = useState<number>(1.2);

  // Dynamic KPI Counters that increment during Simulation loop
  const [scannedSetupsCount, setScannedSetupsCount] = useState<number>(42);
  const [executedOrdersCount, setExecutedOrdersCount] = useState<number>(19);
  const [totalPipsWeek, setTotalPipsWeek] = useState<number>(640);
  const [todayPips, setTodayPips] = useState<number>(SAMPLE_SETUP.tpPips);
  const [blockedByCroCount] = useState<number>(4);
  const [orders] = useState<MT5OrderRecord[]>(RECENT_MT5_ORDERS);

  // Chat & Command Dispatcher State
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_CHAT_MESSAGES);
  const [chatInput, setChatInput] = useState<string>('');
  const [customCommandOverride, setCustomCommandOverride] = useState<{
    agentId: string;
    taskText: string;
    bubbleText: string;
  } | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const overrideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sàn 3D tự xếp bàn theo số Agent mỗi phòng ban
  const floorLayout = useMemo(() => buildFloorLayout(AGENTS, DEPARTMENTS), []);
  const agentCount = AGENTS.length;

  const activeHandover = useMemo(
    () => SIMULATION_STEPS[simStepIndex % SIMULATION_STEPS.length],
    [simStepIndex]
  );

  // Subtle realistic XAUUSD & DXY tick micro-fluctuation around 2,685.40 and 104.25
  useEffect(() => {
    const tickerInterval = setInterval(() => {
      setLiveGoldPrice((prev) => {
        const delta = (Math.random() - 0.49) * 0.18;
        const next = prev + delta;
        return Math.max(2684.8, Math.min(2686.5, Number(next.toFixed(2))));
      });
      setLiveDxyPrice((prev) => {
        const delta = (Math.random() - 0.5) * 0.02;
        const next = prev + delta;
        return Math.max(104.18, Math.min(104.32, Number(next.toFixed(2))));
      });
      setLiveSpread(() => {
        const spreads = [1.1, 1.2, 1.2, 1.3, 1.2];
        return spreads[Math.floor(Math.random() * spreads.length)];
      });
    }, 2200);
    return () => clearInterval(tickerInterval);
  }, []);

  // Chuyển sang bước Handover kế tiếp (dùng chung cho vòng lặp tự động & nút "bước tiếp")
  const advanceSimStep = (fromIdx: number) => {
    const nextIdx = (fromIdx + 1) % SIMULATION_STEPS.length;
    const step = SIMULATION_STEPS[nextIdx];
    const fromAgent = AGENTS.find((a) => a.id === step.fromAgentId);
    const timeStr = new Date().toTimeString().slice(0, 8);

    setSimStepIndex(nextIdx);
    setMessages((oldMsgs) => [
      ...oldMsgs.slice(-30),
      {
        id: `sim-${Date.now()}-${nextIdx}`,
        timestamp: timeStr,
        senderId: step.fromAgentId,
        senderName: fromAgent ? fromAgent.name : 'Prop Desk Bot',
        senderRole: fromAgent ? fromAgent.shortRole : 'System',
        departmentId: fromAgent?.departmentId,
        channelId: 'all',
        content: step.logMessage,
        badgeText: `${step.pipTag} • ${step.lotTag}`,
      },
    ]);

    if (nextIdx === 0) {
      setScannedSetupsCount((c) => c + 1);
    }
    if (nextIdx === SIMULATION_STEPS.length - 1) {
      // Lệnh khớp => cộng đúng số pips của setup (145p), không phải 14.5
      setExecutedOrdersCount((c) => c + 1);
      setTotalPipsWeek((p) => p + SAMPLE_SETUP.tpPips);
      setTodayPips((p) => p + SAMPLE_SETUP.tpPips);
    }
  };

  // Vòng lặp mô phỏng: mỗi bước chạy đủ STEP_DURATION_MS rồi mới sang bước sau.
  // Dùng setTimeout theo simStepIndex (thay vì setInterval) để bấm "bước tiếp" cũng reset nhịp,
  // giúp nhân vật 3D đi - đứng - quay về khớp đúng thời gian.
  useEffect(() => {
    if (!isSimulating) return;
    const timer = setTimeout(() => advanceSimStep(simStepIndex), STEP_DURATION_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSimulating, simStepIndex]);

  // Auto-scroll chat log when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Select an Agent & smoothly fly camera to their 3D desk
  const handleSelectAgentDesk = (agentId: string) => {
    setSelectedAgentId(agentId);
    setActiveChannelId(agentId);
    setIsMobileSidebarOpen(false);
    if (viewMode !== '3d') {
      setViewMode('3d');
    }
  };

  // Reset camera to standard panoramic view
  const handleResetStandardCamera = () => {
    setSelectedAgentId(null);
    setFollowSelected(false);
    setResetCameraTrigger((c) => c + 1);
  };

  // Handle dispatching command from Bottom Chat Bar
  const handleDispatchCommand = (rawText?: string) => {
    const text = (rawText ?? chatInput).trim();
    if (!text) return;

    const now = new Date().toTimeString().slice(0, 8);
    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      timestamp: now,
      senderId: 'commander',
      senderName: 'Quản Trị Viên Quỹ (Bạn)',
      senderRole: 'Desk Commander',
      departmentId: 'user',
      channelId: activeChannelId,
      content: text,
      badgeText: 'LỆNH ĐIỀU PHỐI',
      isCommand: true,
    };

    const route = routeCommand(text, AGENTS, selectedAgentId);
    const responder =
      route.kind === 'everyone'
        ? AGENTS.find((a) => a.id === 'alpha-cio') ?? AGENTS[0]
        : route.agent;
    const S = SAMPLE_SETUP;

    let replyContent = '';
    let replyBadge = 'ĐÃ NHẬN LỆNH';
    let bubbleShort = 'Đã nhận lệnh điều phối!';

    if (route.kind === 'everyone') {
      replyContent = `📡 [Hội đồng ${agentCount} Agents XAUUSD]: Đã quét đa khung M15/H1 trước tin CPI! DXY đang giảm -0.35% (${liveDxyPrice.toFixed(2)}), đỉnh London High 2,688.40 đã bị quét thanh khoản. Đề xuất canh SELL LIMIT ${S.lots.toFixed(2)} Lots tại vùng FVG ${S.entry.toFixed(2)} (SL: ${S.sl.toFixed(1)} = ${S.slPips}p | TP: ${S.tp.toFixed(1)} = ${S.tpPips}p | R:R 1:${S.rr}).`;
      replyBadge = 'XAUUSD M15 Bearish Setup';
      bubbleShort = `M15 Quét BSL 2688 -> Canh SELL ${S.entry}!`;
    } else if (responder.id === 'shield-cro') {
      // Tính Lot thật bằng công thức cố định — không để AI tự nhẩm
      const slPips = parseSlPips(text) ?? S.slPips;
      const riskPct = parseRiskPct(text) ?? DEFAULT_RISK_PCT;
      const r = calcLotSize(ACCOUNT_BALANCE, riskPct, slPips);
      const spreadOk = liveSpread <= MAX_SPREAD_PIPS;
      const ddAfter = CURRENT_DAILY_DD_PCT + r.actualRiskPct;
      const ddOk = ddAfter <= MAX_DAILY_DD_PCT;
      const ok = r.lots > 0 && spreadOk && ddOk;
      const verdict = ok
        ? 'ĐẠT — An toàn vào lệnh!'
        : r.lots === 0
        ? 'TỪ CHỐI — SL quá rộng, khối lượng < 0.01 Lot.'
        : !spreadOk
        ? `TỪ CHỐI — Spread vượt trần ${MAX_SPREAD_PIPS} pips.`
        : `TỪ CHỐI — Nếu dính SL, DD ngày sẽ lên ${ddAfter.toFixed(2)}% > ${MAX_DAILY_DD_PCT}%.`;
      replyContent = `🛡️ [Shield CRO]: TK ${fmtUsd(ACCOUNT_BALANCE)} × Risk ${riskPct}% = ${fmtUsd(r.riskUsd)}. Lot = ${fmtUsd(r.riskUsd)} ÷ (${slPips} pips × $${PIP_VALUE_PER_LOT}/pip/lot) = ${r.lots.toFixed(2)} Lots (làm tròn xuống, rủi ro thực ${fmtUsd(r.actualRiskUsd, 2)}). Daily DD ${CURRENT_DAILY_DD_PCT}%/${MAX_DAILY_DD_PCT}% • Spread ${liveSpread.toFixed(1)} pips — ${verdict}`;
      replyBadge = `Risk ${riskPct}% | ${r.lots.toFixed(2)} Lots`;
      bubbleShort = `SL ${slPips}p -> ${r.lots.toFixed(2)} Lots (Risk ${riskPct}%)${ok ? '' : ' ✖'}`;
    } else if (responder.id === 'gold-smc-sniper') {
      replyContent = `🎯 [Gold SMC Sniper]: Cấu trúc XAUUSD M15 đã xác nhận CHoCH giảm sau khi quét BSL 2,688.40. Vùng Order Block + FVG hợp lưu đẹp nhất nằm tại ${S.entry.toFixed(2)} - 2,687.20, mục tiêu thanh khoản SSL ${S.tp.toFixed(2)} (+${S.tpPips} pips).`;
      replyBadge = `OB + FVG @ ${S.entry.toFixed(2)}`;
      bubbleShort = `OB + FVG ${S.entry.toFixed(2)} sẵn sàng đón giá!`;
    } else if (responder.id === 'mt5-flash-exec') {
      replyContent = `⚡ [MT5 Flash Exec]: Đã kích hoạt lệnh chờ MT5 SELL LIMIT ${S.lots.toFixed(2)} Lots @ ${S.entry.toFixed(2)} (SL: ${S.sl.toFixed(1)} | TP: ${S.tp.toFixed(1)}) qua VPS Equinix NY4 (0.8ms). Tự động dời SL về BE khi lệnh chạy +25 pips.`;
      replyBadge = 'MT5 Ticket #889209';
      bubbleShort = `MT5 SELL LIMIT ${S.lots}L @ ${S.entry} Active!`;
    } else {
      replyContent = `✅ [${responder.name}]: Đã tiếp nhận chỉ thị "${text}". Đang đồng bộ thông số trực tiếp lên màn hình MT5 và bàn giao kết quả cho Alpha CIO & Shield CRO.`;
      replyBadge = responder.shortRole;
      bubbleShort = `Đang xử lý: ${text.slice(0, 36)}...`;
    }

    const botReply: ChatMessage = {
      id: `bot-${Date.now() + 1}`,
      timestamp: now,
      senderId: responder.id,
      senderName: responder.name,
      senderRole: responder.shortRole,
      departmentId: responder.departmentId,
      channelId: activeChannelId,
      content: replyContent,
      badgeText: replyBadge,
    };

    setMessages((prev) => [...prev.slice(-30), userMsg, botReply]);
    setChatInput('');
    setSelectedAgentId(responder.id);

    setCustomCommandOverride({
      agentId: responder.id,
      taskText: text,
      bubbleText: bubbleShort,
    });
    // Hủy hẹn giờ cũ để lệnh mới không bị xóa bong bóng sớm
    if (overrideTimerRef.current) clearTimeout(overrideTimerRef.current);
    overrideTimerRef.current = setTimeout(() => {
      setCustomCommandOverride(null);
    }, 6000);
  };

  const displayedMessages = useMemo(() => {
    if (activeChannelId === 'all') return messages;
    return messages.filter(
      (m) =>
        m.channelId === activeChannelId ||
        m.senderId === activeChannelId ||
        m.isCommand
    );
  }, [messages, activeChannelId]);

  const collaboratingCount = isSimulating ? 2 : 0;
  const analyzingCount = agentCount - collaboratingCount;

  return (
    <div className="h-[100dvh] w-screen overflow-hidden bg-slate-950 text-slate-100 flex select-none font-sans relative">
      {/* Mobile Backdrop for Drawer */}
      {isMobileSidebarOpen && (
        <div
          onClick={() => setIsMobileSidebarOpen(false)}
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-40 lg:hidden"
        />
      )}

      {/* ==================== 1. LEFT SIDEBAR (Responsive Drawer on Mobile, Fixed on Desktop) ==================== */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 w-72 shrink-0 h-full bg-slate-950/95 border-r border-slate-800/90 flex flex-col justify-between z-50 transition-transform duration-300 ${
          isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="p-3.5 border-b border-slate-800/90 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 flex items-center justify-center font-mono font-black text-base shadow-[0_0_20px_rgba(251,191,36,0.45)] shrink-0">
                Au
              </div>
              <div className="min-w-0">
                <h1 className="text-xs font-extrabold tracking-wider uppercase text-amber-400 truncate">
                  XAUUSD & MT5 PROP DESK
                </h1>
                <p className="text-[11px] text-slate-400 truncate">
                  Quỹ Giao Dịch Vàng Đa Tác Nhân 3D
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsMobileSidebarOpen(false)}
              className="lg:hidden p-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* All-Floor Master Channel Button */}
          <button
            id="channel-all-floor-btn"
            onClick={() => {
              setActiveChannelId('all');
              handleResetStandardCamera();
              setIsMobileSidebarOpen(false);
            }}
            className={`mt-3 w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeChannelId === 'all' && !selectedAgentId
                ? 'bg-amber-400/15 text-amber-300 border border-amber-400/40 shadow-sm'
                : 'bg-slate-900/70 text-slate-300 hover:bg-slate-900 border border-slate-800'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-amber-400" />
              <span>sàn-giao-dịch-chung-xauusd</span>
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300">
              {agentCount} LIVE
            </span>
          </button>
        </div>

        {/* 4 Prop Desk Department Threads List */}
        <div className="flex-1 overflow-y-auto px-2.5 py-2 space-y-3.5">
          {DEPARTMENTS.map((dept, deptIdx) => {
            const deptAgents = AGENTS.filter((a) => a.departmentId === dept.id);
            return (
              <div key={dept.id} className="space-y-1">
                <div className="px-2 py-1 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      style={{ backgroundColor: dept.colorHex }}
                      className="w-2 h-2 rounded-full shrink-0"
                    />
                    <span
                      style={{ color: dept.colorHex }}
                      className="text-[10px] font-mono font-extrabold uppercase tracking-wider truncate"
                    >
                      {deptIdx + 1}. {dept.name}
                    </span>
                  </div>
                  <span className="text-[9px] font-mono text-slate-500 shrink-0">
                    {deptAgents.length}
                  </span>
                </div>

                <div className="space-y-0.5">
                  {deptAgents.map((agent) => {
                    const isSelected = selectedAgentId === agent.id;
                    const isCollaborating =
                      isSimulating &&
                      (activeHandover.fromAgentId === agent.id ||
                        activeHandover.toAgentId === agent.id);

                    return (
                      <button
                        key={agent.id}
                        id={`sidebar-agent-${agent.id}`}
                        onClick={() => handleSelectAgentDesk(agent.id)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg transition-all flex items-start justify-between gap-2 group ${
                          isSelected
                            ? 'bg-slate-800/95 border border-amber-400/50 shadow-md'
                            : 'hover:bg-slate-900/80 border border-transparent'
                        }`}
                      >
                        <div className="flex items-start gap-2 min-w-0">
                          <span
                            style={{
                              backgroundColor: isCollaborating
                                ? '#fbbf24'
                                : dept.colorHex,
                            }}
                            className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                              isCollaborating ? 'animate-ping' : ''
                            }`}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`text-xs font-bold truncate ${
                                  isSelected
                                    ? 'text-amber-300'
                                    : 'text-slate-200 group-hover:text-white'
                                }`}
                              >
                                {agent.name}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 truncate leading-tight">
                              {agent.role}
                            </div>
                          </div>
                        </div>

                        {isCollaborating ? (
                          <span className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30 font-mono text-[9px] font-bold">
                            HỘI Ý
                          </span>
                        ) : (
                          <span className="shrink-0 mt-0.5 text-[9px] font-mono text-emerald-400/80">
                            {agent.defaultProgress}%
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Sidebar View Mode Switcher: "Sàn Giao Dịch 3D" & "Sơ đồ Tổ chức" */}
        <div className="p-3 border-t border-slate-800/90 bg-slate-950 space-y-2">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 px-1">
            Chế độ hiển thị không gian
          </div>
          <div className="grid grid-cols-2 gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              id="view-mode-3d-btn"
              onClick={() => {
                setViewMode('3d');
                setIsMobileSidebarOpen(false);
              }}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-bold transition-all ${
                viewMode === '3d'
                  ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-[0_0_15px_rgba(251,191,36,0.4)]'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              <span>Sàn Giao Dịch 3D</span>
            </button>

            <button
              id="view-mode-org-btn"
              onClick={() => {
                setViewMode('org');
                setIsMobileSidebarOpen(false);
              }}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'org'
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              <span>Sơ đồ Tổ chức</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ==================== 2. MAIN WORKSPACE AREA ==================== */}
      <div className="flex-1 flex flex-col h-full min-w-0 relative">
        {/* TOP HEADER BAR */}
        <header className="bg-slate-950/95 border-b border-slate-800/90 px-3 sm:px-4 py-2 flex flex-col xl:flex-row xl:items-center justify-between gap-2 z-20 backdrop-blur-md">
          {/* Left: Mobile Menu Button + Overall Status & Live Market Ticker */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {/* Mobile Hamburger Button */}
            <button
              id="mobile-menu-btn"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg bg-slate-900 border border-amber-400/40 text-amber-400 shrink-0"
              aria-label="Mở danh sách Phòng ban & Agents"
            >
              <Menu className="w-4 h-4" />
            </button>

            {/* Overall Agent Status Pill */}
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs shrink-0">
              <span className="flex items-center gap-1.5 font-bold text-amber-400">
                <Bot className="w-3.5 h-3.5" />
                {agentCount} Agents
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-emerald-400 font-medium">
                {analyzingCount} đang phân tích sóng
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-amber-300 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                {collaboratingCount} đang hội ý duyệt lệnh
              </span>
            </div>

            {/* Live Direct Market Ticker required by prompt */}
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-900/95 border border-amber-400/30 font-mono text-xs shadow-[0_0_15px_rgba(251,191,36,0.1)] shrink-0">
              <Activity className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-pulse" />
              <span className="text-slate-200">
                XAUUSD:{' '}
                <strong className="text-amber-400">
                  {liveGoldPrice.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </strong>
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-200">
                DXY: <strong className="text-indigo-400">{liveDxyPrice.toFixed(2)}</strong>
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-200">
                Spread: <strong className="text-emerald-400">{liveSpread.toFixed(1)} pips</strong>
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-200">
                Phiên: <strong className="text-amber-300">New York Killzone</strong>
              </span>
            </div>
          </div>

          {/* Right: 6 Action Toolbar Buttons (horizontally scrollable on mobile) */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {/* 1. Bảng KPI & Myfxbook */}
            <button
              id="toolbar-kpi-btn"
              onClick={() => setIsKpiModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-400/15 hover:bg-amber-400/25 text-amber-300 border border-amber-400/40 transition-all shrink-0"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Bảng KPI & Myfxbook</span>
            </button>

            {/* 2. Đang diễn thử (Simulation Toggle + Next Step button) */}
            <div className="flex items-center rounded-lg overflow-hidden border border-emerald-500/40 bg-emerald-500/10 shrink-0">
              <button
                id="toolbar-simulation-btn"
                onClick={() => setIsSimulating((s) => !s)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold transition-all ${
                  isSimulating
                    ? 'text-emerald-300 bg-emerald-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Play
                  className={`w-3.5 h-3.5 ${
                    isSimulating ? 'fill-emerald-400 text-emerald-400 animate-pulse' : ''
                  }`}
                />
                <span>{isSimulating ? 'Đang diễn thử' : 'Tạm dừng diễn thử'}</span>
              </button>
              <button
                id="toolbar-next-step-btn"
                title="Chuyển ngay sang bước bàn giao lệnh kế tiếp"
                onClick={() => advanceSimStep(simStepIndex)}
                className="px-2 py-1.5 text-emerald-300 hover:bg-emerald-500/30 border-l border-emerald-500/30 transition-colors"
              >
                <StepForward className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 3. Màn hình MT5 trực tiếp */}
            <button
              id="toolbar-mt5-screens-btn"
              onClick={() => setShowMT5Screens((s) => !s)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all shrink-0 ${
                showMT5Screens
                  ? 'bg-indigo-500/20 text-indigo-300 border-indigo-400/50'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Màn hình MT5 trực tiếp</span>
            </button>

            {/* 4. Theo dõi chọn */}
            <button
              id="toolbar-follow-selected-btn"
              onClick={() => {
                if (!selectedAgentId) {
                  setSelectedAgentId(activeHandover.fromAgentId);
                }
                setFollowSelected((f) => !f);
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all shrink-0 ${
                followSelected
                  ? 'bg-amber-400 text-slate-950 border-amber-300 font-bold'
                  : 'bg-slate-900 text-slate-300 border-slate-800 hover:text-white'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>Theo dõi chọn</span>
            </button>

            {/* 5. Tự động xoay */}
            <button
              id="toolbar-autorotate-btn"
              onClick={() => setAutoRotate((r) => !r)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all shrink-0 ${
                autoRotate
                  ? 'bg-sky-500/20 text-sky-300 border-sky-400/50'
                  : 'bg-slate-900 text-slate-300 border-slate-800 hover:text-white'
              }`}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${autoRotate ? 'animate-spin' : ''}`}
              />
              <span>Tự động xoay</span>
            </button>

            {/* 6. Góc nhìn chuẩn */}
            <button
              id="toolbar-reset-camera-btn"
              onClick={handleResetStandardCamera}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 transition-all shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>Góc nhìn chuẩn</span>
            </button>
          </div>
        </header>

        {/* CENTER 3D TRADING FLOOR OR 2D ORG CHART */}
        <main className="flex-1 relative overflow-hidden">
          {viewMode === '3d' ? (
            <>
              <VirtualTradingFloor
                agents={floorLayout.agents}
                departments={floorLayout.departments}
                selectedAgentId={selectedAgentId}
                onSelectAgent={(id) => handleSelectAgentDesk(id)}
                activeHandover={activeHandover}
                isSimulating={isSimulating}
                showMT5Screens={showMT5Screens}
                followSelected={followSelected}
                autoRotate={autoRotate}
                resetCameraTrigger={resetCameraTrigger}
                liveGoldPrice={liveGoldPrice}
                customCommandOverride={customCommandOverride}
              />

              {/* ==================== FLOATING TOP-LEFT PANEL: "Bàn giao dịch (N)" ==================== */}
              <div className="absolute top-2.5 left-2.5 z-20 w-56 sm:w-64 rounded-xl bg-slate-950/90 backdrop-blur-md border border-slate-800/90 shadow-2xl overflow-hidden">
                <button
                  id="toggle-desk-list-btn"
                  onClick={() => setIsDeskListCollapsed((c) => !c)}
                  className="w-full px-3 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs font-bold text-amber-400 hover:bg-slate-900 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Compass className="w-4 h-4 text-amber-400" />
                    <span>Bàn giao dịch ({agentCount})</span>
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-mono text-slate-400">
                    <span className="hidden sm:inline">Camera Lerp</span>
                    {isDeskListCollapsed ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronUp className="w-3.5 h-3.5" />
                    )}
                  </span>
                </button>

                {!isDeskListCollapsed && (
                  <div className="p-1.5 max-h-[260px] sm:max-h-[340px] overflow-y-auto space-y-1">
                    {AGENTS.map((agent, idx) => {
                      const dept = DEPARTMENTS.find(
                        (d) => d.id === agent.departmentId
                      )!;
                      const isSelected = selectedAgentId === agent.id;
                      const isHandover =
                        isSimulating &&
                        (activeHandover.fromAgentId === agent.id ||
                          activeHandover.toAgentId === agent.id);

                      return (
                        <button
                          key={agent.id}
                          id={`floating-desk-btn-${agent.id}`}
                          onClick={() => handleSelectAgentDesk(agent.id)}
                          className={`w-full px-2.5 py-1.5 rounded-lg text-left flex items-center justify-between gap-2 transition-all ${
                            isSelected
                              ? 'bg-amber-400/20 border border-amber-400/50 text-white'
                              : 'hover:bg-slate-900/90 text-slate-300 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              style={{ backgroundColor: dept.colorHex }}
                              className="w-2 h-2 rounded-full shrink-0"
                            />
                            <span className="text-[11px] font-mono text-slate-500">
                              #{idx + 1}
                            </span>
                            <span className="text-xs font-bold truncate">
                              {agent.name}
                            </span>
                          </div>
                          <span
                            className={`text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                              isHandover
                                ? 'bg-amber-400 text-slate-950 font-bold'
                                : 'bg-slate-900 text-slate-400'
                            }`}
                          >
                            {isHandover ? 'HANDOVER' : agent.shortRole}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ==================== FLOATING TOP-RIGHT PANEL: LIVE HANDOVER STEP & THREAD LOG ==================== */}
              <div className="absolute top-2.5 right-2.5 z-20 w-72 sm:w-96 flex flex-col gap-2 pointer-events-auto">
                {/* Active Simulation Step Banner */}
                <div className="rounded-xl bg-slate-950/90 backdrop-blur-md border border-amber-400/40 p-2.5 sm:p-3 shadow-2xl">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-mono font-extrabold uppercase tracking-wider text-amber-400 flex items-center gap-1.5 truncate">
                      <Sparkles className="w-3.5 h-3.5 animate-spin shrink-0" />
                      <span className="truncate">LUỒNG PHỐI HỢP (HANDOVER)</span>
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold shrink-0">
                      {activeHandover.pipTag}
                    </span>
                  </div>

                  <div className="text-[11px] sm:text-xs font-bold text-white leading-snug mb-2">
                    {activeHandover.title}
                  </div>

                  {/* 6-Step Progress Pills */}
                  <div className="grid grid-cols-6 gap-1">
                    {SIMULATION_STEPS.map((st) => (
                      <button
                        key={st.stepIndex}
                        onClick={() => setSimStepIndex(st.stepIndex)}
                        className={`h-1.5 rounded-full transition-all ${
                          st.stepIndex === activeHandover.stepIndex
                            ? 'bg-amber-400 shadow-[0_0_8px_#fbbf24]'
                            : st.stepIndex < activeHandover.stepIndex
                            ? 'bg-emerald-500/70'
                            : 'bg-slate-800'
                        }`}
                        title={st.title}
                      />
                    ))}
                  </div>
                </div>

                {/* Live Desk Thread Log Drawer */}
                <div className="rounded-xl bg-slate-950/90 backdrop-blur-md border border-slate-800/90 shadow-2xl overflow-hidden">
                  <button
                    onClick={() => setIsLiveFeedOpen((o) => !o)}
                    className="w-full px-3 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs font-bold text-slate-200 hover:text-white"
                  >
                    <span className="flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Nhật ký Điều phối & Tín hiệu MT5</span>
                    </span>
                    {isLiveFeedOpen ? (
                      <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </button>

                  {isLiveFeedOpen && (
                    <div className="p-2.5 max-h-44 sm:max-h-52 overflow-y-auto space-y-2 text-xs">
                      {displayedMessages.slice(-6).map((msg) => (
                        <div
                          key={msg.id}
                          className={`rounded-lg p-2 border ${
                            msg.isCommand
                              ? 'bg-amber-500/10 border-amber-400/40'
                              : 'bg-slate-900/80 border-slate-800/90'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className="font-bold text-amber-300 text-[11px]">
                              {msg.senderName}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {msg.badgeText && (
                                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-950 text-emerald-400 border border-emerald-500/30">
                                  {msg.badgeText}
                                </span>
                              )}
                              <span className="text-[9px] font-mono text-slate-500">
                                {msg.timestamp}
                              </span>
                            </div>
                          </div>
                          <p className="text-[11px] text-slate-300 leading-relaxed">
                            {msg.content}
                          </p>
                        </div>
                      ))}
                      <div ref={chatEndRef} />
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <OrgChart2D
              agents={AGENTS}
              departments={DEPARTMENTS}
              selectedAgentId={selectedAgentId}
              activeHandover={activeHandover}
              isSimulating={isSimulating}
              onSelectAgentAndFocus3D={(agentId) =>
                handleSelectAgentDesk(agentId)
              }
            />
          )}

          {/* ==================== 3. BOTTOM COMMAND CHAT BAR ==================== */}
          <div className="absolute bottom-0 inset-x-0 z-20 bg-slate-950/95 backdrop-blur-md border-t border-slate-800/90 px-3 sm:px-4 py-2">
            {/* Quick Preset Command Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 no-scrollbar">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1 shrink-0 mr-1">
                <Terminal className="w-3 h-3 text-amber-400" /> Lệnh nhanh:
              </span>
              {[
                '@everyone phân tích XAUUSD khung M15 trước tin CPI',
                '@Shield CRO tính lot cho SL 35 pips',
                '@Gold SMC Sniper kiểm tra vùng FVG 2686.50',
                '@MT5 Flash Exec khớp SELL LIMIT 2.5 Lots @ 2686.5',
              ].map((preset, i) => (
                <button
                  key={i}
                  onClick={() => handleDispatchCommand(preset)}
                  className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-slate-900 hover:bg-amber-400/15 text-slate-300 hover:text-amber-300 border border-slate-800 hover:border-amber-400/40 transition-all shrink-0"
                >
                  {preset}
                </button>
              ))}
            </div>

            {/* Command Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleDispatchCommand();
              }}
              className="flex items-center gap-2"
            >
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-amber-400 shrink-0">
                <Shield className="w-3.5 h-3.5" />
                <span>
                  {selectedAgentId
                    ? `@${AGENTS.find((a) => a.id === selectedAgentId)?.name}`
                    : '@everyone'}
                </span>
              </div>

              <input
                id="command-chat-input"
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder='Gõ lệnh điều phối Quỹ (VD: "@everyone phân tích XAUUSD khung M15 trước tin CPI", "@Shield CRO tính lot cho SL 35 pips")...'
                className="flex-1 bg-slate-900/90 border border-slate-800 focus:border-amber-400/60 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors font-mono"
              />

              <button
                id="command-send-btn"
                type="submit"
                className="px-3.5 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-[0_0_20px_rgba(251,191,36,0.35)] transition-all shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Điều Phối Lệnh</span>
              </button>
            </form>
          </div>
        </main>
      </div>

      {/* ==================== 4. KPI & MYFXBOOK MODAL ==================== */}
      <KpiMyfxbookModal
        isOpen={isKpiModalOpen}
        onClose={() => setIsKpiModalOpen(false)}
        departments={DEPARTMENTS}
        orders={orders}
        scannedSetupsCount={scannedSetupsCount}
        executedOrdersCount={executedOrdersCount}
        totalPipsWeek={totalPipsWeek}
        todayPips={todayPips}
        agentCount={agentCount}
        blockedByCroCount={blockedByCroCount}
      />
    </div>
  );
}

export default App;
