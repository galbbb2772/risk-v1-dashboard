import fs from "node:fs";
import puppeteer from "puppeteer-core";

const candidates=[
  process.env.CHROME_BIN,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser"
].filter(Boolean);
const executablePath=candidates.find(p=>fs.existsSync(p));
if(!executablePath) throw new Error("Chrome/Chromium executable not found");

const browser=await puppeteer.launch({
  executablePath,
  headless:"new",
  args:["--no-sandbox","--disable-dev-shm-usage","--disable-gpu"]
});
const page=await browser.newPage();
await page.setViewport({width:1440,height:1100,deviceScaleFactor:1});

const errors=[];
page.on("pageerror",e=>errors.push("pageerror: "+e.message));
page.on("console",m=>{if(m.type()==="error")errors.push("console: "+m.text())});

await page.goto("http://127.0.0.1:8000/",{waitUntil:"networkidle2",timeout:45000});
await page.waitForFunction(()=>document.querySelector("#historyChart")?.data?.length>=6,{timeout:20000});

async function plotHealth(id,minLines=1){
  return await page.$eval("#"+id,(el,minLines)=>{
    const r=el.getBoundingClientRect();
    const svg=el.querySelector(".main-svg");
    const allPaths=[...el.querySelectorAll("path")];
    const lines=[...el.querySelectorAll(".scatterlayer .trace path.js-line")].filter(p=>(p.getAttribute("d")||"").length>20);
    const xticks=el.querySelectorAll(".xtick").length;
    const yticks=el.querySelectorAll(".ytick").length;
    return {
      width:r.width,height:r.height,hasSvg:!!svg,lineCount:lines.length,
      xticks,yticks,
      dataCount:(el.data||[]).length,
      minLines,
      scatterHtml:(el.querySelector(".scatterlayer")?.innerHTML||"").slice(0,2500),
      pathSummary:allPaths.slice(0,40).map(p=>({cls:p.getAttribute("class"),d:(p.getAttribute("d")||"").slice(0,180),len:(p.getAttribute("d")||"").length}))
    };
  },minLines);
}
function assertHealthy(name,h,minLines=1){
  if(!h.hasSvg) throw new Error(name+" missing Plotly SVG");
  if(h.width<600||h.height<250) throw new Error(name+" bad size "+JSON.stringify(h));
  if(h.lineCount<minLines) throw new Error(name+" missing visible line paths "+JSON.stringify(h));
  if(h.xticks<2||h.xticks>30||h.yticks<2||h.yticks>20) throw new Error(name+" pathological tick count "+JSON.stringify(h));
}

// Hidden tabs must truly be uninitialized before click.
const hidden=await page.evaluate(()=>({
  treasury:(document.querySelector("#treasuryDailyChart")?.data||[]).length,
  capital:(document.querySelector("#capitalNavChart")?.data||[]).length
}));
if(hidden.treasury!==0||hidden.capital!==0) throw new Error("Hidden Plotly tabs initialized too early: "+JSON.stringify(hidden));

// Treasury
await page.click('.tab[data-tab="treasury"]');
await page.waitForFunction(()=>document.querySelector("#treasuryDailyChart")?.data?.length>=2,{timeout:10000});
await page.waitForSelector("#treasuryDailyChart .main-svg",{timeout:10000});
await new Promise(r=>setTimeout(r,250));
assertHealthy("treasuryDailyChart",await plotHealth("treasuryDailyChart",2),2);
assertHealthy("treasuryUpliftChart",await plotHealth("treasuryUpliftChart",2),2);
assertHealthy("treasuryLegacyChart",await plotHealth("treasuryLegacyChart",2),2);

// Capital
await page.click('.tab[data-tab="capital"]');
await page.waitForFunction(()=>document.querySelector("#capitalNavChart")?.data?.length>=2,{timeout:10000});
await page.waitForSelector("#capitalNavChart .main-svg",{timeout:10000});
await new Promise(r=>setTimeout(r,250));
const capHealth=await plotHealth("capitalNavChart",2);
assertHealthy("capitalNavChart",capHealth,2);
const capData=await page.$eval("#capitalNavChart",el=>({
  n0:el.data?.[0]?.y?.length,
  firstDate:el.data?.[0]?.x?.[0],
  lastDate:el.data?.[0]?.x?.at(-1),
  final:Number(el.data?.[0]?.y?.at(-1)),
  coreFinal:Number(el.data?.[1]?.y?.at(-1))
}));
if(capData.n0!==1764||capData.firstDate!=="2019-09-05"||capData.lastDate!=="2026-09-11")
  throw new Error("Capital daily history boundary/length mismatch: "+JSON.stringify(capData));
if(Math.abs(capData.final-5.280261504516695)>1e-10)
  throw new Error("Capital final mismatch: "+capData.final);
if(Math.abs(capData.coreFinal-4.684290357825601)>1e-10)
  throw new Error("Core final mismatch: "+capData.coreFinal);

// Range controls must preserve visible chart.
await page.click('#capitalPresets button[data-range="1M"]');
await new Promise(r=>setTimeout(r,250));
const capRange=await page.evaluate(()=>({
  start:document.querySelector("#capitalStart")?.value,
  end:document.querySelector("#capitalEnd")?.value
}));
if(!/^2026-0[78]-|^2026-08-/.test(capRange.start)||capRange.end!=="2026-09-11")
  throw new Error("Capital 1M range unexpected: "+JSON.stringify(capRange));
assertHealthy("capitalNavChart after 1M",await plotHealth("capitalNavChart",2),2);

// Main history must remain readable and not contain Capital.
await page.click('.tab[data-tab="history"]');
await new Promise(r=>setTimeout(r,150));
const historyData=await page.$eval("#historyChart",el=>({
  names:(el.data||[]).map(t=>String(t.name||"")),
  max:Math.max(...(el.data||[]).flatMap(t=>(t.y||[]).map(Number).filter(Number.isFinite)))
}));
if(historyData.names.some(n=>n.includes("Capital Layer"))) throw new Error("Capital leaked into Risk history");
if(historyData.max>3) throw new Error("Risk history Y scale polluted: "+historyData.max);
assertHealthy("historyChart",await plotHealth("historyChart",3),3);

if(errors.length) throw new Error("Browser errors: "+errors.join(" | "));
console.log("REAL BROWSER DASHBOARD TEST PASS");
console.log(JSON.stringify({treasury:true,capital:capData,capital_health:capHealth,history_max:historyData.max},null,2));
await browser.close();
