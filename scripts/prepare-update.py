"""Publish an immutable, hashed offline resource bundle. Run before pushing game updates."""
import hashlib,json,shutil
from pathlib import Path
root=Path(__file__).resolve().parents[1]
files=sorted(p for p in root.iterdir() if p.suffix in ['.html','.js','.css','.png'])
entries=[dict(name=p.name,size=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in files]
version=hashlib.sha256(json.dumps(entries,sort_keys=True).encode()).hexdigest()[:16]
target=root/'updates'/version
target.mkdir(parents=True,exist_ok=True)
for p in files: shutil.copyfile(p,target/p.name)
(root/'update.json').write_text(json.dumps(dict(version=version,minShell=3,files=entries),indent=2),encoding='utf-8')
print('Resource bundle:',version,len(entries),'files')
