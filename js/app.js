(function () {
    'use strict';

    // ---------- 공통 도우미 ----------
    var store = {
        get: function (key, fallback) {
            try {
                var v = localStorage.getItem(key);
                return v === null ? fallback : JSON.parse(v);
            } catch (e) { return fallback; }
        },
        set: function (key, value) {
            try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 저장 불가 환경 */ }
        }
    };

    function $(id) { return document.getElementById(id); }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function parseDate(s) { var p = s.split('-'); return new Date(+p[0], p[1] - 1, +p[2]); }
    var WEEK = ['일', '월', '화', '수', '목', '금', '토'];
    function koDate(s) {
        var d = typeof s === 'string' ? parseDate(s) : s;
        return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + WEEK[d.getDay()] + ')';
    }
    function dayOfYear(d) {
        return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(d.getFullYear(), 0, 1)) / 86400000);
    }
    function timeLabel(hhmm) {
        var h = +hhmm.split(':')[0], m = hhmm.split(':')[1];
        return (h < 12 ? '오전 ' : '오후 ') + (h % 12 === 0 ? 12 : h % 12) + ':' + m;
    }

    function loadJson(name) {
        return fetch('data/' + name + '.json', { cache: 'no-cache' })
            .then(function (r) { if (!r.ok) throw new Error(name); return r.json(); })
            .catch(function () { return null; });
    }

    var data = {};

    // ---------- 글자 크기 ----------
    var FONT_SIZES = ['normal', 'large', 'xlarge'];
    function applyFont(size) { document.documentElement.setAttribute('data-font', size); }
    applyFont(store.get('fontSize', 'normal'));
    $('fontBtn').addEventListener('click', function () {
        var cur = store.get('fontSize', 'normal');
        var next = FONT_SIZES[(FONT_SIZES.indexOf(cur) + 1) % FONT_SIZES.length];
        store.set('fontSize', next);
        applyFont(next);
    });

    // ---------- 화면 이동 ----------
    var VIEWS = ['home', 'bible', 'sermon', 'qt', 'prayer', 'church', 'bulletin', 'photos', 'share', 'share-admin'];
    function route() {
        var name = (location.hash || '#home').slice(1);
        if (VIEWS.indexOf(name) < 0) name = 'home';
        VIEWS.forEach(function (v) { $('view-' + v).hidden = v !== name; });
        document.querySelectorAll('.tabbar a').forEach(function (a) {
            a.classList.toggle('active', a.dataset.tab === name);
        });
        if (name === 'bible') showChapter(); // iframe은 성경 화면을 열 때 불러옴
        else { stopSpeech(); $('kjvAudio').pause(); }
        if (name !== 'photos') showAlbum(null);
        if (name === 'share') openShare();
        if (name === 'share-admin') openAdmin();
        window.scrollTo(0, 0);
    }
    window.addEventListener('hashchange', route);

    // ---------- 홈 ----------
    // 찬송: 주보 예배 순서의 'N장'을 뽑아 유튜브로 연결 (가사는 저작권 때문에 앱에 넣지 않음)
    function hymnUrl(n) { return 'https://www.youtube.com/results?search_query=' + encodeURIComponent('새찬송가 ' + n + '장'); }
    function hymnsOf(service) {
        var list = [];
        (service && service.order || []).forEach(function (r) {
            if (!r.item || r.item.indexOf('찬송') < 0) return;
            (String(r.detail || '').match(/\d{1,3}(?=장)/g) || []).forEach(function (n) { list.push({ n: +n, item: r.item }); });
        });
        return list;
    }
    // 앱 안 찬송 재생: data/hymns.json 에 영상이 있는 번호는 플레이어로, 없으면 유튜브 검색
    function hymnVideo(n) { var h = data.hymns && data.hymns.hymns; return h && h[String(n)]; }
    var hpList = [], hpIndex = 0;
    function openHymn(list, i) {
        hpList = list; hpIndex = i;
        var n = list[i], v = hymnVideo(n);
        $('hpNum').textContent = n + '장';
        $('hpTitle').textContent = v ? v.t : '';
        $('hpFrame').src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(v.v) + '?autoplay=1&rel=0&playsinline=1';
        $('hpYoutube').href = 'https://www.youtube.com/watch?v=' + encodeURIComponent(v.v);
        $('hpPrev').disabled = i === 0;
        $('hpNext').disabled = i === list.length - 1;
        $('hymnPlayer').hidden = false;
        document.body.style.overflow = 'hidden';
    }
    function closeHymn() {
        $('hymnPlayer').hidden = true;
        $('hpFrame').src = 'about:blank';
        document.body.style.overflow = '';
    }
    $('hpClose').addEventListener('click', closeHymn);
    $('hpPrev').addEventListener('click', function () { if (hpIndex > 0) openHymn(hpList, hpIndex - 1); });
    $('hpNext').addEventListener('click', function () { if (hpIndex < hpList.length - 1) openHymn(hpList, hpIndex + 1); });
    $('hymnPlayer').addEventListener('click', function (e) { if (e.target === this) closeHymn(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('hymnPlayer').hidden) closeHymn(); });
    // 찬송 번호 링크(data-hymn)를 누르면: 영상이 있으면 앱 안에서, 그 묶음(data-hymns) 안에서 앞뒤로 넘김
    document.addEventListener('click', function (e) {
        var a = e.target.closest('[data-hymn]');
        if (!a || !hymnVideo(a.dataset.hymn)) return;
        e.preventDefault();
        var box = a.closest('[data-hymn-group]') || document;
        var list = [].map.call(box.querySelectorAll('[data-hymn]'), function (x) { return +x.dataset.hymn; })
            .filter(function (n, i, arr) { return hymnVideo(n) && arr.indexOf(n) === i; });
        openHymn(list, Math.max(0, list.indexOf(+a.dataset.hymn)));
    });

    function renderHomeHymns() {
        var c = data.church || {}, b = bulletins()[0];
        var sv = b && (b.services || [])[0];
        var hymns = hymnsOf(sv);
        $('homeHymns').hidden = !hymns.length;
        if (hymns.length) {
            $('homeHymnWhen').textContent = (+b.date.slice(5, 7)) + '월 ' + (+b.date.slice(8)) + '일 ' + (sv.name || '');
            $('homeHymnList').innerHTML = hymns.map(function (h) {
                var v = hymnVideo(h.n);
                return '<a class="hymn-chip" target="_blank" rel="noopener" data-hymn="' + h.n + '" href="' + hymnUrl(h.n) + '"><b>' + h.n + '장</b>' +
                    (v ? '<span class="hc-title">' + esc(v.t) + '</span>' : '') + '<small>' + esc(h.item) + '</small></a>';
            }).join('');
            var pl = (b && b.hymnPlaylist) || c.hymnPlaylist;
            $('homeHymnAll').hidden = !pl;
            if (pl) $('homeHymnAll').href = pl;
        }
        $('homeYoutube').hidden = !c.youtubeChannel;
        if (c.youtubeChannel) $('homeYoutube').href = c.youtubeChannel;
    }

    // 다음 예배: church.json worship 중 day·at 이 있는 것에서 지금 이후 가장 가까운 것
    function nextWorship(now) {
        var list = ((data.church && data.church.worship) || []).filter(function (w) { return w.day != null && w.at; });
        var best = null;
        list.forEach(function (w) {
            var hm = w.at.split(':');
            for (var d = 0; d < 8; d++) {
                var t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, +hm[0], +hm[1]);
                if (t.getDay() === w.day && t > now) { if (!best || t < best.at) best = { w: w, at: t }; break; }
            }
        });
        return best;
    }
    function renderNextWorship() {
        var n = nextWorship(new Date());
        if (!n) { $('nextWhen').textContent = '주일 오전 11:00'; $('nextWhat').textContent = '주일 오전 예배'; return; }
        var today = new Date(), dd = Math.round((new Date(n.at.getFullYear(), n.at.getMonth(), n.at.getDate()) - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
        var day = dd === 0 ? '오늘' : dd === 1 ? '내일' : koDate(n.at);
        $('nextWhen').textContent = day + ' ' + timeLabel(n.w.at);
        $('nextWhat').textContent = n.w.name + (dd > 1 ? '' : ' · ' + koDate(n.at));
    }

    function renderHome() {
        var c = data.church || {};
        var now = new Date();
        $('todayLabel').textContent = now.getFullYear() + '년 ' + koDate(now);
        $('churchName').textContent = c.name || '안산햇빛교회';
        $('heroTitle').textContent = c.name || '안산햇빛교회';
        $('homeSub').textContent = [c.denomination, c.pastor && '담임목사 ' + c.pastor.replace(/\s*목사$/, '')].filter(Boolean).join(' · ');
        renderNextWorship();
        renderHomeHymns();

        var plan = Bible.planForDay(dayOfYear(now));
        if (plan.length) $('homePlan').textContent = planRangeLabel(plan);

        var s = sermons()[0];
        if (s) $('homeSermon').textContent = s.title;

        var b = bulletins()[0];
        if (b) $('homeBulletin').textContent = (+b.date.slice(5, 7)) + '월 ' + (+b.date.slice(8)) + '일 주보';
        var a = albums()[0];
        if (a) $('homePhotos').textContent = a.title;

        $('homeTimes').innerHTML = (c.worship || []).map(function (w) {
            return '<div><dt>' + esc(w.name) + '</dt><dd>' + esc(w.time) + '</dd></div>';
        }).join('');
        $('homeAddr').textContent = c.address || '';
        $('homePhone').textContent = c.phone || '';
        $('homeMap').href = c.mapUrl || '#church';
        $('homeFoot').innerHTML = (c.goal ? '<p>' + esc(c.goal) + '</p>' : '') +
            '<p>' + [c.founded && '<span class="nowrap">' + esc(c.founded.replace(/^(\d+)-0?(\d+)-0?(\d+)$/, '$1년 $2월 $3일')) + ' 설립</span>']
                .concat((c.motto || []).map(function (m) { return '<span class="nowrap">' + esc(m) + '</span>'; })).filter(Boolean).join(' · ') + '</p>';

        var notices = (data.news && data.news.notices) || [];
        $('homeNews').innerHTML = notices.slice(0, 3).map(function (n) {
            return '<li>' + esc(n.title) + '</li>';
        }).join('') || '<li class="muted">새 소식이 없습니다</li>';
    }
    $('homeCopyPhone').addEventListener('click', function () {
        var btn = this, label = btn.querySelector('span'), num = $('homePhone').textContent;
        var done = function () { label.textContent = '복사했어요'; setTimeout(function () { label.textContent = '번호 복사'; }, 2000); };
        var fallback = function () { var r = document.createRange(); r.selectNodeContents($('homePhone')); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); };
        if (navigator.clipboard) navigator.clipboard.writeText(num).then(done, fallback); else fallback();
    });

    // ---------- 기도 알림 ----------
    function prayerTimes() { return (data.church && data.church.prayerTimes) || ['10:00', '22:00']; }
    function prayerMessage() { return (data.church && data.church.prayerMessage) || '지금은 교회를 위해 기도하는 시간입니다.'; }

    function nextPrayer(now) {
        var times = prayerTimes().slice().sort();
        for (var day = 0; day < 2; day++) {
            for (var i = 0; i < times.length; i++) {
                var hm = times[i].split(':');
                var t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day, +hm[0], +hm[1]);
                if (t > now) return { time: times[i], at: t };
            }
        }
        return null;
    }

    function renderPrayerTimes() {
        var html = prayerTimes().map(function (t) {
            return '<div class="ptime"><strong>' + timeLabel(t) + '</strong><span>기도 알림</span></div>';
        }).join('');
        $('homePrayerTimes').innerHTML = html;
        $('prayerTimesBig').innerHTML = html;
        $('prayerMessage').textContent = prayerMessage();
        updateCountdown();
    }

    function updateCountdown() {
        var n = nextPrayer(new Date());
        if (!n) return;
        var mins = Math.ceil((n.at - new Date()) / 60000);
        var h = Math.floor(mins / 60), m = mins % 60;
        $('prayerNext').textContent = '다음 기도 시간 ' + timeLabel(n.time) + ' · ' +
            (h ? h + '시간 ' : '') + m + '분 남음';
    }

    function prayedLog() { return store.get('prayedLog', {}); }
    function markPrayed() {
        var log = prayedLog();
        var k = dateKey(new Date());
        log[k] = (log[k] || 0) + 1;
        store.set('prayedLog', log);
        renderPrayed();
    }
    function renderPrayed() {
        var log = prayedLog();
        var today = log[dateKey(new Date())] || 0;
        var streak = 0, d = new Date();
        if (!today) d.setDate(d.getDate() - 1); // 오늘 아직 안 했으면 어제부터 셈
        while (log[dateKey(d)]) { streak++; d.setDate(d.getDate() - 1); }
        $('prayedInfo').textContent = '오늘 ' + today + '번 기도했어요' + (streak ? ' · ' + streak + '일 연속' : '');
    }

    // 앱이 열려 있을 때 기도 시간이 되면 화면과 알림으로 알려 줌
    function checkPrayerTime() {
        var now = new Date();
        var hm = pad(now.getHours()) + ':' + pad(now.getMinutes());
        if (prayerTimes().indexOf(hm) >= 0) {
            var firedKey = dateKey(now) + ' ' + hm;
            if (store.get('lastPrayerAlert') !== firedKey) {
                store.set('lastPrayerAlert', firedKey);
                showPrayerOverlay();
                systemNotify();
            }
        }
        updateCountdown();
    }

    function showPrayerOverlay() {
        $('overlayMessage').textContent = prayerMessage();
        var items = (data.prayers && data.prayers.church) || [];
        $('overlayPrayers').innerHTML = items.slice(0, 4).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('');
        $('prayerOverlay').hidden = false;
    }

    function systemNotify() {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        var opts = { body: prayerMessage(), icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'prayer', data: { url: './#prayer' } };
        if (navigator.serviceWorker && navigator.serviceWorker.ready) {
            navigator.serviceWorker.ready.then(function (reg) { reg.showNotification('🙏 기도 시간입니다', opts); });
        } else {
            new Notification('🙏 기도 시간입니다', opts);
        }
    }

    function setupAlarmLinks() {
        // 구글 캘린더: 매일 반복 일정
        var start = new Date();
        start.setDate(start.getDate() + 1);
        var ymd = start.getFullYear() + pad(start.getMonth() + 1) + pad(start.getDate());
        var times = prayerTimes();
        [['gcalAm', times[0]], ['gcalPm', times[1] || times[0]]].forEach(function (pair) {
            var hm = pair[1].replace(':', '');
            var endMin = +hm.slice(2) + 10;
            var endHm = hm.slice(0, 2) + pad(endMin);
            var url = 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
                '&text=' + encodeURIComponent('🙏 교회를 위한 기도 시간') +
                '&details=' + encodeURIComponent(prayerMessage()) +
                '&dates=' + ymd + 'T' + hm + '00/' + ymd + 'T' + endHm + '00' +
                '&ctz=Asia/Seoul&recur=' + encodeURIComponent('RRULE:FREQ=DAILY');
            $(pair[0]).href = url;
            $(pair[0]).textContent = '구글 캘린더 — ' + timeLabel(pair[1]);
        });

        var btn = $('notifyBtn');
        if (!('Notification' in window)) {
            btn.hidden = true;
            $('notifyInfo').textContent = '이 브라우저는 앱 알림을 지원하지 않습니다. 캘린더 알림을 이용해 주세요.';
            return;
        }
        function refresh() {
            if (Notification.permission === 'granted') {
                btn.textContent = '🔔 앱 알림 켜짐';
                btn.disabled = true;
            } else if (Notification.permission === 'denied') {
                btn.textContent = '🔕 알림이 차단되어 있습니다';
                btn.disabled = true;
            }
        }
        refresh();
        btn.addEventListener('click', function () {
            Notification.requestPermission().then(refresh);
        });
    }

    function renderPrayers() {
        var p = data.prayers || {};
        $('churchPrayers').innerHTML = (p.church || []).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
        $('communityPrayers').innerHTML = (p.community || []).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
        $('prayersUpdated').textContent = p.updated ? koDate(p.updated) + ' 업데이트' : '';
        renderMyPrayers();
    }

    function renderMyPrayers() {
        var list = store.get('myPrayers', []);
        $('myPrayers').innerHTML = list.map(function (item, i) {
            return '<li class="' + (item.answered ? 'answered' : '') + '">' +
                '<button class="check" data-i="' + i + '" aria-label="응답됨 표시">' + (item.answered ? '✅' : '⬜') + '</button>' +
                '<span>' + esc(item.text) + '</span>' +
                '<button class="del" data-i="' + i + '" aria-label="삭제">✕</button></li>';
        }).join('') || '<li class="muted">아직 적은 기도 제목이 없습니다</li>';
    }

    $('myPrayerForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var text = $('myPrayerInput').value.trim();
        if (!text) return;
        var list = store.get('myPrayers', []);
        list.unshift({ text: text, date: dateKey(new Date()), answered: false });
        store.set('myPrayers', list);
        $('myPrayerInput').value = '';
        renderMyPrayers();
    });
    $('myPrayers').addEventListener('click', function (e) {
        var btn = e.target.closest('button');
        if (!btn) return;
        var list = store.get('myPrayers', []);
        var i = +btn.dataset.i;
        if (btn.classList.contains('del')) {
            if (!confirm('이 기도 제목을 지울까요?')) return;
            list.splice(i, 1);
        } else {
            list[i].answered = !list[i].answered;
        }
        store.set('myPrayers', list);
        renderMyPrayers();
    });

    $('prayedBtn').addEventListener('click', markPrayed);
    $('overlayPrayed').addEventListener('click', function () { markPrayed(); $('prayerOverlay').hidden = true; });
    $('overlayClose').addEventListener('click', function () { $('prayerOverlay').hidden = true; });

    // ---------- 성경 ----------
    var pos = store.get('biblePos', { book: 'gen', chapter: 1 });
    if (!Bible.book(pos.book)) pos = { book: 'gen', chapter: 1 };

    function fillBookSelect() {
        $('bookSelect').innerHTML = BIBLE_BOOKS.map(function (b) {
            return '<option value="' + b[0] + '">' + b[1] + '</option>';
        }).join('');
    }
    function fillChapterSelect() {
        var n = Bible.book(pos.book).chapters, html = '';
        for (var i = 1; i <= n; i++) html += '<option value="' + i + '">' + i + '장</option>';
        $('chapterSelect').innerHTML = html;
    }

    var version = store.get('bibleVersion', 'ko');
    var shownTextKey = null;
    var verses = []; // 지금 화면의 절 목록 [{ n: 절 번호, t: 본문 }]
    var voiceMode = store.get('voiceMode', 'human'); // 영어 — human: 사람 낭독(KJV), tts: 휴대폰 음성(WEB)
    var audioContinue = false;

    // ---------- 듣기 (휴대폰 내장 음성: 한글·영어) ----------
    var canSpeak = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    var speaking = false, speakToken = 0, continueListening = false, speakingIndex = 0;
    $('listenRate').value = String(store.get('listenRate', 1));

    // 자연스러운 목소리일수록 높은 점수 (기기마다 들어 있는 음성이 다름)
    function voiceScore(v) {
        var n = v.name;
        var score = 0;
        if (/Natural|Neural|Online|Premium|Enhanced|향상|고품질|프리미엄/i.test(n)) score += 50;
        if (/^Google/i.test(n)) score += 30;
        if (/Samsung|삼성/i.test(n)) score += 25;
        if (/Yuna|유나|SunHi|InJoon|Hyunsu|Ava|Samantha|Aria|Jenny|Guy|Siri/i.test(n)) score += 15;
        if (/Heami|eSpeak|Zira|David|Mark|compact|Compact/i.test(n)) score -= 30; // 기계음이 강한 기본 음성
        if (!v.localService) score += 5; // 온라인 음성이 대체로 더 자연스러움
        return score;
    }
    function voicesFor(lang) {
        if (!canSpeak) return [];
        return speechSynthesis.getVoices()
            .filter(function (v) { return v.lang.replace('_', '-').toLowerCase().indexOf(lang) === 0; })
            .sort(function (a, b) { return voiceScore(b) - voiceScore(a); });
    }
    function currentLang() { return version === 'ko' ? 'ko' : 'en'; }
    function pickVoice(lang) {
        var list = voicesFor(lang);
        var saved = store.get('voice-' + lang, '');
        for (var i = 0; i < list.length; i++) if (list[i].voiceURI === saved) return list[i];
        return list[0] || null;
    }
    function fillVoiceSelect() {
        var lang = currentLang();
        var list = voicesFor(lang);
        var chosen = pickVoice(lang);
        $('voiceSelect').innerHTML = list.map(function (v, i) {
            var label = v.name.replace(/\s*\((Korean|English)[^)]*\)/i, '').replace(/^Microsoft /, '');
            return '<option value="' + esc(v.voiceURI) + '">' + (i === 0 ? '⭐ ' : '') + esc(label) + '</option>';
        }).join('') || '<option value="">기본 목소리</option>';
        if (chosen) $('voiceSelect').value = chosen.voiceURI;
        $('voiceSelect').hidden = list.length < 2;
        // 자연스러운 음성이 하나도 없으면 설치 방법 안내
        var good = list.some(function (v) { return voiceScore(v) >= 20; });
        var ua = navigator.userAgent;
        var tip = '';
        if (!good && lang === 'ko') {
            tip = /iPhone|iPad|Mac/i.test(ua)
                ? '더 자연스러운 목소리: 설정 → 손쉬운 사용 → 읽기 및 말하기 → 음성 → 한국어 → "유나(향상됨)" 내려받기'
                : /Android/i.test(ua)
                    ? '더 자연스러운 목소리: 설정 → 일반 → 텍스트 음성 변환 → "Google 음성 인식 및 합성" 선택 후 한국어 음성 설치'
                    : '더 자연스러운 목소리는 Microsoft Edge 브라우저나 휴대폰에서 들을 수 있습니다';
        }
        $('voiceTip').textContent = tip;
        $('voiceTip').hidden = !tip;
    }
    if (canSpeak && 'onvoiceschanged' in speechSynthesis) {
        speechSynthesis.addEventListener('voiceschanged', fillVoiceSelect);
    }
    $('voiceSelect').addEventListener('change', function () {
        store.set('voice-' + currentLang(), this.value);
        if (speaking) { var i = speakingIndex; stopSpeech(); speakToken++; speakFrom(i); }
    });

    // 개역한글은 문장부호가 거의 없어 기계처럼 이어 읽게 됨 → 쉼표·마침표를 넣어 자연스럽게 쉬도록
    var SPEECH_VERBS = /(가라사대|가로되|이르시되|이르되|말하되|대답하되|대답하여 가로되|여짜오되|하시되|외치되|고하되|물어 가로되|부르짖되|기도하되)(?=\s)/g;
    function naturalize(text, lang) {
        var t = text.trim();
        if (lang === 'ko') {
            t = t.replace(/\s*!\s*/g, '! ')
                .replace(SPEECH_VERBS, '$1,')
                .replace(/(하매|하니|하므로|하였으나|하였더니|하거늘|하시매|하시니|하시므로|이요|이며|하고|하며)(?=\s)/g, '$1,');
        }
        if (!/[.!?,;:'"”’)]$/.test(t)) {
            t += lang === 'ko' && !/(라|다|니라|도다|로다|요|까|라\)|소서|세요|이니라)$/.test(t) ? ',' : '.';
        }
        return t;
    }

    function highlightVerse(i) {
        var box = $('textReader');
        var old = box.querySelector('.speaking');
        if (old) old.classList.remove('speaking');
        var p = i >= 0 && box.querySelector('[data-i="' + i + '"]');
        if (p) { p.classList.add('speaking'); p.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    }

    function speakFrom(i) {
        if (!verses.length) return;
        if (i >= verses.length) {
            // 장이 끝나면 다음 장으로 이어서 듣기
            var next = Bible.step(pos.book, pos.chapter, 1);
            stopSpeech();
            if (next) { continueListening = true; goTo(next.book, next.chapter); }
            return;
        }
        speaking = true;
        var token = speakToken;
        $('listenBtn').textContent = '⏹ 멈추기';
        speakingIndex = i;
        highlightVerse(i);
        var lang = currentLang();
        var u = new SpeechSynthesisUtterance(naturalize(verses[i].t, lang));
        var voice = pickVoice(lang);
        u.lang = voice ? voice.lang : (lang === 'ko' ? 'ko-KR' : 'en-US');
        u.rate = +$('listenRate').value;
        u.pitch = 1;
        if (voice) u.voice = voice;
        u.onend = function () { if (speaking && token === speakToken) speakFrom(i + 1); };
        u.onerror = function () { if (token === speakToken) stopSpeech(); };
        speechSynthesis.speak(u);
    }

    function stopSpeech() {
        speaking = false;
        speakToken++;
        if (canSpeak) speechSynthesis.cancel();
        highlightVerse(-1);
        $('listenBtn').textContent = '🔊 듣기';
    }

    $('listenBtn').addEventListener('click', function () {
        if (speaking) { stopSpeech(); return; }
        speakToken++;
        speakFrom(0);
    });
    $('listenRate').addEventListener('change', function () { store.set('listenRate', +this.value); });
    $('textReader').addEventListener('click', function (e) {
        // 절을 누르면 그 절부터 읽기
        var p = e.target.closest('[data-i]');
        if (!p || !canSpeak || usingHuman()) return;
        stopSpeech();
        speakToken++;
        speakFrom(+p.dataset.i);
    });
    if (canSpeak) speechSynthesis.getVoices(); // 일부 브라우저는 목록을 미리 불러와야 함

    // ---------- 사람 낭독 (영어 KJV, LibriVox 퍼블릭 도메인) ----------
    function humanSegment(book, chapter) {
        var b = data.audio && data.audio.books && data.audio.books[book];
        if (!b) return null;
        for (var i = 0; i < b.segments.length; i++) {
            var s = b.segments[i];
            if (chapter >= s[0] && chapter <= s[1]) {
                return { from: s[0], to: s[1], url: data.audio.base + b.item + '/' + s[2] };
            }
        }
        return null;
    }
    function usingHuman() { return version === 'en' && voiceMode === 'human' && !!humanSegment(pos.book, pos.chapter); }
    function englishTranslation() { return Bible.hasEsv() ? 'esv' : 'web'; }
    function textTranslation() { return version === 'ko' ? 'ko' : usingHuman() ? 'kjv' : englishTranslation(); }

    function updateListenPanels() {
        var en = version === 'en';
        var seg = humanSegment(pos.book, pos.chapter);
        var human = usingHuman();
        document.querySelectorAll('#voiceSeg button').forEach(function (b) {
            b.classList.toggle('active', b.dataset.mode === voiceMode);
            b.setAttribute('aria-selected', b.dataset.mode === voiceMode);
        });
        $('voiceSeg').hidden = !en;
        $('humanPanel').hidden = !human;
        $('noHumanMsg').hidden = !(en && voiceMode === 'human' && !seg);
        $('ttsPanel').hidden = human || !canSpeak;
        $('voiceTip').hidden = true;
        if (!human && canSpeak) fillVoiceSelect();
        $('listenBar').hidden = !en && !canSpeak;
        var audio = $('kjvAudio');
        if (!human) { audio.pause(); return; }
        var name = Bible.book(pos.book).name;
        $('audioLabel').textContent = '🎧 ' + name + ' ' + (seg.from === seg.to ? seg.from + '장' : seg.from + '–' + seg.to + '장') +
            ' 낭독' + (seg.from !== seg.to ? ' (' + seg.from + '장부터 이어서 읽습니다)' : '');
        if (audio.dataset.src !== seg.url) { // 같은 녹음 안에서 장만 바뀌면 계속 재생
            audio.dataset.src = seg.url;
            audio.src = seg.url;
        }
        if (audioContinue) { audioContinue = false; audio.play().catch(function () {}); }
    }

    $('voiceSeg').addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        voiceMode = b.dataset.mode;
        store.set('voiceMode', voiceMode);
        stopSpeech();
        $('kjvAudio').pause();
        showChapter();
    });

    $('kjvAudio').addEventListener('ended', function () {
        // 녹음이 끝나면 그다음 장으로 이어서 듣기 (녹음이 없는 책은 휴대폰 음성으로)
        var seg = humanSegment(pos.book, pos.chapter);
        var last = seg ? seg.to : pos.chapter;
        var next = Bible.step(pos.book, last, 1);
        if (!next) return;
        if (humanSegment(next.book, next.chapter)) audioContinue = true;
        else continueListening = canSpeak;
        goTo(next.book, next.chapter);
    });

    function renderText() {
        var translation = textTranslation();
        var key = pos.book + pos.chapter + translation;
        if (shownTextKey === key) return;
        shownTextKey = key;
        var box = $('textReader');
        box.className = 'reader text-reader' + (translation === 'ko' ? '' : ' lang-en');
        box.innerHTML = '<p class="muted center">' + (translation === 'ko' ? '불러오는 중…' : 'Loading…') + '</p>';
        verses = [];
        Bible.chapterText(pos.book, pos.chapter, translation).then(function (list) {
            if (shownTextKey !== key) return; // 그 사이 다른 장으로 이동함
            verses = list;
            box.innerHTML = list.map(function (v, i) {
                return '<p data-i="' + i + '"><sup>' + v.n + '</sup> ' + esc(v.t) + '</p>';
            }).join('');
            if (continueListening) { continueListening = false; speakFrom(0); }
        }).catch(function () {
            continueListening = false;
            if (shownTextKey !== key) return;
            shownTextKey = null;
            box.innerHTML = '<p class="muted center">본문을 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.</p>';
        });
    }

    function showChapter() {
        $('bookSelect').value = pos.book;
        fillChapterSelect();
        $('chapterSelect').value = pos.chapter;
        $('bibleTitle').textContent = Bible.label(pos) + (version === 'en' ? ' · ' + Bible.enRef(pos.book, pos.chapter) : '');
        document.querySelectorAll('#versionSeg button').forEach(function (b) {
            b.classList.toggle('active', b.dataset.ver === version);
            b.setAttribute('aria-selected', b.dataset.ver === version);
        });
        if (shownTextKey !== pos.book + pos.chapter + textTranslation()) stopSpeech();
        $('bibleSource').textContent = version === 'ko' ? '본문: 개역한글 (저작권 만료)'
            : usingHuman() ? 'English: King James Version · 낭독: LibriVox 자원봉사자 (퍼블릭 도메인)'
            : Bible.hasEsv() ? 'English: ESV · ' + Bible.ESV_NOTICE
            : 'English: World English Bible (퍼블릭 도메인)';
        updateListenPanels();
        renderText();
        $('prevChapter').disabled = !Bible.step(pos.book, pos.chapter, -1);
        $('nextChapter').disabled = !Bible.step(pos.book, pos.chapter, 1);
        store.set('biblePos', pos);
    }
    function goTo(book, chapter) {
        pos = { book: book, chapter: chapter };
        if (location.hash !== '#bible') location.hash = '#bible';
        else showChapter();
    }

    $('versionSeg').addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        version = b.dataset.ver;
        store.set('bibleVersion', version);
        showChapter();
    });
    $('bookSelect').addEventListener('change', function () { goTo(this.value, 1); });
    $('chapterSelect').addEventListener('change', function () { goTo(pos.book, +this.value); });
    $('prevChapter').addEventListener('click', function () {
        var p = Bible.step(pos.book, pos.chapter, -1); if (p) { goTo(p.book, p.chapter); window.scrollTo(0, 0); }
    });
    $('nextChapter').addEventListener('click', function () {
        var p = Bible.step(pos.book, pos.chapter, 1); if (p) { goTo(p.book, p.chapter); window.scrollTo(0, 0); }
    });

    function planRangeLabel(plan) {
        var first = plan[0], last = plan[plan.length - 1];
        var a = Bible.book(first.book).name + ' ' + first.chapter;
        if (first.book === last.book) return a + (last.chapter !== first.chapter ? '–' + last.chapter : '') + '장';
        return a + '장 – ' + Bible.book(last.book).name + ' ' + last.chapter + '장';
    }

    function renderPlan() {
        var now = new Date();
        var year = now.getFullYear();
        var today = dayOfYear(now);
        var done = store.get('plan-' + year, {});
        var plan = Bible.planForDay(today);
        $('planList').innerHTML = plan.map(function (p) {
            var k = p.book + '-' + p.chapter;
            return '<button class="chip' + (done[k] ? ' done' : '') + '" data-book="' + p.book + '" data-chapter="' + p.chapter + '">' +
                (done[k] ? '✓ ' : '') + esc(Bible.book(p.book).name) + ' ' + p.chapter + '장</button>';
        }).join('');
        var count = Object.keys(done).length;
        var pct = Math.min(100, Math.round(count / Bible.totalChapters * 100));
        $('planBar').style.width = pct + '%';
        $('planProgress').textContent = year + '년 ' + count + '장 읽음 (' + pct + '%) · 장을 누르면 읽고, 다 읽으면 한 번 더 눌러 체크하세요';
    }
    $('planList').addEventListener('click', function (e) {
        var chip = e.target.closest('.chip');
        if (!chip) return;
        var k = chip.dataset.book + '-' + chip.dataset.chapter;
        var isOpen = pos.book === chip.dataset.book && pos.chapter === +chip.dataset.chapter;
        if (isOpen) {
            var key = 'plan-' + new Date().getFullYear();
            var done = store.get(key, {});
            if (done[k]) delete done[k]; else done[k] = 1;
            store.set(key, done);
            renderPlan();
        } else {
            goTo(chip.dataset.book, +chip.dataset.chapter);
        }
    });

    // ---------- 설교 ----------
    // publishFrom 날짜 전에는 숨김 (미리 올려두기용)
    function sermons() {
        var today = dateKey(new Date());
        return ((data.sermons && data.sermons.sermons) || []).filter(function (s) { return !s.publishFrom || s.publishFrom <= today; });
    }

    // 설교·QT 본문: 자리만 만들고 fillPassages 가 개역한글로 채움
    function passageHtml(p) {
        return '<div class="reader passage-text" data-book="' + esc(p.book) + '" data-chapter="' + p.chapter +
            '" data-from="' + (p.from || '') + '" data-to="' + (p.to || '') + '"><p class="muted">불러오는 중…</p></div>';
    }
    function fillPassages(root) {
        root.querySelectorAll('.passage-text').forEach(function (el) {
            var d = el.dataset;
            Bible.passageText({ book: d.book, chapter: +d.chapter, from: +d.from || 0, to: +d.to || 0 }).then(function (list) {
                el.innerHTML = list.map(function (v) { return '<p><sup>' + v.n + '</sup> ' + esc(v.t) + '</p>'; }).join('');
            }).catch(function () {
                el.innerHTML = '<p class="muted">본문을 불러오지 못했습니다.</p>';
            });
        });
    }

    // 설교·QT 본문 아래 '영어로 보기' — 누르면 앱 안에서 ESV(키가 없으면 WEB)를 펼침
    function englishLink(p) {
        var name = Bible.hasEsv() ? 'ESV' : 'WEB';
        return '<button type="button" class="en-toggle" data-book="' + esc(p.book) + '" data-chapter="' + p.chapter +
            '" data-from="' + (p.from || '') + '" data-to="' + (p.to || '') + '">🇺🇸 영어로 보기 (' + name + ')</button>' +
            '<div class="reader passage-en lang-en" hidden></div>';
    }
    document.addEventListener('click', function (e) {
        var b = e.target.closest('.en-toggle');
        if (!b) return;
        var box = b.nextElementSibling;
        box.hidden = !box.hidden;
        b.classList.toggle('open', !box.hidden);
        if (box.hidden || box.dataset.loaded) return;
        box.dataset.loaded = '1';
        box.innerHTML = '<p class="muted">Loading…</p>';
        var d = b.dataset, translation = englishTranslation();
        Bible.passageText({ book: d.book, chapter: +d.chapter, from: +d.from || 0, to: +d.to || 0 }, translation).then(function (list) {
            box.innerHTML = list.map(function (v) { return '<p><sup>' + v.n + '</sup> ' + esc(v.t) + '</p>'; }).join('') +
                '<p class="muted small">' + (translation === 'esv' ? '(ESV) ' + esc(Bible.ESV_NOTICE)
                    : '(WEB) World English Bible · 퍼블릭 도메인') + '</p>';
        }).catch(function () {
            delete box.dataset.loaded;
            box.innerHTML = '<p class="muted">영어 본문을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.</p>';
        });
    });

    function passageBlock(p) {
        if (!p) return '';
        return '<details class="passage"><summary>📖 ' + esc(Bible.label(p)) + ' <span class="nowrap">본문 보기</span></summary>' +
            passageHtml(p) + englishLink(p) + '</details>';
    }

    function renderSermon(i) {
        var list = sermons();
        var s = list[i];
        if (!s) { $('sermonDetail').innerHTML = '<p class="muted">등록된 설교가 없습니다.</p>'; return; }
        var video = s.youtubeId
            ? '<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(s.youtubeId) +
              '" title="설교 영상" allow="encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>'
            : '';
        var passages = s.passages || (s.passage ? [s.passage] : []);
        function para(text) { return text ? '<p class="sermon-text">' + esc(text) + '</p>' : ''; }
        function pointList(points) {
            return points && points.length ? '<ol class="prayer-list">' +
                points.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ol>' : '';
        }
        $('sermonDetail').innerHTML =
            '<div class="card-kicker">' + (i === 0 ? '이번 주 말씀 · ' : '') + koDate(s.date) + '</div>' +
            '<h3 class="sermon-title">' + esc(s.title) + '</h3>' +
            (s.preacher ? '<p class="muted">' + esc(s.preacher) + '</p>' : '') +
            '<p class="verse-ref">' + passages.map(function (p) { return esc(Bible.label(p)); }).join(' · ') + '</p>' +
            video + passages.map(passageBlock).join('') +
            para(s.intro || s.summary) +
            (s.sections || []).map(function (sec) {
                return '<div class="sermon-section"><h4>' + esc(sec.title) + '</h4>' + pointList(sec.points) + para(sec.body) + '</div>';
            }).join('') +
            (s.points && s.points.length ? '<div class="card-kicker">핵심 말씀</div>' + pointList(s.points) : '') +
            (s.conclusion ? '<div class="sermon-conclusion">' + para(s.conclusion) + '</div>' : '');
        fillPassages($('sermonDetail'));
        $('sermonList').innerHTML = list.map(function (x, j) {
            return '<li><button class="' + (j === i ? 'active' : '') + '" data-i="' + j + '"><span>' + esc(x.title) +
                '</span><small>' + koDate(x.date) + '</small></button></li>';
        }).join('');
    }
    $('sermonList').addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        renderSermon(+b.dataset.i); window.scrollTo(0, 0);
    });

    // ---------- QT ----------
    function qtItems() {
        return ((data.qt && data.qt.items) || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    }
    function currentQt() {
        var today = dateKey(new Date());
        var items = qtItems();
        for (var i = 0; i < items.length; i++) if (items[i].date <= today) return items[i];
        return items[items.length - 1] || null;
    }

    var qtDate = null;
    function renderQt(item) {
        if (!item) { $('qtDetail').innerHTML = '<p class="muted">등록된 QT가 없습니다.</p>'; return; }
        qtDate = item.date;
        var intro = data.qt && data.qt.intro;
        $('qtIntro').hidden = !intro;
        $('qtIntroText').textContent = intro || '';
        $('qtDetail').innerHTML =
            '<div class="card-kicker">' + koDate(item.date) + '</div>' +
            '<h3 class="sermon-title">' + esc(item.title) + '</h3>' +
            '<p class="verse-ref">' + esc(Bible.label(item.passage)) + '</p>' +
            passageHtml(item.passage) +
            englishLink(item.passage) +
            '<div class="card-kicker">묵상 질문</div><ol class="prayer-list">' +
            (item.questions || []).map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ol>';
        fillPassages($('qtDetail'));
        var note = store.get('qt-' + item.date, {});
        $('qtNote').value = note.note || '';
        $('qtApply').value = note.apply || '';
        $('qtPrayer').value = note.prayer || '';
        $('qtSaved').textContent = note.savedAt ? '저장됨 · ' + note.savedAt : '';
        $('qtList').innerHTML = qtItems().map(function (x) {
            var has = store.get('qt-' + x.date, null);
            return '<li><button class="' + (x.date === item.date ? 'active' : '') + '" data-date="' + x.date + '"><span>' +
                (has ? '✍️ ' : '') + esc(x.title) + '</span><small>' + koDate(x.date) + '</small></button></li>';
        }).join('');
    }
    $('qtSave').addEventListener('click', function () {
        if (!qtDate) return;
        var now = new Date();
        store.set('qt-' + qtDate, {
            note: $('qtNote').value, apply: $('qtApply').value, prayer: $('qtPrayer').value,
            savedAt: koDate(now) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes())
        });
        renderQt(qtItems().filter(function (x) { return x.date === qtDate; })[0]);
    });
    $('qtList').addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        renderQt(qtItems().filter(function (x) { return x.date === b.dataset.date; })[0]);
        window.scrollTo(0, 0);
    });

    // ---------- 사진 크게 보기 (주보·앨범 공용) ----------
    var viewerItems = [], viewerIndex = 0;
    function openViewer(items, index) {
        viewerItems = items;
        viewerIndex = index;
        $('viewer').hidden = false;
        document.body.style.overflow = 'hidden';
        showViewerItem();
    }
    function showViewerItem() {
        var item = viewerItems[viewerIndex];
        $('viewerImg').src = item.src;
        $('viewerImg').alt = item.caption || '';
        $('viewerCaption').textContent = item.caption || '';
        $('viewerCount').textContent = viewerItems.length > 1 ? (viewerIndex + 1) + ' / ' + viewerItems.length : '';
        $('viewerPrev').disabled = viewerIndex === 0;
        $('viewerNext').disabled = viewerIndex === viewerItems.length - 1;
        $('viewerStage').classList.remove('zoomed');
        $('viewerZoom').textContent = '🔍 크게';
        $('viewerStage').scrollTo(0, 0);
    }
    function closeViewer() {
        $('viewer').hidden = true;
        $('viewerImg').removeAttribute('src');
        document.body.style.overflow = '';
    }
    $('viewerClose').addEventListener('click', closeViewer);
    $('viewerPrev').addEventListener('click', function () { if (viewerIndex > 0) { viewerIndex--; showViewerItem(); } });
    $('viewerNext').addEventListener('click', function () { if (viewerIndex < viewerItems.length - 1) { viewerIndex++; showViewerItem(); } });
    $('viewerZoom').addEventListener('click', function () {
        var zoomed = $('viewerStage').classList.toggle('zoomed');
        this.textContent = zoomed ? '🔍 작게' : '🔍 크게';
    });
    document.addEventListener('keydown', function (e) {
        if ($('viewer').hidden) return;
        if (e.key === 'Escape') closeViewer();
        else if (e.key === 'ArrowLeft') $('viewerPrev').click();
        else if (e.key === 'ArrowRight') $('viewerNext').click();
    });

    // ---------- 주보 ----------
    function bulletins() {
        return ((data.bulletins && data.bulletins.bulletins) || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    }
    // 글자로 옮긴 주보 (예배 순서·소식·봉사위원). 종이 사진은 맨 아래 접어 둠
    function bulletinRows(rows) {
        return '<dl class="bl-rows">' + rows.map(function (r) {
            return '<div><dt>' + esc(r.role) + '</dt><dd>' + esc(r.names) + '</dd></div>';
        }).join('') + '</dl>';
    }
    function bulletinService(sv) {
        var hasStand = false;
        var rows = (sv.order || []).map(function (r) {
            if (r.part) return '<li class="bl-part">' + esc(r.part) + '</li>';
            if (r.stand) hasStand = true;
            var ps = r.passages || [];
            var detail = r.detail ? (r.item.indexOf('찬송') >= 0
                ? esc(r.detail).replace(/(\d{1,3})장/g, function (m, n) { return '<a class="hymn-mini" target="_blank" rel="noopener" data-hymn="' + n + '" href="' + hymnUrl(n) + '">' + n + '장 <span aria-hidden="true">🎵</span></a>'; })
                : esc(r.detail)) : ps.map(function (p) { return '<span class="bl-ref">' + esc(Bible.label(p)).replace(/(\S*–\S*)/g, '<span class="nowrap">$1</span>') + '</span>'; }).join('');
            return '<li class="bl-item' + (r.highlight ? ' bl-sermon' : '') + '">' +
                '<span class="bl-name">' + (r.stand ? '<span class="bl-stand" aria-label="일어서서">※</span>' : '') + esc(r.item) + '</span>' +
                '<span class="bl-detail">' + detail + '</span>' +
                '<span class="bl-who">' + esc(r.who || '') + '</span>' +
                (ps.length ? '<div class="bl-passages">' + ps.map(passageBlock).join('') + '</div>' : '') +
                '</li>';
        }).join('');
        return '<section class="bl-service" data-hymn-group>' +
            '<div class="bl-service-head"><h4>' + esc(sv.name) + '</h4><span class="bl-time">' + esc(sv.time || '') + '</span></div>' +
            ((sv.note || sv.leader) ? '<p class="bl-leader">' + esc([sv.note, sv.leader].filter(Boolean).join(' · ')) + '</p>' : '') +
            '<ol class="bl-order">' + rows + '</ol>' +
            (hasStand ? '<p class="bl-note">※ 표시는 일어서서 합니다.</p>' : '') +
            (sv.verse ? '<p class="bl-verse-small">“' + esc(sv.verse.text) + '” <span>' + esc(sv.verse.ref) + '</span></p>' : '') +
            '</section>';
    }
    function renderBulletin(i) {
        var list = bulletins();
        var b = list[i];
        if (!b) {
            $('bulletinDetail').innerHTML = '<p class="empty-note">아직 올라온 주보가 없습니다.</p>';
            $('bulletinList').innerHTML = '';
            return;
        }
        var c = data.church || {}, th = b.theme || {}, acc = c.offeringAccount;
        var pages = b.pages || [];
        var html =
            '<header class="bl-cover">' +
                '<div class="bl-meta"><span>' + esc(b.issue || '') + '</span><span>' + koDate(b.date) + '</span></div>' +
                '<p class="bl-church">' + esc(c.denomination || '') + ' <strong>' + esc(c.name || '') + '</strong></p>' +
                (c.motto ? '<p class="bl-motto">' + c.motto.map(esc).join('<i>·</i>') + '</p>' : '') +
                '<h3 class="bl-title">' + esc(th.title || b.title || '주보') + '</h3>' +
                (th.subtitle ? '<p class="bl-subtitle">' + esc(th.subtitle) + '</p>' : '') +
                (th.message ? '<p class="bl-message">' + esc(th.message) + '</p>' : '') +
                (th.verse ? '<blockquote class="bl-verse">' + esc(th.verse.text) + '<cite>' + esc(th.verse.ref) + '</cite></blockquote>' : '') +
                (b.churchYear ? '<p class="bl-season">오늘은 ' + esc(b.churchYear) + '입니다' + (b.altarColor ? ' · 강단색 ' + esc(b.altarColor) : '') + '</p>' : '') +
            '</header>';
        if ((b.services || []).length) html += '<h4 class="bl-h">🙏 예배 순서</h4>' + b.services.map(bulletinService).join('');
        if ((b.servers || []).length) html += '<h4 class="bl-h">🤝 오늘 섬기는 분</h4>' + bulletinRows(b.servers);
        if ((b.news || []).length) html += '<h4 class="bl-h">📢 교회 소식</h4><ol class="bl-news">' +
            b.news.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ol>';
        if (b.nextServers) html += '<h4 class="bl-h">📅 다음 주 봉사위원 <small>' + koDate(b.nextServers.date) + '</small></h4>' +
            bulletinRows(b.nextServers.rows || []);
        html += '<footer class="bl-foot">' +
            (c.goal ? '<p class="bl-goal">목표 “' + esc(c.goal) + '”</p>' : '') +
            (c.pastor ? '<p>담임목사 ' + esc(c.pastor) + '</p>' : '') +
            (acc ? '<div class="bl-account"><span>온라인 후원계좌</span><span class="bl-bank">' + esc(acc.bank) + '</span><strong class="nowrap">' + esc(acc.number) + '</strong>' +
                '<button type="button" class="btn bl-copy" data-copy="' + esc(acc.number) + '">계좌번호 복사</button></div>' : '') +
            (c.address ? '<p>' + esc(c.address) + '</p>' : '') +
            (c.phone ? '<p><a href="tel:' + esc(c.phone) + '">📞 ' + esc(c.phone) + '</a></p>' : '') +
            '</footer>';
        if (pages.length) html += '<details class="bl-photos"><summary>종이 주보 사진 보기</summary>' +
            pages.map(function (src, j) {
                return '<img class="bulletin-page" loading="lazy" data-i="' + j + '" src="' + esc(src) + '" alt="주보 ' + (j + 1) + '쪽">';
            }).join('') + '</details>';
        if (b.pdf) html += '<a class="btn block" target="_blank" rel="noopener" href="' + esc(b.pdf) + '">📄 PDF로 보기</a>';
        $('bulletinDetail').innerHTML = html;
        fillPassages($('bulletinDetail'));
        $('bulletinDetail').onclick = function (e) {
            var copy = e.target.closest('.bl-copy');
            if (copy) {
                var done = function () { copy.textContent = '복사했어요 ✓'; setTimeout(function () { copy.textContent = '계좌번호 복사'; }, 2000); };
                if (navigator.clipboard) navigator.clipboard.writeText(copy.dataset.copy).then(done, function () { prompt('계좌번호', copy.dataset.copy); });
                else prompt('계좌번호', copy.dataset.copy);
                return;
            }
            var img = e.target.closest('.bulletin-page');
            if (!img) return;
            openViewer(pages.map(function (src, j) { return { src: src, caption: koDate(b.date) + ' 주보 ' + (j + 1) + '쪽' }; }), +img.dataset.i);
        };
        $('bulletinList').innerHTML = list.map(function (x, j) {
            return '<li><button class="' + (j === i ? 'active' : '') + '" data-i="' + j + '"><span>' + esc((x.theme && x.theme.title) || x.title || '주보') +
                '</span><small>' + koDate(x.date) + '</small></button></li>';
        }).join('');
    }
    $('bulletinList').addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        renderBulletin(+b.dataset.i); window.scrollTo(0, 0);
    });

    // ---------- 처음 들어올 때 이름 ----------
    // 이름은 이 기기에만 기억. 나눔판 글쓴이로 쓰임
    function userName() { return store.get('userName', '') || ''; }
    function showHello() {
        var n = userName();
        $('heroHello').hidden = !n;
        $('heroHello').textContent = n ? n + ' 님, 반갑습니다' : '';
        $('shareMe').textContent = n;
    }
    function askName() {
        $('welcomeName').value = userName();
        $('welcomeMsg').textContent = '';
        $('welcome').hidden = false;
        setTimeout(function () { $('welcomeName').focus(); }, 50);
    }
    $('welcomeForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var n = $('welcomeName').value.replace(/\s+/g, ' ').trim();
        if (n.length < 2) { $('welcomeMsg').textContent = '성함을 두 글자 이상 적어 주세요.'; $('welcomeName').focus(); return; }
        store.set('userName', n.slice(0, 20));
        $('welcome').hidden = true;
        showHello();
    });
    showHello();
    if (!userName()) askName();

    // ---------- 감사·기도 나눔 ----------
    // 글은 나눔 Worker(church.json의 shareApi)에 저장되고 바로 보임. 관리자 암호는 창을 닫으면 잊음
    var shareKind = 'thanks', shareFilter = 'all', sharePosts = [];
    var KIND_LABEL = { thanks: '💛 감사', prayer: '🙏 기도' };
    function shareApi(path, opts, admin) {
        var base = ((data.church && data.church.shareApi) || '').replace(/\/+$/, '');
        if (!base) return Promise.reject(new Error('no_api'));
        opts = opts || {};
        var headers = { 'Content-Type': 'application/json' };
        if (admin) headers['X-Admin-Code'] = sessionGet('adminCode');
        return fetch(base + path, { method: opts.method || 'GET', headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
            .then(function (r) {
                return r.json().catch(function () { return {}; }).then(function (d) {
                    if (!r.ok) { var e = new Error(d.error || ('http_' + r.status)); e.status = r.status; throw e; }
                    return d;
                });
            });
    }
    function sessionGet(k) { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } }
    function sessionSet(k, v) { try { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); } catch (e) { /* 저장 불가 */ } }
    function shareError(e) {
        if (e.status === 503) return '관리 화면을 준비하고 있습니다.';
        if (e.status === 429) return '지금 글이 많이 올라오고 있습니다. 잠시 뒤에 다시 올려 주세요.';
        if (e.message === 'no_api') return '나눔판이 아직 연결되지 않았습니다.';
        return '인터넷 연결을 확인하고 다시 시도해 주세요.';
    }
    function timeAgo(iso) {
        var d = new Date(iso), mins = Math.floor((Date.now() - d) / 60000);
        if (mins < 60) return mins < 1 ? '방금' : mins + '분 전';
        if (mins < 1440) return Math.floor(mins / 60) + '시간 전';
        return koDate(d);
    }
    function postHtml(p, admin) {
        var amened = (store.get('amened', []) || []).indexOf(p.id) >= 0;
        var amenLabel = p.kind === 'prayer' ? '🙏 함께 기도해요' : '👏 함께 감사해요';
        return '<li class="share-post ' + esc(p.kind) + '">' +
            '<div class="share-post-head"><span class="share-kind">' + KIND_LABEL[p.kind] + '</span>' +
            '<strong>' + esc(p.name || '익명') + '</strong><small>' + esc(timeAgo(p.created)) + '</small></div>' +
            '<p class="share-text">' + esc(p.text) + '</p>' +
            (admin
                ? '<div class="share-actions">' + (p.status === 'hidden'
                    ? '<button class="btn" data-act="approved" data-id="' + p.id + '">다시 올리기</button>'
                    : '<button class="btn" data-act="hidden" data-id="' + p.id + '">내리기</button>') + '</div>'
                : '<button class="btn share-amen' + (amened ? ' done' : '') + '" data-id="' + p.id + '"' + (amened ? ' disabled' : '') + '>' +
                    amenLabel + ' <b>' + (p.amen || 0) + '</b></button>') +
            '</li>';
    }
    function renderShareList() {
        var list = sharePosts.filter(function (p) { return shareFilter === 'all' || p.kind === shareFilter; });
        $('shareList').innerHTML = list.length ? list.map(function (p) { return postHtml(p); }).join('')
            : '<li class="empty-note">아직 올라온 나눔이 없습니다. 첫 감사를 나눠 주세요.</li>';
    }
    function loadShare() {
        return shareApi('/posts').then(function (d) {
            sharePosts = d.posts || [];
            renderShareList();
            if (sharePosts[0]) $('homeShare').textContent = sharePosts[0].text.slice(0, 18) + (sharePosts[0].text.length > 18 ? '…' : '');
        });
    }
    function openShare() {
        $('shareNotice').hidden = true;
        $('shareList').innerHTML = '<li class="empty-note">불러오는 중…</li>';
        loadShare().catch(function (e) { $('shareList').innerHTML = '<li class="empty-note">' + esc(shareError(e)) + '</li>'; });
    }
    $('shareWriteBtn').addEventListener('click', function () {
        if (!userName()) { askName(); return; }
        $('shareForm').hidden = false; $('shareWriteBtn').hidden = true; $('shareNotice').hidden = true;
        $('shareText').focus();
    });
    $('shareRename').addEventListener('click', askName);
    $('shareCancel').addEventListener('click', function () { $('shareForm').hidden = true; $('shareWriteBtn').hidden = false; });
    $('shareForm').querySelector('.share-kinds').addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        shareKind = b.dataset.kind;
        this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('active', x === b); });
        $('shareText').placeholder = shareKind === 'prayer' ? '함께 기도할 제목을 적어 주세요' : '감사한 일을 적어 주세요';
    });
    $('shareForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var text = $('shareText').value.trim();
        if (text.length < 2) { $('shareText').focus(); return; }
        var btn = this.querySelector('.btn-primary'); btn.disabled = true;
        shareApi('/posts', { method: 'POST', body: { kind: shareKind, name: userName(), text: text } }).then(function () {
            $('shareText').value = '';
            $('shareForm').hidden = true; $('shareWriteBtn').hidden = false;
            $('shareNotice').textContent = '고맙습니다. 나눔판에 올라갔습니다.';
            $('shareNotice').hidden = false;
            return loadShare();
        }).catch(function (err) { alert(shareError(err)); }).then(function () { btn.disabled = false; });
    });
    $('shareFilter').addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        shareFilter = b.dataset.f;
        this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('active', x === b); });
        renderShareList();
    });
    $('shareList').addEventListener('click', function (e) {
        var b = e.target.closest('.share-amen'); if (!b || b.disabled) return;
        var id = +b.dataset.id;
        b.disabled = true; b.classList.add('done');
        shareApi('/posts/' + id + '/amen', { method: 'POST' }).then(function (d) {
            var list = store.get('amened', []) || []; list.push(id); store.set('amened', list.slice(-300));
            sharePosts.forEach(function (p) { if (p.id === id) p.amen = d.amen; });
            b.querySelector('b').textContent = d.amen;
        }).catch(function () { b.disabled = false; b.classList.remove('done'); });
    });

    function openAdmin() {
        var has = !!sessionGet('adminCode');
        $('adminLogin').hidden = has; $('adminMain').hidden = !has;
        if (!has) return;
        $('adminApproved').innerHTML = '<li class="empty-note">불러오는 중…</li>';
        shareApi('/admin/posts', null, true).then(function (d) {
            var posts = d.posts || [];
            var shown = posts.filter(function (p) { return p.status === 'approved'; });
            var hidden = posts.filter(function (p) { return p.status === 'hidden'; });
            $('adminApproved').innerHTML = shown.length ? shown.map(function (p) { return postHtml(p, true); }).join('')
                : '<li class="empty-note">올라간 글이 없습니다.</li>';
            $('adminHidden').innerHTML = hidden.length ? hidden.map(function (p) { return postHtml(p, true); }).join('')
                : '<li class="empty-note">내린 글이 없습니다.</li>';
        }).catch(function (e) {
            if (e.status === 401) { sessionSet('adminCode', ''); $('adminLoginMsg').textContent = '관리자 암호가 맞지 않습니다.'; openAdmin(); }
            else $('adminApproved').innerHTML = '<li class="empty-note">' + esc(shareError(e)) + '</li>';
        });
    }
    $('adminLoginForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var code = $('adminCodeInput').value.trim(); if (!code) return;
        sessionSet('adminCode', code); $('adminCodeInput').value = ''; $('adminLoginMsg').textContent = '';
        openAdmin();
    });
    $('adminMain').addEventListener('click', function (e) {
        var b = e.target.closest('[data-act]'); if (!b) return;
        b.disabled = true;
        shareApi('/admin/posts/' + b.dataset.id, { method: 'POST', body: { status: b.dataset.act } }, true)
            .then(openAdmin).catch(function (err) { b.disabled = false; alert(shareError(err)); });
    });

    // ---------- 교회 앨범 ----------
    function albums() {
        return ((data.gallery && data.gallery.albums) || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    }
    function renderAlbums() {
        var list = albums();
        if (!list.length) { $('albumList').innerHTML = '<p class="empty-note">아직 올라온 사진이 없습니다.</p>'; return; }
        var html = '', month = '';
        list.forEach(function (a, i) {
            var m = a.date.slice(0, 7);
            if (m !== month) {
                month = m;
                html += '<h3 class="album-month">' + m.slice(0, 4) + '년 ' + (+m.slice(5)) + '월</h3>';
            }
            var photos = a.photos || [];
            html += '<button class="album-card" data-i="' + i + '">' +
                (photos[0] ? '<img loading="lazy" src="' + esc(photos[0].src) + '" alt="">' : '<img alt="">') +
                '<span><strong>' + esc(a.title) + '</strong><small>' + koDate(a.date) + ' · 사진 ' + photos.length + '장</small></span></button>';
        });
        $('albumList').innerHTML = html;
    }
    function showAlbum(i) {
        var a = i === null ? null : albums()[i];
        $('albumDetail').hidden = !a;
        $('albumList').hidden = !!a;
        if (!a) { $('albumDetail').innerHTML = ''; return; }
        var photos = a.photos || [];
        $('albumDetail').innerHTML =
            '<button class="btn" id="albumBack">◀ 앨범 목록</button>' +
            '<h3 class="sermon-title" style="margin-top:14px">' + esc(a.title) + '</h3>' +
            '<p class="muted">' + koDate(a.date) + (a.description ? ' · ' + esc(a.description) : '') + '</p>' +
            '<div class="photo-grid">' + photos.map(function (p, j) {
                return '<button data-j="' + j + '"><img loading="lazy" src="' + esc(p.src) + '" alt="' + esc(p.caption || '') + '"></button>';
            }).join('') + '</div>';
        $('albumDetail').onclick = function (e) {
            if (e.target.closest('#albumBack')) { showAlbum(null); window.scrollTo(0, 0); return; }
            var b = e.target.closest('.photo-grid button');
            if (b) openViewer(photos, +b.dataset.j);
        };
        window.scrollTo(0, 0);
    }
    $('albumList').addEventListener('click', function (e) {
        var b = e.target.closest('.album-card'); if (b) showAlbum(+b.dataset.i);
    });

    // ---------- 교회 소식 · 안내 ----------
    function renderChurch() {
        var news = data.news || {};
        $('noticeList').innerHTML = (news.notices || []).map(function (n) {
            return '<div class="notice"><strong>' + esc(n.title) + '</strong><small>' + koDate(n.date) + '</small>' +
                (n.body ? '<p>' + esc(n.body) + '</p>' : '') + '</div>';
        }).join('') || '<p class="muted">공지사항이 없습니다.</p>';

        var today = dateKey(new Date());
        var events = (news.events || []).filter(function (e) { return (e.end || e.date) >= today; })
            .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
        $('eventList').innerHTML = events.map(function (e) {
            var d = parseDate(e.date);
            return '<li><div class="event-date"><strong>' + d.getDate() + '</strong><span>' + (d.getMonth() + 1) + '월</span></div>' +
                '<div><strong>' + esc(e.title) + '</strong><small>' + koDate(e.date) + (e.end ? ' ~ ' + koDate(e.end) : '') +
                (e.place ? ' · ' + esc(e.place) : '') + '</small></div></li>';
        }).join('') || '<li class="muted">예정된 일정이 없습니다</li>';

        var c = data.church || {};
        $('worshipTable').innerHTML = (c.worship || []).map(function (w) {
            return '<tr><th>' + esc(w.name) + '</th><td>' + esc(w.time) + '</td></tr>';
        }).join('');
        $('churchAddress').textContent = c.address || '';
        var links = '';
        if (c.mapUrl) links += '<a class="btn block" target="_blank" rel="noopener" href="' + esc(c.mapUrl) + '">🗺️ 지도에서 보기</a>';
        if (c.phone) links += '<a class="btn block" href="tel:' + esc(c.phone) + '">📞 ' + esc(c.phone) + '</a>';
        if (c.youtubeChannel) links += '<a class="btn block" target="_blank" rel="noopener" href="' + esc(c.youtubeChannel) + '">▶️ 교회 유튜브</a>';
        $('churchLinks').innerHTML = links;
    }

    // ---------- 앱 설치 · 서비스워커 ----------
    var installPrompt = null;
    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        installPrompt = e;
        $('installBtn').hidden = false;
    });
    $('installBtn').addEventListener('click', function () {
        if (!installPrompt) return;
        installPrompt.prompt();
        installPrompt = null;
        $('installBtn').hidden = true;
    });
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        navigator.serviceWorker.register('sw.js').catch(function () { /* 오프라인 기능만 빠짐 */ });
    }

    // ---------- 시작 ----------
    fillBookSelect();
    Promise.all(['church', 'sermons', 'qt', 'prayers', 'news', 'audio-kjv', 'bulletins', 'gallery', 'hymns'].map(loadJson)).then(function (res) {
        data = { church: res[0], sermons: res[1], qt: res[2], prayers: res[3], news: res[4], audio: res[5], bulletins: res[6], gallery: res[7], hymns: res[8] };
        Bible.setEsvProxy(data.church && data.church.esvProxy);
        renderHome();
        renderPrayerTimes();
        renderPrayed();
        renderPrayers();
        setupAlarmLinks();
        renderPlan();
        renderSermon(0);
        renderQt(currentQt());
        renderChurch();
        renderBulletin(0);
        if (data.church && data.church.shareApi) loadShare().catch(function () { /* 홈 미리보기만 */ });
        renderAlbums();
        route();
        checkPrayerTime();
        setInterval(function () { checkPrayerTime(); renderNextWorship(); }, 20000);
        if (/[?&]pray=1/.test(location.search)) showPrayerOverlay(); // 알림을 눌러 들어온 경우
    });
})();
