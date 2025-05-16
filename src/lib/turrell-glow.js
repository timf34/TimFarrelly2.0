if (typeof window !== 'undefined') {
	class TurrellGlow extends HTMLElement {
	  constructor() {
		super();
		this.attachShadow({ mode: 'open' });
	  }
	  connectedCallback() {
		// relative to *this* file → OK when bundled by Vite
		import('./engine.js').then(({ TurrellBackground }) => {
		  const seqUrl = this.getAttribute('src') || '/sequence.json';
		  fetch(seqUrl)
			.then(r => r.json())
			.then(sequence => {
			  const host = document.createElement('div');
			  host.style.cssText =
				'position:fixed;inset:0;pointer-events:none;z-index:-1;';
			  this.shadowRoot.append(host);
			  this.engine = new TurrellBackground({ container: host, sequence });
			  this.engine.play();
			});
		});
	  }
	  disconnectedCallback() {
		this.engine?.pause();
	  }
	}
  
	customElements.get('turrell-glow') ||
	  customElements.define('turrell-glow', TurrellGlow);
}