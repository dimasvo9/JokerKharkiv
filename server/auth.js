import express from 'express';
import { db } from './db.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

export const auth = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

function tokenFor(user){ return jwt.sign({sub:user.id, name:user.nickname}, JWT_SECRET, {expiresIn:'30d'}); }

auth.post('/register', (req,res)=>{
  const {email, password, nickname} = req.body||{};
  if(!email || !password || !nickname) return res.json({error:'missing_fields'});
  const pass = bcrypt.hashSync(password, 8);
  db.run(`INSERT INTO users(email,pass,nickname,verified) VALUES(?,?,?,1)`, [email,pass,nickname], function(err){
    if(err) return res.json({error:'email_or_nick_in_use'});
    const user = {id:this.lastID, email, nickname};
    // dev: emulate email by returning verification true
    const token = tokenFor(user);
    res.json({ok:true, token, user:{id:user.id, nickname}});
  });
});

auth.post('/login', (req,res)=>{
  const {email, password} = req.body||{};
  db.get(`SELECT * FROM users WHERE email=?`, [email], (err,row)=>{
    if(err||!row) return res.json({error:'not_found'});
    if(!bcrypt.compareSync(password, row.pass)) return res.json({error:'bad_credentials'});
    const token = tokenFor(row);
    res.json({ok:true, token, user:{id:row.id, nickname:row.nickname}});
  });
});

auth.get('/leaderboard', (_req,res)=>{
  db.all(`SELECT nickname, total_score FROM users ORDER BY total_score DESC LIMIT 50`, [], (err,rows)=>{
    if(err) return res.json({error:'db'});
    res.json({ok:true, top: rows||[]});
  });
});

export function authMiddleware(req,res,next){
  const h = req.headers.authorization||'';
  const tok = h.startsWith('Bearer ')? h.slice(7): null;
  if(!tok){ req.user=null; return next(); }
  try{
    const u = jwt.verify(tok, JWT_SECRET);
    req.user = {id:u.sub, name:u.name};
  }catch{ req.user=null; }
  next();
}
