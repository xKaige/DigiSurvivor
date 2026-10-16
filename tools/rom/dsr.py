# Lector de los .PAK de Digimon World Dawn/Dusk + render de NCGR/NCLR/NCER a imagen.
import struct, ndspy.rom, ndspy.lz10

class Rom:
    def __init__(self, path): self.rom = ndspy.rom.NintendoDSRom.fromFile(path); self.cache = {}
    def pak(self, name):
        if name not in self.cache:
            d = bytes(self.rom.getFileByName('dat/' + name)); n = struct.unpack_from('<I', d, 0)[0]
            ents = [struct.unpack_from('<II', d, 4 + 8 * i) for i in range(n)]
            self.cache[name] = (d, ents)
        return self.cache[name]
    def entry(self, name, i):
        d, ents = self.pak(name); off, sz = ents[i]
        raw = d[off:off + (sz & 0x7fffffff)]
        return decomp(raw) if sz & 0x80000000 else raw
    def count(self, name): return len(self.pak(name)[1])

def decomp(b):
    t = b[0]
    if t in (0x10, 0x11): return bytes(ndspy.lz10.decompress(b))
    if t == 0x30:
        n = int.from_bytes(b[1:4], 'little'); out = bytearray(); i = 4
        while len(out) < n and i < len(b):
            f = b[i]; i += 1
            if f & 0x80: ln = (f & 0x7f) + 3; out += bytes([b[i]]) * ln; i += 1
            else: ln = (f & 0x7f) + 1; out += b[i:i + ln]; i += ln
        return bytes(out[:n])
    return b

def blocks(nitro):
    # Archivo Nitro: header 16 bytes (magic, bom, ver, size, hsize, nblocks) y bloques [magic,size,data]
    hs = struct.unpack_from('<H', nitro, 12)[0]; nb = struct.unpack_from('<H', nitro, 14)[0]
    out = {}; o = hs
    for _ in range(nb):
        m = nitro[o:o + 4].decode('latin1'); s = struct.unpack_from('<I', nitro, o + 4)[0]
        out[m] = nitro[o + 8:o + s]; o += s
    return out

def palette(nclr):
    b = blocks(nclr)['TTLP']
    depth, _, size, off = struct.unpack_from('<IIII', b, 0)
    raw = b[off - 8 + 8:] if False else b[16:16 + size]
    cols = []
    for i in range(0, len(raw) - 1, 2):
        c = struct.unpack_from('<H', raw, i)[0]
        cols.append(((c & 31) * 255 // 31, ((c >> 5) & 31) * 255 // 31, ((c >> 10) & 31) * 255 // 31))
    return cols

def chars(ncgr):
    b = blocks(ncgr)['RAHC']
    th, tw, depth, _, _, tiled, size, off = struct.unpack_from('<HHIHHIII', b, 0)
    data = b[off - 8 + 8 - 8 + 8:][:size] if False else b[24:24 + size]
    bpp = 4 if depth == 3 else 8
    return dict(bpp=bpp, data=data, tiled=tiled, tw=tw, th=th)

def tile_px(ch, idx):
    # devuelve 64 índices de color del tile idx
    if ch['bpp'] == 4:
        t = ch['data'][idx * 32: idx * 32 + 32]; px = []
        for byte in t: px += [byte & 15, byte >> 4]
    else:
        px = list(ch['data'][idx * 64: idx * 64 + 64])
    return px + [0] * (64 - len(px))

OBJ_SIZE = {(0, 0): (8, 8), (0, 1): (16, 16), (0, 2): (32, 32), (0, 3): (64, 64),
            (1, 0): (16, 8), (1, 1): (32, 8), (1, 2): (32, 16), (1, 3): (64, 32),
            (2, 0): (8, 16), (2, 1): (8, 32), (2, 2): (16, 32), (2, 3): (32, 64)}

def cells(ncer):
    b = blocks(ncer)['KBEC']
    n, ext, off = struct.unpack_from('<HHI', b, 0)
    mapping = struct.unpack_from('<I', b, 8)[0]
    base = off; cs = []
    csz = 16 if ext == 1 else 8
    oam_base = base + n * csz
    for i in range(n):
        noam, attr, ooff = struct.unpack_from('<HHI', b, base + i * csz)
        oams = []
        for j in range(noam):
            a0, a1, a2 = struct.unpack_from('<HHH', b, oam_base + ooff + j * 6)
            y = a0 & 0xff; y = y - 256 if y >= 128 else y
            x = a1 & 0x1ff; x = x - 512 if x >= 256 else x
            shape = a0 >> 14; size = a1 >> 14; w, h = OBJ_SIZE[(shape, size)]
            oams.append(dict(x=x, y=y, w=w, h=h, tile=a2 & 0x3ff, pal=a2 >> 12, hf=bool(a1 & 0x1000), vf=bool(a1 & 0x2000), c256=bool(a0 & 0x2000)))
        cs.append(oams)
    return cs, mapping

def render_cell(oams, ch, pal, mapping, scale_tile=None):
    from PIL import Image
    if not oams: return None
    x0 = min(o['x'] for o in oams); y0 = min(o['y'] for o in oams)
    x1 = max(o['x'] + o['w'] for o in oams); y1 = max(o['y'] + o['h'] for o in oams)
    img = Image.new('RGBA', (x1 - x0, y1 - y0), (0, 0, 0, 0)); P = img.load()
    # NCER mapping: 0..3 = 1D con límite de 32/64/128/256 bytes por índice de tile; 4 = 2D (32 bytes)
    bnd = (32 << mapping) if mapping < 4 else 32
    tsz = 32 if ch['bpp'] == 4 else 64
    for o in reversed(oams):
        tw, th = o['w'] // 8, o['h'] // 8
        start = o['tile'] * bnd // tsz
        for ty in range(th):
            for tx in range(tw):
                px = tile_px(ch, start + ty * tw + tx)
                for py in range(8):
                    for pxx in range(8):
                        ci = px[py * 8 + pxx]
                        if ci == 0: continue
                        col = pal[(o['pal'] * 16 + ci) if ch['bpp'] == 4 else ci] if ((o['pal'] * 16 + ci) < len(pal) or ch['bpp'] == 8) else (255, 0, 255)
                        lx = tx * 8 + pxx; ly = ty * 8 + py
                        if o['hf']: lx = o['w'] - 1 - lx
                        if o['vf']: ly = o['h'] - 1 - ly
                        P[o['x'] - x0 + lx, o['y'] - y0 + ly] = col + (255,)
    return img
