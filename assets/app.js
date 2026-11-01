const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const num=v=>v==null||v===""?NaN:Number(v);
const fmt=(v,d=2)=>Number.isFinite(num(v))?num(v).toFixed(d):"—";
const pct=(v,d=2)=>Number.isFinite(num(v))?num(v).toFixed(d)+"%":"—";
const esc=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const COLORS={same:"#9fb7d9",strict:"#8cb8ff",t6:"#b59cff",tbill:"#56d6a4",legacyTbill:"#76c9b0",full:"#ff7d89",gold:"#f3c76b",orange:"#ff9a72",muted:"#8594ab"};
const baseLayout={autosize:true,paper_bgcolor:"rgba(0,0,0,0)",plot_bgcolor:"rgba(0,0,0,0)",font:{color:"#cad5e7"},margin:{l:62,r:28,t:34,b:58},hovermode:"x unified",legend:{orientation:"h",y:1.14,x:0},dragmode:"pan",xaxis:{gridcolor:"#182235",automargin:true},yaxis:{gridcolor:"#182235",automargin:true}};
const plotCfg={responsive:true,displaylogo:false,displayModeBar:false,scrollZoom:true,doubleClick:"reset"};

function parseCSV(text){
  const rows=[];let row=[],cell="",q=false;
  for(let i=0;i<text.length;i++){const ch=text[i],n=text[i+1];
    if(ch==='"'&&q&&n==='"'){cell+='"';i++;continue}
    if(ch==='"'){q=!q;continue}
    if(ch===","&&!q){row.push(cell);cell="";continue}
    if((ch==="\n"||ch==="\r")&&!q){if(ch==="\r"&&n==="\n")i++;row.push(cell);cell="";if(row.some(x=>x!==""))rows.push(row);row=[];continue}
    cell+=ch;
  }
  if(cell||row.length){row.push(cell);rows.push(row)}
  if(rows.length<2)return[];
  const h=rows[0];
  return rows.slice(1).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??""])));
}
const csv=path=>fetch(path+"?ts="+Date.now(),{cache:"no-store"}).then(r=>r.text()).then(parseCSV);
const json=path=>fetch(path+"?ts="+Date.now(),{cache:"no-store"}).then(r=>r.json());
function metric(label,value,cls=""){return "<div class='metric'><span class='small'>"+esc(label)+"</span><b class='"+cls+"'>"+esc(value)+"</b></div>"}
function table(rows,cols){return "<table><thead><tr>"+cols.map(c=>"<th>"+c[0]+"</th>").join("")+"</tr></thead><tbody>"+rows.map(r=>"<tr>"+cols.map((c,i)=>"<td class='"+(i===0?"left":"")+"'>"+c[1](r)+"</td>").join("")+"</tr>").join("")+"</tbody></table>"}
function toISODate(v){
  if(v==null)return "";
  if(typeof v==="number")return new Date(v).toISOString().slice(0,10);
  const str=String(v);
  const m=str.match(/^\d{4}-\d{2}-\d{2}/);
  if(m)return m[0];
  const t=Date.parse(str);
  return Number.isFinite(t)?new Date(t).toISOString().slice(0,10):str.slice(0,10);
}
function nearestIndex(dates,date){
  const iso=toISODate(date),t=Date.parse(iso);let best=0,dist=Infinity;
  dates.forEach((d,i)=>{const z=Math.abs(Date.parse(d)-t);if(z<dist){dist=z;best=i}});
  return best;
}
function clampRange(dates,a,b,minPts=30){
  let lo=nearestIndex(dates,a),hi=nearestIndex(dates,b);if(lo>hi)[lo,hi]=[hi,lo];
  const need=Math.min(Math.max(2,minPts),dates.length);
  if(hi-lo+1<need){
    const mid=Math.round((lo+hi)/2);
    lo=Math.max(0,mid-Math.floor(need/2));
    hi=Math.min(dates.length-1,lo+need-1);
    lo=Math.max(0,hi-need+1);
  }
  return[dates[lo],dates[hi]];
}
function presetRange(dates,key){
  if(key==="ALL")return[dates[0],dates.at(-1)];
  const days={"1M":31,"3M":92,"6M":183,"12M":366,"3Y":1096,"5Y":1827}[key]||366;
  const start=new Date(Date.parse(dates.at(-1))-days*86400000).toISOString().slice(0,10);
  return clampRange(dates,start,dates.at(-1),30);
}
const zoomGroups={};
function bindBoundedTimeZoom(id,dates,minPts=30,syncIds=[],groupKey=id,onRange=null){
  const el=$("#"+id); if(!el||el.__boundedZoom)return;
  const state=zoomGroups[groupKey]||(zoomGroups[groupKey]={busy:false});
  el.on("plotly_relayout",ev=>{
    if(state.busy)return;
    let a=ev["xaxis.range[0]"],b=ev["xaxis.range[1]"];
    if(ev["xaxis.autorange"]){a=dates[0];b=dates.at(-1)}
    if(a==null||b==null)return;
    const safe=clampRange(dates,a,b,minPts);
    const targets=[id,...syncIds].filter((v,i,arr)=>arr.indexOf(v)===i);
    state.busy=true;
    Promise.all(targets.map(t=>Plotly.relayout(t,{"xaxis.range":safe,"xaxis.autorange":false})))
      .then(()=>onRange&&onRange(safe))
      .finally(()=>state.busy=false);
  });
  el.__boundedZoom=true;
}
function boundedX(dates,range=null,slider=false){
  return {...baseLayout.xaxis,
    type:"date",
    range:range||[dates[0],dates.at(-1)],
    autorange:false,
    tickformatstops:[
      {dtickrange:[null,86400000*45],value:"%b %d"},
      {dtickrange:[86400000*45,86400000*370],value:"%b %Y"},
      {dtickrange:[86400000*370,null],value:"%Y"}
    ],
    rangeslider:slider?{visible:true,thickness:.08}:undefined
  };
}
function visibleRange(dates,seriesList,range,padFrac=.06){
  const lo=nearestIndex(dates,range[0]),hi=nearestIndex(dates,range[1]);
  const vals=[];
  for(const arr of seriesList){
    for(let i=lo;i<=hi&&i<arr.length;i++){
      const v=num(arr[i]);if(Number.isFinite(v))vals.push(v);
    }
  }
  if(!vals.length)return null;
  let mn=Math.min(...vals),mx=Math.max(...vals);
  if(mn===mx){const p=Math.max(Math.abs(mn)*.03,.01);return[mn-p,mx+p]}
  const p=(mx-mn)*padFrac;
  return[mn-p,mx+p];
}
function visibleTraceRange(traces,range,padFrac=.06){
  const a=Date.parse(toISODate(range[0])),b=Date.parse(toISODate(range[1])),vals=[];
  for(const tr of traces){
    const xs=tr.x||[],ys=tr.y||[];
    for(let i=0;i<Math.min(xs.length,ys.length);i++){
      const t=Date.parse(toISODate(xs[i])),v=num(ys[i]);
      if(t>=a&&t<=b&&Number.isFinite(v))vals.push(v);
    }
  }
  if(!vals.length)return null;
  let mn=Math.min(...vals),mx=Math.max(...vals);
  if(mn===mx){const p=Math.max(Math.abs(mn)*.03,.01);return[mn-p,mx+p]}
  const p=(mx-mn)*padFrac;return[mn-p,mx+p];
}
function drawdown(nav){let peak=-Infinity;return nav.map(v=>{v=num(v);peak=Math.max(peak,v);return peak>0?(v/peak-1)*100:0})}
const renderedPanels=new Set(["history"]);
function refreshVisiblePlots(panelId){
  const panel=document.getElementById(panelId); if(!panel)return;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    panel.querySelectorAll(".chart").forEach(el=>{
      if(el.data&&window.Plotly?.Plots?.resize){
        try{window.Plotly.Plots.resize(el)}catch(e){console.warn("Plot resize failed",el.id,e)}
      }
    });
    window.dispatchEvent(new Event("resize"));
  }));
}
function renderPanelWhenVisible(panelId){
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if(!window.__dashboardReady)return;
    if(!renderedPanels.has(panelId)){
      if(panelId==="capital")renderCapital();
      else if(panelId==="treasury")renderTreasury();
      else if(panelId==="trades")renderTrades(document.getElementById("tradeSearch")?.value||"");
      else if(panelId==="forward")renderForward();
      else if(panelId==="rules")renderRules();
      renderedPanels.add(panelId);
    }
    refreshVisiblePlots(panelId);
  }));
}
function bindTabs(){
  const tabs=[...document.querySelectorAll(".tab")];
  const panels=[...document.querySelectorAll(".panel")];
  tabs.forEach(b=>{
    b.onclick=()=>{
      tabs.forEach(x=>x.classList.remove("active"));
      panels.forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      const panel=document.getElementById(b.dataset.tab);
      if(panel)panel.classList.add("active");
      renderPanelWhenVisible(b.dataset.tab);
    };
  });
}

let S,RISK,TBILL,MODEL,ANNUAL,MONTHLY,TRADES,FSTAT,FNAV,FTR,ACCOUNT,SPEC,EXEC,LEGACY,LEGACYDD,VERS,CAM,CMC,CAPAN,CRS,CDDA,CDDE,CCORR,CREG,CWORST,CRISIS,CAPDAILY;
let historyRange,capitalRange=null;

function renderHistory(range){
  const dates=EXEC.map(r=>r.date),safe=clampRange(dates,range[0],range[1],30);historyRange=safe;
  $("#historyStart").value=safe[0];$("#historyEnd").value=safe[1];
  const navSame=EXEC.map(r=>num(r.same_close)),navStrict=EXEC.map(r=>num(r.strict_next_open)),navT6=EXEC.map(r=>num(r.next_open_t6));
  const traces=[
    {x:dates,y:navSame,name:"Same-Close",type:"scatter",mode:"lines",line:{width:1.9,color:COLORS.same}},
    {x:dates,y:navStrict,name:"Strict Next-Open",type:"scatter",mode:"lines",line:{width:2.6,color:COLORS.strict}},
    {x:dates,y:navT6,name:"Next-Open → T+6",type:"scatter",mode:"lines",line:{width:1.8,color:COLORS.t6}},
    {x:TBILL.map(r=>r.date),y:TBILL.map(r=>num(r.nav)),name:"Next-Open + 3M Treasury",type:"scatter",mode:"lines",line:{width:2.5,color:COLORS.tbill}},
    {x:LEGACY.map(r=>r.date),y:LEGACY.map(r=>1+num(r.legacy_risk_v1_3m)/100),name:"Same-Close + 3M Treasury · monthly evidence",type:"scatter",mode:"lines+markers",marker:{size:4},line:{width:1.7,dash:"dash",color:COLORS.legacyTbill}},
    {x:LEGACY.map(r=>r.date),y:LEGACY.map(r=>1+num(r.exposure_100)/100),name:"100% Stock Exposure · monthly evidence",type:"scatter",mode:"lines+markers",marker:{size:4},line:{width:1.6,dash:"dot",color:COLORS.full}}
  ];
  const lay={...baseLayout,xaxis:{...boundedX(dates,safe,true),title:"Market date"},yaxis:{...baseLayout.yaxis,title:"NAV multiple",fixedrange:true}};
  Plotly.react("historyChart",traces,lay,plotCfg);
  const dd=[
    {x:dates,y:drawdown(navSame),name:"Same-Close",type:"scatter",mode:"lines",line:{width:1.7,color:COLORS.same}},
    {x:dates,y:drawdown(navStrict),name:"Strict Next-Open",type:"scatter",mode:"lines",line:{width:2.2,color:COLORS.strict}},
    {x:dates,y:drawdown(navT6),name:"Next-Open → T+6",type:"scatter",mode:"lines",line:{width:1.6,color:COLORS.t6}},
    {x:TBILL.map(r=>r.date),y:TBILL.map(r=>num(r.drawdown)*100),name:"Next-Open + 3M Treasury",type:"scatter",mode:"lines",line:{width:2.1,color:COLORS.tbill}},
    {x:LEGACYDD.map(r=>r.date),y:LEGACYDD.map(r=>num(r.legacy_risk_v1_3m)),name:"Same-Close + 3M · monthly DD",type:"scatter",mode:"lines",line:{width:1.5,dash:"dash",color:COLORS.legacyTbill}},
    {x:LEGACYDD.map(r=>r.date),y:LEGACYDD.map(r=>num(r.exposure_100)),name:"100% Exposure · monthly DD",type:"scatter",mode:"lines",line:{width:1.5,dash:"dot",color:COLORS.full}}
  ];
  Plotly.react("historyDDChart",dd,{...baseLayout,xaxis:boundedX(dates,safe,false),yaxis:{...baseLayout.yaxis,title:"Drawdown %",ticksuffix:"%",fixedrange:true}},plotCfg);
  const applyVisibleY=safe=>{
    historyRange=safe;$("#historyStart").value=safe[0];$("#historyEnd").value=safe[1];
    const navY=visibleTraceRange(traces,safe,.08);
    const ddY=visibleTraceRange(dd,safe,.08);
    const jobs=[];
    if(navY)jobs.push(Plotly.relayout("historyChart",{"yaxis.range":navY,"yaxis.autorange":false}));
    if(ddY)jobs.push(Plotly.relayout("historyDDChart",{"yaxis.range":[Math.min(ddY[0],-0.1),Math.min(0.5,ddY[1]+0.2)],"yaxis.autorange":false}));
    return Promise.all(jobs);
  };
  bindBoundedTimeZoom("historyChart",dates,30,["historyDDChart"],"history",applyVisibleY);
  bindBoundedTimeZoom("historyDDChart",dates,30,["historyChart"],"history",applyVisibleY);
  applyVisibleY(safe);
  $("#historyCards").innerHTML=[
    metric("Fixed 3-slot CAGR","9.48%"),
    metric("Risk V1 10/14 CAGR","10.78%"),
    metric("Strict Next-Open CAGR",pct(S.historical.cagr_pct),"good"),
    metric("+3M Treasury CAGR",pct(S.treasury.cagr_pct),"good"),
    metric("100% Exposure MaxDD","-24.13%","bad"),
    metric("历史交易",S.historical.selected_trades)
  ].join("");
  $("#versionTable").innerHTML=table(VERS,[["版本",r=>esc(r.label)],["分类",r=>esc(r.class)],["CAGR",r=>pct(r.cagr_pct)],["MaxDD",r=>pct(r.max_dd_pct)],["Sharpe",r=>fmt(r.sharpe,2)],["曲线证据",r=>r.curve_available?"<span class='pill'>有</span>":"<span class='pill'>指标-only</span>"],["状态",r=>esc(r.status)]]);
}
function setHistoryWindow(range){
  const dates=EXEC.map(r=>r.date),safe=clampRange(dates,range[0],range[1],30);
  historyRange=safe;$("#historyStart").value=safe[0];$("#historyEnd").value=safe[1];
  const hEl=$("#historyChart"),dEl=$("#historyDDChart");
  const navY=visibleTraceRange(hEl?.data||[],safe,.08);
  const ddY=visibleTraceRange(dEl?.data||[],safe,.08);
  const state=zoomGroups.history||(zoomGroups.history={busy:false});
  state.busy=true;
  const jobs=[
    Plotly.relayout("historyChart",{"xaxis.range":safe,"xaxis.autorange":false}),
    Plotly.relayout("historyDDChart",{"xaxis.range":safe,"xaxis.autorange":false})
  ];
  if(navY)jobs.push(Plotly.relayout("historyChart",{"yaxis.range":navY,"yaxis.autorange":false}));
  if(ddY)jobs.push(Plotly.relayout("historyDDChart",{"yaxis.range":[Math.min(ddY[0],-0.1),Math.min(0.5,ddY[1]+0.2)],"yaxis.autorange":false}));
  return Promise.all(jobs).finally(()=>state.busy=false);
}
function bindHistory(){
  const dates=EXEC.map(r=>r.date);$("#historyStart").min=dates[0];$("#historyStart").max=dates.at(-1);$("#historyEnd").min=dates[0];$("#historyEnd").max=dates.at(-1);
  $("#historyPresets").onclick=e=>{const b=e.target.closest("button[data-range]");if(!b)return;$$("#historyPresets button").forEach(x=>x.classList.toggle("active",x===b));setHistoryWindow(presetRange(dates,b.dataset.range))};
  $("#historyApply").onclick=()=>setHistoryWindow([$("#historyStart").value,$("#historyEnd").value]);
  $("#historyReset").onclick=()=>{$$("#historyPresets button").forEach(x=>x.classList.toggle("active",x.dataset.range==="ALL"));setHistoryWindow([dates[0],dates.at(-1)])};
}

function renderTreasury(){
  const modelBy=Object.fromEntries(MODEL.map(r=>[r.version,r]));
  const strict=modelBy["Next-Open Cash 0%"],tb=modelBy["Next-Open + 3M Treasury FINAL"],same=modelBy["Same-Close Risk V1"],sameTb=modelBy["Same-Close + 3M Treasury"];
  $("#treasuryCards").innerHTML=[
    metric("Next-Open +3M Final NAV",fmt(tb.final_nav,3)+"x"),
    metric("Final NAV 增量","+"+fmt((num(tb.final_nav)-num(strict.final_nav))*100,2)+"pp","good"),
    metric("CAGR 增量","+"+fmt((num(tb.cagr)-num(strict.cagr))*100,2)+"pp","good"),
    metric("MaxDD 改善","+"+fmt((Math.abs(num(strict.mdd))-Math.abs(num(tb.mdd)))*100,2)+"pp","good"),
    metric("Same-Close CAGR 增量","+"+fmt((num(sameTb.cagr)-num(same.cagr))*100,2)+"pp"),
    metric("Cash overlay","不是独立 Alpha","neutral")
  ].join("");
  Plotly.react("treasuryDailyChart",[
    {x:RISK.map(r=>r.date),y:RISK.map(r=>num(r.mtm_nav)),name:"Next-Open Cash 0%",type:"scatter",mode:"lines",line:{width:2.2,color:COLORS.strict}},
    {x:TBILL.map(r=>r.date),y:TBILL.map(r=>num(r.nav)),name:"Next-Open + 3M Treasury",type:"scatter",mode:"lines",line:{width:2.4,color:COLORS.tbill}}
  ],{...baseLayout,xaxis:boundedX(RISK.map(r=>r.date),null,true),yaxis:{...baseLayout.yaxis,title:"NAV",fixedrange:true}},plotCfg);
  const riskMap=new Map(RISK.map(r=>[r.date,num(r.mtm_nav)]));
  const upl=TBILL.filter(r=>riskMap.has(r.date)).map(r=>({date:r.date,pp:(num(r.nav)-riskMap.get(r.date))*100,relative:(num(r.nav)/riskMap.get(r.date)-1)*100}));
  Plotly.react("treasuryUpliftChart",[
    {x:upl.map(r=>r.date),y:upl.map(r=>r.pp),name:"NAV uplift vs 0% cash",type:"scatter",mode:"lines",line:{width:2.3,color:COLORS.tbill},fill:"tozeroy"},
    {x:upl.map(r=>r.date),y:upl.map(r=>r.relative),name:"Relative uplift %",type:"scatter",mode:"lines",line:{width:1.5,dash:"dash",color:COLORS.gold},yaxis:"y2"}
  ],{...baseLayout,xaxis:boundedX(upl.map(r=>r.date)),yaxis:{...baseLayout.yaxis,title:"Initial-capital pp",fixedrange:true},yaxis2:{title:"Relative uplift %",overlaying:"y",side:"right",showgrid:false,ticksuffix:"%",fixedrange:true}},plotCfg);
  Plotly.react("treasuryLegacyChart",[
    {x:LEGACY.map(r=>r.date),y:LEGACY.map(r=>1+num(r.legacy_risk_v1)/100),name:"Same-Close Risk V1",type:"scatter",mode:"lines+markers",marker:{size:4},line:{width:2,color:COLORS.same}},
    {x:LEGACY.map(r=>r.date),y:LEGACY.map(r=>1+num(r.legacy_risk_v1_3m)/100),name:"Same-Close + 3M Treasury",type:"scatter",mode:"lines+markers",marker:{size:4},line:{width:2.3,color:COLORS.legacyTbill}}
  ],{...baseLayout,xaxis:boundedX(LEGACY.map(r=>r.date)),yaxis:{...baseLayout.yaxis,title:"Monthly-evidence NAV",fixedrange:true}},plotCfg);
  bindBoundedTimeZoom("treasuryDailyChart",RISK.map(r=>r.date),30);
  bindBoundedTimeZoom("treasuryUpliftChart",upl.map(r=>r.date),30);
  bindBoundedTimeZoom("treasuryLegacyChart",LEGACY.map(r=>r.date),6);
  const ann0=ANNUAL.map(r=>num(r["Next-Open Cash 0%"])*100),annT=ANNUAL.map(r=>num(r["Next-Open + 3M美债"])*100);
  Plotly.react("treasuryAnnualChart",[
    {x:ANNUAL.map(r=>r.year),y:ann0,name:"0% Cash",type:"bar",marker:{color:COLORS.strict}},
    {x:ANNUAL.map(r=>r.year),y:annT,name:"+3M Treasury",type:"bar",marker:{color:COLORS.tbill}},
    {x:ANNUAL.map(r=>r.year),y:annT.map((v,i)=>v-ann0[i]),name:"Treasury uplift pp",type:"scatter",mode:"lines+markers",line:{color:COLORS.gold,width:2},yaxis:"y2"}
  ],{...baseLayout,barmode:"group",yaxis:{...baseLayout.yaxis,title:"Annual return %"},yaxis2:{title:"Uplift pp",overlaying:"y",side:"right",showgrid:false}},plotCfg);
  $("#modelTable").innerHTML=table(MODEL,[["版本",r=>esc(r.version)],["Final NAV",r=>fmt(r.final_nav,3)+"x"],["累计收益",r=>pct(num(r.cum)*100)],["CAGR",r=>pct(num(r.cagr)*100)],["MaxDD",r=>pct(num(r.mdd)*100)],["Sharpe",r=>fmt(r.sharpe,3)],["Calmar",r=>fmt(r.calmar,3)]]);
  $("#crisisTable").innerHTML=table(CRISIS,[["窗口",r=>esc(r.window)],["系列",r=>esc(r.series)],["窗口收益",r=>pct(num(r.return)*100)]]);
}

function setCapitalWindow(range){
  const dates=CAPDAILY.map(r=>r.date),safe=clampRange(dates,range[0],range[1],30);
  capitalRange=safe;
  $("#capitalStart").value=safe[0];$("#capitalEnd").value=safe[1];
  const el=$("#capitalNavChart");
  const yR=visibleTraceRange(el?.data||[],safe,.06);
  const state=zoomGroups["capital-nav"]||(zoomGroups["capital-nav"]={busy:false});
  state.busy=true;
  const jobs=[Plotly.relayout("capitalNavChart",{"xaxis.range":safe,"xaxis.autorange":false})];
  if(yR)jobs.push(Plotly.relayout("capitalNavChart",{"yaxis.range":yR,"yaxis.autorange":false}));
  return Promise.all(jobs).finally(()=>state.busy=false);
}
function bindCapital(){
  const dates=CAPDAILY.map(r=>r.date);
  $("#capitalStart").min=dates[0];$("#capitalStart").max=dates.at(-1);
  $("#capitalEnd").min=dates[0];$("#capitalEnd").max=dates.at(-1);
  if(!$("#capitalPresets").__bound){
    $("#capitalPresets").onclick=e=>{
      const b=e.target.closest("button[data-range]");if(!b)return;
      $$("#capitalPresets button").forEach(x=>x.classList.toggle("active",x===b));
      setCapitalWindow(presetRange(dates,b.dataset.range));
    };
    $("#capitalApply").onclick=()=>setCapitalWindow([$("#capitalStart").value,$("#capitalEnd").value]);
    $("#capitalReset").onclick=()=>{
      $$("#capitalPresets button").forEach(x=>x.classList.toggle("active",x.dataset.range==="ALL"));
      setCapitalWindow([dates[0],dates.at(-1)]);
    };
    $("#capitalPresets").__bound=true;
  }
}
function renderCapital(){
  const core=CMC.find(r=>num(r.sleeve)===0),sel=CMC.find(r=>Math.abs(num(r.sleeve)-.2)<1e-9);
  $("#capitalCards").innerHTML=[
    metric("Core only",fmt(core.ending,3)+"x"),
    metric("Core +20% Risk",fmt(CAM.ending_multiple,3)+"x","good"),
    metric("CAGR",pct(CAM.cagr_pct),"good"),
    metric("MaxDD",pct(CAM.max_dd_pct)),
    metric("平均股票暴露",pct(CAM.avg_exposure_pct)),
    metric("Risk+互动增长占比",pct(CAM.riskv1_incremental_log_growth_share_pct))
  ].join("");

  const capDates=CAPDAILY.map(r=>r.date);
  const safe=capitalRange||[capDates[0],capDates.at(-1)];
  const capTraces=[
    {x:capDates,y:CAPDAILY.map(r=>num(r.capital_layer_v1)),name:"Capital Layer V1 · real daily account replay",type:"scatter",mode:"lines",line:{width:2.8,color:COLORS.gold}},
    {x:capDates,y:CAPDAILY.map(r=>num(r.core_only_equity)),name:"Core only · same daily account clock",type:"scatter",mode:"lines",line:{width:1.8,color:COLORS.same}}
  ];
  const yR=visibleTraceRange(capTraces,safe,.06);
  Plotly.react("capitalNavChart",capTraces,{
    ...baseLayout,
    xaxis:{...boundedX(capDates,safe,true),title:"Market date"},
    yaxis:{...baseLayout.yaxis,title:"Account NAV multiple",fixedrange:true,...(yR?{range:yR,autorange:false}:{})}
  },plotCfg);
  bindBoundedTimeZoom("capitalNavChart",capDates,30,[],"capital-nav",r=>{
    capitalRange=r;$("#capitalStart").value=r[0];$("#capitalEnd").value=r[1];
    const yy=visibleTraceRange($("#capitalNavChart")?.data||[],r,.06);
    return yy?Plotly.relayout("capitalNavChart",{"yaxis.range":yy,"yaxis.autorange":false}):null;
  });
  bindCapital();
  $("#capitalStart").value=safe[0];$("#capitalEnd").value=safe[1];

  const x=CMC.map(r=>num(r.sleeve)*100);
  Plotly.react("capitalMarginalChart",[
    {x,y:CMC.map(r=>num(r.cagr_pct)),name:"CAGR %",type:"scatter",mode:"lines+markers",line:{width:2.4,color:COLORS.strict}},
    {x,y:CMC.map(r=>num(r.avg_exposure_pct)),name:"Avg exposure %",type:"bar",marker:{color:COLORS.tbill},opacity:.55,yaxis:"y2"},
    {x:[20],y:[num(sel.cagr_pct)],name:"Frozen 20%",type:"scatter",mode:"markers",marker:{size:13,color:COLORS.gold,symbol:"diamond"}}
  ],{...baseLayout,xaxis:{...baseLayout.xaxis,title:"Risk V1 sleeve %"},yaxis:{...baseLayout.yaxis,title:"CAGR %"},yaxis2:{title:"Avg exposure %",overlaying:"y",side:"right",showgrid:false}},plotCfg);
  Plotly.react("capitalAnnualChart",[
    {x:CAPAN.map(r=>r.year),y:CAPAN.map(r=>num(r.return_pct)),name:"Return %",type:"bar",marker:{color:COLORS.strict}},
    {x:CAPAN.map(r=>r.year),y:CAPAN.map(r=>num(r.avg_exposure_pct)),name:"Avg exposure %",type:"scatter",mode:"lines+markers",line:{width:2,color:COLORS.tbill},yaxis:"y2"}
  ],{...baseLayout,yaxis:{...baseLayout.yaxis,title:"Annual return %"},yaxis2:{title:"Exposure %",overlaying:"y",side:"right",showgrid:false}},plotCfg);
  Plotly.react("capitalSourceChart",[{x:CRS.map(r=>num(r.share_of_total_log_growth_pct)),y:CRS.map(r=>r.source),type:"bar",orientation:"h",marker:{color:[COLORS.strict,COLORS.tbill]},text:CRS.map(r=>pct(r.share_of_total_log_growth_pct)),textposition:"auto",name:"Log growth share"}],{...baseLayout,showlegend:false,xaxis:{...baseLayout.xaxis,title:"Share of total log growth %"}},plotCfg);
  Plotly.react("capitalCorrChart",[
    {x:CCORR.map(r=>r.window_days),y:CCORR.map(r=>num(r.median_corr)),name:"Median corr",type:"scatter",mode:"lines+markers",line:{width:2.4,color:COLORS.strict}},
    {x:CCORR.map(r=>r.window_days),y:CCORR.map(r=>num(r.p10_corr)),name:"P10",type:"scatter",mode:"lines+markers",line:{width:1.5,dash:"dash",color:COLORS.tbill}},
    {x:CCORR.map(r=>r.window_days),y:CCORR.map(r=>num(r.p90_corr)),name:"P90",type:"scatter",mode:"lines+markers",line:{width:1.5,dash:"dash",color:COLORS.gold}}
  ],{...baseLayout,xaxis:{...baseLayout.xaxis,title:"Rolling window days"},yaxis:{...baseLayout.yaxis,title:"Correlation",range:[-0.15,.35]}},plotCfg);
  $("#capitalDDTable").innerHTML=table(CDDA,[["Peak",r=>r.peak_date],["Trough",r=>r.trough_date],["Capital Layer DD",r=>pct(r.capital_layer_drawdown_pct)],["Core same-window",r=>pct(r.core_only_same_window_return_pct)],["Risk incremental",r=>pct(r.riskv1_incremental_effect_pp)],["Recovered",r=>r.recovery_date]]);
  $("#capitalRegimeTable").innerHTML=table(CREG,[["市场状态",r=>esc(r.market_state)],["月份",r=>r.months],["月均收益",r=>pct(num(r.strategy_mean_monthly)*100)],["月胜率",r=>pct(r.strategy_win_month_pct)],["SP月均",r=>pct(num(r.sp_mean_monthly)*100)],["年化均值",r=>pct(r.strategy_annualized_mean_pct)]]);
  $("#capitalWorstTable").innerHTML=table(CWORST.slice(0,12),[["日期",r=>r.date],["账户收益",r=>pct(r.ret_pct)],["前日暴露",r=>pct(num(r.pre_day_exposure)*100)],["前日Core",r=>pct(num(r.pre_day_core_exposure)*100)],["前日Risk",r=>pct(num(r.pre_day_rv_exposure)*100)],["当日DD",r=>pct(r.dd_pct)]]);
}

function renderTrades(filter=""){
  const q=filter.trim().toLowerCase(),rows=TRADES.filter(r=>!q||[r.symbol,r.slot,r.signal_date,r.entry_date,r.exit_date].join(" ").toLowerCase().includes(q));
  const wins=TRADES.filter(r=>num(r.net_return)>0).length,avg=TRADES.reduce((s,r)=>s+(num(r.net_return)||0),0)/TRADES.length;
  $("#tradeCards").innerHTML=[
    metric("交易数",TRADES.length),metric("胜率",pct(wins/TRADES.length*100)),metric("平均单笔",pct(avg*100)),
    metric("股票数",new Set(TRADES.map(r=>r.symbol)).size),metric("首个信号",TRADES[0]?.signal_date||"—"),metric("最后信号",TRADES.at(-1)?.signal_date||"—")
  ].join("");
  Plotly.react("tradeHist",[{x:TRADES.map(r=>num(r.net_return)*100),type:"histogram",nbinsx:40,name:"Net return",marker:{color:COLORS.strict}}],{...baseLayout,showlegend:false,xaxis:{...baseLayout.xaxis,title:"Trade net return %"},yaxis:{...baseLayout.yaxis,title:"Count"}},plotCfg);
  // Annual trade count must follow actual executions (entry_date), not signal_date.
  // This matters for next-open trades that cross a year boundary.
  const yr={};TRADES.forEach(r=>{const y=(r.entry_date||r.signal_date||"").slice(0,4);if(y)yr[y]=(yr[y]||0)+1});
  const years=Object.keys(yr).sort(),yearCounts=years.map(y=>yr[y]);
  Plotly.react("tradeYearChart",[{
    x:years,
    y:yearCounts,
    type:"bar",
    name:"Executed trades",
    opacity:1,
    marker:{
      color:COLORS.tbill,
      opacity:1,
      line:{color:"#d9e7f8",width:1.2}
    },
    text:yearCounts.map(String),
    textposition:"outside",
    textfont:{color:"#edf4ff",size:12},
    cliponaxis:false,
    hovertemplate:"%{x}: %{y} executed trades<extra></extra>"
  }],{
    ...baseLayout,
    showlegend:false,
    bargap:.24,
    xaxis:{...baseLayout.xaxis,type:"category",categoryorder:"array",categoryarray:years,title:"Entry year"},
    yaxis:{...baseLayout.yaxis,title:"Executed trades",rangemode:"tozero",dtick:10,gridcolor:"#182235"},
    margin:{...baseLayout.margin,t:38}
  },plotCfg);
  $("#tradeCount").textContent=rows.length+" / "+TRADES.length;
  $("#tradeTable").innerHTML=table(rows,[["Symbol",r=>esc(r.symbol)],["Slot",r=>r.slot],["Signal",r=>r.signal_date],["Entry",r=>r.entry_date],["Entry Open",r=>fmt(r.entry_open,2)],["Exit",r=>r.exit_date],["Exit Close",r=>fmt(r.exit_close,2)],["Net Return",r=>pct(num(r.net_return)*100)],["Rank",r=>fmt(r.rank_score,3)],["Vol20",r=>pct(num(r.vol20)*100)]]);
}

function renderForward(){
  $("#forwardCards").innerHTML=[
    metric("状态",FSTAT.state),metric("验证",FSTAT.validation?.status||"—",FSTAT.validation?.status==="PASS"?"good":"warn"),
    metric("正式 NAV 行",FSTAT.official_nav_rows),metric("正式交易",FSTAT.official_trade_rows),
    metric("Engine recovered",FSTAT.engine_recovered_on),metric("Freeze",FSTAT.original_strategy_freeze_date)
  ].join("");
  if(FNAV.length){
    $("#forwardEmpty").style.display="none";
    Plotly.react("forwardChart",[{x:FNAV.map(r=>r.date),y:FNAV.map(r=>num(r.nav)),name:"Risk V1 Forward",type:"scatter",mode:"lines+markers",line:{width:2.5,color:COLORS.strict}}],{...baseLayout,xaxis:boundedX(FNAV.map(r=>r.date),null,true),yaxis:{...baseLayout.yaxis,title:"Forward NAV",fixedrange:true}},plotCfg);
    bindBoundedTimeZoom("forwardChart",FNAV.map(r=>r.date),Math.min(10,FNAV.length));
  }else{
    Plotly.purge("forwardChart");$("#forwardEmpty").style.display="block";$("#forwardEmpty").innerHTML="<b>暂无正式 Forward NAV</b><br>冻结引擎与历史契约已验证通过；目前仍没有 post-recovery 的正式扫描行。";
  }
  $("#slotTable").innerHTML=table(ACCOUNT.slots,[["Slot",r=>r.slot],["状态",r=>esc(r.status)],["Symbol",r=>esc(r.symbol||"—")],["Cash",r=>pct(num(r.cash)*100)],["Entry date",r=>esc(r.entry_date||"—")],["Entry price",r=>fmt(r.entry_price,2)]]);
  $("#forwardTradeTable").innerHTML=FTR.length?table(FTR,[["Symbol",r=>esc(r.symbol)],["Slot",r=>r.slot],["Signal",r=>r.signal_date],["Entry",r=>r.entry_date],["Exit",r=>r.exit_date],["Net Return",r=>pct(num(r.net_return)*100)],["Status",r=>esc(r.status)]]):"<div class='empty' style='display:block'>暂无正式 Forward 交易。</div>";
  $("#forwardNote").innerHTML="<b>Forward 规则：</b> "+esc(FSTAT.first_official_forward_rule)+"<br><br><b>当前阻塞：</b> "+(FSTAT.remaining_blockers||[]).map(esc).join(" · ");
}

function renderRules(){
  $("#rulesContent").innerHTML="<h2>"+esc(SPEC.strategy)+"</h2><h3>Universe</h3><ul>"+SPEC.universe.map(x=>"<li>"+esc(x)+"</li>").join("")+"</ul><h3>Signal</h3><ul>"+SPEC.signal.map(x=>"<li>"+esc(x)+"</li>").join("")+"</ul><h3>Ranking</h3><p>"+esc(SPEC.ranking)+"</p><h3>Market risk / slots</h3><p>"+esc(SPEC.market_risk)+"</p><ul>"+Object.entries(SPEC.slots).map(([k,v])=>"<li><code>"+esc(k)+"</code> → "+v+" slot(s)</li>").join("")+"</ul><h3>Execution</h3><p>"+esc(SPEC.execution)+"</p><h3>Cash layer</h3><p>"+esc(SPEC.cash_layer)+"</p>";
  $("#governanceContent").innerHTML="<h2>版本治理</h2><p>当前唯一正式独立 Risk Alpha：<code>RISK-V1-STRICT-NEXT-OPEN</code>。</p><ul><li>Same-Close：历史执行前代。</li><li>Next-Open → T+6：执行时点对照，不是主版本。</li><li>3M Treasury：现金管理层，不是独立 Alpha。</li><li>100% Exposure：压力/对照版本，已拒绝为主版本。</li><li>Capital Layer V1：Core + 20% Risk V1 的组合资金层，不可与独立 Risk V1 双重计数。</li><li>任何规则变化必须建立新版本并重新开启 Forward freeze clock。</li></ul><h3>数据粒度</h3><p>Dashboard 明确区分 daily MTM、monthly evidence、metrics-only。没有日度证据的版本不会被插值成日度曲线。</p>";
}

(async()=>{
  bindTabs();
  [S,RISK,TBILL,MODEL,ANNUAL,MONTHLY,TRADES,FSTAT,FNAV,FTR,ACCOUNT,SPEC,EXEC,LEGACY,LEGACYDD,VERS,CAM,CMC,CAPAN,CRS,CDDA,CDDE,CCORR,CREG,CWORST,CRISIS,CAPDAILY]=await Promise.all([
    json("data/summary.json"),csv("data/risk_daily_mtm.csv"),csv("data/treasury_daily_nav.csv"),csv("data/model_metrics.csv"),csv("data/annual_returns.csv"),csv("data/monthly_vs_indices.csv"),csv("data/trades_308.csv"),
    json("data/forward_status.json"),csv("data/forward_daily_nav.csv"),csv("data/forward_trades.csv"),json("data/account_state.json"),json("data/strategy_spec.json"),
    csv("data/execution_variants_daily.csv"),csv("data/legacy_monthly_cumulative_pct.csv"),csv("data/legacy_monthly_drawdown_pct.csv"),json("data/version_registry.json"),
    json("data/capital_audit_metrics.json"),csv("data/capital_marginal_curve.csv"),csv("data/capital_annual_performance.csv"),csv("data/capital_return_sources.csv"),
    csv("data/capital_drawdown_attribution.csv"),csv("data/capital_drawdown_episodes.csv"),csv("data/capital_correlation_summary.csv"),csv("data/capital_market_regime_summary.csv"),csv("data/capital_worst_20_days.csv"),csv("data/crisis_windows.csv"),csv("data/capital_daily_curve.csv")
  ]);
  $("#asof").textContent="HIST "+S.historical_window.end+" · FWD "+(FSTAT.official_nav_rows?FNAV.at(-1)?.date:"PENDING");
  renderHistory([EXEC[0].date,EXEC.at(-1).date]);bindHistory();
  window.__dashboardReady=true;
  $("#tradeSearch").oninput=e=>{
    if(renderedPanels.has("trades"))renderTrades(e.target.value);
  };
  refreshVisiblePlots("history");
})().catch(err=>{console.error(err);document.body.insertAdjacentHTML("beforeend","<div class='wrap bad'>Dashboard load error: "+esc(err.message||err)+"</div>")});