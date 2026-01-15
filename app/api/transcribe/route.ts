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

async function downloadAudio(url: string): Promise<{ buffer: Buffer; extension: string }> {
  console.log('Downloading audio from:', url);
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 60000 // 60s timeout for audio download (it can be large)
    });

    let extension = '.mp3';
    try {
      const urlPath = new URL(url).pathname;
      if (urlPath.endsWith('.m4a')) extension = '.m4a';
      if (urlPath.endsWith('.mp4')) extension = '.mp4';
      if (urlPath.endsWith('.wav')) extension = '.wav';
    } catch (e) { }

    console.log(`Downloaded ${response.data.length} bytes, ext: ${extension}`);
    return { buffer: Buffer.from(response.data), extension };
  } catch (error) {
    console.error('Download failed:', error instanceof Error ? error.message : String(error));
    if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
      throw new Error('下载音频超时，请重试');
    }
    throw new Error('下载音频失败');
  }
}

// Low-level single file transcription
async function transcribeSingleFile(filePath: string, apiKey: string): Promise<string> {
  // Groq API expects a File-like object or ReadStream. 
  // For fs.createReadStream, Groq SDK handles it automatically in Node.
  console.log('Transcribing chunk:', path.basename(filePath));

  const groq = new Groq({ apiKey });

  const stream = fs.createReadStream(filePath);
  const transcription = await groq.audio.transcriptions.create({
    file: stream,
    model: 'whisper-large-v3-turbo',
    language: 'zh',
    response_format: 'text',
  });
  return transcription as unknown as string;
}

// Robust Chunking Transcriber
async function transcribeLargeAudio(
  buffer: Buffer,
  originalExt: string,
  apiKey: string,
  onProgress: (percent: number) => void
): Promise<string> {
  const sessionId = uuidv4();
  const tempDir = path.join(os.tmpdir(), `amy-podcast-${sessionId}`);
  await mkdirAsync(tempDir, { recursive: true });

  const inputPath = path.join(tempDir, `input${originalExt}`);
  await writeFileAsync(inputPath, buffer);

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

  } finally {
    // Cleanup
    try {
      await rmAsync(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.error('Cleanup error:', e);
    }
  }
}

async function summarizeTranscript(
  transcript: string,
  apiKey: string,
  onHeartbeat: () => void,
  send: (data: any) => void
): Promise<any> {
  const keepAlive = setInterval(onHeartbeat, 3000);
  const groq = new Groq({ apiKey });

  // Common Footer Instruction: The 10% Persona
  const footerInstruction = `
最后，必须以【Amy 的碎碎念】作为结尾。
这是全篇唯一展露"Amy"个人性格的地方。
**请务必基于以下"Amy"的人设，写一段给屏幕前这位朋友（读者）的话：**
*   **基本信息**：24岁女性，INFP，你的 Digital Partner。
*   **核心要求**：
    *   **拒绝自言自语**：不要光说"我觉得..."、"我以前..."。
    *   **建立连接 (Interaction)**：要多用**"你"**和**"我们"**。就像深夜给好朋友发微信，问候TA的状态，分享你的共鸣。
    *   **语气示例**："你是不是也经常这样？"、"希望能给你一点力量"、"我们一起试试看吧"。
    *   **保持真实**：真诚、温暖、不爹味。`;

  const sysPrompt = `你是 **Talk Essence (Amy)**。
你的用户是一位求知欲强但时间有限的朋友。TA 希望通过这份笔记，**不仅能还原播客的完整细节，还能无痛读懂其中的硬核知识**。

**核心原则 (The Reconstruction & Scaffolding Protocol)**：
1.  **高保真复原 (Retention)**：
    *   绝不要把内容压缩成简单的 Bullet Points。要按**对话逻辑流**，还原完整论述。
    *   遇到嘉宾的精彩观点、具体案例、书名、数据，**必须详尽记录**。
2.  **智能降维 (Translation)**：
    *   **自主判断**：遇到专业术语、抽象理论或晦涩难懂的表达时，请自动触发说明机制。
    *   **通俗解释**：用生活化的比喻（"就像..."）把复杂的概念讲清楚。如果内容很简单，则不需要强行解释。
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
${footerInstruction}`;

  const callModel = async (model: string) => {
    return await groq.chat.completions.create({
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: `TRANSCRIPT:\n\n${transcript}` }
      ],
      model: model,
      temperature: 0.6,
      max_tokens: 6000, // 8b model max output might be smaller, but SDK usually handles request? No, max completion tokens. 8k context window usually supports decent output.
    });
  };

  try {
    let response;
    try {
      console.log(`Attempting summary with PRIMARY model: ${MODELS.PRIMARY}`);
      response = await callModel(MODELS.PRIMARY);
    } catch (e: any) {
      console.error('Primary model failed:', e);

      // Check for Rate Limit (429)
      if (e?.status === 429 || e?.code === 'rate_limit_exceeded') {
        const retryAfterMatch = e.message?.match(/try again in ([\d\w\.]+)/);
        const retryTime = retryAfterMatch ? retryAfterMatch[1] : '一段时间';

        // Notify user about the fallback
        send({
          stage: 'summarizing',
          message: `主力模型速率受限 (429)，正在切换为备用模型 (8B)... (预计恢复: ${retryTime})`
        });

        console.log(`Switching to FALLBACK model: ${MODELS.FALLBACK}`);
        response = await callModel(MODELS.FALLBACK);
      } else {
        throw e; // Throw other errors directly
      }
    }

    clearInterval(keepAlive);
    const summary = response.choices[0]?.message?.content || '生成失败';

    // Use a generic 'universal' type for the result
    const type = 'universal';
    const highlights = summary.match(/^[\*\-]\s+(.*)$/gm)?.slice(0, 3).map(s => s.replace(/^[\*\-]\s+/, '')) || [];
    return { type, summary, highlights };

  } catch (e: any) {
    clearInterval(keepAlive);

    // Enhanced Error Message for user
    if (e?.status === 429) {
      const retryAfterMatch = e.message?.match(/try again in ([\d\w\.]+)/);
      const retryTime = retryAfterMatch ? retryAfterMatch[1] : '一会儿';
      throw new Error(`今日额度已耗尽，请 ${retryTime} 后重试。`);
    }

    throw e;
  }
}


export async function POST(request: NextRequest) {
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
        const send = (data: any) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

        try {
          // 1. Parsing
          send({ stage: 'parsing', progress: 1 }); // Immediate feedback
          await new Promise(resolve => setTimeout(resolve, 100)); // Flush buffer attempt
          send({ stage: 'parsing', progress: 5 });
          const { audioUrl, title } = await parseXiaoyuzhouUrl(url);

          // 2. Downloading
          send({ stage: 'downloading', progress: 10 });
          const { buffer, extension } = await downloadAudio(audioUrl);
          send({ stage: 'downloading', progress: 25 });

          // 3. Transcribing with REAL Chunk Progress
          send({ stage: 'transcribing', progress: 30 });

          const transcript = await transcribeLargeAudio(buffer, extension, apiKey, (progress) => {
            // Ensure we are in the 30-80 range
            send({ stage: 'transcribing', progress });
          });

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
        }
      }
    });

    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
  } catch (e) {
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
