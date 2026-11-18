import React from 'react';
import {
  Activity,
  Award,
  BarChart3,
  CheckCircle2,
  Cpu,
  ExternalLink,
  Flame,
  ShieldAlert,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { DepartmentInfo, MT5OrderRecord } from '../types/trading';
import { ACCOUNT_BALANCE, SAMPLE_SETUP, fmtUsd, pnlUsd } from '../lib/risk';

interface KpiMyfxbookModalProps {
  isOpen: boolean;
  onClose: () => void;
  departments: DepartmentInfo[];
  orders: MT5OrderRecord[];
  scannedSetupsCount: number;
  executedOrdersCount: number;
  totalPipsWeek: number;
  todayPips: number;
  agentCount: number;
  blockedByCroCount: number;
}

export const KpiMyfxbookModal: React.FC<KpiMyfxbookModalProps> = ({
  isOpen,
  onClose,
  departments,
  orders,
  scannedSetupsCount,
  executedOrdersCount,
  totalPipsWeek,
  todayPips,
  agentCount,
  blockedByCroCount,
}) => {
  if (!isOpen) return null;

  const todayProfitUsd = pnlUsd(todayPips, SAMPLE_SETUP.lots);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
      <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl bg-slate-900/95 border border-amber-400/30 shadow-[0_0_60px_rgba(2,6,23,0.95)] text-slate-100 flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70 sticky top-0 z-10 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400/15 border border-amber-400/40 flex items-center justify-center text-amber-400">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">
                  BẢNG ĐIỀU KHIỂN KPI QUỸ & KIỂM TOÁN MYFXBOOK
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> VERIFIED REAL-TIME
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Tài khoản Quỹ Prop Desk: <span className="text-amber-400 font-mono font-semibold">MT5 #889001-PRO ({fmtUsd(ACCOUNT_BALANCE)} AUM)</span> • Máy chủ: Equinix NY4 (0.8ms)
              </p>
            </div>
          </div>

          <button
            id="close-kpi-modal-btn"
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Section 1: Nhịp độ Sàn Giao Dịch (Trading Floor Tempo) */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-mono uppercase tracking-wider text-amber-400 flex items-center gap-2 font-bold">
                <Cpu className="w-4 h-4" /> 1. Nhịp Độ Sàn Giao Dịch Đa Tác Nhân (Real-Time Prop Desk Tempo)
              </h3>
              <span className="text-[11px] font-mono text-slate-400">
                Phiên hiện tại: <strong className="text-emerald-400">New York Killzone</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl bg-slate-950/90 border border-amber-400/25 p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400 mb-1">Công suất hoạt động Sàn ({agentCount} Agents)</div>
                  <div className="text-2xl font-mono font-extrabold text-amber-400">96.8%</div>
                  <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                    <Zap className="w-3 h-3" /> {agentCount}/{agentCount} Tác nhân đồng bộ Zero-Latency
                  </div>
                </div>
                <div className="w-12 h-12 rounded-xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400 font-mono font-bold text-sm">
                  {agentCount}/{agentCount}
                </div>
              </div>

              <div className="rounded-xl bg-slate-950/90 border border-indigo-400/25 p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400 mb-1">Số Setup XAUUSD Đã Quét (M15/H1)</div>
                  <div className="text-2xl font-mono font-extrabold text-indigo-400">
                    {scannedSetupsCount} Setups
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Lọc qua OB + FVG + Quét thanh khoản BSL/SSL
                  </div>
                </div>
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-400/30 flex items-center justify-center text-indigo-400">
                  <Activity className="w-6 h-6" />
                </div>
              </div>

              <div className="rounded-xl bg-slate-950/90 border border-emerald-400/25 p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400 mb-1">Số Lệnh MT5 Đã Khớp Thực Tế</div>
                  <div className="text-2xl font-mono font-extrabold text-emerald-400">
                    {executedOrdersCount} Lệnh
                  </div>
                  <div className="text-[11px] text-emerald-400 mt-1">
                    Tốc độ khớp trung bình: 0.82ms (Slippage &lt; 0.1p)
                  </div>
                </div>
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
                  <TrendingUp className="w-6 h-6" />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Thống kê Hiệu suất Chuẩn Quỹ Prop Trading & Myfxbook */}
          <div>
            <h3 className="text-xs font-mono uppercase tracking-wider text-emerald-400 flex items-center gap-2 font-bold mb-3">
              <Award className="w-4 h-4" /> 2. Thống Kê Hiệu Suất Myfxbook & Quản Trị Rủi Ro (Prop Risk Metrics)
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3.5">
                <div className="text-[11px] text-slate-400">Tổng Pips Tuần Này</div>
                <div className="text-xl font-mono font-extrabold text-emerald-400 mt-1">
                  +{totalPipsWeek} Pips
                </div>
                <div className="text-[11px] font-mono text-amber-300 mt-0.5">
                  Hôm nay: +{todayPips}p (+{fmtUsd(todayProfitUsd)})
                </div>
              </div>

              <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3.5">
                <div className="text-[11px] text-slate-400">Tỷ Lệ Thắng (Winrate)</div>
                <div className="text-xl font-mono font-extrabold text-amber-400 mt-1">
                  76.4%
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Trung bình R:R đạt 1 : 3.45
                </div>
              </div>

              <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3.5">
                <div className="text-[11px] text-slate-400">Profit Factor (99.9% Tick)</div>
                <div className="text-xl font-mono font-extrabold text-sky-400 mt-1">
                  2.84
                </div>
                <div className="text-[11px] text-emerald-400 mt-0.5">
                  Sharpe Ratio: 3.12
                </div>
              </div>

              <div className="rounded-xl bg-slate-950/80 border border-emerald-500/30 p-3.5">
                <div className="text-[11px] text-slate-400">Max Drawdown Kiểm Soát</div>
                <div className="text-xl font-mono font-extrabold text-emerald-400 mt-1">
                  1.40% <span className="text-xs text-slate-400">/ 5.0%</span>
                </div>
                <div className="text-[11px] text-emerald-300 mt-0.5">
                  An toàn chuẩn Quỹ Prop (&lt; 5%)
                </div>
              </div>

              <div className="rounded-xl bg-slate-950/80 border border-rose-500/30 p-3.5">
                <div className="text-[11px] text-slate-400 flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> Lệnh CRO Chặn
                </div>
                <div className="text-xl font-mono font-extrabold text-rose-400 mt-1">
                  {blockedByCroCount} Lệnh
                </div>
                <div className="text-[11px] text-rose-300 mt-0.5">
                  Chặn do Tin Đỏ CPI / Giãn Spread
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Hiệu suất theo từng Phòng ban kèm thanh Progress Bar */}
          <div>
            <h3 className="text-xs font-mono uppercase tracking-wider text-indigo-400 flex items-center gap-2 font-bold mb-3">
              <Flame className="w-4 h-4" /> 3. Hiệu Suất Theo Từng Phòng Ban (Department KPI Breakdown)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {departments.map((dept) => (
                <div
                  key={dept.id}
                  className="rounded-xl bg-slate-950/85 border border-slate-800/90 p-4 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        style={{ backgroundColor: dept.colorHex }}
                        className="w-3 h-3 rounded-full"
                      />
                      <div>
                        <div className="text-sm font-bold text-white">
                          {dept.name}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {dept.englishName}
                        </div>
                      </div>
                    </div>
                    <span
                      style={{ color: dept.colorHex }}
                      className="text-base font-mono font-extrabold"
                    >
                      {dept.performanceScore}%
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      style={{
                        width: `${dept.performanceScore}%`,
                        backgroundColor: dept.colorHex,
                      }}
                      className="h-full rounded-full transition-all duration-500"
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/70">
                    <span className="text-slate-400">{dept.kpiMetricLabel}</span>
                    <span className="font-mono font-semibold text-slate-200">
                      {dept.kpiMetricValue}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: Nhật ký Lệnh MT5 & Kiểm toán Pip gần nhất */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-mono uppercase tracking-wider text-sky-400 flex items-center gap-2 font-bold">
                <ExternalLink className="w-4 h-4" /> 4. Nhật Ký Khớp Lệnh MT5 & Đối Soát Pip Auditor
              </h3>
              <span className="text-[11px] font-mono text-emerald-400">
                Đồng bộ Myfxbook Auto-Audit: Mỗi 1 giây
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/90">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/70">
                    <th className="py-2.5 px-3">Ticket</th>
                    <th className="py-2.5 px-3">Giờ MT5</th>
                    <th className="py-2.5 px-3">Cặp / Loại Lệnh</th>
                    <th className="py-2.5 px-3">Khối Lượng</th>
                    <th className="py-2.5 px-3">Entry / SL / TP</th>
                    <th className="py-2.5 px-3">Tác Nhân Thực Thi</th>
                    <th className="py-2.5 px-3">Pips / PnL</th>
                    <th className="py-2.5 px-3 text-right">Trạng Thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {orders.map((ord) => (
                    <tr key={ord.ticket} className="hover:bg-slate-900/50">
                      <td className="py-2.5 px-3 font-bold text-amber-400">
                        {ord.ticket}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">{ord.time}</td>
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-white mr-1.5">
                          {ord.symbol}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            ord.type.includes('SELL')
                              ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                              : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          }`}
                        >
                          {ord.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-200">
                        {ord.lots.toFixed(2)} Lots
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        {ord.entry.toFixed(1)} /{' '}
                        <span className="text-rose-400">{ord.sl.toFixed(1)}</span> /{' '}
                        <span className="text-emerald-400">{ord.tp.toFixed(1)}</span>
                      </td>
                      <td className="py-2.5 px-3 text-indigo-300">
                        {ord.agentBy}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-emerald-400">
                        {ord.pips} ({ord.pnl})
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            ord.status === 'Active'
                              ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                              : ord.status === 'CRO Blocked'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          }`}
                        >
                          {ord.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
