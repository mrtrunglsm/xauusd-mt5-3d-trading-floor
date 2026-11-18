import { AgentDefinition } from '../types/trading';

/**
 * Bộ định tuyến lệnh chat -> Agent (bản offline, trước khi nối AI thật).
 *
 * Thứ tự ưu tiên:
 *  1. @everyone            -> cả sàn (Alpha CIO đại diện trả lời)
 *  2. @Tên Agent           -> đúng Agent được nhắc tên (khớp tên dài nhất trước)
 *  3. Từ khóa nguyên từ    -> Agent có nhiều từ khóa khớp nhất (không còn khớp chữ con
 *                             kiểu "ea" nằm trong "release")
 *  4. Agent đang chọn      -> nếu không khớp gì
 *  5. Alpha CIO            -> mặc định
 */
const AGENT_KEYWORDS: Record<string, string[]> = {
  'alpha-cio': ['cio', 'alpha', 'duyệt', 'chiến lược', 'bias'],
  'shield-cro': ['shield', 'cro', 'lot', 'lots', 'risk', 'rủi ro', 'drawdown', 'dd', 'sl', 'spread'],
  'fed-dxy-watcher': ['dxy', 'fed', 'cpi', 'nfp', 'fomc', 'us10y', 'tin tức', 'tin đỏ', 'vĩ mô'],
  'gold-smc-sniper': ['smc', 'sniper', 'fvg', 'ob', 'order block', 'choch', 'bos', 'cấu trúc'],
  'liquidity-hunter': ['liquidity', 'thanh khoản', 'sweep', 'quét', 'stop hunt', 'bsl', 'ssl', 'inducement', 'killzone'],
  'ea-architect': ['ea', 'mql5', 'expert advisor', 'break even', 'trailing', 'thuật toán'],
  'tick-backtester': ['tick', 'backtest', 'kiểm thử', 'monte carlo', 'profit factor'],
  'mt5-flash-exec': ['mt5', 'flash', 'exec', 'khớp', 'khớp lệnh', 'vào lệnh', 'sell limit', 'buy limit'],
  'bridge-ops': ['bridge', 'vps', 'latency', 'ping', 'kết nối', 'terminal'],
  'pip-auditor': ['pip', 'pips', 'myfxbook', 'kiểm toán', 'pnl', 'winrate', 'nhật ký'],
};

export type RouteResult =
  | { kind: 'everyone' }
  | {
      kind: 'agent';
      agent: AgentDefinition;
      via: 'mention' | 'keyword' | 'selected' | 'default';
    };

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFC');
}

/** Tách nguyên từ (hỗ trợ tiếng Việt có dấu) rồi ghép lại có khoảng trắng hai đầu. */
function toWordString(text: string): string {
  const tokens = normalize(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return ` ${tokens.join(' ')} `;
}

export function routeCommand(
  text: string,
  agents: AgentDefinition[],
  selectedAgentId: string | null
): RouteResult {
  const lower = normalize(text);
  const compact = lower.replace(/\s+/g, '');

  if (/@everyone\b|@all\b|@cả sàn/u.test(lower)) {
    return { kind: 'everyone' };
  }

  // @mention: ưu tiên tên dài nhất để "@MT5 Flash Exec" không bị nhầm sang Agent tên ngắn hơn
  const byNameLen = [...agents].sort((a, b) => b.name.length - a.name.length);
  for (const ag of byNameLen) {
    const name = normalize(ag.name);
    if (lower.includes(`@${name}`) || compact.includes(`@${name.replace(/\s+/g, '')}`)) {
      return { kind: 'agent', agent: ag, via: 'mention' };
    }
  }

  // Từ khóa nguyên từ — Agent nhiều điểm nhất thắng
  const words = toWordString(text);
  let best: AgentDefinition | null = null;
  let bestScore = 0;
  for (const ag of agents) {
    const kws = AGENT_KEYWORDS[ag.id] ?? ag.specialtyTags ?? [];
    const score = kws.reduce(
      (sum, kw) => (words.includes(toWordString(kw)) ? sum + 1 : sum),
      0
    );
    if (score > bestScore) {
      best = ag;
      bestScore = score;
    }
  }
  if (best) return { kind: 'agent', agent: best, via: 'keyword' };

  if (selectedAgentId) {
    const sel = agents.find((a) => a.id === selectedAgentId);
    if (sel) return { kind: 'agent', agent: sel, via: 'selected' };
  }
  return { kind: 'agent', agent: agents[0], via: 'default' };
}

/** Đọc "SL 35 pips", "sl: 42p", "SL=28" từ câu lệnh. */
export function parseSlPips(text: string): number | null {
  const m = text.match(/\bsl\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(?:pips?|p)?\b/i);
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Đọc "risk 0.25%", "rủi ro 1%", hoặc "0.5%" từ câu lệnh. */
export function parseRiskPct(text: string): number | null {
  const m =
    text.match(/(?:risk|rủi ro)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*%/iu) ??
    text.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  return Number.isFinite(v) && v > 0 && v <= 10 ? v : null;
}
