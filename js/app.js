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
    var VIEWS = ['home', 'bible', 'sermon', 'qt', 'prayer', 'church'];
    function route() {
        var name = (location.hash || '#home').slice(1);
        if (VIEWS.indexOf(name) < 0) name = 'home';
        VIEWS.forEach(function (v) { $('view-' + v).hidden = v !== name; });
        document.querySelectorAll('.tabbar a').forEach(function (a) {
            a.classList.toggle('active', a.dataset.tab === name);
        });
        if (name === 'bible') showChapter(); // iframe은 성경 화면을 열 때 불러옴
        else { stopSpeech(); $('kjvAudio').pause(); }
        window.scrollTo(0, 0);
    }
    window.addEventListener('hashchange', route);

    // ---------- 홈 ----------
    function renderHome() {
        var c = data.church || {};
        var now = new Date();
        $('todayLabel').textContent = now.getFullYear() + '년 ' + koDate(now);
        $('churchName').textContent = c.name || '안산햇빛교회';
        $('heroTitle').textContent = c.name || '안산햇빛교회';
        $('slogan').textContent = c.slogan || '';
        if (c.memoryVerse) {
            $('memoryText').textContent = '“' + c.memoryVerse.text + '”';
            $('memoryRef').textContent = c.memoryVerse.ref;
        }

        var plan = Bible.planForDay(dayOfYear(now));
        if (plan.length) $('homePlan').textContent = planRangeLabel(plan);

        var s = sermons()[0];
        if (s) $('homeSermon').textContent = s.title;
        var q = currentQt();
        if (q) $('homeQt').textContent = Bible.label(q.passage);

        var notices = (data.news && data.news.notices) || [];
        $('homeNews').innerHTML = notices.slice(0, 3).map(function (n) {
            return '<li>' + esc(n.title) + '</li>';
        }).join('') || '<li class="muted">새 소식이 없습니다</li>';
    }

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
    var shownKey = null, shownEnKey = null;
    var enVerses = [];
    var voiceMode = store.get('voiceMode', 'human'); // human: 사람 낭독(KJV), tts: 휴대폰 음성(WEB)
    var audioContinue = false;

    // ---------- 영어 듣기 (휴대폰 내장 음성, 저작권 문제 없음) ----------
    var canSpeak = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    var speaking = false, speakToken = 0, continueListening = false;
    $('listenRate').value = String(store.get('listenRate', 1));

    function englishVoice() {
        var voices = speechSynthesis.getVoices().filter(function (v) { return /^en[-_]/i.test(v.lang); });
        var preferred = ['Google US English', 'Samantha', 'Microsoft Aria', 'Microsoft Jenny', 'Daniel', 'Karen'];
        for (var i = 0; i < preferred.length; i++) {
            for (var j = 0; j < voices.length; j++) if (voices[j].name.indexOf(preferred[i]) === 0) return voices[j];
        }
        return voices.filter(function (v) { return /^en[-_]US/i.test(v.lang); })[0] || voices[0] || null;
    }

    function highlightVerse(i) {
        var box = $('enReader');
        var old = box.querySelector('.speaking');
        if (old) old.classList.remove('speaking');
        var p = i >= 0 && box.querySelector('[data-i="' + i + '"]');
        if (p) { p.classList.add('speaking'); p.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    }

    function speakFrom(i) {
        if (!enVerses.length) return;
        if (i >= enVerses.length) {
            // 장이 끝나면 다음 장으로 이어서 듣기
            var next = Bible.step(pos.book, pos.chapter, 1);
            stopSpeech();
            if (next) { continueListening = true; goTo(next.book, next.chapter); }
            return;
        }
        speaking = true;
        var token = speakToken;
        $('listenBtn').textContent = '⏹ 멈추기';
        highlightVerse(i);
        var u = new SpeechSynthesisUtterance(enVerses[i].text.trim());
        u.lang = 'en-US';
        u.rate = +$('listenRate').value;
        var voice = englishVoice();
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
    $('enReader').addEventListener('click', function (e) {
        // 절을 누르면 그 절부터 읽기
        var p = e.target.closest('[data-i]');
        if (!p || !canSpeak || usingHuman()) return;
        stopSpeech();
        speakToken++;
        speakFrom(+p.dataset.i);
    });
    if (canSpeak) speechSynthesis.getVoices(); // 일부 브라우저는 목록을 미리 불러와야 함

    // ---------- 사람 낭독 (LibriVox KJV, 퍼블릭 도메인) ----------
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
    function usingHuman() { return voiceMode === 'human' && !!humanSegment(pos.book, pos.chapter); }
    function englishTranslation() { return usingHuman() ? 'kjv' : 'web'; }

    function updateListenPanels() {
        var seg = humanSegment(pos.book, pos.chapter);
        var human = voiceMode === 'human' && !!seg;
        document.querySelectorAll('#voiceSeg button').forEach(function (b) {
            b.classList.toggle('active', b.dataset.mode === voiceMode);
            b.setAttribute('aria-selected', b.dataset.mode === voiceMode);
        });
        $('humanPanel').hidden = !human;
        $('noHumanMsg').hidden = !(voiceMode === 'human' && !seg);
        $('ttsPanel').hidden = human || !canSpeak;
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

    function renderEnglish() {
        var translation = englishTranslation();
        var key = pos.book + pos.chapter + translation;
        if (shownEnKey === key) return;
        shownEnKey = key;
        var box = $('enReader');
        box.innerHTML = '<p class="muted center">Loading…</p>';
        enVerses = [];
        Bible.fetchEnglish(pos.book, pos.chapter, translation).then(function (verses) {
            if (shownEnKey !== key) return; // 그 사이 다른 장으로 이동함
            enVerses = verses;
            box.innerHTML = verses.map(function (v, i) {
                return '<p data-i="' + i + '"><sup>' + v.verse + '</sup> ' + esc(v.text.trim()) + '</p>';
            }).join('');
            if (continueListening) { continueListening = false; speakFrom(0); }
        }).catch(function () {
            continueListening = false;
            if (shownEnKey !== key) return;
            shownEnKey = null;
            box.innerHTML = '<p class="muted center">영어 본문을 불러오지 못했습니다. 잠시 후 다시 시도하거나 NIV 버튼을 눌러 주세요.</p>';
        });
    }

    function showChapter() {
        $('bookSelect').value = pos.book;
        fillChapterSelect();
        $('chapterSelect').value = pos.chapter;
        $('bibleTitle').textContent = Bible.label(pos) + (version === 'en' ? ' · ' + Bible.enRef(pos.book, pos.chapter) : '');
        $('nivLink').href = Bible.nivUrl(pos.book, pos.chapter);
        document.querySelectorAll('#versionSeg button').forEach(function (b) {
            b.classList.toggle('active', b.dataset.ver === version);
            b.setAttribute('aria-selected', b.dataset.ver === version);
        });
        if (shownEnKey !== pos.book + pos.chapter + englishTranslation() || version !== 'en') stopSpeech();
        $('koReader').hidden = version !== 'ko';
        $('enReader').hidden = version !== 'en';
        $('listenBar').hidden = version !== 'en';
        $('bibleSource').textContent = version !== 'en' ? '본문: 개역한글 (ibibles.net 제공)'
            : usingHuman() ? 'English: King James Version · 낭독: LibriVox 자원봉사자 (퍼블릭 도메인)'
            : 'English: World English Bible (퍼블릭 도메인) · NIV는 BibleGateway에서 열립니다';
        if (version === 'en') {
            updateListenPanels();
            renderEnglish();
        } else {
            $('kjvAudio').pause();
        }
        if (version !== 'en' && shownKey !== pos.book + pos.chapter) {
            $('bibleFrame').src = Bible.quoteUrl(pos.book, pos.chapter);
            shownKey = pos.book + pos.chapter;
        }
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
    function sermons() { return (data.sermons && data.sermons.sermons) || []; }

    function nivLink(p) {
        return '<a class="niv-link" target="_blank" rel="noopener" href="' +
            esc(Bible.nivUrl(p.book, p.chapter, p.from, p.to)) + '">NIV로 읽기 ↗</a>';
    }

    function passageBlock(p) {
        if (!p) return '';
        return '<details class="passage"><summary>📖 ' + esc(Bible.label(p)) + ' 본문 보기</summary>' +
            '<div class="reader small-reader"><iframe loading="lazy" title="본문" src="' +
            esc(Bible.quoteUrl(p.book, p.chapter, p.from, p.to)) + '"></iframe></div>' + nivLink(p) + '</details>';
    }

    function renderSermon(i) {
        var list = sermons();
        var s = list[i];
        if (!s) { $('sermonDetail').innerHTML = '<p class="muted">등록된 설교가 없습니다.</p>'; return; }
        var video = s.youtubeId
            ? '<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(s.youtubeId) +
              '" title="설교 영상" allow="encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>'
            : '<div class="video-empty">🎬 설교 영상 준비 중</div>';
        $('sermonDetail').innerHTML =
            '<div class="card-kicker">' + (i === 0 ? '이번 주 말씀 · ' : '') + koDate(s.date) + '</div>' +
            '<h3 class="sermon-title">' + esc(s.title) + '</h3>' +
            '<p class="muted">' + esc(s.preacher || '') + '</p>' +
            video + passageBlock(s.passage) +
            (s.summary ? '<p>' + esc(s.summary) + '</p>' : '') +
            (s.points && s.points.length ? '<div class="card-kicker">핵심 말씀</div><ol class="prayer-list">' +
                s.points.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ol>' : '');
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
        $('qtDetail').innerHTML =
            '<div class="card-kicker">' + koDate(item.date) + '</div>' +
            '<h3 class="sermon-title">' + esc(item.title) + '</h3>' +
            '<p class="verse-ref">' + esc(Bible.label(item.passage)) + '</p>' +
            '<div class="reader small-reader"><iframe loading="lazy" title="QT 본문" src="' +
            esc(Bible.quoteUrl(item.passage.book, item.passage.chapter, item.passage.from, item.passage.to)) + '"></iframe></div>' +
            nivLink(item.passage) +
            '<div class="card-kicker">묵상 질문</div><ol class="prayer-list">' +
            (item.questions || []).map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ol>';
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
    Promise.all(['church', 'sermons', 'qt', 'prayers', 'news', 'audio-kjv'].map(loadJson)).then(function (res) {
        data = { church: res[0], sermons: res[1], qt: res[2], prayers: res[3], news: res[4], audio: res[5] };
        renderHome();
        renderPrayerTimes();
        renderPrayed();
        renderPrayers();
        setupAlarmLinks();
        renderPlan();
        renderSermon(0);
        renderQt(currentQt());
        renderChurch();
        route();
        checkPrayerTime();
        setInterval(checkPrayerTime, 20000);
        if (/[?&]pray=1/.test(location.search)) showPrayerOverlay(); // 알림을 눌러 들어온 경우
    });
})();
