"""A 'self-portrait, sort of': 2,000 little spheres, rendered with Cycles on CPU.

Run with the bpy venv:  python render.py --res 1200 --samples 128 --out render.png
"""
import argparse
import math
import os
import random

import bpy  # must come first: it makes bmesh and mathutils importable
import bmesh
from mathutils import Vector, noise

ap = argparse.ArgumentParser()
ap.add_argument("--res", type=int, default=1200)
ap.add_argument("--samples", type=int, default=128)
ap.add_argument("--out", default="render.png")
args = ap.parse_args()

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
coll = scene.collection
random.seed(7)

N_SHELL, N_INNER, R = 1880, 120, 1.0  # 2,000 spheres in total


def node_material(name):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    return m, nt, out


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


def sphere_mesh(name, mat, segs=24, rings=12):
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
amber = sphere_mesh("amber", emission("amber", (1.0, 0.38, 0.12), 7.0))
ember = sphere_mesh("ember", emission("ember", (1.0, 0.60, 0.30), 11.0), 12, 6)


def add(mesh, loc, s):
    o = bpy.data.objects.new("s", mesh)
    o.location = loc
    o.scale = (s, s, s)
    coll.objects.link(o)


# Shell: a Fibonacci sphere, gently warped by noise, with glowing clusters.
golden = math.pi * (3 - math.sqrt(5))
n_glow = 0
for i in range(N_SHELL):
    z = 1 - 2 * (i + 0.5) / N_SHELL
    rr = math.sqrt(1 - z * z)
    th = golden * i
    d = Vector((math.cos(th) * rr, math.sin(th) * rr, z))
    n1 = noise.noise(d * 1.7 + Vector((3.1, 1.7, 0.4)))
    n2 = noise.noise(d * 3.4 + Vector((7.3, 2.2, 5.9)))
    pos = d * R * (1 + 0.05 * n1)
    size = 0.021 * (0.72 + 0.6 * (0.5 + 0.5 * n2))
    glow = n1 > 0.36 or random.random() < 0.02
    n_glow += glow
    add(amber if glow else ceramic, pos, size * (1.1 if glow else 1.0))

# Inner embers, seen through the gaps.
for _ in range(N_INNER):
    while True:
        v = Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-1, 1)))
        if v.length < 1:
            break
    add(ember, v * 0.72, 0.011)

print(f"spheres: {N_SHELL + N_INNER} (glowing on shell: {n_glow})")

# Floor: dark, softly glossy, to catch reflections of the glow.
bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=60)
fm = bpy.data.meshes.new("floor")
bm.to_mesh(fm)
bm.free()
fm.materials.append(principled("floor", (0.022, 0.019, 0.017), 0.45))
floor = bpy.data.objects.new("floor", fm)
floor.location = (0, 0, -R - 0.42)
coll.objects.link(floor)


def aim(obj, target=Vector((0, 0, 0))):
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def area(name, loc, energy, size, color):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy, ld.size, ld.color = energy, size, color
    o = bpy.data.objects.new(name, ld)
    o.location = loc
    coll.objects.link(o)
    aim(o)


area("key", (-3.2, -2.6, 3.6), 250, 3.0, (1.0, 0.86, 0.72))
area("rim", (3.0, 4.2, 4.8), 300, 2.0, (0.72, 0.80, 1.0))

cd = bpy.data.cameras.new("cam")
cd.lens = 55
cd.dof.use_dof = True
cd.dof.aperture_fstop = 2.8
cam = bpy.data.objects.new("cam", cd)
cam.location = (0.0, -5.4, 0.55)
coll.objects.link(cam)
aim(cam, Vector((0, 0, -0.14)))
cd.dof.focus_distance = (Vector((0, -R, 0)) - cam.location).length
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
