#!/usr/bin/env python3
"""Cut new cat costumes out of assets_src/costumes_sheet.png (6x3 grid on a blue backdrop).

  python3 -I tools/cut_costumes.py [--preview out.png]

For each costume: remove the blue backdrop (flood fill of blue-ish pixels from the cell border),
keep the largest blob, trim, scale to the existing sprites' size (~245 px wide), detect the
eyes (two big dark blobs) + nose + skin colours for the mood painter, and write:
  assets_src/cat_<name>.webp  +  entries merged into assets_src/cat_meta.json
Branded superhero look-alikes (row 1 except the princess) are deliberately NOT used (trademark risk).
The police cat is skipped: its uniform is the backdrop blue and cannot be cut cleanly.
"""
import json, os, sys
import numpy as np
import cv2
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SHEET = os.path.join(ROOT, 'assets_src', 'costumes_sheet.png')
COLW = 224
ROWS = [(40, 318), (334, 588), (600, 878)]   # each row ends at its shelf line
# name: (col, row, manual eye overrides in output px or None)
USE = {
    'princess':    (4, 0),
    'astronaut':   (0, 1),
    'pirate':      (1, 1),
    'wizard':      (2, 1),
    'firefighter': (3, 1),
    'chef':        (5, 1),
    'reindeer':    (5, 2),
}
TARGET_W = 245


def cut(sheet, col, row):
    """GrabCut: sure background = strict backdrop blue flooded from the cell border (+ the border itself),
    sure foreground = an ellipse on the body; colour models + smoothness separate the rest. Plain colour
    keying fails here: the shark/wizard/police blues are the backdrop blue."""
    x0, x1 = col * COLW, (col + 1) * COLW
    y0, y1 = ROWS[row]
    img = np.ascontiguousarray(sheet[y0:y1, x0:x1, :3])
    H, W = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV_FULL).astype(float)
    h, s, v = hsv[:, :, 0] * 360 / 256, hsv[:, :, 1] / 255, hsv[:, :, 2] / 255
    strict = (h > 208) & (h < 224) & (s > 0.55) & (v > 0.62)
    mask = np.full((H, W), cv2.GC_PR_FGD, np.uint8)
    ff = np.zeros((H + 2, W + 2), np.uint8); m = (~strict).astype(np.uint8)
    for (sx, sy) in [(x, 0) for x in range(0, W, 2)] + [(x, H - 1) for x in range(0, W, 2)] + [(0, y) for y in range(0, H, 2)] + [(W - 1, y) for y in range(0, H, 2)]:
        if strict[sy, sx] and ff[sy + 1, sx + 1] == 0:
            cv2.floodFill(m, ff, (sx, sy), 2, 0, 0, flags=4 | (255 << 8) | cv2.FLOODFILL_MASK_ONLY)
    bgfl = ff[1:-1, 1:-1] > 0
    mask[bgfl] = cv2.GC_BGD; mask[strict & ~bgfl] = cv2.GC_PR_BGD
    mask[:3, :] = cv2.GC_BGD; mask[:, :3] = cv2.GC_BGD; mask[:, -3:] = cv2.GC_BGD
    cv2.ellipse(mask, (W // 2, int(H * 0.58)), (int(W * 0.22), int(H * 0.2)), 0, 0, 360, int(cv2.GC_FGD), -1)
    bgd = np.zeros((1, 65), np.float64); fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(cv2.cvtColor(img, cv2.COLOR_RGB2BGR), mask, None, bgd, fgd, 8, cv2.GC_INIT_WITH_MASK)
    fg = ((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(fg, 8)
    fg = (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8) * 255
    inv = 255 - fg; fl = inv.copy(); hm = np.zeros((H + 2, W + 2), np.uint8); cv2.floodFill(fl, hm, (0, 0), 0)
    fg = fg | fl                                     # fill holes
    alpha = cv2.GaussianBlur(fg, (3, 3), 0.8)
    rgba = np.dstack([img, alpha])
    ys, xs = np.where(alpha > 10)
    rgba = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    im = Image.fromarray(rgba.astype(np.uint8), 'RGBA')
    sc = TARGET_W / im.width
    return im.resize((TARGET_W, round(im.height * sc)), Image.LANCZOS)


def face_meta(im):
    a = np.array(im).astype(int)
    rgb, al = a[:, :, :3], a[:, :, 3]
    H, W = al.shape
    lum = rgb.mean(axis=2)
    dark = ((lum < 70) & (al > 200)).astype(np.uint8)
    # search the face band only
    band = np.zeros_like(dark); band[int(H * 0.30):int(H * 0.72), int(W * 0.15):int(W * 0.85)] = 1
    dark = dark & band
    dark = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    n, lab, st, cen = cv2.connectedComponentsWithStats(dark, 8)
    cands = []
    for i in range(1, n):
        x, y, w, h, area = st[i]
        if area < 250 or w > W * 0.35 or h > H * 0.3: continue
        if not (0.55 < w / max(1, h) < 1.9): continue
        cands.append((area, cen[i][0], cen[i][1], w, h))
    cands.sort(reverse=True)
    left = [c for c in cands if c[1] < W / 2]
    right = [c for c in cands if c[1] >= W / 2]
    if not left and not right:
        return None
    if not left or not right:                        # one eye hidden (eye patch merged into the hat shadow)
        eye = (left or right)[0]
        fake = (eye[0] * 3, W - eye[1], eye[2], eye[3], eye[4])
        L, R = (fake, eye) if not left else (eye, fake)
    else:
        L, R = left[0], right[0]
    patch = None
    for A, B in ((L, R), (R, L)):                   # eye patch: one blob much bigger than the other
        if A[0] > B[0] * 1.8:
            patch = A
    if patch is not None:
        eye = R if patch is L else L
        e = [round(eye[1], 1), round(eye[2], 1), round(eye[3] / 2 * 1.08, 1), round(eye[4] / 2 * 1.08, 1)]
        def sample1(x, y):
            x, y = int(min(W - 1, max(0, x))), int(min(H - 1, max(0, y)))
            p = rgb[max(0, y - 2):y + 3, max(0, x - 2):x + 3].reshape(-1, 3).mean(axis=0)
            return [int(v) for v in p]
        nx = (patch[1] + eye[1]) / 2
        return {'w': W, 'h': H, 'eyes': [e], 'patch': True, 'skin': sample1(eye[1], eye[2] + eye[4] * 1.0),
                'skinTop': sample1(nx, eye[2] - eye[4] * 0.95), 'nose': [round(nx, 1), round(eye[2] + eye[4] * 0.55, 1)]}
    eyes = [[round(L[1], 1), round(L[2], 1), round(L[3] / 2 * 1.08, 1), round(L[4] / 2 * 1.08, 1)],
            [round(R[1], 1), round(R[2], 1), round(R[3] / 2 * 1.08, 1), round(R[4] / 2 * 1.08, 1)]]
    ey = (L[2] + R[2]) / 2
    ry = (L[4] + R[4]) / 4
    nose = [round((L[1] + R[1]) / 2, 1), round(ey + ry * 1.05, 1)]

    def sample(x, y):
        x, y = int(min(W - 1, max(0, x))), int(min(H - 1, max(0, y)))
        p = rgb[max(0, y - 2):y + 3, max(0, x - 2):x + 3].reshape(-1, 3).mean(axis=0)
        return [int(v) for v in p]
    skin = sample(L[1] + (R[1] - L[1]) * 0.18, ey + ry * 2.0)       # cheek, below/inside the left eye
    skinTop = sample((L[1] + R[1]) / 2, ey - ry * 1.9)              # forehead fur between the eyes
    return {'w': W, 'h': H, 'eyes': eyes, 'skin': skin, 'skinTop': skinTop, 'nose': nose}


def main():
    sheet = np.array(Image.open(SHEET).convert('RGBA'))
    meta_path = os.path.join(ROOT, 'assets_src', 'cat_meta.json')
    meta = json.load(open(meta_path))
    prev = []
    for name, (col, row) in USE.items():
        im = cut(sheet, col, row)
        fm = face_meta(im)
        if fm is None:
            print('!! eyes not found for', name); continue
        im.save(os.path.join(ROOT, 'assets_src', 'cat_%s.webp' % name), quality=92, method=6)
        meta[name] = fm
        print(name, im.size, 'eyes', fm['eyes'], 'nose', fm['nose'], 'skin', fm['skin'], fm['skinTop'])
        prev.append((name, im, fm))
    json.dump(meta, open(meta_path, 'w'), indent=1)
    if '--preview' in sys.argv:
        out = sys.argv[sys.argv.index('--preview') + 1]
        Wt = sum(p[1].width + 10 for p in prev); Ht = max(p[1].height for p in prev)
        canvas = Image.new('RGBA', (Wt, Ht), (240, 200, 210, 255)); x = 0
        from PIL import ImageDraw
        for name, im, fm in prev:
            canvas.alpha_composite(im, (x, 0)); d = ImageDraw.Draw(canvas)
            for e in fm['eyes']:
                d.ellipse([x + e[0] - e[2], e[1] - e[3], x + e[0] + e[2], e[1] + e[3]], outline=(0, 255, 0, 255), width=2)
            d.ellipse([x + fm['nose'][0] - 4, fm['nose'][1] - 4, x + fm['nose'][0] + 4, fm['nose'][1] + 4], fill=(255, 0, 255, 255))
            x += im.width + 10
        canvas.convert('RGB').save(out)


if __name__ == '__main__':
    main()
