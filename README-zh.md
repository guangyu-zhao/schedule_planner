[English](README.md) | **中文**

# Schedule Planner — 日程规划器

一个支持多用户的自托管日程规划网站，包含三个主要栏目 — **日程安排表**、**计时器**和**数据统计** — 以及完整的用户账户系统和 8 种语言的国际化支持。

## 功能介绍

### 日程安排表

日程页面左侧填写**计划**，右侧记录**实际执行情况**。两栏均以 30 分钟为单位的时间槽显示，覆盖 00:00 至 24:00。

- **拖拽创建** — 在空白时间槽上点击拖动即可快速新建日程。
- **复制计划项** — 在新建计划日程弹窗中，点击"复制计划项"按钮进入选取模式：日历保持可操作，可通过日历跳转到任意日期，然后点击该日期的某条计划事件，即可将其标题、分类、优先级、颜色和备注复制到当前新建表单；按 Esc 可取消选取，返回自行编辑。
- **拖拽缩放** — 拖动事件的上下边缘调整时长，相邻事件自动级联压缩。
- **拖拽移动** — 拖拽事件在计划/实际列之间自由移动和调整位置。
- **计划/实际联动** — 创建计划事件时自动生成对应的实际事件；删除其一同时删除另一个。
- **颜色、分类与优先级** — 20 种预设颜色、5 种分类（工作/学习/个人/运动/其他）、3 级优先级。
- **周期性事件** — 支持每天/工作日/每周/每月自动重复。
- **事件模板** — 将常用日程保存为模板，一键快速创建。
- **撤销** — Ctrl+Z 撤销创建、编辑、删除、缩放、完成操作。
- **键盘快捷键** — Enter 编辑、Space 切换完成、Delete 删除、Escape 关闭。
- **回收站** — 已删除的事件保留 30 天，支持恢复。

#### 笔记

日程页面右侧还有一个绑定当前日期的 **Markdown 笔记**区域：

- **每天多条笔记** — 点击 **+ 新建笔记** 为同一天创建新笔记（仅当当前笔记有内容时可用）。点击 **☰ 选择笔记** 查看当天所有笔记列表，每行显示第一行内容作为标题，点击跳转到对应笔记。
- 支持**编辑**与**预览**切换。
- 支持标题、加粗、斜体、列表、引用、表格、围栏代码块、行内代码。
- LaTeX 数学公式 — 行内 `$...$` 与块级 `$$...$$`。
- **图片插入** — 从浏览器外将图片拖入编辑器、从剪贴板粘贴（Ctrl+V）或点击图片按钮即可插入图片。图片通过 OSS 存储抽象层保存，嵌入 Markdown 的代号为不透明字符串，不暴露任何内部 ID 信息。也支持用 HTML `<img>` 标签排版图片。
- Tab / Shift+Tab 缩进/反缩进选中行。
- 自动保存（800ms 防抖），切换日期时安全刷写。空笔记不会被持久化保存。

### 计时器

输入任务名称、设置时长（5–180 分钟，提供 15/25/45/60 分钟快捷预设），开始倒计时。倒计时结束后，这条记录会写入当天的"条目记录"中。

- 暂停、继续、追加时间（+5/+30 分钟）、提前停止。
- **番茄钟模式** — 每次专注结束后自动进入休息（短休息 5 分钟 / 每 4 个番茄钟长休息 15 分钟）。
- **环境音** — 雨声、森林、咖啡馆、白噪音。
- 完成时桌面通知与提示音。
- 按日记录专注条目与统计。

### 数据统计

查看所选**日/周/月/全部历史**时间段的数据分析。日程安排表的统计基于**实际执行**列（与计划列无关），以及计时器的统计。

- 汇总卡片：事项数、执行时长、专注时长、计时完成率。
- 图表：执行趋势、分类分布、专注趋势、优先级分布。

### 日历侧栏

三个栏目的最左侧都有一个日历组件，显示当月日历、"回到今天"按钮和当天日期。点击其它日期可以跳转到当天，查看当天的相关记录。

### 用户系统

- **邮箱注册与登录** — 支持「记住我」保持 30 天登录状态。
- **忘记密码** — 输入邮箱、获取 6 位验证码、输入验证码、重新设置密码。
- **个人资料** — 自定义用户名、个人简介、上传头像（自动裁剪缩放）。
- **修改密码** — 输入原密码 + 两次新密码完成修改。
- **数据导出** — 导出所有数据为 JSON、CSV 或 iCal (.ics) 日历文件。
- **数据导入** — 从此前导出的 JSON 文件导入数据。
- **账户删除** — 输入密码确认后永久删除账户及全部数据。
- **多用户数据隔离** — 每个用户的数据完全独立，互不可见。

### 多语言支持

支持 8 种语言：**English**、**简体中文**、**繁體中文**、**Français**、**Deutsch**、**日本語**、**العربية**（RTL）、**עברית**（RTL）。

- 登录界面默认英语，可在登录前切换语言。
- 第一次登录的用户，将登录界面选择的语言保存为其偏好语言。
- 已有偏好语言的老用户，登录后网站按其之前设置的语言显示，不受登录界面语言影响。
- 可随时在个人资料设置中更改语言。

## 快速开始

### 环境要求

- Python 3.9+

### 安装与运行

```bash
git clone https://github.com/<your-username>/schedule_planner.git
cd schedule_planner
cp .env.example .env        # 创建配置文件，按需修改
pip install -r requirements.txt
python app.py
```

浏览器打开 `http://localhost:5555`，注册账户后即可使用。

数据库文件 `planner.db` 会在首次运行时自动创建。

### 生产环境部署

```bash
# Linux / macOS
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5555 app:app

# Windows
pip install waitress
waitress-serve --port=5555 app:app
```

### 配置说明

所有配置项集中在项目根目录的 **`.env`** 文件中（通过 `python-dotenv` 自动加载）。首次使用时将 `.env.example` 复制为 `.env` 并按需修改，重启服务后生效。

#### 服务

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `FLASK_ENV` | 运行模式（`development` / `production`） | `development` |
| `FLASK_DEBUG` | 是否开启 Flask 调试模式 | `false` |
| `HOST` | 监听地址 | `127.0.0.1` |
| `PORT` | 服务端口 | `5555` |
| `HTTPS` | 设为 `1` 时 Session Cookie 加上 Secure 标记 | `0` |
| `LOG_LEVEL` | 日志级别（`DEBUG` / `INFO` / `WARNING` / `ERROR`） | `INFO` |

#### 安全

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `SECRET_KEY` | Session 签名密钥（生产环境必须设置） | 自动生成并保存到 `.secret_key` 文件 |

#### 邮件

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `MAIL_SERVER` | SMTP 邮件服务器地址 | `smtp.gmail.com` |
| `MAIL_PORT` | SMTP 端口 | `587` |
| `MAIL_USERNAME` | SMTP 用户名 | 空（未配置时验证码打印到控制台） |
| `MAIL_PASSWORD` | SMTP 密码 / 应用专用密码 | 空 |
| `MAIL_DEFAULT_SENDER` | 发件人地址 | `noreply@schedule-planner.com` |
| `MAIL_USE_TLS` | 是否启用 TLS | `true` |

#### 文件存储

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `STORAGE_TYPE` | 存储后端：`local`（本地文件系统）或 `oss`（阿里云 OSS） | `local` |
| `UPLOAD_FOLDER` | 本地上传目录（`STORAGE_TYPE=local` 时生效） | 项目根目录下的 `uploads/` |
| `OSS_ACCESS_KEY_ID` | 阿里云 OSS Access Key ID | 空 |
| `OSS_ACCESS_KEY_SECRET` | 阿里云 OSS Access Key Secret | 空 |
| `OSS_ENDPOINT` | OSS 端点（如 `https://oss-cn-hangzhou.aliyuncs.com`） | 空 |
| `OSS_BUCKET` | OSS 存储桶名称 | 空 |
| `OSS_BASE_URL` | OSS 公网访问基础 URL | 空 |

> **切换到 OSS**：只需将 `STORAGE_TYPE=oss` 并填写 `OSS_*` 相关配置，无需修改任何代码。

## 项目结构

```
schedule_planner/
│
├── .env                    # 环境配置文件（不纳入 git 版本管理）
├── .env.example            # 配置文件模板 — 复制为 .env 即可使用
│
├── app.py                  # 应用入口 — 创建 Flask 应用，注册中间件
│                           #   （CSRF 检查、安全响应头、速率限制），
│                           #   周期性维护（数据库优化与备份），
│                           #   以及错误处理器。
│
├── config.py               # 集中配置 — 通过 python-dotenv 加载 .env，
│                           #   从环境变量或 .secret_key 文件读取密钥，
│                           #   定义邮件、Session 有效期、头像约束、
│                           #   验证码过期时间等。
│
├── database.py             # 数据库层 — SQLite 连接管理，完整的表结构
│                           #   创建（users、events、timer_records、
│                           #   notes、note_images、event_templates、
│                           #   user_settings、verification_codes、
│                           #   deleted_events），列迁移、索引创建、
│                           #   周期性优化、带时间戳的自动备份与轮转。
│
├── auth_utils.py           # 认证工具 — @login_required 装饰器、
│                           #   get_current_user()、密码强度校验、
│                           #   验证码生成、SMTP 邮件发送、
│                           #   验证码存储/校验、重置会话过期检查。
│
├── storage/                # 可插拔文件存储抽象层
│   ├── __init__.py         # 工厂函数 get_storage() — 根据环境变量
│   │                       #   STORAGE_TYPE 返回单例 Storage 实例。
│   ├── base.py             # 抽象 Storage 接口 — 定义 save()、
│   │                       #   delete()、exists()、url() 方法。
│   ├── local.py            # LocalStorage — 将文件存储在本地文件
│   │                       #   系统的 UPLOAD_FOLDER 目录下。
│   └── oss.py              # OSSStorage — 阿里云 OSS 存储后端
│                           #   （结构已就绪，需安装 oss2 SDK）。
│
├── requirements.txt        # Python 依赖
├── planner.db              # SQLite 数据库（首次运行自动创建）
├── .secret_key             # 自动生成的 Session 密钥（已 gitignore）
├── backups/                # 带时间戳的数据库备份（最多 7 份，自动轮转）
│
├── routes/                 # API 路由模块（按业务领域划分）
│   ├── __init__.py         # 向 Flask 应用注册所有蓝图
│   ├── main.py             # 页面路由：/（主应用）和 /login
│   ├── auth.py             # 认证 API：注册、登录、登出、忘记密码、
│   │                       #   验证码校验、重置密码；包含登录失败
│   │                       #   计数与锁定机制（10 次失败 → 锁定 15 分钟）。
│   ├── user.py             # 用户 API：获取/更新个人资料、上传头像
│   │                       #   （自动裁剪+缩放）、修改密码、
│   │                       #   导出数据（JSON / CSV / iCal）、
│   │                       #   导入数据、删除账户。
│   ├── events.py           # 日程 API：增删改查、批量更新时间、
│   │                       #   计划/实际联动创建、复制到指定日期、
│   │                       #   周期性事件生成（每天/工作日/每周/每月）、
│   │                       #   搜索、回收站与恢复。
│   ├── timer.py            # 计时器 API：创建/查询/删除计时记录，
│   │                       #   按日统计（总数、完成数、总秒数）。
│   ├── notes.py            # 笔记 API：按日期获取/保存 Markdown 笔记，
│   │                       #   按关键字搜索笔记，通过 OSS 抽象层
│   │                       #   上传并访问笔记图片。
│   ├── stats.py            # 统计 API：每日统计（事件数、时长、
│   │                       #   完成率）、日期范围分析、活动热力图、
│   │                       #   连续打卡天数计算。
│   └── templates.py        # 事件模板 API：创建/查询/删除可复用的
│                           #   事件模板（每用户上限 50 个）。
│
├── templates/              # HTML 模板
│   ├── auth.html           # 登录/注册/忘记密码页面，包含语言选择器
│   │                       #   和功能展示卡片
│   ├── index.html          # 主应用外壳 — 顶部导航栏、用户菜单
│   │                       #   下拉、个人资料浮层、删除账户弹窗、
│   │                       #   快捷键帮助弹窗、离线提示横幅、
│   │                       #   消息提示条
│   └── partials/
│       ├── schedule.html   # 日程标签页 — 日历侧栏、双栏时间网格、
│       │                   #   笔记编辑器与预览
│       ├── timer.html      # 计时器标签页 — 日历侧栏、环形倒计时、
│       │                   #   控制按钮、环境音选择、番茄钟设置、
│       │                   #   记录列表
│       ├── stats.html      # 统计标签页 — 日历侧栏、时段选择器、
│       │                   #   汇总卡片、图表画布
│       └── modal.html      # 事件编辑弹窗、右键菜单气泡、
│                           #   消息提示容器
│
├── static/
│   ├── manifest.json       # PWA 清单，支持安装为桌面/移动应用
│   ├── service-worker.js   # Service Worker，离线缓存静态资源
│   ├── icons/              # PWA 图标（192×192、512×512）
│   ├── css/
│   │   ├── base.css        # CSS 自定义属性（亮色/暗色主题变量）、
│   │   │                   #   重置样式、排版、滚动条
│   │   ├── layout.css      # 顶栏、标签页导航、页面容器、
│   │   │                   #   侧栏/内容布局、RTL 支持
│   │   ├── components.css  # 弹窗对话框、气泡菜单、消息提示、
│   │   │                   #   按钮、颜色选择器、日期/时间输入框
│   │   ├── auth.css        # 登录/注册页：分栏布局、表单卡片、
│   │   │                   #   功能卡片、语言选择器
│   │   ├── user.css        # 用户头像/菜单下拉、个人资料浮层、
│   │   │                   #   删除账户弹窗、快捷键弹窗
│   │   ├── schedule.css    # 日历组件、时间网格、事件块、
│   │   │                   #   拖拽覆盖层、笔记编辑器/预览
│   │   ├── timer.css       # 环形计时器、预设按钮、环境音面板、
│   │   │                   #   番茄钟指示器、记录列表
│   │   └── stats.css       # 汇总卡片、图表容器、时段切换按钮、
│   │                       #   范围标签
│   └── js/
│       ├── i18n.js         # 国际化 — 8 种语言的完整翻译字典、
│       │                   #   语言读取/设置（localStorage）、
│       │                   #   通过 data-i18n 属性翻译 DOM、
│       │                   #   后端中文错误消息到 i18n 键的映射、
│       │                   #   按语言区域格式化日期。
│       ├── app.js          # 入口 — 初始化 PlannerApp、TimerManager、
│       │                   #   StatisticsManager；设置标签页切换
│       │                   #   和可见性变化时的自动刷新。
│       ├── auth.js         # 登录、注册、忘记密码表单处理；
│       │                   #   将所选语言随认证请求一起发送。
│       ├── user.js         # 用户菜单、个人资料编辑（保存资料、
│       │                   #   更换头像、修改密码、切换语言）、
│       │                   #   数据导出/导入、删除账户、
│       │                   #   主题切换（亮色/暗色）、
│       │                   #   快捷键帮助弹窗、全局 401 重定向拦截。
│       ├── constants.js    # 共享常量：颜色面板、分类图标/颜色、
│       │                   #   优先级颜色、时间槽高度、
│       │                   #   分类/优先级标签（含 i18n）。
│       ├── helpers.js      # 工具函数：ISO 日期格式化、
│       │                   #   HTML 转义、消息提示展示。
│       ├── planner.js           # PlannerApp 核心 — 构造函数、init()、
│       │                        #   bindEvents()、时间槽/日期辅助方法。
│       │                        #   所有功能 Mixin 通过 Object.assign
│       │                        #   合并到原型链上。
│       ├── planner-calendar.js  # CalendarMixin — 日历渲染、日期切换、
│       │                        #   日历标记（有日程/有笔记）。
│       ├── planner-grid.js      # GridMixin — 时间网格与事件块渲染、
│       │                        #   当前时间指示器、桌面通知调度。
│       ├── planner-events-api.js# EventsApiMixin — 事件增删改查、
│       │                        #   列间移动、批量更新、撤销历史栈。
│       ├── planner-drag.js      # DragMixin — 拖拽创建、边缘缩放与
│       │                        #   级联压缩、列间拖拽移动。
│       ├── planner-modal.js     # ModalMixin — 事件编辑弹窗、颜色选
│       │                        #   择器、右键气泡、提示、计划选取模式。
│       ├── planner-notes.js     # NotesMixin — 多笔记管理、Markdown
│       │                        #   编辑器（实时预览）、图片插入、
│       │                        #   自动保存、笔记列表视图。
│       └── planner-search.js    # SearchMixin — 关键字搜索日程与笔记、
│                                #   搜索结果跳转到对应日期。
│       ├── timer.js        # TimerManager 类 — 倒计时逻辑
│       │                   #   （暂停/继续/停止/追加时间）、
│       │                   #   番茄钟循环（自动短/长休息）、
│       │                   #   环境音生成（Web Audio API：
│       │                   #   雨声、森林、咖啡馆、白噪音）、
│       │                   #   记录持久化、标题栏倒计时显示。
│       └── stats.js        # StatisticsManager 类 — 时段切换、
│                           #   日期范围计算、数据获取、汇总卡片
│                           #   渲染、图表创建（柱状图、饼图、
│                           #   折线图）。
│
└── uploads/
    ├── avatars/            # 用户上传的头像图片（本地存储）
    └── note_images/        # 笔记嵌入图片，按用户分目录存储（本地存储）
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
| PUT | `/api/user/profile` | 更新用户名、简介与语言 |
| POST | `/api/user/avatar` | 上传头像 |
| POST | `/api/user/change-password` | 修改密码 |
| GET | `/api/user/settings` | 获取用户设置 |
| PUT | `/api/user/settings` | 更新用户设置 |
| GET | `/api/user/export` | 导出全部数据（JSON） |
| GET | `/api/user/export-csv` | 导出数据（CSV） |
| GET | `/api/user/export-ical` | 导出日历（iCal） |
| POST | `/api/user/import` | 从 JSON 导入数据 |
| DELETE | `/api/user/delete-account` | 删除账户 |

### 日程事件

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/events?start=&end=` | 查询日期范围内的事件 |
| POST | `/api/events` | 创建事件 |
| PUT | `/api/events/<id>` | 更新事件 |
| PUT | `/api/events/batch` | 批量更新事件时间 |
| DELETE | `/api/events/<id>` | 软删除事件（移入回收站） |
| POST | `/api/events/<id>/duplicate` | 复制事件到指定日期 |
| POST | `/api/events/generate-recurring` | 生成周期性事件实例 |
| GET | `/api/events/search?q=` | 按关键字搜索事件 |
| GET | `/api/events/trash` | 查看回收站 |
| POST | `/api/events/trash/<id>/restore` | 从回收站恢复事件 |
| DELETE | `/api/events/trash` | 清空回收站 |

### 计时器

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/timer/records?date=` | 获取指定日期计时记录 |
| POST | `/api/timer/records` | 创建计时记录 |
| DELETE | `/api/timer/records/<id>` | 删除计时记录 |
| GET | `/api/timer/stats?date=` | 获取指定日期计时统计 |

### 笔记

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/notes?date=` | 获取指定日期笔记 |
| PUT | `/api/notes` | 保存笔记 |
| GET | `/api/notes/search?q=` | 按关键字搜索笔记 |
| POST | `/api/notes` | 为某日创建新笔记 |
| PUT | `/api/notes/<id>` | 更新笔记内容 |
| DELETE | `/api/notes/<id>` | 删除笔记 |
| POST | `/api/notes/images` | 上传笔记图片，返回不透明令牌 |
| GET | `/api/notes/images/<token>` | 按令牌访问笔记图片 |

### 数据统计

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/stats?date=` | 当日统计 |
| GET | `/api/stats/heatmap` | 活动热力图（过去一年） |
| GET | `/api/stats/streak` | 连续打卡与生产力数据 |
| GET | `/api/analytics?start=&end=` | 日期范围分析数据 |

### 事件模板

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/templates` | 获取事件模板列表 |
| POST | `/api/templates` | 创建事件模板 |
| DELETE | `/api/templates/<id>` | 删除事件模板 |

### 运维

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查（无需认证） |

> 除 `/api/auth/*` 和 `/health` 外，所有 API 均需登录后访问，未登录返回 `401`。
