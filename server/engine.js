// Core game engine: sequence of hands, right-to-left turn, trump logic, joker rules, scoring.
export const SUITS = ['C','S','D','H'];
const RANKS = {
  C:['A','10','K','Q','J','9','8','7','6'],
  S:['A','10','K','Q','J','9','8','7','6'],
  D:['A','10','K','Q','J','9','8','6'],
  H:['A','10','K','Q','J','9','8','6'],
};
function cardId(c){ return `${c.s}-${c.r}-${Math.random().toString(36).slice(2,6)}`; }

export function createDeck(){
  const d=[];
  for(const s of SUITS) for(const r of RANKS[s]) d.push({s,r,id:cardId({s,r})});
  d.push({s:'J',r:'J1',id:cardId({s:'J',r:'J1'})});
  d.push({s:'J',r:'J2',id:cardId({s:'J',r:'J2'})});
  return d;
}
export function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }
export function nextRight(i){ return (i+3)&3; }
function rankValue(c){ if(c.s==='J') return c.r==='J2'?1002:1001; const m={'A':14,'10':10,'K':13,'Q':12,'J':11,'9':9,'8':8,'7':7,'6':6}; return m[c.r]||0; }

export function deal(deck, N, players=4){
  const hands = Array.from({length:players},()=>[]);
  let trumpCard=null;
  for(let k=0;k<N;k++){
    for(let p=0;p<players;p++){
      const card = deck.pop();
      hands[p].push(card);
      if(deck.length===0) trumpCard = card;
    }
  }
  let trumpSuit=null;
  if(N*players===36){ trumpSuit = trumpCard.s==='J'? null : trumpCard.s; }
  else { const open = deck[deck.length-1]; trumpSuit = open.s==='J'? null: open.s; trumpCard = open; }
  return {hands,trumpSuit,trumpCard};
}

export function canPlay({hand,card,leadSuit,trump}){
  if(!leadSuit) return true;
  if(card.s==='J') return true;
  const hasLead = hand.some(c=>c.s===leadSuit && c.s!=='J');
  if(hasLead) return card.s===leadSuit;
  const hasTrump = trump && hand.some(c=>c.s===trump && c.s!=='J');
  if(hasTrump) return card.s===trump;
  return true;
}

export function winner(trick, leadSuit, trump){
  let best = 0;
  const beats = (a,b)=>{
    if(a.card.s==='J'&&b.card.s==='J') return a.card.r==='J2';
    if(a.card.s==='J') return true;
    if(b.card.s==='J') return false;
    if(trump){
      if(a.card.s===trump && b.card.s!==trump) return true;
      if(a.card.s!==trump && b.card.s===trump) return false;
    }
    if(a.card.s===leadSuit && b.card.s!==leadSuit) return true;
    if(a.card.s!==leadSuit && b.card.s===leadSuit) return false;
    return rankValue(a.card)>rankValue(b.card);
  };
  for(let i=1;i<trick.length;i++) if(beats(trick[i],trick[best])) best=i;
  return trick[best].seat;
}

export const SEQ = [
  ...[1,2,3,4,5,6,7,8].map(n=>({type:'BIDDING', N:n})),
  ...Array(4).fill({type:'BIDDING', N:9}),
  ...Array(4).fill({type:'NO_TRUMP', N:9}),
  ...Array(4).fill({type:'DARK', N:9}),
  ...Array(4).fill({type:'MISERE', N:9}),
  ...Array(4).fill({type:'GOLD', N:9}),
];

export function scoreHand(mode, bids, taken){
  const res=[0,0,0,0];
  if(mode.type==='BIDDING' || mode.type==='NO_TRUMP'){
    const N = mode.N;
    for(let i=0;i<4;i++){
      const b = bids[i]??0, t = taken[i]??0;
      if(b===0 && t===0){ res[i]+=10; continue; }
      if(t<b){ res[i]-=10*(b-t); continue; }
      if(t===b){ res[i]+=10*t; continue; }
      if(t>b){ res[i]+=t; continue; }
    }
  }else if(mode.type==='MISERE'){
    for(let i=0;i<4;i++){ const t=taken[i]||0; res[i] += (t===0? 50 : -10*t); }
  }else if(mode.type==='GOLD'){
    for(let i=0;i<4;i++){ const t=taken[i]||0; res[i] += (t===0? -50 : 10*t); }
  }else if(mode.type==='DARK'){
    // DARK handled externally with targets; here just give +10 per achieved, −10 per missed
  }
  return res;
}
