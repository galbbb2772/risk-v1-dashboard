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
  const clean=String(url).split("?")[0].replace(/^\.\//,"");
  return path.resolve(clean);
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

const app=fs.readFileSync("assets/app.js","utf8");
window.eval(app);
await new Promise(r=>setTimeout(r,350));

if(errors.length) throw new Error("Runtime errors: "+errors.join(" | "));
if(!document.querySelector("#historyCards")?.textContent.trim()) throw new Error("historyCards did not render");
if(!document.querySelector("#capitalCards")?.textContent.includes("5.280")) throw new Error("Capital 5.280 card missing");

const hist=ensurePlotEl("historyChart");
if((hist.data||[]).length<7) throw new Error("Expected >=7 history traces including Capital Layer");
const histMax=Math.max(...hist.data.flatMap(t=>(t.y||[]).map(Number).filter(Number.isFinite)));
if(!hist.data.some(t=>String(t.name||"").includes("Capital Layer V1"))) throw new Error("Capital Layer history trace missing");
if(histMax<5.27) throw new Error("Capital Layer 5.28x history line is missing from main history chart");

const cap=ensurePlotEl("capitalNavChart");
const capMax=Math.max(...cap.data.flatMap(t=>(t.y||[]).map(Number).filter(Number.isFinite)));
if(Math.abs(capMax-5.280261504516695)>1e-6) throw new Error("Capital Layer audited curve does not end at 5.2802615x");
const capitalTab=document.querySelector('.tab[data-tab="capital"]');
if(!capitalTab) throw new Error("Capital tab missing");
capitalTab.click();
await new Promise(r=>setTimeout(r,120));
if(!document.querySelector("#capital")?.classList.contains("active")) throw new Error("Capital panel did not activate");
if(!(ensurePlotEl("capitalNavChart").data||[]).length) throw new Error("Capital NAV chart missing after tab activation");
if(!document.querySelector("#capitalCards")?.textContent.includes("5.280")) throw new Error("Capital metrics disappeared after tab activation");

for(const key of ["1M","6M","12M","ALL"]){
  const btn=document.querySelector('#historyPresets button[data-range="'+key+'"]');
  if(!btn) throw new Error("Missing range button "+key);
  btn.click();
  await new Promise(r=>setTimeout(r,25));
  const a=document.querySelector("#historyStart").value,b=document.querySelector("#historyEnd").value;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(a)||!/^\d{4}-\d{2}-\d{2}$/.test(b)) throw new Error("Bad date range after "+key+": "+a+" -> "+b);
  if(Date.parse(a)>Date.parse(b)) throw new Error("Reversed date range after "+key);
}

const relayoutHandlers=hist.__handlers?.plotly_relayout||[];
for(const cb of relayoutHandlers){
  cb({"xaxis.range[0]":"2026-04-01 00:00:00","xaxis.range[1]":"2026-09-11 00:00:00"});
}
await new Promise(r=>setTimeout(r,50));
if(errors.length) throw new Error("Errors after relayout: "+errors.join(" | "));

console.log("Dashboard browser smoke test PASS");
console.log(JSON.stringify({
  history_traces:hist.data.length,
  history_max:histMax,
  capital_final:capMax,
  range:[document.querySelector("#historyStart").value,document.querySelector("#historyEnd").value]
},null,2));
