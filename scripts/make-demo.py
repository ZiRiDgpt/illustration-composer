"""Build an optional screenshot overview, separate from the actual action recording.

Optional tooling only: Pillow and ffmpeg. Does not capture or control the UI.
"""
from pathlib import Path
import shutil
import subprocess
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
out = ROOT / 'demo'
frames = ROOT / 'artifacts/demo-frames'
out.mkdir(exist_ok=True)
frames.mkdir(exist_ok=True)
font = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 27)
small = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 20)
cases = [
    ('01-study-figma.png', '1 / 3   Учёба без отвлечений', 'Тема · L · 1200 × 630 · Сирень'),
    ('02-finance-figma.png', '2 / 3   Финансовая грамотность', 'Тема · S · 1080 × 1080 · Персик'),
    ('03-objects-figma.png', '3 / 3   Телефон, наушники, пазл', 'По объектам · L · 1080 × 1440 · Мята'),
]
listing = []
for i, (filename, title, subtitle) in enumerate(cases):
    source = ROOT / 'artifacts' / filename
    screenshot = Image.open(source if source.exists() else out / filename).convert('RGB')
    # Crop to the observed plugin window, keeping unrelated tabs outside the deliverable.
    if screenshot.size == (1547, 901):
        screenshot = screenshot.crop((194, 83, 1355, 884))
    assert screenshot.size == (1161, 801), screenshot.size
    screenshot.save(out / filename)
    frame = Image.new('RGB', (1280, 960), '#f7f7fb')
    draw = ImageDraw.Draw(frame)
    draw.text((60, 18), title, font=font, fill='#252333')
    draw.text((60, 55), subtitle, font=small, fill='#756889')
    frame.paste(screenshot, (60, 95))
    draw.text((60, 914), 'Сборка • Обзор трёх состояний настоящего интерфейса Figma', font=small, fill='#756889')
    destination = frames / f'{i}.png'
    frame.save(destination)
    listing += [f"file '{destination.as_posix()}'", 'duration 5']
    if i == 0:
        frame.save(out / 'poster.png')
listing += [f"file '{destination.as_posix()}'"]
concat = frames / 'frames.txt'
concat.write_text('\n'.join(listing) + '\n', encoding='utf-8')
ffmpeg = shutil.which('ffmpeg')
assert ffmpeg, 'ffmpeg is required to assemble the optional review video'
subprocess.run([ffmpeg, '-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0',
                '-i', str(concat), '-t', '15', '-vf', 'fps=25', '-c:v', 'libx264', '-crf', '22',
                '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(out / 'overview.mp4')], check=True)
print(out / 'overview.mp4')
