
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function GET(request: NextRequest) {
    const url = request.nextUrl.searchParams.get('url');

    if (!url) {
        return NextResponse.json({ error: 'Missing audio URL' }, { status: 400 });
    }

    try {
        const response = await axios.get(url, {
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            },
        });

        const headers = new Headers();
        headers.set('Content-Type', 'audio/mpeg');
        // Force download by setting Content-Disposition
        headers.set('Content-Disposition', 'attachment; filename="podcast.mp3"');

        // Create a ReadableStream from the node stream response
        const stream = new ReadableStream({
            start(controller) {
                response.data.on('data', (chunk: Buffer) => controller.enqueue(chunk));
                response.data.on('end', () => controller.close());
                response.data.on('error', (err: any) => controller.error(err));
            },
        });

        return new NextResponse(stream, { headers });
    } catch (error) {
        console.error('Proxy download error:', error);
        return NextResponse.json({ error: 'Failed to download audio' }, { status: 500 });
    }
}
