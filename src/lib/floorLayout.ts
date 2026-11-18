import {
  AgentConfig,
  AgentDefinition,
  DepartmentId,
  DepartmentInfo,
} from '../types/trading';

/**
 * Tự động xếp bàn giao dịch & kích thước khu vực theo số Agent của từng phòng ban.
 * Thêm/bớt Agent trong AGENTS là sàn 3D tự giãn — không phải gõ tay tọa độ.
 *
 * - Điều hành (giữa) & Hạ tầng (sau): xếp thành HÀNG ngang theo trục X.
 * - Vĩ mô/SMC (trái) & Quant/MT5 (phải): xếp thành CỘT dọc theo trục Z, bàn xoay vào giữa.
 */
const ROW_SPACING = 5.2; // khoảng cách bàn theo hàng ngang
const COL_SPACING = 3.7; // khoảng cách bàn theo cột dọc
const ROW_ZONE_DEPTH_FRONT = 6.8;
const ROW_ZONE_DEPTH_BACK = 6.2;
const COL_ZONE_WIDTH = 9.2;
const ZONE_GAP = 1.4;

export interface FloorLayout {
  agents: AgentConfig[];
  departments: DepartmentInfo[];
}

function spread(count: number, spacing: number): number[] {
  return Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * spacing);
}

export function buildFloorLayout(
  agents: AgentDefinition[],
  departments: DepartmentInfo[]
): FloorLayout {
  const byDept = (id: DepartmentId) => agents.filter((a) => a.departmentId === id);

  const exec = byDept('executive');
  const macro = byDept('macro_smc');
  const quant = byDept('quant_mt5');
  const bridge = byDept('bridge_audit');

  // Kích thước khu vực hàng ngang
  const execW = Math.max(10.6, exec.length * ROW_SPACING + 0.4);
  const bridgeW = Math.max(10.6, bridge.length * ROW_SPACING + 0.4);
  // Kích thước khu vực cột dọc
  const macroD = Math.max(11.8, macro.length * COL_SPACING + 0.7);
  const quantD = Math.max(11.8, quant.length * COL_SPACING + 0.7);

  const execZ = 2.2;
  const bridgeZ = execZ - ROW_ZONE_DEPTH_FRONT / 2 - 2.6 - ROW_ZONE_DEPTH_BACK / 2; // ~ -6.8
  const sideX = Math.max(execW, bridgeW) / 2 + ZONE_GAP + COL_ZONE_WIDTH / 2; // ~ 11.5
  const sideZ = 0.5;

  const zone: Record<
    DepartmentId,
    { center: [number, number, number]; size: [number, number] }
  > = {
    executive: { center: [0, 0, execZ], size: [execW, ROW_ZONE_DEPTH_FRONT] },
    bridge_audit: { center: [0, 0, bridgeZ], size: [bridgeW, ROW_ZONE_DEPTH_BACK] },
    macro_smc: { center: [-sideX, 0, sideZ], size: [COL_ZONE_WIDTH, macroD] },
    quant_mt5: { center: [sideX, 0, sideZ], size: [COL_ZONE_WIDTH, quantD] },
  };

  const placed = new Map<string, Pick<AgentConfig, 'deskPosition' | 'deskRotationY'>>();

  spread(exec.length, ROW_SPACING).forEach((x, i) =>
    placed.set(exec[i].id, { deskPosition: [x, 0, execZ], deskRotationY: 0 })
  );
  spread(bridge.length, ROW_SPACING).forEach((x, i) =>
    placed.set(bridge[i].id, { deskPosition: [x, 0, bridgeZ], deskRotationY: 0 })
  );
  spread(macro.length, COL_SPACING).forEach((z, i) =>
    placed.set(macro[i].id, {
      deskPosition: [-sideX, 0, sideZ + z],
      deskRotationY: Math.PI / 6,
    })
  );
  spread(quant.length, COL_SPACING).forEach((z, i) =>
    placed.set(quant[i].id, {
      deskPosition: [sideX, 0, sideZ + z],
      deskRotationY: -Math.PI / 6,
    })
  );

  return {
    agents: agents.map((a) => {
      const p = placed.get(a.id);
      return {
        ...a,
        deskPosition: p?.deskPosition ?? a.deskPosition ?? [0, 0, 0],
        deskRotationY: p?.deskRotationY ?? a.deskRotationY ?? 0,
      };
    }),
    departments: departments.map((d) => ({
      ...d,
      centerPosition: zone[d.id].center,
      zoneSize: zone[d.id].size,
    })),
  };
}
