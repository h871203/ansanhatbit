// 감사·기도 나눔판 (Cloudflare Worker + D1)
// 성도는 앱에 처음 들어올 때 넣은 이름으로 글을 쓰고, 글은 바로 나눔판에 보인다.
// 관리자는 관리자 암호로 들어와 맞지 않는 글을 내린다.
// 비밀값(코드에 넣지 않음): ADMIN_CODE = 관리자 암호
//   tools/share 폴더에서 `npx wrangler@4 secret put ADMIN_CODE`
//
// GET  /posts                      나눔판 글
// POST /posts {kind,name,text}     새 글 (바로 보임)
// POST /posts/:id/amen             '함께 기도해요' +1
// GET  /admin/posts                올라간 글과 최근 내린 글 (X-Admin-Code)
// POST /admin/posts/:id {status}   approved(다시 올리기) | hidden(내리기) (X-Admin-Code)
// POST /visit {device, view}        앱 사용 인원 (이름 없음, 하루·화면마다 한 번)
// GET  /admin/stats                 오늘·이번 주·이번 달 인원, 7일 그래프, 많이 본 화면 (X-Admin-Code)

const ALLOWED_ORIGINS = [
    'https://h871203.github.io',
    'https://ansanhatbit.com',
    'https://www.ansanhatbit.com',
    'http://localhost:8765',
    'http://localhost:8771',
];
const KINDS = ['thanks', 'prayer'];
const STATUSES = ['approved', 'hidden'];
const VISIT_VIEWS = ['app', 'home', 'bible', 'sermon', 'qt', 'prayer', 'church', 'bulletin', 'photos', 'share'];

// 한국 날짜 (UTC+9)
function koDay(offsetDays = 0) {
    return new Date(Date.now() + 9 * 3600000 - offsetDays * 86400000).toISOString().slice(0, 10);
}

function cors(origin) {
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Code',
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

        const path = new URL(request.url).pathname.replace(/\/+$/, '');
        if (path.startsWith('/admin/')) {
            if (!env.ADMIN_CODE) return json(origin, { error: 'not_ready' }, 503);
            if (!same(request.headers.get('X-Admin-Code'), env.ADMIN_CODE)) return json(origin, { error: 'wrong_code' }, 401);
        }

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
            if (!kind || !name || text.length < 2) return json(origin, { error: 'bad_input' }, 400);
            // 도배 막기: 10분 동안 전체 20개까지
            const recent = await env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE created > ?`)
                .bind(new Date(Date.now() - 10 * 60000).toISOString()).first();
            if (recent.n >= 20) return json(origin, { error: 'too_many' }, 429);
            await env.DB.prepare(`INSERT INTO posts (kind, name, text, status, amen, created) VALUES (?, ?, ?, 'approved', 0, ?)`)
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
        if (request.method === 'POST' && path === '/visit') {
            const body = await request.json().catch(() => ({}));
            const device = String(body.device || '');
            const view = VISIT_VIEWS.includes(body.view) ? body.view : null;
            if (!/^[a-z0-9]{16,40}$/.test(device) || !view) return json(origin, { error: 'bad_input' }, 400);
            await env.DB.prepare(`INSERT OR IGNORE INTO visits (day, device, view) VALUES (?, ?, ?)`)
                .bind(koDay(), device, view).run();
            return json(origin, { ok: true });
        }
        if (request.method === 'GET' && path === '/admin/stats') {
            const today = koDay(), week = koDay(6), month = today.slice(0, 8) + '01';
            const count = (from) => env.DB.prepare(
                `SELECT COUNT(DISTINCT device) AS n FROM visits WHERE view = 'app' AND day >= ? AND day <= ?`).bind(from, today).first();
            const [t, w, mo, daily, views] = await Promise.all([
                count(today), count(week), count(month),
                env.DB.prepare(`SELECT day, COUNT(DISTINCT device) AS n FROM visits WHERE view = 'app' AND day >= ? GROUP BY day`).bind(week).all(),
                env.DB.prepare(`SELECT view, COUNT(DISTINCT device) AS n FROM visits WHERE view != 'app' AND day >= ? GROUP BY view ORDER BY n DESC`).bind(koDay(29)).all(),
            ]);
            const byDay = Object.fromEntries(daily.results.map((r) => [r.day, r.n]));
            const days = [];
            for (let i = 6; i >= 0; i--) { const d = koDay(i); days.push({ day: d, n: byDay[d] || 0 }); }
            return json(origin, { today: t.n, week: w.n, month: mo.n, days, views: views.results });
        }
        return json(origin, { error: 'not_found' }, 404);
    },
};
