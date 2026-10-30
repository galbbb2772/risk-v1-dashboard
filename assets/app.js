const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const fmt=(v,d=2)=>v==null||v===""||!Number.isFinite(Number(v))?"—":Number(v).toFixed(d);
const pct=(v,d=2)=>v==null||v===""||!Number.isFinite(Number(v))?"—":Number(v).toFixed(d)+"%";
const esc=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const colors={risk:"#8cb8ff",tbill:"#56d6a4",sp:"#f3c76b",nasdaq:"#b59cff",dow:"#ff8f70"};
const layout={paper_bgcolor:"rgba(0,0,0,0)",plot_bgcolor:"rgba(0,0,0,0)",font:{color:"#cad5e7"},margin:{l:64,r:24,t:34,b:56},hovermode:"x unified",legend:{orientation:"h",y:1.12,x:0},dragmode:"pan",xaxis:{gridcolor:"#182235"},yaxis:{gridcolor:"#182235"}};
const config={responsive:true,displaylogo:false,displayModeBar:false,scrollZoom:false,doubleClick:"reset"};

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
 if(!rows.length)return[];
 const h=rows[0];return rows.slice(1).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??""])));
}
async function csv(path){return parseCSV(await fetch(path+"?ts="+Date.now(),{cache:"no-store"}).then(r=>r.text()))}
async function json(path){return fetch(path+"?ts="+Date.now(),{cache:"no-store"}).then(r=>r.json())}
function table(rows,cols){return "<table><thead><tr>"+cols.map(c=>"<th>"+c[0]+"</th>").join("")+"</tr></thead><tbody>"+rows.map(r=>"<tr>"+cols.map((c,i)=>"<td class='"+(i===0?"left":"")+"'>"+c[1](r)+"</td>").join("")+"</tr>").join("")+"</tbody></table>"}
function metric(label,value,cls=""){return "<div class='metric'><span class='small'>"+esc(label)+"</span><b class='"+cls+"'>"+esc(value)+"</b></div>"}
function nearest(dates,date){const t=Date.parse(date);let b=0,dist=Infinity;dates.forEach((d,i)=>{const z=Math.abs(Date.parse(d)-t);if(z<dist){dist=z;b=i}});return b}
function clamp(dates,a,b,min=60){let lo=nearest(dates,a),hi=nearest(dates,b);if(lo>hi)[lo,hi]=[hi,lo];const need=Math.min(min,dates.length);if(hi-lo+1<need){hi=Math.min(dates.length-1,lo+need-1);lo=Math.max(0,hi-need+1)}return[dates[lo],dates[hi]]}
function preset(dates,key){if(key==="ALL")return[dates[0],dates.at(-1)];const days={1Y:365,3Y:1095,5Y:1826}[key];const d=new Date(Date.parse(dates.at(-1))-days*86400000).toISOString().slice(0,10);return[dates[Math.max(0,nearest(dates,d))],dates.at(-1)]}
function bindTabs(){$$(".tab").forEach(b=>b.onclick=()=>{$$(".tab").forEach(x=>x.classList.remove("active"));$$(".panel").forEach(x=>x.classList.remove("active"));b.classList.add("active");$("#"+b.dataset.tab).classList.add("active");setTimeout(()=>window.dispatchEvent(new Event("resize")),80)})}

let S,R,T,M,A,MI,TR,FST,FNAV,FTR,ACC,SPEC,historyRange;

function renderOverview(range){
 const dates=R.map(x=>x.date), safe=clamp(dates,range[0],range[1]);historyRange=safe;
 $("#historyStart").value=safe[0];$("#historyEnd").value=safe[1];
 const traces=[
  {x:R.map(x=>x.date),y:R.map(x=>+x.mtm_nav),name:"Risk V1 Strict Next-Open",type:"scatter",mode:"lines",line:{width:2.3,color:colors.risk}},
  {x:T.map(x=>x.date),y:T.map(x=>+x.nav),name:"Risk V1 + 3M Treasury",type:"scatter",mode:"lines",line:{width:2.3,color:colors.tbill}}
 ];
 Plotly.react("historyChart",traces,{...layout,xaxis:{...layout.xaxis,range:safe,rangeslider:{visible:true,thickness:.08}},yaxis:{...layout.yaxis,title:"NAV multiple"}},config);
 Plotly.react("ddChart",[
  {x:R.map(x=>x.date),y:R.map(x=>+x.drawdown*100),name:"Risk V1",type:"scatter",mode:"lines",line:{width:2,color:colors.risk}},
  {x:T.map(x=>x.date),y:T.map(x=>+x.drawdown*100),name:"+ 3M Treasury",type:"scatter",mode:"lines",line:{width:2,color:colors.tbill}}
 ],{...layout,xaxis:{...layout.xaxis,range:safe},yaxis:{...layout.yaxis,title:"Drawdown %",ticksuffix:"%"}},config);

 $("#overviewCards").innerHTML=[
  metric("Strict Final NAV",fmt(S.historical.final_nav,3)+"x"),
  metric("Strict 累计收益",pct(S.historical.cumulative_return_pct)),
  metric("Strict CAGR",pct(S.historical.cagr_pct)),
  metric("Strict MaxDD",pct(S.historical.max_drawdown_pct),"bad"),
  metric("交易数",S.historical.selected_trades),
  metric("Profit Factor",fmt(S.historical.profit_factor,2))
 ].join("");
}
function renderAnnual(){
 const years=A.map(x=>x.year);
 const cols=[["Next-Open Cash 0%",colors.risk],["Next-Open + 3M美债",colors.tbill],["S&P 500",colors.sp],["Nasdaq Composite",colors.nasdaq],["Dow Jones",colors.dow]];
 Plotly.react("annualChart",cols.map(([k,c])=>({x:years,y:A.map(x=>+x[k]*100),name:k,type:"bar",marker:{color:c}})),{...layout,barmode:"group",yaxis:{...layout.yaxis,title:"Annual return %",ticksuffix:"%"}},config);
}
function renderTreasury(){
 $("#treasuryCards").innerHTML=[
  metric("T-Bill Final NAV",fmt(S.treasury.final_nav,3)+"x"),
  metric("累计收益",pct(S.treasury.cumulative_return_pct)),
  metric("CAGR",pct(S.treasury.cagr_pct),"good"),
  metric("MaxDD",pct(S.treasury.max_drawdown_pct)),
  metric("Sharpe",fmt(S.treasury.sharpe,3)),
  metric("CAGR 增量",pct(S.treasury.cagr_pct-S.historical.cagr_pct),"good")
 ].join("");
 const series=[["Next-Open Cash 0%",colors.risk],["Next-Open + 3M美债",colors.tbill],["S&P 500",colors.sp],["Nasdaq Composite",colors.nasdaq],["Dow Jones",colors.dow]];
 Plotly.react("benchmarkChart",series.map(([k,c])=>({x:MI.map(x=>x.date),y:MI.map(x=>1+(+x[k])/100),name:k,type:"scatter",mode:"lines",line:{width:k.includes("3M")?2.5:1.8,color:c}})),{...layout,yaxis:{...layout.yaxis,title:"Cumulative multiple"},xaxis:{...layout.xaxis,rangeslider:{visible:true,thickness:.08}}},config);
 $("#modelTable").innerHTML=table(M,[["版本",r=>esc(r.version)],["Final NAV",r=>fmt(r.final_nav,3)+"x"],["累计收益",r=>pct(+r.cum*100)],["CAGR",r=>pct(+r.cagr*100)],["MaxDD",r=>pct(+r.mdd*100)],["Sharpe",r=>fmt(r.sharpe,3)],["Calmar",r=>fmt(r.calmar,3)]]);
}
function renderTrades(q=""){
 const f=TR.filter(r=>!q||[r.symbol,r.slot,r.signal_date,r.entry_date,r.exit_date].join(" ").toLowerCase().includes(q.toLowerCase()));
 const wins=TR.filter(r=>+r.net_return>0).length, avg=TR.reduce((s,r)=>s+(+r.net_return||0),0)/TR.length;
 $("#tradeCards").innerHTML=[metric("历史交易",TR.length),metric("胜率",pct(wins/TR.length*100)),metric("平均单笔",pct(avg*100)),metric("不同股票",new Set(TR.map(r=>r.symbol)).size),metric("首个信号",TR[0]?.signal_date||"—"),metric("最后信号",TR.at(-1)?.signal_date||"—")].join("");
 $("#tradeCount").textContent=f.length+" / "+TR.length;
 $("#tradeTable").innerHTML=table(f,[["Symbol",r=>esc(r.symbol)],["Slot",r=>r.slot],["Signal",r=>r.signal_date],["Entry",r=>r.entry_date],["Entry Open",r=>fmt(r.entry_open,2)],["Exit",r=>r.exit_date],["Exit Close",r=>fmt(r.exit_close,2)],["Net Return",r=>pct(+r.net_return*100)],["Rank",r=>fmt(r.rank_score,3)],["Vol20",r=>pct(+r.vol20*100)]]);
}
function renderForward(){
 $("#forwardCards").innerHTML=[
  metric("状态",FST.state),
  metric("验证",FST.validation?.status||"—",FST.validation?.status==="PASS"?"good":"warn"),
  metric("正式 NAV 行",FST.official_nav_rows),
  metric("正式交易",FST.official_trade_rows),
  metric("Engine recovered",FST.engine_recovered_on),
  metric("Freeze",FST.original_strategy_freeze_date)
 ].join("");
 if(FNAV.length){
  $("#forwardEmpty").style.display="none";
  Plotly.react("forwardChart",[{x:FNAV.map(x=>x.date),y:FNAV.map(x=>+x.nav),name:"Risk V1 Forward",type:"scatter",mode:"lines+markers",line:{width:2.3,color:colors.risk}}],{...layout,yaxis:{...layout.yaxis,title:"Forward NAV"},xaxis:{...layout.xaxis,rangeslider:{visible:true}}},config);
 }else{
  Plotly.purge("forwardChart");$("#forwardEmpty").style.display="block";$("#forwardEmpty").innerHTML="<b>暂无正式 Forward NAV</b><br>引擎已经验证通过，但仍在等待首个 post-recovery 真实收盘扫描。";
 }
 $("#slotTable").innerHTML=table(ACC.slots,[["Slot",r=>r.slot],["状态",r=>esc(r.status)],["Symbol",r=>esc(r.symbol||"—")],["Cash",r=>pct(+r.cash*100)],["Entry date",r=>esc(r.entry_date||"—")],["Entry price",r=>fmt(r.entry_price,2)]]);
 $("#forwardTradeTable").innerHTML=FTR.length?table(FTR,[["Symbol",r=>esc(r.symbol)],["Slot",r=>r.slot],["Signal",r=>r.signal_date],["Entry",r=>r.entry_date],["Exit",r=>r.exit_date],["Net Return",r=>pct(+r.net_return*100)],["Status",r=>esc(r.status)]]):"<div class='empty' style='display:block'>暂无正式 Forward 交易。</div>";
 $("#forwardNote").innerHTML="<b>Forward 纪律：</b> "+esc(FST.first_official_forward_rule)+"<br><br><b>当前阻塞：</b> "+(FST.remaining_blockers||[]).map(esc).join(" · ");
}
function renderRules(){
 $("#rulesContent").innerHTML="<h2>"+esc(SPEC.strategy)+"</h2>"+
 "<h3>Universe</h3><ul>"+SPEC.universe.map(x=>"<li>"+esc(x)+"</li>").join("")+"</ul>"+
 "<h3>Signal</h3><ul>"+SPEC.signal.map(x=>"<li>"+esc(x)+"</li>").join("")+"</ul>"+
 "<h3>Ranking</h3><p>"+esc(SPEC.ranking)+"</p>"+
 "<h3>Market risk / slots</h3><p>"+esc(SPEC.market_risk)+"</p><ul>"+Object.entries(SPEC.slots).map(([k,v])=>"<li><code>"+esc(k)+"</code> → "+v+" slot(s)</li>").join("")+"</ul>"+
 "<h3>Execution</h3><p>"+esc(SPEC.execution)+"</p>"+
 "<h3>Cash layer</h3><p>"+esc(SPEC.cash_layer)+"</p>";
}
function bindControls(){
 $("#historyStart").min=R[0].date;$("#historyStart").max=R.at(-1).date;$("#historyEnd").min=R[0].date;$("#historyEnd").max=R.at(-1).date;
 $("#historyPresets").onclick=e=>{const b=e.target.closest("button[data-range]");if(!b)return;$$('#historyPresets button').forEach(x=>x.classList.toggle("active",x===b));renderOverview(preset(R.map(x=>x.date),b.dataset.range))};
 $("#historyApply").onclick=()=>renderOverview([$("#historyStart").value,$("#historyEnd").value]);
 $("#historyReset").onclick=()=>renderOverview([R[0].date,R.at(-1).date]);
 $("#tradeSearch").oninput=e=>renderTrades(e.target.value);
}
(async()=>{
 bindTabs();
 [S,R,T,M,A,MI,TR,FST,FNAV,FTR,ACC,SPEC]=await Promise.all([
  json("data/summary.json"),csv("data/risk_daily_mtm.csv"),csv("data/treasury_daily_nav.csv"),csv("data/model_metrics.csv"),csv("data/annual_returns.csv"),csv("data/monthly_vs_indices.csv"),csv("data/trades_308.csv"),json("data/forward_status.json"),csv("data/forward_daily_nav.csv"),csv("data/forward_trades.csv"),json("data/account_state.json"),json("data/strategy_spec.json")
 ]);
 $("#asof").textContent="HIST "+S.historical_window.end+" · FWD "+(FST.official_nav_rows?FNAV.at(-1)?.date:"PENDING");
 renderOverview([R[0].date,R.at(-1).date]);renderAnnual();renderTreasury();renderTrades();renderForward();renderRules();bindControls();
})().catch(err=>{console.error(err);document.body.insertAdjacentHTML("beforeend","<div class='wrap bad'>Dashboard load error: "+esc(err.message||err)+"</div>")});