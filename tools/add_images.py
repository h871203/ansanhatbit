"""주보·앨범 사진을 앱에 추가한다 (macOS 전용 — 사진 크기 줄이기에 내장 sips 사용).

사진은 긴 쪽 1600px JPG로 줄여서 넣는다 (휴대폰 원본은 너무 커서 앱이 느려짐). HEIC도 JPG로 바뀐다.

  주보:  python3 tools/add_images.py bulletin 2026-11-01 사진1.jpg 사진2.jpg [주보.pdf] [--title "11월 1일 주보"]
  앨범:  python3 tools/add_images.py album 2026-10-26 사진들... --title "가을 특별새벽기도회" [--desc "설명"]

같은 날짜로 다시 실행하면 그 주보/앨범에 사진이 이어서 붙는다.
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAX_SIDE = 1600
IMAGE_EXT = {'.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.gif', '.tif', '.tiff'}


def save_jpg(src, dest):
    dest.parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '80', '-Z', str(MAX_SIDE),
                        str(src), '--out', str(dest)], capture_output=True, text=True)
    if r.returncode != 0 or not dest.exists():
        raise RuntimeError(f'{src.name}: 사진 변환 실패 {r.stderr.strip()}')


def next_number(folder):
    nums = [int(m.group(1)) for p in folder.glob('*') if (m := re.match(r'(\d+)\.', p.name))]
    return max(nums, default=0) + 1


def load(name):
    return json.loads((ROOT / 'data' / name).read_text(encoding='utf-8'))


def dump(name, data):
    (ROOT / 'data' / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('kind', choices=['bulletin', 'album'])
    ap.add_argument('date', help='YYYY-MM-DD')
    ap.add_argument('files', nargs='+')
    ap.add_argument('--title')
    ap.add_argument('--desc')
    args = ap.parse_args()
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', args.date):
        sys.exit('날짜는 2026-11-01 형식으로 적어 주세요.')

    folder_name = 'bulletins' if args.kind == 'bulletin' else 'photos'
    folder = ROOT / folder_name / args.date
    folder.mkdir(parents=True, exist_ok=True)
    added, pdf = [], None
    n = next_number(folder)
    for f in map(Path, args.files):
        ext = f.suffix.lower()
        if ext == '.pdf' and args.kind == 'bulletin':
            dest = folder / 'bulletin.pdf'
            shutil.copyfile(f, dest)
            pdf = f'{folder_name}/{args.date}/bulletin.pdf'
        elif ext in IMAGE_EXT:
            dest = folder / f'{n}.jpg'
            save_jpg(f, dest)
            added.append(f'{folder_name}/{args.date}/{n}.jpg')
            n += 1
        else:
            sys.exit(f'{f.name}: 사진(JPG·PNG·HEIC)이나 PDF만 넣을 수 있습니다.')

    if args.kind == 'bulletin':
        data = load('bulletins.json')
        item = next((b for b in data['bulletins'] if b['date'] == args.date), None)
        if not item:
            item = {'date': args.date, 'title': '', 'pages': [], 'pdf': ''}
            data['bulletins'].append(item)
        item['title'] = args.title or item['title'] or f'{int(args.date[5:7])}월 {int(args.date[8:])}일 주보'
        item['pages'] += added
        if pdf:
            item['pdf'] = pdf
        data['bulletins'].sort(key=lambda b: b['date'], reverse=True)
        dump('bulletins.json', data)
    else:
        data = load('gallery.json')
        item = next((a for a in data['albums'] if a['date'] == args.date), None)
        if not item:
            if not args.title:
                sys.exit('새 앨범은 --title "행사 이름" 을 적어 주세요.')
            item = {'date': args.date, 'title': args.title, 'description': '', 'photos': []}
            data['albums'].append(item)
        if args.title:
            item['title'] = args.title
        if args.desc is not None:
            item['description'] = args.desc
        item['photos'] += [{'src': s, 'caption': ''} for s in added]
        data['albums'].sort(key=lambda a: a['date'], reverse=True)
        dump('gallery.json', data)

    print(f'{item["title"]}: 사진 {len(added)}장' + (' + PDF' if pdf else '') + ' 추가')


if __name__ == '__main__':
    main()
