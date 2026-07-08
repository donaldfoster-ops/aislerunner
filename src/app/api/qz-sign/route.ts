import { NextResponse } from 'next/server';
import crypto from 'crypto';

// QZ Tray Demo Private Key (Custom trust key pair)
const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDWy/Uix4tfqGyo
3Ve/3vgrVmk6LeZbfrfIRQax+qsvdZcqniiH1bZaAgEd8whkpl0QG5+AiNrIdRyB
dYH5iHkbqe3Ne8l3GUUB4Jk2JoE3deXBBzKVoIanFYqgaZBc7aY3clpJ5JXsXNgz
AW6qGppq1v4RG5raqwvt0ILnpZuHdGSuYUCK+oK8Hoyhv1j1znYPoM3eKIfjjpcI
CYnXKO5J76vYUBVTiINE+r9YCNkLhtioa4uYC1L7AxL+aIHMCkDPNUN1yMN9DT6P
ao2TjUBo0VZDweo/C88tXlI/Jtx4ED0YW+BjUqLtcGctqc6yJejma6tqmWLTWiKm
F/DwplfZAgMBAAECggEADMjfepY3brZi30srX6V5DnVKdpbITP5WGIK5QwspOL4u
RPBcd7dJ7wILCHoQcBMx21VVkUwz/3XvACqbFZvgn3umBpK9W0wi/hlc7SruCnvH
NM3Fnj/Le/LtiR43ZDyV5dt10cub+9FL4f9OE6xZMA5DWYfT1/uRznIYdIq4Ht/7
7qbwe6aAD49Q5rgNwJNYoowGCG1H1e50tfKjDGLHRi0cWNphWg8qsSl4i5mm43bH
jRAepOTx532XEZcFeKZn2bv5RHejXs/SeYUXnqY3nMWdQs19RuqJSu1n14You8Rd
8XG7/9o8sfuol2iej+5mtCEYFSo3/8DDRnemB+2tYQKBgQD4rb43Z7TnvZRboS6K
01QQdvNDRNkk0SfJtS2xgfhNzy85MeGpS65qPmnAuKzcog13iBkLXFv+3wgVVZUZ
ZXj6LQSb3c8qX837GZsNtQDpxRtEvJqczj9mwvStM1hzvP78g9JAIfdwucwn4ygH
7pK3K4ct82BKuSimIs/3O7nXSQKBgQDdHtnLMfDhuKuIf71zaU0VQgFTxQOzQYDt
4bWAfNdDZ62HaFDG/uBESTe+J4JH6O4Mn6WGDobVJ8cKxfmuewTQjxInXA/88Dah
iFA4bvD+x7nwOhsS8GijlQJHWYsGTzNVGfs3T02bnosfgY4qatkHyp+yl2CoRfur
UtYDBVqsEQKBgFG03GPd6j2eN4mnuuAYMW27d5AppeMH6bfHlLzXBFukcFKthgSW
/jagTSTqSLmxcRVOHVRzQzLJ2yEPXo7anVYtxm7kATZeBhKzxhNJ3oPwpFYAVhih
V4mPEs95qF1Wwrz7HvC9eEyMb3zHkRaSF5ihb6f0aDYFAksb8xK7iAMpAoGAahB+
T+Vosh0uyo7bhRyhiOzcTh5WpAlrmq+FrFg1uXNl3WnANXPUh2zHfELfTzb/2LZL
Y35cVqp540ULexIvQQsfnhme4akny1vjfu5YUx3ipsR4cCE5UB4NtcPR1/jtmoiX
4/P6OgdWnIo8c0RFTmN3LudFyfGnwoo9db1/vMECgYEA9Dc6keZkKBgkRb1EhDCG
aoaE8oXoqDXTgchM2hu2pZlqIZuYlTzTtbW+FgcsfCpvvOqheUpf5h+iwN5DSLyH
4aJd09JtlG/uDr1gbmNA6RodCHq+44BfESsXZE9xDM37uzAkDtfNdG/+yUWEn1sZ
DEf9OgU2QhzfWljteYy3LXE=
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
