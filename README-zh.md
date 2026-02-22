[English](README.md) | **中文**

# Schedule Planner — 日程规划器

一个支持多用户的自托管日程规划工具，集日程管理、番茄钟计时、Markdown 笔记与数据统计于一体。可部署到服务器供团队或个人远程使用。

## 功能特性

### 用户系统

- **邮箱注册与登录** — 支持「记住我」保持 30 天登录状态。
- **忘记密码** — 输入邮箱获取 6 位验证码，验证后重置密码。
- **个人资料** — 自定义用户名、个人简介、上传头像（自动裁剪缩放）。
- **修改密码** — 输入原密码 + 两次新密码完成修改。
- **数据导出** — 一键导出所有数据为 JSON 或 CSV 文件。
- **数据导入** — 从 JSON 文件导入历史数据。
- **账户删除** — 输入密码确认后永久删除账户及全部数据。
- **多用户数据隔离** — 每个用户的数据完全独立互不可见。
- **PWA 支持** — 可安装为桌面/移动应用，支持离线访问静态资源。

### 日程安排表

- **双栏日视图** — "计划"与"实际执行"并排显示，30 分钟时间槽（00:00–24:00）。
- **拖拽创建** — 在空白时间槽上点击拖动即可快速新建日程。
- **边缘拖拽缩放** — 拖动事件上下边缘调整时长，相邻事件自动级联压缩。
- **计划/实际联动** — 创建计划事件时自动生成对应的实际事件；删除其一同时删除另一个。
- **颜色、分类与优先级** — 20 种预设颜色、5 种分类（工作/学习/个人/运动/其他）、3 级优先级。
- **拖拽移动** — 拖拽事件在计划/实际列之间自由移动和调整位置。
- **事件模板** — 保存常用日程为模板，一键快速创建。
- **周期性事件** — 支持每天/工作日/每周/每月自动重复。
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

浏览器打开 [http://localhost:5000](http://localhost:5000)，注册账户后即可使用。

SQLite 数据库文件 `planner.db` 会在首次运行时自动创建。

### 生产环境部署

使用 Gunicorn 或 Waitress 等 WSGI 服务器替代内置开发服务器：

```bash
# Linux / macOS
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 app:app

# Windows
pip install waitress
waitress-serve --port=5000 app:app
```

### 环境变量配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `SECRET_KEY` | Flask Session 签名密钥（生产环境必须设置） | 随机生成 |
| `MAIL_SERVER` | SMTP 邮件服务器地址 | `smtp.gmail.com` |
| `MAIL_PORT` | SMTP 端口 | `587` |
| `MAIL_USERNAME` | SMTP 用户名 | 空（未配置时验证码打印到控制台） |
| `MAIL_PASSWORD` | SMTP 密码 / 应用专用密码 | 空 |
| `MAIL_DEFAULT_SENDER` | 发件人地址 | `noreply@schedule-planner.com` |
| `MAIL_USE_TLS` | 是否启用 TLS | `true` |

## 项目结构

```
schedule_planner/
├── app.py                 # Flask 入口，Session 与速率限制配置
├── config.py              # 应用配置（密钥、邮件、上传等）
├── database.py            # 数据库连接、表结构初始化与迁移
├── auth_utils.py          # 认证工具（装饰器、验证码、邮件发送）
├── routes/                # Flask 蓝图（Blueprint）
│   ├── __init__.py        # 蓝图注册
│   ├── main.py            # 页面路由（/、/login）
│   ├── auth.py            # 认证 API（注册、登录、忘记密码）
│   ├── user.py            # 用户 API（资料、头像、密码、导出）
│   ├── events.py          # 日程事件 CRUD API
│   ├── timer.py           # 计时记录与统计 API
│   ├── notes.py           # 笔记 API
│   └── stats.py           # 统计与分析 API
├── planner.db             # SQLite 数据库（自动创建）
├── uploads/               # 用户上传文件
│   └── avatars/           # 用户头像
├── requirements.txt
├── templates/
│   ├── index.html         # 主模板（含用户菜单与个人资料面板）
│   ├── auth.html          # 登录 / 注册 / 忘记密码页面
│   └── partials/
│       ├── schedule.html  # 日程安排表页面
│       ├── timer.html     # 计时器页面
│       ├── stats.html     # 数据统计页面
│       └── modal.html     # 弹窗、气泡菜单与提示
└── static/
    ├── css/
    │   ├── base.css       # 变量、重置、全局样式
    │   ├── layout.css     # 顶栏、标签页、页面布局
    │   ├── auth.css       # 登录 / 注册页面样式
    │   ├── user.css       # 用户菜单与个人资料面板样式
    │   ├── schedule.css   # 日程页面样式
    │   ├── timer.css      # 计时器页面样式
    │   ├── stats.css      # 统计页面样式
    │   └── components.css # 弹窗、气泡菜单、提示、按钮
    └── js/
        ├── app.js         # 入口与标签页初始化
        ├── auth.js        # 登录 / 注册 / 忘记密码逻辑
        ├── user.js        # 用户菜单、个人资料、全局认证拦截
        ├── constants.js   # 共享常量
        ├── helpers.js     # 工具函数
        ├── planner.js     # 日程安排（PlannerApp 类）
        ├── timer.js       # 计时器（TimerManager 类）
        └── stats.js       # 数据统计（StatisticsManager 类）
```

## API 接口

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册（邮箱 + 用户名 + 密码） |
| POST | `/api/auth/login` | 登录 |
| POST | `/api/auth/logout` | 登出 |
| GET | `/api/auth/me` | 获取当前用户信息 |
| POST | `/api/auth/forgot-password` | 发送密码重置验证码 |
| POST | `/api/auth/verify-code` | 校验验证码 |
| POST | `/api/auth/reset-password` | 重置密码 |

### 用户

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/user/profile` | 获取个人资料 |
| PUT | `/api/user/profile` | 更新用户名与简介 |
| POST | `/api/user/avatar` | 上传头像 |
| POST | `/api/user/change-password` | 修改密码 |
| GET | `/api/user/export` | 导出全部数据（JSON） |
| DELETE | `/api/user/delete-account` | 删除账户 |

### 日程与数据

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/events?start=&end=` | 查询日期范围内的事件 |
| POST | `/api/events` | 创建事件（自动创建联动实际事件） |
| PUT | `/api/events/<id>` | 更新事件 |
| PUT | `/api/events/batch` | 批量更新时间 |
| DELETE | `/api/events/<id>` | 删除事件（含联动事件） |
| POST | `/api/events/<id>/duplicate` | 复制事件到指定日期 |
| GET | `/api/events/search?q=&limit=` | 按关键字搜索事件 |
| GET | `/api/stats?date=` | 获取当日统计 |
| GET | `/api/stats/streak` | 获取连续打卡与生产力数据 |
| GET | `/api/notes?date=` | 获取指定日期笔记 |
| PUT | `/api/notes` | 保存笔记 |
| GET | `/api/notes/search?q=&limit=` | 按关键字搜索笔记 |
| GET | `/api/timer/records?date=` | 获取计时记录 |
| POST | `/api/timer/records` | 创建计时记录 |
| DELETE | `/api/timer/records/<id>` | 删除计时记录 |
| GET | `/api/timer/stats?date=` | 获取计时统计 |
| GET | `/api/analytics?start=&end=` | 分析数据 |

### 运维

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查（无需认证） |

> 除认证和运维接口外，所有 API 均需登录后访问，未登录返回 `401`。

## 安全特性

- **密码哈希** — 使用 Werkzeug 的 `generate_password_hash` / `check_password_hash`（PBKDF2）。
- **签名 Cookie Session** — `HttpOnly`、`SameSite=Lax`，防止 XSS 和 CSRF。
- **速率限制** — 注册 5 次/分、登录 10 次/分、忘记密码 3 次/分（基于 Flask-Limiter）。
- **输入校验** — 密码强度（≥8 位，含字母+数字）、邮箱格式、用户名长度。
- **数据隔离** — 所有查询均绑定 `user_id`，用户之间不可能跨访问。
- **验证码有效期** — 10 分钟过期，使用一次即失效。

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Flask 3.0+、Flask-Limiter |
| 前端 | 原生 JavaScript（ES Modules） |
| 数据库 | SQLite（WAL 模式） |
| 模板引擎 | Jinja2 |
| 图片处理 | Pillow |
| 外部库 | Chart.js、Marked.js、KaTeX |

## 许可证

MIT
