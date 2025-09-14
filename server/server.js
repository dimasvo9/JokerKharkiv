import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { db, initDb } from './db.js';
import { auth, authMiddleware } from './auth.js';
import { createDeck, shuffle, deal, nextRight, canPlay, winner, SEQ, scoreHand } from './engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
initDb();

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/auth', auth);
app.use(authMiddleware);

const ROOMS = new Map(); // id -> {id,name,invite,isPrivate,pass, players:[{id,ws,name,botSkill?}], state}

function makeId(len=6){ const s='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from({length:len},()=>s[Math.floor(Math.random()*s.length)]).join(''); }

// REST: create room
app.post('/api/rooms/create', (req,res)=>{
  const {name, isPrivate, password, bots=0, botSkill='easy'} = req.body||{};
  const id = makeId(6);
  const invite = makeId(8);
  const room = {id, name:name||'Joker Table', invite, isPrivate: !!isPrivate, pass: password||null, players:[], state:null};
  ROOMS.set(id, room);
  res.json({ok:true, id, invite});
});

// REST: list rooms (only public)
app.get('/api/rooms', (_req,res)=>{
  const list = Array.from(ROOMS.values()).filter(r=>!r.isPrivate).map(r=>({id:r.id,name:r.name,players:r.players.length}));
  res.json({ok:true, rooms:list});
});

app.use('/', express.static(path.join(__dirname,'..','web')));

const server = app.listen(process.env.PORT||8080, ()=>console.log('Server on http://localhost:'+ (process.env.PORT||8080)));
const wss = new WebSocketServer({ server });

function broadcast(room, msg){
  for(const p of room.players){
    if(p.ws && p.ws.readyState===p.ws.OPEN){
      p.ws.send(JSON.stringify(msg));
    }
  }
}

wss.on('connection', ws=>{
  ws.on('message', raw=>{
    let m; try{ m=JSON.parse(raw); }catch{ return; }
    if(m.t==='JOIN'){
      const r = ROOMS.get(m.roomId);
      if(!r){ ws.send(JSON.stringify({t:'ERROR',msg:'no_room'})); return; }
      if(r.isPrivate && r.pass && r.pass!==m.password){ ws.send(JSON.stringify({t:'ERROR',msg:'bad_password'})); return; }
      if(r.players.length>=4){ ws.send(JSON.stringify({t:'ERROR',msg:'room_full'})); return; }
      const seat = r.players.length;
      r.players.push({id: m.userId||('anon-'+Date.now()), name: m.name||('Игрок-'+(seat+1)), ws});
      ws.roomId = r.id;
      ws.seat = seat;
      ws.send(JSON.stringify({t:'WELCOME', seat}));
      broadcast(r, {t:'SEATS', seats: r.players.map(p=>p?{name:p.name}:null) });
    }
    if(m.t==='START'){
      const r = ROOMS.get(ws.roomId); if(!r) return;
      const idx = r.state?.seqIdx??0;
      const mode = SEQ[idx%SEQ.length];
      const deck = shuffle(createDeck());
      const {hands,trumpSuit,trumpCard} = deal(deck, mode.N, 4);
      r.state = { seqIdx: idx+1, mode, deck, hands, trumpSuit, trumpCard, turn: (ws.seat+1)&3, leadSuit:null, trick:[], bids:[null,null,null,null], taken:[0,0,0,0]};
      for(let i=0;i<4;i++){ r.players[i]?.ws?.send(JSON.stringify({t:'HAND', seat:i, hand: hands[i]})); }
      broadcast(r,{t:'START', type:mode.type, N:mode.N, trumpSuit, trumpCard, dealer: ws.seat});
      broadcast(r,{t:'TURN', seat:r.state.turn});
    }
    if(m.t==='BID'){
      const r = ROOMS.get(ws.roomId); if(!r) return;
      const st = r.state; if(!st) return;
      st.bids[ws.seat] = m.val|0;
      broadcast(r,{t:'BID', seat: ws.seat, val: st.bids[ws.seat]});
      // no sum==N check here; kept simple
    }
    if(m.t==='PLAY'){
      const r = ROOMS.get(ws.roomId); if(!r) return;
      const st = r.state; if(!st) return;
      if(st.turn!==ws.seat){ ws.send(JSON.stringify({t:'ERROR',msg:'not_your_turn'})); return; }
      const hand = st.hands[ws.seat]||[];
      const idx = hand.findIndex(c=>c.id===m.card?.id);
      if(idx<0){ ws.send(JSON.stringify({t:'ERROR',msg:'no_card'})); return; }
      const card = hand[idx];
      if(!st.leadSuit && card.s==='J' && m.leadSuit){ st.leadSuit = m.leadSuit; }
      const ok = canPlay({hand,card,leadSuit:st.leadSuit,trump:st.trumpSuit});
      if(!ok){ ws.send(JSON.stringify({t:'ERROR',msg:'rule_violation'})); return; }
      hand.splice(idx,1);
      st.trick.push({seat: ws.seat, card});
      broadcast(r,{t:'PLAY', seat: ws.seat, card});
      if(st.trick.length===1 && card.s!=='J'){ st.leadSuit=card.s; }
      if(st.trick.length<4){
        st.turn = (st.turn+3)&3;
        broadcast(r,{t:'TURN', seat: st.turn});
      }else{
        const w = winner(st.trick, st.leadSuit, st.trumpSuit);
        st.taken[w] += 1;
        broadcast(r,{t:'TRICK_TAKEN', seat: w});
        st.trick=[]; st.leadSuit=null; st.turn=w;
        const left = st.hands.reduce((a,h)=>a+(h?h.length:0),0);
        if(left===0){
          const add = scoreHand(st.mode, st.bids, st.taken);
          broadcast(r,{t:'HAND_END', scores: add, taken: st.taken});
          // accumulate to users
          for(let i=0;i<4;i++){
            const p = r.players[i]; if(!p) continue;
            db.run(`UPDATE users SET total_score = total_score + ? WHERE nickname = ?`, [add[i]||0, p.name]);
          }
          r.state=null;
        }else{
          broadcast(r,{t:'TURN', seat: st.turn});
        }
      }
    }
  });
  ws.on('close', ()=>{
    const r = ROOMS.get(ws.roomId);
    if(r){
      if(r.players[ws.seat]) r.players[ws.seat]=null;
      broadcast(r, {t:'SEATS', seats: r.players.map(p=>p?{name:p.name}:null)});
    }
  });
});
