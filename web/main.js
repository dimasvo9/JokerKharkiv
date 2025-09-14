(function(){
  const $=q=>document.querySelector(q);
  const logEl = $('#log');
  let token=null, user=null, ws=null, mySeat=null, myHand=[]; let oppCounts=[0,0,0,0];
  function log(s){ logEl.textContent += s + "\n"; logEl.scrollTop = logEl.scrollHeight; }

  async function api(path, body, method='POST'){
    try{
      const r=await fetch('/api'+path,{method,headers:{'Content-Type':'application/json', ...(token?{'Authorization':'Bearer '+token}:{})},body: body?JSON.stringify(body):undefined});
      return await r.json();
    }catch(e){ return {error:'network'}; }
  }

  // Auth modal
  $('#btnAuth').onclick=()=>$('#authModal').hidden=false;
  $('#btnClose').onclick=()=>$('#authModal').hidden=true;
  $('#btnRegister').onclick=async()=>{
    const r=await api('/auth/register',{email:$('#email').value,password:$('#password').value,nickname:$('#nickname').value});
    if(r.error) return alert('Ошибка: '+r.error);
    token=r.token; user=r.user; $('#authModal').hidden=true; log('Регистрация ок. Пользователь: '+user.nickname);
    refreshLeaderboard();
  };
  $('#btnLogin').onclick=async()=>{
    const r=await api('/auth/login',{email:$('#email').value,password:$('#password').value});
    if(r.error) return alert('Ошибка: '+r.error);
    token=r.token; user=r.user; $('#authModal').hidden=true; log('Вход ок. Пользователь: '+user.nickname);
    refreshLeaderboard();
  };

  $('#btnCreate').onclick=async()=>{
    const name = prompt('Название стола','Joker Table');
    const isPrivate = confirm('Сделать приватный стол?');
    let password=null;
    if(isPrivate) password = prompt('Пароль для входа (оставьте пустым для инвайта-only)','');
    const r=await api('/rooms/create',{name,isPrivate,password});
    if(r.error) return alert('Ошибка создания: '+r.error);
    log('Стол создан. ID: '+r.id+' · Invite: '+r.invite);
    $('#roomId').value=r.id;
    $('#inviteBox').innerHTML='ID: <b>'+r.id+'</b> · Invite: <b>'+r.invite+'</b>';
  };

  $('#btnJoin').onclick=()=>{
    const id = $('#roomId').value.trim();
    const pass = $('#roomPass').value.trim();
    if(!id) return alert('Введите ID стола');
    openWs();
    ws.addEventListener('open', ()=>{
      ws.send(JSON.stringify({t:'JOIN', roomId:id, password:pass, name: user?user.nickname:('Гость-'+Math.floor(Math.random()*999))}));
    }, {once:true});
  };

  $('#btnStart').onclick=()=> ws?.send(JSON.stringify({t:'START'}));

  function openWs(){
    if(ws && ws.readyState<=1) try{ ws.close(); }catch{}
    const proto = location.protocol==='https:'?'wss':'ws';
    ws = new WebSocket(proto+'://'+location.host);
    ws.onmessage = ev=>{
      const m = JSON.parse(ev.data);
      if(m.t==='WELCOME'){ mySeat=m.seat; log('Ваше место: '+(mySeat+1)); }
      if(m.t==='SEATS'){ m.seats.forEach((s,i)=>$('#n'+i).textContent=s?s.name:'—'); }
      if(m.t==='HAND'){ if(m.seat===mySeat){ myHand=m.hand; renderHands(); } else { oppCounts[m.seat]=m.hand.length; renderOppHands(); } }
      if(m.t==='START'){ oppCounts=[0,0,0,0]; renderOppHands(); renderTrump(m.trumpSuit,m.trumpCard); $('#status').textContent='Тип: '+m.type+' · N='+m.N; }
      if(m.t==='TURN'){ $('#status').textContent='Ход игрока '+(m.seat+1); }
      if(m.t==='PLAY'){ addToTrick(m.seat,m.card); if(m.seat===mySeat){ myHand=myHand.filter(c=>c.id!==m.card.id); renderHands(); } else { oppCounts[m.seat]=Math.max(0,(oppCounts[m.seat]||0)-1); renderOppHands(); } }
      if(m.t==='TRICK_TAKEN'){ log('Взятка: игрок '+(m.seat+1)); $('#trick').innerHTML=''; }
      if(m.t==='HAND_END'){ log('Кон окончен. Очки: '+m.scores.join(', ')); updateScores(m.scores); $('#trick').innerHTML=''; oppCounts=[0,0,0,0]; renderOppHands(); }
      if(m.t==='ERROR'){ alert('Ошибка: '+m.msg); }
    };
    ws.onclose=()=> log('WS закрыт');
  // === Slow animations / message queue ===
  const ANIM = Object.assign({START:600, TURN:450, PLAY:650, TRICK_TAKEN:700, HAND_END:800, DEFAULT:300}, (window.ANIM||{}));
  const q = []; let busy=false;
  function wait(ms){ return new Promise(r=>setTimeout(r, ms)); }
  function enqueue(m){ q.push(m); if(!busy) processQ(); }
  async function processQ(){ busy=true; while(q.length){ const m=q.shift(); await handle(m); const d=ANIM[m.t]??ANIM.DEFAULT; await wait(d); } busy=false; }
  async function handle(m){
    if(m.t==='WELCOME'){ mySeat=m.seat; log('Ваше место: '+(mySeat+1)); return; }
    if(m.t==='SEATS'){ m.seats.forEach((s,i)=>$('#n'+i).textContent=s?s.name:'—'); return; }
    if(m.t==='HAND'){ if(m.seat===mySeat){ myHand=m.hand; renderHands(); } else { oppCounts[m.seat]=m.hand.length; renderOppHands(); } return; }
    if(m.t==='START'){ oppCounts=[0,0,0,0]; renderOppHands(); renderTrump(m.trumpSuit,m.trumpCard); $('#status').textContent='Тип: '+m.type+' · N='+m.N; highlightSeat(m.dealer); return; }
    if(m.t==='TURN'){ $('#status').textContent='Ход игрока '+(m.seat+1); highlightSeat(m.seat); return; }
    if(m.t==='PLAY'){ addToTrick(m.seat,m.card,true); if(m.seat===mySeat){ myHand=myHand.filter(c=>c.id!==m.card.id); renderHands(); } else { oppCounts[m.seat]=Math.max(0,(oppCounts[m.seat]||0)-1); renderOppHands(); } return; }
    if(m.t==='TRICK_TAKEN'){ log('Взятка: игрок '+(m.seat+1)); fadeTrick(); return; }
    if(m.t==='HAND_END'){ log('Кон окончен. Очки: '+m.scores.join(', ')); updateScores(m.scores); clearTrick(); oppCounts=[0,0,0,0]; renderOppHands(); return; }
    if(m.t==='ERROR'){ alert('Ошибка: '+m.msg); return; }
  }
  function highlightSeat(seat){ for(let i=0;i<4;i++){ const s=document.querySelector('.s'+i); if(!s) continue; s.classList.toggle('active', i===seat); } }

  }

  function cardDiv(c){
    const d=document.createElement('div');
    d.className='card '+cls(c.s);
    d.textContent = c.s==='J' ? 'JOKER' : (c.r+c.s);
    d.style.cursor='pointer';
    d.onclick=()=>{
      let payload={t:'PLAY', card:c};
      if($('#trick').children.length===0 && c.s==='J'){
        const suit = prompt('Джокер лид. Масть (C,S,D,H):','C');
        if(suit) payload.leadSuit = suit.toUpperCase();
      }
      ws.send(JSON.stringify(payload));
    };
    return d;
  }
  function cls(s){ if(s==='C')return'green'; if(s==='S')return'black'; if(s==='D')return'blue'; if(s==='H')return'red'; if(s==='J')return'joker'; return''; }
  function renderHands(){
    const h = document.querySelector('#h'+mySeat); h.innerHTML='';
    myHand.forEach(c=>h.append(cardDiv(c)));
  }
  function addToTrick(seat,card,animated){
    const t=$('#trick'); const e=cardDiv(card); const w=document.createElement('div'); w.style.display='grid'; w.style.placeItems='center'; e.classList.add('anim','from-s'+seat);
    const who=document.createElement('div'); who.style.fontSize='11px'; who.textContent='P'+(seat+1);
    w.append(e,who); t.append(w);
  }
  function renderTrump(s,card){ $('#trumpBox').textContent = s?('Козырь: '+s):'Без козыря'; }
  function updateScores(add){ for(let i=0;i<4;i++){ const el=$('#sc'+i); el.textContent= String(Number(el.textContent||'0') + (add[i]||0)); } }

  async function refreshLeaderboard(){
    const r=await api('/auth/leaderboard', null, 'GET');
    if(!r.ok) return;
    const lb=$('#lb'); lb.innerHTML='';
    (r.top||[]).slice(0,10).forEach(row=>{
      const li=document.createElement('li'); li.textContent = row.nickname+' — '+row.total_score; lb.append(li);
    });
  }
  refreshLeaderboard();
})();

  function renderOppHands(){
    for(let i=0;i<4;i++){
      if(i===mySeat) continue;
      const el = document.querySelector('#h'+i); if(!el) continue;
      el.innerHTML='';
      const n = oppCounts[i]||0;
      for(let k=0;k<n;k++){
        const b=document.createElement('div');
        b.className='card back'; b.title='Карты соперника';
        el.append(b);
      }
    }
  }
