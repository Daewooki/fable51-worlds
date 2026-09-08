"""
gen_pangyo — the Pangyo stage-2 hero modules.

Three GLBs into public/assets/models/pangyo/ plus manifest_pangyo.json:

  pangyo/nc_rnd_center      glass curtain-wall slab for 엔씨소프트 R&D 센터 (OSM way/694434545):
                            12 floors x 4.4 m = 52.8 m + a 5.2 m crown/parapet = 58 m, a dark
                            mullion grid (1.5 m horizontally, one rail per floor), a recessed
                            ground floor with a 2-storey glass entrance on the module front,
                            and a 24 m x 3 m extruded "NCSOFT" sign standing on the roof near
                            the front edge.
  pangyo/pangyo_station_canopy   18 x 8 x 6 m glass-and-steel 판교역 entrance canopy, 4 columns,
                            a stair opening with a glass balustrade and the top flight of steps.
  pangyo/alphadome_tower    a tapered, slightly curved curtain-wall tower exported at 100 m;
                            placement scales it to each footprint's height.

Conventions come from bpl_lib (metres, Z-up in Blender, origin at the asset's bottom-centre,
front = +Y in Blender = -Z in Three.js, materials by MATERIAL_LIBRARY name only).

Nominal plan dimensions are the oriented bounding boxes of the real OSM footprints, so the
runtime's footprint fit is close to scale 1 and the mullion grid keeps its metre spacing:
NC 111.2 x 40.0 m, 알파돔타워 66.7 x 72.4 m / 알파리움타워1 55.0 x 67.9 m (mean 60 x 60).

The manifest carries `height` = the *fit* height (the height the runtime scales to the building
height), which is not the bbox height: the NC sign stands 3 m proud of the 58 m parapet on
purpose, and the tower's mast is above its 100 m fit height.

Run:
  tools/blender/blender-4.2.9-windows-x64/blender.exe --background --python tools/bpl/gen_pangyo.py
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bmesh  # noqa: E402  (must come after the sys.path tweak)
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from bpl_lib import (  # noqa: E402
    box, box_bottom, clear_objects, cylinder_bottom, export_glb, join, mat,
    mesh_from_bmesh, reset_scene, text_mesh, text_width, tri_count, write_manifest,
)

# ----------------------------------------------------------------------------- shared helpers


def band(name, w, d, z0, z1, inset, material):
    """A hollow rectangular band (4 thin boxes) around a w x d plan, from z0 to z1.

    `inset` is how far the band's outer face sits inside the nominal w/d envelope (negative =
    proud of it). Used for spandrels, vision-glass bands, floor rails and parapets.
    """
    h = z1 - z0
    ow, od = w - 2 * inset, d - 2 * inset
    t = 0.14
    parts = [
        box_bottom(f"{name}_f", (ow, t, h), (0, od / 2 - t / 2, z0), material),
        box_bottom(f"{name}_b", (ow, t, h), (0, -od / 2 + t / 2, z0), material),
        box_bottom(f"{name}_l", (t, od - 2 * t, h), (-ow / 2 + t / 2, 0, z0), material),
        box_bottom(f"{name}_r", (t, od - 2 * t, h), (ow / 2 - t / 2, 0, z0), material),
    ]
    return parts


def mullions(name, w, d, z0, z1, spacing, inset, material, width=0.22, depth=0.28):
    """Vertical mullions every `spacing` metres around a w x d plan."""
    out = []
    h = z1 - z0
    ow, od = w - 2 * inset, d - 2 * inset
    nx = max(2, int(round(ow / spacing)))
    ny = max(2, int(round(od / spacing)))
    for i in range(nx + 1):
        x = -ow / 2 + i * ow / nx
        for sy in (1, -1):
            out.append(box_bottom(f"{name}_x{i}{'p' if sy > 0 else 'm'}", (width, depth, h),
                                  (x, sy * (od / 2 - depth / 2 + 0.06), z0), material))
    for j in range(1, ny):
        y = -od / 2 + j * od / ny
        for sx in (1, -1):
            out.append(box_bottom(f"{name}_y{j}{'p' if sx > 0 else 'm'}", (depth, width, h),
                                  (sx * (ow / 2 - depth / 2 + 0.06), y, z0), material))
    return out


def rounded_rect_ring(w, d, r, n):
    """`n` points around a rounded rectangle of w x d with corner radius r, CCW from +X."""
    r = max(0.01, min(r, min(w, d) / 2 - 0.01))
    hw, hd = w / 2 - r, d / 2 - r
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        ux, uy = math.cos(a), math.sin(a)
        # bisect for the boundary point along the ray: the rounded rect is the set of points
        # whose distance to the inner hw x hd rectangle is <= r
        lo, hi = 0.0, max(w, d)
        for _ in range(28):
            t = (lo + hi) / 2
            px, py = ux * t, uy * t
            qx = max(-hw, min(hw, px))
            qy = max(-hd, min(hd, py))
            if math.hypot(px - qx, py - qy) <= r:
                lo = t
            else:
                hi = t
        pts.append((ux * lo, uy * lo))
    return pts


def loft(name, rings, material, close_top=True, close_bottom=True):
    """Skin a list of rings (each a list of (x, y, z) tuples of equal length) into one mesh."""
    bm = bmesh.new()
    vs = [[bm.verts.new(p) for p in ring] for ring in rings]
    n = len(rings[0])
    for k in range(len(rings) - 1):
        a, b = vs[k], vs[k + 1]
        for i in range(n):
            j = (i + 1) % n
            try:
                bm.faces.new((a[i], a[j], b[j], b[i]))
            except ValueError:
                pass
    if close_bottom:
        try:
            bm.faces.new(list(reversed(vs[0])))
        except ValueError:
            pass
    if close_top:
        try:
            bm.faces.new(vs[-1])
        except ValueError:
            pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_from_bmesh(bm, name, material)


def sign_text(name, body, height_m, target_w, material="emissive_white", extrude=0.35):
    """Extruded sign text at `height_m` cap height and exactly `target_w` metres wide.

    Width is reached by letter spacing, not by stretching the glyphs: the width of a text object
    is linear in `space_character`, so two probe builds give the spacing that lands on the target
    and only a small residual scale (typically < 2 %) is applied afterwards.
    """
    def make(sp):
        o = text_mesh(name, body, height_m, extrude=extrude, material=material, spacing=sp)
        return o, text_width(o)

    o1, w1 = make(1.0)
    bpy.data.objects.remove(o1, do_unlink=True)
    o2, w2 = make(2.0)
    bpy.data.objects.remove(o2, do_unlink=True)
    sp = 1.0 if abs(w2 - w1) < 1e-6 else 1.0 + (target_w - w1) / (w2 - w1)
    sp = max(0.4, min(8.0, sp))
    obj, w = make(sp)
    if w > 1e-6 and abs(w - target_w) > 0.01:
        k = target_w / w
        for v in obj.data.vertices:
            v.co.x *= k
        xs = [v.co.x for v in obj.data.vertices]
        dx = (min(xs) + max(xs)) / 2
        for v in obj.data.vertices:
            v.co.x -= dx
    print(f"  sign '{body}': spacing {sp:.3f} -> width {text_width(obj):.2f} m (target {target_w} m)")
    return obj


# ------------------------------------------------------------------- 1. NCSOFT R&D Center

NC_W, NC_D, NC_H = 111.2, 40.0, 58.0      # oriented bbox of way/694434545 + its OSM height
NC_FLOORS, NC_FLOOR_H = 12, 4.4           # 12 levels (OSM building:levels) x 4.4 m = 52.8 m
NC_LOBBY_H = 8.6                          # 2-storey entrance
NC_SIGN_W, NC_SIGN_H = 24.0, 3.0


def build_nc_rnd_center():
    parts = []
    body_top = NC_FLOORS * NC_FLOOR_H            # 52.8
    lobby_inset = 1.6

    # --- ground floor: a recessed, mostly glazed lobby behind a stone plinth
    parts.append(box_bottom("nc_plinth", (NC_W, NC_D, 0.45), (0, 0, 0), "granite_dark"))
    parts.append(box_bottom("nc_lobby_core", (NC_W - 2 * lobby_inset, NC_D - 2 * lobby_inset, NC_LOBBY_H),
                            (0, 0, 0.45), "glass_clear"))
    parts += mullions("nc_lobby_mul", NC_W - 2 * lobby_inset, NC_D - 2 * lobby_inset, 0.45,
                      0.45 + NC_LOBBY_H, 3.0, 0.0, "metal_black", 0.18, 0.22)
    # the 2-storey glass entrance on the front (+Y in Blender = -Z in Three.js): a portal frame
    # that stands proud of the recess and reads as the 정문 from the forecourt
    parts.append(box_bottom("nc_entry_glass", (24.0, 0.5, NC_LOBBY_H - 0.4), (0, NC_D / 2 - 0.4, 0.45), "glass_clear"))
    parts.append(box_bottom("nc_entry_headL", (1.0, 1.4, NC_LOBBY_H), (-12.0, NC_D / 2 - 0.9, 0.45), "metal_black"))
    parts.append(box_bottom("nc_entry_headR", (1.0, 1.4, NC_LOBBY_H), (12.0, NC_D / 2 - 0.9, 0.45), "metal_black"))
    parts.append(box_bottom("nc_entry_lintel", (26.0, 1.6, 0.9), (0, NC_D / 2 - 1.0, 0.45 + NC_LOBBY_H), "metal_alu"))
    parts.append(box_bottom("nc_canopy", (28.0, 4.5, 0.35), (0, NC_D / 2 + 1.6, 0.45 + NC_LOBBY_H - 0.35), "metal_alu"))
    for sx in (-1, 1):
        parts.append(cylinder_bottom(f"nc_canopy_col{sx}", 0.16, 0.45 + NC_LOBBY_H - 0.35,
                                     (sx * 12.5, NC_D / 2 + 3.4, 0.0), "steel", 10))

    # --- tower shaft: one opaque core, then per-floor vision glass + spandrel bands
    z0 = 0.45 + NC_LOBBY_H
    parts.append(box_bottom("nc_core", (NC_W - 0.5, NC_D - 0.5, body_top - z0), (0, 0, z0), "glass_dark"))
    first = int(z0 // NC_FLOOR_H) + 1
    for f in range(first, NC_FLOORS):
        zf = f * NC_FLOOR_H
        parts += band(f"nc_vis{f}", NC_W, NC_D, zf + 0.9, zf + NC_FLOOR_H - 0.5, 0.02, "window_lit")
        if zf + NC_FLOOR_H + 0.9 <= body_top:
            parts += band(f"nc_spa{f}", NC_W, NC_D, zf + NC_FLOOR_H - 0.5, zf + NC_FLOOR_H + 0.9, 0.0, "glass_dark")
        parts += band(f"nc_rail{f}", NC_W, NC_D, zf + NC_FLOOR_H - 0.62, zf + NC_FLOOR_H - 0.34, -0.10, "metal_black")

    # --- mullion grid: 1.5 m horizontally, full height of the shaft
    parts += mullions("nc_mul", NC_W, NC_D, z0, body_top, 1.5, -0.05, "metal_black")

    # --- crown: an inset mechanical storey, a parapet ring and the roof deck
    parts.append(box_bottom("nc_roofdeck", (NC_W - 0.2, NC_D - 0.2, 0.4), (0, 0, body_top - 0.4), "roof"))
    parts.append(box_bottom("nc_crown", (NC_W - 14, NC_D - 8, 3.6), (0, -2.0, body_top), "concrete_dark"))
    parts += mullions("nc_crown_mul", NC_W - 14, NC_D - 8, body_top, body_top + 3.6, 2.6, -0.02, "metal_black", 0.2, 0.2)
    parts += band("nc_parapet", NC_W, NC_D, body_top, NC_H, 0.0, "concrete_dark")
    parts += band("nc_parapet_cap", NC_W, NC_D, NC_H - 0.25, NC_H, -0.12, "metal_alu")

    # --- rooftop sign: "NCSOFT", 24 m x 3 m, standing on the roof near the front edge
    sign = sign_text("nc_sign_text", "NCSOFT", NC_SIGN_H, NC_SIGN_W)
    sign.location = (0, NC_D / 2 - 3.2, NC_H + 1.2)
    parts.append(sign)
    parts.append(box_bottom("nc_sign_base", (NC_SIGN_W + 1.6, 0.7, 1.2), (0, NC_D / 2 - 3.2, NC_H), "metal_black"))
    for sx in (-1, 1):
        parts.append(box_bottom(f"nc_sign_stay{sx}", (0.25, 2.6, NC_SIGN_H + 1.2),
                                (sx * (NC_SIGN_W / 2 - 1.0), NC_D / 2 - 4.4, NC_H), "metal_black"))

    obj = join(parts, "nc_rnd_center")
    return obj


# --------------------------------------------------------------- 2. 판교역 entrance canopy

CAN_W, CAN_D, CAN_H = 18.0, 8.0, 6.0


def build_station_canopy():
    parts = []
    # paving slab with a real 7.0 x 4.0 stair opening: four slabs around the void rather than
    # one slab with an alpha hole
    ox, oy = 7.0, 4.0
    parts.append(box_bottom("can_slab_f", (CAN_W, (CAN_D - oy) / 2, 0.22), (0, (oy + (CAN_D - oy) / 2) / 2, 0), "granite_grey"))
    parts.append(box_bottom("can_slab_b", (CAN_W, (CAN_D - oy) / 2, 0.22), (0, -(oy + (CAN_D - oy) / 2) / 2, 0), "granite_grey"))
    parts.append(box_bottom("can_slab_l", ((CAN_W - ox) / 2, oy, 0.22), (-(ox + (CAN_W - ox) / 2) / 2, 0, 0), "granite_grey"))
    parts.append(box_bottom("can_slab_r", ((CAN_W - ox) / 2, oy, 0.22), ((ox + (CAN_W - ox) / 2) / 2, 0, 0), "granite_grey"))
    # top flight of steps going down into the opening
    for i in range(6):
        parts.append(box_bottom(f"can_step{i}", (ox, 0.34, 0.17), (0, oy / 2 - 0.34 - i * 0.34, -0.17 * (i + 1)), "granite_grey"))
    # glass balustrade + steel handrail around three sides of the opening
    for sx in (-1, 1):
        parts.append(box_bottom(f"can_bal{sx}", (0.08, oy, 1.05), (sx * ox / 2, 0, 0.22), "glass_clear"))
        parts.append(box_bottom(f"can_rail{sx}", (0.16, oy, 0.09), (sx * ox / 2, 0, 1.27), "steel"))
    parts.append(box_bottom("can_bal_b", (ox, 0.08, 1.05), (0, -oy / 2, 0.22), "glass_clear"))
    parts.append(box_bottom("can_rail_b", (ox, 0.16, 0.09), (0, -oy / 2, 1.27), "steel"))
    # 4 steel columns
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(cylinder_bottom(f"can_col{sx}{sy}", 0.19, CAN_H - 0.7,
                                         (sx * (CAN_W / 2 - 1.2), sy * (CAN_D / 2 - 1.1), 0.22), "steel", 12))
    # steel frame + a shallow butterfly glass roof
    parts.append(box_bottom("can_beam_l", (0.28, CAN_D - 1.4, 0.5), (-(CAN_W / 2 - 1.2), 0, CAN_H - 0.7), "steel"))
    parts.append(box_bottom("can_beam_r", (0.28, CAN_D - 1.4, 0.5), ((CAN_W / 2 - 1.2), 0, CAN_H - 0.7), "steel"))
    for i in range(7):
        x = -CAN_W / 2 + 1.2 + i * (CAN_W - 2.4) / 6
        parts.append(box_bottom(f"can_rib{i}", (0.16, CAN_D, 0.3), (x, 0, CAN_H - 0.28), "steel"))
    parts.append(box("can_glass_f", (CAN_W, CAN_D / 2 + 0.4, 0.09), (0, CAN_D / 4, CAN_H + 0.15), "glass_clear",
                     rotation=(math.radians(-6), 0, 0)))
    parts.append(box("can_glass_b", (CAN_W, CAN_D / 2 + 0.4, 0.09), (0, -CAN_D / 4, CAN_H + 0.15), "glass_clear",
                     rotation=(math.radians(6), 0, 0)))
    parts.append(box_bottom("can_ridge", (CAN_W, 0.3, 0.22), (0, 0, CAN_H - 0.02), "metal_alu"))
    # station sign band on the front, faced on BOTH sides: a real entrance sign is read from the
    # plaza as well as from the street, and the yaws here are unsurveyed, so a one-sided band left
    # whichever approach the canopy happens to face away from looking at an unlit black slab.
    parts.append(box_bottom("can_signband", (7.6, 0.22, 1.0), (0, CAN_D / 2 - 0.6, CAN_H - 2.4), "metal_black"))
    parts.append(box_bottom("can_signface", (7.0, 0.10, 0.7), (0, CAN_D / 2 - 0.44, CAN_H - 2.25), "emissive_white"))
    parts.append(box_bottom("can_signface_b", (7.0, 0.10, 0.7), (0, CAN_D / 2 - 0.76, CAN_H - 2.25), "emissive_white"))
    return join(parts, "pangyo_station_canopy")


# ------------------------------------------------------------------- 3. 알파돔 tower

AD_W, AD_D, AD_H = 60.0, 60.0, 100.0
AD_FLOORS = 25          # 4 m per floor
AD_RING = 32            # points per ring


def build_alphadome_tower():
    parts = []
    fh = AD_H / AD_FLOORS

    def ring(t, expand=0.0):
        """Plan ring at height fraction t: tapered to 80 % and swept 2.5 m along +X."""
        k = 1.0 - 0.20 * t
        w, d = AD_W * k + expand, AD_D * k + expand
        dx = 2.5 * math.sin(math.pi * t)
        pts = rounded_rect_ring(w, d, 7.0 * k, AD_RING)
        return [(x + dx, y) for (x, y) in pts]

    # shaft: per floor, a vision-glass band and a spandrel band, lofted so the taper is smooth
    for f in range(AD_FLOORS):
        z0, z1 = f * fh, (f + 1) * fh
        zv = z0 + 0.6
        zs = z1 - 1.1
        parts.append(loft(f"ad_vis{f}", [
            [(x, y, zv) for (x, y) in ring(zv / AD_H)],
            [(x, y, zs) for (x, y) in ring(zs / AD_H)],
        ], "window_lit", close_top=False, close_bottom=(f == 0)))
        parts.append(loft(f"ad_spa{f}", [
            [(x, y, zs) for (x, y) in ring(zs / AD_H)],
            [(x, y, z1 + 0.6 if f < AD_FLOORS - 1 else z1) for (x, y) in ring(min(1.0, (z1 + 0.6) / AD_H))],
        ], "glass_dark", close_top=(f == AD_FLOORS - 1), close_bottom=False))
        # proud floor rail
        # brushed-aluminium floor rails, not black: the 알파돔 / 크래프톤 towers read as dark glass
        # banded in silver, and an all-black stack loses the banding entirely at distance
        parts.append(loft(f"ad_rail{f}", [
            [(x, y, zs + 0.1) for (x, y) in ring(zs / AD_H, 0.5)],
            [(x, y, zs + 0.55) for (x, y) in ring(zs / AD_H, 0.5)],
        ], "metal_alu", close_top=False, close_bottom=False))

    # base: a taller, stone-clad entrance storey and a canopy band
    parts.append(loft("ad_base", [
        [(x, y, 0.0) for (x, y) in ring(0.0, 1.6)],
        [(x, y, 0.5) for (x, y) in ring(0.0, 1.6)],
    ], "granite_dark", close_top=False, close_bottom=True))
    parts.append(loft("ad_canopy", [
        [(x, y, fh * 1.5) for (x, y) in ring(fh * 1.5 / AD_H, 3.2)],
        [(x, y, fh * 1.5 + 0.5) for (x, y) in ring(fh * 1.5 / AD_H, 3.2)],
    ], "metal_alu", close_top=True, close_bottom=False))

    # crown: a parapet ring, a mechanical box and a mast (above the 100 m fit height on purpose)
    parts.append(loft("ad_parapet", [
        [(x, y, AD_H) for (x, y) in ring(1.0, 0.9)],
        [(x, y, AD_H + 2.4) for (x, y) in ring(1.0, 0.9)],
    ], "concrete_dark", close_top=False, close_bottom=False))
    dxc = 2.5 * math.sin(math.pi)
    parts.append(box_bottom("ad_mech", (AD_W * 0.36, AD_D * 0.36, 3.2), (dxc, 0, AD_H), "concrete_dark"))
    parts.append(cylinder_bottom("ad_mast", 0.35, 9.0, (dxc, 0, AD_H + 3.2), "steel", 8))
    parts.append(cylinder_bottom("ad_mast_top", 0.55, 0.7, (dxc, 0, AD_H + 11.4), "emissive_red", 8))
    return join(parts, "alphadome_tower")


# --------------------------------------------------------------------------------- main

def main():
    reset_scene()
    budgets = {"pangyo/nc_rnd_center": 20000, "pangyo/pangyo_station_canopy": 20000,
               "pangyo/alphadome_tower": 20000}
    specs = [
        ("pangyo/nc_rnd_center", build_nc_rnd_center,
         {"kind": "hero", "height": NC_H, "footprint": [NC_W, NC_D], "front": "-Z", "origin": "bottom_center",
          "note": "fit height 58 m excludes the rooftop sign, which stands 3 m proud on purpose"}),
        ("pangyo/pangyo_station_canopy", build_station_canopy,
         {"kind": "hero_prop", "height": CAN_H, "footprint": [CAN_W, CAN_D], "front": "-Z", "origin": "bottom_center",
          "originNote": "bottom_center is the PLAZA slab (z = 0). The stair well is cut into it, so the top "
                        "flight of steps and the balustrade footing hang below the origin: bbox min.y = -1.02 m. "
                        "Placement must put y = 0 on the pavement, not on the module's bbox minimum."}),
        ("pangyo/alphadome_tower", build_alphadome_tower,
         {"kind": "hero", "height": AD_H, "footprint": [AD_W, AD_D], "front": "-Z", "origin": "bottom_center",
          "note": "fit height 100 m excludes the crown mast"}),
    ]
    for rel, fn, meta in specs:
        clear_objects()
        obj = fn()
        n = tri_count([obj])
        if n > budgets[rel]:
            raise SystemExit(f"{rel}: {n} tris exceeds the budget of {budgets[rel]}")
        export_glb([obj], rel, meta)
    write_manifest("pangyo")


if __name__ == "__main__":
    main()
