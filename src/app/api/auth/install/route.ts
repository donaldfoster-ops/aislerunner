import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const STORE_URL = process.env.STORE_URL;
  const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;

  if (!STORE_URL || !CLIENT_ID) {
    return new NextResponse('Missing STORE_URL or SHOPIFY_CLIENT_ID in .env', { status: 400 });
  }

  const scopes = 'read_products,write_products,read_themes,write_themes,read_orders,write_orders,read_all_orders';
  const redirectUri = `http://localhost:3333/api/auth/callback`;
  const nonce = '1234567890'; // Simplified for this one-time script

  const installUrl = `https://${STORE_URL}/admin/oauth/authorize?client_id=${CLIENT_ID}&scope=${scopes}&redirect_uri=${redirectUri}&state=${nonce}&grant_options[]=`;

  return NextResponse.redirect(installUrl);
}
