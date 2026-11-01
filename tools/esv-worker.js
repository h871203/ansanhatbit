// ESV 중계 (Cloudflare Worker)
// 앱은 키 없이 이 Worker에 본문을 요청하고, Worker가 비밀로 보관한 ESV API 키를 붙여 api.esv.org 에 대신 요청한다.
// 설정: Cloudflare 대시보드 → 이 Worker → Settings → Variables and Secrets → Secret 'ESV_API_KEY' 에 키 입력
// 요청 예: https://<worker 주소>/?q=John%203:16-18

const ALLOWED_ORIGINS = [
    'https://h871203.github.io',
    'https://ansanhatbit.com',
    'https://www.ansanhatbit.com',
    'http://localhost:8765',
    'http://localhost:8771',
];

// 앱에서 쓰는 옵션만 통과시킴
const ALLOWED_PARAMS = [
    'q', 'include-passage-references', 'include-verse-numbers', 'include-first-verse-numbers',
    'include-footnotes', 'include-footnote-body', 'include-headings', 'include-short-copyright',
    'include-copyright', 'include-selahs', 'indent-paragraphs', 'indent-poetry', 'indent-declares',
    'indent-psalm-doxology', 'indent-poetry-lines', 'indent-using',
];

function corsHeaders(origin) {
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
    };
}

export default {
    async fetch(request, env) {
        const origin = request.headers.get('Origin') || '';
        if (!ALLOWED_ORIGINS.includes(origin)) {
            return new Response('Forbidden', { status: 403 });
        }
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders(origin) });
        }
        if (request.method !== 'GET') {
            return new Response('Method Not Allowed', { status: 405, headers: corsHeaders(origin) });
        }

        const url = new URL(request.url);
        const q = url.searchParams.get('q') || '';
        if (!q || q.length > 80) {
            return new Response('Bad Request', { status: 400, headers: corsHeaders(origin) });
        }
        const params = new URLSearchParams();
        for (const name of ALLOWED_PARAMS) {
            const v = url.searchParams.get(name);
            if (v !== null) params.set(name, v);
        }

        const res = await fetch('https://api.esv.org/v3/passage/text/?' + params, {
            headers: { Authorization: 'Token ' + env.ESV_API_KEY },
        });
        return new Response(res.body, {
            status: res.status,
            headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' },
        });
    },
};
