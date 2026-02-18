#!/usr/bin/env python3
import json
import pathlib
import urllib.request
import zipfile
import io

ROOT = pathlib.Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'scripts' / 'assets_manifest.json'


def fetch(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=40) as r:
        return r.read()


def save_binary(rel_path: str, data: bytes):
    out = ROOT / rel_path
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(data)
    print(f'[ok] {rel_path}')


def main():
    m = json.loads(MANIFEST.read_text(encoding='utf-8'))
    for item in m.get('textures', []):
        url = item.get('url', '').strip()
        if not url:
            continue
        save_binary(item['output'], fetch(url))

    for item in m.get('hdris', []):
        url = item.get('url', '').strip()
        if not url:
            continue
        save_binary(item['output'], fetch(url))

    for item in m.get('archives', []):
        url = item.get('url', '').strip()
        if not url:
            print(f"[skip] {item.get('name')} url 없음")
            continue
        output_dir = ROOT / item['output_dir']
        output_dir.mkdir(parents=True, exist_ok=True)
        blob = fetch(url)
        with zipfile.ZipFile(io.BytesIO(blob)) as zf:
            zf.extractall(output_dir)
        print(f"[ok] extracted -> {item['output_dir']}")

    print('\n완료: 에셋이 없어도 게임은 procedural fallback으로 동작합니다.')


if __name__ == '__main__':
    main()
