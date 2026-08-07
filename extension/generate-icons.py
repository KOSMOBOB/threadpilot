#!/usr/bin/env python3
"""
Генератор иконок для Chrome-расширения threadpilot.
Создаёт PNG-иконки 16x16, 32x32, 48x48, 128x128 в папке icons/.

Запуск:
    cd /path/to/threadpilot/extension
    python generate-icons.py

Требования: pip install Pillow
"""

import os
import sys

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("❌ Pillow не установлен. Установите командой:")
    print("   pip install Pillow")
    print()
    sys.exit(1)

# Папка для иконок
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")
os.makedirs(OUT_DIR, exist_ok=True)

# Цвета (совпадают с дизайном дашборда)
BG_COLOR = (13, 18, 25, 255)       # тёмный фон #0d1219
TEAL = (51, 214, 176, 255)         # акцент #33d6b0
TEAL_DARK = (35, 184, 150, 255)    # тень самолётика


def draw_paper_plane(draw, size):
    """Рисует стилизованный бумажный самолётик"""
    margin = size * 0.18
    nose_x = size - margin
    nose_y = margin + size * 0.05
    tail_left_x = margin
    tail_left_y = size * 0.45
    tail_right_x = margin + size * 0.08
    tail_right_y = size - margin
    fold_x = size * 0.42
    fold_y = size * 0.52

    # Верхнее крыло (светлее)
    wing_top = [(nose_x, nose_y), (tail_left_x, tail_left_y), (fold_x, fold_y)]
    # Нижнее крыло (темнее)
    wing_bottom = [(nose_x, nose_y), (fold_x, fold_y), (tail_right_x, tail_right_y)]

    draw.polygon(wing_top, fill=TEAL)
    draw.polygon(wing_bottom, fill=TEAL_DARK)
    # Линия сгиба
    draw.line(
        [(nose_x, nose_y), (fold_x, fold_y)],
        fill=(255, 255, 255, 80),
        width=max(1, int(size / 64))
    )


def create_icon(size):
    """Создаёт иконку заданного размера"""
    img = Image.new('RGBA', (size, size), BG_COLOR)
    draw = ImageDraw.Draw(img)

    # Лёгкое свечение в левом верхнем углу
    glow_radius = int(size * 0.4)
    for i in range(glow_radius):
        alpha = int(20 * (1 - i / glow_radius))
        cx, cy = int(size * 0.2), int(size * 0.2)
        draw.ellipse(
            [cx - i, cy - i, cx + i, cy + i],
            fill=(51, 214, 176, alpha)
        )

    # Самолётик
    draw_paper_plane(draw, size)

    path = os.path.join(OUT_DIR, f"icon{size}.png")
    img.save(path, "PNG")
    print(f"✓ {path}")


def main():
    print(f"🎨 Генерирую иконки threadpilot в {OUT_DIR}\n")
    for sz in [16, 32, 48, 128]:
        create_icon(sz)
    print()
    print("🎉 Готово! Теперь обновите расширение в chrome://extensions/")


if __name__ == "__main__":
    main()
