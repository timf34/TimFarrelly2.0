import * as THREE from 'three';

/* --- helpers ------------------------------------------------------------- */

const hex = h => parseInt(h.slice(1), 16);
const hexToRGB = h => {
  const i = hex(h);
  return [(i >> 16) & 255, (i >> 8) & 255, i & 255].map(v => v / 255);
};
const buildStops = (stops, max) => {
  const out = new Float32Array(max * 4);
  for (let i = 0; i < max; i++) {
    const src = stops[i] ?? stops[stops.length - 1];
    const [r, g, b] = hexToRGB(src.colour);
    out.set([r, g, b, src.distance], i * 4);
  }
  return out;
};

/* --- class --------------------------------------------------------------- */

export class TurrellBackground {
  constructor({
    container,
    sequence,
    feather = 0.6,
    aspectFix = 0.3,
    intensity = 1.15,
    maxStops = 8
  }) {
    this.sequence = sequence;
    this.maxStops = maxStops;
    this.container = container;
    this.curStep = 0;
    this.clock = new THREE.Clock();

    /*--- THREE boiler-plate ---*/
    const aspect = window.innerWidth / window.innerHeight;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 10);
    this.camera.position.z = 1;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);

    window.addEventListener('resize', this.#onResize);

    /*--- shader ---*/
    const maxR = Math.hypot(0.5 * (1 + aspectFix), 0.5);
    const frag = /* glsl */`
      precision highp float;
      varying vec2 vUv;
      uniform float uMix, uFeather, uAspectFix, uIntensity;
      uniform float uMaxR;
      uniform vec4  uStopsA[${maxStops}];
      uniform vec4  uStopsB[${maxStops}];

      float distField(vec2 p){
        p -= .5;
        p.x *= 1. + uAspectFix;
        return length(p) / uMaxR;   // 0.0 →  centre , 1.0 → outermost reachable pixel
      }

      vec3 paletteSample(float d,const vec4 arr[${maxStops}]){
        vec3 c = arr[${maxStops-1}].rgb;
        for(int i=${maxStops-1}; i>0; i--){
          if(d < arr[i].a){
            float t = smoothstep(arr[i-1].a, arr[i].a, d);
            c = mix(arr[i-1].rgb, arr[i].rgb, t);
          }
        }
        return c;
      }

      void main(){
        float d = smoothstep(0.,1.+uFeather, distField(vUv));
        vec3 cA = paletteSample(d, uStopsA);
        vec3 cB = paletteSample(d, uStopsB);
        gl_FragColor = vec4(mix(cA,cB,uMix)*uIntensity, 1.);
      }
    `;

    const vert = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';

    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      uniforms: {
        uMix: { value: 0 },
        uFeather: { value: feather },
        uAspectFix: { value: aspectFix },
        uIntensity: { value: intensity },
        uMaxR: { value: maxR },
        uStopsA: { value: buildStops(sequence[0].stops, maxStops) },
        uStopsB: { value: buildStops(sequence[1 % sequence.length].stops, maxStops) }
      }
    });

    const plane = new THREE.PlaneGeometry(2 * aspect, 2);
    this.scene.add(new THREE.Mesh(plane, this.material));
  }

  play = () => this.renderer.setAnimationLoop(this.#tick);
  pause = () => this.renderer.setAnimationLoop(null);

  #onResize = () => {
    const a = window.innerWidth / window.innerHeight;
    this.camera.left = -a;
    this.camera.right = a;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  #tick = () => {
    const step = this.sequence[this.curStep];
    const next = this.sequence[(this.curStep + 1) % this.sequence.length];
    const local = this.clock.elapsedTime * 1000 % (step.fade + step.hold);
    const mix = Math.min(1, local / step.fade);

    if (local < this.clock.getDelta() * 1000) {
      this.material.uniforms.uStopsA.value = buildStops(step.stops, this.maxStops);
      this.material.uniforms.uStopsB.value = buildStops(next.stops, this.maxStops);
      this.curStep = (this.curStep + 1) % this.sequence.length;
    }

    this.material.uniforms.uMix.value = mix;
    this.renderer.render(this.scene, this.camera);
  };
}
