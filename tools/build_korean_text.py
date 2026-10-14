"""개역한글(1961, 저작권 만료) 본문으로 data/kor/<책코드>.json 을 만듭니다.

실행: python tools/build_korean_text.py
원본: https://github.com/bluesaurel/Korean-Bible-1961-KRV (66권·1,189장·31,102절, 대한성서공회 공개본과 대조 검수)
각 파일은 [[1장 1절, 1장 2절, ...], [2장 ...], ...] 형태입니다.
"""
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'kor'
SOURCE = 'https://raw.githubusercontent.com/bluesaurel/Korean-Bible-1961-KRV/main/bible_1961_krv.json'


def norm(name):
    return re.sub(r'[^a-z0-9]', '', name.lower())


def main():
    src = (ROOT / 'js' / 'bible.js').read_text(encoding='utf-8')
    books = re.findall(r"\['(\w+)', '[^']+', (\d+), '([^']+)'\]", src)
    with urllib.request.urlopen(SOURCE, timeout=60) as r:
        ref = {norm(b['book']): b for b in json.load(r)}

    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for code, chapters, english in books:
        book = ref[norm(english)]
        out = []
        for ch in sorted(book['chapters'], key=lambda c: c['chapter']):
            verses = {v['verse']: re.sub(r'\s+', ' ', v['text']).strip() for v in ch['verses']}
            out.append([verses.get(i, '') for i in range(1, max(verses) + 1)])
        assert len(out) == int(chapters), (code, len(out), chapters)
        total += sum(len(c) for c in out)
        (OUT / f'{code}.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(len(books), '권', total, '절')


if __name__ == '__main__':
    main()
