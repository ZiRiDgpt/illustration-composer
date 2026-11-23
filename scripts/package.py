"""Package the deliverable; exclude diagnostic exports and earlier ZIP versions."""
import hashlib
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
target = root / 'artifacts' / f'illustration-composer-v{version}.zip'
target.parent.mkdir(exist_ok=True)
files = [root / name for name in ('README.md', 'package.json', 'package-lock.json', 'manifest.json', '.gitignore', '.gitattributes')]
for directory in ('src', 'dist', 'scripts', 'server', 'tests', 'docs', 'examples', 'demo'):
    files.extend(p for p in (root / directory).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for file in sorted(files):
        archive.write(file, file.relative_to(root).as_posix())
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
    names = set(archive.namelist())
    assert {'manifest.json', 'package-lock.json', 'server/index.mjs', 'server/semantic.mjs', 'dist/code.js', 'dist/ui.html', 'demo/demo.mp4', 'examples/01-study.svg',
            'examples/02-finance.svg', 'examples/03-connection.svg'} <= names
print(json.dumps({'file': target.name, 'files': len(files), 'bytes': target.stat().st_size,
                  'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}, indent=2))
