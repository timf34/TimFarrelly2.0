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

      /* identical uniform list & names from the original shader */
      uniform float uIntensity, uVerticalStretch, uHorizontalWidth,
                    uFeather,   uAspectRatio,   uMix;
      uniform vec4  uStopsA[${maxStops}];
      uniform vec4  uStopsB[${maxStops}];
      const int numStops = ${maxStops};

      /* ------------------------------------------------------------------ */
      vec3 samplePalette(float d,const vec4 s[numStops]){
        vec3 col = vec3(0.0);
        for(int i=0;i<numStops-1;i++){
          if(d>=s[i].a && d<=s[i+1].a){
            float t=(d-s[i].a)/(s[i+1].a-s[i].a);
            col = mix(s[i].rgb,s[i+1].rgb,t);
          }
        }
        if(d<s[0].a)            col = s[0].rgb;
        if(d>s[numStops-1].a)   col = s[numStops-1].rgb;
        return col;
      }

      void main(){
        vec2 uv = vUv - 0.5;          /* centre at (0,0) */
        uv.x *= uAspectRatio;

        float v    = uv.y / uVerticalStretch;
        float h    = uv.x / uHorizontalWidth;
        float dist = mix( length(vec2(h,v)), max(abs(h),abs(v)), 0.3 );
        dist       = smoothstep(0.0, 1.0 + uFeather, dist);

        vec3 colA = samplePalette(dist, uStopsA);
        vec3 colB = samplePalette(dist, uStopsB);
        vec3 col  = mix(colA, colB, uMix) * uIntensity;

        gl_FragColor = vec4(col,1.0);
      }
    `;
  

    const vert = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';

    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      uniforms: {
        uMix: { value: 0 },
    
        // --- identical defaults to your legacy script ------------------
        uIntensity       : { value: intensity },   // expose via constructor
        uAspectRatio     : { value: 2.0 },         // <- was hard-coded before
        uVerticalStretch : { value: 0.4 },
        uHorizontalWidth : { value: 0.8 },
        uFeather         : { value: 0.6 },
    
        // --- colour data -----------------------------------------------
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
