// A deterministic fixed-step mini game. No network, dynamic code or hidden timers.
export function createGame(project){
 const originals=structuredClone(project.nodes);const player=project.nodes.find(n=>n.name==='player');
 let score=0,status='ready',accumulator=0;
 const radius=n=>Math.min(n.width,n.height)/2;
 const hit=(a,b)=>Math.hypot(a.x+a.width/2-b.x-b.width/2,a.y+a.height/2-b.y-b.height/2)<radius(a)+radius(b);
 const label=project.nodes.find(n=>n.name==='Game status');
 const game={
  get score(){return score;},get status(){return status;},
  reset(){project.nodes.forEach((n,i)=>Object.assign(n,structuredClone(originals[i])));score=0;status='ready';accumulator=0;},
  step(dt,input={}){
   if(!player||status==='won'||status==='lost')return {score,status};
   status='playing';accumulator+=Math.min(Math.max(dt,0),0.1);
   while(accumulator>=1/60){
    accumulator-=1/60;let dx=Number(!!input.right)-Number(!!input.left),dy=Number(!!input.down)-Number(!!input.up);
    if(input.target){dx=input.target.x-player.x-player.width/2;dy=input.target.y-player.y-player.height/2;const distance=Math.hypot(dx,dy);if(distance<4){dx=0;dy=0;}else{dx/=distance;dy/=distance;}}
    const magnitude=Math.max(1,Math.hypot(dx,dy)),speed=Math.min(project.width,project.height)*0.45/60;
    player.x=Math.max(0,Math.min(project.width-player.width,player.x+dx/magnitude*speed));player.y=Math.max(0,Math.min(project.height-player.height,player.y+dy/magnitude*speed));
    for(const n of project.nodes){if(!n.visible)continue;if(n.name.startsWith('energy-')&&hit(player,n)){n.visible=false;score++;}if(n.name.startsWith('hazard-')&&hit(player,n))status='lost';}
    if(!project.nodes.some(n=>n.name.startsWith('energy-')&&n.visible))status='won';
   }
   if(label)label.text=status==='won'?`ALL SIGNALS COLLECTED · SCORE ${score}`:status==='lost'?`SIGNAL LOST · SCORE ${score} · RESET TO TRY AGAIN`:`SIGNALS ${score} / ${originals.filter(n=>n.name.startsWith('energy-')).length}`;
   return {score,status};
  }
 };return game;
}
