
import { NextRequest, NextResponse } from 'next/server';
import ffmpeg from 'fluent-ffmpeg';
import axios from 'axios';
import { PassThrough } from 'stream';

// Set max execution time to 5 minutes for conversion
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const url = searchParams.get('url');
    const filename = searchParams.get('filename') || 'podcast';

    if (!url) {
        return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }

    try {
        // Fetch the source audio stream
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            },
            timeout: 30000 // Connection timeout
        });

        // Create a PassThrough stream to pipe ffmpeg output into
        const passThrough = new PassThrough();

        // Start ffmpeg conversion
        ffmpeg(response.data)
            .format('mp3')
            .audioCodec('libmp3lame')
            .audioBitrate(128) // Standard quality for speech
            .on('error', (err) => {
                console.error('FFmpeg conversion error:', err);
                // Note: If headers are already sent, we can't send a JSON error here. 
                // The stream will simply close, which the client will see as a network error.
            })
            .pipe(passThrough);

        // Prepare headers for download
        const headers = new Headers();
        headers.set('Content-Type', 'audio/mpeg');
        // Ensure filename is safe and ends in .mp3
        const safeFilename = filename.replace(/[<>:"/\\|?*]+/g, '_');
        headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(safeFilename)}.mp3"`);

        // Return the stream
        // Using "as any" because Next.js types for BodyInit are strict but Node streams are supported in Node runtime
        return new NextResponse(passThrough as any, {
            headers,
            status: 200,
        });

    } catch (error) {
        console.error('Proxy audio error:', error);
        return NextResponse.json(
            { error: 'Failed to process audio' },
            { status: 500 }
        );
    }
}
