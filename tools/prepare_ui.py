#!/usr/bin/env python3
"""Cut the designer UI art (assets_src/ui/) into game assets.

  python3 -I tools/prepare_ui.py

Outputs
  native/project/ui/loading.jpg   loading background (main package), baked progress bar removed
  native/project/res/ui.png       atlas: 3 minis buttons + 3 popup illustrations (baked "x300" removed)
  js/ui_atlas.js                  frame rects + anchors (amount text, illustrated Go button, loading bar)

Source art
  loading.png           full loading screen (941x1672)
  entry_reward_hd.png   Entry Reward popup, HD (1024x1536) -> illustration (steps 1-4)
  minis_sheet.png       Launch / Share popups + minis buttons (1536x1024)
  btn_add_to_screen.png the "Add to screen" button (1254x1254)
"""
import json, os, sys
import numpy as np
import cv2
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'assets_src', 'ui')
P = lambda *a: os.path.join(ROOT, *a)


def load(name):
    return Image.open(os.path.join(SRC, name)).convert('RGBA')


def inpaint(img, boxes, mode='text'):
    """Erase baked graphics inside boxes. mode 'text': only the white fill + dark outline pixels
    of big lettering; mode 'all': the whole box."""
    rgb = np.array(img.convert('RGB'))
    mask = np.zeros(rgb.shape[:2], np.uint8)
    for (x0, y0, x1, y1) in boxes:
        if mode == 'all':
            mask[y0:y1, x0:x1] = 255
        else:
            reg = rgb[y0:y1, x0:x1].astype(int)
            lum = reg.mean(axis=2)
            sat = reg.max(axis=2) - reg.min(axis=2)
            m = ((lum > 228) & (sat < 40)) | (lum < 110)
            mask[y0:y1, x0:x1][m] = 255
    mask = cv2.dilate(mask, np.ones((5, 5), np.uint8), iterations=2)
    out = cv2.inpaint(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), mask, 7, cv2.INPAINT_TELEA)
    res = Image.fromarray(cv2.cvtColor(out, cv2.COLOR_BGR2RGB)).convert('RGBA')
    res.putalpha(img.getchannel('A'))
    return res


def cut_on_white(img, box, tol=26):
    """Crop and make the white page background transparent (flood fill from the crop border)."""
    c = img.crop(box).convert('RGBA')
    a = np.array(c)
    h, w = a.shape[:2]
    white = (a[:, :, :3].min(axis=2) >= 255 - tol)
    seen = np.zeros((h, w), bool)
    stack = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y, x] or not white[y, x]:
            continue
        seen[y, x] = True
        stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    alpha = np.where(seen, 0, 255).astype(np.uint8)
    # soften the cut edge a little (1 px feather) so it does not look jagged on device
    alpha = np.array(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.8)))
    a[:, :, 3] = np.minimum(a[:, :, 3], alpha)
    out = Image.fromarray(a)
    bb = out.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    return out.crop(bb), (box[0] + bb[0], box[1] + bb[1])


def fit(img, max_w):
    if img.width <= max_w:
        return img
    return img.resize((max_w, round(img.height * max_w / img.width)), Image.LANCZOS)


def main():
    os.makedirs(P('native', 'project', 'ui'), exist_ok=True)
    meta = {}

    # ---------- loading ----------
    ld = load('loading.png')
    BAR = (176, 1448, 766, 1532)                # baked progress bar + paw knob (source px)
    ld = inpaint(ld, [BAR], 'all')
    ld.convert('RGB').save(P('native', 'project', 'ui', 'loading.jpg'), quality=84, optimize=True, progressive=True)
    meta['loading'] = {'image': 'ui/loading.jpg', 'w': ld.width, 'h': ld.height,
                       'bar': [184, 1462, 760, 1518], 'label': [470, 1556]}

    sheet = load('minis_sheet.png')
    hd = load('entry_reward_hd.png')

    # ---------- popup illustrations (cream content only; frame/title/CTA are drawn by the game) ----------
    pops = {}
    # Entry Reward (HD): steps 1-4 + coin box + hint line
    e = hd.crop((150, 288, 872, 1292))
    e = inpaint(e, [(413 - 150, 1176 - 288, 600 - 150, 1252 - 288)])
    pops['pop_entry'] = (e, {'amount': [(413 + 600) / 2 - 150, (1176 + 1252) / 2 - 288 - 2], 'amountSize': 62})
    # Launch Reward (sheet): steps 1-3, illustrated Go button in step 1, coin box + hint
    l = sheet.crop((588, 96, 996, 606))
    l = inpaint(l, [(738 - 588, 528 - 96, 845 - 588, 575 - 96)])
    pops['pop_launch'] = (l, {'amount': [(738 + 845) / 2 - 588, (528 + 575) / 2 - 96 - 1], 'amountSize': 34,
                              'go': [670 - 588, 142 - 96, 908 - 588, 214 - 96]})
    # Share Rewards (sheet): coin box + "Share to get free coins!"
    s = sheet.crop((1084, 172, 1472, 458))
    s = inpaint(s, [(1210 - 1084, 336 - 172, 1352 - 1084, 398 - 172)])
    pops['pop_share'] = (s, {'amount': [(1210 + 1352) / 2 - 1084, (336 + 398) / 2 - 172 - 2], 'amountSize': 46})

    # ---------- minis buttons (transparent, badge kept) ----------
    btns = {}
    add = load('btn_add_to_screen.png')
    b, _ = cut_on_white(add, (120, 100, 1140, 1160))
    btns['btn_shortcut'] = fit(b, 180)
    b, _ = cut_on_white(sheet, (1146, 778, 1292, 966))
    btns['btn_profile'] = b
    b, _ = cut_on_white(sheet, (1292, 778, 1440, 966))
    btns['btn_share'] = b

    # ---------- pack atlas (simple shelf packer) ----------
    items = []
    for k, (im, m) in pops.items():
        sc = 1.0
        if k != 'pop_entry':            # sheet art is low-res: upscale once with Lanczos so it is not blurred twice on device
            sc = 1.5
            im = im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS)
        else:
            sc = 0.86
            im = im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS)
        m = dict(m)
        m['amount'] = [m['amount'][0] * sc, m['amount'][1] * sc]
        m['amountSize'] = m['amountSize'] * sc
        if 'go' in m: m['go'] = [v * sc for v in m['go']]
        items.append((k, im, m))
    for k, im in btns.items():
        items.append((k, im, {}))
    items.sort(key=lambda t: -t[1].height)
    W = 1024
    x = y = rowh = 0
    pos = {}
    for k, im, m in items:
        if x + im.width > W:
            x = 0; y += rowh + 2; rowh = 0
        pos[k] = (x, y)
        x += im.width + 2; rowh = max(rowh, im.height)
    H = y + rowh
    atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    frames = {}
    for k, im, m in items:
        px, py = pos[k]
        atlas.paste(im, (px, py), im)
        f = {'x': px, 'y': py, 'w': im.width, 'h': im.height}
        f.update({kk: (round(v, 1) if isinstance(v, float) else [round(q, 1) for q in v] if isinstance(v, list) else v) for kk, v in m.items()})
        frames[k] = f
    out = P('native', 'project', 'res', 'ui.png')
    atlas.save(out, optimize=True)
    try:
        q = atlas.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG)
        q.save(out + '.tmp.png', optimize=True)
        if os.path.getsize(out + '.tmp.png') < os.path.getsize(out) * 0.7:
            os.replace(out + '.tmp.png', out)
        else:
            os.remove(out + '.tmp.png')
    except Exception as ex:
        print('quantize skipped', ex)
    meta['image'] = 'res/ui.png'
    meta['frames'] = frames
    with open(P('js', 'ui_atlas.js'), 'w') as fh:
        fh.write('/* AUTO-GENERATED by tools/prepare_ui.py — do not edit. */\nvar UI_ATLAS = ' + json.dumps(meta) + ';\n')
    print('ui atlas', W, 'x', H, os.path.getsize(out) // 1024, 'KB; loading.jpg',
          os.path.getsize(P('native', 'project', 'ui', 'loading.jpg')) // 1024, 'KB')
    print(json.dumps(frames, indent=None)[:600])


if __name__ == '__main__':
    main()
