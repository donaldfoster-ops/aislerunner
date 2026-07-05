import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
    if (!ANTHROPIC_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_KEY environment variable is not set' }, { status: 500 });
    }

    const { messages, system, max_tokens = 2000, model = 'claude-sonnet-4-6' } = await req.json();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
      },
      body: JSON.stringify({ model, max_tokens, system, messages }),
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

    const text = data.content?.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n') || '';
    return NextResponse.json({ text });

  } catch (err: any) {
    console.error('Claude error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
