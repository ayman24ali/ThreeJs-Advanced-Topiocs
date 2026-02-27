import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";

// ─── Perlin Noise (CPU-side fBm) ─────────────────────────────────────────────
const grad3 = [
  [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
  [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
  [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1],
];
function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a, b, t) { return a + t * (b - a); }
function dot2(g, x, y) { return g[0] * x + g[1] * y; }

class PerlinNoise {
  constructor(seed = 0) { this.perm = this._build(seed); }
  _build(seed) {
    const p = Array.from({ length: 256 }, (_, i) => i);
    let s = (seed || 42) >>> 0;
    for (let i = 255; i > 0; i--) {
      s = Math.imul(s, 1664525) + 1013904223 >>> 0;
      const j = s % (i + 1);
      [p[i], p[j]] = [p[j], p[i]];
    }
    return [...p, ...p];
  }
  _noise(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const a = this.perm[X] + Y, b = this.perm[X + 1] + Y;
    return lerp(
      lerp(dot2(grad3[this.perm[a] % 12], x, y), dot2(grad3[this.perm[b] % 12], x - 1, y), u),
      lerp(dot2(grad3[this.perm[a + 1] % 12], x, y - 1), dot2(grad3[this.perm[b + 1] % 12], x - 1, y - 1), u),
      v
    );
  }
  fbm(x, y, octaves = 6, persistence = 0.5, lacunarity = 2.0) {
    let val = 0, amp = 1, freq = 1, maxAmp = 0;
    for (let i = 0; i < octaves; i++) {
      val += this._noise(x * freq, y * freq) * amp;
      maxAmp += amp;
      amp *= persistence;
      freq *= lacunarity;
    }
    return val / maxAmp; // normalized [-1, 1]
  }
}

// ─── Biome Shader (fragment shader reads vHeight varying) ────────────────────
const vertexShader = `
  varying float vHeight;
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vHeight = position.y;
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform float uMaxHeight;
  uniform float uMinHeight;
  uniform bool uBiomeColors;
  uniform vec3 uSunDir;

  varying float vHeight;
  varying vec3 vNormal;
  varying vec3 vPosition;

  vec3 biomeColor(float t) {
    // t is 0..1 normalized height
    vec3 deepWater  = vec3(0.04, 0.12, 0.28);
    vec3 water      = vec3(0.10, 0.24, 0.50);
    vec3 sand       = vec3(0.76, 0.70, 0.50);
    vec3 grass      = vec3(0.22, 0.48, 0.18);
    vec3 forest     = vec3(0.10, 0.30, 0.10);
    vec3 rock       = vec3(0.45, 0.42, 0.38);
    vec3 snow       = vec3(0.92, 0.95, 1.00);

    if (t < 0.18) return mix(deepWater, water, t / 0.18);
    if (t < 0.25) return mix(water, sand, (t - 0.18) / 0.07);
    if (t < 0.38) return mix(sand, grass, (t - 0.25) / 0.13);
    if (t < 0.58) return mix(grass, forest, (t - 0.38) / 0.20);
    if (t < 0.72) return mix(forest, rock, (t - 0.58) / 0.14);
    if (t < 0.88) return mix(rock, snow, (t - 0.72) / 0.16);
    return snow;
  }

  void main() {
    float t = clamp((vHeight - uMinHeight) / max(uMaxHeight - uMinHeight, 0.001), 0.0, 1.0);

    vec3 color;
    if (uBiomeColors) {
      color = biomeColor(t);
    } else {
      color = mix(vec3(0.05, 0.22, 0.12), vec3(0.9, 0.92, 0.95), t);
    }

    // Lambertian diffuse
    vec3 lightDir = normalize(uSunDir);
    float diff = max(dot(vNormal, lightDir), 0.0);
    // Ambient + diffuse
    vec3 ambient = color * 0.35;
    vec3 diffuse = color * diff * 0.85;
    // Subtle rim
    vec3 viewDir = normalize(-vPosition);
    float rim = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 3.0) * 0.12;

    gl_FragColor = vec4(ambient + diffuse + rim, 1.0);
  }
`;

// ─── Simple Orbit Controls ────────────────────────────────────────────────────
function useOrbitControls(camera, domRef) {
  const state = useRef({ dragging: false, last: { x: 0, y: 0 }, theta: 0.6, phi: 1.1, radius: 80 });

  useEffect(() => {
    const el = domRef.current;
    if (!el) return;

    const onDown = (e) => {
      state.current.dragging = true;
      state.current.last = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => { state.current.dragging = false; };
    const onMove = (e) => {
      if (!state.current.dragging) return;
      const dx = (e.clientX - state.current.last.x) * 0.005;
      const dy = (e.clientY - state.current.last.y) * 0.005;
      state.current.theta -= dx;
      state.current.phi = Math.max(0.1, Math.min(Math.PI / 2, state.current.phi + dy));
      state.current.last = { x: e.clientX, y: e.clientY };
    };
    const onWheel = (e) => {
      state.current.radius = Math.max(20, Math.min(200, state.current.radius + e.deltaY * 0.08));
    };

    el.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("mousemove", onMove);
    el.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      el.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("mousemove", onMove);
      el.removeEventListener("wheel", onWheel);
    };
  }, [domRef]);

  const update = useCallback(() => {
    const { theta, phi, radius } = state.current;
    camera.position.set(
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.cos(theta)
    );
    camera.lookAt(0, 0, 0);
  }, [camera]);

  return update;
}

// ─── Slider Component ─────────────────────────────────────────────────────────
function Slider({ label, value, min, max, step = 1, onChange }) {
  return (
    <div style={{ marginBottom: "14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
        <span style={{ color: "#8db4c2", fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</span>
        <span style={{ color: "#d4eaf0", fontSize: "11px", fontFamily: "monospace" }}>{typeof value === "number" ? value.toFixed(step < 1 ? 2 : 0) : value}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: "#4ab8d4", cursor: "pointer", height: "3px" }}
      />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TerrainGenerator() {
  const mountRef = useRef(null);
  const sceneRef = useRef({});

  const [params, setParams] = useState({
    resolution: 128,
    scale: 0.04,
    octaves: 6,
    persistence: 0.5,
    lacunarity: 2.0,
    amplitude: 18,
    seed: 42,
    biomeColors: true,
    wireframe: false,
    animating: false,
  });
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const [fps, setFps] = useState(0);
  const [vertCount, setVertCount] = useState(0);

  // ── Build terrain geometry ──────────────────────────────────────────────────
  const buildTerrain = useCallback((p) => {
    const { scene, material } = sceneRef.current;
    if (!scene || !material) return;

    if (sceneRef.current.mesh) {
      scene.remove(sceneRef.current.mesh);
      sceneRef.current.mesh.geometry.dispose();
    }

    const noise = new PerlinNoise(p.seed);
    const size = 60;
    const segs = p.resolution;
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);

    const positions = geo.attributes.position;
    let minH = Infinity, maxH = -Infinity;
    const heights = [];

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i) * p.scale;
      const z = positions.getZ(i) * p.scale;
      const h = noise.fbm(x, z, p.octaves, p.persistence, p.lacunarity) * p.amplitude;
      positions.setY(i, h);
      heights.push(h);
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
    }

    positions.needsUpdate = true;
    geo.computeVertexNormals();

    material.uniforms.uMinHeight.value = minH;
    material.uniforms.uMaxHeight.value = maxH;
    material.uniforms.uBiomeColors.value = p.biomeColors;
    material.wireframe = p.wireframe;

    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    sceneRef.current.mesh = mesh;
    sceneRef.current.heights = heights;
    setVertCount(positions.count);
  }, []);

  // ── Scene init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = mountRef.current;
    const W = el.clientWidth, H = el.clientHeight;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    el.appendChild(renderer.domElement);

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050d14);
    scene.fog = new THREE.FogExp2(0x050d14, 0.012);

    // Camera
    const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 500);
    camera.position.set(0, 60, 80);
    camera.lookAt(0, 0, 0);

    // Shader material
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uMinHeight: { value: -10 },
        uMaxHeight: { value: 20 },
        uBiomeColors: { value: true },
        uSunDir: { value: new THREE.Vector3(1.2, 2.0, 0.8).normalize() },
      },
      wireframe: false,
    });

    sceneRef.current = { renderer, scene, camera, material };

    // Stars
    const starGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(2000 * 3);
    for (let i = 0; i < 2000 * 3; i++) starPositions[i] = (Math.random() - 0.5) * 600;
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xaaccdd, size: 0.3, sizeAttenuation: true }));
    scene.add(stars);

    // Build initial terrain
    buildTerrain(paramsRef.current);

    // Resize handler
    const onResize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // FPS tracker
    let lastTime = performance.now(), frames = 0;

    // Render loop
    let rafId;
    const tick = () => {
      rafId = requestAnimationFrame(tick);
      frames++;
      const now = performance.now();
      if (now - lastTime > 500) {
        setFps(Math.round(frames / ((now - lastTime) / 1000)));
        frames = 0; lastTime = now;
      }

      const { mesh } = sceneRef.current;
      if (mesh && paramsRef.current.animating) {
        mesh.rotation.y += 0.003;
      }

      // Update material uniforms
      if (material) {
        material.uniforms.uBiomeColors.value = paramsRef.current.biomeColors;
        material.wireframe = paramsRef.current.wireframe;
      }

      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  const updateOrbit = useOrbitControls(sceneRef.current?.camera, mountRef);

  // Sync camera in render loop
  useEffect(() => {
    let id;
    const loop = () => { id = requestAnimationFrame(loop); updateOrbit && updateOrbit(); };
    loop();
    return () => cancelAnimationFrame(id);
  }, [updateOrbit]);

  const set = (key) => (val) => {
    const next = { ...paramsRef.current, [key]: val };
    setParams(next);
    if (["resolution", "scale", "octaves", "persistence", "lacunarity", "amplitude", "seed"].includes(key)) {
      buildTerrain(next);
    }
  };

  const randomSeed = () => {
    const next = { ...paramsRef.current, seed: Math.floor(Math.random() * 9999) };
    setParams(next);
    buildTerrain(next);
  };

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", background: "#050d14", fontFamily: "'Courier New', monospace", overflow: "hidden" }}>
      {/* 3D Viewport */}
      <div ref={mountRef} style={{ flex: 1, position: "relative", cursor: "grab" }}>
        {/* HUD */}
        <div style={{
          position: "absolute", top: "16px", left: "16px",
          color: "#4ab8d4", fontSize: "10px", letterSpacing: "0.15em",
          textTransform: "uppercase", lineHeight: 1.8, pointerEvents: "none",
        }}>
          <div style={{ fontSize: "14px", fontWeight: "bold", letterSpacing: "0.3em", marginBottom: "4px" }}>TERRAIN.GEN</div>
          <div style={{ color: "#3a7a8a" }}>v1.0.0 — WebGL</div>
        </div>
        <div style={{
          position: "absolute", bottom: "16px", left: "16px",
          color: "#2a5566", fontSize: "9px", letterSpacing: "0.12em",
          textTransform: "uppercase", lineHeight: 2, pointerEvents: "none",
        }}>
          <div style={{ color: "#4ab8d4" }}>{fps} fps</div>
          <div>{vertCount.toLocaleString()} vertices</div>
          <div style={{ marginTop: "4px", color: "#1d3d4d" }}>drag to orbit · scroll to zoom</div>
        </div>
      </div>

      {/* Control Panel */}
      <div style={{
        width: "230px", background: "#050e18", borderLeft: "1px solid #0d2535",
        padding: "24px 18px", overflowY: "auto", flexShrink: 0,
      }}>
        <div style={{ color: "#4ab8d4", fontSize: "9px", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "22px", borderBottom: "1px solid #0d2535", paddingBottom: "10px" }}>
          Parameters
        </div>

        {/* Noise */}
        <div style={{ color: "#3a7a8a", fontSize: "9px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "12px" }}>Noise</div>
        <Slider label="Scale" value={params.scale} min={0.01} max={0.12} step={0.01} onChange={set("scale")} />
        <Slider label="Amplitude" value={params.amplitude} min={4} max={40} step={1} onChange={set("amplitude")} />
        <Slider label="Octaves" value={params.octaves} min={1} max={8} step={1} onChange={set("octaves")} />
        <Slider label="Persistence" value={params.persistence} min={0.1} max={0.9} step={0.05} onChange={set("persistence")} />
        <Slider label="Lacunarity" value={params.lacunarity} min={1.0} max={4.0} step={0.1} onChange={set("lacunarity")} />

        <div style={{ borderTop: "1px solid #0d2535", margin: "16px 0" }} />

        {/* Geometry */}
        <div style={{ color: "#3a7a8a", fontSize: "9px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "12px" }}>Geometry</div>
        <Slider label="Resolution" value={params.resolution} min={32} max={256} step={32} onChange={set("resolution")} />

        <div style={{ borderTop: "1px solid #0d2535", margin: "16px 0" }} />

        {/* Seed */}
        <div style={{ color: "#3a7a8a", fontSize: "9px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "12px" }}>Seed</div>
        <Slider label="Seed" value={params.seed} min={0} max={9999} step={1} onChange={set("seed")} />
        <button onClick={randomSeed} style={{
          width: "100%", padding: "8px", background: "transparent",
          border: "1px solid #0d2535", color: "#4ab8d4", fontSize: "10px",
          letterSpacing: "0.15em", textTransform: "uppercase", cursor: "pointer",
          marginBottom: "16px", transition: "border-color 0.2s",
        }}
          onMouseEnter={e => e.target.style.borderColor = "#4ab8d4"}
          onMouseLeave={e => e.target.style.borderColor = "#0d2535"}
        >
          ⟳ Randomize
        </button>

        <div style={{ borderTop: "1px solid #0d2535", margin: "16px 0" }} />

        {/* Toggles */}
        <div style={{ color: "#3a7a8a", fontSize: "9px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "12px" }}>Render</div>
        {[
          { key: "biomeColors", label: "Biome Colors" },
          { key: "wireframe", label: "Wireframe" },
          { key: "animating", label: "Auto Rotate" },
        ].map(({ key, label }) => (
          <div key={key} onClick={() => setParams(p => ({ ...p, [key]: !p[key] }))}
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "8px 0", cursor: "pointer", borderBottom: "1px solid #080f18",
              marginBottom: "4px",
            }}>
            <span style={{ color: "#8db4c2", fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</span>
            <div style={{
              width: "28px", height: "14px", borderRadius: "7px",
              background: params[key] ? "#4ab8d4" : "#0d2535",
              position: "relative", transition: "background 0.2s",
              border: `1px solid ${params[key] ? "#4ab8d4" : "#1a3a4a"}`,
            }}>
              <div style={{
                width: "10px", height: "10px", borderRadius: "50%", background: "#fff",
                position: "absolute", top: "1px",
                left: params[key] ? "15px" : "1px", transition: "left 0.2s",
              }} />
            </div>
          </div>
        ))}

        {/* Concept Legend */}
        <div style={{ borderTop: "1px solid #0d2535", marginTop: "20px", paddingTop: "16px" }}>
          <div style={{ color: "#3a7a8a", fontSize: "9px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "10px" }}>Pipeline</div>
          {[
            ["CPU", "Perlin fBm"],
            ["VBO", "Vertex Buffer"],
            ["VS", "Vertex Shader"],
            ["FS", "Biome Colors"],
            ["NORM", "Auto Normals"],
          ].map(([tag, desc]) => (
            <div key={tag} style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "6px" }}>
              <span style={{ color: "#4ab8d4", fontSize: "8px", letterSpacing: "0.1em", background: "#0a1e2a", padding: "2px 5px", border: "1px solid #0d3545", minWidth: "34px", textAlign: "center" }}>{tag}</span>
              <span style={{ color: "#3a5a6a", fontSize: "9px" }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
