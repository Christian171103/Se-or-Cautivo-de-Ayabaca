const $ = (q) => document.querySelector(q);

let songs = [];
let tubes = [];
let currentSong = null;
let currentRecord = null;

const ROW_TOP = "superior";
const ROW_BOTTOM = "inferior";

function tubeHeight(position, row) {
  const max = row === ROW_TOP ? 12 : 11;
  const minH = 82;
  const maxH = 205;
  const ratio = (Number(position) - 1) / (max - 1);
  return Math.round(minH + ratio * (maxH - minH)); // pequeño -> grande
}

function tubeCode(tube) {
  return Number(tube?.posicion || tube?.numero || 0);
}

function tubeDisplayNote(tube) {
  if (!tube?.nota) return "—";
  const spanish = {
    C:"Do","C#":"Do#",
    D:"Re","D#":"Re#",
    E:"Mi",F:"Fa","F#":"Fa#",
    G:"Sol","G#":"Sol#",
    A:"La","A#":"La#",
    B:"Si"
  };
  const m = String(tube.nota).match(/^([A-G](?:#)?)(\d+)?$/);
  if (!m) return tube.nota;
  return spanish[m[1]] || m[1];
}

function renderTube(tube, rowClass="") {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `z-pipe ${rowClass}`;
  btn.style.height = `${tubeHeight(tube.posicion, tube.fila)}px`;
  btn.dataset.id = tube.id;
  btn.dataset.fila = tube.fila;
  btn.dataset.tubo = String(tubeCode(tube));

  btn.innerHTML = `
    <span class="z-pipe-hole"></span>
    <span class="z-pipe-number">${tubeCode(tube)}</span>
    <span class="z-pipe-note">${tubeDisplayNote(tube)}</span>
    <small>${tube.nota || ""}</small>
  `;

  btn.addEventListener("click", () => playTube(tube, true));
  return btn;
}

function renderInstrument() {
  const top = $("#upperRow");
  const bottom = $("#lowerRow");
  top.replaceChildren();
  bottom.replaceChildren();

  tubes
    .filter(t => t.fila === ROW_TOP)
    .sort((a,b) => Number(a.posicion)-Number(b.posicion))
    .forEach(t => top.append(renderTube(t,"is-top")));

  tubes
    .filter(t => t.fila === ROW_BOTTOM)
    .sort((a,b) => Number(a.posicion)-Number(b.posicion))
    .forEach(t => bottom.append(renderTube(t,"is-bottom")));
}

function highlightTube(tube) {
  document.querySelectorAll(".z-pipe").forEach(x => x.classList.remove("is-active"));
  const el = document.querySelector(`.z-pipe[data-id="${tube.id}"]`);
  if (!el) return;
  el.classList.add("is-active");
  setTimeout(() => el.classList.remove("is-active"), 500);
}

let zAudioCtx=null;
let zMasterGain=null;
let zCompressor=null;
let zNoiseBuffer=null;
let zActiveVoices=new Set();

async function ensureZAudio(){
  if(!zAudioCtx || zAudioCtx.state==="closed"){
    const Ctx=window.AudioContext||window.webkitAudioContext;
    zAudioCtx=new Ctx();
    zMasterGain=zAudioCtx.createGain();
    zMasterGain.gain.value=1.55;
    zCompressor=zAudioCtx.createDynamicsCompressor();
    zCompressor.threshold.value=-18;
    zCompressor.knee.value=18;
    zCompressor.ratio.value=4;
    zCompressor.attack.value=.003;
    zCompressor.release.value=.13;
    zMasterGain.connect(zCompressor).connect(zAudioCtx.destination);
    const length=Math.max(1,Math.floor(zAudioCtx.sampleRate*.5));
    zNoiseBuffer=zAudioCtx.createBuffer(1,length,zAudioCtx.sampleRate);
    const data=zNoiseBuffer.getChannelData(0);
    for(let i=0;i<length;i++) data[i]=Math.random()*2-1;
  }
  if(zAudioCtx.state==="suspended") await zAudioCtx.resume();
  return zAudioCtx;
}

function stopZAudioVoices(){
  zActiveVoices.forEach(v=>{try{v.stop();}catch{}});
  zActiveVoices.clear();
}

function startZamponaVoice(freq,durationSec=.55){
  const ctx=zAudioCtx;
  const f=Number(freq);
  if(!ctx || !f || !Number.isFinite(f)) return null;
  const now=ctx.currentTime;
  const dur=Math.max(.08,Number(durationSec)||.55);
  const release=Math.min(.09,Math.max(.035,dur*.18));
  const voiceGain=ctx.createGain();
  const body=ctx.createBiquadFilter();
  body.type="lowpass";
  body.frequency.setValueAtTime(Math.min(4200,Math.max(1500,f*6.2)),now);
  body.Q.value=.55;
  voiceGain.gain.setValueAtTime(.0001,now);
  voiceGain.gain.exponentialRampToValueAtTime(.46,now+.018);
  if(dur>.12) voiceGain.gain.exponentialRampToValueAtTime(.33,now+Math.min(.11,dur*.35));
  voiceGain.gain.setValueAtTime(.33,now+Math.max(.035,dur-release));
  voiceGain.gain.exponentialRampToValueAtTime(.0001,now+dur);
  body.connect(voiceGain).connect(zMasterGain);
  const nodes=[];
  [
    {mul:1,gain:.72,detune:-2.5},
    {mul:1,gain:.38,detune:2.5},
    {mul:2,gain:.17,detune:0},
    {mul:3,gain:.075,detune:1.2},
    {mul:4,gain:.032,detune:-1}
  ].forEach(p=>{
    const osc=ctx.createOscillator(),g=ctx.createGain();
    osc.type="sine";osc.frequency.setValueAtTime(f*p.mul,now);osc.detune.setValueAtTime(p.detune,now);g.gain.value=p.gain;
    osc.connect(g).connect(body);osc.start(now);osc.stop(now+dur+.025);nodes.push(osc);
  });
  const noise=ctx.createBufferSource();noise.buffer=zNoiseBuffer;noise.loop=true;
  const noiseFilter=ctx.createBiquadFilter();noiseFilter.type="bandpass";
  noiseFilter.frequency.setValueAtTime(Math.min(4800,Math.max(900,f*3.2)),now);noiseFilter.Q.value=.75;
  const noiseGain=ctx.createGain();noiseGain.gain.setValueAtTime(.0001,now);
  noiseGain.gain.exponentialRampToValueAtTime(.085,now+.012);
  noiseGain.gain.exponentialRampToValueAtTime(.028,now+.075);
  noiseGain.gain.setValueAtTime(.028,now+Math.max(.08,dur-release));
  noiseGain.gain.exponentialRampToValueAtTime(.0001,now+dur);
  noise.connect(noiseFilter).connect(noiseGain).connect(zMasterGain);noise.start(now);noise.stop(now+dur+.02);nodes.push(noise);
  const voice={stop(){nodes.forEach(n=>{try{n.stop();}catch{}});try{voiceGain.gain.cancelScheduledValues(ctx.currentTime);voiceGain.gain.setValueAtTime(.0001,ctx.currentTime);}catch{}zActiveVoices.delete(voice);}};
  zActiveVoices.add(voice);setTimeout(()=>zActiveVoices.delete(voice),(dur+.15)*1000);return voice;
}

async function playZamponaTone(freq,durationSec=.55){
  await ensureZAudio();
  return startZamponaVoice(freq,durationSec);
}

function synth(freq,duration=.72){ return playZamponaTone(freq,duration); }

async function playTube(tube,highlight=false,duration=1){
  if(!tube)return;
  if(highlight)highlightTube(tube);
  await playZamponaTone(tube.frecuencia,.58*Math.max(.35,Number(duration)||1));
}

function findTube(fila, numero) {
  return tubes.find(t => t.fila === fila && tubeCode(t) === Number(numero));
}

function legacyToStructure(secciones) {
  const labels = {intro:"Intro",verso:"Verso",coro:"Coro",puente:"Puente",final:"Final"};
  const result = [];
  Object.entries(labels).forEach(([key,label]) => {
    const raw = secciones?.[key];
    if (!raw) return;

    let values = [];
    let comment = "";

    if (Array.isArray(raw)) values = raw;
    else if (typeof raw === "object") {
      comment = String(raw.comentario || "");
      if (Array.isArray(raw.eventos)) {
        result.push({
          id:`legacy-${key}`,
          tipo:"parte",
          nombre:label,
          comentario:comment,
          eventos:raw.eventos.map(ev => normalizeEvent(ev)).filter(Boolean)
        });
        return;
      }
    }

    if (values.length || comment) {
      result.push({
        id:`legacy-${key}`,
        tipo:"parte",
        nombre:label,
        comentario:comment,
        eventos: values.map(v => {
          const n = Number(v);
          return Number.isFinite(n)
            ? {tipo:"nota", fila:ROW_TOP, tubo:n, duracion:1}
            : null;
        }).filter(Boolean)
      });
    }
  });
  return result;
}

function normalizeEvent(ev) {
  if (!ev) return null;

  if (ev.tipo === "separador") return {tipo:"separador"};

  if (ev.tipo === "arrastre" && ev.desde && ev.hasta) {
    return {
      tipo:"arrastre",
      desde:{fila:ev.desde.fila, tubo:Number(ev.desde.tubo)},
      hasta:{fila:ev.hasta.fila, tubo:Number(ev.hasta.tubo)},
      duracion:Number(ev.duracion)||1
    };
  }

  if (ev.tipo === "nota") {
    return {
      tipo:"nota",
      fila:ev.fila || ROW_TOP,
      tubo:Number(ev.tubo),
      duracion:Number(ev.duracion)||1
    };
  }

  if (typeof ev === "object" && ev.tubo != null) {
    return {
      tipo:"nota",
      fila:ev.fila || ROW_TOP,
      tubo:Number(ev.tubo),
      duracion:Number(ev.duracion)||1
    };
  }

  return null;
}

function getStructure(record) {
  const raw = record?.secciones || {};
  if (Array.isArray(raw.estructura)) {
    return raw.estructura.map(item => {
      if (item.tipo === "divisor") {
        return {
          id:item.id || crypto.randomUUID(),
          tipo:"divisor",
          texto:String(item.texto || item.comentario || "")
        };
      }
      return {
        id:item.id || crypto.randomUUID(),
        tipo:"parte",
        nombre:String(item.nombre || "Parte"),
        comentario:String(item.comentario || ""),
        eventos:(item.eventos || []).map(normalizeEvent).filter(Boolean)
      };
    });
  }
  return legacyToStructure(raw);
}


function eventPoints(events) {
  const pts = [];
  events.forEach((ev,eventIndex) => {
    if (!ev) return;
    if (ev.tipo === "separador") {
      pts.push({kind:"separator",eventIndex,ev});
      return;
    }
    if (ev.tipo === "arrastre") {
      pts.push({kind:"drag-start",fila:ev.desde.fila,tubo:ev.desde.tubo,ev,eventIndex,halfGroup:null});
      pts.push({kind:"drag-end",fila:ev.hasta.fila,tubo:ev.hasta.tubo,ev,eventIndex,halfGroup:null});
      return;
    }
    pts.push({kind:"note",fila:ev.fila,tubo:ev.tubo,ev,eventIndex,halfGroup:null});
  });

  let halfCounter = 0;
  for (let i=0;i<pts.length-1;i++) {
    const a=pts[i], b=pts[i+1];
    if (
      a.kind==="note" &&
      b.kind==="note" &&
      Number(a.ev?.duracion)===0.5 &&
      Number(b.ev?.duracion)===0.5
    ) {
      const id=`half-${halfCounter++}`;
      a.halfGroup=id; b.halfGroup=id; i++;
    }
  }
  return pts;
}

function renderNotation(events,blockId="") {
  const points = eventPoints(events);
  const unit = 43, separatorGap = 46, pad = 24;
  const yTop = 42, yBottom = 112, height = 165;

  let cursor = pad;
  const positioned = [];
  points.forEach(p => {
    if (p.kind === "separator") {
      cursor += separatorGap;
      positioned.push({...p,x:cursor});
      cursor += separatorGap * .35;
    } else {
      positioned.push({...p,x:cursor});
      cursor += unit;
    }
  });

  const width = Math.max(520, cursor + pad);
  const wrap = document.createElement("div");
  wrap.className = "z-notation-scroll";

  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS,"svg");
  svg.setAttribute("class","z-notation");
  svg.setAttribute("viewBox",`0 0 ${width} ${height}`);
  svg.setAttribute("width",width);
  svg.setAttribute("height",height);

  const defs = document.createElementNS(NS,"defs");
  defs.innerHTML = `
    <marker id="zArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
      <path d="M0,0 L8,4 L0,8 Z" fill="#382052"></path>
    </marker>`;
  svg.append(defs);

  const yFor = p => p.fila===ROW_TOP ? yTop : yBottom;

  function prevRealIndex(index) {
    for (let i=index-1;i>=0;i--) {
      if (positioned[i].kind === "separator") return -1;
      return i;
    }
    return -1;
  }

  // Flecha SOLO cuando cambia de fila.
  for (let i=1;i<positioned.length;i++) {
    const b=positioned[i];
    if (b.kind==="separator") continue;
    const ai=prevRealIndex(i);
    if (ai<0) continue;
    const a=positioned[ai];

    const sameDrag = a.ev===b.ev && a.ev?.tipo==="arrastre";
    if (sameDrag) {
      const path=document.createElementNS(NS,"path");
      const Ay=yFor(a), By=yFor(b), mid=(a.x+b.x)/2;
      const curveY=Math.max(Ay,By)+28;
      path.setAttribute("d",`M ${a.x+12} ${Ay+8} Q ${mid} ${curveY} ${b.x-12} ${By+8}`);
      path.setAttribute("class","z-drag-path");
      svg.append(path);
    } else if (a.fila !== b.fila) {
      const line=document.createElementNS(NS,"line");
      line.setAttribute("x1",a.x+12); line.setAttribute("y1",yFor(a));
      line.setAttribute("x2",b.x-15); line.setAttribute("y2",yFor(b));
      line.setAttribute("class","z-transition-line");
      line.setAttribute("marker-end","url(#zArrow)");
      svg.append(line);
    }
  }

  // Sombrerito para pares consecutivos de medio tiempo.
  const groups = new Map();
  positioned.forEach(p=>{
    if(!p.halfGroup) return;
    if(!groups.has(p.halfGroup)) groups.set(p.halfGroup,[]);
    groups.get(p.halfGroup).push(p);
  });

  groups.forEach(group=>{
    if(group.length!==2) return;
    const [a,b]=group;
    const topY=Math.min(yFor(a),yFor(b))-24;
    const path=document.createElementNS(NS,"path");
    const mid=(a.x+b.x)/2;
    path.setAttribute("d",`M ${a.x-10} ${topY+8} Q ${mid} ${topY-9} ${b.x+10} ${topY+8}`);
    path.setAttribute("class","z-half-time-hat");
    svg.append(path);
  });

  positioned.forEach(p=>{
    if(p.kind==="separator") {
      const marker=document.createElementNS(NS,"line");
      marker.setAttribute("x1",p.x); marker.setAttribute("x2",p.x);
      marker.setAttribute("y1",25); marker.setAttribute("y2",135);
      marker.setAttribute("class","z-phrase-divider");
      svg.append(marker);
      return;
    }
    const y=yFor(p);
    const t=document.createElementNS(NS,"text");
    t.setAttribute("x",p.x); t.setAttribute("y",y+6);
    t.setAttribute("text-anchor","middle");
    t.setAttribute("class","z-notation-number");
    t.dataset.blockId=String(blockId||"");
    t.dataset.eventIndex=String(p.eventIndex ?? "");
    t.dataset.fila=p.fila||"";
    t.dataset.tubo=String(p.tubo ?? "");
    t.textContent=p.tubo;
    svg.append(t);

    if(Number(p.ev?.duracion)!==1 && Number(p.ev?.duracion)!==0.5 && p.kind!=="drag-end") {
      const d=document.createElementNS(NS,"text");
      d.setAttribute("x",p.x); d.setAttribute("y",y-18);
      d.setAttribute("text-anchor","middle");
      d.setAttribute("class","z-duration-label");
      d.textContent=`×${p.ev.duracion}`;
      svg.append(d);
    }
  });

  wrap.append(svg);
  return wrap;
}


function renderStructure(record) {
  const host=$("#publicStructure");
  host.replaceChildren();
  const structure=getStructure(record);

  structure.forEach(item=>{
    if(item.tipo==="divisor"){
      const div=document.createElement("div");
      div.className="z-divider";
      div.innerHTML=`<span></span><strong>${item.texto || "Comentario"}</strong><span></span>`;
      host.append(div);
      return;
    }

    const section=document.createElement("section");
    section.className="z-part";

    const side=document.createElement("div");
    side.className="z-part-label";
    side.innerHTML=`<strong>${item.nombre}</strong>${item.comentario?`<small>${item.comentario}</small>`:""}`;

    const score=document.createElement("div");
    score.className="z-part-score";
    score.append(renderNotation(item.eventos,item.id));

    section.append(side,score);
    host.append(section);
  });

  if (!structure.length) {
    const empty=document.createElement("div");
    empty.className="z-empty-score";
    empty.textContent="Aún no se registraron partes para esta canción.";
    host.append(empty);
  }
}

let zPlaybackRunId=0;

function publicSpeed(){return Math.max(.5,Math.min(3,Number($("#playbackSpeed")?.value)||1));}
function stopZPlayback(){
  zPlaybackRunId++;
  stopZAudioVoices();
  document.querySelectorAll(".is-playing").forEach(x=>x.classList.remove("is-playing"));
}
function waitZ(ms,id){return new Promise(r=>setTimeout(()=>r(id===zPlaybackRunId),Math.max(25,ms)));}

function setZHighlight(fila,tubo,eventIndex,blockId,on){
  document.querySelectorAll(".z-pipe").forEach(el=>{
    if(el.dataset.fila===fila&&Number(el.dataset.tubo)===Number(tubo))el.classList.toggle("is-playing",on);
  });
  document.querySelectorAll(".z-notation-number").forEach(el=>{
    const ok=el.dataset.fila===fila&&Number(el.dataset.tubo)===Number(tubo)
      &&Number(el.dataset.eventIndex)===Number(eventIndex)&&String(el.dataset.blockId)===String(blockId);
    if(ok){
      el.classList.toggle("is-playing",on);
      if(on && $("#autoFollow")?.checked){
        const wrap=el.closest(".z-notation-scroll");
        const svg=el.closest("svg");
        if(wrap&&svg){
          const x=Number(el.getAttribute("x"))||0;
          const renderedWidth=svg.getBoundingClientRect().width;
          const viewWidth=Number(svg.viewBox.baseVal.width)||renderedWidth;
          const target=(x/viewWidth)*renderedWidth-wrap.clientWidth*.42;
          wrap.scrollTo({left:Math.max(0,target),behavior:"smooth"});
        }
        el.closest(".z-part")?.scrollIntoView({behavior:"smooth",block:"nearest"});
      }
    }
  });
}
function playTubeSample(tube,speed,durationMs){
  if(!tube)return;
  startZamponaVoice(tube.frecuencia,Math.max(.08,Number(durationMs||450)/1000));
}
async function guidedTube(fila,tubo,eventIndex,blockId,units,speed,id){
  if(id!==zPlaybackRunId)return false;
  await ensureZAudio();
  if(id!==zPlaybackRunId)return false;
  const ms=Math.max(80,Math.round(500*Math.max(.2,Number(units)||1)/speed));
  const tube=findTube(fila,tubo);
  setZHighlight(fila,tubo,eventIndex,blockId,true);
  playTubeSample(tube,speed,ms*.94);
  const ok=await waitZ(ms,id);
  setZHighlight(fila,tubo,eventIndex,blockId,false);
  return ok;
}
function dragNumbers(ev){
  if(ev.desde.fila!==ev.hasta.fila)return[];
  const a=Number(ev.desde.tubo),b=Number(ev.hasta.tubo),step=a<=b?1:-1,out=[];
  for(let n=a;step>0?n<=b:n>=b;n+=step)out.push(n);return out;
}
async function playZEvent(ev,eventIndex,blockId,speed,id){
  if(ev.tipo==="separador")return waitZ(Math.round(280/speed),id);
  if(ev.tipo==="arrastre"){
    const nums=dragNumbers(ev);if(!nums.length)return true;
    const each=(Number(ev.duracion)||1)/nums.length;
    for(const n of nums){if(!await guidedTube(ev.desde.fila,n,eventIndex,blockId,each,speed,id))return false;}
    return true;
  }
  return guidedTube(ev.fila,ev.tubo,eventIndex,blockId,ev.duracion||1,speed,id);
}
async function playAll(){
  if(!currentRecord)return;
  stopZPlayback();const id=zPlaybackRunId,speed=publicSpeed();
  const btn=$("#playAllBtn"),sel=$("#playbackSpeed");if(btn)btn.disabled=true;if(sel)sel.disabled=true;
  try{
    const parts=getStructure(currentRecord).filter(x=>x.tipo==="parte");
    for(let pi=0;pi<parts.length;pi++){
      const p=parts[pi];
      for(let i=0;i<p.eventos.length;i++){if(!await playZEvent(p.eventos[i],i,p.id,speed,id))return;}
      if(pi<parts.length-1 && !await waitZ(Math.round(340/speed),id))return;
    }
  }finally{
    document.querySelectorAll(".is-playing").forEach(x=>x.classList.remove("is-playing"));
    if(btn)btn.disabled=false;if(sel)sel.disabled=false;
  }
}
$("#playAllBtn").addEventListener("click",playAll);
$("#stopAllBtn")?.addEventListener("click",stopZPlayback);

async function fetchTubes() {
  const {data,error}=await window.CancioneroDB.client
    .from("zampona_tubos").select("*").eq("publicado",true).order("fila").order("posicion");
  if(error) throw error;
  return data || [];
}

async function fetchRecord(songId) {
  const {data,error}=await window.CancioneroDB.client
    .from("zampona_canciones").select("*").eq("cancion_id",songId).eq("publicado",true).maybeSingle();
  if(error) throw error;
  return data;
}

async function loadSelectedSong() {
  currentSong=songs.find(s=>String(s.id)===$("#songSelect").value)||songs[0];
  if(!currentSong) return;
  $("#songTitle").textContent=currentSong.titulo || "—";

  try {
    currentRecord=await fetchRecord(currentSong.id);
    const has=Boolean(currentRecord);
    $("#notPublished").hidden=has;
    $("#publicContent").hidden=!has;
    if(has) {
      renderInstrument();
      renderStructure(currentRecord);
      $("#publicStatus").textContent="Guía cargada";
    } else {
      $("#publicStatus").textContent="Sin guía publicada";
    }
  } catch(e) {
    console.error(e);
    $("#publicStatus").textContent=e.message || "No se pudo cargar Zampoña";
  }
}

async function init() {
  try {
    songs=await window.CancioneroDB.listSongs();
    tubes=await fetchTubes();

    const select=$("#songSelect");
    select.replaceChildren();
    songs.forEach(song=>{
      const opt=document.createElement("option");
      opt.value=song.id;
      opt.textContent=`${song.numero ? song.numero+" · " : ""}${song.titulo}`;
      select.append(opt);
    });

    const requested=new URLSearchParams(location.search).get("song");
    const match=songs.find(s=>String(s.id)===requested || String(s.numero)===requested);
    if(match) select.value=match.id;

    select.addEventListener("change",()=>{stopZPlayback();loadSelectedSong();});
    await loadSelectedSong();
  } catch(e) {
    console.error(e);
    $("#publicStatus").textContent=e.message || "No se pudo iniciar Zampoña";
  }
}

init();
