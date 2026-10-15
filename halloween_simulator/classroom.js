(function(){
'use strict';
const el=id=>document.getElementById(id),key='halloween-simple-tries-v1';
const cash=n=>(n<0?'−':'+')+'$'+Math.abs(Math.round(n)).toLocaleString('en-US');
function mood(s){return s.avgExperience===null||s.avgAdmitted===0?{face:'😶',label:'No guests'}:s.avgExperience>=90?{face:'🙂',label:'Happy guests'}:s.avgExperience>=70?{face:'😐',label:'Mixed experience'}:{face:'😢',label:'Tough night'};}
let pending=null,ready=false,tries=[];
try{const saved=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(saved))tries=saved.filter(s=>Number.isInteger(s.price)&&s.price>=1&&s.price<=100&&Number.isFinite(s.avgProfit)&&Number.isFinite(s.avgAdmitted)&&(s.avgExperience===null||Number.isFinite(s.avgExperience))).slice(-100);}catch(e){}
function save(){try{localStorage.setItem(key,JSON.stringify(tries))}catch(e){}}
function history(){
 el('classroom-history').hidden=!tries.length;el('simple-tries').replaceChildren();
 tries.forEach((s,i)=>{const card=document.createElement('article');card.className='try-card'+(i===tries.length-1?' current':'');const m=mood(s);
 const number=document.createElement('small');number.textContent='Try '+(i+1);
 const title=document.createElement('h3');title.textContent='🎟 $'+s.price;
 const money=document.createElement('p');money.className='try-money '+(s.avgProfit<0?'negative':'positive');money.textContent=cash(s.avgProfit);
 const face=document.createElement('p');face.className='try-mood';face.textContent=m.face+' '+m.label;
 const button=document.createElement('button');button.className='secondary';button.textContent='Use $'+s.price;button.onclick=()=>{el('price').value=s.price;el('price-form').requestSubmit()};
 card.append(number,title,money,face,button);el('simple-tries').append(card);
 });
}
el('apply').textContent='Try this price ▶';
const toolbar=document.querySelector('.map-heading');
toolbar.prepend(el('price-form'));
const profit=document.createElement('div');profit.className='toolbar-profit';profit.setAttribute('aria-live','polite');
profit.innerHTML='<span>Profit</span><strong id="direct-profit">—</strong>';
el('price-form').append(profit);
el('price-form').append(el('error'));
// Keep the classroom activity and the final explanation on separate tabs.
const game=document.createElement('section');game.id='game-panel';game.setAttribute('role','tabpanel');game.setAttribute('aria-labelledby','game-tab');
el('map-panel').before(game);game.append(el('map-panel'),el('classroom'));
const chart=el('finale');chart.hidden=true;chart.setAttribute('role','tabpanel');chart.setAttribute('aria-labelledby','curves-tab');
const tabs=document.createElement('div');tabs.className='classroom-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Classroom activity');
const panels=[game,chart],buttons=['01 · Play & Try','02 · Profit & Happy Guests'].map((label,i)=>{
 const button=document.createElement('button');button.id=i?'curves-tab':'game-tab';button.type='button';button.textContent=label;button.setAttribute('role','tab');button.setAttribute('aria-controls',panels[i].id);button.setAttribute('aria-selected',String(i===0));button.tabIndex=i===0?0:-1;tabs.append(button);return button;
});
game.before(tabs);
function selectTab(index){
 panels.forEach((panel,i)=>{panel.hidden=i!==index;buttons[i].setAttribute('aria-selected',String(i===index));buttons[i].tabIndex=i===index?0:-1;});
 if(index===1){if(el('play').getAttribute('aria-pressed')==='true')el('play').click();globalThis.HalloweenFinale.open();}
 window.dispatchEvent(new Event('resize'));
}
buttons.forEach((button,index)=>{button.onclick=()=>selectTab(index);button.onkeydown=event=>{let next;if(event.key==='ArrowRight'||event.key==='ArrowLeft')next=1-index;else if(event.key==='Home')next=0;else if(event.key==='End')next=1;else return;event.preventDefault();selectTab(next);buttons[next].focus();};});
document.querySelector('.model-note').textContent='Game prediction · Profit = ticket money − event costs.';
el('map-title').textContent='Watch: where do lines form?';
document.querySelector('.mood-legend').textContent='🙂 Having fun      😢 Waiting too long or missing an activity';
document.querySelector('.footer').textContent='Fictional classroom game · Same event, different ticket prices';
document.addEventListener('classroom-start',()=>{pending=null;ready=false;el('simple-result').hidden=true;el('direct-profit').textContent='…';el('show-result').disabled=true;el('show-result').textContent='Getting results…';el('classroom-prompt').textContent='Watch the lines. Do the guests look happy?';});
document.addEventListener('classroom-result',event=>{pending=event.detail;el('direct-profit').textContent=cash(pending.avgProfit);el('show-result').disabled=false;el('show-result').textContent='See our results ↓';showResult(false);});
document.addEventListener('classroom-error',()=>{el('direct-profit').textContent='Try again';});
el('show-result').onclick=()=>{
 showResult(true);
};
function showResult(scroll){
 if(!pending)return;
 if(scroll&&el('play').getAttribute('aria-pressed')==='true')el('play').click();
 const m=mood(pending),previous=tries.at(-1);
 el('classroom-title').textContent='Our $'+pending.price+' ticket';
 el('simple-money-label').textContent=pending.avgProfit<0?'💸 Money lost after costs':'💰 Money left after costs';
 el('simple-money').textContent=cash(pending.avgProfit);el('simple-money').className=pending.avgProfit<0?'negative':'positive';
 el('simple-face').textContent=m.face;el('simple-mood').textContent=m.label;
 let question='Keep this price or change it? Tell your team why.';
 if(previous&&previous.price!==pending.price){const delta=Math.round(pending.avgProfit)-Math.round(previous.avgProfit);question=(delta===0?'About the same money.':cash(delta)+' compared with $'+previous.price+' tickets.')+' Did the guests have a better time?';}
 el('simple-question').textContent=question;
 if(!ready){tries.push({price:pending.price,avgProfit:pending.avgProfit,avgExperience:pending.avgExperience,avgAdmitted:pending.avgAdmitted});tries=tries.slice(-100);save();ready=true;}
 history();el('simple-result').hidden=false;if(scroll){el('classroom-title').focus({preventScroll:true});el('simple-result').scrollIntoView({block:'start',behavior:'auto'});}
}
el('change-guess').onclick=()=>{el('price').focus();el('price').select();el('price-form').scrollIntoView({block:'center',behavior:'auto'});};
el('clear-tries').onclick=()=>{if(!confirm('Clear this class’s tries?'))return;tries=[];save();history();pending=null;ready=false;el('simple-result').hidden=true;el('show-result').disabled=true;el('classroom-prompt').textContent='Guess first: will your park be quiet or crowded?';el('change-guess').click();};
history();
})();
