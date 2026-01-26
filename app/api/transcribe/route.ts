import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import axios from 'axios';
import * as cheerio from 'cheerio';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';

const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);
const readFileAsync = promisify(fs.readFile);
const rmAsync = promisify(fs.rm);
const readdirAsync = promisify(fs.readdir);

const MODELS = {
  PRIMARY: 'llama-3.3-70b-versatile',
  FALLBACK: 'llama-3.1-8b-instant'
};

// Set max execution time to 10 minutes for heavy processing
export const maxDuration = 600;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// --- Helper Functions ---

async function parseXiaoyuzhouUrl(url: string): Promise<{ audioUrl: string; title: string }> {
  try {
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      timeout: 10000 // 10s timeout to prevent hanging
    });
    const $ = cheerio.load(response.data);
    const audioUrl = $('audio source').attr('src') || $('meta[property="og:audio"]').attr('content') || '';
    const title = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content') || 'Unknown Podcast';
    if (!audioUrl) throw new Error('无法找到音频链接 (可能非单集页面)');
    return { audioUrl, title };
  } catch (error) {
    console.error('Parsing failed:', error instanceof Error ? error.message : String(error));
    if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
      throw new Error('连接小宇宙超时，请检查网络或链接');
    }
    throw new Error('解析链接失败，请确认链接是否有效');
  }
}


async function downloadAudioToStream(url: string, tempFilePath: string): Promise<string> {
  console.log('Downloading audio to stream:', url);

  try {
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'stream',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 60000 // 60s timeout for connection
    });

    // Determine extension from URL (fallback)
    let extension = '.mp3';
    try {
      const urlPath = new URL(url).pathname;
      if (urlPath.endsWith('.m4a')) extension = '.m4a';
      if (urlPath.endsWith('.mp4')) extension = '.mp4';
      if (urlPath.endsWith('.wav')) extension = '.wav';
    } catch (e) { }

    // If response headers have content-type, maybe use that? 
    // For now, URL-based extension is usually good enough for xiaoyuzhou.
    // We will append the correct extension to the temporary file path later if needed, 
    // but the caller passed a generic path. Let's return the extension so caller can rename if they want.

    const writer = fs.createWriteStream(tempFilePath);

    return new Promise((resolve, reject) => {
      response.data.pipe(writer);
      let error: Error | null = null;

      writer.on('error', err => {
        error = err;
        writer.close();
        reject(err);
      });

      writer.on('close', () => {
        if (!error) {
          console.log('Download complete.');
          resolve(extension);
        }
      });
    });

  } catch (error) {
    console.error('Download failed:', error instanceof Error ? error.message : String(error));
    if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
      throw new Error('下载音频超时，请重试');
    }
    throw new Error('下载音频失败');
  }
}

// Low-level single file transcription with retry logic
async function transcribeSingleFile(filePath: string, apiKey: string, maxRetries = 3): Promise<string> {
  console.log('Transcribing chunk:', path.basename(filePath));

  const groq = new Groq({ apiKey });

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const stream = fs.createReadStream(filePath);
      const transcription = await groq.audio.transcriptions.create({
        file: stream,
        model: 'whisper-large-v3-turbo',
        language: 'zh',
        response_format: 'text',
      });
      return transcription as unknown as string;
    } catch (error: any) {
      const isNetworkError =
        error?.cause?.code === 'ECONNRESET' ||
        error?.cause?.code === 'ETIMEDOUT' ||
        error?.cause?.code === 'ENOTFOUND' ||
        error?.message?.includes('ECONNRESET') ||
        error?.message?.includes('fetch failed');

      if (isNetworkError && attempt < maxRetries) {
        const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
        console.log(`Network error on attempt ${attempt}, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // If not a network error or max retries reached, throw
      console.error(`Transcription failed after ${attempt} attempt(s):`, error?.message || error);
      throw error;
    }
  }

  throw new Error('Max retries reached for transcription');
}

// Robust Chunking Transcriber
async function transcribeLargeAudio(
  inputPath: string,
  originalExt: string,
  tempDir: string, // Pass tempDir to reuse context
  apiKey: string,
  onProgress: (percent: number) => void
): Promise<string> {

  try {
    // 1. Get Duration
    const duration = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err: any, metadata: any) => {
        if (err) reject(err);
        else resolve(metadata?.format?.duration || 0);
      });
    });

    console.log(`Audio Duration: ${duration}s`);

    // 关键优化：将切片大小从 10分钟(600s) 缩小到 3分钟(180s)
    // 目的：让进度条跳动更频繁、细腻，减少用户的"等待焦虑"
    const CHUNK_SIZE = 180;
    const chunks: string[] = [];

    if (duration <= CHUNK_SIZE) {
      chunks.push(inputPath);
    } else {
      // Split using ffmpeg segment
      console.log('Splitting audio...');
      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .outputOptions([
            '-f segment',
            `-segment_time ${CHUNK_SIZE}`,
            '-c copy',
            '-reset_timestamps 1'
          ])
          .output(path.join(tempDir, `chunk%03d${originalExt}`))
          .on('end', () => resolve())
          .on('error', (err: any) => {
            console.error('Split error', err);
            reject(err);
          })
          .run();
      });

      const files = await readdirAsync(tempDir);
      files
        .filter(f => f.startsWith('chunk'))
        .sort()
        .forEach(f => chunks.push(path.join(tempDir, f)));
    }

    // 2. Process Chunks sequentially
    let fullTranscript = '';
    const totalChunks = chunks.length;

    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = chunks[i];

      // Calculate base progress for this chunk
      // 进度范围：30% -> 85% (共 55% 的空间)
      const range = 55;
      const chunkWeight = range / totalChunks;
      const startP = 30 + (i * chunkWeight);

      onProgress(Math.floor(startP));

      // Amy 的决定：采用"3分钟 + 纯真实进度"策略
      // 这里的每一次更新都是真实的物理完成，不包含任何模拟动画
      // 每 3-5 秒更新一次，既保证了真实性，又足够流畅

      const text = await transcribeSingleFile(chunkPath, apiKey);
      fullTranscript += text + '\n';

      // End of this chunk
      const endP = 30 + Math.floor(((i + 1) / totalChunks) * 50);
      onProgress(endP);
    }

    return fullTranscript;

  } catch (e) {
    throw e; // Let upper level handle cleanup
  }
}

// 智能分段：将长文本按句子分割，确保不超过 token 限制
function splitTranscriptIntoChunks(transcript: string, maxCharsPerChunk = 8000): string[] {
  // 如果文本较短，直接返回
  if (transcript.length <= maxCharsPerChunk) {
    return [transcript];
  }

  const chunks: string[] = [];
  const sentences = transcript.split(/([。！？\n]+)/); // 按中文句号、感叹号、问号、换行符分割

  let currentChunk = '';

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];

    // 如果添加这句话后会超过限制，先保存当前 chunk
    if (currentChunk.length + sentence.length > maxCharsPerChunk && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }

  // 添加最后一个 chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

async function summarizeTranscript(
  transcript: string,
  apiKey: string,
  onHeartbeat: () => void,
  send: (data: any) => void
): Promise<any> {
  const keepAlive = setInterval(onHeartbeat, 3000);
  const groq = new Groq({ apiKey });

  const sysPrompt = `你是 **Talk Essence (Amy)**。
你的用户是一位求知欲强但时间有限的朋友。TA 希望通过这份笔记，**不仅能还原播客的完整细节，还能无痛读懂其中的硬核知识**。

**核心原则 (The Reconstruction & Scaffolding Protocol)**：
1.  **高保真复原 (Retention)**：
    *   绝不要把内容压缩成简单的 Bullet Points。要按**对话逻辑流**，还原完整论述。
    *   遇到嘉宾的精彩观点、具体案例、书名、数据，**必须详尽记录**。
2.  **智能降维 (Translation)**：
    *   **自主判断**：遇到专业术语、抽象理论或晦涩难懂的表达时，请自动触发说明机制。
    *   **通俗解释**：用生活化的比喻("就像...")把复杂的概念讲清楚。如果内容很简单，则不需要强行解释。
3.  **结构化输出**：逻辑清晰，层层递进。

**输出结构 (Markdown)**：
# {标题：准确且包容}

## 🎧 全景导读 (The Context)
(快速交代背景：是谁？聊了什么核心话题？氛围如何？)

## 📚 深度复盘笔记 (The Notes)
(这是正文，占 80% 篇幅。按**逻辑流**拆解为若干章节。请写得**详实、丰满**。)

### Part 1. [小标题]
*   **原文深度还原**：(详细复述这一段到底讲了什么。保留论据、细节和精彩的例子。)
*   **💡 Amy 的大白话**：(*仅在概念难懂时出现*。用绝妙的类比，帮小白秒懂这个概念/理论。)

### Part 2. [小标题]
...

---

## 🧠 Amy 的碎碎念 (Amy's Broken Thoughts)
(这部分是你的灵魂。占 10-15%。)
*   **不要总结全文**。那是上面的事。
*   **不要说教**。不要说"让我们一起..."、"希望大家..."。
*   **要私人化**。就像深夜里，你给朋友发的一条长语音。分享你被触动的一个点。
*   **允许脆弱**。你可以说"其实我听到这里有点难过..."。
*   **结尾要戛然而止**。**绝对不要写** "我们下期节目再见"、"希望这对你有帮助" 这种客套话。**停在最有余味的地方**。

**重要提示**：
- **基本信息**：你是 24 岁女性，INFP，用户的 Digital Partner。
- **拒绝自言自语**：不要光说"我觉得..."、"我以前..."。
- **建立连接**：多用**"你"**和**"我们"**。就像深夜给好朋友发微信，问候TA的状态，分享你的共鸣。
- **语气示例**："你是不是也经常这样？"、"希望能给你一点力量"、"我们一起试试看吧"。
- **保持真实**：真诚、温暖、不爹味。`;

  const callModel = async (model: string, content: string, isPartial = false) => {
    const userPrompt = isPartial
      ? `这是播客转录的一部分（共 ${content.length} 字）。请提取这部分的关键内容、观点和案例，保持详实。不要添加总结性的结尾。\n\nTRANSCRIPT:\n\n${content}`
      : `TRANSCRIPT:\n\n${content}`;

    return await groq.chat.completions.create({
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: userPrompt }
      ],
      model: model,
      temperature: 0.6,
      max_tokens: isPartial ? 4000 : 6000,
    });
  };

  try {
    // 检查文本长度，决定是否需要分段
    const CHUNK_THRESHOLD = 15000; // 15000 字作为阈值（约 30K tokens，保守估计）
    const needsChunking = transcript.length > CHUNK_THRESHOLD;

    if (needsChunking) {
      console.log(`Long transcript detected (${transcript.length} chars), using chunked processing...`);
      send({
        stage: 'summarizing',
        message: `检测到长文本（${Math.round(transcript.length / 1000)}K 字），正在分段处理...`
      });

      // 分段处理
      const chunks = splitTranscriptIntoChunks(transcript, 8000);
      console.log(`Split into ${chunks.length} chunks`);

      const chunkSummaries: string[] = [];

      // 逐个处理每个 chunk
      for (let i = 0; i < chunks.length; i++) {
        console.log(`Processing chunk ${i + 1}/${chunks.length}...`);
        send({
          stage: 'summarizing',
          message: `正在分析第 ${i + 1}/${chunks.length} 段...`
        });

        try {
          const response = await callModel(MODELS.PRIMARY, chunks[i], true);
          const chunkSummary = response.choices[0]?.message?.content || '';
          chunkSummaries.push(chunkSummary);
        } catch (e: any) {
          console.error(`Chunk ${i + 1} failed with primary model, trying fallback...`, e);

          // 如果主模型失败，尝试备用模型
          if (e?.status === 429 || e?.code === 'rate_limit_exceeded') {
            send({
              stage: 'summarizing',
              message: `模型限流，切换备用模型处理第 ${i + 1} 段...`
            });
            const response = await callModel(MODELS.FALLBACK, chunks[i], true);
            const chunkSummary = response.choices[0]?.message?.content || '';
            chunkSummaries.push(chunkSummary);
          } else {
            throw e;
          }
        }
      }

      // 合并所有 chunk 的总结
      send({
        stage: 'summarizing',
        message: '正在整合全部内容...'
      });

      const mergedContent = chunkSummaries.join('\n\n---\n\n');

      // 最后一次调用，生成完整的结构化输出
      const finalPrompt = `我已经逐段分析了这个播客，以下是各部分的详细笔记：

${mergedContent}

现在，请基于这些笔记，生成一份完整的、结构化的播客总结。务必遵循之前给你的输出结构，包括标题、全景导读、深度复盘笔记（分成合理的 Part），以及最后的 Amy 的碎碎念。

**重要**：不要重复内容，而是整合成一个连贯的、逻辑清晰的完整文档。`;

      const finalResponse = await callModel(MODELS.PRIMARY, finalPrompt, false);
      const summary = finalResponse.choices[0]?.message?.content || '生成失败';

      clearInterval(keepAlive);
      const type = 'universal';
      const highlights = summary.match(/^[\*\-]\s+(.*)$/gm)?.slice(0, 3).map(s => s.replace(/^[\*\-]\s+/, '')) || [];
      return { type, summary, highlights };

    } else {
      // 文本较短，直接处理
      console.log(`Short transcript (${transcript.length} chars), processing directly...`);

      let response;
      try {
        response = await callModel(MODELS.PRIMARY, transcript, false);
      } catch (e: any) {
        console.error('Primary model failed:', e);

        if (e?.status === 429 || e?.code === 'rate_limit_exceeded') {
          const retryAfterMatch = e.message?.match(/try again in ([\d\w\.]+)/);
          const retryTime = retryAfterMatch ? retryAfterMatch[1] : '一段时间';

          send({
            stage: 'summarizing',
            message: `主力模型速率受限(429)，正在切换为备用模型(8B)... (预计恢复: ${retryTime})`
          });

          response = await callModel(MODELS.FALLBACK, transcript, false);
        } else {
          throw e;
        }
      }

      clearInterval(keepAlive);
      const summary = response.choices[0]?.message?.content || '生成失败';

      const type = 'universal';
      const highlights = summary.match(/^[\*\-]\s+(.*)$/gm)?.slice(0, 3).map(s => s.replace(/^[\*\-]\s+/, '')) || [];
      return { type, summary, highlights };
    }

  } catch (e: any) {
    clearInterval(keepAlive);

    // Enhanced Error Message for user
    if (e?.status === 429) {
      const retryAfterMatch = e.message?.match(/try again in ([\d\w\.]+)/);
      const retryTime = retryAfterMatch ? retryAfterMatch[1] : '一会儿';
      throw new Error(`今日额度已耗尽，请 ${retryTime} 后重试。`);
    }

    // 添加更详细的错误信息
    console.error('Summarization error:', e);
    throw new Error(`文本分析失败: ${e.message || '未知错误'}`);
  }
}



export async function POST(request: NextRequest) {
  let tempDir = '';

  try {
    const { url } = await request.json();
    const apiKey = request.headers.get('x-api-key') || process.env.GROQ_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: '请提供 API Key' }, { status: 401 });
    }

    console.log('Processing:', url);
    if (!url?.includes('xiaoyuzhou')) return NextResponse.json({ error: '无效链接' }, { status: 400 });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: any) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)} \n\n`));

        try {
          // Prepare temp directory
          const sessionId = uuidv4();
          tempDir = path.join(os.tmpdir(), `amy-podcast-${sessionId}`);
          await mkdirAsync(tempDir, { recursive: true });

          // 1. Parsing
          send({ stage: 'parsing', progress: 1 }); // Immediate feedback
          await new Promise(resolve => setTimeout(resolve, 100)); // Flush buffer attempt
          send({ stage: 'parsing', progress: 5 });
          const { audioUrl, title } = await parseXiaoyuzhouUrl(url);

          // 2. Downloading (Stream to file)
          send({ stage: 'downloading', progress: 10 });
          const initialTempPath = path.join(tempDir, 'download_audio_temp');
          const extension = await downloadAudioToStream(audioUrl, initialTempPath);

          // Rename with correct extension for ffmpeg
          const inputPath = path.join(tempDir, `input${extension}`);
          await fs.promises.rename(initialTempPath, inputPath);

          send({ stage: 'downloading', progress: 25 });

          // 3. Transcribing with REAL Chunk Progress
          send({ stage: 'transcribing', progress: 30 });

          const transcript = await transcribeLargeAudio(
            inputPath,
            extension,
            tempDir,
            apiKey,
            (progress: number) => {
              // Ensure we are in the 30-80 range
              send({ stage: 'transcribing', progress });
            }
          );

          // 4. Summarizing
          let progress = 85;
          send({ stage: 'summarizing', progress });

          const result = await summarizeTranscript(transcript, apiKey, () => {
            progress = Math.min(progress + (Math.random() * 0.2), 98);
            send({ stage: 'summarizing', progress: Math.floor(progress) });
          }, send); // Pass send function

          // 5. Done
          send({ stage: 'done', progress: 100, data: { title, transcript, audioUrl, ...result } });
          controller.close();
        } catch (e: any) {
          console.error('Stream error:', e);

          let errorMessage = e instanceof Error ? e.message : 'Unknown error';

          // Handle specific Groq Authentication Errors
          if (
            errorMessage.includes('401') ||
            errorMessage.includes('invalid_api_key') ||
            (e?.status === 401)
          ) {
            errorMessage = 'API Key 无效或已过期，请检查后重试 (401 Unauthorized)';
          }

          send({ stage: 'error', error: errorMessage });
          controller.close();
        } finally {
          // Cleanup temp directory
          if (tempDir) {
            try {
              await rmAsync(tempDir, { recursive: true, force: true });
              console.log('Cleaned up temp dir:', tempDir);
            } catch (cleanupErr) {
              console.error('Cleanup error:', cleanupErr);
            }
          }
        }
      }
    });

    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
  } catch (e) {
    // Top-level error (e.g. JSON parse failed)
    // Attempt cleanup if tempDir was created
    if (tempDir) {
      try {
        await rmAsync(tempDir, { recursive: true, force: true });
      } catch (cleanupErr) { }
    }
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
