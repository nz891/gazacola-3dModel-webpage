// THREE.JS IMPORTS
import * as THREE from "three";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/DRACOLoader.js";

// CONFIG

THREE.Cache.enabled = true;

const DEBUG = false;
const LOAD_TIMEOUT_MS = 15000;

const EDGE_HELPER_NAME = "__gc_edges_helper__";
const WIRE_OVERLAY_NAME = "__gc_wire_overlay__";

// Lighting presets 
const LIGHTING_PRESETS = 
{
  DEFAULT: 'default',
  STUDIO: 'studio',
  SUNSET: 'sunset'
};

/* 
   DOM ELEMENTS
 */

const heroProductImage = document.getElementById("heroProductImage");
const heroImageLabel = document.getElementById("heroImageLabel");
const selectedProductTitle = document.getElementById("selectedProductTitle");
const modelSourceLabel = document.getElementById("modelSourceLabel");

const wireframeBtn = document.getElementById("wireframeBtn");
const rotateBtn = document.getElementById("rotateBtn");
const capToggleBtn = document.getElementById("capToggleBtn");
const resetBtn = document.getElementById("resetBtn");
const lightingBtn = document.getElementById("lightingBtn");

const productSelector = document.getElementById("productSelector");
const canvasContainer = document.getElementById("threeCanvasContainer");

if (!canvasContainer) 
{
  throw new Error("threeCanvasContainer not found");
}

/* 
   LOADERS
 */

const textureLoader = new THREE.TextureLoader();

//AUDIO SYSTEM using browser's built in Web Audio API

let audioContext = null;
let canOpenSound = null;
let bottleOpenSound = null;

function initAudio() {
  if (!window.AudioContext && !window.webkitAudioContext) 
  {
    return;
  }

  try {
    audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
  } catch (error) {
    console.warn("AudioContext not supported");
    return;
  }

  // load both sounds in the background so they are ready before the user presses anything
  loadSound("./assets/sounds/can_opening_sound.mp3", (buffer) => 
  {
    canOpenSound = buffer;
  });

  loadSound("./assets/sounds/bottle_opening_sound.mp3", (buffer) => 
  {
    bottleOpenSound = buffer;
  });
}

function loadSound(url, callback) 
{
  if (!audioContext) return;

  fetch(url)
    .then((response) => response.arrayBuffer())
    .then((arrayBuffer) => audioContext.decodeAudioData(arrayBuffer))
    .then((audioBuffer) => 
    {
      callback(audioBuffer);
    })
    .catch((error) => 
    {
      console.warn("Failed to load sound:", url, error);
    });
}

function playSound(buffer) 
{
  if (!audioContext || !buffer) return;

  // suspend AudioContext until the user interacts with the page
  if (audioContext.state === "suspended") 
  {
    audioContext.resume();
  }

  const source = audioContext.createBufferSource();

  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.start(0);
}

//MODELS

const PRODUCTS = 
{
  "red-can": 
  {
    key: "red-can",
    label: "Gaza Cola Can",
    title: "Gaza Cola Can",

    image: "./assets/images/red-can.png",
    fallbackImage: "./assets/images/red-can.png",
    model: "./assets/models/red-can.glb",

    rotationY: 0.18,
    targetHeight: 3.0,
    viewPadding: 1.22,

    animationName: "Can_Open",

    openLabel: "Open lid",
    closeLabel: "Close lid",

    yAdjust: 0,
    scaleMultiplier: 1,

    wireStyle: "mesh-wire",
    wireColor: 0x920018,
    edgeThreshold: 25,

    soundType: "can"
  },

  "white-can": 
  {
    key: "white-can",
    label: "Palestine Cola Can",
    title: "Palestine Cola Can",

    image: "./assets/images/white-can.png",
    fallbackImage: "./assets/images/white-can.png",
    model: "./assets/models/white-can.glb",

    rotationY: 0.18,
    targetHeight: 3.0,
    viewPadding: 1.22,

    animationName: "BezierCurve.004Action",

    openLabel: "Open lid",
    closeLabel: "Close lid",

    yAdjust: 0,
    scaleMultiplier: 1,

    wireStyle: "mesh-wire",
    wireColor: 0x920018,
    edgeThreshold: 25,

    soundType: "can"
  },

  "white-bottle": 
  {
    key: "white-bottle",
    label: "Palestine Cola Bottle",
    title: "Palestine Cola Bottle",

    image: "./assets/images/bottlepic.png",
    fallbackImage: "./assets/images/bottlepic.png",
    model: "./assets/models/white-bottle.glb",

    rotationY: 0.14,
    targetHeight: 3.15,
    viewPadding: 1.26,

    animationName: null,

    openLabel: "Open Cap",
    closeLabel: "Close Cap",

    yAdjust: 0,
    scaleMultiplier: 1,

    wireStyle: "mesh-wire",
    wireColor: 0x4a4a4a,
    edgeThreshold: 30,

    soundType: "bottle"
  }
};

//Three.js variables

let scene;
let camera;
let renderer;
let controls;
let clock;

let gltfLoader;
let dracoLoader;

let currentProduct = null;

let currentModelRoot = null;
let currentPivotGroup = null;
let currentRenderableModel = null;

let mixer = null;
let activeAction = null;
let activeClipDuration = 0;

let autoRotate = false;
let wireframeEnabled = false;

let isActionOpenState = false;
let isActionPlaying = false;

let defaultPivotRotationY = 0;
let floatingBaseY = 0;

let floorShadow = null;
let ground = null;

let loadingOverlay = null;
let loadingText = null;

let stallTimer = null;
let activeLoadToken = 0;

//Five lights for a studio product photography setup
//Three presets: Default, Studio, Sunset

let currentLightingPreset = LIGHTING_PRESETS.DEFAULT;
let ambientLight, hemisphereLight, keyLight, fillLight, rimLight, frontLight;

function addLights() 
{
  // Ambient light
  ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
  scene.add(ambientLight);

  // Hemisphere light
  hemisphereLight = new THREE.HemisphereLight(0xffffff, 0xdfe7ef, 1.0);
  hemisphereLight.position.set(0, 10, 0);
  scene.add(hemisphereLight);

  // Key light (main directional)
  keyLight = new THREE.DirectionalLight(0xffffff, 1.85);
  keyLight.position.set(5.2, 7.0, 6.2);
  keyLight.castShadow = true;
  scene.add(keyLight);

  // Fill light
  fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
  fillLight.position.set(-5.4, 4.6, 5.2);
  scene.add(fillLight);

  // Rim light
  rimLight = new THREE.DirectionalLight(0xffffff, 0.9);
  rimLight.position.set(-4.8, 5.2, -5.4);
  scene.add(rimLight);

  // Front light
  frontLight = new THREE.DirectionalLight(0xffffff, 0.55);
  frontLight.position.set(0, 2.6, 6.2);
  scene.add(frontLight);
}

function setLightingPreset(preset) 
{
  currentLightingPreset = preset;
  
  switch(preset) 
  {
    case LIGHTING_PRESETS.STUDIO:
      // Studio lighting
      ambientLight.intensity = 0.85;
      hemisphereLight.intensity = 0.7;
      keyLight.intensity = 2.2;
      keyLight.position.set(3.5, 5.0, 4.5);
      fillLight.intensity = 1.1;
      fillLight.position.set(-3.2, 3.8, 4.2);
      rimLight.intensity = 1.3;
      rimLight.position.set(-2.5, 4.0, -3.8);
      frontLight.intensity = 0.9;
      frontLight.position.set(0, 1.8, 5.5);
      // Slight warm tint for studio
      keyLight.color.setHex(0xfff5e6);
      fillLight.color.setHex(0xe8eef4);
      break;
      
    case LIGHTING_PRESETS.SUNSET:
      // sunset lighting for golden hour
      ambientLight.intensity = 0.55;
      hemisphereLight.intensity = 0.5;
      keyLight.intensity = 1.6;
      keyLight.position.set(-3.2, 2.5, 5.8);
      keyLight.color.setHex(0xffaa66);
      fillLight.intensity = 0.95;
      fillLight.position.set(2.8, 3.2, 4.5);
      fillLight.color.setHex(0xff8866);
      rimLight.intensity = 0.7;
      rimLight.position.set(3.5, 3.0, -4.2);
      rimLight.color.setHex(0xffaa77);
      frontLight.intensity = 0.45;
      frontLight.position.set(0, 1.2, 4.8);
      frontLight.color.setHex(0xffcc99);
      break;
      
    case LIGHTING_PRESETS.DEFAULT:
    default:
      // Default lighting balanced
      ambientLight.intensity = 1.2;
      hemisphereLight.intensity = 1.0;
      keyLight.intensity = 1.85;
      keyLight.position.set(5.2, 7.0, 6.2);
      keyLight.color.setHex(0xffffff);
      fillLight.intensity = 0.8;
      fillLight.position.set(-5.4, 4.6, 5.2);
      fillLight.color.setHex(0xffffff);
      rimLight.intensity = 0.9;
      rimLight.position.set(-4.8, 5.2, -5.4);
      rimLight.color.setHex(0xffffff);
      frontLight.intensity = 0.55;
      frontLight.position.set(0, 2.6, 6.2);
      frontLight.color.setHex(0xffffff);
      break;
  }
  
  // Update button text to show which light
  if (lightingBtn) 
    {
    switch(preset) 
    {
      case LIGHTING_PRESETS.STUDIO:
        lightingBtn.textContent = "Studio Light";
        break;
      case LIGHTING_PRESETS.SUNSET:
        lightingBtn.textContent = "Sunset Light";
        break;
      default:
        lightingBtn.textContent = "Default Light";
        break;
    }
  }
}

// goes through the three lights each time the button is clicked
function cycleLightingPreset() 
{
  switch(currentLightingPreset) 
  {
    case LIGHTING_PRESETS.DEFAULT:
      setLightingPreset(LIGHTING_PRESETS.STUDIO);
      break;
    case LIGHTING_PRESETS.STUDIO:
      setLightingPreset(LIGHTING_PRESETS.SUNSET);
      break;
    case LIGHTING_PRESETS.SUNSET:
      setLightingPreset(LIGHTING_PRESETS.DEFAULT);
      break;
    default:
      setLightingPreset(LIGHTING_PRESETS.DEFAULT);
      break;
  }
}


const query = new URLSearchParams(window.location.search);

const requestedProduct = query.get("product");

currentProduct =
  PRODUCTS[requestedProduct] || PRODUCTS["red-can"];

//  starting app

init();
loadProduct(currentProduct);
animate();

//helpers

function log(...args) 
{
  if (DEBUG) {
    console.log("[Viewer]", ...args);
  }
}

function warn(...args) 
{
  if (DEBUG) {
    console.warn("[Viewer]", ...args);
  }
}

//init

function init() 
{
  initScene();
  initLoader();
  initAudio();
  initUI();

  updateProductUI(currentProduct);
}

//setting up scene

function initScene() 
{
  scene = new THREE.Scene();

  scene.background = new THREE.Color(0xf2f4f7);
  // Fog so edges fade naturally
  scene.fog = new THREE.Fog(0xf2f4f7, 16, 32);

  clock = new THREE.Clock();

  const width = Math.max(canvasContainer.clientWidth, 320);
  const height = Math.max(canvasContainer.clientHeight, 320);

  camera = new THREE.PerspectiveCamera(
    27,
    width / height,
    0.05,
    100
  );

  camera.position.set(0, 0.85, 5.25);

  renderer = new THREE.WebGLRenderer(
  {
    antialias: window.devicePixelRatio <= 1.5,
    alpha: false,
    powerPreference: "high-performance"
  });

  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, 1.5)
  );

  renderer.setSize(width, height);

  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // ACESFilmic to make lighting look warm
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;

  canvasContainer.innerHTML = "";
  canvasContainer.style.position = "relative";

  canvasContainer.appendChild(renderer.domElement);

  createLoadingOverlay();

  // OrbitControls for all drag and zoom interactions
  controls = new OrbitControls(camera, renderer.domElement);

  controls.enableDamping = true;
  // smooth deceleration when you let go
  controls.dampingFactor = 0.06;

  // pan disabled somodel stays centred
  controls.enablePan = false;

  controls.minDistance = 1.15;
  controls.maxDistance = 10;

  // Vertical limits so you cant flip the model upside down
  controls.minPolarAngle = 0.2;
  controls.maxPolarAngle = 1.9;

  controls.target.set(0, 0.45, 0);

  addLights();
  addStudioBase();
  addBackdrop();

  window.addEventListener("resize", onResize);

  document.addEventListener(
    "visibilitychange",
    onVisibilityChange
  );

  // because webGL context loss can happen on mobile when the browser reclaims GPU memory
  renderer.domElement.addEventListener(
    "webglcontextlost",
    onContextLost,
    false
  );

  renderer.domElement.addEventListener(
    "webglcontextrestored",
    onContextRestored,
    false
  );
}

//LOADER SETUP
//GLTFLoader for the .glb files
   // DRACOLoader attached for compressed geometry support

function initLoader() 
{
  dracoLoader = new DRACOLoader();

  dracoLoader.setDecoderPath(
    "https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/"
  );

  dracoLoader.preload();

  gltfLoader = new GLTFLoader();

  gltfLoader.setDRACOLoader(dracoLoader);
}

//UI EVENTS
//Each button gets its own event listener

function initUI() 
{
  if (productSelector) 
  {
    productSelector.value = currentProduct.key;

    productSelector.addEventListener("change", (event) => 
    {
      const nextKey = event.target.value;

      if (
        !PRODUCTS[nextKey] ||
        nextKey === currentProduct.key
      ) 
      {
        return;
      }

      switchProduct(nextKey);
    });
  }

  wireframeBtn?.addEventListener("click", () => 
  {
    wireframeEnabled = !wireframeEnabled;

    applyWireframeMode(
      currentPivotGroup,
      wireframeEnabled,
      currentProduct
    );

    wireframeBtn.textContent = wireframeEnabled
      ? "Wireframe On"
      : "Wireframe";
  });

  rotateBtn?.addEventListener("click", () => 
  {
    autoRotate = !autoRotate;

    rotateBtn.textContent = autoRotate
      ? "Rotation On"
      : "Auto Rotate";
  });

  capToggleBtn?.addEventListener("click", () => 
  {
    triggerCapToggle();
  });

  resetBtn?.addEventListener("click", () => 
  {
    resetViewerState();
  });
  
  lightingBtn?.addEventListener("click", () => 
  {
    cycleLightingPreset();
  });
}

// PRODUCT SWITCHING
// Updates the UI, loads the new model and updates the URL

function switchProduct(productKey) 
{
  currentProduct = PRODUCTS[productKey];

  updateProductUI(currentProduct);

  loadProduct(currentProduct);

  const nextUrl = new URL(window.location.href);

  nextUrl.searchParams.set("product", currentProduct.key);

  window.history.replaceState({}, "", nextUrl);
}

function updateProductUI(product) 
{
  if (heroProductImage) {
    heroProductImage.src = product.image;
    heroProductImage.alt = `${product.label} preview`;
  }

  if (heroImageLabel) {
    heroImageLabel.textContent = product.label;
  }

  if (selectedProductTitle) {
    selectedProductTitle.textContent = product.title;
  }

  if (productSelector) {
    productSelector.value = product.key;
  }

  // reseting animation state when switching models
  isActionOpenState = false;
  isActionPlaying = false;

  updateCapButtonLabel();
}

function updateCapButtonLabel() 
{
  if (!capToggleBtn) return;

  capToggleBtn.textContent = isActionOpenState
    ? currentProduct.closeLabel
    : currentProduct.openLabel;
}

function setStatus(text) 
{
  if (modelSourceLabel) 
  {
    modelSourceLabel.textContent = text;
  }
}

  //LOADING OVERLAY
  // show the % while the model loads


function createLoadingOverlay() 
{
  loadingOverlay = document.createElement("div");

  loadingOverlay.style.position = "absolute";
  loadingOverlay.style.inset = "0";

  loadingOverlay.style.display = "flex";
  loadingOverlay.style.flexDirection = "column";

  loadingOverlay.style.alignItems = "center";
  loadingOverlay.style.justifyContent = "center";

  loadingOverlay.style.gap = "12px";

  loadingOverlay.style.background =
    "rgba(244,246,249,0.82)";

  loadingOverlay.style.backdropFilter = "blur(3px)";

  loadingOverlay.style.zIndex = "5";

  loadingOverlay.style.transition = "opacity 0.22s ease";

  const spinner = document.createElement("div");

  spinner.style.width = "42px";
  spinner.style.height = "42px";

  spinner.style.border =
    "3px solid rgba(127,30,32,0.18)";

  spinner.style.borderTopColor = "#7f1e20";

  spinner.style.borderRadius = "50%";

  spinner.style.animation =
    "gc-spin 0.9s linear infinite";

  loadingText = document.createElement("div");

  loadingText.style.fontSize = "13px";
  loadingText.style.fontWeight = "700";
  loadingText.style.color = "#6a6160";

  loadingText.textContent = "Loading 3D model...";

  if (!document.getElementById("gc-spin-style")) {
    const style = document.createElement("style");

    style.id = "gc-spin-style";

    style.textContent = `
      @keyframes gc-spin {
        from {
          transform: rotate(0deg);
        }

        to {
          transform: rotate(360deg);
        }
      }
    `;

    document.head.appendChild(style);
  }

  loadingOverlay.appendChild(spinner);
  loadingOverlay.appendChild(loadingText);

  canvasContainer.appendChild(loadingOverlay);
}

function showLoading(message = "Loading 3D model...") 
{
  if (!loadingOverlay || !loadingText) return;

  loadingText.textContent = message;

  loadingOverlay.style.display = "flex";
  loadingOverlay.style.opacity = "1";
  loadingOverlay.style.pointerEvents = "auto";
}

function hideLoading() 
{
  if (!loadingOverlay) return;

  loadingOverlay.style.opacity = "0";
  loadingOverlay.style.pointerEvents = "none";

  setTimeout(() => 
  {
    if (loadingOverlay) 
    {
      loadingOverlay.style.display = "none";
    }
  }, 220);
}

   //STUDIO BASE
   //circle floor disc that receives shadows
   // shadow disc created with the Canvas API instead of relying on Three.js shadow mapping alone

function addStudioBase() 
{
  const floorGeometry = new THREE.CircleGeometry(
    4.6,
    72
  );

  const floorMaterial = new THREE.MeshStandardMaterial(
  {
    color: 0xebeff4,
    roughness: 0.98,
    metalness: 0.01
  });

  ground = new THREE.Mesh(
    floorGeometry,
    floorMaterial
  );

  ground.rotation.x = -Math.PI / 2;

  ground.position.y = -1.32;

  ground.receiveShadow = true;

  scene.add(ground);
}

// big sphere rendered from the inside for backdrop
function addBackdrop() 
{
  const geometry = new THREE.SphereGeometry(
    18,
    32,
    24
  );

  const material = new THREE.MeshBasicMaterial(
  {
    color: 0xf2f4f7,
    side: THREE.BackSide
  });

  const backdrop = new THREE.Mesh(
    geometry,
    material
  );

  scene.add(backdrop);
}



//PRODUCT LOADING
//load token system prevents race conditions
// 15 second timeout fallback so canvas never stays blank
//Progress callback updates the loading percentage live


function loadProduct(product) 
{
  // hhere each load gets a unique token
  const loadToken = ++activeLoadToken;

  clearCurrentProduct();

  showLoading("Loading 3D model...");
  setStatus("Loading 3D model...");

  // 15 second timeout so if the model takes too long just show this
  stallTimer = setTimeout(() => 
  {
    if (loadToken !== activeLoadToken) return;

    warn("Loading timeout. Using fallback.");

    buildAndShowFallback(
      product,
      "Fallback preview loaded"
    );
  }, LOAD_TIMEOUT_MS);

  gltfLoader.load(
    product.model,

    // Success callback
    (gltf) => 
    {
      if (loadToken !== activeLoadToken) return;

      clearTimeout(stallTimer);

      try 
      {
        const rawModel =
          gltf.scene || gltf.scenes?.[0];

        if (!rawModel) 
        {
          throw new Error("GLB scene not found");
        }

        const prepared = prepareLoadedModel(
          rawModel,
          product
        );

        currentModelRoot = prepared.root;
        currentPivotGroup = prepared.pivotGroup;
        currentRenderableModel = prepared.model;

        scene.add(currentModelRoot);

        setupAnimation(
          gltf,
          currentRenderableModel,
          product
        );

        applyWireframeMode(
          currentPivotGroup,
          wireframeEnabled,
          product
        );

        frameModelInView(
          currentPivotGroup,
          product
        );

        hideLoading();

        setStatus("Model ready");
      } catch (error) {
        console.error(
          "Model preparation failed:",
          error
        );

        buildAndShowFallback(
          product,
          "Fallback preview loaded"
        );
      }
    },

    // Progress callback so it updates the loading percentage
    (event) => 
    {
      if (loadToken !== activeLoadToken) return;

      if (event.total > 0) 
      {
        const percent = Math.round(
          (event.loaded / event.total) * 100
        );

        const text = `Loading ${percent}%`;

        showLoading(text);
        setStatus(text);
      }
    },

    // Error callback so it shows the fallback
    (error) => 
    {
      if (loadToken !== activeLoadToken) return;

      clearTimeout(stallTimer);

      console.error("GLB load error:", error);

      buildAndShowFallback(
        product,
        "Model fallback loaded"
      );
    }
  );
}


  //MODEL PREPARATION
  //Scales the model and centers it and positions it on the floor

function prepareLoadedModel(model, product) 
{
  model.rotation.set(0, 0, 0);

  model.position.set(0, 0, 0);

  model.scale.setScalar(1);

  model.traverse((child) => {
    if (!child.isMesh) return;

    child.castShadow = true;

    normalizeMeshMaterials(child, product);
  });

  const box = new THREE.Box3().setFromObject(model);

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();

  box.getSize(size);
  box.getCenter(center);

  // Scale the model

  const scale =
    (product.targetHeight || 3) / size.y;

  model.scale.setScalar(scale);

  model.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(
    model
  );

  const scaledSize = new THREE.Vector3();
  const scaledCenter = new THREE.Vector3();

  scaledBox.getSize(scaledSize);
  scaledBox.getCenter(scaledCenter);

  model.position.x = -scaledCenter.x;

  model.position.y =
    -scaledCenter.y +
    scaledSize.y / 2 -
    1.32 +
    (product.yAdjust || 0);

  model.position.z = -scaledCenter.z;

  // save base Y for the floating sine wave animation
  floatingBaseY = model.position.y;

  defaultPivotRotationY = product.rotationY || 0;

  const pivotGroup = new THREE.Group();

  pivotGroup.rotation.y =
    defaultPivotRotationY;

  pivotGroup.add(model);

  const root = new THREE.Group();

  root.add(pivotGroup);

  return {
    root,
    pivotGroup,
    model
  };
}


  //MATERIALS
  // clones materials and saves in userData for the wireframe swap

function normalizeMeshMaterials(mesh, product) 
{
  const materials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];

  const normalized = materials.map((material) =>
    normalizeMaterial(material, product)
  );

  // Save originals so wireframe can swap back to them
  mesh.userData.originalMaterials = normalized;

  mesh.material = Array.isArray(mesh.material)
    ? normalized
    : normalized[0];
}

function normalizeMaterial(material, product) 
{
  const cloned = material.clone();

  if (cloned.map) 
  {
    cloned.map.colorSpace =
      THREE.SRGBColorSpace;

    cloned.map.needsUpdate = true;
  }

  // bottle uses DoubleSide so that inside is visible through the glass
  cloned.side =
    product.key === "white-bottle"
      ? THREE.DoubleSide
      : THREE.FrontSide;

  cloned.needsUpdate = true;

  return cloned;
}

/* =========================================================
   WIREFRAME
   Creates new MeshBasicMaterial instances with wireframe enabled
   MeshBasicMaterial ignores lighting so lines always show clean
   ooriginal materials are never changed just temporarily swapped
   diff colour for the wireframe
========================================================= */

function applyWireframeMode(
  root,
  enabled,
  product
) {
  if (!root) return;

  root.traverse((child) => 
  {
    if (!child.isMesh) return;

    const originalMaterials =
      child.userData.originalMaterials;

    if (!originalMaterials) return;

    // making wireframe materials once and cache them
    if (!child.userData.meshWireMaterials) 
    {
      child.userData.meshWireMaterials =
        originalMaterials.map(() => 
        {
          return new THREE.MeshBasicMaterial(
          {
            color: product.wireColor,
            wireframe: true,
            side: THREE.DoubleSide
          });
        });
    }

    // swapping wireframe materials or swap back to originals
    child.material = enabled
      ? Array.isArray(child.material)
        ? child.userData.meshWireMaterials
        : child.userData.meshWireMaterials[0]
      : Array.isArray(child.material)
      ? originalMaterials
      : originalMaterials[0];
  });
}

//ANIMATION
  //Reads keyframe animations from inside the .glb file

function setupAnimation(
  gltf,
  animatedRoot,
  product
) {
  cleanupAnimation();

  if (!gltf.animations?.length) return;

  let clip = null;

  if (product.animationName) 
  {
    clip = THREE.AnimationClip.findByName(
      gltf.animations,
      product.animationName
    );
  }

  if (!clip) 
  {
    clip = gltf.animations[0];
  }

  if (!clip) return;

  mixer = new THREE.AnimationMixer(animatedRoot);

  activeAction = mixer.clipAction(clip);

  activeAction.clampWhenFinished = true;
  activeAction.loop = THREE.LoopOnce;

  activeClipDuration = clip.duration || 0;
}

function cleanupAnimation() 
{
  if (activeAction) 
  {
    activeAction.stop();
  }

  mixer = null;
  activeAction = null;
  activeClipDuration = 0;
}

//camera fit...uses trigonometry to calculate correct distance based on model size

function frameModelInView(object, product) 
{
  const box = new THREE.Box3().setFromObject(
    object
  );

  const size = new THREE.Vector3();

  box.getSize(size);

  const maxDim = Math.max(
    size.x,
    size.y,
    size.z
  );

  const fov = THREE.MathUtils.degToRad(
    camera.fov
  );

  const cameraDistance =
    maxDim /
    (2 * Math.tan(fov / 2)) *
    (product.viewPadding || 1.22);

  controls.target.set(0, size.y * 0.18, 0);

  camera.position.set(
    0,
    size.y * 0.14,
    cameraDistance
  );

  controls.update();
}

//cap toggle...plays sound on open, routes to animation or fallback

function triggerCapToggle() 
{
  if (!currentPivotGroup || isActionPlaying) 
  {
    return;
  }

  // PLAY SOUND
  if (!isActionOpenState) 
  {
    const sound =
      currentProduct.soundType === "can"
        ? canOpenSound
        : bottleOpenSound;

    playSound(sound);
  }

  if (activeAction) 
  {
    playForwardOrReverseAnimation();
    return;
  }

  isActionOpenState = !isActionOpenState;

  if (isActionOpenState) 
  {
    currentPivotGroup.rotation.y =
      defaultPivotRotationY + 0.12;
  } else {
    currentPivotGroup.rotation.y =
      defaultPivotRotationY;
  }

  updateCapButtonLabel();
}

//plays forward to open (timeScale 1) or reverse to close (timeScale -1)
// only one animation needed in Blender instead of two
function playForwardOrReverseAnimation() 
{
  if (!activeAction) return;

  isActionPlaying = true;

if (!isActionOpenState) 
  {
    activeAction.reset();
    activeAction.timeScale = 1;
    activeAction.paused = false;
    activeAction.play();
    isActionOpenState = true;

    setTimeout(() => 
    {
      isActionPlaying = false;
    }, Math.max(120, activeClipDuration * 1000));
  } else {
    activeAction.enabled = true;
    activeAction.paused = false;
    activeAction.timeScale = -1;
    activeAction.time = activeClipDuration || activeAction.getClip().duration;
    activeAction.play();
    isActionOpenState = false;

    setTimeout(() => 
    {
      isActionPlaying = false;
    }, Math.max(120, activeClipDuration * 1000));
  }

  updateCapButtonLabel();
}

//reset...returning back to default state

function resetViewerState() 
{
  autoRotate = false;
  wireframeEnabled = false;
  
  // Reset lighting to default
  setLightingPreset(LIGHTING_PRESETS.DEFAULT);

  if (rotateBtn) 
  {
    rotateBtn.textContent = "Auto Rotate";
  }

  if (wireframeBtn) 
  {
    wireframeBtn.textContent = "Wireframe";
  }

  loadProduct(currentProduct);
}

//cleanup... removes model and disposes all GPU memory

function clearCurrentProduct() 
{
  clearTimeout(stallTimer);

  cleanupAnimation();

  if (!currentModelRoot) return;

  scene.remove(currentModelRoot);

  disposeObject(currentModelRoot);

  currentModelRoot = null;
  currentPivotGroup = null;
  currentRenderableModel = null;
}

// disposing textures and materials to free memory
function disposeMaterial(material) 
{
  if (!material) return;

  material.map?.dispose();

  material.dispose?.();
}

// disposing geometries and materials on every mesh in the object
function disposeObject(object) 
{
  object.traverse((child) => 
  {
    child.geometry?.dispose();

    if (child.material) 
    {
      if (Array.isArray(child.material)) {
        child.material.forEach(disposeMaterial);
      } else {
        disposeMaterial(child.material);
      }
    }
  });
}

//fallbackk...showing model image on two planes if model fails to load

function buildAndShowFallback(
  product,
  statusText
) {
  clearCurrentProduct();

  try {
    const prepared =
      createImageFallbackModel(product);

    currentModelRoot = prepared.root;
    currentPivotGroup = prepared.pivotGroup;

    scene.add(currentModelRoot);

    hideLoading();

    setStatus(statusText);
  } catch (error) {
    console.error("Fallback build failed:", error);

    showLoading("Failed to show model");

    setStatus("Failed to show model");
  }
}

// creating 2 image planes at 90 degrees so image is visible from multiple angles
function createImageFallbackModel(product) 
{
  const texture = textureLoader.load(
    product.fallbackImage
  );

  texture.colorSpace = THREE.SRGBColorSpace;

  const geometry = new THREE.PlaneGeometry(
    2,
    product.targetHeight || 3
  );

  const material = new THREE.MeshBasicMaterial(
  {
    map: texture,
    transparent: true,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(
    geometry,
    material
  );

  const pivotGroup = new THREE.Group();

  pivotGroup.add(mesh);

  const root = new THREE.Group();

  root.add(pivotGroup);

  return 
  {
    root,
    pivotGroup
  };
}

//animation loop
function animate() 
{
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  if (mixer) 
  {
    mixer.update(delta);
  }

  if (
    autoRotate &&
    currentPivotGroup &&
    !isActionPlaying
  ) {
    currentPivotGroup.rotation.y += 0.006;
  }

  controls.update();

  renderer.render(scene, camera);
}

// updating camera when window is resized

function onResize() 
{
  const width = Math.max(
    canvasContainer.clientWidth,
    320
  );

  const height = Math.max(
    canvasContainer.clientHeight,
    320
  );

  camera.aspect = width / height;

  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
}

//pausing clock when tab is hidden to save battery
function onVisibilityChange() 
{
  if (document.hidden) 
  {
    clock.stop();
  } else 
  {
    clock.start();
  }
}

//handle WebGL context loss on mobile
function onContextLost(event) 
{
  event.preventDefault();

  showLoading(
    "Graphics context lost. Restoring..."
  );

  setStatus("Graphics context lost");
}

//recover after context is restored
function onContextRestored() 
{
  hideLoading();

  setStatus("Model ready");
}