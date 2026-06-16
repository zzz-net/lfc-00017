# 仓储 3D 热力图 - 验收回放台

基于 React + TypeScript + Three.js + Zustand 的仓储货位拣货热度 3D 可视化系统，内置 **验收回放台** 模块，支持一键装载演示样例、跨重启恢复、导入导出快照与冲突处理。

---

## 页面标识 (pageId)

| 页面路径 | pageId | 浏览器 Title | 说明 |
|---------|--------|-------------|------|
| `/` | `home` | `主页 - 仓储 3D 热力图` | 主页，独立侧边栏操作 |
| `/playback` | `playback` | `验收回放台 - 仓储 3D 热力图` | 验收回放台，集成演示样例、日志、完整工具链 |

> 顶部导航栏右上角实时显示当前 `pageId`，并展示快照文件名规则。

---

## 快照导出文件名规则

```
warehouse-snapshot[-{presetId}]-YYYY-MM-DD-HHMMSS.json
```

示例：
- 无预设：`warehouse-snapshot-2024-06-15-103045.json`
- 装载预设后：`warehouse-snapshot-preset-full-heatmap-2024-06-15-103045.json`

规则实现：[`buildSnapshotExportFileName`](file:///d:/workSpace/AI__SPACE/lfc-00017/src/store/warehouseStore.ts#L379-L384)

---

## 验收回放台演示步骤与预期结果

### 步骤 1：进入验收回放台
- **操作**：打开浏览器访问 `/playback`，或在顶部导航点击「验收回放台」
- **预期结果**：
  - 页面标题显示为「验收回放台 - 仓储 3D 热力图」
  - 顶部导航 `pageId: playback` 标签高亮
  - 左侧显示验收回放台专用侧边栏，包含「验收演示样例」区块

### 步骤 2：一键装载完整热力图演示
- **操作**：点击左侧「完整热力图演示」预设按钮
- **预期结果**：
  - 3D 场景渲染 A/B/C 三个区域共 40 个双层货位
  - 自动装载 4 个默认视角书签（全局概览、A 区特写、B 区特写、C 区俯视角）
  - 预设日期筛选（2024-06-01 ~ 2024-06-15）生效
  - 侧边栏状态信息显示「当前样例: preset-full-heatmap」
  - 「导入/操作日志」出现成功记录

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

### 步骤 6：导入快照与冲突处理
- **操作**：
  1. 在「数据导入」→「导入快照」选择刚才导出的文件
  2. （可选）手工构造含缺字段、同名字签、重复货位、旧版本号的快照文件导入
- **预期结果**：
  - 有效快照：9 项状态全部恢复（货位、拣货记录、筛选、阈值、相机、确认视角、当前书签、书签列表、警告信息）
  - 缺字段：缺失字段降级为默认值，产生 `missing_field` 警告，其余状态正常恢复
  - 同名字签：自动重命名为「名称 (2)」「名称 (3)」，产生 `duplicate_bookmark_name` 警告
  - 重复货位：冲突货位全部被拒绝，记录 `importConflicts`，其余有效货位保留
  - 旧版本号：以兼容模式导入，产生 `version_mismatch` 警告
  - 所有情况均在「导入/操作日志」和「导入警告」面板可见

---

## 跨重启恢复

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

> 日志内容 (`playback.logs`) 不持久化，刷新后清空，避免存储膨胀。

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

测试覆盖 6 大模块共 39 个用例：
1. **布局导入：重复坐标冲突**（4 用例）
2. **未知货位拣货记录**（2 用例）
3. **快照导出与回放**（6 用例）
4. **视角快照完整链路**（11 用例）
5. **验收回放台：演示预设 / 操作日志 / 文件名规则 / 跨重启恢复 / 导入冲突与降级**（16 用例）

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
│   ├── Sidebar.tsx                 # 主页侧边栏
│   ├── Scene3D.tsx                 # 3D 场景容器
│   └── sidebar/
│       ├── DemoPresets.tsx         # 演示预设装载面板
│       ├── PlaybackLog.tsx         # 导入/操作日志面板
│       ├── DataImporter.tsx        # 数据导入（布局/拣货/快照）
│       ├── BookmarkPanel.tsx       # 相机书签管理
│       ├── FilterPanel.tsx         # 筛选条件
│       ├── ThresholdPanel.tsx      # 色阶阈值
│       └── AnomalyPanel.tsx        # 异常检测结果
├── pages/
│   ├── Home.tsx                    # 主页 (pageId: home)
│   └── Playback.tsx                # 验收回放台 (pageId: playback)
├── store/
│   └── warehouseStore.ts           # Zustand 状态管理（含 persist）
├── data/
│   ├── sampleData.ts               # 简单样例数据
│   └── demoPresets.ts              # 3 套验收演示预设
├── types/
│   └── warehouse.ts                # 类型定义
└── __tests__/
    └── warehouse.test.ts           # 39 个自动化测试用例
```
