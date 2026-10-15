(function(){
'use strict';
const data=globalThis.HalloweenFinaleData,root=document.getElementById('finale');
if(!data||!root)return;
const rows=data.rows.filter(r=>Number.isFinite(r.avgExperience)),threshold=data.threshold;
const best=rows.filter(r=>r.avgExperience>=threshold).reduce((a,b)=>!a||b.avgProfit>a.avgProfit?b:a,null);
const $=id=>document.getElementById(id),money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2,minimumFractionDigits:2}).format(n);
let selected=best||rows[0],currentPrice=null,opened=false;
const ns='http://www.w3.org/2000/svg';
function tag(name,attrs={},content){const e=document.createElementNS(ns,name);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));if(content!==undefined)e.textContent=content;return e;}
function draw(){
 if(!opened)return;
 const svg=$('finale-plot'),w=Math.max(300,svg.parentElement.clientWidth),h=470,L=65,R=55,T=85,B=65;
 svg.replaceChildren();svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
 const xmin=0,xmax=100,profitColor='#7851a9',scoreColor='#26755d';
 const lo=Math.floor(Math.min(0,...rows.map(r=>r.avgProfit))/1000)*1000,hi=Math.ceil(Math.max(0,...rows.map(r=>r.avgProfit))/1000)*1000;
 const x=n=>L+(n-xmin)/(xmax-xmin)*(w-L-R),y=n=>h-B-(n-lo)/(hi-lo)*(h-T-B),ys=n=>h-B-n/100*(h-T-B);
 const add=(name,attrs,text)=>{const e=tag(name,attrs,text);svg.append(e);return e;};
 add('title',{},'Average profit and guest satisfaction at every whole-dollar ticket price.');
 add('desc',{},'Ticket price on the horizontal axis. Solid purple line: average profit in dollars, left axis. Dashed green line: average guest satisfaction from 0 to 100, right axis. Satisfaction must reach the horizontal 90-point line. '+(best?'Best qualifying price: $'+best.price+', satisfaction '+best.avgExperience.toFixed(2)+', profit '+money(best.avgProfit):'No tested price meets the goal.'));
 add('rect',{x:L,y:T,width:w-L-R,height:h-T-B,fill:'#faf7f1'});
 add('rect',{x:L,y:T,width:w-L-R,height:ys(threshold)-T,fill:'#e5f3e9'});
 for(let n=lo;n<=hi;n+=1000){add('line',{x1:L,y1:y(n),x2:w-R,y2:y(n),stroke:n===0?'#9d91a5':'#e1dbe4','stroke-width':n===0?1.5:1});add('text',{x:L-10,y:y(n)+4,'text-anchor':'end','font-size':12},n<0?'−$'+Math.abs(n)/1000+'k':'$'+n/1000+'k');}
 const ticks=w<500?[0,50,100]:[0,20,40,60,80,100];
 for(const n of ticks){add('text',{x:x(n),y:h-B+24,'text-anchor':n===100?'end':'middle','font-size':12},'$'+n);}
 for(const n of [0,20,40,60,80,90,100]){add('text',{x:w-R+9,y:ys(n)+4,'font-size':12,style:'fill:'+scoreColor,'font-weight':n===90?'bold':'normal'},String(n));}
 add('line',{x1:L,y1:ys(threshold),x2:w-R,y2:ys(threshold),stroke:scoreColor,'stroke-width':1.5,'stroke-dasharray':'3 5'});
 add('text',{x:L,y:23,'font-size':14,'font-weight':'bold',style:'fill:'+profitColor},'Profit ($ / night) · left');
 add('text',{x:w-R,y:45,'text-anchor':'end','font-size':14,'font-weight':'bold',style:'fill:'+scoreColor},'Satisfaction (0–100) · right');
 add('text',{x:w-R,y:T-10,'text-anchor':'end','font-size':12,'font-weight':'bold',style:'fill:'+scoreColor},'90+ satisfaction = PASS');
 add('text',{x:(L+w-R)/2,y:h-10,'text-anchor':'middle','font-size':15,'font-weight':'bold'},'Ticket price ($) →');
 const pathFor=(key,scale)=>rows.map((r,i)=>(i?'L':'M')+x(r.price)+','+scale(r[key])).join(' ');
 add('path',{'data-series':'profit',d:pathFor('avgProfit',y),fill:'none',stroke:profitColor,'stroke-width':3,'stroke-linejoin':'round'});
 add('path',{'data-series':'satisfaction',d:pathFor('avgExperience',ys),fill:'none',stroke:scoreColor,'stroke-width':3,'stroke-dasharray':'9 5','stroke-linejoin':'round'});
 if(best){add('line',{x1:x(best.price),y1:T,x2:x(best.price),y2:h-B,stroke:'#b58022','stroke-width':1.5,'stroke-dasharray':'4 5'});add('circle',{cx:x(best.price),cy:y(best.avgProfit),r:9,fill:'#fff',stroke:'#b58022','stroke-width':3});add('text',{x:x(best.price),y:T-10,'text-anchor':'middle','font-size':16},'🏆 $'+best.price);}
 const current=rows.find(r=>r.price===currentPrice);
 if(current&&current!==best)add('circle',{cx:x(current.price),cy:y(current.avgProfit),r:9,fill:'none',stroke:'#292239','stroke-width':2});
 add('line',{x1:x(selected.price),y1:T,x2:x(selected.price),y2:h-B,stroke:'#71687d','stroke-width':1,'stroke-dasharray':'2 5'});
 add('circle',{cx:x(selected.price),cy:y(selected.avgProfit),r:5,fill:profitColor,stroke:'#fff','stroke-width':2});
 add('circle',{cx:x(selected.price),cy:ys(selected.avgExperience),r:5,fill:scoreColor,stroke:'#fff','stroke-width':2});
 // A price selects both measures together; keyboard users use the price-step buttons.
 const target=add('rect',{x:L,y:T,width:w-L-R,height:h-T-B,fill:'transparent','aria-hidden':'true'});
 target.addEventListener('click',event=>{const rect=svg.getBoundingClientRect(),px=(event.clientX-rect.left)*w/rect.width;selected=rows.reduce((a,b)=>Math.abs(x(b.price)-px)<Math.abs(x(a.price)-px)?b:a);render();});
}
function render(){
 const pass=selected.avgExperience>=threshold,choice=$('finale-choice');choice.className='finale-choice '+(pass?'pass':'fail');
 $('finale-price').textContent='$'+selected.price+' ticket'+(best&&selected.price===best.price?' · 🏆 Best that passes':'')+(selected.price===currentPrice?' · Your price':'');
 $('finale-values').textContent=money(selected.avgProfit)+' profit / night · '+selected.avgExperience.toFixed(2)+' / 100 satisfaction';
 $('finale-pass').textContent=pass?'✓ PASS — average satisfaction ≥90':'✕ NOT YET — average satisfaction below 90';
 $('finale-prev').disabled=selected===rows[0];$('finale-next').disabled=selected===rows[rows.length-1];
 $('finale-current').disabled=currentPrice===null;
 draw();
}
function open(){opened=true;$('finale-content').hidden=false;$('finale-reveal').hidden=true;
 $('finale-summary').textContent=best?'🏆 $'+best.price+' ticket · '+money(best.avgProfit)+' average profit · '+best.avgExperience.toFixed(2)+' satisfaction':'No tested price reaches 90. There is no qualifying winner.';
 render();}
 $('finale-reveal').onclick=open;
 $('finale-prev').onclick=()=>{selected=rows[Math.max(0,rows.indexOf(selected)-1)];render();};
 $('finale-next').onclick=()=>{selected=rows[Math.min(rows.length-1,rows.indexOf(selected)+1)];render();};
 $('finale-best').onclick=()=>{if(best){selected=best;render();}};$('finale-best').disabled=!best;
 $('finale-current').onclick=()=>{const row=rows.find(r=>r.price===currentPrice);if(row){selected=row;render();}};
 globalThis.HalloweenFinale={open,update(p){currentPrice=p;if(opened)render();}};
 new ResizeObserver(draw).observe($('finale-content'));
})();
