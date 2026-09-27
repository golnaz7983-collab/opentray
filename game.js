const SUPABASE_URL = 'https://qqwifsgnzweslkcyuqmg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_AI6rSMSOAag61TCJzapLbg_frex6ks9';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const MAPS = {
  world: {label:'جهان', center:[0,12], scale:155, filter:()=>true},
  asia: {label:'آسیا', center:[92,35], scale:330, filter:f=>{const [x,y]=d3.geoCentroid(f); return x>-15 && x<180 && y>-10 && y<80}},
  europe: {label:'اروپا', center:[15,52], scale:560, filter:f=>{const [x,y]=d3.geoCentroid(f); return x>-25 && x<60 && y>30 && y<75}}
};
const COLORS = ['#22c55e','#38bdf8','#f97316','#a855f7','#f43f5e','#eab308','#14b8a6','#fb7185','#8b5cf6','#84cc16','#06b6d4','#f59e0b'];
const BOT_NAMES = ['آلفا','بتا','گاما','دلتا','سیگما','اُریون','نُوا','زِد'];
const state = {
  me:null, lobby:null, players:[], features:[], mapFeatures:[], projection:null, path:null,
  colorCanvas:null, colorCtx:null, canvas:null, ctx:null, selected:null, attackMode:false,
  chatChannel:null, lastCode:'', world:null, started:false, hostTimer:null, attackPercent:50
};

const $ = id => document.getElementById(id);
const toast = msg => {
  const el=$('toast'); el.textContent=msg; el.classList.add('show');
  clearTimeout(window.__toast); window.__toast=setTimeout(()=>el.classList.remove('show'),2600);
};
const uuid = () => crypto.randomUUID();
const saveMe = () => localStorage.setItem('opentrayPlayer',JSON.stringify(state.me));
function loadMe(){
  try{state.me=JSON.parse(localStorage.getItem('opentrayPlayer')||'null')}catch{}
  if(!state.me) state.me={key:uuid(),name:'بازیکن '+Math.floor(100+Math.random()*900),color:COLORS[0]};
}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function setScreen(name){
  document.querySelectorAll('.screen').forEach(x=>x.classList.remove('on'));
  $(name).classList.add('on');
  window.scrollTo({top:0,behavior:'smooth'});
}
function openModal(id){$(id).classList.add('show')}
function closeModal(id){$(id).classList.remove('show')}
function updateTop(){
  if($('topName')) $('topName').textContent=state.me?.name||'ورود';
  if($('topCode')) $('topCode').textContent=state.lobby ? 'کد: '+state.lobby.code : '';
  if($('leaveBtn')) $('leaveBtn').style.display=state.lobby?'inline-flex':'none';
}
function setPlayerName(){
  const n=$('nameInput').value.trim();
  if(n.length<2){toast('نام بازیکن حداقل ۲ حرف باشد');return}
  state.me.name=n.slice(0,22); saveMe(); updateTop(); closeModal('loginModal'); toast('نام ذخیره شد');
}

async function init(){
  loadMe(); updateTop();
  $('nameInput').value=state.me.name;
  bindUI();
  await loadWorld();
  await refreshLobbies();
}
async function loadWorld(){
  const urls=[
    'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',
    'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json'
  ];
  for(const url of urls){
    try{
      const r=await fetch(url,{cache:'force-cache'});
      if(!r.ok) throw new Error('HTTP '+r.status);
      const topo=await r.json();
      if(!topo?.objects?.countries) throw new Error('countries object missing');
      state.world=topo;
      state.features=topojson.feature(topo,topo.objects.countries).features;
      if($('mapLoad')) $('mapLoad').textContent='نقشه آماده است';
      return true;
    }catch(e){}
  }
  if($('mapLoad')) $('mapLoad').textContent='خطا در نقشه؛ دوباره تلاش کن';
  toast('نقشه جهان بارگذاری نشد');
  return false;
}
function bindUI(){
  $('topName').onclick=()=>openModal('loginModal');
  $('joinTop').onclick=()=>openModal('joinModal');
  $('createTop').onclick=()=>openModal('createModal');
  $('leaveBtn').onclick=leaveLobby;
  $('createBtn').onclick=createLobby;
  $('joinCodeBtn').onclick=()=>joinByCode($('joinCode').value);
  $('refreshBtn').onclick=refreshLobbies;
  $('startBtn').onclick=startGame;
  $('sendChat').onclick=sendChat;
  $('chatInput').addEventListener('keydown',e=>{if(e.key==='Enter')sendChat()});
  $('gameSend').onclick=sendGameChat;
  $('gameChatInput').addEventListener('keydown',e=>{if(e.key==='Enter')sendGameChat()});
  $('saveName').onclick=setPlayerName;
  if($('createAttackPercent')) $('createAttackPercent').oninput=()=>{$('createAttackValue').textContent=$('createAttackPercent').value+'%'};
  if($('attackPercent')) $('attackPercent').oninput=()=>{state.attackPercent=Number($('attackPercent').value);if($('attackValue'))$('attackValue').textContent=state.attackPercent+'%';if($('liveAttack'))$('liveAttack').textContent=state.attackPercent+'%';};
  document.querySelectorAll('[data-map]').forEach(b=>b.onclick=()=>selectMap(b.dataset.map));
  $('closeCreate').onclick=()=>closeModal('createModal');
  $('closeJoin').onclick=()=>closeModal('joinModal');
  $('closeLogin').onclick=()=>closeModal('loginModal');
  $('closeTrade').onclick=()=>closeModal('tradeModal');
  $('closeStats').onclick=()=>closeModal('statsModal');
  $('confirmAttack').onclick=confirmAttack;
  $('buildBtn').onclick=buildCity;
  $('anchorBtn').onclick=buildAnchor;
  $('tradeBtn').onclick=openTrade;
  $('radialCancel').onclick=hideRadial;
  $('mapCanvas').addEventListener('click',onMapClick);
  $('mapCanvas').addEventListener('mousemove',onMapMove);
  $('mapZoomOut').onclick=()=>zoomMap(0.88);
  $('mapZoomIn').onclick=()=>zoomMap(1.12);
  $('mapReset').onclick=()=>drawMap();
  $('attackTarget').addEventListener('change',renderAttackHint);
}
function selectMap(map){
  if(!MAPS[map])return;
  document.querySelectorAll('[data-map]').forEach(b=>b.classList.toggle('active',b.dataset.map===map));
  if($('mapTitle')) $('mapTitle').textContent=MAPS[map].label;
  if(state.lobby && state.lobby.status==='waiting'){
    state.lobby.map_id=map;
    $('lobbyMap').textContent=MAPS[map].label;
  }
  if($('mapCanvas')) drawMap();
}
function genCode(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s=''; for(let i=0;i<6;i++)s+=chars[Math.floor(Math.random()*chars.length)];
  return s;
}
async function createLobby(){
  const name=($('lobbyName').value.trim()||state.me.name+' لابی').slice(0,40);
  const map=$('createMap').value;
  const max=Number($('maxPlayers').value);
  const bots=Number($('botCount').value);
  const difficulty=$('botDifficulty').value;
  const randomSpawn=$('randomSpawn').checked;
  const attack=Number($('createAttackPercent')?.value||50);
  const code=genCode();
  const {data,error}=await supabase.from('opentray_lobbies').insert({
    code,name,map_id:map,max_players:max,bot_difficulty:difficulty,bot_count:Math.min(bots,max-1),
    random_spawn:randomSpawn,attack_percent:attack,status:'waiting',host_key:state.me.key
  }).select().single();
  if(error){toast('ساخت لابی ناموفق بود: '+error.message);return}
  const {error:pe}=await supabase.from('opentray_players').insert({
    lobby_id:data.id,player_key:state.me.key,player_name:state.me.name,color:state.me.color,is_bot:false
  });
  if(pe){toast('بازیکن وارد لابی نشد');await supabase.from('opentray_lobbies').delete().eq('id',data.id);return}
  state.lobby=data; state.lastCode=code;
  closeModal('createModal'); openLobby();
  toast('لابی ساخته شد؛ کد '+code);
}
async function refreshLobbies(){
  const {data,error}=await supabase.from('opentray_lobbies').select('*').eq('status','waiting').order('created_at',{ascending:false}).limit(20);
  const el=$('lobbyList');
  if(error){el.innerHTML='<div class="empty">اتصال به لابی‌ها برقرار نشد.</div>';return}
  if(!data?.length){el.innerHTML='<div class="empty">فعلاً لابی بازی در انتظار نیست. اولین لابی را بساز.</div>';return}
  el.innerHTML=data.map(l=>'<button class="lobbyRow" data-code="'+esc(l.code)+'"><div><b>'+esc(l.name)+'</b><small>'+MAPS[l.map_id]?.label+' • '+esc(l.bot_difficulty)+' • حمله '+l.attack_percent+'%</small></div><strong>'+esc(l.code)+'</strong></button>').join('');
  el.querySelectorAll('.lobbyRow').forEach(b=>b.onclick=()=>joinByCode(b.dataset.code));
}
async function joinByCode(raw){
  const code=(raw||'').trim().toUpperCase();
  if(code.length<4){toast('کد لابی را وارد کن');return}
  const {data:l,error}=await supabase.from('opentray_lobbies').select('*').eq('code',code).maybeSingle();
  if(error||!l){toast('لابی با این کد پیدا نشد');return}
  const {data:existing}=await supabase.from('opentray_players').select('*').eq('lobby_id',l.id);
  if(existing?.some(p=>p.player_key===state.me.key)){state.lobby=l;closeModal('joinModal');openLobby();return}
  if(l.status!=='waiting'){toast('این لابی بازی را شروع کرده است');return}
  if((existing?.length||0)>=l.max_players){toast('ظرفیت لابی پر است');return}
  const used=existing?.map(p=>p.color)||[];
  const color=COLORS.find(c=>!used.includes(c))||COLORS[(existing?.length||0)%COLORS.length];
  state.me.color=color;saveMe();
  const {error:pe}=await supabase.from('opentray_players').insert({
    lobby_id:l.id,player_key:state.me.key,player_name:state.me.name,color,is_bot:false
  });
  if(pe){toast('ورود به لابی ناموفق بود: '+pe.message);return}
  state.lobby=l; closeModal('joinModal'); openLobby(); toast('وارد لابی '+code+' شدی');
}
async function openLobby(){
  setScreen('lobbyScreen'); updateTop();
  $('lobbyCode').textContent=state.lobby.code;
  $('lobbyNameView').textContent=state.lobby.name;
  $('lobbyMap').textContent=MAPS[state.lobby.map_id]?.label||state.lobby.map_id;
  $('lobbySettings').textContent='ربات: '+state.lobby.bot_difficulty+' • '+state.lobby.bot_count+' • اسپان '+(state.lobby.random_spawn?'تصادفی':'ثابت')+' • حمله '+state.lobby.attack_percent+'%';
  $('hostTools').style.display=state.lobby.host_key===state.me.key?'block':'none';
  selectMap(state.lobby.map_id);
  await refreshPlayers();
  await loadChat();
  subscribeLobby();
}
async function refreshPlayers(){
  if(!state.lobby)return;
  const {data}=await supabase.from('opentray_players').select('*').eq('lobby_id',state.lobby.id).order('joined_at');
  state.players=data||[];
  if($('playerCount')) $('playerCount').textContent=state.players.length+'/'+state.lobby.max_players;
  if($('playerList')) $('playerList').innerHTML=state.players.map(p=>'<div class="playerLine"><i style="background:'+esc(p.color)+'"></i><span>'+esc(p.player_name)+(p.is_bot?' 🤖':'')+'</span><b>'+((p.player_key===state.lobby.host_key)?'میزبان':'بازیکن')+'</b></div>').join('');
}
async function loadChat(){
  if(!state.lobby)return;
  const {data}=await supabase.from('opentray_chat').select('*').eq('lobby_id',state.lobby.id).order('created_at',{ascending:true}).limit(80);
  const box=$('chat')||$('gameChat');
  if(!box)return;
  box.innerHTML=(data||[]).map(chatHtml).join('');
  box.scrollTop=box.scrollHeight;
}
function chatHtml(m){return '<div class="msg"><b>'+esc(m.player_name)+'</b><span>'+esc(m.message)+'</span></div>'}
function subscribeLobby(){
  if(state.chatChannel){supabase.removeChannel(state.chatChannel)}
  state.chatChannel=supabase.channel('opentray-lobby-'+state.lobby.id)
    .on('postgres_changes',{event:'*',schema:'public',table:'opentray_players',filter:'lobby_id=eq.'+state.lobby.id},()=>refreshPlayers())
    .on('postgres_changes',{event:'*',schema:'public',table:'opentray_lobbies',filter:'id=eq.'+state.lobby.id},payload=>{
      if(payload.new){state.lobby={...state.lobby,...payload.new}; updateTop(); if(state.lobby.status==='playing'){if(document.body.dataset.page==='game') startClientGame(); else location.href='game.html?code='+encodeURIComponent(state.lobby.code)}}
    })
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'opentray_chat',filter:'lobby_id=eq.'+state.lobby.id},payload=>{
      if($('chat')){ $('chat').insertAdjacentHTML('beforeend',chatHtml(payload.new)); $('chat').scrollTop=$('chat').scrollHeight; }
      if($('gameChat')){ $('gameChat').insertAdjacentHTML('beforeend',chatHtml(payload.new)); $('gameChat').scrollTop=$('gameChat').scrollHeight; }
    }).subscribe();
}
async function sendChat(){
  const text=$('chatInput').value.trim();
  if(!text||!state.lobby)return;
  $('chatInput').value='';
  const {error}=await supabase.from('opentray_chat').insert({lobby_id:state.lobby.id,player_key:state.me.key,player_name:state.me.name,message:text.slice(0,300)});
  if(error)toast('ارسال پیام نشد');
}
async function sendGameChat(){
  const text=$('gameChatInput').value.trim();
  if(!text||!state.lobby)return;
  $('gameChatInput').value='';
  const {error}=await supabase.from('opentray_chat').insert({lobby_id:state.lobby.id,player_key:state.me.key,player_name:state.me.name,message:text.slice(0,300)});
  if(error)toast('ارسال پیام نشد');
}
async function startGame(){
  if(!state.lobby||state.lobby.host_key!==state.me.key)return;
  const {data:players}=await supabase.from('opentray_players').select('*').eq('lobby_id',state.lobby.id).order('joined_at');
  if(!players?.length){toast('حداقل یک بازیکن لازم است');return}
  const actualBots=Math.min(state.lobby.bot_count,Math.max(0,state.lobby.max_players-players.length));
  const used=players.map(p=>p.color);
  for(let i=0;i<actualBots;i++){
    const color=COLORS.find(c=>!used.includes(c))||COLORS[(players.length+i)%COLORS.length];
    used.push(color);
    await supabase.from('opentray_players').insert({
      lobby_id:state.lobby.id,player_key:'bot-'+uuid(),player_name:BOT_NAMES[i%BOT_NAMES.length],
      color,is_bot:true
    });
  }
  const {data:all}=await supabase.from('opentray_players').select('*').eq('lobby_id',state.lobby.id).order('joined_at');
  const available=state.features.filter(f=>MAPS[state.lobby.map_id].filter(f));
  const countries={};
  available.forEach(f=>{
    const id=f.id||f.properties?.id;
    countries[id]={owner:null,troops:10+Math.floor(Math.random()*21),cities:0,anchor:false};
  });
  const roster=all||players;
  const spawnPool=state.lobby.random_spawn?shuffle([...available]):[...available];
  spawnPool.slice(0,roster.length).forEach((f,i)=>{
    const id=f.id||f.properties?.id;
    countries[id].owner=roster[i].player_key;
    countries[id].troops=55;
  });
  const gameState={version:1,map:state.lobby.map_id,countries,turn:1,updated:Date.now()};
  const {error}=await supabase.from('opentray_lobbies').update({status:'playing',game_state:gameState}).eq('id',state.lobby.id);
  if(error){toast('شروع بازی نشد: '+error.message);return}
  window.location.href='game.html?code='+encodeURIComponent(state.lobby.code);
}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
async function startClientGame(){
  if(!state.lobby?.game_state){return}
  setScreen('gameScreen'); state.started=true; hideRadial();
  $('gameCode').textContent=state.lobby.code;
  $('gameMapName').textContent=MAPS[state.lobby.map_id]?.label||'جهان';
  state.attackPercent=Number(state.lobby.attack_percent||50);
  $('liveAttack').textContent=state.attackPercent+'%';
  if($('attackPercent')) $('attackPercent').value=state.attackPercent;
  if($('attackValue')) $('attackValue').textContent=state.attackPercent+'%';
  $('mapCanvas').width=$('mapCanvas').clientWidth*devicePixelRatio;
  $('mapCanvas').height=$('mapCanvas').clientHeight*devicePixelRatio;
  $('mapCanvas').style.width='100%'; $('mapCanvas').style.height='100%';
  await refreshPlayers();
  drawMap();
  renderStats();
  loadChat();
  if(state.lobby.host_key===state.me.key && !state.hostTimer) state.hostTimer=setInterval(hostTick,5000);
}
function setupMap(){
  const c=$('mapCanvas');
  if(!c) return false;
  const rect=c.getBoundingClientRect(), dpr=devicePixelRatio||1;
  c.width=rect.width*dpr;c.height=rect.height*dpr;
  state.canvas=c;state.ctx=c.getContext('2d');state.ctx.setTransform(dpr,0,0,dpr,0,0);
  state.colorCanvas=document.createElement('canvas');state.colorCanvas.width=Math.max(1,rect.width);state.colorCanvas.height=Math.max(1,rect.height);
  state.colorCtx=state.colorCanvas.getContext('2d');
  return true;
}
function drawMap(){
  if(!state.features.length || !$('mapCanvas')) return;
  if(!state.canvas && !setupMap()) return;
  const c=state.canvas, rect=c.getBoundingClientRect(), w=rect.width,h=rect.height;
  const map=MAPS[state.lobby?.map_id||document.querySelector('[data-map].active')?.dataset.map||'world'];
  const center=map.center;
  state.projection=d3.geoNaturalEarth1().scale(map.scale*(Math.min(w,900)/900)).translate([w/2,h/2]).center(center);
  state.path=d3.geoPath(state.projection,state.ctx);
  const filtered=state.features.filter(map.filter);
  state.mapFeatures=filtered;
  const ctx=state.ctx, game=state.lobby?.game_state;
  ctx.clearRect(0,0,w,h);
  const grd=ctx.createLinearGradient(0,0,0,h);grd.addColorStop(0,'#07192d');grd.addColorStop(1,'#020b16');
  ctx.fillStyle=grd;ctx.fillRect(0,0,w,h);
  ctx.save();ctx.globalAlpha=.18;ctx.strokeStyle='#2a7cab';ctx.lineWidth=1;
  for(let x=0;x<w;x+=42){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}
  for(let y=0;y<h;y+=42){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}ctx.restore();
  const countries=game?.countries||{};
  filtered.forEach((f,i)=>{
    const id=f.id||f.properties?.id; const st=countries[id];
    ctx.beginPath();state.path(f);
    let fill='#173148';
    if(st?.owner){const p=state.players.find(x=>x.player_key===st.owner);fill=p?.color||'#64748b'}
    else if(st)fill='#24445a';
    ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=st?.owner?'#d5f3ff66':'#8eb7cc55';ctx.lineWidth=0.65;ctx.stroke();
  });
  if(state.selected){
    const f=state.mapFeatures.find(x=>(x.id||x.properties?.id)===state.selected);
    if(f){ctx.beginPath();state.path(f);ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.stroke()}
  }
  drawMarkers();
  drawColorMap(filtered);
}
function drawColorMap(filtered){
  const cc=state.colorCtx;cc.clearRect(0,0,state.colorCanvas.width,state.colorCanvas.height);
  filtered.forEach((f,i)=>{
    const n=i+1;const color='rgb('+(n&255)+','+((n>>8)&255)+','+((n>>16)&255)+')';
    cc.beginPath();state.path.context=undefined; // keep path projection only
    const p=d3.geoPath(state.projection,cc);p(f);cc.fillStyle=color;cc.fill();
  });
}
function drawMarkers(){
  if(!state.lobby?.game_state)return;
  const ctx=state.ctx, countries=state.lobby.game_state.countries;
  state.mapFeatures.forEach(f=>{
    const id=f.id||f.properties?.id, st=countries[id]; if(!st||!st.owner)return;
    const p=d3.geoCentroid(f), xy=state.projection(p); if(!xy)return;
    const owner=state.players.find(x=>x.player_key===st.owner);
    ctx.save();
    if(st.anchor){ctx.fillStyle='#f8d34d';ctx.beginPath();ctx.arc(xy[0],xy[1],7,0,Math.PI*2);ctx.fill();ctx.fillStyle='#18212d';ctx.font='10px Tahoma';ctx.textAlign='center';ctx.fillText('⚓',xy[0],xy[1]+3)}
    if(st.cities){ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(xy[0]+9,xy[1]-8,8,0,Math.PI*2);ctx.fill();ctx.fillStyle='#07121e';ctx.font='bold 10px Tahoma';ctx.textAlign='center';ctx.fillText(st.cities,xy[0]+9,xy[1]-5)}
    ctx.fillStyle='#fff';ctx.strokeStyle=owner?.color||'#fff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(xy[0],xy[1],5,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle='#dff7ff';ctx.font='bold 10px Tahoma';ctx.textAlign='center';ctx.fillText(st.troops,xy[0],xy[1]-11);
    ctx.restore();
  });
}
function onMapMove(e){
  if(!state.projection||!state.colorCtx)return;
  const r=$('mapCanvas').getBoundingClientRect();const x=e.clientX-r.left,y=e.clientY-r.top;
  const pix=state.colorCtx.getImageData(Math.max(0,x),Math.max(0,y),1,1).data;const idx=pix[0]+pix[1]*256+pix[2]*65536;
  const f=idx>0?state.mapFeatures[idx-1]:null;
  $('mapHint').textContent=f?'کشور: '+(f.properties?.name||'بدون نام'):'روی یک کشور برو';
}
function onMapClick(e){
  if(!state.lobby?.game_state)return;
  const r=$('mapCanvas').getBoundingClientRect();const x=e.clientX-r.left,y=e.clientY-r.top;
  const pix=state.colorCtx.getImageData(Math.max(0,x),Math.max(0,y),1,1).data;const idx=pix[0]+pix[1]*256+pix[2]*65536;
  const f=idx>0?state.mapFeatures[idx-1]:null;if(!f)return;
  const id=f.id||f.properties?.id;state.selected=id;
  if(state.attackMode){showAttackTarget(id);return}
  showRadial(id,x,y);
  drawMap();
}
function showRadial(id,x,y){
  const st=state.lobby.game_state.countries[id]; if(!st)return;
  const owner=state.players.find(p=>p.player_key===st.owner);
  const mine=st.owner===state.me.key;
  $('selectedName').textContent=(state.features.find(f=>(f.id||f.properties?.id)===id)?.properties?.name||'کشور');
  $('selectedInfo').textContent=(mine?'کشور تو':'کشور '+(owner?.player_name||'بی‌طرف'))+' • '+st.troops+' نیرو • '+st.cities+' شهر';
  $('radialAttack').disabled=!mine;
  $('radialAttack').textContent=mine?'⚔️ حمله':'🎯 هدف';
  $('radial').style.left=Math.min(window.innerWidth-220,Math.max(20,x+20))+'px';
  $('radial').style.top=Math.min(window.innerHeight-300,Math.max(90,y-80))+'px';
  $('radial').classList.add('show');
  $('radialAttack').onclick=()=>{if(mine){state.attackMode=true;hideRadial();$('attackPanel').classList.add('show');fillAttackTargets(id)}else toast('این کشور متعلق به تو نیست')};
}
function hideRadial(){$('radial').classList.remove('show');state.attackMode=false;$('attackPanel').classList.remove('show')}
function fillAttackTargets(fromId){
  const from=state.mapFeatures.find(f=>(f.id||f.properties?.id)===fromId);
  const [lon,lat]=d3.geoCentroid(from);
  const threshold=state.lobby.map_id==='world'?28:16;
  const candidates=state.mapFeatures.filter(f=>{
    const id=f.id||f.properties?.id, st=state.lobby.game_state.countries[id]; if(!st||id===fromId)return false;
    const [x,y]=d3.geoCentroid(f);const d=Math.hypot((x-lon)*Math.cos(lat*Math.PI/180),(y-lat));
    return d<=threshold && st.owner!==state.me.key;
  }).slice(0,18);
  $('attackTarget').innerHTML=candidates.length?candidates.map(f=>{const id=f.id||f.properties?.id;const st=state.lobby.game_state.countries[id];const op=state.players.find(p=>p.player_key===st.owner);return '<option value="'+esc(id)+'">'+esc(f.properties?.name||id)+' • '+st.troops+' نیرو • '+esc(op?.player_name||'بی‌طرف')+'</option>'}).join(''):'<option value="">همسایه قابل حمله پیدا نشد</option>';
  renderAttackHint();
}
function renderAttackHint(){
  const id=$('attackTarget').value;const st=state.lobby.game_state.countries[id];
  const from=state.lobby.game_state.countries[state.selected]; if(!st||!from){$('attackHint').textContent='کشور هدف را انتخاب کن';return}
  const send=Math.max(1,Math.floor(from.troops*Number(state.attackPercent||state.lobby.attack_percent||50)/100));
  $('attackHint').textContent='با '+send+' نیرو حمله می‌کنی؛ '+(st.troops||0)+' نیروی مدافع دارد.';
}
async function confirmAttack(){
  const fromId=state.selected,targetId=$('attackTarget').value;
  if(!fromId||!targetId){toast('هدف را انتخاب کن');return}
  const gs=clone(state.lobby.game_state), from=gs.countries[fromId], target=gs.countries[targetId];
  if(!from||from.owner!==state.me.key||!target){toast('حرکت نامعتبر است');return}
  const send=Math.max(1,Math.floor(from.troops*Number(state.attackPercent||state.lobby.attack_percent||50)/100));
  from.troops=Math.max(1,from.troops-send);
  const power=send*(0.85+Math.random()*0.45), defense=target.troops*(0.75+Math.random()*0.5);
  let won=power>=defense;
  if(won){target.owner=state.me.key;target.troops=Math.max(5,Math.floor(send*.55));target.cities=Math.max(0,target.cities);awardGold(30)}
  else target.troops=Math.max(1,target.troops-Math.max(1,Math.floor(send*.35)));
  gs.updated=Date.now();
  await saveGame(gs);
  const me=state.players.find(p=>p.player_key===state.me.key);
  if(me){await syncPlayer(me)}
  hideRadial();toast(won?'⚔️ کشور فتح شد +۳۰ طلا':'🛡️ حمله دفع شد');
  renderStats();
}
function clone(x){return JSON.parse(JSON.stringify(x))}
async function saveGame(gs){
  state.lobby.game_state=gs;
  const {error}=await supabase.from('opentray_lobbies').update({game_state:gs}).eq('id',state.lobby.id);
  if(error)toast('همگام‌سازی بازی خطا داد');
  drawMap();
}
function awardGold(amount){
  const p=state.players.find(x=>x.player_key===state.me.key);if(p)p.gold+=amount;
}
async function buildCity(){
  const id=state.selected,st=state.lobby.game_state.countries[id];if(!st||st.owner!==state.me.key)return;
  const p=state.players.find(x=>x.player_key===state.me.key);if(!p||p.gold<100){toast('برای شهر ۱۰۰ طلا لازم است');return}
  if(st.cities>=6){toast('این کشور ظرفیت شهرها را پر کرده');return}
  p.gold-=100;st.cities++;p.cities++;p.max_troops+=50;
  await syncPlayer(p);await saveGame(clone(state.lobby.game_state));toast('🏙️ شهر ساخته شد؛ ظرفیت نیرو +۵۰');renderStats();
}
async function buildAnchor(){
  const id=state.selected,st=state.lobby.game_state.countries[id];if(!st||st.owner!==state.me.key)return;
  const p=state.players.find(x=>x.player_key===state.me.key);if(!p||p.gold<120){toast('برای ساخت لنگر ۱۲۰ طلا لازم است');return}
  if(st.anchor){toast('این کشور از قبل لنگر دارد');return}
  p.gold-=120;st.anchor=true;p.anchor=true;
  await syncPlayer(p);await saveGame(clone(state.lobby.game_state));toast('⚓ لنگر ساخته شد؛ تبادل دریایی فعال شد');renderStats();
}
async function syncPlayer(p){
  const {error}=await supabase.from('opentray_players').update({troops:p.troops,max_troops:p.max_troops,gold:p.gold,cities:p.cities,anchor:p.anchor}).eq('id',p.id);
  if(error)toast('ذخیره آمار بازیکن خطا داد');
}
function openTrade(){
  const myAnchor=Object.values(state.lobby.game_state.countries).some(x=>x.owner===state.me.key&&x.anchor);
  if(!myAnchor){toast('اول در یک کشور خودت لنگر بساز');return}
  const targets=state.players.filter(p=>p.player_key!==state.me.key&&p.anchor);
  $('tradeList').innerHTML=targets.length?targets.map(p=>'<button class="tradeRow" data-key="'+esc(p.player_key)+'">⚓ '+esc(p.player_name)+'<small>ارسال کشتی • ۲۰ طلا</small></button>').join(''):'<div class="empty">بازیکن دیگری هنوز لنگر ندارد.</div>';
  $('tradeList').querySelectorAll('.tradeRow').forEach(b=>b.onclick=()=>sendShip(b.dataset.key));
  openModal('tradeModal');
}
async function sendShip(targetKey){
  const me=state.players.find(p=>p.player_key===state.me.key),target=state.players.find(p=>p.player_key===targetKey);
  if(!me||!target||me.gold<20){toast('طلا کافی نیست');return}
  const source=Object.entries(state.lobby.game_state.countries).find(([id,s])=>s.owner===me.key&&s.anchor);
  const dest=Object.entries(state.lobby.game_state.countries).find(([id,s])=>s.owner===target.key&&s.anchor);
  if(!source||!dest){toast('لنگر مبدا یا مقصد پیدا نشد');return}
  me.gold-=20;await syncPlayer(me);closeModal('tradeModal');
  animateShip(source[0],dest[0],async()=>{
    target.gold+=50;await syncPlayer(target);toast('🚢 کشتی رسید؛ '+target.player_name+' پنجاه طلا دریافت کرد');
  });
}
function animateShip(a,b,done){
  const af=state.mapFeatures.find(f=>(f.id||f.properties?.id)===a),bf=state.mapFeatures.find(f=>(f.id||f.properties?.id)===b);
  if(!af||!bf){done();return}
  const p1=state.projection(d3.geoCentroid(af)),p2=state.projection(d3.geoCentroid(bf));
  const ship=document.createElement('div');ship.className='ship';ship.textContent='🚢';$('mapWrap').appendChild(ship);
  const start=performance.now(),dur=2300;
  function step(t){const q=Math.min(1,(t-start)/dur),e=q*q*(3-2*q),x=p1[0]+(p2[0]-p1[0])*e,y=p1[1]+(p2[1]-p1[1])*e;ship.style.transform='translate('+(x-14)+'px,'+(y-14)+'px)';if(q<1)requestAnimationFrame(step);else{ship.remove();done()}}
  requestAnimationFrame(step);
}
async function hostTick(){
  if(!state.lobby?.game_state||state.lobby.host_key!==state.me.key)return;
  const gs=clone(state.lobby.game_state);
  for(const p of state.players){
    const owned=Object.values(gs.countries||{}).filter(c=>c.owner===p.player_key);
    const cap=Math.max(20,p.max_troops||100);
    const total=owned.reduce((n,c)=>n+(c.troops||0),0);
    p.troops=total;
    const room=Math.max(0,cap-total);
    let left=room;
    owned.forEach(c=>{if(left>0){const add=Math.min(left,1+(c.cities||0));c.troops=(c.troops||0)+add;left-=add}});
    if(p.cities>0){p.gold+=p.cities*2;await syncPlayer(p)}
  }
  await saveGame(gs);
  await botTick();
}
async function botTick(){
  if(!state.lobby?.game_state||state.lobby.host_key!==state.me.key)return;
  const gs=clone(state.lobby.game_state);
  for(const bot of state.players.filter(p=>p.is_bot)){
    const mine=Object.entries(gs.countries).filter(([id,s])=>s.owner===bot.player_key);
    if(!mine.length)continue;
    mine.forEach(([id,s])=>{s.troops=Math.min(100+s.cities*50,s.troops+1+s.cities)});
    const fromEntry=mine.sort((a,b)=>b[1].troops-a[1].troops)[0]; if(!fromEntry||fromEntry[1].troops<18)continue;
    const fromF=state.mapFeatures.find(f=>(f.id||f.properties?.id)===fromEntry[0]); if(!fromF)continue;
    const [lon,lat]=d3.geoCentroid(fromF),threshold=state.lobby.map_id==='world'?28:16;
    const targets=state.mapFeatures.map(f=>[f,d3.geoCentroid(f)]).filter(([f,c])=>{
      const id=f.id||f.properties?.id,s=gs.countries[id];if(!s||s.owner===bot.player_key)return false;
      const d=Math.hypot((c[0]-lon)*Math.cos(lat*Math.PI/180),(c[1]-lat));return d<=threshold;
    });
    if(targets.length&&Math.random()<(state.lobby.bot_difficulty==='hard'?.85:state.lobby.bot_difficulty==='normal'?.55:.35)){
      const [tf]=targets[Math.floor(Math.random()*targets.length)],tid=tf.id||tf.properties?.id,target=gs.countries[tid];
      const send=Math.max(2,Math.floor(fromEntry[1].troops*.45));fromEntry[1].troops-=send;
      if(send*(.8+Math.random()*.5)>=target.troops*(.75+Math.random()*.4)){target.owner=bot.player_key;target.troops=Math.max(5,Math.floor(send*.5))}
      else target.troops=Math.max(1,target.troops-Math.floor(send*.3));
    }
  }
  gs.updated=Date.now();await saveGame(gs);
  await refreshPlayers();
}
function renderStats(){
  const p=state.players.find(x=>x.player_key===state.me.key);if(!p)return;
  $('gold').textContent=p.gold;$('troops').textContent=p.troops+'/'+p.max_troops;$('cities').textContent=p.cities;$('anchor').textContent=p.anchor?'فعال':'خاموش';
  const mine=Object.values(state.lobby?.game_state?.countries||{}).filter(x=>x.owner===state.me.key).length;
  $('owned').textContent=mine;
  const html=state.players.map(x=>{
    const own=Object.values(state.lobby.game_state.countries||{}).filter(c=>c.owner===x.player_key).length;
    return '<div class="scoreRow"><i style="background:'+esc(x.color)+'"></i><b>'+esc(x.player_name)+'</b><span>'+own+' کشور</span><strong>'+x.gold+' 🪙</strong></div>'
  }).sort((a,b)=>b.localeCompare(a)).join('');
  if($('leaderboard')) $('leaderboard').innerHTML=html;
  if($('leaderboardModal')) $('leaderboardModal').innerHTML=html;
}
function showAttackTarget(id){
  state.selected=id; hideRadial();$('attackPanel').classList.add('show');fillAttackTargets(id);
}
function zoomMap(f){if(!state.projection)return;const m=MAPS[state.lobby?.map_id||'world'];m.scale*=f;drawMap()}
async function leaveLobby(){
  if(state.lobby){
    await supabase.from('opentray_players').delete().eq('lobby_id',state.lobby.id).eq('player_key',state.me.key);
    if(state.lobby.host_key===state.me.key && state.lobby.status==='waiting') await supabase.from('opentray_lobbies').delete().eq('id',state.lobby.id);
    if(state.chatChannel){await supabase.removeChannel(state.chatChannel);state.chatChannel=null}
  }
  state.lobby=null;state.started=false;state.selected=null;
  if(state.hostTimer){clearInterval(state.hostTimer);state.hostTimer=null}
  updateTop();setScreen('homeScreen');refreshLobbies();toast('از لابی خارج شدی');
}
window.addEventListener('resize',()=>{if(state.started){setupMap();drawMap()}});
document.addEventListener('DOMContentLoaded',init);


/* Open Tray stability layer: home lobby + dedicated game page */
function onEl(id,event,fn){
  const el=$(id);
  if(el) el.addEventListener(event,fn);
}
function enterGameFullscreen(){
  const target=document.documentElement;
  if(target.requestFullscreen){
    target.requestFullscreen({navigationUI:'hide'}).catch(()=>{});
  }
}
function setupGamePage(){
  loadMe();
  const code=(new URLSearchParams(location.search).get('code')||'').trim().toUpperCase();
  if(!code){ location.href='index.html'; return; }
  if($('statsBtn')) $('statsBtn').onclick=()=>{openModal('statsModal');renderStats()};
  if($('fullscreenBtn')) $('fullscreenBtn').onclick=enterGameFullscreen;
  if($('startFullscreen')) $('startFullscreen').onclick=async()=>{enterGameFullscreen();closeModal('fullscreenGate');$('fullscreenGate').classList.remove('show')};
  if($('leaveGameBtn')) $('leaveGameBtn').onclick=leaveLobby;
  if($('closeStats')) $('closeStats').onclick=()=>closeModal('statsModal');
  if($('closeTrade')) $('closeTrade').onclick=()=>closeModal('tradeModal');
  if($('cancelAttack')) $('cancelAttack').onclick=hideRadial;
  onEl('gameSend','click',sendGameChat);
  onEl('gameChatInput','keydown',e=>{if(e.key==='Enter')sendGameChat()});
  onEl('confirmAttack','click',confirmAttack);
  onEl('buildBtn','click',buildCity);
  onEl('anchorBtn','click',buildAnchor);
  onEl('tradeBtn','click',openTrade);
  onEl('radialCancel','click',hideRadial);
  onEl('mapCanvas','click',onMapClick);
  onEl('mapCanvas','mousemove',onMapMove);
  onEl('mapZoomOut','click',()=>zoomMap(.88));
  onEl('mapZoomIn','click',()=>zoomMap(1.12));
  onEl('mapReset','click',()=>drawMap());
  onEl('attackTarget','change',renderAttackHint);
  if($('attackPercent')) $('attackPercent').oninput=()=>{state.attackPercent=Number($('attackPercent').value);$('attackValue').textContent=state.attackPercent+'%';$('liveAttack').textContent=state.attackPercent+'%'};
  $('fullscreenGate')?.classList.add('show');
  fetchLobbyForGame(code);
}
async function fetchLobbyForGame(code){
  const {data:l,error}=await supabase.from('opentray_lobbies').select('*').eq('code',code).maybeSingle();
  if(error||!l){toast('این لابی پیدا نشد');setTimeout(()=>location.href='index.html',900);return}
  state.lobby=l;state.lastCode=code;
  updateTop();
  await loadWorld();
  subscribeLobby();
  if(l.status==='playing' && l.game_state){startClientGame();}
  else toast('در انتظار شروع بازی توسط میزبان...');
}
function bindUI(){
  onEl('topName','click',()=>openModal('loginModal'));
  onEl('joinTop','click',()=>openModal('joinModal'));
  onEl('createTop','click',()=>openModal('createModal'));
  onEl('leaveBtn','click',leaveLobby);
  onEl('createBtn','click',createLobby);
  onEl('joinCodeBtn','click',()=>joinByCode($('joinCode')?.value));
  onEl('refreshBtn','click',refreshLobbies);
  onEl('startBtn','click',startGame);
  onEl('sendChat','click',sendChat);
  onEl('chatInput','keydown',e=>{if(e.key==='Enter')sendChat()});
  onEl('saveName','click',setPlayerName);
  onEl('createAttackPercent','input',()=>{$('createAttackValue').textContent=$('createAttackPercent').value+'%'});
  onEl('attackPercent','input',()=>{state.attackPercent=Number($('attackPercent').value);if($('attackValue'))$('attackValue').textContent=state.attackPercent+'%';if($('liveAttack'))$('liveAttack').textContent=state.attackPercent+'%'});
  document.querySelectorAll('[data-map]').forEach(b=>b.onclick=()=>selectMap(b.dataset.map));
  onEl('closeCreate','click',()=>closeModal('createModal'));
  onEl('closeJoin','click',()=>closeModal('joinModal'));
  onEl('closeLogin','click',()=>closeModal('loginModal'));
  onEl('closeTrade','click',()=>closeModal('tradeModal'));
  onEl('closeStats','click',()=>closeModal('statsModal'));
  onEl('confirmAttack','click',confirmAttack);
  onEl('buildBtn','click',buildCity);
  onEl('anchorBtn','click',buildAnchor);
  onEl('tradeBtn','click',openTrade);
  onEl('radialCancel','click',hideRadial);
  onEl('mapCanvas','click',onMapClick);
  onEl('mapCanvas','mousemove',onMapMove);
  onEl('mapZoomOut','click',()=>zoomMap(.88));
  onEl('mapZoomIn','click',()=>zoomMap(1.12));
  onEl('mapReset','click',()=>drawMap());
  onEl('attackTarget','change',renderAttackHint);
}
async function init(){
  loadMe();
  if(document.body.dataset.page==='game'){setupGamePage();return;}
  updateTop();
  if($('nameInput')) $('nameInput').value=state.me.name;
  bindUI();
  await loadWorld();
  await refreshLobbies();
}
function leaveLobby(){
  const old=state.lobby;
  (async()=>{
    if(old){
      await supabase.from('opentray_players').delete().eq('lobby_id',old.id).eq('player_key',state.me.key);
      if(old.host_key===state.me.key && old.status==='waiting') await supabase.from('opentray_lobbies').delete().eq('id',old.id);
      if(state.chatChannel){await supabase.removeChannel(state.chatChannel);state.chatChannel=null}
    }
    state.lobby=null;state.started=false;state.selected=null;
    if(state.hostTimer){clearInterval(state.hostTimer);state.hostTimer=null}
    if(document.body.dataset.page==='game'){location.href='index.html';return;}
    updateTop();setScreen('homeScreen');refreshLobbies();toast('از لابی خارج شدی');
  })();
}
window.addEventListener('resize',()=>{if(state.started && $('mapCanvas')){setupMap();drawMap()}});
document.addEventListener('DOMContentLoaded',init);
