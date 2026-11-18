import React from 'react';
import {
  ArrowDown,
  ArrowRight,
  Cpu,
  Crown,
  Eye,
  GitBranch,
  Layers,
  ShieldCheck,
  Sparkles,
  Terminal,
} from 'lucide-react';
import {
  AgentDefinition,
  DepartmentInfo,
  HandoverStep,
} from '../types/trading';

interface OrgChart2DProps {
  agents: AgentDefinition[];
  departments: DepartmentInfo[];
  selectedAgentId: string | null;
  activeHandover: HandoverStep;
  isSimulating: boolean;
  onSelectAgentAndFocus3D: (agentId: string) => void;
}

export const OrgChart2D: React.FC<OrgChart2DProps> = ({
  agents,
  departments,
  selectedAgentId,
  activeHandover,
  isSimulating,
  onSelectAgentAndFocus3D,
}) => {
  const execAgents = agents.filter((a) => a.departmentId === 'executive');
  const subDepartments = departments.filter((d) => d.id !== 'executive');

  const renderAgentCard = (agent: AgentDefinition, dept: DepartmentInfo) => {
    const isFrom = isSimulating && activeHandover.fromAgentId === agent.id;
    const isTo = isSimulating && activeHandover.toAgentId === agent.id;
    const isActive = isFrom || isTo;
    const isSelected = selectedAgentId === agent.id;

    return (
      <div
        key={agent.id}
        onClick={() => onSelectAgentAndFocus3D(agent.id)}
        style={{
          borderColor: isActive
            ? '#fbbf24'
            : isSelected
            ? '#34d399'
            : `${dept.colorHex}55`,
          boxShadow: isActive
            ? '0 0 28px rgba(251, 191, 36, 0.35)'
            : undefined,
        }}
        className={`relative rounded-xl bg-slate-900/90 border-2 p-4 cursor-pointer transition-all hover:-translate-y-0.5 hover:bg-slate-900 ${
          isActive ? 'ring-2 ring-amber-400/50' : ''
        }`}
      >
        {/* Active Handover Role Tag */}
        {isActive && (
          <div className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-mono font-extrabold text-[10px] flex items-center gap-1 shadow">
            <Sparkles className="w-3 h-3" />
            {isFrom ? 'ĐANG BÀN GIAO' : 'ĐANG TIẾP NHẬN'}
          </div>
        )}

        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2.5">
            <div
              style={{
                backgroundColor: `${dept.colorHex}22`,
                borderColor: dept.colorHex,
                color: dept.colorHex,
              }}
              className="w-9 h-9 rounded-lg border flex items-center justify-center font-mono font-extrabold text-sm shrink-0"
            >
              {agent.name
                .split(' ')
                .map((w) => w[0])
                .join('')
                .slice(0, 2)}
            </div>
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-1.5">
                {agent.name}
              </div>
              <div className="text-[11px] text-slate-400 leading-tight">
                {agent.role}
              </div>
            </div>
          </div>
        </div>

        {/* Direct MT5 Terminal Snapshot inside Org Card */}
        <div className="rounded-lg bg-slate-950/90 border border-slate-800 px-2.5 py-2 mb-2.5 font-mono">
          <div className="text-[9px] text-amber-400/90 uppercase tracking-wider mb-0.5 flex items-center gap-1">
            <Terminal className="w-3 h-3" /> {agent.mt5ScreenTitle}
          </div>
          <div className="text-[11px] text-slate-100 font-semibold">
            {agent.mt5ScreenText}
          </div>
        </div>

        {/* Active Handover Bubble or Specialty Tags */}
        {isActive ? (
          <div className="rounded-lg bg-amber-400/15 border border-amber-400/40 px-2.5 py-1.5 text-xs text-amber-200 font-medium mb-2">
            “{isFrom ? activeHandover.chatBubbleFrom : activeHandover.chatBubbleTo}”
          </div>
        ) : (
          <div className="flex flex-wrap gap-1 mb-2">
            {agent.specialtyTags.map((tag, idx) => (
              <span
                key={idx}
                className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800/90 text-slate-300 border border-slate-700/70"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer Progress & Jump to 3D Desk button */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-mono">
              Tiến độ: <strong className="text-white">{agent.defaultProgress}%</strong>
            </span>
          </div>
          <span className="text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1">
            <Eye className="w-3.5 h-3.5" /> Bay tới bàn 3D
          </span>
        </div>
      </div>
    );
  };

  const execDept = departments.find((d) => d.id === 'executive')!;

  return (
    <div className="w-full h-full overflow-y-auto bg-slate-950 p-6 pb-28 select-none">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Banner: Live Execution Flow Pipeline */}
        <div className="rounded-2xl bg-slate-900/90 border border-amber-400/30 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400/15 border border-amber-400/40 flex items-center justify-center text-amber-400 shrink-0">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-mono uppercase tracking-wider text-amber-400 font-bold">
                SƠ ĐỒ TỔ CHỨC & LUỒNG DUYỆT LỆNH QUỸ ĐA TÁC NHÂN (2D PROP DESK FLOW)
              </div>
              <div className="text-sm font-bold text-white mt-0.5">
                {activeHandover.title}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <span className="px-2.5 py-1 rounded-lg bg-indigo-500/15 text-indigo-300 border border-indigo-400/30">
              1. Săn Thanh khoản & SMC
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-400/30">
              2. Kiểm thử 99.9% Tick
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
            <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-400/30">
              3. CRO & CIO Duyệt Lot
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
            <span className="px-2.5 py-1 rounded-lg bg-sky-500/15 text-sky-300 border border-sky-400/30">
              4. Khớp MT5 & Myfxbook
            </span>
          </div>
        </div>

        {/* TIER 1: EXECUTIVE & PROP RISK (Alpha CIO & Shield CRO) */}
        <div className="rounded-2xl bg-slate-900/50 border-2 border-amber-400/40 p-5 relative">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <Crown className="w-5 h-5 text-amber-400" />
              <div>
                <h2 className="text-sm font-mono font-extrabold uppercase tracking-wider text-amber-400">
                  CẤP ĐIỀU HÀNH & QUẢN TRỊ RỦI RO TỐI CAO ({execDept.englishName})
                </h2>
                <p className="text-xs text-slate-400">
                  Phê duyệt chiến lược dòng tiền XAUUSD, kiểm soát Lot Size, Max Daily Drawdown (&lt; 5%) & Bộ lọc Tin Đỏ
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-400/15 text-amber-300 border border-amber-400/30">
              Hiệu suất: {execDept.performanceScore}%
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {execAgents.map((agent) => renderAgentCard(agent, execDept))}
          </div>
        </div>

        {/* Downward Connector Arrows */}
        <div className="grid grid-cols-3 place-items-center text-amber-400/70 -my-2">
          <div className="flex flex-col items-center">
            <div className="h-4 w-0.5 bg-gradient-to-b from-amber-400 to-indigo-400" />
            <ArrowDown className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="flex flex-col items-center">
            <div className="h-4 w-0.5 bg-gradient-to-b from-amber-400 to-emerald-400" />
            <ArrowDown className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex flex-col items-center">
            <div className="h-4 w-0.5 bg-gradient-to-b from-amber-400 to-sky-400" />
            <ArrowDown className="w-4 h-4 text-sky-400" />
          </div>
        </div>

        {/* TIER 2: 3 SPECIALIZED OPERATIONAL DESKS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {subDepartments.map((dept) => {
            const deptAgents = agents.filter((a) => a.departmentId === dept.id);
            return (
              <div
                key={dept.id}
                style={{ borderColor: `${dept.colorHex}55` }}
                className="rounded-2xl bg-slate-900/50 border-2 p-4 flex flex-col gap-3.5"
              >
                <div className="border-b border-slate-800 pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {dept.id === 'macro_smc' && (
                        <Layers
                          style={{ color: dept.colorHex }}
                          className="w-4 h-4 shrink-0"
                        />
                      )}
                      {dept.id === 'quant_mt5' && (
                        <Cpu
                          style={{ color: dept.colorHex }}
                          className="w-4 h-4 shrink-0"
                        />
                      )}
                      {dept.id === 'bridge_audit' && (
                        <ShieldCheck
                          style={{ color: dept.colorHex }}
                          className="w-4 h-4 shrink-0"
                        />
                      )}
                      <h3
                        style={{ color: dept.colorHex }}
                        className="text-xs font-mono font-extrabold uppercase tracking-wider"
                      >
                        {dept.zoneLabel3D}
                      </h3>
                    </div>
                    <span
                      style={{ color: dept.colorHex }}
                      className="text-xs font-mono font-bold"
                    >
                      {dept.performanceScore}%
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {dept.name} ({deptAgents.length} Agents)
                  </div>
                </div>

                <div className="space-y-3">
                  {deptAgents.map((ag) => renderAgentCard(ag, dept))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
