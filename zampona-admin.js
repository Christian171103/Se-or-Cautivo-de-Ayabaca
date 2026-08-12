const $ = (q) => document.querySelector(q);

let songs = [];
let tubes = [];
let structure = [];
let activeItemId = null;
let recordMode = "nota";
let pendingDragStart = null;

const ROW_TOP = "superior";
const ROW_BOTTOM = "inferior";
const SEMITONES = {C:0,"C#":1,D:2,"D#":3,E:4,F:5,"F#":6,G:7,"G#":8,A:9,"A#":10,B:11};

function uid() {
  return (crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

function setStatus(el,text,type="") {
  el.textContent=text;
  el.className=`status-message${type?` is-${type}`:""}`;
}

function tubeHeight(position,row) {
  const max=row===ROW_TOP?12:11;
  const minH=82,maxH=205;
  const ratio=(Number(position)-1)/(max-1);
  return Math.round(minH+ratio*(maxH-minH));
}

function tubeCode(t) {
  return Number(t?.posicion || t?.numero || 0);
}

function spanishNote(note) {
  const map={C:"Do","C#":"Do#",D:"Re","D#":"Re#",E:"Mi",F:"Fa","F#":"Fa#",G:"Sol","G#":"Sol#",A:"La","A#":"La#",B:"Si"};
  const m=String(note||"").match(/^([A-G](?:#)?)(\d+)?$/);
  return m ? (map[m[1]]||m[1]) : "—";
}

function frequencyFor(pitch,octave) {
  if(!(pitch in SEMITONES)) return null;
  const midi=(Number(octave)+1)*12+SEMITONES[pitch];
  return 440*Math.pow(2,(midi-69)/12);
}

function parseStoredNote(note) {
  const m=String(note||"").match(/^([A-G](?:#)?)(\d+)$/);
  return m ? {pitch:m[1],octave:Number(m[2])} : {pitch:"",octave:4};
}

function getTube(row,pos) {
  return tubes.find(t=>t.fila===row && Number(t.posicion)===Number(pos));
}

function activeItem() {
  return structure.find(x=>x.id===activeItemId) || null;
}

function activePart() {
  const x=activeItem();
  return x?.tipo==="parte" ? x : null;
}

function normalizeEvent(ev) {
  if(!ev) return null;
  if(ev.tipo==="separador") return {tipo:"separador"};
  if(ev.tipo==="arrastre" && ev.desde && ev.hasta) {
    return {
      tipo:"arrastre",
      desde:{fila:ev.desde.fila,tubo:Number(ev.desde.tubo)},
      hasta:{fila:ev.hasta.fila,tubo:Number(ev.hasta.tubo)},
      duracion:Number(ev.duracion)||1
    };
  }
  if(ev.tipo==="nota" || ev.tubo!=null) {
    return {
      tipo:"nota",
      fila:ev.fila || ROW_TOP,
      tubo:Number(ev.tubo),
      duracion:Number(ev.duracion)||1
    };
  }
  return null;
}

function legacyToStructure(secciones) {
  const labels={intro:"Intro",verso:"Verso",coro:"Coro",puente:"Puente",final:"Final"};
  const result=[];
  Object.entries(labels).forEach(([key,label])=>{
    const raw=secciones?.[key];
    if(!raw) return;

    if(typeof raw==="object" && !Array.isArray(raw) && Array.isArray(raw.eventos)) {
      result.push({
        id:uid(),tipo:"parte",nombre:label,
        comentario:String(raw.comentario||""),
        eventos:raw.eventos.map(normalizeEvent).filter(Boolean)
      });
      return;
    }

    if(Array.isArray(raw) && raw.length) {
      result.push({
        id:uid(),tipo:"parte",nombre:label,comentario:"",
        eventos:raw.map(v=>({tipo:"nota",fila:ROW_TOP,tubo:Number(v),duracion:1})).filter(x=>Number.isFinite(x.tubo))
      });
    }
  });
  return result;
}

function hydrateStructure(record) {
  const sec=record?.secciones||{};
  if(Array.isArray(sec.estructura)) {
    return sec.estructura.map(item=>{
      if(item.tipo==="divisor") {
        return {id:item.id||uid(),tipo:"divisor",texto:String(item.texto||"")};
      }
      return {
        id:item.id||uid(),tipo:"parte",
        nombre:String(item.nombre||"Parte"),
        comentario:String(item.comentario||""),
        eventos:(item.eventos||[]).map(normalizeEvent).filter(Boolean)
      };
    });
  }
  return legacyToStructure(sec);
}

async function ensureAdmin() {
  if(!window.CancioneroDB?.configured) {
    setStatus($("#loginStatus"),"Configura Supabase antes de entrar.","error");
    return;
  }
  const session=await window.CancioneroDB.getSession();
  $("#loginView").hidden=Boolean(session);
  $("#adminView").hidden=!session;
  if(session) {
    $("#adminUser").textContent=session.user.email;
    await initAdmin();
  }
}

$("#loginForm").addEventListener("submit",async e=>{
  e.preventDefault();
  try {
    await window.CancioneroDB.signIn($("#loginEmail").value,$("#loginPassword").value);
    await ensureAdmin();
  } catch(err) {
    setStatus($("#loginStatus"),err.message,"error");
  }
});

$("#logoutBtn").addEventListener("click",async()=>{
  await window.CancioneroDB.signOut();
  location.reload();
});

async function loadSongs() {
  songs=await window.CancioneroDB.listSongs();
  const select=$("#songSelect");
  select.replaceChildren();
  songs.forEach(song=>{
    const o=document.createElement("option");
    o.value=song.id;
    o.textContent=`${song.numero? song.numero+" · ":""}${song.titulo}`;
    select.append(o);
  });
}

async function fetchTubes() {
  const {data,error}=await window.CancioneroDB.client
    .from("zampona_tubos").select("*").order("fila").order("posicion");
  if(error) throw error;
  tubes=data||[];
}

async function fetchRecord(songId) {
  const {data,error}=await window.CancioneroDB.client
    .from("zampona_canciones").select("*").eq("cancion_id",songId).maybeSingle();
  if(error) throw error;
  return data;
}

function renderAdminTube(tube) {
  const btn=document.createElement("button");
  btn.type="button";
  btn.className="z-pipe z-pipe-admin";
  btn.style.height=`${tubeHeight(tube.posicion,tube.fila)}px`;
  btn.dataset.id=tube.id;
  btn.dataset.fila=tube.fila;
  btn.dataset.tubo=String(tubeCode(tube));
  btn.innerHTML=`
    <span class="z-pipe-hole"></span>
    <span class="z-pipe-number">${tubeCode(tube)}</span>
    <span class="z-pipe-note">${spanishNote(tube.nota)}</span>
    <small>${tube.nota||""}</small>
  `;

  btn.addEventListener("click",()=>{
    selectTube(tube);
    registerTubeClick(tube);
  });
  return btn;
}

function renderInstrument() {
  const top=$("#adminUpperRow"),bottom=$("#adminLowerRow");
  top.replaceChildren();bottom.replaceChildren();

  tubes.filter(t=>t.fila===ROW_TOP).sort((a,b)=>a.posicion-b.posicion).forEach(t=>top.append(renderAdminTube(t)));
  tubes.filter(t=>t.fila===ROW_BOTTOM).sort((a,b)=>a.posicion-b.posicion).forEach(t=>bottom.append(renderAdminTube(t)));
}

function selectTube(tube) {
  document.querySelectorAll(".z-pipe-admin").forEach(x=>x.classList.toggle("is-selected",x.dataset.id===tube.id));
  $("#tubeId").value=tube.id;
  $("#tubeRowDisplay").value=tube.fila===ROW_TOP?"Superior (12 tubos)":"Inferior (11 tubos)";
  $("#tubeNumber").value=tubeCode(tube);

  const parsed=parseStoredNote(tube.nota);
  $("#tubePitch").value=parsed.pitch;
  $("#tubeOctave").value=String(parsed.octave);

  const auto=frequencyFor(parsed.pitch,parsed.octave);
  const stored=Number(tube.frecuencia);
  const custom=Boolean(stored && auto && Math.abs(stored-auto)>.5);
  $("#useCustomFrequency").checked=custom;
  $("#customFrequency").value=custom?stored.toFixed(2):"";
  $("#tubePublished").checked=Boolean(tube.publicado);
  updateFrequencyUI();
}

function updateFrequencyUI() {
  const auto=frequencyFor($("#tubePitch").value,$("#tubeOctave").value);
  $("#autoFrequency").textContent=auto?`${auto.toFixed(2)} Hz`:"— Hz";
  $("#customFrequency").disabled=!$("#useCustomFrequency").checked;
}

$("#tubePitch").addEventListener("change",updateFrequencyUI);
$("#tubeOctave").addEventListener("change",updateFrequencyUI);
$("#useCustomFrequency").addEventListener("change",updateFrequencyUI);

function effectiveFrequency() {
  if($("#useCustomFrequency").checked) {
    const f=Number($("#customFrequency").value);
    return f>0?f:null;
  }
  return frequencyFor($("#tubePitch").value,$("#tubeOctave").value);
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

function synth(freq,duration=.65){ return playZamponaTone(freq,duration); }

async function playTube(tube){
  const freq=tube?.frecuencia||effectiveFrequency();
  if(!freq)return;
  stopZAudioVoices();
  await playZamponaTone(freq,.72);
}

$("#playTubeBtn").addEventListener("click",()=>{
  const tube=tubes.find(t=>t.id===$("#tubeId").value);
  playTube(tube);
});

$("#saveTubeBtn").addEventListener("click",async()=>{
  const id=$("#tubeId").value;
  const tube=tubes.find(t=>t.id===id);
  if(!tube) {
    setStatus($("#tubeSaveStatus"),"Selecciona un tubo.","error");
    return;
  }

  const pitch=$("#tubePitch").value;
  const octave=Number($("#tubeOctave").value);
  const frequency=effectiveFrequency();
  if(!pitch || !frequency) {
    setStatus($("#tubeSaveStatus"),"Selecciona nota y octava.","error");
    return;
  }

  // numeración fija = posición. No puede cambiarse.

  const payload={
    numero:String(tube.posicion),
    etiqueta:String(tube.posicion),
    nota:`${pitch}${octave}`,
    frecuencia:Number(frequency.toFixed(4)),
    publicado:$("#tubePublished").checked,
    updated_at:new Date().toISOString()
  };

  const {error}=await window.CancioneroDB.client
    .from("zampona_tubos").update(payload).eq("id",id);

  if(error) {
    setStatus($("#tubeSaveStatus"),error.message,"error");
    return;
  }
  setStatus($("#tubeSaveStatus"),"Tubo actualizado correctamente.","success");
  await fetchTubes();
  renderInstrument();
  const refreshed=tubes.find(t=>t.id===id);
  if(refreshed) selectTube(refreshed);
});

function renderStructureList() {
  const host=$("#structureList");
  host.replaceChildren();

  structure.forEach((item,index)=>{
    const row=document.createElement("button");
    row.type="button";
    row.className=`z-structure-item${item.id===activeItemId?" active":""}${item.tipo==="divisor"?" is-divider":""}`;

    if(item.tipo==="divisor") {
      row.innerHTML=`<strong>— ${item.texto || "Comentario / divisor"} —</strong>`;
    } else {
      row.innerHTML=`<strong>${item.nombre}</strong><span>${item.eventos.length} evento(s)${item.comentario? " · comentario":""}</span>`;
    }

    row.addEventListener("click",()=>{
      activeItemId=item.id;
      pendingDragStart=null;
      renderStructureList();
      renderActiveEditor();
    });

    const controls=document.createElement("span");
    controls.className="z-item-controls";

    const up=document.createElement("button");
    up.type="button";up.textContent="↑";up.title="Subir";
    up.addEventListener("click",e=>{e.stopPropagation();if(index>0){[structure[index-1],structure[index]]=[structure[index],structure[index-1]];renderStructureList();}});

    const down=document.createElement("button");
    down.type="button";down.textContent="↓";down.title="Bajar";
    down.addEventListener("click",e=>{e.stopPropagation();if(index<structure.length-1){[structure[index+1],structure[index]]=[structure[index],structure[index+1]];renderStructureList();}});

    const del=document.createElement("button");
    del.type="button";del.textContent="×";del.title="Eliminar";
    del.addEventListener("click",e=>{
      e.stopPropagation();
      structure.splice(index,1);
      if(activeItemId===item.id) activeItemId=structure[0]?.id||null;
      renderStructureList();renderActiveEditor();
    });

    controls.append(up,down,del);
    row.append(controls);
    host.append(row);
  });
}

$("#addPartBtn").addEventListener("click",()=>{
  const item={id:uid(),tipo:"parte",nombre:`${structure.filter(x=>x.tipo==="parte").length+1}ra. Parte`,comentario:"",eventos:[]};
  structure.push(item);activeItemId=item.id;renderStructureList();renderActiveEditor();
});

$("#addDividerBtn").addEventListener("click",()=>{
  const item={id:uid(),tipo:"divisor",texto:"Cambio a menores"};
  structure.push(item);activeItemId=item.id;renderStructureList();renderActiveEditor();
});


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
    t.setAttribute("role","button");
    t.addEventListener("click",()=>selectSequenceEvent(Number(p.eventIndex)));
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

let selectedEventIndex=-1;
function selectSequenceEvent(index){
  const p=activePart(),ev=p?.eventos?.[index];if(!ev||ev.tipo==="separador")return;
  selectedEventIndex=index;
  document.querySelectorAll(".z-notation-number").forEach(x=>x.classList.toggle("is-selected-event",Number(x.dataset.eventIndex)===index));
  $("#eventEditor").hidden=false;
  const label=ev.tipo==="arrastre"?`${ev.desde.fila==="superior"?"S":"I"}${ev.desde.tubo} → ${ev.hasta.fila==="superior"?"S":"I"}${ev.hasta.tubo}`:`${ev.fila==="superior"?"S":"I"}${ev.tubo}`;
  $("#selectedEventLabel").textContent=`Evento ${index+1}: ${label}`;
  $("#selectedEventDuration").value=Number(ev.duracion)||1;
}
function refreshAfterEventEdit(){selectedEventIndex=-1;$("#eventEditor").hidden=true;renderActiveEditor();renderStructureList();}
$("#saveEventEdit").addEventListener("click",()=>{const p=activePart(),ev=p?.eventos?.[selectedEventIndex];if(!ev)return;ev.duracion=Math.max(.25,Number($("#selectedEventDuration").value)||1);refreshAfterEventEdit();});
$("#deleteSelectedEvent").addEventListener("click",()=>{const p=activePart();if(!p||selectedEventIndex<0)return;p.eventos.splice(selectedEventIndex,1);refreshAfterEventEdit();});
$("#moveEventBack").addEventListener("click",()=>{const p=activePart();if(!p||selectedEventIndex<=0)return;[p.eventos[selectedEventIndex-1],p.eventos[selectedEventIndex]]=[p.eventos[selectedEventIndex],p.eventos[selectedEventIndex-1]];selectedEventIndex--;renderActiveEditor();selectSequenceEvent(selectedEventIndex);});
$("#moveEventForward").addEventListener("click",()=>{const p=activePart();if(!p||selectedEventIndex<0||selectedEventIndex>=p.eventos.length-1)return;[p.eventos[selectedEventIndex+1],p.eventos[selectedEventIndex]]=[p.eventos[selectedEventIndex],p.eventos[selectedEventIndex+1]];selectedEventIndex++;renderActiveEditor();selectSequenceEvent(selectedEventIndex);});


function renderActiveEditor() {
  const item=activeItem();
  $("#partEditor").hidden=true;
  $("#dividerEditor").hidden=true;
  $("#noPartSelected").hidden=Boolean(item);

  if(!item) {
    $("#activePartTitle").textContent="Secuencia de la parte";
    return;
  }

  if(item.tipo==="divisor") {
    $("#dividerEditor").hidden=false;
    $("#dividerText").value=item.texto||"";
    $("#activePartTitle").textContent="Comentario / divisor";
    return;
  }

  $("#partEditor").hidden=false;
  $("#partName").value=item.nombre||"";
  $("#partComment").value=item.comentario||"";
  $("#activePartTitle").textContent=`Secuencia: ${item.nombre}`;
  $("#eventCount").textContent=`${item.eventos.length} evento(s)`;

  const host=$("#adminNotation");
  host.replaceChildren();
  host.append(renderNotation(item.eventos,item.id));

  $("#manualSequence").value=(item.eventos||[]).map((e,index,arr)=>{
    if(e.tipo==="separador") return "/";
    if(e.tipo==="arrastre"){
      return `${e.desde.fila===ROW_TOP?"S":"I"}${e.desde.tubo}&${e.hasta.fila===ROW_TOP?"S":"I"}${e.hasta.tubo}${Number(e.duracion)!==1?`:${e.duracion}`:""}`;
    }
    if(e.tipo==="nota"){
      if(Number(e.duracion)===0.5){
        const prev=arr[index-1],next=arr[index+1];
        if(prev?.tipo==="nota"&&Number(prev.duracion)===0.5&&prev.fila===e.fila) return "";
        if(next?.tipo==="nota"&&Number(next.duracion)===0.5&&next.fila===e.fila)
          return `${e.fila===ROW_TOP?"S":"I"}${e.tubo}&${next.fila===ROW_TOP?"S":"I"}${next.tubo}`;
      }
      return `${e.fila===ROW_TOP?"S":"I"}${e.tubo}${Number(e.duracion)!==1?`:${e.duracion}`:""}`;
    }
    return "";
  }).filter(Boolean).join(" ");
}

$("#partName").addEventListener("input",()=>{
  const p=activePart();if(!p)return;p.nombre=$("#partName").value;renderStructureList();$("#activePartTitle").textContent=`Secuencia: ${p.nombre||"Parte"}`;
});
$("#partComment").addEventListener("input",()=>{const p=activePart();if(p)p.comentario=$("#partComment").value;});
$("#dividerText").addEventListener("input",()=>{const x=activeItem();if(x?.tipo==="divisor"){x.texto=$("#dividerText").value;renderStructureList();}});

document.querySelectorAll("[data-record-mode]").forEach(btn=>{
  btn.addEventListener("click",()=>{
    recordMode=btn.dataset.recordMode;
    pendingDragStart=null;
    document.querySelectorAll("[data-record-mode]").forEach(x=>x.classList.toggle("active",x===btn));
    $("#recordHelp").textContent=recordMode==="arrastre"
      ? "Arrastre: selecciona primero el tubo donde inicia el soplido y luego el tubo donde termina."
      : "Modo normal: cada clic en un tubo agrega una nota independiente.";
  });
});

function registerTubeClick(tube) {
  const part=activePart();
  if(!part) return;

  playTube(tube);

  const ref={fila:tube.fila,tubo:tubeCode(tube)};
  const dur=Number($("#nextDuration").value)||1;

  if(recordMode==="nota") {
    part.eventos.push({tipo:"nota",...ref,duracion:dur});
  } else {
    if(!pendingDragStart) {
      pendingDragStart=ref;
      setStatus($("#tubeSaveStatus"),`Inicio del arrastre: ${ref.fila==="superior"?"S":"I"}${ref.tubo}. Selecciona el tubo final.`);
      return;
    }
    if(pendingDragStart.fila!==ref.fila){
      setStatus($("#tubeSaveStatus"),"El arrastre solo puede hacerse dentro de la misma fila.","error");
      return;
    }
    part.eventos.push({tipo:"arrastre",desde:pendingDragStart,hasta:ref,duracion:dur});
    pendingDragStart=null;
  }

  renderActiveEditor();
  renderStructureList();
}


function insertPhraseSeparator() {
  const p=activePart();
  if(!p || !p.eventos.length) return;
  if(p.eventos[p.eventos.length-1]?.tipo==="separador") return;
  p.eventos.push({tipo:"separador"});
  pendingDragStart=null;
  renderActiveEditor();
  renderStructureList();
}

$("#newPhraseBtn").addEventListener("click",insertPhraseSeparator);

document.addEventListener("keydown",(e)=>{
  if(e.code!=="Space" || $("#partEditor").hidden) return;
  const target=e.target;
  const tag=target?.tagName?.toLowerCase();
  const typing=tag==="input" || tag==="textarea" || tag==="select" || target?.isContentEditable;
  if(typing) return;
  e.preventDefault();
  insertPhraseSeparator();
});

$("#undoEventBtn").addEventListener("click",()=>{
  const p=activePart();if(!p)return;
  p.eventos.pop();pendingDragStart=null;renderActiveEditor();renderStructureList();
});

$("#clearEventsBtn").addEventListener("click",()=>{
  const p=activePart();if(!p)return;
  p.eventos=[];pendingDragStart=null;renderActiveEditor();renderStructureList();
});

let zPlaybackRunId=0;

function adminSpeed(){return Math.max(.5,Math.min(3,Number($("#adminPlaybackSpeed")?.value)||1));}
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
    if(ok){el.classList.toggle("is-playing",on);if(on){const wrap=el.closest(".z-notation-scroll"),svg=el.closest("svg");if(wrap&&svg){const x=Number(el.getAttribute("x"))||0,w=svg.getBoundingClientRect().width,v=Number(svg.viewBox.baseVal.width)||w;wrap.scrollTo({left:Math.max(0,(x/v)*w-wrap.clientWidth*.42),behavior:"smooth"});}}}
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
  const tube=getTube(fila,tubo);
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
$("#playPartBtn").addEventListener("click",async()=>{
  const p=activePart();if(!p)return;
  stopZPlayback();const id=zPlaybackRunId,speed=adminSpeed();
  const btn=$("#playPartBtn"),sel=$("#adminPlaybackSpeed");btn.disabled=true;if(sel)sel.disabled=true;
  try{for(let i=0;i<p.eventos.length;i++){if(!await playZEvent(p.eventos[i],i,p.id,speed,id))return;}}
  finally{document.querySelectorAll(".is-playing").forEach(x=>x.classList.remove("is-playing"));btn.disabled=false;if(sel)sel.disabled=false;}
});
$("#stopPartBtn")?.addEventListener("click",stopZPlayback);

$("#applyManualBtn").addEventListener("click",()=>{
  const p=activePart();if(!p)return;
  const dur=Number($("#nextDuration").value)||1;
  const tokens=$("#manualSequence").value.trim().split(/\s+/).filter(Boolean);
  const parsed=[];
  let errorText="";

  const parseCode=code=>{
    const m=String(code).match(/^([SI])(\d{1,2})(?::(\d+(?:\.\d+)?))?$/i); if(!m)return null;
    const fila=m[1].toUpperCase()==="S"?ROW_TOP:ROW_BOTTOM;
    const tubo=Number(m[2]),max=fila===ROW_TOP?12:11;
    return tubo>=1&&tubo<=max?{fila,tubo,duracion:m[3]?Number(m[3]):null}:null;
  };

  for(const token of tokens){
    if(token==="/"||token==="|"){
      if(parsed.length&&parsed.at(-1)?.tipo!=="separador")parsed.push({tipo:"separador"});
      continue;
    }
    if(token.includes("&")){
      const durationMatch=token.match(/:(\d+(?:\.\d+)?)$/);const tokenDuration=durationMatch?Number(durationMatch[1]):dur;const cleanToken=token.replace(/:(\d+(?:\.\d+)?)$/,'');const pair=cleanToken.split("&");
      const a=parseCode(pair[0]),b=parseCode(pair[1]);
      if(pair.length!==2||!a||!b){errorText=`Formato inválido: ${token}`;continue;}
      if(a.fila!==b.fila){errorText=`${token}: el arrastre no puede cambiar de fila.`;continue;}
      if(Math.abs(a.tubo-b.tubo)===1){
        parsed.push({tipo:"nota",fila:a.fila,tubo:a.tubo,duracion:.5});
        parsed.push({tipo:"nota",fila:b.fila,tubo:b.tubo,duracion:.5});
      }else{
        parsed.push({tipo:"arrastre",desde:a,hasta:b,duracion:tokenDuration});
      }
      continue;
    }
    const one=parseCode(token);
    if(one){const noteDuration=one.duracion||dur;delete one.duracion;parsed.push({tipo:"nota",...one,duracion:noteDuration});}
    else errorText=`Formato inválido: ${token}`;
  }
  if(parsed.at(-1)?.tipo==="separador")parsed.pop();
  p.eventos=parsed;pendingDragStart=null;
  renderActiveEditor();renderStructureList();
  setStatus($("#tubeSaveStatus"),errorText||`Secuencia aplicada: ${parsed.length} evento(s).`,errorText?"error":"success");
});

async function loadSongRecord() {
  const id=$("#songSelect").value;
  if(!id)return;

  try {
    const record=await fetchRecord(id);
    $("#songScale").value=record?.escala||"";
    $("#songTempo").value=record?.tempo||"";
    $("#songPublished").checked=Boolean(record?.publicado);
    structure=hydrateStructure(record);
    activeItemId=structure[0]?.id||null;
    pendingDragStart=null;
    renderStructureList();
    renderActiveEditor();
    setStatus($("#songSaveStatus"),record?"Ficha cargada.":"Canción sin ficha de Zampoña.");
  } catch(e) {
    setStatus($("#songSaveStatus"),e.message,"error");
  }
}

$("#songSelect").addEventListener("change",()=>{stopZPlayback();loadSongRecord();});

$("#saveSongRecord").addEventListener("click",async()=>{
  const payload={
    cancion_id:$("#songSelect").value,
    escala:$("#songScale").value.trim(),
    tempo:$("#songTempo").value?Number($("#songTempo").value):null,
    publicado:$("#songPublished").checked,
    secciones:{estructura:structure},
    updated_at:new Date().toISOString()
  };

  const {error}=await window.CancioneroDB.client
    .from("zampona_canciones").upsert(payload,{onConflict:"cancion_id"});

  setStatus($("#songSaveStatus"),error?error.message:"Ficha guardada correctamente.",error?"error":"success");
});

async function initAdmin() {
  await loadSongs();
  await fetchTubes();

  // Normaliza numeración lógica en memoria: posición = número.
  tubes=tubes.map(t=>({...t,numero:String(t.posicion),etiqueta:String(t.posicion)}));
  renderInstrument();

  const first=tubes.find(t=>t.fila===ROW_TOP && Number(t.posicion)===1) || tubes[0];
  if(first)selectTube(first);

  await loadSongRecord();
}

ensureAdmin().catch(e=>setStatus($("#loginStatus"),e.message,"error"));
