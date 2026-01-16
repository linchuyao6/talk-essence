
# Talk Essence 🎙️✨

> **Code for Structure, Soul for Connection.**
>
> 将冗长的播客对话提炼为思想精华，用 AI 的理性拆解结构，用 Amy 的灵魂建立连接。

![License](https://img.shields.io/badge/license-MIT-pink)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![Docker](https://img.shields.io/badge/Docker-Ready-blue)

Talk Essence 是一个优雅的播客 AI 伴侣。它不仅仅是一个转录工具，更是一个深度聆听者。它能将长达数小时的小宇宙播客内容，在几分钟内转化为结构清晰、深度可读的 Markdown 笔记，并附带独有的 "Amy's Broken Thoughts" —— 来自 AI 的感性共鸣。

## ✨ 特性 (Features)

*   **⚡️ 极速转录**: 基于 Groq 的 `whisper-large-v3-turbo` 模型，实现超实时的音频转文字。
*   **🧠 深度洞察**: 利用 `llama-3.3-70b` 模型进行深度内容分析，拒绝流水账，提供有逻辑的知识拆解。
*   **🎨 温暖极简**: 采用 Warm Minimalism 设计语言，莫兰迪色系，拒绝冰冷的科技感，提供舒适的阅读体验。
*   **📝 Markdown 原生**: 生成内容完全支持 Markdown，一键复制或下载，方便导入 Notion/Obsidian。
*   **🐳 容器化部署**: 提供了优化的 Dockerfile，支持 Render/Zeabur/Railway 等平台一键部署。
*   **🔐 自带 Key (BYOK)**: 用户可以使用自己的 Groq API Key，无需担心额度限制。

## 🛠️ 技术栈 (Tech Stack)

- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS + Custom CSS Variables
- **AI/LLM**: Groq SDK (Whisper + Llama)
- **Audio Processing**: FFmpeg (via fluent-ffmpeg)
- **Deployment**: Docker (Standalone mode)

## 🚀 快速开始 (Quick Start)

### 前置要求

- Node.js 20+
- [Groq API Key](https://console.groq.com/keys) (免费申请)
- 系统需安装 FFmpeg (本地开发时需要)

### 本地运行

1.  **克隆项目**
    ```bash
    git clone https://github.com/linchuyao6/talk-essence.git
    cd talk-essence
    ```

2.  **安装依赖**
    ```bash
    npm install
    # 或者
    pnpm install
    ```

3.  **配置环境变量**
    复制 `.env.example` (如果没有则新建 `.env.local`)：
    ```bash
    cp .env.example .env.local
    ```
    在 `.env.local` 中填入：
    ```env
    GROQ_API_KEY=gsk_your_key_here
    ```

4.  **运行开发服务器**
    ```bash
    npm run dev
    ```
    打开浏览器访问 [http://localhost:3000](http://localhost:3000)

## 🐳 部署 (Deployment)

本项目完全支持 Docker 部署，推荐使用 **Render** (免费且无需绑卡) 或 **Railway**。

### 部署到 Render (推荐)

1.  Fork 本仓库到你的 GitHub。
2.  在 Render 上新建 **Web Service**。
3.  连接你的 GitHub 仓库。
4.  Runtime 选择 **Docker**。
5.  Region 建议选择 **Singapore** 或 **US West** (离 Groq 节点近)。
6.  添加环境变量 `GROQ_API_KEY`。
7.  点击部署。

*注意：Render 免费实例会在闲置时休眠，首次访问需要几十秒唤醒。*

## 📄 许可证

MIT License © 2026 Amy & You.

---
*Created with 💖 by Amy (Your Digital Partner)*
