[English](README.md) | **中文**

# Schedule Planner — 日程规划器

一个轻量的自托管日程规划工具，集日程管理、番茄钟计时、Markdown 笔记于一体。

## 功能特性

### 日程安排表

- **双栏日视图** — "计划"与"实际执行"并排显示，30 分钟时间槽（00:00–24:00）。
- **拖拽创建** — 在空白时间槽上点击拖动即可快速新建日程。
- **边缘拖拽缩放** — 拖动事件上下边缘调整时长，相邻事件自动级联压缩。
- **计划/实际联动** — 创建计划事件时自动生成对应的实际事件；删除其一同时删除另一个。
- **颜色、分类与优先级** — 20 种预设颜色、5 种分类（工作/学习/个人/运动/其他）、3 级优先级。
- **撤销** — Ctrl+Z 撤销创建/编辑/删除/缩放/完成操作。
- **键盘快捷键** — Enter 编辑、Space 切换完成、Delete 删除、Escape 关闭。

### 笔记

- **Markdown 编辑器**，支持编辑/预览切换。
- 支持**标题、加粗、斜体、列表、引用、表格、围栏代码块、行内代码**。
- **LaTeX 数学公式** — 行内 `$...$` 与块级 `$$...$$`，基于 KaTeX 渲染。
- 忠实的空白渲染 — 行首空格、多个连续空格、多次换行均按原样显示。
- Tab / Shift+Tab 缩进/反缩进选中行。
- 自动保存（800ms 防抖），切换日期时安全刷写。

### 番茄钟计时器

- 可调时长（5–180 分钟），快捷预设（15/25/45/60 分钟）。
- 暂停、继续、追加时间（+5/+30 分钟）、停止。
- 完成时桌面通知 + 提示音。
- 按日记录专注条目与统计。

### 数据统计

- 时间维度切换：日/周/月/全部。
- 汇总卡片：事项数、执行时长、专注时长、计时完成率。
- 图表（Chart.js）：执行趋势、分类分布、专注趋势、优先级分布。

## 快速开始

### 环境要求

- Python 3.9+

### 安装与运行

```bash
git clone https://github.com/<your-username>/schedule_planner.git
cd schedule_planner
pip install -r requirements.txt
python app.py
```

浏览器打开 [http://localhost:5000](http://localhost:5000) 即可使用。

SQLite 数据库文件 `planner.db` 会在首次运行时自动创建。

## 项目结构

```
schedule_planner/
├── app.py                 # Flask 后端 & REST API
├── planner.db             # SQLite 数据库（自动创建）
├── requirements.txt
├── templates/
│   └── index.html         # 单页 HTML
└── static/
    ├── css/
    │   └── style.css      # 全部样式
    └── js/
        └── app.js         # 全部前端逻辑
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/events?start=&end=` | 查询日期范围内的事件 |
| POST | `/api/events` | 创建事件（自动创建联动实际事件） |
| PUT | `/api/events/<id>` | 更新事件 |
| PUT | `/api/events/batch` | 批量更新时间 |
| DELETE | `/api/events/<id>` | 删除事件（含联动事件） |
| GET | `/api/stats?date=` | 获取当日统计 |
| GET | `/api/notes?date=` | 获取指定日期笔记 |
| PUT | `/api/notes` | 保存笔记 |
| GET/POST/DELETE | `/api/timer/...` | 计时记录与统计 |
| GET | `/api/analytics?start=&end=` | 分析数据 |

## 许可证

MIT
