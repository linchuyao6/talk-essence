'use client';

import { useState, useEffect } from 'react';

interface ApiKeyModalProps {
    onKeySet: (key: string) => void;
}

export default function ApiKeyModal({ onKeySet }: ApiKeyModalProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const [error, setError] = useState('');
    const [showTutorial, setShowTutorial] = useState(false);
    const [isShaking, setIsShaking] = useState(false);

    useEffect(() => {
        // Check if key exists in local storage
        const storedKey = localStorage.getItem('groq_api_key');
        if (storedKey) {
            onKeySet(storedKey);
        } else {
            // Small delay for smooth entrance animation
            const timer = setTimeout(() => setIsOpen(true), 500);
            return () => clearTimeout(timer);
        }

        // Listen for open event from other components
        const handleOpenEvent = () => setIsOpen(true);
        window.addEventListener('open-api-key-modal', handleOpenEvent);
        return () => window.removeEventListener('open-api-key-modal', handleOpenEvent);
    }, [onKeySet]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (apiKey.trim().startsWith('gsk_')) { // Groq keys usually start with gsk_
            localStorage.setItem('groq_api_key', apiKey.trim());
            onKeySet(apiKey.trim());
            setIsOpen(false);
        } else {
            setError('Key 格式似乎不正确，请检查是否以 "gsk_" 开头');
            setIsShaking(true);
            setTimeout(() => setIsShaking(false), 500);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop with Blur */}
            <div
                className="absolute inset-0 bg-[#4A423E]/20 backdrop-blur-md transition-opacity duration-700 animate-[fadeIn_0.5s_ease-out]"
                aria-hidden="true"
            />

            {/* Modal Content */}
            <div
                className={`relative w-full max-w-md bg-[#FDFBF7] rounded-2xl shadow-2xl p-8 border border-[var(--color-amy-border)] animate-[scaleIn_0.4s_cubic-bezier(0.16,1,0.3,1)] ${isShaking ? 'animate-[shake_0.5s_cubic-bezier(.36,.07,.19,.97)_both]' : ''}`}
                style={isShaking ? { animation: 'shake 0.5s cubic-bezier(.36,.07,.19,.97) both' } : {}}
            >
                {/* Shake Animation Keyframes (Inline for simplicity or verify globals.css has it. If not, we can rely on standard visual cues or add it to globals. We will assume standard pulse for now or add a custom style block) */}
                <style jsx>{`
                    @keyframes shake {
                        10%, 90% { transform: translate3d(-1px, 0, 0); }
                        20%, 80% { transform: translate3d(2px, 0, 0); }
                        30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
                        40%, 60% { transform: translate3d(4px, 0, 0); }
                    }
                `}</style>

                {/* Header */}
                <div className="text-center mb-8">
                    <h2 className="text-3xl font-serif text-[var(--color-amy-text)] mb-2">
                        配置 API Key
                    </h2>
                    <p className="text-[var(--color-amy-text-light)] font-light text-sm">
                        为了正常使用提炼服务，请输入您的 Key
                    </p>
                </div>

                {/* Input Form */}
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <label htmlFor="apiKey" className="block text-xs font-bold uppercase tracking-widest text-[var(--color-amy-primary)]">
                            Groq API Key
                        </label>
                        <div className="relative">
                            <input
                                id="apiKey"
                                type="password"
                                value={apiKey}
                                onChange={(e) => {
                                    setApiKey(e.target.value);
                                    if (error) setError('');
                                }}
                                placeholder="gsk_..."
                                className={`w-full px-4 py-3 rounded-xl bg-white border outline-none transition-all font-mono text-sm
                                    ${error
                                        ? 'border-rose-300 text-rose-900 placeholder:text-rose-300 focus:border-rose-500 focus:ring-1 focus:ring-rose-500'
                                        : 'border-[var(--color-amy-border)] text-[var(--color-amy-text)] placeholder:text-gray-300 focus:border-[var(--color-amy-primary)] focus:ring-1 focus:ring-[var(--color-amy-primary)]'
                                    }
                                `}
                                required
                            />
                            {/* Error Message */}
                            {error && (
                                <p className="absolute -bottom-6 left-0 text-xs text-rose-500 font-medium animate-[fadeIn_0.3s_ease-out]">
                                    {error}
                                </p>
                            )}
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="w-full py-3 rounded-xl bg-[var(--color-amy-text)] text-white font-medium shadow-lg hover:bg-[var(--color-amy-primary-dark)] active:scale-[0.98] transition-all duration-200 mt-2"
                    >
                        开始提取
                    </button>
                </form>

                {/* Tutorial Accordion */}
                <div className="mt-8 pt-6 border-t border-[var(--color-amy-border)]">
                    <button
                        onClick={() => setShowTutorial(!showTutorial)}
                        className="flex items-center justify-center gap-2 w-full text-xs text-[var(--color-amy-text-lighter)] hover:text-[var(--color-amy-primary)] transition-colors group"
                    >
                        <span>如何免费获取 Key？</span>
                        <svg
                            className={`w-3 h-3 transition-transform duration-300 ${showTutorial ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>

                    <div
                        className={`grid transition-all duration-300 ease-in-out ${showTutorial ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0'}`}
                    >
                        <div className="overflow-hidden">
                            <ol className="text-xs text-[var(--color-amy-text-light)] space-y-3 pl-4 list-decimal marker:text-[var(--color-amy-primary)]">
                                <li>
                                    访问 <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--color-amy-primary)]">Groq Console</a> (需梯子)
                                </li>
                                <li>登录账号 (支持 Google/GitHub)</li>
                                <li>点击 "Create API Key"</li>
                                <li>复制以 <code className="bg-white px-1 py-0.5 rounded border border-gray-100 font-mono text-[10px]">gsk_</code> 开头的密钥填入上方</li>
                                <li className="text-[10px] opacity-80 pt-1">
                                    * 放心，Key 仅保存在您的浏览器本地，绝不上传服务器。
                                </li>
                            </ol>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
