const express=require('express');
const http=require('http');
const WebSocket=require('ws');
const crypto=require('crypto');
const app=express(); app.use(express.static('public'));
const server=http.createServer(app); const wss=new WebSocket.Server({server});
const rooms=new Map();
const code=()=>Math.random().toString(36).slice(2,6).toUpperCase();
function send(ws,type,data){if(ws.readyState===1)ws.send(JSON.stringify({type,data}));}
function log(room,msg){room.log.unshift({id:Date.now()+Math.random(),msg});room.log=room.log.slice(0,80)}
const CARDS=[
{id:'tutor',name:'คนกำลังฝึกทักษะ',price:1,vol:0.004,desc:'ลงทุนพัฒนาทักษะ รับรายได้ 2 เหรียญต่อใบเมื่อจบรอบ (ซื้อได้ไม่เกิน 2 ใบ)'},
{id:'savings',name:'เงินฝากทั่วไป',price:10,vol:0.002,desc:'ความผันผวนต่ำ รับดอกเบี้ยจำลอง 0.2% ต่อรอบ'},
{id:'fixed',name:'เงินฝากประจำ',price:10,vol:0.001,desc:'ความผันผวนต่ำ รับดอกเบี้ยจำลอง 0.35% ต่อรอบ'},
{id:'land',name:'ที่ดิน',price:20,vol:0.035,desc:'ราคาขึ้นลงตามการเติบโตเศรษฐกิจและเงินเฟ้อ'},
{id:'gold',name:'ทองคำ',price:25,vol:0.045,desc:'อาจได้แรงหนุนเมื่อเงินเฟ้อหรือความเสี่ยงโลกสูง'},
{id:'insurance',name:'ประกัน',price:10,vol:0,desc:'คุ้มครองเหตุการณ์ชีวิตตามกติกาเกม ไม่ใช่สินทรัพย์ลงทุน'},
{id:'bond',name:'พันธบัตรรัฐบาล',price:10,vol:0.018,desc:'ราคามักลดเมื่ออัตราดอกเบี้ยตลาดเพิ่ม'},
{id:'corp',name:'หุ้นกู้เอกชน',price:15,vol:0.028,desc:'ได้ผลจากดอกเบี้ยและความเสี่ยงเครดิต'},
{id:'fund',name:'กองทุนรวมตราสารหนี้',price:20,vol:0.022,desc:'กระจายลงทุนตราสารหนี้ ความเสี่ยงปานกลางค่อนข้างต่ำ'},
{id:'equity',name:'กองทุนรวมหุ้น',price:25,vol:0.055,desc:'กระจายลงทุนหุ้น ได้ผลจากเศรษฐกิจและความเชื่อมั่น'},
{id:'stockA',name:'หุ้น A',price:30,vol:0.075,desc:'หุ้นบริษัทขนาดใหญ่ ความผันผวนสูง'},
{id:'stockB',name:'หุ้น B',price:50,vol:0.11,desc:'หุ้นเติบโต/ความเสี่ยงสูง ความผันผวนสูงมาก'}
];
const ECON=[
{name:'เศรษฐกิจขยายตัว',growth:1.4,inflation:0.2,rates:0.1,risk:-0.2,oil:0,desc:'การบริโภคและการลงทุนดีขึ้น หุ้นและที่ดินมักได้แรงหนุน'},
{name:'เงินเฟ้อเร่งตัว',growth:-0.2,inflation:1.2,rates:0.6,risk:0.2,oil:0.4,desc:'ต้นทุนสูงขึ้น ธนาคารกลางมีแรงกดดันให้ขึ้นดอกเบี้ย ทองคำอาจได้แรงหนุน'},
{name:'ธนาคารกลางขึ้นดอกเบี้ย',growth:-0.3,inflation:-0.1,rates:1.0,risk:0.1,oil:0,desc:'ตราสารหนี้เดิมมักมีราคาลดลง หุ้นเติบโตถูกกดดัน'},
{name:'เศรษฐกิจชะลอตัว',growth:-1.2,inflation:-0.2,rates:-0.3,risk:0.7,oil:-0.3,desc:'หุ้นและที่ดินมีแรงกดดัน พันธบัตรรัฐบาลอาจได้แรงหนุน'},
{name:'ความขัดแย้งระหว่างประเทศ',growth:-0.5,inflation:0.5,rates:0.1,risk:1.2,oil:1.4,desc:'ความเสี่ยงและราคาพลังงานสูงขึ้น ทองคำอาจได้แรงหนุน หุ้นผันผวน'},
{name:'เงินเฟ้อลดลงและดอกเบี้ยผ่อนคลาย',growth:0.5,inflation:-0.8,rates:-0.8,risk:-0.2,oil:-0.2,desc:'ต้นทุนเงินทุนลดลง หุ้นและตราสารหนี้อาจฟื้นตัว'},
{name:'วิกฤตเครดิต',growth:-1.0,inflation:0.1,rates:-0.2,risk:1.4,oil:-0.2,desc:'ความเสี่ยงผิดนัดชำระหนี้สูง หุ้นกู้เอกชนและหุ้นถูกกดดัน'},
{name:'ราคาพลังงานลดลง',growth:0.3,inflation:-0.6,rates:-0.2,risk:-0.1,oil:-1.2,desc:'ต้นทุนธุรกิจและแรงกดดันเงินเฟ้อลดลง'}
];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function initialMarket(){const m={};for(const c of CARDS)if(c.id!=='insurance')m[c.id]={price:c.price,change:0,pct:0};return m}
function economicImpact(id,e){const growth=e.growth/100, inflation=e.inflation/100, rates=e.rates/100, risk=e.risk/100, oil=e.oil/100;
 const map={
 tutor: growth*.12,
 savings: rates*.12,
 fixed: rates*.16,
 land: growth*.45+inflation*.20-rates*.08,
 gold: inflation*.30+risk*.35+oil*.08-rates*.10,
 bond: -rates*.55-risk*.04,
 corp: -rates*.25-risk*.40+growth*.08,
 fund: -rates*.35-risk*.10+growth*.08,
 equity: growth*.65-risk*.35-rates*.10,
 stockA: growth*.75-risk*.35-rates*.12,
 stockB: growth*.95-risk*.55-rates*.20
 };return map[id]||0;
}
function refreshMarket(room,ev){
 const old=room.market||initialMarket(); const next={};
 for(const c of CARDS){if(c.id==='insurance')continue;const prev=old[c.id]?.price??c.price;
  const macro=economicImpact(c.id,ev||{growth:0,inflation:0,rates:0,risk:0,oil:0});
  const noise=(Math.random()*2-1)*c.vol; // idiosyncratic risk around causal market driver
  const ret=clamp(macro+noise,-0.22,0.22);const price=Math.max(1,Math.round(prev*(1+ret)));
  next[c.id]={price,change:price-prev,pct:prev?((price-prev)/prev*100):0,returnPct:ret*100};
 }
 room.market=next;
}
function marketValue(p,room){return p.assets.reduce((s,a)=>s+(room.market[a.id]?.price??a.lastPrice??a.cost),0)}
function total(p,room){return p.cash+marketValue(p,room)}
// Educational fixed-income assumptions: 6 rounds = 1 simulated year.
const FIXED_INCOME={bond:{coupon:0.025,earlyCost:0.005,label:'พันธบัตรรัฐบาล'},corp:{coupon:0.04,earlyCost:0.015,label:'หุ้นกู้เอกชน'},fixed:{coupon:0.015,label:'เงินฝากประจำ'}};
function assetSaleQuote(a,room,round,roundsTotal=6){
 const market=room.market[a.id]?.price??a.lastPrice??a.cost;
 if(a.id==='fixed')return {allowed:false,price:0,fee:0,interest:0,reason:'เงินฝากประจำต้องฝากครบกำหนด จึงขายได้เมื่อจบเกมเท่านั้น'};
 if(a.id==='bond'||a.id==='corp'){
  const terms=FIXED_INCOME[a.id];
  const fee=Math.round(market*terms.earlyCost),price=Math.max(0,market-fee);
  return {allowed:true,price,fee,interest:0,proceeds:price,reason:`หักต้นทุนขายก่อนกำหนด ${(terms.earlyCost*100).toFixed(1)}% ของราคาตลาด`};
 }
 return {allowed:true,price:market,fee:0,interest:0,proceeds:market,reason:''};
}
function applyFixedIncomeRound(group,round){
 let bondInterest=0,corpInterest=0,savingsInterest=0,fixedAccrued=0;
 for(const a of group.assets){const held=Math.max(0,round-(a.buyRound||round)+1);
  if(a.id==='bond'){const v=Math.round(a.cost*FIXED_INCOME.bond.coupon/6);group.cash+=v;bondInterest+=v;a.interestPaid=(a.interestPaid||0)+v;}
  if(a.id==='corp'){const v=Math.round(a.cost*FIXED_INCOME.corp.coupon/6);group.cash+=v;corpInterest+=v;a.interestPaid=(a.interestPaid||0)+v;}
  if(a.id==='savings'){const v=Math.round(a.cost*.01/6);group.cash+=v;savingsInterest+=v;}
  if(a.id==='fixed'){fixedAccrued+=Math.round(a.cost*FIXED_INCOME.fixed.coupon/6);a.accruedInterest=(a.accruedInterest||0)+Math.round(a.cost*FIXED_INCOME.fixed.coupon/6);}
 }
 return {bondInterest,corpInterest,savingsInterest,fixedAccrued};
}
function matureFixedDeposits(group){let paid=0;for(const a of group.assets){if(a.id==='fixed'){const interest=a.accruedInterest||Math.round(a.cost*FIXED_INCOME.fixed.coupon);group.cash+=interest;paid+=interest;a.matured=true;}}return paid;}
function roundPerformance(group,room,round,before,interest={}){
 const after=total(group,room),profit=after-before;
 group.lastRoundResult={round,before,after,profit,returnPct:before?profit/before*100:0,interest};
 return group.lastRoundResult;
}
function snapshot(room){return {...room,players:room.players.map(p=>({...p,ws:undefined,marketValue:marketValue(p,room),netWorth:total(p,room)})),economy:room.economy}}
function broadcast(room){const snap=snapshot(room);for(const c of wss.clients)if(c.readyState===1&&c.room===room.code)send(c,'state',snap)}
function applyYield(room){for(const p of room.players){for(const a of p.assets){if(a.id==='tutor')p.cash+=2;if(a.id==='savings')p.cash+=Math.max(0,Math.round(a.cost*.002));if(a.id==='fixed')p.cash+=Math.max(0,Math.round(a.cost*.0035));}}}
function nextTurn(room){if(room.players.every(p=>p.done)){
 applyYield(room);room.round++;
 if(room.round===3){room.event='นโยบายกระตุ้นเศรษฐกิจ: ทุกกลุ่มได้รับเงิน +10 เหรียญ และมีแรงหนุนอุปสงค์ในตลาดรอบนี้';room.players.forEach(p=>p.cash+=10);room.economy={...ECON[0],name:'มาตรการกระตุ้นเศรษฐกิจ',growth:1.0,inflation:0.2,rates:0,risk:-0.1,oil:0,desc:'เงินกระตุ้นเพิ่มอุปสงค์ ช่วยหนุนหุ้นและที่ดิน แต่มีแรงกดดันเงินเฟ้อเล็กน้อย'};}
 else if(room.round===4){room.economy=ECON[4];room.event='ความขัดแย้งระหว่างประเทศและราคาพลังงานสูงขึ้น';}
 else if(room.round===5){room.economy=ECON[5];room.event='เงินเฟ้อลดลงและนโยบายการเงินเริ่มผ่อนคลาย';room.bonusRound=true;room.players.forEach(p=>p.maxRounds++);}
 else {room.economy=ECON[Math.floor(Math.random()*ECON.length)];room.event=room.economy.name+': '+room.economy.desc;}
 refreshMarket(room,room.economy);log(room,`ตลาดรอบ ${room.round}: ${room.event}`);
 room.players.forEach(p=>p.done=room.round>p.maxRounds);
 }
 let tries=0;do{room.turn=(room.turn+1)%room.players.length;tries++;}while(room.players[room.turn]?.done&&tries<=room.players.length);
 if(room.players.every(p=>p.done)){room.finished=true;const rank=[...room.players].sort((a,b)=>total(b,room)-total(a,room));room.winner=rank[0]?.name;log(room,'จบเกม! ผู้ชนะคือ '+room.winner);}
}

// Classroom live mode: teacher-led, up to 12 student groups, 50-minute session.
const classroomRooms=new Map();
function classSnapshot(r){
 return {code:r.code,started:r.started,finished:r.finished,created:r.created,durationMinutes:r.durationMinutes,requests:r.requests||[],
  endsAt:r.endsAt,round:r.round,roundsTotal:r.roundsTotal,market:r.market,cards:CARDS,economy:r.economy,event:r.event,fixedIncomeTerms:{bond:2.5,corp:4.0,fixed:1.5,earlyBondFee:0.5,earlyCorpFee:1.5,roundsPerYear:6},
  winner:r.finished?[...r.groups].sort((a,b)=>total(b,r)-total(a,r))[0]?.name||null:null, winnerScore:r.finished?Math.max(0,...r.groups.map(g=>total(g,r))):null, groups:r.groups.map(g=>({id:g.id,name:g.name,avatar:g.avatar||'🧑‍🎓',managedByTeacher:!!g.managedByTeacher,online:!!g.online,age:g.age||null,ageLabel:g.ageLabel||null,initialCapital:g.initialCapital||0,maxRounds:g.maxRounds||0,cash:g.cash,assets:g.assets,
   insured:g.insured,marketValue:marketValue(g,r),netWorth:total(g,r),buys:g.buys||0,sells:g.sells||0,actions:g.actions||0,skillCount:g.assets.filter(a=>a.id==='tutor').length,lastRoundIncome:g.lastRoundIncome||null,lastRoundResult:g.lastRoundResult||null,
   invested:g.assets.reduce((s,a)=>s+a.cost,0),assetTypes:new Set(g.assets.map(a=>a.id)).size,diversification:(new Set(g.assets.map(a=>a.id)).size>=3?'กระจายหลายประเภท':new Set(g.assets.map(a=>a.id)).size===2?'กระจาย 2 ประเภท':'กระจายน้อย/ยังไม่มีสินทรัพย์')})),history:r.history,log:r.log.slice(0,60)};
}
function classBroadcast(r){
 const snap=classSnapshot(r);
 for(const c of wss.clients) if(c.readyState===1&&c.classRoom===r.code) send(c,'class_state',snap);
}
function classLog(r,msg){r.log.unshift({at:Date.now(),msg});r.log=r.log.slice(0,100);}
function classFinish(r,reason){
 if(r.finished)return;
 r.finished=true;r.finishedAt=Date.now();r.finishReason=reason||'ครูจบกิจกรรม';
 for(const g of r.groups){g.finalFixedInterest=matureFixedDeposits(g);if(g.roundStartValue!=null)roundPerformance(g,r,g.lastRoundResult?.round||r.round,g.roundStartValue,{...(g.lastRoundIncome||{}),fixedMaturity:g.finalFixedInterest});}
 r.history.push({round:r.round,at:Date.now(),economy:r.economy.name,winner:r.finished?[...r.groups].sort((a,b)=>total(b,r)-total(a,r))[0]?.name||null:null, winnerScore:r.finished?Math.max(0,...r.groups.map(g=>total(g,r))):null, groups:r.groups.map(g=>({id:g.id,name:g.name,age:g.age,ageLabel:g.ageLabel,initialCapital:g.initialCapital,maxRounds:g.maxRounds,cash:g.cash,marketValue:marketValue(g,r),netWorth:total(g,r),assets:g.assets.map(a=>({...a}))}))});
 classLog(r,'จบกิจกรรม: '+r.finishReason);classBroadcast(r);
}
function classApplyRoundIncome(r){
 for(const g of r.groups){
  const before=total(g,r);g.roundStartValue=before;
  const skills=g.assets.filter(a=>a.id==='tutor').length;
  const skillIncome=skills*2;
  const interest=applyFixedIncomeRound(g,r.round);
  const income=skillIncome+interest.bondInterest+interest.corpInterest+interest.savingsInterest;
  if(income>0)g.cash+=skillIncome;
  g.lastRoundIncome={round:r.round,skillIncome,...interest,total:income};
  roundPerformance(g,r,r.round,before,g.lastRoundIncome);
 }
}
function classHistory(r){
 r.history.push({round:r.round,at:Date.now(),economy:r.economy.name,
  winner:r.finished?[...r.groups].sort((a,b)=>total(b,r)-total(a,r))[0]?.name||null:null, winnerScore:r.finished?Math.max(0,...r.groups.map(g=>total(g,r))):null, groups:r.groups.map(g=>({id:g.id,name:g.name,age:g.age,ageLabel:g.ageLabel,initialCapital:g.initialCapital,maxRounds:g.maxRounds,cash:g.cash,marketValue:marketValue(g,r),netWorth:total(g,r),assets:g.assets.map(a=>({...a}))}))});
}
function handleClassroom(ws,m,d){
 if(!m.type||!m.type.startsWith('class_'))return false;
 if(m.type==='class_create'){
  let codeRoom;do{codeRoom=code()}while(classroomRooms.has(codeRoom)||rooms.has(codeRoom));
  const token=crypto.randomBytes(18).toString('hex');
  const r={code:codeRoom,teacherToken:token,teacherOnline:true,groups:[],round:1,roundsTotal:6,
   durationMinutes:50,endsAt:null,started:false,finished:false,created:Date.now(),market:initialMarket(),
   economy:{name:'ตลาดเริ่มต้น',growth:0,inflation:0,rates:0,risk:0,oil:0,desc:'ตลาดเริ่มต้นก่อนมีข่าวเศรษฐกิจ'},
   event:'รอครูเริ่มกิจกรรม',history:[],log:[],requests:[]};
  classroomRooms.set(codeRoom,r);ws.classRoom=codeRoom;ws.classRole='teacher';ws.teacherToken=token;
  send(ws,'class_created',{code:codeRoom,teacherToken:token});classLog(r,'ครูสร้างห้องเรียนแล้ว');classBroadcast(r);return true;
 }
 if(m.type==='class_teacher_reconnect'){
  const r=classroomRooms.get(String(d.code||'').toUpperCase());
  if(!r||!d.teacherToken||d.teacherToken!==r.teacherToken){send(ws,'error','ไม่พบห้องหรือรหัสครูไม่ถูกต้อง');return true;}
  ws.classRoom=r.code;ws.classRole='teacher';ws.teacherToken=r.teacherToken;r.teacherOnline=true;classBroadcast(r);return true;
 }
 if(m.type==='class_teacher_add_character'){
  const r=classroomRooms.get(String(d.code||'').toUpperCase());
  if(!r||!d.teacherToken||d.teacherToken!==r.teacherToken){send(ws,'error','ไม่พบห้องหรือรหัสครูไม่ถูกต้อง');return true;}
  if(r.started||r.finished){send(ws,'error','เพิ่มตัวละครได้ก่อนเริ่มกิจกรรมเท่านั้น');return true;}
  if(r.groups.length>=12){send(ws,'error','ห้องเต็มแล้ว รองรับสูงสุด 12 กลุ่ม/ตัวละคร');return true;}
  const name=String(d.name||'').trim().slice(0,30),avatar=String(d.avatar||'🧑‍🎓').slice(0,8);
  if(!name){send(ws,'error','กรุณากรอกชื่อตัวละครหรือชื่อกลุ่ม');return true;}
  if(r.groups.some(g=>g.name.toLowerCase()===name.toLowerCase())){send(ws,'error','มีชื่อนี้ในห้องแล้ว กรุณาใช้ชื่ออื่น');return true;}
  r.groups.push({id:crypto.randomUUID(),name,avatar,managedByTeacher:true,cash:0,assets:[],insured:false,online:false,joinedAt:Date.now(),actions:0,buys:0,sells:0});
  classLog(r,'ครูสร้างตัวละคร '+avatar+' '+name+' (ไม่ต้องใช้อุปกรณ์นักเรียน)');classBroadcast(r);return true;
 }
 if(m.type==='class_group_reconnect'){
  const r=classroomRooms.get(String(d.code||'').toUpperCase());
  const g=r&&r.groups.find(x=>x.id===d.groupId);
  if(!r||!g){send(ws,'error','ไม่พบห้องหรือกลุ่มเดิม อาจมีการเริ่มระบบใหม่แล้ว');return true;}
  ws.classRoom=r.code;ws.classRole='group';ws.groupId=g.id;g.online=true;
  send(ws,'class_joined',{code:r.code,groupId:g.id});classLog(r,g.name+' เชื่อมต่อกลับเข้าห้อง');classBroadcast(r);return true;
 }
 if(m.type==='class_join'){
  const r=classroomRooms.get(String(d.code||'').toUpperCase());
  if(!r){send(ws,'error','ไม่พบห้องเรียนนี้ กรุณาตรวจสอบรหัสห้อง');return true;}
  if(r.started){send(ws,'error','ครูเริ่มกิจกรรมแล้ว ไม่สามารถเข้าร่วมได้');return true;}
  if(r.groups.length>=12){send(ws,'error','ห้องเต็มแล้ว รองรับสูงสุด 12 กลุ่ม');return true;}
  const name=String(d.name||'').trim().slice(0,30);
  if(!name){send(ws,'error','กรุณากรอกชื่อกลุ่ม');return true;}
  if(r.groups.some(g=>g.name.toLowerCase()===name.toLowerCase())){send(ws,'error','มีชื่อกลุ่มนี้แล้ว กรุณาใช้ชื่ออื่น');return true;}
  const g={id:crypto.randomUUID(),name,cash:0,assets:[],insured:false,online:true,joinedAt:Date.now(),actions:0,buys:0,sells:0};
  r.groups.push(g);ws.classRoom=r.code;ws.classRole='group';ws.groupId=g.id;
  send(ws,'class_joined',{code:r.code,groupId:g.id});classLog(r,name+' เข้าร่วมห้อง');classBroadcast(r);return true;
 }
 const r=classroomRooms.get(ws.classRoom);
 if(!r){send(ws,'error','การเชื่อมต่อห้องเรียนหมดอายุ กรุณาเข้าห้องใหม่');return true;}
 if(m.type==='class_start'){
  if(ws.classRole!=='teacher'||ws.teacherToken!==r.teacherToken)return send(ws,'error','เฉพาะครูผู้ควบคุมเท่านั้น');
  if(r.started)return send(ws,'error','กิจกรรมเริ่มไปแล้ว');
  if(r.groups.length<2)return send(ws,'error','ต้องมีอย่างน้อย 2 กลุ่มจึงเริ่มได้');
  r.started=true;r.endsAt=Date.now()+50*60*1000;r.round=1;r.roundsTotal=6;setTimeout(()=>{if(!r.finished&&Date.now()>=r.endsAt)classFinish(r,'ครบเวลา 50 นาที');},50*60*1000+1000);
  const ageDefs=[{age:'วัยสร้างตัว',ageLabel:'21–30 ปี',capital:40,maxRounds:6},{age:'วัยทำงาน',ageLabel:'31–50 ปี',capital:60,maxRounds:5},{age:'วัยเกษียณ',ageLabel:'55 ปีขึ้นไป',capital:80,maxRounds:4}];
  const deck=[];while(deck.length<r.groups.length)deck.push(...ageDefs);for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
  r.groups.forEach((g,i)=>{const a=deck[i];g.age=a.age;g.ageLabel=a.ageLabel;g.initialCapital=a.capital;g.maxRounds=a.maxRounds;g.cash=a.capital;g.assets=[];g.insured=false;g.actions=0;g.buys=0;g.sells=0;});
  classHistory(r);classLog(r,'เริ่มกิจกรรม 50 นาที: สุ่มช่วงวัยแบบกระจายสมดุล พร้อมกำหนดทุนและจำนวนรอบตามต้นฉบับ');classBroadcast(r);return true;
 }
 if(m.type==='class_next_round'){
  if(ws.classRole!=='teacher'||ws.teacherToken!==r.teacherToken)return send(ws,'error','เฉพาะครูผู้ควบคุมเท่านั้น');
  if(!r.started||r.finished)return send(ws,'error','ยังไม่อยู่ในสถานะที่เปลี่ยนรอบได้');
  if(Date.now()>=r.endsAt){classFinish(r,'ครบเวลา 50 นาที');return true;}
  classApplyRoundIncome(r);
  if(r.round>=r.roundsTotal){classFinish(r,'ครบ 6 รอบของตลาดจำลอง');classBroadcast(r);return true;}
  r.round++;
  const ev=ECON[Math.floor(Math.random()*ECON.length)];r.economy=ev;r.event=ev.name+': '+ev.desc;
  if(r.round===3){r.groups.forEach(g=>g.cash+=10);r.event='มาตรการกระตุ้นเศรษฐกิจ: ทุกกลุ่มได้รับเงินเพิ่ม 10 เหรียญ';r.economy={...ECON[0],name:'มาตรการกระตุ้นเศรษฐกิจ',desc:'เงินกระตุ้นเพิ่มอุปสงค์ ช่วยหนุนหุ้นและที่ดิน'};}
  refreshMarket(r,r.economy);for(const g of r.groups){const before=g.roundStartValue??total(g,r);roundPerformance(g,r,r.round-1,before,g.lastRoundIncome||{});}classHistory(r);classLog(r,'ครูเปลี่ยนเป็นรอบ '+r.round+' — '+r.event);classBroadcast(r);return true;
 }
 if(m.type==='class_finish'){
  if(ws.classRole!=='teacher'||ws.teacherToken!==r.teacherToken)return send(ws,'error','เฉพาะครูผู้ควบคุมเท่านั้น');
  classFinish(r,'ครูสั่งจบกิจกรรม');return true;
 }

 if(m.type==='class_trade_request'){
  if(ws.classRole!=='group')return send(ws,'error','เฉพาะกลุ่มนักเรียนออนไลน์เท่านั้น');
  if(!r.started||r.finished||Date.now()>=r.endsAt)return send(ws,'error','ขณะนี้ไม่เปิดรับคำสั่งลงทุน');
  const g=r.groups.find(x=>x.id===ws.groupId);if(!g)return send(ws,'error','ไม่พบกลุ่มของคุณ');if(r.round>g.maxRounds)return send(ws,'error','กลุ่มของคุณครบจำนวนรอบการลงทุนตามช่วงวัยแล้ว');
  const action=String(d.action||'');
  if(!['buy','sell','insure'].includes(action))return send(ws,'error','ประเภทคำสั่งไม่ถูกต้อง');
  if(action==='buy'&&!CARDS.some(c=>c.id===d.assetId&&c.id!=='insurance'))return send(ws,'error','ไม่พบสินทรัพย์');
  if(action==='sell'&&(!Number.isInteger(Number(d.index))||Number(d.index)<0||Number(d.index)>=g.assets.length))return send(ws,'error','ไม่พบสินทรัพย์ที่ต้องการขาย');
  if(action==='insure'&&g.insured)return send(ws,'error','กลุ่มนี้มีประกันแล้ว');
  if(r.requests.length>=50)return send(ws,'error','คำสั่งรอดำเนินการเต็ม กรุณารอครู');
  const req={id:crypto.randomUUID(),groupId:g.id,groupName:g.name,action,assetId:d.assetId||null,index:action==='sell'?Number(d.index):null,createdAt:Date.now(),status:'pending'};
  r.requests.unshift(req);classLog(r,g.name+' ส่งคำสั่ง '+({buy:'ซื้อ',sell:'ขาย',insure:'ซื้อประกัน'}[action])+' รอครูดำเนินการ');classBroadcast(r);send(ws,'class_request_ack',{id:req.id});return true;
 }
 if(m.type==='class_teacher_request_action'){
  if(ws.classRole!=='teacher'||ws.teacherToken!==r.teacherToken)return send(ws,'error','เฉพาะครูผู้ควบคุมเท่านั้น');
  const req=(r.requests||[]).find(x=>x.id===d.requestId&&x.status==='pending');if(!req)return send(ws,'error','ไม่พบคำสั่งที่รอดำเนินการ');
  if(d.decision==='reject'){req.status='rejected';req.resolvedAt=Date.now();classLog(r,'ครูไม่อนุมัติคำสั่งของ '+req.groupName);classBroadcast(r);return true;}
  const g=r.groups.find(x=>x.id===req.groupId);if(!g)return send(ws,'error','ไม่พบกลุ่มเจ้าของคำสั่ง');if(r.round>g.maxRounds)return send(ws,'error','กลุ่มนี้ครบจำนวนรอบการลงทุนตามช่วงวัยแล้ว');
  if(!r.started||r.finished||Date.now()>=r.endsAt)return send(ws,'error','หมดเวลาทำรายการ');
  if(req.action==='buy'){
   const c=CARDS.find(x=>x.id===req.assetId&&x.id!=='insurance');if(!c)return send(ws,'error','สินทรัพย์ไม่ถูกต้อง');
   const price=r.market[c.id]?.price??c.price;if(c.id==='tutor'&&g.assets.filter(a=>a.id==='tutor').length>=2)return send(ws,'error','ซื้อการ์ดฝึกทักษะได้ไม่เกิน 2 ใบต่อกลุ่ม');if(g.cash<price)return send(ws,'error','เงินสดของกลุ่มไม่เพียงพอ');
   g.cash-=price;g.assets.push({id:c.id,name:c.name,cost:price,buyRound:r.round,lastPrice:price});g.buys++;g.actions++;classLog(r,'ครูดำเนินคำสั่งซื้อให้ '+g.name+' ซื้อ '+c.name+' ราคา '+price+' เหรียญ');
  }else if(req.action==='sell'){
   const idx=req.index;if(!Number.isInteger(idx)||idx<0||idx>=g.assets.length)return send(ws,'error','สินทรัพย์ที่ต้องการขายเปลี่ยนแปลงแล้ว');
   const a=g.assets[idx];const quote=assetSaleQuote(a,r,r.round,r.roundsTotal);if(!quote.allowed)return send(ws,'error',quote.reason);const price=quote.price;g.cash+=quote.proceeds;g.assets.splice(idx,1);g.sells++;g.actions++;classLog(r,'ครูดำเนินคำสั่งขายให้ '+g.name+' ขาย '+a.name+' ได้สุทธิ '+quote.proceeds+' เหรียญ (ค่าขาย '+quote.fee+'; ดอกเบี้ย '+quote.interest+')');
  }else{
   if(g.insured||g.cash<10)return send(ws,'error','ไม่สามารถซื้อประกันได้ (มีประกันแล้วหรือเงินไม่พอ)');
   g.cash-=10;g.insured=true;g.actions++;classLog(r,'ครูดำเนินคำสั่งซื้อประกันให้ '+g.name);
  }
  req.status='approved';req.resolvedAt=Date.now();classBroadcast(r);return true;
 }
 if(m.type==='class_teacher_trade'){
  if(ws.classRole!=='teacher'||ws.teacherToken!==r.teacherToken)return send(ws,'error','เฉพาะครูผู้ควบคุมเท่านั้น');
  if(!r.started||r.finished||Date.now()>=r.endsAt){if(r.started&&!r.finished)classFinish(r,'ครบเวลา 50 นาที');return send(ws,'error','ขณะนี้ไม่เปิดให้ทำรายการลงทุน');}
  const g=r.groups.find(x=>x.id===d.groupId);if(!g)return send(ws,'error','ไม่พบตัวละคร');if(r.round>g.maxRounds)return send(ws,'error','กลุ่มนี้ครบจำนวนรอบการลงทุนตามช่วงวัยแล้ว');
  if(d.action==='buy'){
   const c=CARDS.find(x=>x.id===d.assetId);if(!c||c.id==='insurance')return send(ws,'error','ไม่พบสินทรัพย์นี้');
   const price=r.market[c.id]?.price??c.price;if(c.id==='tutor'&&g.assets.filter(a=>a.id==='tutor').length>=2)return send(ws,'error','ซื้อการ์ดฝึกทักษะได้ไม่เกิน 2 ใบต่อกลุ่ม');if(g.cash<price)return send(ws,'error','เงินสดของตัวละครไม่เพียงพอ');
   g.cash-=price;g.assets.push({id:c.id,name:c.name,cost:price,buyRound:r.round,lastPrice:price});g.buys++;g.actions++;classLog(r,(d.source==='student_instruction'?'ครูบันทึกคำสั่งจากนักเรียนและดำเนินการแทน ':'ครูดำเนินการแทน ')+g.name+' ซื้อ '+c.name+' ราคา '+price+' เหรียญ');
  }else if(d.action==='sell'){
   const idx=Number(d.index);if(!Number.isInteger(idx)||idx<0||idx>=g.assets.length)return send(ws,'error','ไม่พบสินทรัพย์ที่ต้องการขาย');
   const a=g.assets[idx];const quote=assetSaleQuote(a,r,r.round,r.roundsTotal);if(!quote.allowed)return send(ws,'error',quote.reason);const price=quote.price;g.cash+=quote.proceeds;g.assets.splice(idx,1);g.sells++;g.actions++;classLog(r,(d.source==='student_instruction'?'ครูบันทึกคำสั่งจากนักเรียนและดำเนินการแทน ':'ครูดำเนินการแทน ')+g.name+' ขาย '+a.name+' ได้สุทธิ '+quote.proceeds+' เหรียญ (ค่าขาย '+quote.fee+'; ดอกเบี้ย '+quote.interest+')');
  }else if(d.action==='insure'){
   if(g.insured)return send(ws,'error','ตัวละครนี้มีประกันแล้ว');if(g.cash<10)return send(ws,'error','เงินสดไม่เพียงพอ');g.cash-=10;g.insured=true;g.actions++;classLog(r,'ครูซื้อประกันแทน '+g.name+' 10 เหรียญ');
  }else return send(ws,'error','คำสั่งไม่ถูกต้อง');
  classBroadcast(r);return true;
 }
 if(m.type==='class_buy'||m.type==='class_sell'||m.type==='class_insure'){
  if(ws.classRole!=='group')return send(ws,'error','การทำรายการนี้ใช้ได้เฉพาะกลุ่มนักเรียน');
  const g=r.groups.find(x=>x.id===ws.groupId);
  if(!g)return send(ws,'error','ไม่พบกลุ่มของคุณ');if(r.round>g.maxRounds)return send(ws,'error','กลุ่มของคุณครบจำนวนรอบการลงทุนตามช่วงวัยแล้ว');
  if(!r.started||r.finished||Date.now()>=r.endsAt){if(r.started&&!r.finished)classFinish(r,'ครบเวลา 50 นาที');return send(ws,'error','ขณะนี้ไม่เปิดให้ทำรายการลงทุน');}
  if(m.type==='class_buy'){
   const c=CARDS.find(x=>x.id===d.id);if(!c||c.id==='insurance')return send(ws,'error','ไม่พบสินทรัพย์นี้');
   const price=r.market[c.id]?.price??c.price;if(c.id==='tutor'&&g.assets.filter(a=>a.id==='tutor').length>=2)return send(ws,'error','ซื้อการ์ดฝึกทักษะได้ไม่เกิน 2 ใบต่อกลุ่ม');if(g.cash<price)return send(ws,'error','เงินสดไม่เพียงพอ');
   g.cash-=price;g.assets.push({id:c.id,name:c.name,cost:price,buyRound:r.round,lastPrice:price});g.buys++;g.actions++;
   classLog(r,g.name+' ซื้อ '+c.name+' ราคา '+price+' เหรียญ');
  }else if(m.type==='class_sell'){
   const idx=Number(d.index);if(!Number.isInteger(idx)||idx<0||idx>=g.assets.length)return send(ws,'error','ไม่พบสินทรัพย์ที่ต้องการขาย');
   const a=g.assets[idx],quote=assetSaleQuote(a,r,r.round,r.roundsTotal);if(!quote.allowed)return send(ws,'error',quote.reason);const price=quote.price;g.cash+=quote.proceeds;g.assets.splice(idx,1);g.sells++;g.actions++;
   classLog(r,g.name+' ขาย '+a.name+' ได้สุทธิ '+quote.proceeds+' เหรียญ (ค่าขาย '+quote.fee+'; ดอกเบี้ย '+quote.interest+')');
  }else{
   if(g.insured)return send(ws,'error','กลุ่มนี้มีประกันแล้ว');if(g.cash<10)return send(ws,'error','เงินสดไม่เพียงพอ');
   g.cash-=10;g.insured=true;g.actions++;classLog(r,g.name+' ซื้อประกัน 10 เหรียญ');
  }
  classBroadcast(r);return true;
 }
 if(m.type==='class_ping'){classBroadcast(r);return true;}
 return true;
}

wss.on('connection',ws=>{ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch{return}const d=m.data||{};
 if(handleClassroom(ws,m,d))return;
 if(m.type==='create'){const c=code();const p={id:crypto.randomUUID(),name:d.name||'ครู/กลุ่ม 1',age:null,cash:0,maxRounds:0,assets:[],done:false,insured:false,ws};const r={code:c,host:p.name,players:[p],round:1,turn:0,event:'',finished:false,started:false,log:[],created:Date.now(),market:initialMarket(),economy:{name:'ตลาดเริ่มต้น',growth:0,inflation:0,rates:0,risk:0,oil:0,desc:'ตลาดเริ่มต้นก่อนมีข่าวเศรษฐกิจ'},bonusRound:false};rooms.set(c,r);ws.room=c;send(ws,'joined',{code:c,id:p.id});log(r,p.name+' สร้างห้องแล้ว');broadcast(r);return;}
 if(m.type==='join'){const r=rooms.get(String(d.code||'').toUpperCase());if(!r)return send(ws,'error','ไม่พบห้องนี้');if(r.players.length>=12)return send(ws,'error','ห้องเต็มแล้ว (สูงสุด 12 คน)');if(r.started)return send(ws,'error','เกมเริ่มแล้ว ไม่สามารถเข้าร่วมได้');const p={id:crypto.randomUUID(),name:d.name||'ผู้เล่น',age:null,cash:0,maxRounds:0,assets:[],done:false,insured:false,ws};r.players.push(p);ws.room=r.code;send(ws,'joined',{code:r.code,id:p.id});log(r,p.name+' เข้าร่วมห้อง');broadcast(r);return;}
 const r=rooms.get(ws.room);if(!r)return;const p=r.players.find(x=>x.ws===ws);if(!p)return;
 if(m.type==='start'&&r.players.length>=2&&!r.started){r.started=true;const ages=['วัยสร้างตัว','วัยทำงาน','วัยเกษียณ'];r.players.forEach(x=>{x.age=ages[Math.floor(Math.random()*3)];x.cash=x.age==='วัยสร้างตัว'?40:x.age==='วัยทำงาน'?60:80;x.maxRounds=x.age==='วัยสร้างตัว'?6:x.age==='วัยทำงาน'?5:4});r.turn=0;log(r,'เริ่มเกม: สุ่มช่วงวัยและเงินทุนแล้ว');broadcast(r);return;}
 if(!r.started||r.finished)return;if(r.players[r.turn]!==p)return send(ws,'error','ยังไม่ถึงตาคุณ');
 if(m.type==='buy'){const c=CARDS.find(x=>x.id===d.id);if(!c||c.id==='insurance')return;if(c.id==='tutor'&&p.assets.filter(a=>a.id==='tutor').length>=2)return send(ws,'error','ซื้อการ์ดฝึกทักษะได้ไม่เกิน 2 ใบ');const price=r.market[c.id]?.price??c.price;if(p.cash<price)return send(ws,'error','เงินไม่เพียงพอ');p.cash-=price;p.assets.push({id:c.id,name:c.name,cost:price,buyRound:r.round,lastPrice:price});log(r,`${p.name} ซื้อ${c.name} ราคา ${price} เหรียญ`);broadcast(r);}
 if(m.type==='sell'){const i=p.assets.findIndex(x=>x.id===d.id);if(i<0)return;const a=p.assets[i],quote=assetSaleQuote(a,r,r.round,6);if(!quote.allowed)return send(ws,'error',quote.reason);p.cash+=quote.proceeds;p.assets.splice(i,1);log(r,`${p.name} ขาย${a.name} ได้สุทธิ ${quote.proceeds} เหรียญ (ค่าขาย ${quote.fee}; ดอกเบี้ย ${quote.interest})`);broadcast(r);}
 if(m.type==='insure'){if(p.insured)return send(ws,'error','มีประกันแล้ว');if(p.cash<10)return send(ws,'error','เงินไม่เพียงพอ');p.cash-=10;p.insured=true;log(r,p.name+' ซื้อประกัน 10 เหรียญ');broadcast(r);}
 if(m.type==='end'){const outcomes=[{n:'อุบัติเหตุทางรถยนต์',cost:2},{n:'ไส้ติ่งอักเสบ ต้องผ่าตัด',cost:3},{n:'ถูกมิจฉาชีพหลอก',cost:5},{n:'โทรศัพท์เสียหาย',cost:3},{n:'บาดเจ็บจากการเล่นกีฬา',cost:2},{n:'อุบัติเหตุระหว่างเดินทาง',cost:1}];const hit=Math.random()<.5;if(hit){const e=outcomes[Math.floor(Math.random()*outcomes.length)];if(p.insured){p.cash+=5;log(r,`วงล้อ: ${p.name} พบเหตุ ${e.n} มีประกันจึงไม่เสียเงินและได้รับ 5 เหรียญ`)}else{p.cash=Math.max(0,p.cash-e.cost);log(r,`วงล้อ: ${p.name} — ${e.n} เสีย ${e.cost} เหรียญ`)}}else log(r,`วงล้อ: ${p.name} ปลอดภัย ไม่มีค่าใช้จ่าย`);p.done=true;nextTurn(r);broadcast(r);}
 });ws.on('close',()=>{if(ws.classRoom){const cr=classroomRooms.get(ws.classRoom);if(cr){if(ws.classRole==='teacher')cr.teacherOnline=false;else if(ws.classRole==='group'){const gg=cr.groups.find(x=>x.id===ws.groupId);if(gg)gg.online=false;}classBroadcast(cr);}}const r=rooms.get(ws.room);if(r){const p=r.players.find(x=>x.ws===ws);if(p){p.online=false;log(r,p.name+' หลุดจากการเชื่อมต่อ');broadcast(r)}}});});
app.get('/api/cards',(q,s)=>s.json(CARDS));app.get('/api/economy',(q,s)=>s.json(ECON));app.get('/health',(q,s)=>s.json({ok:true,rooms:rooms.size}));
const port=process.env.PORT||3000;server.listen(port,()=>console.log('Invest MonoPoly v3 listening on '+port));
