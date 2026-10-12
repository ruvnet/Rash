const film=document.querySelector('#film'),toggle=document.querySelector('#toggle'),status=document.querySelector('#status');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let svg,doc,playing=false,seconds=0;
const animations=()=>doc.getAnimations();
function seek(time){
 seconds=time;svg.setCurrentTime(time);
 for(const animation of animations()){animation.pause();animation.currentTime=time*1000;}
 if(playing){svg.unpauseAnimations();animations().forEach(a=>a.play());}else svg.pauseAnimations();
}
function setPlaying(value){
 playing=value;toggle.textContent=value?'Pause animation':'Play animation';
 if(value){svg.unpauseAnimations();animations().forEach(a=>a.play());status.textContent='Playing the twenty second explainer.';}
 else{seconds=svg.getCurrentTime();svg.pauseAnimations();animations().forEach(a=>a.pause());status.textContent='Paused. Choose a chapter or resume playback.';}
}
function permitMotion(){
 if(svg.getAttribute('data-motion')!=='on'){
  const current=svg.getCurrentTime();svg.setAttribute('data-motion','on');
  // Apply styles before enumerating newly enabled CSS animations.
  doc.defaultView.getComputedStyle(svg.querySelector('.chapter'));
  seek(current);
 }
}
film.addEventListener('load',()=>{
 try{
  doc=film.contentDocument;svg=doc?.documentElement;
  if(svg?.localName!=='svg'||doc.querySelector('parsererror'))throw Error('The SVG could not be loaded.');
  document.querySelectorAll('button').forEach(b=>b.disabled=false);
  playing=false;seek(0);setPlaying(!reduced.matches);
  if(reduced.matches)status.textContent='Reduced motion is active. The poster stays still until you choose Play or a chapter.';
 }catch{status.textContent='The SVG could not be loaded. Open the static poster below.';}
});
film.addEventListener('error',()=>{status.textContent='The SVG could not be loaded. Open the static poster below.';});
toggle.addEventListener('click',()=>{permitMotion();setPlaying(!playing);});
document.querySelector('#restart').addEventListener('click',()=>{permitMotion();playing=true;seek(0);setPlaying(true);});
document.querySelectorAll('[data-time]').forEach(button=>button.addEventListener('click',()=>{
 permitMotion();setPlaying(false);seek(Number(button.dataset.time));
 document.querySelectorAll('[data-time]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
 status.textContent=`Paused on ${button.textContent.slice(3)}. Press Play to continue.`;
}));
document.addEventListener('visibilitychange',()=>{if(document.hidden&&svg)setPlaying(false);});
reduced.addEventListener('change',event=>{if(event.matches&&svg){setPlaying(false);svg.removeAttribute('data-motion');seek(0);}});
