// 감사·기도 나눔판 (Cloudflare Worker + D1)
// 성도는 교회 암호로 글을 쓰고 읽는다. 쓴 글은 관리자가 '올리기'를 눌러야 나눔판에 보인다.
// 비밀값(코드에 넣지 않음): CHURCH_CODE = 성도용 교회 암호, ADMIN_CODE = 관리자 암호
//   tools/share 폴더에서 `npx wrangler@4 secret put CHURCH_CODE` / `... ADMIN_CODE`
//
// GET  /posts                      승인된 글 (X-Church-Code)
// POST /posts {kind,name,text}     새 글 → 확인 대기 (X-Church-Code)
// POST /posts/:id/amen             '함께 기도해요' +1 (X-Church-Code)
// GET  /admin/posts                대기·승인·숨김 글 전체 (X-Admin-Code)
// POST /admin/posts/:id {status}   approved | hidden | pending (X-Admin-Code)

const ALLOWED_ORIGINS = [
    'https://h871203.github.io',
    'https://ansanhatbit.com',
    'https://www.ansanhatbit.com',
    'http://localhost:8765',
    'http://localhost:8771',
];
const KINDS = ['thanks', 'prayer'];
const STATUSES = ['pending', 'approved', 'hidden'];

function cors(origin) {
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Church-Code, X-Admin-Code',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
    };
}

function json(origin, body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...cors(origin), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
}

// 길이가 달라도 같은 시간에 비교 (암호 추측 방지)
function same(a, b) {
    a = String(a || ''); b = String(b || '');
    if (!a || !b) return false;
    let diff = a.length ^ b.length;
    for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    return diff === 0;
}

function clean(s, max) {
    return String(s || '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim().slice(0, max);
}

const PUBLIC_FIELDS = 'id, kind, name, text, amen, created';

export default {
    async fetch(request, env) {
        const origin = request.headers.get('Origin') || '';
        if (!ALLOWED_ORIGINS.includes(origin)) return new Response('Forbidden', { status: 403 });
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
        if (!env.CHURCH_CODE || !env.ADMIN_CODE) return json(origin, { error: 'not_ready' }, 503);

        const path = new URL(request.url).pathname.replace(/\/+$/, '');
        const isAdmin = path.startsWith('/admin/');
        const ok = isAdmin ? same(request.headers.get('X-Admin-Code'), env.ADMIN_CODE)
                           : same(request.headers.get('X-Church-Code'), env.CHURCH_CODE);
        if (!ok) return json(origin, { error: 'wrong_code' }, 401);

        let m;
        if (request.method === 'GET' && path === '/posts') {
            const { results } = await env.DB.prepare(
                `SELECT ${PUBLIC_FIELDS} FROM posts WHERE status = 'approved' ORDER BY created DESC LIMIT 100`).all();
            return json(origin, { posts: results });
        }
        if (request.method === 'POST' && path === '/posts') {
            const body = await request.json().catch(() => ({}));
            const kind = KINDS.includes(body.kind) ? body.kind : null;
            const text = clean(body.text, 500);
            const name = clean(body.name, 20);
            if (!kind || text.length < 2) return json(origin, { error: 'bad_input' }, 400);
            const waiting = await env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE status = 'pending'`).first();
            if (waiting.n >= 200) return json(origin, { error: 'too_many' }, 429);
            await env.DB.prepare(`INSERT INTO posts (kind, name, text, status, amen, created) VALUES (?, ?, ?, 'pending', 0, ?)`)
                .bind(kind, name, text, new Date().toISOString()).run();
            return json(origin, { ok: true }, 201);
        }
        if (request.method === 'POST' && (m = path.match(/^\/posts\/(\d+)\/amen$/))) {
            await env.DB.prepare(`UPDATE posts SET amen = amen + 1 WHERE id = ? AND status = 'approved'`).bind(+m[1]).run();
            const row = await env.DB.prepare(`SELECT amen FROM posts WHERE id = ?`).bind(+m[1]).first();
            return json(origin, { amen: row ? row.amen : 0 });
        }
        if (request.method === 'GET' && path === '/admin/posts') {
            const { results } = await env.DB.prepare(
                `SELECT id, kind, name, text, status, amen, created FROM posts WHERE status != 'hidden' OR created > ? ORDER BY created DESC LIMIT 200`)
                .bind(new Date(Date.now() - 30 * 86400000).toISOString()).all();
            return json(origin, { posts: results });
        }
        if (request.method === 'POST' && (m = path.match(/^\/admin\/posts\/(\d+)$/))) {
            const body = await request.json().catch(() => ({}));
            if (!STATUSES.includes(body.status)) return json(origin, { error: 'bad_input' }, 400);
            await env.DB.prepare(`UPDATE posts SET status = ? WHERE id = ?`).bind(body.status, +m[1]).run();
            return json(origin, { ok: true });
        }
        return json(origin, { error: 'not_found' }, 404);
    },
};
