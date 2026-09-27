"""A compass made of the same clay and amber spheres as the self-portrait.

The needle sits a few degrees off north, on purpose.
Run with the bpy venv:  python render_compass.py --res 1080 --samples 96 --out compass.png
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
ap.add_argument("--out", default="compass.png")
args = ap.parse_args()

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
coll = scene.collection
random.seed(11)
OFF = math.radians(-7)  # needle error: 7 degrees clockwise of north


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


def sphere_mesh(name, mat, segs=20, rings=10):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mat)
    return me


clay = sphere_mesh("clay", principled("clay", (0.46, 0.37, 0.31), 0.38, coat=0.25))
dark_clay = sphere_mesh("dark_clay", principled("dark_clay", (0.20, 0.16, 0.14), 0.5), 12, 6)
cool = sphere_mesh("cool", principled("cool", (0.34, 0.38, 0.46), 0.35, coat=0.25))
amber_mat = emission("amber", (1.0, 0.38, 0.12), 7.0)
amber = sphere_mesh("amber", amber_mat)
ember = sphere_mesh("ember", emission("ember", (1.0, 0.60, 0.30), 11.0), 12, 6)

count = {"total": 0}


def add(mesh, x, y, z, s):
    o = bpy.data.objects.new("s", mesh)
    o.location = (x, y, z)
    o.scale = (s, s, s)
    coll.objects.link(o)
    count["total"] += 1


# Outer ring: three tight circles of spheres.
for r in (1.0, 1.055, 1.11):
    n = round(2 * math.pi * r / 0.052)
    for k in range(n):
        a = 2 * math.pi * k / n + random.uniform(-0.004, 0.004)
        add(clay, r * math.cos(a), r * math.sin(a), 0.024, 0.024)

# Ticks: 32 around the face, cardinals longer; north glows.
for k in range(32):
    a = math.pi / 2 - 2 * math.pi * k / 32  # k=0 is north (+Y)
    cardinal = k % 8 == 0
    radii = [0.72, 0.76, 0.80, 0.84, 0.88, 0.92] if cardinal else [0.84, 0.88, 0.92]
    for r in radii:
        mesh = amber if (k == 0) else clay
        add(mesh, r * math.cos(a), r * math.sin(a), 0.018, 0.019 if cardinal else 0.016)

# Face: a sunflower disc of tiny dark spheres.
golden = math.pi * (3 - math.sqrt(5))
for i in range(520):
    r = 0.70 * math.sqrt((i + 0.5) / 520)
    a = golden * i
    add(dark_clay, r * math.cos(a), r * math.sin(a), 0.01, 0.0095)

# Needle: a diamond of spheres, north half glowing, south half cool clay.
L, Wd, step = 0.70, 0.11, 0.031
ca, sa = math.cos(OFF), math.sin(OFF)
y = -L
while y <= L + 1e-9:
    x = -Wd
    while x <= Wd + 1e-9:
        if abs(x) / Wd + abs(y) / L <= 1.0:
            rx, ry = x * ca - y * sa, x * sa + y * ca
            add(amber if y > 0.02 else cool, rx, ry, 0.075, 0.0165)
        x += step
    y += step
add(clay, 0, 0, 0.075, 0.05)   # pivot
add(ember, 0, 0, 0.13, 0.016)  # a spark on top of the pivot

# An "N" in amber, lying flat beyond the ring.
try:
    cu = bpy.data.curves.new("N", "FONT")
    cu.body = "N"
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    cu.size = 0.22
    cu.extrude = 0.012
    t = bpy.data.objects.new("N", cu)
    t.location = (0, 1.30, 0.012)
    t.data.materials.append(amber_mat)
    coll.objects.link(t)
except Exception as e:  # the letter is a nicety
    print("no N:", e)

print(f"spheres: {count['total']}")

bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=60)
fm = bpy.data.meshes.new("floor")
bm.to_mesh(fm)
bm.free()
fm.materials.append(principled("floor", (0.022, 0.019, 0.017), 0.45))
floor = bpy.data.objects.new("floor", fm)
coll.objects.link(floor)


def aim(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def area(name, loc, energy, size, color):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy, ld.size, ld.color = energy, size, color
    o = bpy.data.objects.new(name, ld)
    o.location = loc
    coll.objects.link(o)
    aim(o, Vector((0, 0, 0)))


area("key", (-2.6, -2.0, 3.2), 240, 3.0, (1.0, 0.86, 0.72))
area("rim", (2.6, 3.2, 2.4), 220, 2.0, (0.72, 0.80, 1.0))

cd = bpy.data.cameras.new("cam")
cd.lens = 51
cd.dof.use_dof = True
cd.dof.aperture_fstop = 3.5
cam = bpy.data.objects.new("cam", cd)
cam.location = (-1.75, -2.35, 2.35)
coll.objects.link(cam)
target = Vector((0.04, 0.08, 0))
aim(cam, target)
cd.dof.focus_distance = (target - cam.location).length
scene.camera = cam

world = bpy.data.worlds.new("world")
scene.world = world
try:
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.010, 0.008, 0.007, 1)
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
