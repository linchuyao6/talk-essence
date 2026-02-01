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
  const [toast, setToast] = useState<{ show: boolean; message: string }>({ show: false, message: '' });


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
        const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

        for (const line of lines) {
          let data;
          try {
            data = JSON.parse(line.replace('data: ', ''));
          } catch (e) {
            continue;
          }

          if (data.stage === 'error') {
            throw new Error(data.error || '未知错误');
          }

          if (data.stage) setStage(data.stage);
          if (data.message) setMessage(data.message);
          if (data.progress !== undefined) setProgress(data.progress);

          // Incremental State Merging
          if (data.data) {
            setResult(prev => {
              // Merge previous state with new data
              return { ...(prev || {} as Result), ...data.data };
            });
          }
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
      setToast({ show: true, message: '已复制笔记到剪贴板 ✨' });
      setTimeout(() => setToast({ show: false, message: '' }), 3000);
    } catch (err) {
      console.error('Failed to copy', err);
      setToast({ show: true, message: '复制失败，请重试' });
      setTimeout(() => setToast({ show: false, message: '' }), 3000);
    }
  };

  const downloadAudio = (url: string, filename: string) => {
    try {
      setToast({ show: true, message: '正在转码并下载 MP3...' });

      // Use our new proxy API to convert and download as MP3
      const proxyUrl = `/api/proxy-audio?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;

      const link = document.createElement('a');
      link.href = proxyUrl;
      // The Content-Disposition header in the API will handle the filename, but we set it here for good measure
      link.download = `${filename.replace(/[<>:"/\\|?*]+/g, '_') || 'podcast'}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Since we can't track the progress of a direct browser download easily without more complex code,
      // we just show a starting message.
      setTimeout(() => setToast({ show: true, message: '下载已开始，请留意浏览器下载栏 🎧' }), 1000);
      setTimeout(() => setToast({ show: false, message: '' }), 4000);
    } catch (err) {
      console.error('Download error:', err);
      // Fallback to opening original URL if something fails (though logic above is unlikely to throw synchronously)
      window.open(url, '_blank');
      setToast({ show: true, message: '自动下载失败，已打开原链接' });
      setTimeout(() => setToast({ show: false, message: '' }), 3000);
    }
  };

  const downloadMarkdown = (content: string, title: string) => {
    try {
      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title.replace(/[<>:"/\\|?*]+/g, '_') || 'summary'}.md`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      setToast({ show: true, message: 'Markdown 已下载 📝' });
      setTimeout(() => setToast({ show: false, message: '' }), 3000);
    } catch (err) {
      console.error('Markdown download error:', err);
      setToast({ show: true, message: '下载失败，请重试' });
      setTimeout(() => setToast({ show: false, message: '' }), 3000);
    }
  };

  return (
    <main className="min-h-screen py-20 px-6 sm:px-12 max-w-4xl mx-auto selection:bg-[var(--color-amy-secondary)] selection:text-[var(--color-amy-text)]">

      <ApiKeyModal onKeySet={setApiKey} />

      {/* Toast Notification */}
      {toast.show && (
        <div className="fixed top-6 left-1/2 transform -translate-x-1/2 bg-[var(--color-amy-text)] text-[var(--color-amy-bg)] px-6 py-3 rounded-full shadow-lg text-sm font-medium z-50 animate-[fadeIn_0.3s_ease-out]">
          {toast.message}
        </div>
      )}

      {/* Header Section */}
      <header className="mb-24 text-center animate-[fadeUp_1s_ease-out] relative">
        <div className="absolute right-0 top-0">
          <button
            onClick={() => {
              // Dispatch a custom event to open the API Key Modal
              // The ApiKeyModal component listens for this event globally
              const event = new CustomEvent('open-api-key-modal');
              window.dispatchEvent(event);
            }}
            className="text-xs text-[var(--color-amy-text-lighter)] hover:text-[var(--color-amy-primary)] transition-colors flex items-center gap-1"
            title="更换 API Key"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>设置 Key</span>
          </button>
        </div>

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

      {/* Result Display (Incremental) */}
      {(result?.title || result?.audioUrl || result?.transcript) && (
        <div className="animate-[fadeUp_0.8s_ease-out] space-y-16">

          {/* Main Content Card / Loading Skeleton */}
          <article className="bg-white rounded-2xl shadow-[var(--shadow-elevated)] border border-stone-100 overflow-hidden relative min-h-[400px]">

            {/* Top Decoration */}
            <div className="h-2 w-full bg-[#E8DCCA]" />

            <div className="p-8 md:p-16">
              {/* Meta Info */}
              <div className="flex flex-col items-center mb-12 text-center">
                <h2 className="text-3xl md:text-5xl font-serif text-[var(--color-amy-text)] leading-tight mb-8">
                  {result.title || '正在解析标题...'}
                </h2>

                {/* Result Actions - Only show when summary is ready */}
                {result.summary && (
                  <div className="flex items-center justify-center gap-6 mt-4 animate-[fadeIn_0.5s]">
                    <button
                      onClick={() => copyToClipboard(result.summary)}
                      className="group flex items-center gap-2 text-xs font-medium text-[var(--color-amy-text-light)] hover:text-[var(--color-amy-primary)] uppercase tracking-widest transition-colors"
                    >
                      <span>复制完整笔记</span>
                    </button>
                    <span className="text-[var(--color-amy-text-lighter)] opacity-50">|</span>
                    <button
                      onClick={() => downloadMarkdown(result.summary, result.title)}
                      className="group flex items-center gap-2 text-xs font-medium text-[var(--color-amy-text-light)] hover:text-[var(--color-amy-primary)] uppercase tracking-widest transition-colors"
                    >
                      <span>下载 Markdown</span>
                    </button>
                  </div>
                )}
              </div>

              {/* The Essence (Markdown) or Loading State */}
              {result.summary ? (
                <div className="prose prose-stone prose-lg max-w-none prose-headings:font-serif prose-p:text-[var(--color-amy-text-light)] prose-p:leading-loose animate-[fadeIn_0.8s]">
                  <ReactMarkdown>
                    {result.summary}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 space-y-6 opacity-60">
                  {/* Elegant Loading Animation */}
                  <div className="w-12 h-12 border-2 border-[var(--color-amy-border)] border-t-[var(--color-amy-primary)] rounded-full animate-spin" />
                  <p className="font-serif italic text-[var(--color-amy-text-light)]">正在深度思考与提炼...</p>
                </div>
              )}
            </div>

            {/* Paper Texture Overlay (Subtle) */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] mix-blend-multiply"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm56-76c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM12 86c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm28-65c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm23-11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-6 60c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 1.79 4 4 4zm29 22c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 2.24 5 5 5zM32 63c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm57-13c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 2.24 5 5 5zm-9-21c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM60 91c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM35 41c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM12 60c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2z' fill='%239C92AC' fill-opacity='0.1' fill-rule='evenodd'/%3E%3C/svg%3E")` }} />
          </article>


          {/* Resource Toolbox (Incremental) */}
          {(result.audioUrl || result.transcript) && (
            <section className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-[fadeUp_0.5s_ease-out_0.2s_both]">
              {/* Download Audio Button */}
              {result.audioUrl && (
                <button
                  onClick={() => downloadAudio(result.audioUrl!, result.title)}
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
                </button>
              )}

              {/* Copy Transcript Button */}
              {result.transcript && (
                <button
                  onClick={() => copyToClipboard(result.transcript)}
                  className="flex items-center justify-center gap-3 p-6 rounded-xl bg-white border border-[var(--color-amy-border)] hover:border-[var(--color-amy-primary)] hover:shadow-md transition-all group animate-[fadeIn_0.5s_ease-out_0.1s_both]"
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-100 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="font-serif text-[var(--color-amy-text)] text-lg leading-tight">复制原文</p>
                    <p className="text-xs text-[var(--color-amy-text-lighter)]">粘贴至 NotebookLM</p>
                  </div>
                </button>
              )}

              {/* NotebookLM Link Button (Early Access with Audio) */}
              {result.audioUrl && (
                <a
                  href="https://notebooklm.google.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-3 p-6 rounded-xl bg-white border border-[var(--color-amy-border)] hover:border-[var(--color-amy-primary)] hover:shadow-md transition-all group animate-[fadeIn_0.5s_ease-out]"
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
              )}
            </section>
          )}

          {/* Transcript Section (Incremental) */}
          {result.transcript && (
            <details className="group animate-[fadeUp_0.5s_ease-out_0.3s_both]">
              <summary className="list-none flex flex-col items-center gap-2 cursor-pointer opacity-50 hover:opacity-100 transition-opacity">
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-amy-primary)]">AI 识别原文稿 (Raw)</span>
                <div className="w-1 h-1 rounded-full bg-[var(--color-amy-primary)]" />
              </summary>
              <div className="mt-8 relative">
                <button
                  onClick={() => copyToClipboard(result.transcript)}
                  className="absolute top-4 right-4 text-xs font-medium text-[var(--color-amy-text-lighter)] hover:text-[var(--color-amy-primary)] uppercase tracking-widest transition-colors flex items-center gap-1 bg-white/80 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-[var(--color-amy-border)] hover:border-[var(--color-amy-primary)]"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  复制原文稿
                </button>
                <div className="p-8 pt-14 bg-white/50 border border-[var(--color-amy-border)] rounded-2xl text-sm font-light leading-relaxed text-[var(--color-amy-text-light)] max-h-96 overflow-y-auto whitespace-pre-wrap shadow-inner">
                  {result.transcript}
                </div>
              </div>
            </details>
          )}

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
