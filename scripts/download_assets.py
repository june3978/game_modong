#!/usr/bin/env python3
import argparse
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
MODEL_INDEX = ROOT / 'assets' / 'models' / 'index.json'


def fetch_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={'User-Agent': 'game_modong_asset_fetcher/1.2'})
    with urllib.request.urlopen(req, timeout=90) as resp:
        return resp.read()


def save_binary(rel_path: str, data: bytes, force: bool = False) -> pathlib.Path:
    out = ROOT / rel_path
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists() and not force:
        return out
    out.write_bytes(data)
    return out


def map_target_filename(tex_name: str, map_name: str) -> str:
    if map_name == 'diff':
        return f'{tex_name}_color.jpg'
    if tex_name == 'water' and map_name == 'normal':
        return 'water_normal.jpg'
    return f'{tex_name}_{map_name}.jpg'


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


def classify_tags(path: pathlib.Path):
    name = str(path).lower()
    tags = []
    kw = {
        'tree': ['tree', 'plant', 'bush'],
        'house': ['house', 'home', 'building', 'hut'],
        'character': ['character', 'npc', 'human', 'person', 'anim'],
        'furniture': ['chair', 'table', 'sofa', 'bed', 'furniture', 'cabinet'],
        'rock': ['rock', 'stone', 'boulder'],
        'fence': ['fence', 'gate'],
        'prop': ['prop', 'barrel', 'lamp', 'bench'],
    }
    for tag, keys in kw.items():
        if any(k in name for k in keys):
            tags.append(tag)
    if not tags:
        tags.append('misc')
    return tags


def copy_preferred_model_files(extract_dir: pathlib.Path, target_dir: pathlib.Path) -> list[pathlib.Path]:
    target_dir.mkdir(parents=True, exist_ok=True)
    copied = []
    for ext in ('.glb', '.gltf', '.obj'):
        found = list(extract_dir.rglob(f'*{ext}'))
        if not found:
            continue
        for file in found:
            rel = file.relative_to(extract_dir)
            out = target_dir / rel
            out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(file, out)
            copied.append(out)
        if copied:
            break
    return copied


def build_model_index():
    model_root = ROOT / 'assets' / 'models'
    models = []
    for ext in ('*.glb', '*.gltf', '*.obj'):
        for file in model_root.rglob(ext):
            rel = file.relative_to(ROOT).as_posix()
            if '/_downloads/' in rel:
                continue
            models.append({
                'path': rel,
                'name': file.stem,
                'tags': classify_tags(file),
            })

    model_root.mkdir(parents=True, exist_ok=True)
    MODEL_INDEX.write_text(json.dumps({'models': models}, ensure_ascii=False, indent=2), encoding='utf-8')
    return models


def pick_model(models, primary_tags):
    for t in primary_tags:
        for m in models:
            if t in m['tags']:
                return m
    return None


def map_representative_models(models):
    mapping = {
        'tree.glb': ['tree'],
        'prop_house.glb': ['house'],
    }
    out_root = ROOT / 'assets' / 'models'
    created = []

    for file_name, tags in mapping.items():
        picked = pick_model(models, tags)
        if not picked:
            continue
        src = ROOT / picked['path']
        dst = out_root / file_name
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        created.append(dst.relative_to(ROOT).as_posix())

    npc_dir = out_root / 'npc'
    npc_dir.mkdir(parents=True, exist_ok=True)
    npc_models = [m for m in models if 'character' in m['tags']]
    for i in range(min(6, len(npc_models))):
        src = ROOT / npc_models[i]['path']
        dst = npc_dir / f'npc_{i}.glb'
        shutil.copy2(src, dst)
        created.append(dst.relative_to(ROOT).as_posix())

    return created


def download_archives(entries, stats, failures, force=False):
    for arc in entries:
        name = arc.get('name', 'archive')
        url = arc.get('url', '')
        out_dir = ROOT / arc.get('output_dir', 'assets/models')
        if not url:
            continue
        try:
            blob = fetch_bytes(url)
            with tempfile.TemporaryDirectory(prefix='game_modong_archive_') as td:
                extract_dir = pathlib.Path(td)
                with zipfile.ZipFile(io.BytesIO(blob)) as zf:
                    zf.extractall(extract_dir)
                copied = copy_preferred_model_files(extract_dir, out_dir)
            stats['archives_ok'] += 1
            stats['models_found'] += len(copied)
            print(f"[ok] archive {name} -> {len(copied)} model files")
        except Exception as exc:
            failures.append(f"archive:{name}:{url} -> {exc}")
            stats['archives_fail'] += 1


def main():
    parser = argparse.ArgumentParser(description='Download CC0 assets for game_modong')
    parser.add_argument('--force', action='store_true', help='overwrite existing files')
    parser.add_argument('--only', choices=['textures', 'models', 'all'], default='all', help='download only selected asset type')
    args = parser.parse_args()

    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    stats = defaultdict(int)
    failures = []

    run_textures = args.only in ('textures', 'all')
    run_models = args.only in ('models', 'all')

    if run_textures:
        for tex in manifest.get('textures', []):
            tex_name = tex.get('name', 'tex')
            out_dir = tex.get('output_dir', 'assets/pbr')
            for map_name, url in (tex.get('maps') or {}).items():
                try:
                    target = pathlib.Path(out_dir) / map_target_filename(tex_name, map_name)
                    existed = (ROOT / target).exists()
                    save_binary(str(target), fetch_bytes(url), force=args.force)
                    stats['textures_cached' if existed and not args.force else 'textures_ok'] += 1
                    print(f"[ok] texture {tex_name}:{map_name} -> {target}")
                except Exception as exc:
                    failures.append(f"texture:{tex_name}:{map_name}:{url} -> {exc}")
                    stats['textures_fail'] += 1

        for hdri in manifest.get('hdris', []):
            try:
                existed = (ROOT / hdri['output']).exists()
                save_binary(hdri['output'], fetch_bytes(hdri['url']), force=args.force)
                stats['hdr_cached' if existed and not args.force else 'hdr_ok'] += 1
                print(f"[ok] hdri {hdri.get('name')} -> {hdri.get('output')}")
            except Exception as exc:
                failures.append(f"hdri:{hdri.get('name')}:{hdri.get('url')} -> {exc}")
                stats['hdr_fail'] += 1

    if run_models:
        download_archives(manifest.get('archives', []), stats, failures, force=args.force)

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
                    copied = copy_preferred_model_files(extract_dir, ROOT / k['output_dir'])
                stats['kenney_ok'] += 1
                stats['models_found'] += len(copied)
                print(f"[ok] kenney {k.get('name')} -> {len(copied)} models ({zip_url})")
            except Exception as exc:
                failures.append(f"kenney:{k.get('name')}:{page} -> {exc}")
                stats['kenney_fail'] += 1

        models = build_model_index()
        mapped = map_representative_models(models)
        stats['model_index_count'] = len(models)
        stats['model_aliases'] = len(mapped)
        print(f"[ok] model index -> {MODEL_INDEX.relative_to(ROOT)} ({len(models)} entries)")
        if mapped:
            print('[ok] representative mappings:', ', '.join(mapped))

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
