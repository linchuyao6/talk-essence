# Talk Essence 🎙️✨

> **Distill Conversations into Insights.**
>
> 将冗长的播客对话智能提炼为结构化的思想精华。

![License](https://img.shields.io/badge/license-MIT-blue)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![Docker](https://img.shields.io/badge/Docker-Ready-blue)

**Talk Essence** 是一个现代化的播客内容提取与总结工具。它专为中文播客平台“小宇宙”设计，能够将长达数小时的音频内容瞬间转化为结构清晰、深度可读的 Markdown 笔记。

## ✨ 特性 (Features)

*   **🪐 小宇宙深度支持**: 完美解析单集链接，自动获取元数据。
*   **⚡️ 极速转录**: 基于 Groq `whisper-large-v3-turbo`，实现近乎实时的音频转文字。
*   **🧠 深度思考**: 采用 `llama-3.3-70b` 模型，提供有逻辑的知识拆解与核心观点复盘。
*   **🛠️ 资源工具箱**:
    *   **音频下载**: 一键提取并保存高清源音频。
    *   **NotebookLM 联动**: 生成优化后的文本，方便构建个人知识库。
*   **🎨 暖调极简设计**: "Warm Minimalism" 风格，提供舒适沉浸的阅读体验。
*   **📝 原生 Markdown**: 无论是 Notion 还是 Obsidian，复制即用。
*   **🔐 数据隐私**: 支持 BYOK (Bring Your Own Key) 模式，你的 API Key 仅在本地使用。

## 🚀 快速开始 (Quick Start)

### 1. 获取代码
```bash
git clone https://github.com/linchuyao6/talk-essence.git
cd talk-essence
```

### 2. 安装依赖
```bash
npm install
```

### 3. 配置环境
复制 `.env.example` 并重命名为 `.env.local`，填入你的 [Groq API Key](https://console.groq.com/keys)。
```bash
cp .env.example .env.local
```

### 4. 启动服务
```bash
npm run dev
```
打开浏览器访问 [http://localhost:3000](http://localhost:3000) 即可使用。

## 🐳 Docker 部署

本项目支持 Docker 一键部署，适合部署在 Render、Railway 或自己的服务器上。

```bash
# 构建镜像
docker build -t talk-essence .

# 运行容器
docker run -p 3000:3000 -e GROQ_API_KEY=your_key talk-essence
```

## 📄 许可证 (License)

MIT License


