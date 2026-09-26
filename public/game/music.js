const TRACKS={
  morning:{name:'Pagi di Lahan',subtitle:'utama · farming cozy',bpm:94,lead:['E5','G5','A5','B5','A5','G5','E5','D5','E5','G5','B5','A5','G5','E5','D5','B4'],bass:['C3','C3','A2','A2','F2','F2','G2','G2'],wave:'triangle'},
  rain:{name:'Hujan di Rumah Kaca',subtitle:'tenang · lembut',bpm:78,lead:['C5','E5','G5','E5','D5','F5','A5','F5','C5','E5','A5','G5','F5','D5','E5','C5'],bass:['F2','F2','C3','C3','D3','D3','G2','G2'],wave:'sine'},
  night:{name:'Lampu Lab Malam',subtitle:'malam · fokus',bpm:88,lead:['A4','C5','E5','G5','E5','C5','B4','D5','F5','A5','F5','D5','C5','E5','G5','E5'],bass:['A2','A2','F2','F2','C3','C3','G2','G2'],wave:'triangle'}
};
const NOTE_INDEX={C:0,'C#':1,D:2,'D#':3,E:4,F:5,'F#':6,G:7,'G#':8,A:9,'A#':10,B:11};
let ctx=null,master=null,timer=0,nextTime=0,step=0,current='morning',playing=false;
function hz(note){
  const m=String(note).match(/^([A-G]#?)(\d)$/);if(!m)return 440;
  const midi=(Number(m[2])+1)*12+NOTE_INDEX[m[1]];return 440*Math.pow(2,(midi-69)/12);
}
function ensure(){
  if(ctx)return ctx;
  ctx=new (window.AudioContext||window.webkitAudioContext)();
  master=ctx.createGain();master.gain.value=.075;master.connect(ctx.destination);return ctx;
}
function voice(note,time,duration,wave='triangle',gain=.06){
  const c=ensure(),o=c.createOscillator(),g=c.createGain();
  o.type=wave;o.frequency.value=hz(note);g.gain.setValueAtTime(.0001,time);g.gain.exponentialRampToValueAtTime(gain,time+.025);
  g.gain.exponentialRampToValueAtTime(.0001,time+duration);o.connect(g);g.connect(master);o.start(time);o.stop(time+duration+.03);
}
function schedule(){
  if(!playing)return;
  const c=ensure(),track=TRACKS[current]||TRACKS.morning,beat=60/track.bpm/2;
  while(nextTime<c.currentTime+.25){
    const lead=track.lead[step%track.lead.length],bass=track.bass[Math.floor(step/2)%track.bass.length];
    voice(lead,nextTime,beat*.8,track.wave,.045);
    if(step%2===0)voice(bass,nextTime,beat*1.7,'sine',.032);
    if(step%4===0){
      const fifth=hz(bass)*1.5,c2=c.createOscillator(),g=c.createGain();
      c2.type='sine';c2.frequency.value=fifth;g.gain.setValueAtTime(.0001,nextTime);g.gain.exponentialRampToValueAtTime(.014,nextTime+.03);g.gain.exponentialRampToValueAtTime(.0001,nextTime+beat*1.6);
      c2.connect(g);g.connect(master);c2.start(nextTime);c2.stop(nextTime+beat*1.7);
    }
    nextTime+=beat;step++;
  }
}
export function startMusic(track=current){
  current=TRACKS[track]?track:'morning';const c=ensure();playing=true;step=0;nextTime=Math.max(c.currentTime+.04,nextTime||0);
  if(c.state==='suspended')c.resume().catch(()=>{});
  clearInterval(timer);schedule();timer=setInterval(schedule,90);
}
export function stopMusic(){playing=false;clearInterval(timer);timer=0;}
export function setMusicTrack(track){if(!TRACKS[track])return;current=track;if(playing){stopMusic();startMusic(track);}}
export function setMusicVolume(value){ensure();master.gain.value=Math.max(0,Math.min(.16,Number(value)||0));}
export function musicTracks(){return Object.entries(TRACKS).map(([id,value])=>({id,...value}));}
export function currentMusicTrack(){return current;}
