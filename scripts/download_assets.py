#!/usr/bin/env python3
import io
import json
import pathlib
import re
import shutil
import tempfile
import urllib.parse
import urllib.request
import zipfile
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'scripts' / 'assets_manifest.json'


def fetch_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={'User-Agent': 'game_modong_asset_fetcher/1.1'})
    with urllib.request.urlopen(req, timeout=90) as resp:
        return resp.read()


def save_binary(rel_path: str, data: bytes) -> pathlib.Path:
    out = ROOT / rel_path
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(data)
    return out


def map_target_filename(tex_name: str, map_name: str) -> str:
    if tex_name in {'grass', 'wood', 'roof'} and map_name == 'diff':
        return f'{tex_name}_color.png'
    if tex_name == 'water' and map_name == 'normal':
        return 'water_normal.png'
    return f'{tex_name}_{map_name}.png'


def detect_kenney_zip_url(page_html: str, page_url: str) -> str | None:
    candidates = set()
    direct_patterns = [
        r'https?://[^"\']*kenney[^"\']*\.zip',
        r'https?://[^"\']*cdn\.kenney\.nl[^"\']*\.zip',
        r'https?://[^"\']*/files/[^"\']*\.zip',
    ]
    for pat in direct_patterns:
        for m in re.finditer(pat, page_html, re.IGNORECASE):
            candidates.add(m.group(0))

    for href in re.findall(r'href=["\']([^"\']+)["\']', page_html, re.IGNORECASE):
        if '.zip' in href.lower() or 'download' in href.lower():
            candidates.add(urllib.parse.urljoin(page_url, href))

    for c in sorted(candidates):
        lc = c.lower()
        if 'kenney' in lc and lc.endswith('.zip'):
            return c
    for c in sorted(candidates):
        if c.lower().endswith('.zip'):
            return c
    return None


def copy_preferred_model_files(extract_dir: pathlib.Path, target_dir: pathlib.Path) -> int:
    target_dir.mkdir(parents=True, exist_ok=True)
    copied = 0
    for ext in ('.glb', '.gltf', '.obj'):
        for file in extract_dir.rglob(f'*{ext}'):
            rel = file.relative_to(extract_dir)
            out = target_dir / rel
            out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(file, out)
            copied += 1
        if copied:
            break  # prefer glb first, then fall back
    return copied


def main():
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    stats = defaultdict(int)
    failures = []

    for tex in manifest.get('textures', []):
        tex_name = tex.get('name', 'tex')
        out_dir = tex.get('output_dir', 'assets/pbr')
        for map_name, url in (tex.get('maps') or {}).items():
            try:
                data = fetch_bytes(url)
                target = pathlib.Path(out_dir) / map_target_filename(tex_name, map_name)
                save_binary(str(target), data)
                stats['textures_ok'] += 1
                print(f"[ok] texture {tex_name}:{map_name} -> {target}")
            except Exception as exc:
                failures.append(f"texture:{tex_name}:{map_name}:{url} -> {exc}")
                stats['textures_fail'] += 1

    for hdri in manifest.get('hdris', []):
        try:
            save_binary(hdri['output'], fetch_bytes(hdri['url']))
            stats['hdr_ok'] += 1
            print(f"[ok] hdri {hdri.get('name')} -> {hdri.get('output')}")
        except Exception as exc:
            failures.append(f"hdri:{hdri.get('name')}:{hdri.get('url')} -> {exc}")
            stats['hdr_fail'] += 1

    for k in manifest.get('kenney_pages', []):
        page = k.get('page', '')
        if not page:
            continue
        try:
            html = fetch_bytes(page).decode('utf-8', errors='ignore')
            zip_url = detect_kenney_zip_url(html, page)
            if not zip_url:
                failures.append(f"kenney:{k.get('name')} zip link not found from {page}")
                stats['kenney_fail'] += 1
                continue
            blob = fetch_bytes(zip_url)
            with tempfile.TemporaryDirectory(prefix='game_modong_kenney_') as td:
                extract_dir = pathlib.Path(td)
                with zipfile.ZipFile(io.BytesIO(blob)) as zf:
                    zf.extractall(extract_dir)
                models = copy_preferred_model_files(extract_dir, ROOT / k['output_dir'])
            stats['kenney_ok'] += 1
            stats['models_found'] += models
            print(f"[ok] kenney {k.get('name')} -> {models} models ({zip_url})")
        except Exception as exc:
            failures.append(f"kenney:{k.get('name')}:{page} -> {exc}")
            stats['kenney_fail'] += 1

    print('\n=== Asset download summary ===')
    for key in sorted(stats):
        print(f'{key}: {stats[key]}')

    if failures:
        print('\n=== Failures ===')
        for failure in failures:
            print('-', failure)

    print('\n완료: 에셋이 없어도 게임은 procedural fallback으로 동작합니다.')


if __name__ == '__main__':
    main()
