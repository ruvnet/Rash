import {performance} from 'node:perf_hooks';
import {createProject,addNode,evaluateScene} from '../web/core/model.js';
const p=createProject('blank');for(let i=0;i<1000;i++){const n=addNode(p);n.keyframes=[{frame:0,x:i},{frame:239,x:i+100,easing:'linear'}];}
const times=[];for(let i=0;i<1100;i++){const t=performance.now();evaluateScene(p,i%240);if(i>=100)times.push(performance.now()-t);}
times.sort((a,b)=>a-b);console.log(JSON.stringify({benchmark:'1000 node timeline evaluation',samples:times.length,p50Ms:times[500],p95Ms:times[950],p99Ms:times[990],scope:'Node.js evaluation only. This is not browser rendering FPS.'},null,2));
