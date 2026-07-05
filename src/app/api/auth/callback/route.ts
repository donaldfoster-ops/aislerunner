import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const shop = url.searchParams.get('shop');

  const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
  const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;

  if (!code || !shop || !CLIENT_ID || !CLIENT_SECRET) {
    return new NextResponse('Missing required OAuth parameters', { status: 400 });
  }

  try {
    const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
      }),
    });

    const data = await response.json();

    if (data.access_token) {
      return new NextResponse(`
        <html>
          <body style="font-family: sans-serif; padding: 40px; background: #0f0f12; color: #f0f0f5;">
            <div style="max-width: 600px; margin: 0 auto; background: #1a1a20; padding: 20px; border-radius: 8px; border: 1px solid #333;">
              <h1 style="color: #3dd9c0;">Success!</h1>
              <p>Your permanent offline access token has been generated.</p>
              <div style="background: #000; padding: 15px; border-radius: 4px; margin: 20px 0; word-break: break-all;">
                <code style="color: #e8c547; font-size: 16px;">${data.access_token}</code>
              </div>
              <p><strong>Next Steps:</strong></p>
              <ol style="line-height: 1.6;">
                <li>Copy the token above.</li>
                <li>Open your <code>.env</code> file.</li>
                <li>Set <code>SHOPIFY_TOKEN=</code> to the token above.</li>
                <li>Restart your <code>npm run dev</code> server.</li>
              </ol>
            </div>
          </body>
        </html>
      `, { headers: { 'Content-Type': 'text/html' } });
    } else {
      return new NextResponse(`Error generating token: ${JSON.stringify(data)}`, { status: 500 });
    }
  } catch (error: any) {
    return new NextResponse(`Error: ${error.message}`, { status: 500 });
  }
}
