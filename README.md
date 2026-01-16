
# Talk Essence 🎙️✨

> **Distill Conversations into Insights.**
>
> 将冗长的播客对话智能提炼为结构化的思想精华。

![License](https://img.shields.io/badge/license-MIT-blue)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![Docker](https://img.shields.io/badge/Docker-Ready-blue)

Talk Essence 是一个现代化的播客内容提取与总结工具。它能够将长达数小时的小宇宙播客内容，在几分钟内转化为结构清晰、深度可读的 Markdown 笔记，并提供深度复盘与核心观点提炼。

## ✨ 特性 (Features)

*   **⚡️ 极速转录**: 集成 Groq 的 `whisper-large-v3-turbo` 模型，实现高并发、低延迟的音频转文字处理。
*   **🧠 深度分析**: 利用 `llama-3.3-70b` 模型进行上下文理解，输出有逻辑的知识拆解与结构化复盘。
*   **🎨 极简美学**: 采用 Warm Minimalism (暖调极简) 设计语言，提供专注、舒适的阅读与沉浸体验。
*   **📝 Markdown 原生**: 生成内容完全标准 Markdown 格式，支持一键复制代码或导出文件，无缝对接 Notion/Obsidian 等知识库。
*   **🐳 容器化架构**: 基于 Docker 构建，支持 Render/Zeabur/Railway 等云平台的一键部署与自动扩容。
*   **🔐 BYOK (Bring Your Own Key)**: 支持用户配置私有 Groq API Key，保障服务稳定性与独立性。

## 🛠️ 技术栈 (Tech Stack)

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS, CSS Variables, Framer Motion
- **AI Infrastructure**: Groq SDK (Whisper V3 Turbo + Llama 3 70B)
- **Audio Processing**: FFmpeg (Stream processing via fluent-ffmpeg)
- **Deployment**: Docker (Multi-stage build, Standalone mode)

## 🚀 快速开始 (Quick Start)

### 前置要求

- Node.js 20+
- [Groq API Key](https://console.groq.com/keys)
- FFmpeg (本地开发需安装)

### 本地运行

1.  **克隆项目**
    ```bash
    git clone https://github.com/linchuyao6/talk-essence.git
    cd talk-essence
    ```

2.  **安装依赖**
    ```bash
    npm install
    # or
    pnpm install
    ```

3.  **环境配置**
    复制 `.env.example` 为 `.env.local`：
    ```bash
    cp .env.example .env.local
    ```
    配置你的 API Key：
    ```env
    GROQ_API_KEY=gsk_your_key_here
    ```

4.  **启动服务**
    ```bash
    npm run dev
    ```
    访问 [http://localhost:3000](http://localhost:3000)

## 🐳 部署指南 (Deployment)

本项目提供经过优化的 `Dockerfile`，支持在任何兼容 Docker 的容器平台运行。

### Render 部署 (推荐)

1.  Fork 本仓库。
2.  在 Render Dashboard 新建 **Web Service**。
3.  连接 GitHub 仓库。
4.  Runtime 选择 **Docker**。
5.  在 Environment Variables 中添加 `GROQ_API_KEY`。
6.  部署上线。

### Docker 常用指令

```bash
# 构建镜像
docker build -t talk-essence .

# 运行容器
docker run -p 3000:3000 -e GROQ_API_KEY=your_key talk-essence
```

## 📄 许可证

MIT License
