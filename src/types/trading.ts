export type DepartmentId = 'executive' | 'macro_smc' | 'quant_mt5' | 'bridge_audit';

export type AgentStatus = 'analyzing' | 'handover' | 'executing';

export interface DepartmentInfo {
  id: DepartmentId;
  name: string;
  shortName: string;
  englishName: string;
  zoneLabel3D: string;
  colorHex: string;
  accentClass: string;
  borderClass: string;
  bgClass: string;
  badgeClass: string;
  centerPosition: [number, number, number];
  zoneSize: [number, number];
  performanceScore: number;
  kpiMetricLabel: string;
  kpiMetricValue: string;
}

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  shortRole: string;
  departmentId: DepartmentId;
  avatarColor: string;
  suitColor: string;
  hairColor: string;
  /** Tính tự động bởi buildFloorLayout() theo phòng ban. */
  deskPosition: [number, number, number];
  deskRotationY: number; // Radians
  mt5ScreenTitle: string;
  mt5ScreenText: string;
  mt5SubMetrics: {
    label: string;
    value: string;
    trend?: 'up' | 'down' | 'neutral';
  }[];
  defaultTask: string;
  defaultProgress: number;
  specialtyTags: string[];
}

/** Khai báo Agent (không cần tọa độ bàn — sàn 3D tự xếp chỗ). */
export type AgentDefinition = Omit<AgentConfig, 'deskPosition' | 'deskRotationY'> &
  Partial<Pick<AgentConfig, 'deskPosition' | 'deskRotationY'>>;

export interface HandoverStep {
  stepIndex: number;
  title: string;
  fromAgentId: string;
  toAgentId: string;
  fromTaskLabel: string;
  toTaskLabel: string;
  chatBubbleFrom: string;
  chatBubbleTo: string;
  logMessage: string;
  pipTag: string;
  lotTag: string;
}

export interface ChatMessage {
  id: string;
  timestamp: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  departmentId?: DepartmentId | 'user' | 'system';
  channelId: string; // 'all' or agent.id or department.id
  content: string;
  badgeText?: string;
  isCommand?: boolean;
}

export interface MT5OrderRecord {
  ticket: string;
  time: string;
  symbol: string;
  type: 'SELL LIMIT' | 'BUY LIMIT' | 'SELL EXEC' | 'BUY EXEC' | 'BLOCKED';
  lots: number;
  entry: number;
  sl: number;
  tp: number;
  pips: string;
  pnl: string;
  status: 'Active' | 'TP Hit' | 'BE Locked' | 'CRO Blocked';
  agentBy: string;
}
