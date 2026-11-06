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
{id:'tutor',name:'คนกำลังฝึกทักษะ',price:1,vol:0.004,desc:'ลงทุนพัฒนาทักษะ สร้างรายได้จำลอง +1 เหรียญต่อรอบ'},
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
function snapshot(room){return {...room,players:room.players.map(p=>({...p,ws:undefined,marketValue:marketValue(p,room),netWorth:total(p,room)})),economy:room.economy}}
function broadcast(room){const snap=snapshot(room);for(const c of wss.clients)if(c.readyState===1&&c.room===room.code)send(c,'state',snap)}
function applyYield(room){for(const p of room.players){for(const a of p.assets){if(a.id==='tutor')p.cash+=1;if(a.id==='savings')p.cash+=Math.max(0,Math.round(a.cost*.002));if(a.id==='fixed')p.cash+=Math.max(0,Math.round(a.cost*.0035));}}}
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
wss.on('connection',ws=>{ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch{return}const d=m.data||{};
 if(m.type==='create'){const c=code();const p={id:crypto.randomUUID(),name:d.name||'ครู/กลุ่ม 1',age:null,cash:0,maxRounds:0,assets:[],done:false,insured:false,ws};const r={code:c,host:p.name,players:[p],round:1,turn:0,event:'',finished:false,started:false,log:[],created:Date.now(),market:initialMarket(),economy:{name:'ตลาดเริ่มต้น',growth:0,inflation:0,rates:0,risk:0,oil:0,desc:'ตลาดเริ่มต้นก่อนมีข่าวเศรษฐกิจ'},bonusRound:false};rooms.set(c,r);ws.room=c;send(ws,'joined',{code:c,id:p.id});log(r,p.name+' สร้างห้องแล้ว');broadcast(r);return;}
 if(m.type==='join'){const r=rooms.get(String(d.code||'').toUpperCase());if(!r)return send(ws,'error','ไม่พบห้องนี้');if(r.players.length>=12)return send(ws,'error','ห้องเต็มแล้ว (สูงสุด 12 คน)');if(r.started)return send(ws,'error','เกมเริ่มแล้ว ไม่สามารถเข้าร่วมได้');const p={id:crypto.randomUUID(),name:d.name||'ผู้เล่น',age:null,cash:0,maxRounds:0,assets:[],done:false,insured:false,ws};r.players.push(p);ws.room=r.code;send(ws,'joined',{code:r.code,id:p.id});log(r,p.name+' เข้าร่วมห้อง');broadcast(r);return;}
 const r=rooms.get(ws.room);if(!r)return;const p=r.players.find(x=>x.ws===ws);if(!p)return;
 if(m.type==='start'&&r.players.length>=2&&!r.started){r.started=true;const ages=['วัยสร้างตัว','วัยทำงาน','วัยเกษียณ'];r.players.forEach(x=>{x.age=ages[Math.floor(Math.random()*3)];x.cash=x.age==='วัยสร้างตัว'?40:x.age==='วัยทำงาน'?60:80;x.maxRounds=x.age==='วัยสร้างตัว'?6:x.age==='วัยทำงาน'?5:4});r.turn=0;log(r,'เริ่มเกม: สุ่มช่วงวัยและเงินทุนแล้ว');broadcast(r);return;}
 if(!r.started||r.finished)return;if(r.players[r.turn]!==p)return send(ws,'error','ยังไม่ถึงตาคุณ');
 if(m.type==='buy'){const c=CARDS.find(x=>x.id===d.id);if(!c||c.id==='insurance')return;const price=r.market[c.id]?.price??c.price;if(p.cash<price)return send(ws,'error','เงินไม่เพียงพอ');p.cash-=price;p.assets.push({id:c.id,name:c.name,cost:price,buyRound:r.round,lastPrice:price});log(r,`${p.name} ซื้อ${c.name} ราคา ${price} เหรียญ`);broadcast(r);}
 if(m.type==='sell'){const i=p.assets.findIndex(x=>x.id===d.id);if(i<0)return;const a=p.assets[i],price=r.market[a.id]?.price??a.lastPrice;p.cash+=price;p.assets.splice(i,1);log(r,`${p.name} ขาย${a.name} ได้ ${price} เหรียญ (ต้นทุน ${a.cost}; กำไร/ขาดทุน ${price-a.cost})`);broadcast(r);}
 if(m.type==='insure'){if(p.insured)return send(ws,'error','มีประกันแล้ว');if(p.cash<10)return send(ws,'error','เงินไม่เพียงพอ');p.cash-=10;p.insured=true;log(r,p.name+' ซื้อประกัน 10 เหรียญ');broadcast(r);}
 if(m.type==='end'){const outcomes=[{n:'อุบัติเหตุทางรถยนต์',cost:2},{n:'ไส้ติ่งอักเสบ ต้องผ่าตัด',cost:3},{n:'ถูกมิจฉาชีพหลอก',cost:5},{n:'โทรศัพท์เสียหาย',cost:3},{n:'บาดเจ็บจากการเล่นกีฬา',cost:2},{n:'อุบัติเหตุระหว่างเดินทาง',cost:1}];const hit=Math.random()<.5;if(hit){const e=outcomes[Math.floor(Math.random()*outcomes.length)];if(p.insured){p.cash+=5;log(r,`วงล้อ: ${p.name} พบเหตุ ${e.n} มีประกันจึงไม่เสียเงินและได้รับ 5 เหรียญ`)}else{p.cash=Math.max(0,p.cash-e.cost);log(r,`วงล้อ: ${p.name} — ${e.n} เสีย ${e.cost} เหรียญ`)}}else log(r,`วงล้อ: ${p.name} ปลอดภัย ไม่มีค่าใช้จ่าย`);p.done=true;nextTurn(r);broadcast(r);}
 });ws.on('close',()=>{const r=rooms.get(ws.room);if(r){const p=r.players.find(x=>x.ws===ws);if(p){p.online=false;log(r,p.name+' หลุดจากการเชื่อมต่อ');broadcast(r)}}});});
app.get('/api/cards',(q,s)=>s.json(CARDS));app.get('/api/economy',(q,s)=>s.json(ECON));app.get('/health',(q,s)=>s.json({ok:true,rooms:rooms.size}));
const port=process.env.PORT||3000;server.listen(port,()=>console.log('Invest MonoPoly v3 listening on '+port));
