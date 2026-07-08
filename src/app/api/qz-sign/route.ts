import { NextResponse } from 'next/server';
import crypto from 'crypto';

// QZ Tray Demo Private Key
const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC0z9FeMynsC8+u
dvX+LciZxnh5uRj4C9S6tNeeAlIGCfQYk0zUcNFCoCkTknNQd/YEiawDLNbxBqut
bMDZ1aarys1a0lYmUeVLCIqvzBkPJTSQsCopQQ9V8WuT252zzNzs68dVGNdCJd5J
NRQykpwexmnjPPv0mvj7i8XgG379TyW6P+WWV5okeUkXJ9eJS2ouDYdR2SM9BoVW
+FgxDu6BmXhozW5EfsnajFp7HL8kQClI0QOc79yuKl3492rH6bzFsFn2lfwWy9ic
7cP8EpCTeFp1tFaD+vxBhPZkeTQ1HKx6hQ5zeHIB5ySJJZ7af2W8r4eTGYzbdRW2
4DDHCPhZAgMBAAECggEATvofR3gtrY8TLe+ET3wMDS8l3HU/NMlmKA9pxvjYfw7F
8h4VBw4oOWPfzU7A07syWJUR72kckbcKMfw42G18GbnBrRQG0UIgV3/ppBQQNg9Y
QILSR6bFXhLPnIvm/GxVa58pOEBbdec4it2Gbvie/MpJ4hn3K8atTqKk0djwxQ+b
QNBWtVgTkyIqMpUTFDi5ECiVXaGWZ5AOVK2TzlLRNQ5Y7US8lmGxVWzt0GONjXSE
iO/eBk8A7wI3zknMx5o1uZa/hFCPQH33uKeuqU5rmphi3zS0BY7iGY9EoKu/o+BO
HPwLQJ3wCDA3O9APZ3gmmbHFPMFPr/mVGeAeGP/BAQKBgQDaPELRriUaanWrZpgT
VnKKrRSqPED3anAVgmDfzTQwuR/3oD506F3AMBzloAo3y9BXmDfe8qLn6kgdZQKy
SFNLz888at96oi+2mEKPpvssqiwE6F3OtEM6yv4DP9KJHaHmXaWv+/sjwjzpFNjs
wGThBxFvrTWRJqBYsM1XNJJ2EQKBgQDUGbTSwHKqRCYWhQ1GPCZKE98l5UtMKvUb
hyWWOXoyoeYbJEMfG1ynX4JeXIkl6YtBjYCqszv9PjHa1rowTZaAPJ0V70zyhTcF
t581ii9LpiejIGrELHvJnW87QmjjStkjwGIqgKLp7Qe6CDjHI9HP1NM0uav/IQLW
pB6wyEz1yQKBgQCuxPut+Ax2rzM05KB9PAnWzO1zt3U/rtm8IAF8uVVGf7r+EDJ0
ZXJO6zj5G8WTEYHz5E86GI4ltBW0lKQoKouqdu27sMrv5trXG/CSImOcTVubQot9
chc1CkOKTp5IeJajafO6j817wZ4N+0gNsbYYEBUCnm/7ojdfT5ficpOoQQKBgQDB
PgKPmaNfGeQR1Ht5qEfCakR/RF/ML79Nq15FdmytQPBjfjBhYQ6Tt+MRkgGqtxOX
UBMQc2iOnGHT3puYcrhScec1GufidhjhbqDxqMrag7HNYDWmMlk+IeA7/4+Mtp8L
gbZuvvCvbLQDfIYueaYpUuBzQ08/jZYGdVU4/+WOcQKBgAGUN0kIB6EM1K/iZ0TN
jlt8P5UEV3ZCyATWFiGZRhhE2WAh8gv1jx4J26pcUs1n8sd2a1h6ZuBSqsyIlNSp
xtKsm3bqQFDHRrPcsBX4nanrw9DzkpH1k/I3WMSdGqkDAR3DtL7yXTJXJo2Sbrp5
EjzSn7DcDE1tL2En/tSVXeUY
-----END PRIVATE KEY-----`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const requestVal = body.request;
    
    if (!requestVal) {
      return NextResponse.json({ error: 'Missing "request" body parameter.' }, { status: 400 });
    }

    const sign = crypto.createSign('RSA-SHA512');
    sign.update(requestVal);
    const signature = sign.sign(PRIVATE_KEY, 'base64');

    return new Response(signature, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  } catch (err: any) {
    console.error('QZ Sign Error:', err);
    return NextResponse.json({ error: err.message || 'Internal signing error' }, { status: 500 });
  }
}
