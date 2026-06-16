# 仓储 3D 热力图 - 验收回放台 & 快照归档中心

基于 React + TypeScript + Three.js + Zustand 的仓储货位拣货热度 3D 可视化系统，内置 **验收回放台** 与 **快照归档中心** 两大模块，支持一键装载演示样例、跨重启恢复、导入导出快照与冲突处理、快照归档撤销与回滚。

---

## 页面标识 (pageId)

| 页面路径 | pageId | 浏览器 Title | 说明 |
|---------|--------|-------------|------|
| `/` | `home` | `主页 - 仓储 3D 热力图` | 主页，独立侧边栏操作，含快照归档中心 |
| `/playback` | `playback` | `验收回放台 - 仓储 3D 热力图` | 验收回放台，集成演示样例、日志、完整工具链、快照归档中心 |

> 顶部导航栏右上角实时显示当前 `pageId`，并展示快照文件名规则。

---

## 快照归档中心

### 概述

快照归档中心将 **导出、手工导入、最近记录、回放恢复** 组成一条可单独验收的完整能力。每一份快照在归档时均记录以下元数据，刷新、重新打开浏览器、关闭后再进入均可持久保留：

| 归档元数据 | 说明 |
|-----------|------|
| `fileName` | 真实文件名（如 `warehouse-snapshot-preset-2024-06-15-103045.json`） |
| `savedAt` | ISO 格式时间戳 |
| `source` | 来源：`export`（导出）、`import`（导入）、`auto-save`（自动保存）、`preset`（预设）、`manual`（手工保存） |
| `schemaVersion` | 快照 Schema 版本号（当前 v2，兼容 v1） |
| `summary.locationsCount` | 有效货位数量 |
| `summary.pickRecordsCount` | 拣货记录条数 |
| `summary.bookmarksCount` | 书签数量 |
| `summary.activeBookmarkName` | 当前活跃书签名称 |
| `summary.zones` | 覆盖区域列表 |
| `summary.hasDateFilter` | 是否启用日期筛选 |
| `summary.heatmapLevel` | 热力等级：`none`/`low`/`medium`/`high`/`mixed` |
| `importLogs` | 导入过程日志（仅导入来源的快照附带） |

归档容量：最多保留最近 **30** 条，超出按时间淘汰；撤销栈最多保留 **10** 层。

相关实现：
- 类型定义：[warehouse.ts](file:///D:/workSpace/AI__SPACE/lfc-00017/src/types/warehouse.ts#L133-L173)
- UI 组件：[SnapshotArchive.tsx](file:///D:/workSpace/AI__SPACE/lfc-00017/src/components/sidebar/SnapshotArchive.tsx)
- 核心状态：[warehouseStore.ts](file:///D:/workSpace/AI__SPACE/lfc-00017/src/store/warehouseStore.ts#L981-L1472)

---

### 链路一：导出（Export）

#### 操作流程
1. 在任意筛选、镜头、书签状态下，点击侧边栏底部 **导出演示快照** 按钮，或在 **快照归档中心** 点击 **保存当前**。
2. 浏览器自动下载 JSON 文件，文件名规则：`warehouse-snapshot[-{presetId}]-YYYY-MM-DD-HHMMSS.json`。
3. 该快照以 `source=export` 自动写入归档中心，位列最近记录第 1 条。

#### 验收预期
- 下载的 JSON 文件为标准 `SnapshotData` Schema（version=2），包含货位、拣货、筛选、阈值、相机、书签等全部 9 项状态。
- 归档中心出现新条目：显示真实文件名、精确时间、来源徽章「导出」、摘要信息（货位/记录/书签数、区域、热力等级、Schema 版本 v2）。
- 再次刷新页面，归档记录仍然存在。

---

### 链路二：导入（Import）

#### 操作流程
1. 在 **快照归档中心** 点击 **导入快照文件**，选择任意 JSON 快照。
2. 可选勾选项：**合并现有书签**（不勾选则直接替换书签列表）。

#### 冲突处理与降级策略

| 冲突场景 | 处理方式 | 可见提示 |
|---------|---------|---------|
| **旧版缺字段**（v1 或缺少 cameraState/thresholds 等） | 缺失字段降级为默认值，其余可用状态全部保留 | `missing_field` 警告，显示在导入警告面板与归档 importLogs |
| **同名文件**（归档已存在相同文件名） | 自动追加序号：`name.json` → `name (2).json` → `name (3).json` | 归档条目显示最终文件名 |
| **重复书签 ID** | 跳过重复 ID 的书签，若为当前活跃书签则清除选中状态 | `duplicate_bookmark_name` 警告，含 bookmarkId 细节 |
| **重复书签名称** | 自动重命名：`视角1` → `视角1 (2)` → `视角1 (3)` | `duplicate_bookmark_name` 警告，含 oldName/newName |
| **重复货位坐标** | 全部冲突货位拒绝存入，保留其他有效货位 | `importConflicts` 面板逐条列出，含行号与被拒 ID 列表 |
| **未知货位拣货记录** | 产生 `unknown_location` 异常 | AnomalyPanel 异常面板显示 |
| **本地存储写入失败**（如 localStorage 配额溢出） | catch 异常，记录 error 级别播放日志，返回 `canUndo=false` | 红色错误提示框，归档中心顶部可见 |

#### 撤销机制
每次成功导入或从归档恢复后，自动将导入前的完整状态入栈。点击归档中心顶部 **撤销(N)** 按钮可一键回滚到导入前的状态，撤销栈最多保留 10 层。

#### 验收预期
- 成功导入：绿色提示显示恢复 X/9 项状态、警告条数、「可撤销」字样；归档中心新增 `source=import` 条目，点开可查看完整导入日志。
- 旧版缺字段：黄色警告列出缺失字段名，快照其余状态正常恢复。
- 同名字书签：自动重命名后的书签全部保留，无任何书签丢失。
- 撤销：点击撤销后状态完全还原，撤销按钮数字减 1。

---

### 链路三：刷新恢复（Restore on Refresh）

#### 机制
- Zustand `persist` 中间件将 `archive`（条目、撤销栈、配置）完整存入 `localStorage` key `warehouse-heatmap-store`。
- 页面启动时（Home 与 Playback 均生效）调用 `restoreLatestOnStartup()`：
  - 若当前已存在货位 + 拣货记录（例如 persist 已恢复了上次状态），则仅记录日志不覆盖。
  - 若当前为空，自动选择归档中心第 1 条（最近快照）恢复全部 9 项状态。
- 不会自动跳转到预置演示样例，除非归档中心完全为空。

#### 验收预期
1. 保存或导入一份快照后，**刷新页面（F5）**：3D 场景、筛选、阈值、相机、书签等全部状态与刷新前一致，归档记录仍然存在。
2. **关闭浏览器再重新打开**：效果与刷新一致。
3. 归档中心第 1 条带有「最近」高亮徽章，点击 ▶ 可随时手动恢复任意历史快照。

---

### 链路四：失败降级（Failure Degradation）

系统在以下异常场景均不崩溃，全部给出可见提示并降级为可用状态：

| 失败场景 | 降级行为 |
|---------|---------|
| 快照文件格式错误（非 JSON / 解析失败） | 红色错误提示，状态保持不变，`canUndo=false` |
| 快照数据为 null/非对象 | 返回 `success=false`，记录 error 日志，状态不改动 |
| 归档写入异常（如 localStorage 配额超限） | try/catch 捕获，红色提示，快照依然可使用，只是未持久化到归档 |
| 恢复不存在的归档 entryId | 返回 `success=false`，记录 error 日志 |
| 撤销栈为空时点击撤销 | 黄色提示「撤销栈为空」，无副作用 |
| Schema 版本不匹配（v999 等） | `version_mismatch` 警告，以兼容模式尽量恢复字段 |
| 快照含未知字段（future proofing） | `unknown_field` 警告逐个列出，字段被忽略，其余正常恢复 |
| 快照声明的 activeBookmarkId 在书签列表中不存在 | 清除 activeBookmark，`bookmark_not_found` 警告 |
| 快照 activeBookmarkName 与实际书签名称不一致 | 以实际书签名称为准，`duplicate_bookmark_name` 警告 |

所有失败场景均可在 **导入/操作日志面板** 与 **归档条目 importLogs** 中追溯完整过程。

---

## 快照导出文件名规则

```
warehouse-snapshot[-{presetId}]-YYYY-MM-DD-HHMMSS.json
```

示例：
- 无预设：`warehouse-snapshot-2024-06-15-103045.json`
- 装载预设后：`warehouse-snapshot-preset-full-heatmap-2024-06-15-103045.json`

规则实现：[`buildSnapshotExportFileName`](file:///D:/workSpace/AI__SPACE/lfc-00017/src/store/warehouseStore.ts#L383-L388)

---

## 验收回放台演示步骤与预期结果

### 步骤 1：进入验收回放台
- **操作**：打开浏览器访问 `/playback`，或在顶部导航点击「验收回放台」
- **预期结果**：
  - 页面标题显示为「验收回放台 - 仓储 3D 热力图」
  - 顶部导航 `pageId: playback` 标签高亮
  - 左侧显示验收回放台专用侧边栏，包含「验收演示样例」与「快照归档中心」区块

### 步骤 2：一键装载完整热力图演示
- **操作**：点击左侧「完整热力图演示」预设按钮
- **预期结果**：
  - 3D 场景渲染 A/B/C 三个区域共 40 个双层货位
  - 自动装载 4 个默认视角书签（全局概览、A 区特写、B 区特写、C 区俯视角）
  - 预设日期筛选（2024-06-01 ~ 2024-06-15）生效
  - 侧边栏状态信息显示「当前样例: preset-full-heatmap」
  - 「导入/操作日志」出现成功记录
  - 快照归档中心自动新增一条 `source=preset` 的归档记录

### 步骤 3：验证异常拣货记录
- **操作**：装载「冲突与异常演示」预设
- **预期结果**：
  - 侧边栏「导入拒绝」显示 2 处坐标冲突（共 4 个冲突货位被拒绝）
  - 「未知货位」显示 1 条拣货记录异常（`GHOST-999`）
  - 3D 场景仅渲染无冲突的有效货位
  - 被拒绝货位的拣货记录同时被标为未知货位异常

### 步骤 4：视角书签切换
- **操作**：点击侧边栏「相机书签」中的任意书签
- **预期结果**：
  - 3D 相机平滑切换到书签记录的位置和目标点
  - 当前选中的书签高亮显示
  - 选中状态被持久化，刷新页面后仍保持

### 步骤 5：导出演示快照
- **操作**：点击侧边栏底部「导出演示快照」按钮
- **预期结果**：
  - 浏览器下载 JSON 文件，文件名符合 `warehouse-snapshot-{presetId}-YYYY-MM-DD-HHMMSS.json` 规则
  - 导入/操作日志记录「快照已导出」成功条目
  - 快照归档中心第 1 条出现带「最近」徽章的新记录，来源为「导出」，含完整摘要

### 步骤 6：导入快照与冲突处理
- **操作**：
  1. 在「快照归档中心」→「导入快照文件」选择刚才导出的文件
  2. （可选）手工构造含缺字段、同名字签、重复货位、旧版本号的快照文件导入
- **预期结果**：
  - 有效快照：9 项状态全部恢复（货位、拣货记录、筛选、阈值、相机、确认视角、当前书签、书签列表、警告信息），绿色提示显示「可撤销」
  - 缺字段：缺失字段降级为默认值，产生 `missing_field` 警告，其余状态正常恢复
  - 同名字签：自动重命名为「名称 (2)」「名称 (3)」，产生 `duplicate_bookmark_name` 警告
  - 重复货位：冲突货位全部被拒绝，记录 `importConflicts`，其余有效货位保留
  - 旧版本号：以兼容模式导入，产生 `version_mismatch` 警告
  - 所有情况均在「导入/操作日志」「导入警告」面板和「归档条目 importLogs」中可见

### 步骤 7：撤销导入
- **操作**：导入后立刻点击快照归档中心顶部的「撤销(N)」按钮
- **预期结果**：
  - 状态完全回滚到导入之前
  - 绿色提示「已撤销导入，恢复到前一状态」
  - 撤销栈数字减 1

### 步骤 8：刷新恢复
- **操作**：保存/导入快照后按 F5 刷新，或关闭浏览器再重新打开
- **预期结果**：
  - 3D 场景、筛选条件、阈值、相机视角、书签等全部状态与刷新前一致
  - 快照归档中心记录完整保留，第 1 条带「最近」徽章
  - 未自动跳转到任何演示预设，完全从最近快照恢复

---

## 跨重启恢复 (持久化)

系统通过 `zustand/middleware` 的 `persist` 中间件将以下状态存入 `localStorage`（key: `warehouse-heatmap-store`），刷新或关闭浏览器后重新打开可自动恢复：

| 持久化字段 | 说明 |
|-----------|------|
| `locations` | 当前有效货位列表 |
| `pickRecords` | 拣货记录 |
| `anomalies` | 异常检测结果 |
| `importConflicts` | 导入冲突记录 |
| `filter` | 筛选条件（日期范围 + 区域） |
| `thresholds` | 热力图色阶阈值 |
| `cameraBookmarks` | 全部相机书签 |
| `cameraState` | 当前相机位置和目标 |
| `confirmedCameraState` | 已确认的相机状态 |
| `activeBookmark` | 当前选中的书签 ID |
| `activeBookmarkName` | 当前选中的书签名称 |
| `playback.activePresetId` | 当前装载的演示预设 ID |
| `playback.lastSnapshotFileName` | 最近导入/导出的快照文件名 |
| `archive.entries` | 快照归档条目列表（最近 30 条） |
| `archive.maxEntries` | 归档容量配置 |
| `archive.lastAutoSaveId` | 最近自动保存 ID |
| `archive.undoStack` | 撤销栈（最近 10 层） |

> 日志内容 (`playback.logs`) 和 `archive.currentImportSession` 不持久化，刷新后清空，避免存储膨胀。

---

## 开发与验证

### 安装依赖
```bash
npm install
```

### 启动开发服务器
```bash
npm run dev
```

### 类型检查
```bash
npm run check
```

### 运行自动化测试
```bash
npm run test
```

测试覆盖 7 大模块：
1. **布局导入：重复坐标冲突**（4 用例）
2. **未知货位拣货记录**（2 用例）
3. **快照导出与回放**（6 用例）
4. **视角快照完整链路**（11 用例）
5. **验收回放台：演示预设 / 操作日志 / 文件名规则 / 跨重启恢复 / 导入冲突与降级**（16 用例）
6. **快照归档中心：导出链路**（3 用例）
7. **快照归档中心：导入 / 刷新恢复 / 失败降级 / 撤销**（10+ 用例）

### 生产构建
```bash
npm run build
```

---

## 核心文件结构

```
src/
├── components/
│   ├── TopNav.tsx                  # 顶部导航（显示 pageId、文件名规则）
│   ├── PlaybackSidebar.tsx         # 验收回放台专用侧边栏
│   ├── Sidebar.tsx                 # 主页侧边栏（集成拥堵推演台）
│   ├── Scene3D.tsx                 # 3D 场景容器
│   └── sidebar/
│       ├── DemoPresets.tsx         # 演示预设装载面板
│       ├── PlaybackLog.tsx         # 导入/操作日志面板
│       ├── SnapshotArchive.tsx     # 快照归档中心面板
│       ├── ReplenishmentSandbox.tsx # 补货任务沙盘面板
│       ├── CongestionSandbox.tsx   # 作业拥堵推演台面板（新增）
│       ├── DataImporter.tsx        # 数据导入（布局/拣货/快照）
│       ├── BookmarkPanel.tsx       # 相机书签管理
│       ├── FilterPanel.tsx         # 筛选条件
│       ├── ThresholdPanel.tsx      # 色阶阈值
│       └── AnomalyPanel.tsx        # 异常检测结果
├── 3d/
│   ├── WarehouseScene.tsx          # 3D 主场景（集成拥堵覆盖层）
│   ├── ShelfGroup.tsx              # 货架分组渲染
│   ├── CongestionOverlay.tsx       # 拥堵覆盖层：热区/路线/货位（新增）
│   └── LocationBox.tsx             # 3D 货位交互
├── pages/
│   ├── Home.tsx                    # 主页 (pageId: home，含启动自动恢复拥堵草稿)
│   └── Playback.tsx                # 验收回放台 (pageId: playback)
├── store/
│   └── warehouseStore.ts           # Zustand 状态管理（含 persist、拥堵、撤销）
├── data/
│   ├── sampleData.ts               # 简单样例数据
│   └── demoPresets.ts              # 3 套验收演示预设
├── types/
│   └── warehouse.ts                # 类型定义（含 CongestionPlan 等）
└── __tests__/
    ├── warehouse.test.ts           # 原自动化测试（102 用例）
    └── congestion.test.ts          # 拥堵推演台测试（28 用例，新增）
```
