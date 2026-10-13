/** Original MIT-licensed SWF 6 fixtures; no compiler or third-party artwork.
 * Encodings follow Adobe SWF File Format v19 (RECT, DefineShape,
 * PlaceObject2, DoAction, ActionPush, ActionSetProperty, ActionStop):
 * https://open-flash.github.io/mirrors/swf-spec-19.pdf
 * The paired control has identical geometry but omits the property-write action.
 */
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const u16 = n => { const b=Buffer.alloc(2);b.writeUInt16LE(n);return b; };
const u32 = n => { const b=Buffer.alloc(4);b.writeUInt32LE(n);return b; };
const cat = (...parts) => Buffer.concat(parts.map(p=>Buffer.from(p)));
class Bits {
  values=[];
  put(n,width){for(let i=width-1;i>=0;i--)this.values.push((n>>i)&1);return this;}
  bytes(){while(this.values.length%8)this.values.push(0);return Buffer.from(Array.from({length:this.values.length/8},(_,i)=>this.values.slice(i*8,i*8+8).reduce((a,b)=>a*2+b,0)));}
}
const rect=(w,h)=>new Bits().put(13,5).put(0,13).put(w,13).put(0,13).put(h,13).bytes();
function tag(code,payload=Buffer.alloc(0)) {return cat(u16((code<<6)|Math.min(63,payload.length)),payload.length>=63?u32(payload.length):[],payload);}
function shape(){
  const b=new Bits().put(1,4).put(0,4); // one fill-index bit, no line indices
  b.put(0,1).put(5,5).put(1,5).put(0,1).put(0,1).put(1,1); // move, fill1
  for(const [vertical,delta] of [[0,800],[1,800],[0,-800],[1,-800]])
    b.put(1,1).put(1,1).put(9,4).put(0,1).put(vertical,1).put(delta,11);
  b.put(0,6);
  return tag(2,cat(u16(1),rect(800,800),[1,0,255,128,0,0],b.bytes()));
}
export function createCompatibilitySwf(scripted=true){
  const pushData=cat([0],Buffer.from('hero\0'),[7],u32(0),[7],u32(80));
  const actions=scripted?cat([0x96],u16(pushData.length),pushData,[0x23,0x07,0]):Buffer.from([0x07,0]);
  const body=cat(rect(3200,2000),u16(12*256),u16(1),tag(9,[255,255,255]),shape(),
    tag(26,cat([0x26],u16(1),u16(1),new Bits().put(0,1).put(0,1).put(1,5).put(0,1).put(0,1).bytes(),Buffer.from('hero\0'))),
    tag(12,actions),tag(1),tag(0));
  return cat(Buffer.from('FWS'),[6],u32(body.length+8),body);
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  for(const scripted of [false,true]){
    const url=new URL(`../tests/fixtures/avm1-${scripted?'scripted':'control'}.swf`,import.meta.url);
    const bytes=createCompatibilitySwf(scripted);writeFileSync(url,bytes);console.log(`${url.pathname}: ${bytes.length} bytes`);
  }
}
