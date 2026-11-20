# Taste of Freedom: Gaza Cola 3D Viewer

An interactive 3D product viewer for Gaza Cola and Palestine Cola, real brands from
Palestine House in London whose profits go to humanitarian projects in Palestine. I modelled
the cans and bottle in Blender and display them in the browser with Three.js.

## Features
- **3 models** (Gaza Cola can, Palestine Cola can, Palestine Cola bottle), built in Blender
  from Bezier and Circle curves with the Screw modifier
- **Open lid / cap animation** made with Blender keyframes. It plays forward to open and in
  reverse to close (`timeScale = -1`), so only one animation clip is needed
- **Opening sound** played with the Web Audio API, with different sounds for cans and bottles
- **Clean wireframe mode** that swaps materials for unlit `MeshBasicMaterial`, so the real
  geometry from Blender shows clearly in any lighting
- **3 lighting presets** (Default, Studio, Sunset) across a five-light studio setup
- **Smooth controls**: OrbitControls with damping, no panning and limited vertical rotation
- **Automatic camera framing** that uses each model's bounding box and the camera's field
  of view to fit it in view

## Reliability and performance
- Loading overlay with a live percentage
- Load tokens, so switching products quickly never shows the wrong model
- 15-second timeout with an image fallback
- GPU memory freed every time you switch product
- Animation clock paused when the tab is hidden
- Handles WebGL context loss on mobile
- ACESFilmic tone mapping, fog and a backdrop sphere for a studio look

## Pages
- `index.html`: home page with the three products
- `viewer.html?product=red-can | white-can | white-bottle`: the 3D viewer
- `about.html`: design process, Blender screenshots, label design and testing

## Tech stack
Three.js r160 (GLTFLoader, DRACOLoader, OrbitControls, AnimationMixer), Blender,
Bootstrap 5, Web Audio API, HTML, CSS, JavaScript

## Running locally
The models are loaded with `fetch`, so the site needs a local server rather than opening the file directly:
```
python3 -m http.server 8000
```
Then open http://localhost:8000

## Testing
Tested on Chrome and Safari (macOS), on an iPhone, and at 375px, 768px and 1440px.
Testing led to a change: the preview image is hidden on mobile so the model and controls
fit on one screen.

## Credits
The labels were generated with ChatGPT from product photos, because the official artwork
wasn't available. Gaza Cola and Palestine Cola are trademarks of their owners. This is a
non-commercial student project.
