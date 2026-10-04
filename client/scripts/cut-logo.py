#!/usr/bin/env python3
"""흰 배경 로고 원본 → 투명 배경 로고(public/logo-mark.png) + 파비콘(icon-192/512.png).

    python3 scripts/cut-logo.py <원본.png>

핑크 JR 마크처럼 "한 가지 진한 색 + 흰 배경" 인 그림을 전제로 한다. 픽셀의 가장 어두운 채널이
흰색(255)에서 얼마나 멀어졌는지로 불투명도를 정하고, 가장자리에서 흰색과 섞인 색은 원래 색으로 되돌린다.
그림 안의 흰 부분(눈 흰자 등)도 투명해지지만 앱 배경(#F7F7F5)이 거의 흰색이라 티가 나지 않는다.
numpy 없이 PIL 만 쓴다 (이 머신의 numpy 가 x86_64 빌드라 arm64 에서 안 뜬다).
"""
import sys
from pathlib import Path
from PIL import Image

K = 96          # 주 색(핑크 240,96,136)의 최소 채널 — 이보다 어두우면 완전 불투명
NOISE = 0.06    # 이 아래 불투명도는 배경 노이즈(253~255)로 보고 버린다
WIDTH = 512     # 저장 폭. 로고는 최대 268px(OG)·84px@2x(로딩) 로만 쓰인다
PAD = 24        # 여백(원본 픽셀)
BG = (247, 247, 245, 255)  # 파비콘 배경 = --surface-sunken

src_path = Path(sys.argv[1])
out_dir = Path(__file__).resolve().parent.parent / 'public'

src = Image.open(src_path).convert('RGB')
w, h = src.size
pixels = src.load()
out = Image.new('RGBA', (w, h))
dst = out.load()
scale = 255.0 - K
for y in range(h):
    for x in range(w):
        r, g, b = pixels[x, y]
        a = (255 - min(r, g, b)) / scale
        if a < NOISE:
            dst[x, y] = (0, 0, 0, 0)
            continue
        if a >= 1.0:
            dst[x, y] = (r, g, b, 255)
            continue
        back = (1.0 - a) * 255.0
        dst[x, y] = (
            max(0, min(255, round((r - back) / a))),
            max(0, min(255, round((g - back) / a))),
            max(0, min(255, round((b - back) / a))),
            round(a * 255),
        )

bbox = out.getchannel('A').getbbox()
out = out.crop((max(0, bbox[0] - PAD), max(0, bbox[1] - PAD), min(w, bbox[2] + PAD), min(h, bbox[3] + PAD)))
out = out.resize((WIDTH, round(out.height * WIDTH / out.width)), Image.LANCZOS)
out.save(out_dir / 'logo-mark.png', optimize=True)
print('logo-mark.png', out.size)

for size in (192, 512):
    canvas = Image.new('RGBA', (size, size), BG)
    logo = out.copy()
    inner = int(size * 0.8)
    logo.thumbnail((inner, inner), Image.LANCZOS)
    canvas.alpha_composite(logo, ((size - logo.width) // 2, (size - logo.height) // 2))
    canvas.convert('RGB').save(out_dir / f'icon-{size}.png', optimize=True)
    print(f'icon-{size}.png', logo.size)
