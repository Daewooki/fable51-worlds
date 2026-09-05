# Usage (inside Blender): blender --python blender_import.py -- scene.glb <shot>.keys.json
import bpy, json, sys
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if len(argv) < 2:
    print('usage: blender --python blender_import.py -- <scene.glb> <shot.keys.json>')
    sys.exit(1)
glb, keys_path = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
data = json.load(open(keys_path))
fps = data['fps']; scene = bpy.context.scene; scene.render.fps = fps
cam_data = bpy.data.cameras.new('MVCamera'); cam = bpy.data.objects.new('MVCamera', cam_data); scene.collection.objects.link(cam); scene.camera = cam
def keyframe(t, eye, look, fov):
    f = int(round(t * fps)); cam.location = (eye[0], -eye[2], eye[1])
    import mathutils
    direction = mathutils.Vector((look[0] - eye[0], -(look[2] - eye[2]), look[1] - eye[1]))
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler(); cam_data.angle = fov * 3.14159 / 180
    cam.keyframe_insert('location', frame=f); cam.keyframe_insert('rotation_euler', frame=f); cam_data.keyframe_insert('lens', frame=f)
for k in data['keys']:
    eye = k['eye'] if k['m'] == 'air' else [k['pos'][0], 1.7, k['pos'][1]]
    keyframe(k['t'], eye, k['look'], k.get('fov', 60 if k['m'] == 'air' else 66))
if data['keys']:
    scene.frame_end = int(round(data['keys'][-1]['t'] * fps))
bpy.ops.wm.save_as_mainfile(filepath=glb.replace('.glb', '.blend'))
print('saved', glb.replace('.glb', '.blend'))
