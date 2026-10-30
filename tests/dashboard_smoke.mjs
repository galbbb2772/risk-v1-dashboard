import fs from "node:fs";
import path from "node:path";
import {JSDOM} from "jsdom";

const html=fs.readFileSync("index.html","utf8");
const dom=new JSDOM(html,{url:"https://example.test/",runScripts:"outside-only",pretendToBeVisual:true});
const {window}=dom;
global.window=window; global.document=window.document; global.Event=window.Event;
window.console=console;

const errors=[];
window.addEventListener("error",e=>errors.push(String(e.error||e.message)));
window.addEventListener("unhandledrejection",e=>errors.push(String(e.reason)));

function localPath(url){
  return path.resolve(String(url).split("?")[0].replace(/^\.\//,""));
}
const fakeFetch=async url=>{
  const p=localPath(url);
  if(!fs.existsSync(p)) throw new Error("Missing fetch file: "+url);
  const body=fs.readFileSync(p,"utf8");
  return {ok:true,status:200,text:async()=>body,json:async()=>JSON.parse(body)};
};
global.fetch=fakeFetch; window.fetch=fakeFetch;

function ensurePlotEl(id){
  const el=document.getElementById(id);
  if(!el) throw new Error("Missing plot element "+id);
  if(!el.on){
    el.__handlers={};
    el.on=(type,cb)=>{(el.__handlers[type]??=[]).push(cb)};
  }
  return el;
}
const Plotly={
  react:async(id,data,layout)=>{const el=ensurePlotEl(id);el.data=data;el.layout=layout;return el;},
  relayout:async(id,update)=>{const el=ensurePlotEl(id);el.layout={...(el.layout||{}),...update};return el;},
  purge:id=>{const el=ensurePlotEl(id);el.data=[];el.layout={};}
};
global.Plotly=Plotly; window.Plotly=Plotly;

window.eval(fs.readFileSync("assets/app.js","utf8"));
await new Promise(r=>setTimeout(r,450));

if(errors.length) throw new Error("Runtime errors: "+errors.join(" | "));
if(!document.querySelector("#historyCards")?.textContent.trim()) throw new Error("historyCards did not render");
if(!document.querySelector("#capitalCards")?.textContent.includes("5.280")) throw new Error("Capital 5.280 card missing");

const hist=ensurePlotEl("historyChart");
if((hist.data||[]).length<6) throw new Error("Expected at least 6 Risk V1 history traces");
if(hist.data.some(t=>String(t.name||"").includes("Capital Layer"))) throw new Error("Capital Layer must not be mixed into main Risk V1 history chart");
const histMax=Math.max(...hist.data.flatMap(t=>(t.y||[]).map(Number).filter(Number.isFinite)));
if(histMax>3.0) throw new Error("Main Risk V1 history chart is vertically distorted by unrelated high-NAV data: "+histMax);

const cap=ensurePlotEl("capitalNavChart");
if((cap.data||[]).length<2) throw new Error("Capital daily chart must include Capital Layer and Core-only");
const mainCap=cap.data.find(t=>String(t.name||"").includes("Capital Layer V1"));
const coreCap=cap.data.find(t=>String(t.name||"").includes("Core only"));
if(!mainCap||!coreCap) throw new Error("Capital daily comparison lines missing");
if((mainCap.x||[]).length!==1764||(mainCap.y||[]).length!==1764) throw new Error("Capital Layer must have 1764 real daily observations");
if(mainCap.x[0]!=="2019-09-05"||mainCap.x.at(-1)!=="2026-09-11") throw new Error("Capital daily date boundary mismatch");
const capFinal=Number(mainCap.y.at(-1)),coreFinal=Number(coreCap.y.at(-1));
if(Math.abs(capFinal-5.280261504516695)>1e-10) throw new Error("Capital real daily final mismatch: "+capFinal);
if(Math.abs(coreFinal-4.684290357825601)>1e-10) throw new Error("Core-only real daily final mismatch: "+coreFinal);

for(const key of ["1M","6M","12M","ALL"]){
  const btn=document.querySelector('#historyPresets button[data-range="'+key+'"]');
  if(!btn) throw new Error("Missing Risk history range button "+key);
  btn.click();
  await new Promise(r=>setTimeout(r,25));
  const a=document.querySelector("#historyStart").value,b=document.querySelector("#historyEnd").value;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(a)||!/^\d{4}-\d{2}-\d{2}$/.test(b)) throw new Error("Bad Risk date range after "+key+": "+a+" -> "+b);
  if(Date.parse(a)>Date.parse(b)) throw new Error("Reversed Risk range after "+key);
}

const capitalTab=document.querySelector('.tab[data-tab="capital"]');
if(!capitalTab) throw new Error("Capital tab missing");
capitalTab.click();
await new Promise(r=>setTimeout(r,120));
if(!document.querySelector("#capital")?.classList.contains("active")) throw new Error("Capital panel did not activate");
if((ensurePlotEl("capitalNavChart").data||[]).length<2) throw new Error("Capital real daily chart missing after tab activation");

for(const key of ["1M","6M","12M","ALL"]){
  const btn=document.querySelector('#capitalPresets button[data-range="'+key+'"]');
  if(!btn) throw new Error("Missing Capital range button "+key);
  btn.click();
  await new Promise(r=>setTimeout(r,25));
  const a=document.querySelector("#capitalStart").value,b=document.querySelector("#capitalEnd").value;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(a)||!/^\d{4}-\d{2}-\d{2}$/.test(b)) throw new Error("Bad Capital date range after "+key+": "+a+" -> "+b);
  if(Date.parse(a)>Date.parse(b)) throw new Error("Reversed Capital range after "+key);
}

const relayoutHandlers=hist.__handlers?.plotly_relayout||[];
for(const cb of relayoutHandlers){
  cb({"xaxis.range[0]":"2026-04-01 00:00:00","xaxis.range[1]":"2026-09-11 00:00:00"});
}
await new Promise(r=>setTimeout(r,50));
if(errors.length) throw new Error("Errors after relayout: "+errors.join(" | "));

console.log("Dashboard browser smoke test PASS");
console.log(JSON.stringify({
  risk_history_traces:hist.data.length,
  risk_history_max:histMax,
  capital_points:mainCap.y.length,
  capital_final:capFinal,
  core_final:coreFinal
},null,2));
