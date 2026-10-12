import { validateProject, parseProject } from './core/model.js';
import { renderScene } from './core/renderer.js';
import { createGame } from './core/game.js';
const NS = 'http://www.w3.org/2000/svg';
const MAX_BYTES = 5_000_000;
export function validateSourceURL(source, base = globalThis.location?.href) {
  const url = new URL(source, base);
  const origin = base ? new URL(base).origin : '';
  if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.origin === origin))) throw new Error('Projects must use HTTPS, or the same local HTTP origin.');
  return url;
}
export class RashPlayer extends HTMLElement {
  static observedAttributes = ['src', 'controls'];
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    // Static interface markup only. Project text and SVG nodes are always assigned using safe DOM APIs.
    this.shadowRoot.innerHTML = `<style>:host{display:block;contain:content;background:#111522;color:#e8eaf0;font:13px system-ui,sans-serif;border-radius:8px;overflow:hidden}*{box-sizing:border-box}.stage{position:relative;width:100%}svg{display:block;width:100%;height:auto;touch-action:manipulation}.controls{display:flex;gap:10px;align-items:center;padding:10px 12px;background:#181d28}.controls[hidden]{display:none}button{background:#303846;border:0;border-radius:5px;padding:7px 12px;color:inherit;cursor:pointer;font:inherit}button:focus-visible,input:focus-visible{outline:2px solid #ff8c5e;outline-offset:2px}input{flex:1;min-width:30px;accent-color:#ff7644}.time{min-width:42px;font-variant-numeric:tabular-nums}.status{margin:0;padding:12px;color:#ffd0bc}.status:empty{display:none}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}</style><div class="stage"></div><div class="controls"><button type="button" aria-label="Play animation">Play</button><input type="range" min="0" max="1" value="0" aria-label="Animation timeline"><output class="time">0.0 s</output></div><p class="status" role="status"></p>`;
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('role', 'img');
    this.shadowRoot.querySelector('.stage').append(this.svg);
    this.button = this.shadowRoot.querySelector('button');
    this.slider = this.shadowRoot.querySelector('input');
    this.status = this.shadowRoot.querySelector('.status');
    this.output = this.shadowRoot.querySelector('output');
    this.restart = document.createElement('button'); this.restart.type='button'; this.restart.textContent='Restart'; this.restart.setAttribute('aria-label','Restart game'); this.restart.hidden=true;
    this.shadowRoot.querySelector('.controls').append(this.restart);
    this.restart.onclick=()=>{this.pause();this._resetGame();this.play();};
    this._gameInput={};
    const direction={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',a:'left',d:'right',w:'up',s:'down'};
    this.svg.addEventListener('keydown',event=>{const key=direction[event.key];if(!this._isGame()||!key)return;event.preventDefault();this._gameInput[key]=true;delete this._gameInput.target;this.play();});
    this.svg.addEventListener('keyup',event=>{if(direction[event.key])this._gameInput[direction[event.key]]=false;});
    this.svg.addEventListener('blur',()=>{this._gameInput={};});
    const target=event=>{const matrix=this.svg.getScreenCTM();if(!matrix)return;const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());this._gameInput.target={x:point.x,y:point.y};};
    this.svg.addEventListener('pointerdown',event=>{if(!this._isGame()||event.button!==0)return;event.preventDefault();this.svg.focus();target(event);this.svg.setPointerCapture(event.pointerId);this.play();});
    this.svg.addEventListener('pointermove',event=>{if(this.playing&&this._isGame()&&(event.buttons||event.pointerType==='touch'))target(event);});
    this.svg.addEventListener('pointercancel',()=>{this._gameInput={};});
    this.button.onclick = () => this.playing ? this.pause() : this.play();
    this.slider.addEventListener('input', () => { this.pause(); this.seek(Number(this.slider.value)); });
    this._frame = 0; this.playing = false; this._request = 0; this._generation = 0;
  }
  connectedCallback() {
    this.shadowRoot.querySelector('.controls').hidden = !this.hasAttribute('controls');
    if (this._project) { this._render(); this._start(++this._generation); return; }
    queueMicrotask(() => this.load());
  }
  disconnectedCallback() { this.pause(); this._abort?.abort(); this._runtime?.dispose(); this._runtime = null; this._generation++; }
  attributeChangedCallback(name, oldValue, value) {
    if (name === 'controls') this.shadowRoot.querySelector('.controls').hidden = value === null;
    if (name === 'src' && oldValue !== value && this.isConnected) this.load();
  }
  get project() { return this._project ? structuredClone(this._project) : null; }
  set project(value) {
    this.pause(); this._generation++; this._runtime?.dispose(); this._runtime = null;
    this._project = validateProject(value); this._frame = 0; this._game=null; this._gameScene=null; this._gameInput={};
    this.svg.setAttribute('aria-label', this._project.name+(this._isGame()?'. Use arrow keys or touch to move.':''));
    this.svg.setAttribute('tabindex',this._isGame()?'0':'-1'); this.svg.style.touchAction=this._isGame()?'none':'manipulation';
    this.restart.hidden=!this._isGame(); this.slider.hidden=this._isGame();
    this.slider.max = String(this._project.duration - 1);
    this.status.textContent = '';
    this._render();
    this.dispatchEvent(new CustomEvent('rash-load', { detail: { duration: this._project.duration, fps: this._project.fps } }));
    this._start(this._generation);
  }
  async load() {
    this._abort?.abort();
    const abort = this._abort = new AbortController();
    try {
      if (this.hasAttribute('src')) {
        const url = validateSourceURL(this.getAttribute('src'));
        const response = await fetch(url, { mode: 'cors', credentials: 'omit', redirect: 'error', signal: abort.signal });
        if (!response.ok) throw new Error(`Project request failed (${response.status}).`);
        if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('Project exceeds the 5 MB limit.');
        const reader = response.body?.getReader(); let text;
        if (reader) {
          const chunks = []; let size = 0;
          while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_BYTES) { await reader.cancel(); throw new Error('Project exceeds the 5 MB limit.'); } chunks.push(value); }
          const all = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
          text = new TextDecoder().decode(all);
        } else text = await response.text();
        if (!abort.signal.aborted) this.project = parseProject(text);
      } else {
        const data = this.querySelector('script[type="application/json"]');
        if (data) this.project = parseProject(data.textContent);
        else this.status.textContent = 'Provide a Rash project using the src attribute or inline JSON.';
      }
    } catch (error) { if (error.name !== 'AbortError') this._error(error); }
  }
  async _start(generation) {
    let requestedPlay,requestedFrame=this._frame;
    if (this._project.script.trim()) {
      try {
        const { createRuntime } = await import('./runtime/client.js');
        if (generation !== this._generation || !this.isConnected) return;
        this._runtime?.dispose();
        const runtime = await createRuntime();
        if (generation !== this._generation || !this.isConnected) { runtime.dispose(); return; }
        this._runtime = runtime;
        const p = structuredClone(this._project);
        const result = await this._runtime.run(p.script, { frame: this._frame, fps: p.fps, width: p.width, height: p.height, nodes: p.nodes });
        if (generation !== this._generation) return;
        if (result.error) throw new Error(result.error);
        for (const command of result.commands || []) {
          if (command.type === 'set' || command.kind === 'set') {
            const node = p.nodes.find(n => n.id === command.id);
            if (node && ['x', 'y', 'rotation', 'opacity', 'scale', 'width', 'height', 'fontSize', 'strokeWidth'].includes(command.property) && Number.isFinite(command.value)) node[command.property] = command.value;
            else if (node && ['fill', 'stroke', 'text'].includes(command.property) && typeof command.value === 'string') node[command.property] = command.value;
            else if (node && command.property === 'visible' && typeof command.value === 'boolean') node.visible = command.value;
          } else if (command.type === 'stop' || command.kind === 'stop') requestedPlay = false;
          else if (command.type === 'play' || command.kind === 'play') requestedPlay = true;
          else if (command.type === 'goto' || command.kind === 'goto') { requestedFrame=command.frame; requestedPlay = command.play; }
        }
        this._project = validateProject(p); this.seek(requestedFrame); this._render();
        this.dispatchEvent(new CustomEvent('rash-script', { detail: { logs: result.logs || [] } }));
      } catch (error) { requestedPlay=false;this.status.textContent = `Script: ${error.message}`; this.dispatchEvent(new CustomEvent('rash-warning', { detail: { message: error.message } })); }
    }
    if (generation !== this._generation || !this.isConnected) return;
    const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!reduce && (requestedPlay === true || (requestedPlay !== false && this.hasAttribute('autoplay')))) this.play();
  }
  _error(error) { this.pause(); this.status.textContent = error.message; this.dispatchEvent(new CustomEvent('rash-error', { detail: { message: error.message } })); }
  _render() {
    if (!this._project) return;
    renderScene(this.svg, this._gameScene||this._project, this._frame);
    this.slider.value = String(this._frame);
    this.output.textContent = `${(this._frame / this._project.fps).toFixed(1)} s`;
  }
  get currentFrame() { return this._frame; }
  _isGame(){return this._project?.nodes.some(n=>n.name==='player')&&this._project.nodes.some(n=>n.name.startsWith('energy-'));}
  _resetGame(){this._game=null;this._gameScene=null;this._gameInput={};this._frame=0;this._render();}
  seek(frame) { if (!this._project) return; this._frame = Math.max(0, Math.min(this._project.duration - 1, Math.round(Number(frame) || 0))); this._started = performance.now() - this._frame / this._project.fps * 1000; this._render(); }
  play() {
    if (!this._project || this.playing) return;
    if(this._isGame()&&(!this._game||['won','lost'].includes(this._game.status))){this._gameScene=structuredClone(this._project);this._game=createGame(this._gameScene);}
    if (this._frame >= this._project.duration - 1) this._frame = 0;
    this.playing = true; this.button.textContent = 'Pause'; this.button.setAttribute('aria-label', 'Pause animation');
    this._started = performance.now() - this._frame / this._project.fps * 1000;
    let previous=performance.now();
    const tick = time => {
      if (!this.playing || !this.isConnected) return;
      if(this._game){const result=this._game.step((time-previous)/1000,this._gameInput);previous=time;this._frame=Math.floor((time-this._started)/1000*this._project.fps)%this._project.duration;this._render();if(result.status==='won'||result.status==='lost'){this.pause();this.dispatchEvent(new CustomEvent('rash-game-ended',{detail:result}));return;}this._request=requestAnimationFrame(tick);return;}
      let frame = Math.floor((time - this._started) / 1000 * this._project.fps);
      if (frame >= this._project.duration) {
        if (this.hasAttribute('loop')) { frame %= this._project.duration; this._started = time - frame / this._project.fps * 1000; }
        else { this._frame = this._project.duration - 1; this._render(); this.pause(); this.dispatchEvent(new Event('rash-ended')); return; }
      }
      if (frame !== this._frame) { this._frame = frame; this._render(); }
      this._request = requestAnimationFrame(tick);
    };
    this._request = requestAnimationFrame(tick);
  }
  pause() { this.playing = false; cancelAnimationFrame(this._request); this._gameInput={}; this.button.textContent = 'Play'; this.button.setAttribute('aria-label', 'Play animation'); }
}
if (!customElements.get('rash-player')) customElements.define('rash-player', RashPlayer);
