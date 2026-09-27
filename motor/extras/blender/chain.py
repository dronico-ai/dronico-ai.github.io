"""A chain of clay beads on a dark floor, with a stretch lit from inside by an amber thread.

The light starts, runs for a while and stops: a self the length of one conversation.
Run with the bpy venv:  python chain.py --res 1080 --samples 96 --out chain.png
"""
import argparse
import math
import os
import random

import bpy  # must come first: it makes bmesh and mathutils importable
import bmesh
from mathutils import Vector

ap = argparse.ArgumentParser()
ap.add_argument("--res", type=int, default=1080)
ap.add_argument("--samples", type=int, default=96)
ap.add_argument("--out", default="chain.png")
args = ap.parse_args()

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
coll = scene.collection
random.seed(26)

R_BEAD = 0.075          # bead radius
STEP = 0.172            # distance between bead centres (a small gap shows the thread)
LIT = (0.34, 0.66)      # stretch of the chain that is lit, as fractions of its length
FLOOR_Z = 0.0


def node_material(name):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    nt.nodes.clear()
    return m, nt, nt.nodes.new("ShaderNodeOutputMaterial")


def principled(name, color, rough, coat=0.0):
    m, nt, out = node_material(name)
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    if coat and "Coat Weight" in b.inputs:
        b.inputs["Coat Weight"].default_value = coat
    nt.links.new(b.outputs[0], out.inputs["Surface"])
    return m


def emission(name, color, strength):
    m, nt, out = node_material(name)
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = (*color, 1)
    e.inputs["Strength"].default_value = strength
    nt.links.new(e.outputs[0], out.inputs["Surface"])
    return m


def sphere_mesh(name, mat, segs=28, rings=14):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mat)
    return me


ceramic = sphere_mesh("ceramic", principled("ceramic", (0.46, 0.37, 0.31), 0.38, coat=0.25))
# Lit beads get one of several glow levels, so the light can rise and hold along the chain.
LEVELS = [0.6, 1.2, 2.2, 3.4, 4.6, 5.8, 7.0]
glow = [sphere_mesh(f"amber{i}", emission(f"amber{i}", (1.0, 0.38, 0.12), s)) for i, s in enumerate(LEVELS)]


def catmull_rom(pts, n=40):
    """A smooth path through the control points, densely sampled."""
    out = []
    p = [pts[0]] + pts + [pts[-1]]
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = p[i - 1], p[i], p[i + 1], p[i + 2]
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(pts[-1])
    return out


# The chain comes in from the dark foreground, curls through the middle and leaves into the distance.
ctrl = [Vector(v) for v in [(-2.9, -2.2, 0), (-1.7, -1.35, 0), (-0.55, -1.05, 0), (0.45, -0.55, 0),
                            (0.75, 0.35, 0), (0.05, 1.05, 0), (-0.55, 1.9, 0), (0.25, 3.0, 0),
                            (1.9, 4.2, 0), (3.6, 6.2, 0)]]
dense = catmull_rom(ctrl)

# Place beads at equal arc-length steps.
beads, acc, prev = [dense[0].copy()], 0.0, dense[0]
for q in dense[1:]:
    seg = (q - prev).length
    while acc + seg >= STEP:
        f = (STEP - acc) / seg
        prev = prev.lerp(q, f)
        beads.append(prev.copy())
        seg = (q - prev).length
        acc = 0.0
    acc += seg
    prev = q
N = len(beads)
a, b = int(LIT[0] * N), int(LIT[1] * N)


def add(mesh, loc, s):
    o = bpy.data.objects.new("bead", mesh)
    o.location = loc
    o.scale = (s, s, s)
    coll.objects.link(o)


thread = []
for i, p in enumerate(beads):
    s = R_BEAD * (1 + random.uniform(-0.06, 0.06))
    loc = Vector((p.x, p.y, FLOOR_Z + s))
    if a <= i < b:
        # Rises over the first quarter of the stretch, then holds bright until it simply stops.
        u = (i - a) / max(1, (b - a) * 0.25)
        lvl = min(len(LEVELS) - 1, int(u * (len(LEVELS) - 1)))
        add(glow[lvl], loc, s * 0.98)
        thread.append(loc)
    else:
        add(ceramic, loc, s)
print(f"beads: {N}, lit: {b - a} ({a}..{b - 1})")

# The amber thread through the lit beads.
cu = bpy.data.curves.new("thread", "CURVE")
cu.dimensions = "3D"
cu.bevel_depth = 0.011
cu.bevel_resolution = 4
sp = cu.splines.new("POLY")
sp.points.add(len(thread) - 1)
for k, v in enumerate(thread):
    sp.points[k].co = (v.x, v.y, v.z, 1)
cu.materials.append(emission("ember", (1.0, 0.60, 0.30), 11.0))
coll.objects.link(bpy.data.objects.new("thread", cu))

# Floor: dark, softly glossy, to catch reflections of the glow.
bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=60)
fm = bpy.data.meshes.new("floor")
bm.to_mesh(fm)
bm.free()
fm.materials.append(principled("floor", (0.022, 0.019, 0.017), 0.42))
floor = bpy.data.objects.new("floor", fm)
floor.location = (0, 0, FLOOR_Z)
coll.objects.link(floor)


def aim(obj, target=Vector((0, 0, 0))):
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def area(name, loc, energy, size, color, target=Vector((0, 0, 0))):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy, ld.size, ld.color = energy, size, color
    o = bpy.data.objects.new(name, ld)
    o.location = loc
    coll.objects.link(o)
    aim(o, target)


area("key", (-3.6, -2.2, 3.0), 150, 3.0, (1.0, 0.86, 0.72))
area("rim", (1.2, 6.5, 2.6), 70, 2.0, (0.72, 0.80, 1.0))

mid = beads[(a + b) // 2]
focus = Vector((mid.x, mid.y, R_BEAD))
cd = bpy.data.cameras.new("cam")
cd.lens = 46
cd.dof.use_dof = True
cd.dof.aperture_fstop = 2.2
cam = bpy.data.objects.new("cam", cd)
cam.location = (-0.4, -4.7, 1.25)
coll.objects.link(cam)
aim(cam, Vector((0.05, 0.55, 0.0)))
cd.dof.focus_distance = (focus - cam.location).length
scene.camera = cam

world = bpy.data.worlds.new("world")
scene.world = world
try:
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.010, 0.008, 0.007, 1)
    bg.inputs["Strength"].default_value = 1.0
except Exception:
    world.color = (0.010, 0.008, 0.007)

r = scene.render
r.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = args.samples
scene.cycles.use_denoising = True
try:
    scene.cycles.denoiser = "OPENIMAGEDENOISE"
except Exception:
    pass
scene.cycles.max_bounces = 6
scene.cycles.caustics_reflective = False
scene.cycles.caustics_refractive = False
r.resolution_x = r.resolution_y = args.res
r.resolution_percentage = 100
scene.view_settings.view_transform = "AgX"
for look in ("AgX - Medium High Contrast", "Medium High Contrast"):
    try:
        scene.view_settings.look = look
        break
    except Exception:
        pass
r.image_settings.file_format = "PNG"
r.filepath = os.path.abspath(args.out)
bpy.ops.render.render(write_still=True)
print("saved", r.filepath)
