/**
 * Quy chuẩn tính toán rủi ro XAUUSD trên MT5 (dùng chung cho mọi Agent).
 *
 * - 1 Lot chuẩn XAUUSD = 100 oz.
 * - 1 pip XAUUSD = 0.10 USD biến động giá (VD: 2686.5 -> 2690.0 = 35 pips).
 * - Giá trị 1 pip cho 1 Lot = 100 oz * 0.10 = 10 USD.
 *
 * Lưu ý: một số broker định nghĩa pip vàng khác (0.01 hoặc 1.00). Khi nối MT5 thật,
 * phải đọc SYMBOL_TRADE_CONTRACT_SIZE / SYMBOL_POINT / SYMBOL_VOLUME_STEP từ broker.
 */
export const XAUUSD_CONTRACT_SIZE = 100;
export const XAUUSD_PIP_SIZE = 0.1;
export const PIP_VALUE_PER_LOT = XAUUSD_CONTRACT_SIZE * XAUUSD_PIP_SIZE; // 10 USD
export const LOT_STEP = 0.01;
export const MIN_LOT = 0.01;

/** Tài khoản Prop mô phỏng: 0.5% rủi ro với SL 35 pips => đúng 2.50 Lots. */
export const ACCOUNT_BALANCE = 175_000;
export const DEFAULT_RISK_PCT = 0.5;
export const MAX_DAILY_DD_PCT = 5;
export const CURRENT_DAILY_DD_PCT = 1.4;
export const MAX_SPREAD_PIPS = 1.8;

export interface LotCalcResult {
  riskUsd: number;
  lots: number;
  actualRiskUsd: number;
  actualRiskPct: number;
}

/** Lot = (Vốn × %Risk) / (SL pips × Giá trị 1 pip/Lot), làm tròn XUỐNG theo bước lot. */
export function calcLotSize(
  balance: number,
  riskPct: number,
  slPips: number,
  pipValuePerLot: number = PIP_VALUE_PER_LOT
): LotCalcResult {
  const riskUsd = (balance * riskPct) / 100;
  if (slPips <= 0) {
    return { riskUsd, lots: 0, actualRiskUsd: 0, actualRiskPct: 0 };
  }
  const raw = riskUsd / (slPips * pipValuePerLot);
  const steps = Math.floor(raw / LOT_STEP + 1e-9);
  const lots = Math.max(0, Number((steps * LOT_STEP).toFixed(2)));
  const actualRiskUsd = lots * slPips * pipValuePerLot;
  return {
    riskUsd,
    lots: lots < MIN_LOT ? 0 : lots,
    actualRiskUsd,
    actualRiskPct: (actualRiskUsd / balance) * 100,
  };
}

/** Số pips giữa 2 mức giá XAUUSD. */
export function pipsBetween(a: number, b: number): number {
  return Math.round((Math.abs(a - b) / XAUUSD_PIP_SIZE) * 10) / 10;
}

/** Lãi/lỗ USD cho số pips và khối lượng. */
export function pnlUsd(pips: number, lots: number): number {
  return pips * lots * PIP_VALUE_PER_LOT;
}

export function fmtUsd(n: number, decimals = 0): string {
  return (
    (n < 0 ? '-$' : '$') +
    Math.abs(n).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}

/** Setup mẫu đang chạy trong vòng lặp mô phỏng — mọi con số hiển thị đều suy ra từ đây. */
const ENTRY = 2686.5;
const SL = 2690.0;
const TP = 2672.0;
const SL_PIPS = pipsBetween(ENTRY, SL); // 35
const TP_PIPS = pipsBetween(ENTRY, TP); // 145
const LOT = calcLotSize(ACCOUNT_BALANCE, DEFAULT_RISK_PCT, SL_PIPS);

export const SAMPLE_SETUP = {
  entry: ENTRY,
  sl: SL,
  tp: TP,
  slPips: SL_PIPS,
  tpPips: TP_PIPS,
  lots: LOT.lots,
  riskUsd: LOT.actualRiskUsd,
  profitUsd: pnlUsd(TP_PIPS, LOT.lots),
  rr: Math.round((TP_PIPS / SL_PIPS) * 100) / 100,
};
