import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as Blob;
    if (!file) throw new Error('No file uploaded');

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString('base64');
    
    const prompt = `Analyze this SearchLift Deep Dive PDF report. Extract all actionable e-commerce issues (e.g., Missing Alt Text, Generic Titles, Missing Schema) and return them as a strict JSON array. Each issue should have: "id" (short lowercase string like "alttext" or "schema"), "title" (string), "desc" (string), "severity" ("HIGH", "MED", or "LOW"), and "icon" (an emoji). Return ONLY the valid JSON array.`;

    const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY || '',
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
      },
      body: JSON.stringify({ 
        model: 'claude-sonnet-4-6', 
        max_tokens: 4096, 
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64
              }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }] 
      }),
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

    const textContent = data.content?.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n') || '';
    const clean = textContent.replace(/```json|```/g, '').trim();
    const issues = JSON.parse(clean);

    return NextResponse.json({ issues });
  } catch (err: any) {
    console.error('PDF Parse Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
