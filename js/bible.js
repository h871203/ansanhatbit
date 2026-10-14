// 성경 66권 목록 — [ibibles.net 코드, 한글 이름, 장 수, 영어 이름]
var BIBLE_BOOKS = [
    ['gen', '창세기', 50, 'Genesis'], ['exo', '출애굽기', 40, 'Exodus'], ['lev', '레위기', 27, 'Leviticus'], ['num', '민수기', 36, 'Numbers'],
    ['deu', '신명기', 34, 'Deuteronomy'], ['jos', '여호수아', 24, 'Joshua'], ['judg', '사사기', 21, 'Judges'], ['rut', '룻기', 4, 'Ruth'],
    ['1sa', '사무엘상', 31, '1 Samuel'], ['2sa', '사무엘하', 24, '2 Samuel'], ['1ki', '열왕기상', 22, '1 Kings'], ['2ki', '열왕기하', 25, '2 Kings'],
    ['1ch', '역대상', 29, '1 Chronicles'], ['2ch', '역대하', 36, '2 Chronicles'], ['ezr', '에스라', 10, 'Ezra'], ['neh', '느헤미야', 13, 'Nehemiah'],
    ['est', '에스더', 10, 'Esther'], ['job', '욥기', 42, 'Job'], ['psa', '시편', 150, 'Psalms'], ['pro', '잠언', 31, 'Proverbs'],
    ['ecc', '전도서', 12, 'Ecclesiastes'], ['son', '아가', 8, 'Song of Solomon'], ['isa', '이사야', 66, 'Isaiah'], ['jer', '예레미야', 52, 'Jeremiah'],
    ['lam', '예레미야애가', 5, 'Lamentations'], ['eze', '에스겔', 48, 'Ezekiel'], ['dan', '다니엘', 12, 'Daniel'], ['hos', '호세아', 14, 'Hosea'],
    ['joe', '요엘', 3, 'Joel'], ['amo', '아모스', 9, 'Amos'], ['oba', '오바댜', 1, 'Obadiah'], ['jon', '요나', 4, 'Jonah'],
    ['mic', '미가', 7, 'Micah'], ['nah', '나훔', 3, 'Nahum'], ['hab', '하박국', 3, 'Habakkuk'], ['zep', '스바냐', 3, 'Zephaniah'],
    ['hag', '학개', 2, 'Haggai'], ['zec', '스가랴', 14, 'Zechariah'], ['mal', '말라기', 4, 'Malachi'],
    ['mat', '마태복음', 28, 'Matthew'], ['mar', '마가복음', 16, 'Mark'], ['luk', '누가복음', 24, 'Luke'], ['joh', '요한복음', 21, 'John'],
    ['act', '사도행전', 28, 'Acts'], ['rom', '로마서', 16, 'Romans'], ['1co', '고린도전서', 16, '1 Corinthians'], ['2co', '고린도후서', 13, '2 Corinthians'],
    ['gal', '갈라디아서', 6, 'Galatians'], ['eph', '에베소서', 6, 'Ephesians'], ['phi', '빌립보서', 4, 'Philippians'], ['col', '골로새서', 4, 'Colossians'],
    ['1th', '데살로니가전서', 5, '1 Thessalonians'], ['2th', '데살로니가후서', 3, '2 Thessalonians'], ['1ti', '디모데전서', 6, '1 Timothy'], ['2ti', '디모데후서', 4, '2 Timothy'],
    ['tit', '디도서', 3, 'Titus'], ['phm', '빌레몬서', 1, 'Philemon'], ['heb', '히브리서', 13, 'Hebrews'], ['jas', '야고보서', 5, 'James'],
    ['1pe', '베드로전서', 5, '1 Peter'], ['2pe', '베드로후서', 3, '2 Peter'], ['1jn', '요한일서', 5, '1 John'], ['2jn', '요한이서', 1, '2 John'],
    ['3jn', '요한삼서', 1, '3 John'], ['jude', '유다서', 1, 'Jude'], ['rev', '요한계시록', 22, 'Revelation']
];

var Bible = (function () {
    var byCode = {};
    var allChapters = []; // 1189장 전체를 순서대로
    // 영어 본문 API(bible-api.com)용 표준 책 코드
    var USFM = 'GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV'.split(' ');
    BIBLE_BOOKS.forEach(function (b, i) {
        byCode[b[0]] = { code: b[0], name: b[1], chapters: b[2], nameEn: b[3], usfm: USFM[i], index: i };
        for (var c = 1; c <= b[2]; c++) allChapters.push({ book: b[0], chapter: c });
    });

    function book(code) { return byCode[code]; }

    // ibibles.net 인용 주소. 절 범위가 없으면 장 전체(1-200절)
    function quoteUrl(code, chapter, from, to) {
        var range = from ? (to && to !== from ? from + '-' + to : String(from)) : '1-200';
        return 'https://ibibles.net/quote.php?kor-' + code + '/' + chapter + ':' + range;
    }

    function enRef(code, chapter, from, to) {
        var s = byCode[code].nameEn + ' ' + chapter;
        if (from) s += ':' + from + (to && to !== from ? '-' + to : '');
        return s;
    }

    // NIV는 저작권(Biblica) 때문에 앱에 넣지 않고 BibleGateway 공식 페이지로 연결
    function nivUrl(code, chapter, from, to) {
        return 'https://www.biblegateway.com/passage/?version=NIV&search=' + encodeURIComponent(enRef(code, chapter, from, to));
    }

    // 영어 본문(WEB, 퍼블릭 도메인) — bible-api.com. 장 전체를 받음 (유다서처럼 1장짜리 책도 정확히)
    function fetchEnglish(code, chapter) {
        return fetch('https://bible-api.com/data/web/' + byCode[code].usfm + '/' + chapter)
            .then(function (r) { if (!r.ok) throw new Error('bible-api'); return r.json(); })
            .then(function (d) { return d.verses || []; });
    }

    function label(p) {
        var b = byCode[p.book];
        var s = (b ? b.name : p.book) + ' ' + p.chapter + '장';
        if (p.from) s += ' ' + p.from + (p.to && p.to !== p.from ? '–' + p.to : '') + '절';
        return s;
    }

    function step(code, chapter, delta) {
        var b = byCode[code];
        chapter += delta;
        if (chapter < 1) {
            if (b.index === 0) return null;
            var prev = BIBLE_BOOKS[b.index - 1];
            return { book: prev[0], chapter: prev[2] };
        }
        if (chapter > b.chapters) {
            if (b.index === BIBLE_BOOKS.length - 1) return null;
            return { book: BIBLE_BOOKS[b.index + 1][0], chapter: 1 };
        }
        return { book: code, chapter: chapter };
    }

    // 1년 1독: 1월 1일부터 하루 약 3~4장씩
    function planForDay(dayIndex) {
        var days = 365;
        dayIndex = Math.max(0, Math.min(days - 1, dayIndex));
        var start = Math.floor(dayIndex * allChapters.length / days);
        var end = Math.floor((dayIndex + 1) * allChapters.length / days);
        return allChapters.slice(start, end);
    }

    return { book: book, quoteUrl: quoteUrl, nivUrl: nivUrl, fetchEnglish: fetchEnglish, enRef: enRef, label: label, step: step, planForDay: planForDay, totalChapters: allChapters.length };
})();
