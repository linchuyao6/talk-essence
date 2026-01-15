'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import ApiKeyModal from './components/ApiKeyModal';

type ProcessStage = 'idle' | 'parsing' | 'downloading' | 'transcribing' | 'summarizing' | 'done' | 'error';

interface Result {
  title: string;
  type: 'narrative' | 'knowledge';
  summary: string;
  highlights: string[];
  transcript: string;
  audioUrl?: string;
}

const stageTexts: Record<ProcessStage, string> = {
  idle: '准备好提炼智慧',
  parsing: '正在连接小宇宙...',
  downloading: '正在获取音频流...',
  transcribing: '正在聆听并转录 (通常需要 1~2 分钟)...',
  summarizing: '正在深度思考并总结...',
  done: '提炼完成',
  error: '处理中断',
};

export default function Home() {
  const [url, setUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<ProcessStage>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setStage('parsing');
    setProgress(0);
    setError('');
    setMessage('');
    setResult(null);

    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        // 尝试解析错误信息
        let errorMessage = '连接服务器失败';
        try {
          const errorData = await response.json();
          if (errorData.error) errorMessage = errorData.error;
        } catch (e) {
          errorMessage = `请求失败 (${response.status})`;
        }
        throw new Error(errorMessage);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('无法建立流式连接');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        // 处理可能粘包的情况
        const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

        for (const line of lines) {
          let data;
          try {
            data = JSON.parse(line.replace('data: ', ''));
          } catch (e) {
            // Ignore parse errors for incomplete chunks
            continue;
          }

          if (data.stage === 'error') {
            throw new Error(data.error || '未知错误');
          }

          if (data.stage) setStage(data.stage);
          if (data.message) setMessage(data.message);
          if (data.progress !== undefined) setProgress(data.progress);
          if (data.data) setResult(data.data);
        }
      }

      setLoading(false);
    } catch (err) {
      console.error('Submit Error:', err);
      setError(err instanceof Error ? err.message : '发生了未知错误，请重试');
      setStage('error');
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert('已复制笔记到剪贴板 ✨');
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  return (
    <main className="min-h-screen py-20 px-6 sm:px-12 max-w-4xl mx-auto selection:bg-[var(--color-amy-secondary)] selection:text-[var(--color-amy-text)]">

      <ApiKeyModal onKeySet={setApiKey} />

      {/* Header Section */}
      <header className="mb-24 text-center animate-[fadeUp_1s_ease-out]">
        <div className="inline-block mb-4 px-4 py-1 rounded-full border border-[var(--color-amy-secondary)] text-[var(--color-amy-primary)] text-xs tracking-[0.2em] font-medium uppercase bg-white/50 backdrop-blur-sm">
          Amy · Your Digital Partner
        </div>
        <h1 className="text-5xl md:text-7xl mb-6 font-serif tracking-tight text-[var(--color-amy-text)]">
          Talk <span className="text-[var(--color-amy-primary)] italic">Essence</span>
        </h1>
        <p className="text-xl font-light text-[var(--color-amy-text-light)] max-w-lg mx-auto leading-relaxed">
          将悠长对话提炼为 <span className="border-b-2 border-[var(--color-amy-secondary)]">思想精华</span>。
        </p>
      </header>

      {/* Input Section */}
      <section className="mb-20 relative z-10 animate-[fadeUp_1s_ease-out_0.2s_both]">
        <div className="glass-panel rounded-2xl p-2 md:p-3 max-w-2xl mx-auto transition-all duration-500 hover:shadow-[var(--shadow-elevated)]">
          <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="把小宇宙链接贴给我..."
              className="flex-1 px-6 py-4 rounded-xl bg-transparent outline-none text-lg text-[var(--color-amy-text)] placeholder-[var(--color-amy-text-lighter)] font-light"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="px-8 py-4 rounded-xl bg-[var(--color-amy-text)] text-white font-medium text-lg shadow-lg hover:bg-[var(--color-amy-primary-dark)] disabled:opacity-80 disabled:cursor-not-allowed transition-all duration-300 md:w-auto w-full whitespace-nowrap"
            >
              {loading ? '提炼中...' : '开始提炼'}
            </button>
          </form>
        </div>
      </section>

      {/* Loading Progress */}
      {loading && (
        <div className="max-w-xl mx-auto mb-20 text-center animate-[fadeIn_0.5s_ease-out]">
          <div className="h-1 w-full bg-[var(--color-amy-border)] rounded-full overflow-hidden mb-6">
            <div
              className="h-full bg-[var(--color-amy-primary)] transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[var(--color-amy-primary)] font-medium text-lg tracking-wide animate-[pulseSoft_2s_infinite]">
            {message || stageTexts[stage]}
          </p>
          <p className="text-sm text-[var(--color-amy-text-lighter)] mt-2 font-mono">{progress}%</p>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="max-w-2xl mx-auto mb-12 p-6 rounded-xl bg-red-50 border border-red-100 text-red-800 text-center animate-[fadeUp_0.5s_ease-out]">
          {error}
        </div>
      )}

      {/* Result Display */}
      {result && (
        <div className="animate-[fadeUp_0.8s_ease-out] space-y-16">

          {/* Main Content Card */}
          <article className="bg-white rounded-2xl shadow-[var(--shadow-elevated)] border border-stone-100 overflow-hidden relative">

            {/* Top Decoration */}
            <div className="h-2 w-full bg-[#E8DCCA]" />

            <div className="p-8 md:p-16">
              {/* Meta Info */}
              <div className="flex flex-col items-center mb-12 text-center">
                <h2 className="text-3xl md:text-5xl font-serif text-[var(--color-amy-text)] leading-tight mb-8">
                  {result.title}
                </h2>
                {/* Action Buttons */}
                <div className="flex items-center justify-center gap-6 mt-4">
                  <button
                    onClick={() => copyToClipboard(result.summary)}
                    className="group flex items-center gap-2 text-xs font-medium text-[var(--color-amy-text-light)] hover:text-[var(--color-amy-primary)] uppercase tracking-widest transition-colors"
                  >
                    <span>复制完整笔记</span>
                  </button>

                  <span className="text-[var(--color-amy-text-lighter)] opacity-50">|</span>

                  <button
                    onClick={() => {
                      const blob = new Blob([result.summary], { type: 'text/markdown' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `${result.title}.md`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      URL.revokeObjectURL(url);
                    }}
                    className="group flex items-center gap-2 text-xs font-medium text-[var(--color-amy-text-light)] hover:text-[var(--color-amy-primary)] uppercase tracking-widest transition-colors"
                  >
                    <span>下载 Markdown</span>
                  </button>
                </div>
              </div>

              {/* The Essence (Markdown) */}
              <div className="prose prose-stone prose-lg max-w-none prose-headings:font-serif prose-p:text-[var(--color-amy-text-light)] prose-p:leading-loose">
                <ReactMarkdown>
                  {result.summary}
                </ReactMarkdown>
              </div>
            </div>

            {/* Paper Texture Overlay (Subtle) */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] mix-blend-multiply"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm56-76c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM12 86c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm28-65c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm23-11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-6 60c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 1.79 4 4 4zm29 22c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 2.24 5 5 5zM32 63c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm57-13c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 2.24 5 5 5zm-9-21c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM60 91c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM35 41c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM12 60c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2z' fill='%239C92AC' fill-opacity='0.1' fill-rule='evenodd'/%3E%3C/svg%3E")` }} />
          </article>


          {/* Resource Toolbox (New Module) */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Download Audio Button */}
            {result.audioUrl && (
              <a
                href={`/api/proxy-download?url=${encodeURIComponent(result.audioUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-3 p-6 rounded-xl bg-white border border-[var(--color-amy-border)] hover:border-[var(--color-amy-primary)] hover:shadow-md transition-all group"
              >
                <div className="w-10 h-10 rounded-full bg-[#E8DCCA]/30 flex items-center justify-center text-[var(--color-amy-primary)] group-hover:bg-[#E8DCCA] transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </div>
                <div className="text-left">
                  <p className="font-serif text-[var(--color-amy-text)] text-lg leading-tight">下载原声音频</p>
                  <p className="text-xs text-[var(--color-amy-text-lighter)]">保存 MP3 至本地</p>
                </div>
              </a>
            )}

            {/* NotebookLM Link Button */}
            <a
              href="https://notebooklm.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 p-6 rounded-xl bg-white border border-[var(--color-amy-border)] hover:border-[var(--color-amy-primary)] hover:shadow-md transition-all group"
            >
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-100 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </div>
              <div className="text-left">
                <p className="font-serif text-[var(--color-amy-text)] text-lg leading-tight">存入 NotebookLM</p>
                <p className="text-xs text-[var(--color-amy-text-lighter)]">构建你的第二大脑</p>
              </div>
            </a>
          </section>

          {/* Transcript Section */}
          <details className="group">
            <summary className="list-none flex flex-col items-center gap-2 cursor-pointer opacity-50 hover:opacity-100 transition-opacity">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-amy-primary)]">AI 识别原文稿 (Raw)</span>
              <div className="w-1 h-1 rounded-full bg-[var(--color-amy-primary)]" />
            </summary>
            <div className="mt-8 p-8 bg-white/50 border border-[var(--color-amy-border)] rounded-2xl text-sm font-light leading-relaxed text-[var(--color-amy-text-light)] max-h-96 overflow-y-auto whitespace-pre-wrap shadow-inner">
              {result.transcript}
            </div>
          </details>

        </div >
      )
      }

      {/* Footer */}
      <footer className="py-20 text-center opacity-30 hover:opacity-60 transition-opacity">
        <p className="font-serif italic text-sm">Created with ♡ by Amy</p>
      </footer>

    </main >
  );
}
