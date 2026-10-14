"""LibriVox(퍼블릭 도메인) KJV 낭독 파일을 장별로 찾아 data/audio-kjv.json 을 만듭니다.

실행: python tools/build_audio_map.py
archive.org 메타데이터만 읽고, 음성 파일 자체는 내려받지 않습니다.
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# [앱 책 코드, 영어 이름(파일 제목에서 찾을 이름들), 장 수]
BOOKS = [
    ('gen', ['Genesis'], 50), ('exo', ['Exodus'], 40), ('lev', ['Leviticus'], 27), ('num', ['Numbers'], 36),
    ('deu', ['Deuteronomy'], 34), ('jos', ['Joshua'], 24), ('judg', ['Judges'], 21), ('rut', ['Ruth'], 4),
    ('1sa', ['1 Samuel'], 31), ('2sa', ['2 Samuel'], 24), ('1ki', ['1 Kings'], 22), ('2ki', ['2 Kings'], 25),
    ('1ch', ['1 Chronicles'], 29), ('2ch', ['2 Chronicles'], 36), ('ezr', ['Ezra'], 10), ('neh', ['Nehemiah'], 13),
    ('est', ['Esther'], 10), ('job', ['Job'], 42), ('psa', ['Psalms', 'Psalm'], 150), ('pro', ['Proverbs'], 31),
    ('ecc', ['Ecclesiastes'], 12), ('son', ['Song of Solomon', 'Song of Songs'], 8), ('isa', ['Isaiah'], 66),
    ('jer', ['Jeremiah'], 52), ('lam', ['Lamentations'], 5), ('eze', ['Ezekiel'], 48), ('dan', ['Daniel'], 12),
    ('hos', ['Hosea'], 14), ('joe', ['Joel'], 3), ('amo', ['Amos'], 9), ('oba', ['Obadiah'], 1), ('jon', ['Jonah'], 4),
    ('mic', ['Micah'], 7), ('nah', ['Nahum'], 3), ('hab', ['Habakkuk'], 3), ('zep', ['Zephaniah'], 3),
    ('hag', ['Haggai'], 2), ('zec', ['Zechariah'], 14), ('mal', ['Malachi'], 4),
    ('mat', ['Matthew'], 28), ('mar', ['Mark'], 16), ('luk', ['Luke'], 24), ('joh', ['John'], 21),
    ('act', ['Acts'], 28), ('rom', ['Romans'], 16), ('1co', ['1 Corinthians'], 16), ('2co', ['2 Corinthians'], 13),
    ('gal', ['Galatians'], 6), ('eph', ['Ephesians'], 6), ('phi', ['Philippians'], 4), ('col', ['Colossians'], 4),
    ('1th', ['1 Thessalonians'], 5), ('2th', ['2 Thessalonians'], 3), ('1ti', ['1 Timothy'], 6), ('2ti', ['2 Timothy'], 4),
    ('tit', ['Titus'], 3), ('phm', ['Philemon'], 1), ('heb', ['Hebrews'], 13), ('jas', ['James'], 5),
    ('1pe', ['1 Peter'], 5), ('2pe', ['2 Peter'], 3), ('1jn', ['1 John'], 5), ('2jn', ['2 John'], 1),
    ('3jn', ['3 John'], 1), ('jude', ['Jude'], 1), ('rev', ['Revelation'], 22),
]

# 책별 LibriVox KJV 녹음 (앞에 있는 것을 우선 사용)
ITEMS = {
    'gen': ['bible_kjv_01_02_03_0908_librivox'], 'exo': ['bible_kjv_01_02_03_0908_librivox'],
    'lev': ['bible_kjv_01_02_03_0908_librivox'], 'num': ['numbers_kjv_1108_librivox'],
    'deu': ['deuteronomy_kjv_1110_librivox'], 'judg': ['bible_judges_kjv_jc_librivox'],
    'rut': ['bible_ruth_tg_librivox', 'biblekjv_8ruth_dr_1502_librivox'], '1sa': ['bible_1samuel_kjv_0903_librivox'],
    '2sa': ['bible_2samuel_kjv_jc_librivox'], '1ki': ['bible_kjv_11_1king_0909_librivox'],
    '1ch': ['1chronicles_jc_librivox'], '2ch': ['2chronicleskjv_1403_librivox'], 'ezr': ['ezra_kjv_sw_librivox'],
    'neh': ['nehemiah_kjv_1110_librivox'], 'est': ['bible_kjv_17_esther_dr_1502_librivox'],
    'job': ['job_1612_librivox', 'bible_kjv_18_job_version_2_1507_librivox'], 'psa': ['bible_kjv_19_psalms_1207_librivox'],
    'pro': ['proverbs_kjv_mp_librivox'], 'ecc': ['ecclesiastes_kjv_1105_librivox'], 'son': ['songofsolomon_kjv_1009_librivox'],
    'jer': ['jeremiah_kjv_1201_librivox'], 'eze': ['ezekiel_kjv_jr_librivox'], 'dan': ['daniel_kjv_1112_librivox'],
    'joe': ['joel_kjv_ss_librivox'],
    'mat': ['matthew_kjv_mp_librivox'], 'mar': ['mark_kjv_sw_librivox'], 'luk': ['bible_kjv_nt_03_luke_0812_librivox'],
    'joh': ['biblent04_john_kjv_librivox'], 'act': ['acts_kjv_1112_librivox', 'acts_kjv_v2_1401_librivox'],
    'rom': ['romans_kjv_1103_librivox', 'romans_kjv_1408_librivox'], '1co': ['1corinthians_kjv_1103_librivox'],
    '2co': ['2corinthians_kjv_1105_librivox'], 'gal': ['galatians_kjv_1412_librivox', 'bible_4epistles_kjv_1104_librivox'],
    'eph': ['ephesians_kjv_nt_librivox', 'bible_4epistles_kjv_1104_librivox'], 'phi': ['bible_4epistles_kjv_1104_librivox'],
    'col': ['bible_4epistles_kjv_1104_librivox'], '1th': ['bible_1thessalonians_kjv_1010_librivox'],
    '2th': ['bible_2thessalonians_kjv_1011_librivox'], '1ti': ['bible_1timothy_kjv_1007_librivox'],
    '2ti': ['bible_2timothy_kjv_1009_librivox'], 'tit': ['bible_titus_kjv_1007_librivox'],
    'phm': ['bible_philemon_kjv_1007_librivox'], 'heb': ['hebrews_kjv_1111_librivox'], 'jas': ['james_kjv'],
    '1pe': ['epistlesofpeter_kjv_1109_librivox'], '2pe': ['epistlesofpeter_kjv_1109_librivox'],
    '1jn': ['bible_epistlesjohn_rt_librivox', '1John_kjv_librivox'], '2jn': ['bible_epistlesjohn_rt_librivox'],
    '3jn': ['bible_epistlesjohn_rt_librivox'], 'jude': ['jude_kjv'],
    'rev': ['bible_kjvnt_27_revelation_1401_librivox', 'revelation_mp_librivox'],
}

_meta_cache = {}


def files_of(item):
    if item not in _meta_cache:
        with urllib.request.urlopen('https://archive.org/metadata/' + item) as r:
            meta = json.load(r)
        files = [f for f in meta.get('files', []) if f.get('format') == '64Kbps MP3']
        files.sort(key=lambda f: f['name'])
        _meta_cache[item] = files
    return _meta_cache[item]


def numbers(text):
    """'1-6', '6, 7', '1 - 5' 같은 장 표기를 (처음, 끝) 으로"""
    nums = [int(n) for n in re.findall(r'\d+', text)]
    return (min(nums), max(nums)) if nums else None


def segment_for(title, names, all_names, single_book):
    t = re.sub(r'^\s*\d+[a-z]?\s*[-–:.]\s*', '', title or '')  # 앞의 트랙 번호 제거
    for name in names:
        m = re.search(r'(?<![\w])' + re.escape(name) + r'(?![\w])', t, re.I)
        if m:
            rest = t[m.end():]
            # 다른 책 이름이 이어지면 거기까지만
            for other in all_names:
                if other not in names:
                    k = rest.find(other)
                    if k >= 0:
                        rest = rest[:k]
            return numbers(rest) or 'whole'
    if single_book:
        # 'Chapters 1-2', 'Chapter 5' 처럼 책 이름 없이 장만 적힌 경우
        m = re.search(r'chapters?\s*([\d\s,\-–&and]+)', t, re.I)
        if m:
            return numbers(m.group(1))
        if re.fullmatch(r'[\d\s,\-–]+', t.strip()):
            return numbers(t)
    return None


def build():
    all_names = [n for _, ns, _ in BOOKS for n in ns]
    out, report = {}, []
    for code, names, chapters in BOOKS:
        best = None
        for item in ITEMS.get(code, []):
            files = files_of(item)
            single = len([i for i, its in ITEMS.items() if item in its]) == 1
            segs = []
            for f in files:
                seg = segment_for(f.get('title', ''), names, all_names, single)
                if seg == 'whole':
                    seg = (1, chapters)
                if seg and 1 <= seg[0] <= seg[1] <= chapters:
                    segs.append([seg[0], seg[1], f['name'], f.get('length', '')])
            covered = set(c for s in segs for c in range(s[0], s[1] + 1))
            if best is None or len(covered) > best[2]:
                best = (item, segs, len(covered))
            if len(covered) == chapters:
                break
        if best and best[2]:
            item, segs, n = best
            segs.sort(key=lambda s: (s[0], s[1]))
            out[code] = {'item': item, 'segments': segs}
            report.append(f'{code:5} {n:3}/{chapters:<3} {item} ({len(segs)}개 파일)')
        else:
            report.append(f'{code:5}   0/{chapters:<3} 낭독 없음 → 휴대폰 음성')
    return out, report


if __name__ == '__main__':
    data, report = build()
    print('\n'.join(report))
    target = ROOT / 'data' / 'audio-kjv.json'
    payload = {
        '_안내': 'LibriVox(퍼블릭 도메인) KJV 낭독. tools/build_audio_map.py 로 생성. segments = [처음 장, 끝 장, 파일 이름, 길이]',
        'base': 'https://archive.org/download/',
        'books': data,
    }
    target.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print('저장:', target, file=sys.stderr)
