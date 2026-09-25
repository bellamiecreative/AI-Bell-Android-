// AI Bell v8 — iPhone CPU/WASM chat
import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm";

const MODEL_ID = "onnx-community/SmolLM2-135M-Instruct-ONNX";
const STORAGE_KEY = "ai-bell-chats-v8";

let generator = null, loading = false, generating = false;
let chats = loadChats(), activeChatId = null;
const $ = id => document.getElementById(id);

function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
function loadChats(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY))||[]}catch{return[]}}
function saveChats(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(chats))}catch{}}
function currentChat(){return chats.find(c=>c.id===activeChatId)}
function ensureChat(){
  if(!activeChatId||!currentChat()){
    const c={id:uid(),title:"New chat",messages:[],updatedAt:Date.now()};
    chats.unshift(c);activeChatId=c.id;saveChats();
  }
}
function setStatus(t,type=""){const e=$("ai-status");if(e){e.textContent=t;e.className="ai-status "+type}}
function cleanAnswer(t){
  return String(t||"").replace(/<think>[\s\S]*?<\/think>/gi,"")
    .replace(/<think>[\s\S]*$/gi,"").trim();
}
function renderChats(){
  const list=$("chat-list");if(!list)return;list.innerHTML="";
  for(const c of chats){
    const b=document.createElement("button");b.type="button";
    b.className="chat-item"+(c.id===activeChatId?" active":"");
    b.textContent=c.title||"New chat";
    b.onclick=()=>{activeChatId=c.id;closeSidebar();renderAll()};
    list.appendChild(b);
  }
}
function renderMessages(){
  const box=$("messages");if(!box)return;box.innerHTML="";
  const c=currentChat();
  if(!c||!c.messages.length){
    const w=document.createElement("div");w.className="welcome";
    w.innerHTML='<div class="welcome-logo">AI</div><h1>How can I help?</h1><p>AI Bell runs a small AI model locally on this device.</p><div class="local-note">🔒 Your messages stay on this device.</div>';
    box.appendChild(w);return;
  }
  for(const m of c.messages){
    const row=document.createElement("div");row.className="message "+m.role;
    const bubble=document.createElement("div");bubble.className="bubble";
    bubble.textContent=m.role==="assistant"?cleanAnswer(m.content):m.content;
    row.appendChild(bubble);box.appendChild(row);
  }
  box.scrollTop=box.scrollHeight;
}
function updateModelUI(){
  const b=$("load-ai");if(!b)return;
  if(generator){b.textContent="AI Ready";b.disabled=false;setStatus("Local AI ready","ready")}
  else if(loading){b.textContent="Loading AI…";b.disabled=true}
  else{b.textContent="Load AI";b.disabled=false;if(!$("ai-status")?.classList.contains("error"))setStatus("AI not loaded","")}
}
async function loadAI(){
  if(generator||loading)return;
  loading=true;updateModelUI();setStatus("Preparing local AI…","");
  try{
    generator=await pipeline("text-generation",MODEL_ID,{
      device:"wasm",dtype:"q4f16",
      progress_callback:p=>{
        if(typeof p?.progress==="number"){
          const pct=Math.max(0,Math.min(100,Math.round(p.progress<=1?p.progress*100:p.progress)));
          setStatus(`Loading local AI… ${pct}%`,"");
        }else if(p?.status==="initiate")setStatus("Preparing local AI…","");
      }
    });
    setStatus("Local AI ready","ready");
  }catch(e){console.error(e);generator=null;setStatus("AI could not load. Try again.","error")}
  finally{loading=false;updateModelUI()}
}
function systemPrompt(){
  return "You are AI Bell, a helpful private AI assistant. Answer clearly and naturally. The user may write Sorani Kurdish, Kurmanji Kurdish, Arabic, or English. If the user writes Sorani Kurdish, answer in Sorani Kurdish when possible. Do not reveal hidden reasoning. Keep answers concise.";
}
function makePrompt(messages){
  // Explicit ChatML avoids browser/model chat-template compatibility problems.
  let p="<|im_start|>system\n"+systemPrompt()+"<|im_end|>\n";
  for(const m of messages){
    p+="<|im_start|>"+m.role+"\n"+m.content+"<|im_end|>\n";
  }
  p+="<|im_start|>assistant\n";
  return p;
}
function extractAnswer(output,prompt){
  let s="";
  if(Array.isArray(output)&&output[0])s=typeof output[0].generated_text==="string"?output[0].generated_text:"";
  else if(typeof output==="string")s=output;
  if(s.startsWith(prompt))s=s.slice(prompt.length);
  s=s.replace(/<\|im_end\|>[\s\S]*$/,"").replace(/<\|im_start\|>assistant\s*/g,"");
  return cleanAnswer(s);
}
async function sendMessage(){
  if(generating)return;
  const input=$("message-input"),text=(input?.value||"").trim();
  if(!text)return;
  ensureChat();
  if(!generator){await loadAI();if(!generator)return}
  const c=currentChat();input.value="";input.style.height="auto";
  c.messages.push({role:"user",content:text});
  if(c.title==="New chat")c.title=text.slice(0,32)+(text.length>32?"…":"");
  c.updatedAt=Date.now();saveChats();renderAll();
  generating=true;$("send-btn").disabled=true;setStatus("AI is thinking…","ready");
  try{
    const history=c.messages.slice(-8);
    const prompt=makePrompt(history);
    const output=await generator(prompt,{max_new_tokens:96,do_sample:false,repetition_penalty:1.05});
    let answer=extractAnswer(output,prompt);
    if(!answer)answer="I couldn't generate a response. Please try again.";
    c.messages.push({role:"assistant",content:answer});
    c.updatedAt=Date.now();saveChats();renderMessages();
  }catch(e){
    console.error("Generation error:",e);
    // Keep the user's message visible; show a useful error instead of deleting it.
    c.messages.push({role:"assistant",content:"Sorry — the local AI could not generate a response on this iPhone. Please try again."});
    saveChats();renderMessages();
  }finally{generating=false;$("send-btn").disabled=false;setStatus("Local AI ready","ready")}
}
function newChat(){const c={id:uid(),title:"New chat",messages:[],updatedAt:Date.now()};chats.unshift(c);activeChatId=c.id;saveChats();closeSidebar();renderAll();$("message-input")?.focus()}
function deleteCurrentChat(){if(!activeChatId)return;chats=chats.filter(c=>c.id!==activeChatId);activeChatId=chats[0]?.id||null;saveChats();ensureChat();renderAll()}
function openSidebar(){$("sidebar")?.classList.add("open");$("scrim")?.classList.add("show")}
function closeSidebar(){$("sidebar")?.classList.remove("open");$("scrim")?.classList.remove("show")}
function autoResize(){const i=$("message-input");if(i){i.style.height="auto";i.style.height=Math.min(i.scrollHeight,130)+"px"}}
function renderAll(){renderChats();renderMessages();updateModelUI()}
document.addEventListener("DOMContentLoaded",()=>{
  activeChatId=chats[0]?.id||null;ensureChat();
  $("openSidebar")?.addEventListener("click",openSidebar);$("closeSidebar")?.addEventListener("click",closeSidebar);
  $("scrim")?.addEventListener("click",closeSidebar);$("new-chat")?.addEventListener("click",newChat);
  $("new-chat-top")?.addEventListener("click",newChat);$("delete-chat")?.addEventListener("click",deleteCurrentChat);
  $("load-ai")?.addEventListener("click",loadAI);
  $("composer")?.addEventListener("submit",e=>{e.preventDefault();e.stopPropagation();sendMessage();return false});
  $("message-input")?.addEventListener("input",autoResize);
  $("message-input")?.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();e.stopPropagation();sendMessage()}});
  renderAll();
});
