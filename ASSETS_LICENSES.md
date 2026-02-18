# Assets / Licenses

이 프로젝트는 런타임/로컬 스크립트에서 **CC0(퍼블릭 도메인) 에셋만** 사용하도록 설계되어 있습니다.

## Sources
- Poly Haven (CC0): 텍스처/HDRI
  - https://polyhaven.com/
- Kenney (CC0): 3D packs
  - Nature Kit
  - Animated Characters 2
  - https://kenney.nl/assets
- Quaternius (CC0): (선택, manifest 확장 시)
  - https://quaternius.com/

## Download pipeline
- Manifest: `scripts/assets_manifest.json`
- Downloader: `scripts/download_assets.py`

스크립트는 에셋 URL/페이지를 기반으로 파일을 가져오며, 레포에는 대용량 바이너리를 강제 커밋하지 않습니다.
에셋이 없을 경우 게임은 procedural/fallback 렌더링으로 동작합니다.
