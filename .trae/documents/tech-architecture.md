## 1. 架构设计

```mermaid
graph TB
    subgraph "前端层"
        "React 组件" --> "Zustand Store"
        "Zustand Store" --> "localStorage 持久化"
    end
    subgraph "3D 渲染层"
        "R3F Canvas" --> "货架场景"
        "货架场景" --> "货位方块"
        "货架场景" --> "热力着色器"
    end
    subgraph "数据处理层"
        "数据导入模块" --> "校验引擎"
        "校验引擎" --> "异常检测"
        "校验引擎" --> "有效货位集"
    end
    "Zustand Store" --> "R3F Canvas"
    "数据导入模块" --> "Zustand Store"
    "异常检测" --> "Zustand Store"
```

## 2. 技术说明

- **前端**：React@18 + TypeScript + Tailwind CSS@3 + Vite
- **3D 渲染**：Three.js via @react-three/fiber + @react-three/drei + @react-three/postprocessing
- **状态管理**：Zustand（含 zustand/middleware persist 中间件）
- **持久化**：localStorage（筛选条件、相机书签、阈值配置、异常清单）
- **后端**：无（纯前端应用，数据通过文件导入）
- **图标**：lucide-react

## 3. 路由定义

| 路由 | 用途 |
|------|------|
| / | 主页面：3D 热力场景 + 筛选面板 + 异常面板 |

## 4. 数据模型

### 4.1 类型定义

```typescript
interface Location {
  id: string;
  zone: string;
  row: number;
  col: number;
  layer: number;
  x: number;
  y: number;
  z: number;
}

interface PickRecord {
  locationId: string;
  timestamp: string;
  quantity: number;
}

interface Anomaly {
  type: 'unknown_location' | 'coordinate_conflict';
  row?: number;
  locationIds: string[];
  message: string;
}

interface CameraBookmark {
  id: string;
  name: string;
  position: [number, number, number];
  target: [number, number, number];
}

interface ThresholdConfig {
  low: number;
  medium: number;
  high: number;
}

interface FilterState {
  dateRange: { start: string; end: string } | null;
  zones: string[];
}
```

### 4.2 Zustand Store 结构

```typescript
interface WarehouseStore {
  locations: Location[];
  pickRecords: PickRecord[];
  anomalies: Anomaly[];
  filter: FilterState;
  thresholds: ThresholdConfig;
  cameraBookmarks: CameraBookmark[];
  activeBookmark: string | null;
  hoveredLocation: string | null;

  setLocations: (locs: Location[]) => void;
  setPickRecords: (records: PickRecord[]) => void;
  setFilter: (filter: Partial<FilterState>) => void;
  setThresholds: (t: Partial<ThresholdConfig>) => void;
  addBookmark: (bm: CameraBookmark) => void;
  removeBookmark: (id: string) => void;
  setActiveBookmark: (id: string | null) => void;
  setHoveredLocation: (id: string | null) => void;
  loadSampleData: () => void;
  exportAnomalies: () => void;
}
```

## 5. 组件架构

```
Home.tsx
├── Sidebar.tsx              // 左侧面板容器
│   ├── DataImporter.tsx     // 数据导入（文件上传+样例数据）
│   ├── FilterPanel.tsx      // 日期范围+区域筛选
│   ├── ThresholdPanel.tsx   // 颜色阈值滑块
│   ├── BookmarkPanel.tsx    // 相机书签管理
│   └── AnomalyPanel.tsx     // 异常列表+导出
├── Scene3D.tsx              // R3F Canvas 容器
│   ├── WarehouseScene.tsx   // 货架场景（灯光、地面、控制器）
│   ├── ShelfGroup.tsx       // 单排货架组
│   ├── LocationBox.tsx      // 单个货位方块（热力着色+交互）
│   └── LocationTooltip.tsx  // 悬浮信息卡片（HTML overlay）
└── Toolbar.tsx              // 顶部工具栏
```

## 6. 数据校验逻辑

1. **坐标冲突检测**：按 (row, col, layer) 分组，同组多个 locationId 则标记为 coordinate_conflict，行级报错，有效货位仍渲染
2. **未知货位检测**：遍历 pickRecords，locationId 不存在于 locations 中则标记为 unknown_location
3. **校验结果**：写入 anomalies 数组，持久化到 localStorage

## 7. 热力着色算法

1. 按筛选条件过滤 pickRecords
2. 聚合每个 locationId 的拣货次数（sum of quantity）
3. 归一化到 [0, 1] 区间（max count → 1）
4. 按阈值分档：
   - count ≤ low → 蓝色 (#3b82f6)
   - low < count ≤ medium → 绿色 (#22c55e)
   - medium < count ≤ high → 黄色 (#eab308)
   - count > high → 红色 (#ef4444)
5. 无拣货记录的货位 → 灰色半透明

## 8. 持久化策略

使用 Zustand persist 中间件，将以下数据序列化到 localStorage：

- `filter`：筛选条件（日期范围、区域选择）
- `thresholds`：阈值配置
- `cameraBookmarks`：相机书签列表
- `anomalies`：异常清单
- `locations` + `pickRecords`：导入的数据

重启后自动从 localStorage 恢复全部状态。
