import '../embed.js';
const status=document.querySelector('#status'),players=[];
const size=n=>`${(n/1000).toFixed(1)} KB`;
try{
 const response=await fetch('manifest.json');if(!response.ok)throw Error('The example catalog could not be loaded.');
 const {examples}=await response.json();let loaded=0;
 for(const [index,entry]of examples.entries()){
  const article=document.createElement('article');article.id=entry.id;
  const title=document.createElement('h2'),number=document.createElement('span');number.textContent=String(index+1).padStart(2,'0');title.append(number,entry.name);
  const description=document.createElement('p');description.textContent=entry.description;
  const player=document.createElement('rash-player');player.setAttribute('src',`${entry.id}.rash.json`);player.setAttribute('controls','');player.setAttribute('loop','');player.setAttribute('aria-label',entry.name);
  player.addEventListener('rash-load',()=>{player.seek(entry.posterFrame);if(++loaded===examples.length)document.querySelector('#play').disabled=false;});player.addEventListener('rash-error',event=>{status.textContent=`${entry.name}: ${event.detail.message}`;});players.push(player);
  const meta=document.createElement('p');meta.className='meta';meta.textContent=`${entry.seconds} seconds · ${entry.fps} fps · ${entry.layers} layers · SVG ${size(entry.svgBytes)} · ${size(entry.gzipBytes)} gzip`;
  const downloads=document.createElement('nav');downloads.className='downloads';downloads.setAttribute('aria-label',`${entry.name} downloads`);
  for(const [label,suffix]of[['Animated SVG','.svg'],['Project JSON','.rash.json'],['Static poster','.poster.svg']]){const a=document.createElement('a');a.textContent=label;a.href=entry.id+suffix;a.download=entry.id+suffix;downloads.append(a);}
  article.append(title,description,player,meta,downloads);document.querySelector('#studies').append(article);
 }
 document.querySelector('#play').onclick=()=>players.forEach(p=>p.play());
 document.querySelector('#pause').onclick=()=>players.forEach(p=>p.pause());
 document.addEventListener('visibilitychange',()=>{if(document.hidden)players.forEach(p=>p.pause());});
}catch(error){status.textContent=error.message;}
