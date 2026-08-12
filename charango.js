const $ = (q) => document.querySelector(q);

let songs = [];
let currentSong = null;
let currentRecord = null;
let chordCatalog = [];
let selectedChord = null;

function formatTime(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function youtubeInfo(song) {
  const raw = String(song?.youtube || "").trim();
  if (!raw) return null;
  let urlString = raw;
  if (!/^https?:\/\//i.test(urlString)) {
    urlString = `https://www.youtube.com/watch?v=${encodeURIComponent(urlString)}`;
  }
  try {
    const u = new URL(urlString);
    let id = "";
    if (u.hostname.includes("youtu.be")) id = u.pathname.split("/").filter(Boolean)[0] || "";
    else if (u.pathname.startsWith("/shorts/") || u.pathname.startsWith("/embed/")) id = u.pathname.split("/")[2] || "";
    else id = u.searchParams.get("v") || "";

    const start = Math.max(0, Number(song.inicio) || 0);
    const external = new URL(urlString);
    external.searchParams.delete("t");
    external.searchParams.delete("start");
    if (start) external.searchParams.set("t", `${start}s`);

    if (!id) return { external: external.toString(), embed: "", start };

    const params = new URLSearchParams({ rel: "0", modestbranding: "1", playsinline: "1" });
    if (start) params.set("start", String(start));
    if (location.protocol === "http:" || location.protocol === "https:") params.set("origin", location.origin);

    return {
      external: external.toString(),
      embed: `https://www.youtube.com/embed/${encodeURIComponent(id)}?${params}`,
      start
    };
  } catch {
    return null;
  }
}

function updateReference(song) {
  $("#songTitle").textContent = `${song.numero ? song.numero + " · " : ""}${song.titulo}`;
  $("#songMeta").textContent = song.categoria ? `${song.categoria} · datos compartidos con el cancionero` : "Datos compartidos con el cancionero";
  $("#referenceStart").textContent = `Inicio: ${formatTime(song.inicio)}`;

  const info = youtubeInfo(song);
  const btn = $("#referencePlayBtn");
  const yt = $("#youtubeBtn");
  const wrap = $("#referencePlayerWrap");
  const iframe = $("#referencePlayer");

  wrap.hidden = true;
  iframe.removeAttribute("src");
  btn.textContent = "▶ Escuchar referencia";

  if (!info) {
    btn.disabled = true;
    yt.hidden = true;
    btn.dataset.embed = "";
    return;
  }
  btn.disabled = !info.embed;
  btn.dataset.embed = info.embed || "";
  yt.hidden = false;
  yt.href = info.external;
}

$("#referencePlayBtn").addEventListener("click", () => {
  const btn = $("#referencePlayBtn");
  const wrap = $("#referencePlayerWrap");
  const iframe = $("#referencePlayer");
  const embed = btn.dataset.embed || "";
  if (!embed) return;

  if (!wrap.hidden) {
    wrap.hidden = true;
    iframe.removeAttribute("src");
    btn.textContent = "▶ Escuchar referencia";
  } else {
    iframe.src = embed;
    wrap.hidden = false;
    btn.textContent = "■ Ocultar referencia";
  }
});

function sectionTokens(record){ return Object.values(record?.secciones || {}).flat().filter(Boolean); }
function chordNamesFromToken(token){
  if(typeof token !== "string" || token.trim().startsWith("#")) return [];
  return token.split("/").map(x=>x.trim()).filter(Boolean);
}
function uniqueChords(record) {
  return [...new Set(sectionTokens(record).flatMap(chordNamesFromToken))];
}

function renderSections(record) {
  const container = $("#publicSections");
  container.replaceChildren();
  const labels = { intro:"Intro", verso:"Verso", coro:"Coro", puente:"Puente", final:"Final" };
  const sections = record?.secciones || {};

  Object.entries(labels).forEach(([key,label],sectionIndex)=>{
    const values=Array.isArray(sections[key])?sections[key]:[];
    if(!values.length) return;

    const section=document.createElement("section");
    section.className="public-section";
    section.dataset.sectionKey=key;

    const h3=document.createElement("h3"); h3.textContent=label;
    const row=document.createElement("div"); row.className="sequence public-sequence";

    values.forEach((token,beatIndex)=>{
      if(String(token).trim().startsWith("#")){
        const note=document.createElement("div");
        note.className="section-comment";
        note.textContent=String(token).trim().slice(1).trim();
        row.append(note); return;
      }

      const names=chordNamesFromToken(token);
      const beat=document.createElement("div");
      beat.className="chord-beat";
      beat.dataset.sectionKey=key;
      beat.dataset.beatIndex=String(beatIndex);

      names.forEach((name,chordIndex)=>{
        const btn=document.createElement("button");
        btn.type="button";
        btn.className="chord-chip progression-chord";
        btn.textContent=name;
        btn.dataset.sectionKey=key;
        btn.dataset.beatIndex=String(beatIndex);
        btn.dataset.chordIndex=String(chordIndex);
        btn.addEventListener("click",()=>selectChord(name));
        beat.append(btn);
      });

      if(names.length>1){
        const tag=document.createElement("small");
        tag.textContent="mismo tiempo";
        beat.append(tag);
      }
      row.append(beat);
    });
    section.append(h3,row);
    container.append(section);
  });
}

function renderUsedChords(record) {
  const used = uniqueChords(record);
  $("#publicChordCount").textContent = String(used.length);
  const container = $("#usedChords");
  container.replaceChildren();

  used.forEach(name => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chord-chip";
    btn.textContent = name;
    btn.addEventListener("click", () => selectChord(name));
    container.append(btn);
  });

  if (used.length) selectChord(used[0]);
}

function xForOrder(order){ return ((Number(order)-1)/4)*100; }

function fretWindow(data){
  const used=[
    ...(data?.digitacion||[]).map(x=>Number(x.traste)||0),
    ...(data?.cejillas||[]).map(x=>Number(x.traste)||0)
  ].filter(n=>n>0);
  const max=used.length?Math.max(...used):1;
  const min=used.length?Math.min(...used):1;
  const start=max<=5?1:Math.max(1,min);
  return {start,count:5,end:start+4};
}

function yForFret(fret,win){
  const local=Number(fret)-win.start+1;
  return ((local-.5)/win.count)*100;
}

function buildNeckBase(board,win){
  const shell=document.createElement("div");
  shell.className="charango-neck-shell";

  const neck=document.createElement("div");
  neck.className="fretboard-neck";
  const nut=document.createElement("span");
  nut.className="fretboard-nut";
  if(win.start>1) nut.classList.add("is-shifted");
  neck.append(nut);

  for(let i=1;i<=win.count;i++){
    const line=document.createElement("span");
    line.className="fret-line";
    line.style.top=`${(i/win.count)*100}%`;
    neck.append(line);
  }
  for(let order=1;order<=5;order++){
    const line=document.createElement("span");
    line.className="string-line";
    line.style.left=`${xForOrder(order)}%`;
    neck.append(line);
  }
  shell.append(neck);
  board.append(shell);
  return neck;
}

function renderFretboard(data){
  const board=$("#fretboard");
  board.replaceChildren();
  const win=fretWindow(data);
  const label=$("#fretPositionLabel");
  if(label){
    label.hidden=win.start===1;
    label.textContent=win.start===1?"":`Traste ${win.start}`;
  }
  const neck=buildNeckBase(board,win);
  if(!data) return;

  const open=new Set((Array.isArray(data.abiertas)?data.abiertas:[]).map(Number));
  const muted=new Set((Array.isArray(data.apagadas)?data.apagadas:[]).map(Number));

  for(let order=1;order<=5;order++){
    if(open.has(order)){
      const marker=document.createElement("span");
      marker.className="open-marker"; marker.style.left=`${xForOrder(order)}%`; neck.append(marker);
    } else if(muted.has(order)){
      const marker=document.createElement("span");
      marker.className="muted-marker"; marker.textContent="×"; marker.style.left=`${xForOrder(order)}%`; neck.append(marker);
    }
  }

  (Array.isArray(data.cejillas)?data.cejillas:[]).forEach(b=>{
    const fret=Number(b.traste);
    if(fret<win.start||fret>win.end) return;
    const from=Math.max(1,Math.min(5,Number(b.desde))),to=Math.max(1,Math.min(5,Number(b.hasta)));
    const min=Math.min(from,to),max=Math.max(from,to);
    const bar=document.createElement("span");
    bar.className="barre";
    bar.style.top=`${yForFret(fret,win)}%`;
    bar.style.left=`${xForOrder(min)}%`;
    bar.style.width=`${xForOrder(max)-xForOrder(min)}%`;
    const n=document.createElement("span");
    n.className="barre-number"; n.textContent=Number(b.dedo)||1;
    bar.append(n); neck.append(bar);
  });

  (Array.isArray(data.digitacion)?data.digitacion:[]).forEach(item=>{
    const fret=Number(item.traste);
    if(fret<win.start||fret>win.end) return;
    const dot=document.createElement("span");
    dot.className="finger-dot";
    dot.textContent=Number(item.dedo)||"●";
    dot.style.left=`${xForOrder(item.orden)}%`;
    dot.style.top=`${yForFret(fret,win)}%`;
    neck.append(dot);
  });
}

function selectChord(name) {
  selectedChord = chordCatalog.find(x => x.nombre === name) || null;
  $("#selectedChordLabel").textContent = name || "—";
  $("#selectedChordName").textContent = selectedChord?.nombre_completo || "Digitación no publicada";
  $("#chordTones").textContent = Array.isArray(selectedChord?.notas) && selectedChord.notas.length ? selectedChord.notas.join(" · ") : "—";
  $("#playChordBtn").disabled = !selectedChord?.notas?.length;
  renderFretboard(selectedChord);
}

function frequencyForNote(note) {
  const map = { C:0,"C#":1,Db:1,D:2,"D#":3,Eb:3,E:4,F:5,"F#":6,Gb:6,G:7,"G#":8,Ab:8,A:9,"A#":10,Bb:10,B:11 };
  const match = String(note).match(/^([A-G](?:#|b)?)(-?\d+)?$/);
  if (!match) return null;
  const pitch = match[1];
  const octave = match[2] == null ? 4 : Number(match[2]);
  const midi = (octave + 1) * 12 + (map[pitch] ?? 0);
  return 440 * Math.pow(2, (midi - 69) / 12);
}

let charangoPlaybackId=0;
let charangoActiveAudio=null;

function stopCharangoPlayback(){
  charangoPlaybackId++;
  if(charangoActiveAudio){ try{charangoActiveAudio.pause();charangoActiveAudio.currentTime=0;}catch{} }
  charangoActiveAudio=null;
  document.querySelectorAll(".progression-chord.is-playing,.chord-beat.is-playing").forEach(x=>x.classList.remove("is-playing"));
}

function synthChord(chord,durationMs=650){
  if(!chord?.notas?.length) return;
  const ctx=new (window.AudioContext||window.webkitAudioContext)();
  const now=ctx.currentTime;
  chord.notas.forEach((note,index)=>{
    const freq=frequencyForNote(note); if(!freq)return;
    const osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.type="triangle"; osc.frequency.value=freq;
    gain.gain.setValueAtTime(.0001,now);
    gain.gain.exponentialRampToValueAtTime(.055,now+.02+index*.008);
    gain.gain.exponentialRampToValueAtTime(.0001,now+durationMs/1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);osc.stop(now+durationMs/1000+.03);
  });
}

function playChordSound(chord,{speed=1,durationMs=650}={}){
  if(!chord) return;
  if(chord.audio_url){
    if(charangoActiveAudio){try{charangoActiveAudio.pause();}catch{}}
    const audio=new Audio(chord.audio_url);
    audio.playbackRate=Math.max(.5,Math.min(3,speed));
    charangoActiveAudio=audio;
    audio.play().catch(()=>synthChord(chord,durationMs));
    setTimeout(()=>{if(charangoActiveAudio===audio){try{audio.pause();}catch{} charangoActiveAudio=null;}},durationMs);
  }else synthChord(chord,durationMs);
}

$("#playChordBtn").addEventListener("click",()=>{
  if(!selectedChord) return;
  playChordSound(selectedChord,{speed:1,durationMs:800});
});

function currentCharangoSpeed(){
  return Math.max(.5,Math.min(3,Number($("#charangoSpeed")?.value)||1));
}

function waitCharango(ms,runId){
  return new Promise(resolve=>setTimeout(()=>resolve(runId===charangoPlaybackId),Math.max(30,ms)));
}

async function playProgression(){
  stopCharangoPlayback();
  const runId=charangoPlaybackId;
  const speed=currentCharangoSpeed();
  const btn=$("#playProgressionBtn"),sel=$("#charangoSpeed");
  if(btn)btn.disabled=true;if(sel)sel.disabled=true;

  try{
    const sections=document.querySelectorAll("#publicSections .public-section");
    for(let si=0;si<sections.length;si++){
      const beats=[...sections[si].querySelectorAll(".chord-beat")];
      for(const beat of beats){
        const chips=[...beat.querySelectorAll(".progression-chord")];
        if(!chips.length) continue;
        beat.classList.add("is-playing");
        // If two chords share one pulse, each occupies half of that pulse.
        const pulseMs=Math.round(720/speed);
        const eachMs=Math.round(pulseMs/chips.length);
        for(const chip of chips){
          if(runId!==charangoPlaybackId)return;
          chip.classList.add("is-playing");
          const chord=chordCatalog.find(x=>x.nombre===chip.textContent.trim());
          selectChord(chip.textContent.trim());
          playChordSound(chord,{speed,durationMs:Math.max(100,eachMs*.9)});
          const ok=await waitCharango(eachMs,runId);
          chip.classList.remove("is-playing");
          if(!ok)return;
        }
        beat.classList.remove("is-playing");
      }
      if(si<sections.length-1){
        const ok=await waitCharango(Math.round(320/speed),runId);
        if(!ok)return;
      }
    }
  }finally{
    document.querySelectorAll(".progression-chord.is-playing,.chord-beat.is-playing").forEach(x=>x.classList.remove("is-playing"));
    if(btn)btn.disabled=false;if(sel)sel.disabled=false;
  }
}

$("#playProgressionBtn")?.addEventListener("click",playProgression);
$("#stopProgressionBtn")?.addEventListener("click",stopCharangoPlayback);


async function fetchPublicRecord(songId) {
  const client = window.CancioneroDB?.client;
  if (!client) return null;
  const { data, error } = await client
    .from("charango_canciones")
    .select("*")
    .eq("cancion_id", songId)
    .eq("publicado", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchChordCatalog() {
  const client = window.CancioneroDB?.client;
  if (!client) return [];
  const { data, error } = await client
    .from("charango_acordes")
    .select("*")
    .eq("publicado", true)
    .order("nombre");
  if (error) throw error;
  return data || [];
}

function showRecord(record) {
  currentRecord = record;
  const has = Boolean(record);
  $("#notPublished").hidden = has;
  $("#publicContent").hidden = !has;

  if (!has) {
    $("#publicStatus").textContent = "Sin ficha pública para esta canción";
    return;
  }

  $("#publicKey").textContent = record.tonalidad || "—";
  $("#publicStrum").textContent = record.rasgueo || "—";
  renderSections(record);
  renderUsedChords(record);
  $("#publicStatus").textContent = "Ficha pública cargada";
}

async function loadSelectedSong() {
  stopCharangoPlayback();
  const id = $("#songSelect").value;
  currentSong = songs.find(s => String(s.id) === id) || songs.find(s => String(s.numero) === id) || songs[0];
  if (!currentSong) return;

  updateReference(currentSong);
  const url = new URL(location.href);
  url.searchParams.set("song", currentSong.id || currentSong.numero);
  history.replaceState(null, "", url);

  try {
    const record = await fetchPublicRecord(currentSong.id);
    showRecord(record);
  } catch (error) {
    console.error(error);
    showRecord(null);
    $("#publicStatus").textContent = "No se pudo cargar la ficha de Charango";
  }
}

async function init() {
  try {
    songs = await window.CancioneroDB.listSongs();
    chordCatalog = await fetchChordCatalog();

    const select = $("#songSelect");
    select.replaceChildren();

    songs.forEach(song => {
      const opt = document.createElement("option");
      opt.value = song.id;
      opt.textContent = `${song.numero ? song.numero + " · " : ""}${song.titulo}`;
      select.append(opt);
    });

    const requested = new URLSearchParams(location.search).get("song");
    if (requested) {
      const match = songs.find(s => String(s.id) === requested || String(s.numero) === requested);
      if (match) select.value = match.id;
    }

    select.addEventListener("change", loadSelectedSong);
    await loadSelectedSong();
  } catch (error) {
    console.error(error);
    $("#publicStatus").textContent = error.message || "No se pudo cargar Charango";
  }
}

init();
