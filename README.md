# 坐忘

一个简洁的习惯追踪 Web 应用，支持日常打卡、日记记录和统计可视化。

## 功能特性

- **习惯管理** - 创建、编辑、删除习惯，支持分类、标签和身份关联
- **每日打卡** - 快速打卡记录，支持追加内容和跳过原因
- **日记记录** - TipTap 富文本编辑器，支持所见即所得格式
- **统计可视化** - 90天热力图、月历视图、连续天数徽章
- **数据导出** - 支持 JSON 和 CSV 格式导出
- **PWA 支持** - 可安装为桌面/移动应用，支持离线访问
- **深色模式** - 支持浅色/深色主题切换

## 技术栈

- **后端**: Express.js + better-sqlite3
- **前端**: 原生 JavaScript（无框架），Proxy 响应式状态
- **编辑器**: TipTap 富文本编辑器
- **安全**: DOMPurify XSS 防护
- **缓存**: IndexedDB + Service Worker

## 快速开始

```bash
# 安装依赖
npm install

# 构建 TipTap 编辑器
npm run build:editor

# 启动服务
npm start
```

应用将在 `http://localhost:3847` 运行。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3847 | 服务端口 |
| `TIMEZONE` | Asia/Shanghai | 时区设置 |
| `ADMIN_PASSWORD` | (空) | 管理员密码 |

## 开发命令

```bash
npm start              # 启动服务器
npm run build:editor   # 构建 TipTap 编辑器
npm run lint           # 运行 ESLint 检查
npm test               # 运行测试
npm run test:watch     # 测试监视模式
```

## 项目结构

```
├── src/
│   ├── server.js      # Express 服务器
│   └── db.js          # 数据库工具
├── public/
│   ├── index.html     # 主页面
│   ├── manifest.json  # PWA 配置
│   ├── sw.js          # Service Worker
│   ├── css/styles.css # 样式文件
│   └── js/
│       ├── app.js       # 主应用逻辑
│       ├── components.js # UI 组件
│       ├── api.js        # API 客户端
│       ├── state.js      # 响应式状态
│       ├── cache.js      # IndexedDB 缓存
│       ├── config.js     # 共享配置
│       ├── utils.js      # 工具函数
│       └── performance.js # 性能监控
└── test/              # 测试文件
```

## API 接口

### 习惯管理
- `GET /api/habits` - 获取所有习惯
- `POST /api/habits` - 创建习惯
- `PUT /api/habits/:id` - 更新习惯
- `DELETE /api/habits/:id` - 删除习惯

### 打卡记录
- `POST /api/checkin` - 创建打卡
- `PUT /api/checkins/:id` - 更新打卡
- `DELETE /api/checkins/:id` - 删除打卡
- `PUT /api/checkins/:id/skip` - 跳过打卡

### 日记
- `POST /api/logs` - 创建日记
- `GET /api/logs` - 获取日记列表
- `PUT /api/logs/:id` - 更新日记
- `DELETE /api/logs/:id` - 删除日记

### 统计
- `GET /api/stats/daily` - 每日统计
- `GET /api/stats/progress` - 进度统计
- `GET /api/heatmap` - 热力图数据
- `GET /api/history` - 历史记录

## 习惯分类

| 分类 | 图标 | 说明 |
|------|------|------|
| 生活 | 🏠 | 日常生活习惯 |
| 健康 | 💪 | 运动、饮食相关 |
| 学习 | 📚 | 阅读、学习相关 |
| 工作 | 💼 | 工作相关习惯 |
| 其他 | 📌 | 其他类型 |

## 徽章系统

| 徽章 | 连续天数 |
|------|----------|
| 🥉 铜牌 | 7 天 |
| 🥈 银牌 | 30 天 |
| 🥇 金牌 | 100 天 |

## License

MIT