// ---------- Core State ----------
const STORAGE_KEY = "vitalEdge.state.v1";
const TODAY_KEY = () => new Date().toISOString().slice(0,10); // YYYY-MM-DD

const DEFAULT_STATE = {
  tasks: [],                          // [{ text, done }]
  meals: [],                          // [{ calories, protein, date }]
  goals: { calories: 3000, protein: 150 },
  resetMealsDaily: true,
  lastReset: TODAY_KEY()
};

let state = loadState();

// ---------- Load/Save ----------
function loadState(){
  try{
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const merged = Object.assign({}, DEFAULT_STATE, saved || {});
    // Ensure goal bounds
    merged.goals.calories = clamp(merged.goals.calories, 1000, 6000);
    merged.goals.protein  = clamp(merged.goals.protein,   50,  400);
    // If new day: clear "done" flags; optionally reset meals
    const today = TODAY_KEY();
    if (merged.lastReset !== today){
      merged.tasks = merged.tasks.map(t => ({...t, done:false}));
      if (merged.resetMealsDaily){
        merged.meals = merged.meals.filter(m => m.date === today); // keep only today if any pre-seeded
      }
      merged.lastReset = today;
    }
    return merged;
  }catch(e){
    return structuredClone(DEFAULT_STATE);
  }
}
function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---------- Helpers ----------
function clamp(v, min, max){ return Math.max(min, Math.min(max, Number(v))); }
function $(sel){ return document.querySelector(sel); }
function $all(sel){ return Array.from(document.querySelectorAll(sel)); }
function todayMeals(){ const d = TODAY_KEY(); return state.meals.filter(m => m.date === d); }
function sum(arr, f){ return arr.reduce((a,x)=>a+f(x),0); }

// ---------- Midnight Reset Timer ----------
(function scheduleMidnightReset(){
  const now = new Date();
  const then = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1, 0,0,1);
  const ms = then - now;
  setTimeout(() => {
    state.tasks = state.tasks.map(t => ({...t, done:false}));
    if (state.resetMealsDaily){
      state.meals = []; // new day fresh
    }
    state.lastReset = TODAY_KEY();
    saveState();
    renderAll();
    scheduleMidnightReset();
  }, ms);
})();

// ---------- Rendering ----------
function renderAll(){
  renderTasks();
  renderMealsAndRings();
  renderSettings();
  updateHeaders();
}

function updateHeaders(){
  $("#calGoalLabel").textContent = `Goal: ${state.goals.calories} cal`;
  $("#proGoalLabel").textContent = `Goal: ${state.goals.protein} g`;
}

// Tasks (Home + Manage)
function renderTasks(){
  const makeLI = (t, idx, manage=false) => {
    const li = document.createElement("li");
    const left = document.createElement("div");
    left.className = "row";
    const dot = document.createElement("span");
    dot.className = "dot";
    const text = document.createElement("span");
    text.className = "task-text" + (t.done ? " task-done" : "");
    text.textContent = t.text;
    left.append(dot, text);

    const right = document.createElement("div");
    right.className = "row";

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "primary";
    toggleBtn.style.padding = "6px 10px";
    toggleBtn.textContent = t.done ? "Undo" : "Done";
    toggleBtn.onclick = () => { state.tasks[idx].done = !state.tasks[idx].done; saveState(); renderTasks(); };

    right.append(toggleBtn);

    if (manage){
      const menuBtn = document.createElement("button");
      menuBtn.className = "icon-btn";
      menuBtn.textContent = "⋯";
      menuBtn.title = "Edit or Delete";
      menuBtn.onclick = () => openTaskMenu(idx);
      right.append(menuBtn);
    }

    li.append(left, right);
    return li;
  };

  const homeUL = $("#taskListHome");
  const manageUL = $("#taskListManage");
  homeUL.innerHTML = "";
  manageUL.innerHTML = "";

  state.tasks.forEach((t,i) => {
    homeUL.appendChild(makeLI(t,i,false));
    manageUL.appendChild(makeLI(t,i,true));
  });
}

function openTaskMenu(i){
  const choice = prompt("Type:\nE to Edit\nD to Delete", "E");
  if (!choice) return;
  if (choice.toLowerCase() === "d"){
    state.tasks.splice(i,1);
  } else {
    const newText = prompt("Edit task", state.tasks[i].text);
    if (newText && newText.trim()){
      state.tasks[i].text = newText.trim();
    }
  }
  saveState(); renderTasks();
}

// Meals + Rings
function renderMealsAndRings(){
  // Meals list (today)
  const list = $("#mealList");
  list.innerHTML = "";
  const meals = todayMeals();
  meals.forEach((m, idx) => {
    const li = document.createElement("li");
    const left = document.createElement("div");
    left.className = "row";
    const dot = document.createElement("span"); dot.className = "dot";
    const text = document.createElement("span");
    text.textContent = `${m.calories} cal • ${m.protein} g`;
    left.append(dot, text);

    const del = document.createElement("button");
    del.className = "icon-btn";
    del.textContent = "🗑️";
    del.title = "Delete meal";
    del.onclick = () => { deleteMeal(idx); };

    li.append(left, del);
    list.append(li);
  });

  // Totals
  const totalCal = sum(meals, m=>m.calories);
  const totalPro = sum(meals, m=>m.protein);

  // Update rings
  drawRing("#calorieRing", totalCal, state.goals.calories, ["#5b7cfa","#8c5bfa"]);
  drawRing("#proteinRing", totalPro, state.goals.protein, ["#8c5bfa","#5b7cfa"]);

  $("#calorieSummary").textContent = `${totalCal} / ${state.goals.calories} cal`;
  $("#proteinSummary").textContent = `${totalPro} / ${state.goals.protein} g protein`;
}

// Settings
function renderSettings(){
  const c = $("#calorieGoal"), p = $("#proteinGoal");
  c.value = state.goals.calories;
  p.value = state.goals.protein;
  $("#calorieGoalVal").textContent = `${state.goals.calories} cal`;
  $("#proteinGoalVal").textContent = `${state.goals.protein} g`;
  $("#resetMealsDaily").checked = !!state.resetMealsDaily;
}

// ---------- Rings (Canvas, animated) ----------
function drawRing(selector, value, goal, [c1,c2]){
  const canvas = document.querySelector(selector);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const size = canvas.width;
  const r = size/2 - 16;
  const cx = size/2, cy = size/2;

  const percent = Math.min(value/goal, 1);
  const start = -Math.PI/2;
  const endTarget = start + percent * Math.PI*2;

  // gradient stroke
  const grad = ctx.createLinearGradient(0,0,size,size);
  grad.addColorStop(0,c1); grad.addColorStop(1,c2);

  // animate from previous frame value (store on canvas)
  const prev = canvas._prevEnd || start;
  const steps = 14;
  let frame = 0;

  function frameDraw(){
    const t = easeOutCubic(frame/steps);
    const end = prev + (endTarget - prev) * t;

    ctx.clearRect(0,0,size,size);

    // Track
    ctx.beginPath();
    ctx.lineWidth = 14;
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--ringTrack').trim() || '#222';
    ctx.lineCap = "round";
    ctx.arc(cx, cy, r, 0, Math.PI*2);
    ctx.stroke();

    // Progress
    ctx.beginPath();
    ctx.lineWidth = 14;
    ctx.strokeStyle = grad;
    ctx.lineCap = "round";
    ctx.arc(cx, cy, r, start, end);
    ctx.stroke();

    frame++;
    if (frame <= steps){
      requestAnimationFrame(frameDraw);
    } else {
      canvas._prevEnd = endTarget;
    }
  }
  frameDraw();
}

function easeOutCubic(x){ return 1 - Math.pow(1 - x, 3); }

// ---------- Actions ----------
function addTask(textFrom){
  const input = textFrom === "home" ? $("#newTaskHome") : $("#newTaskManage");
  const txt = (input?.value || "").trim();
  if (!txt) return;
  state.tasks.push({ text: txt, done:false });
  input.value = "";
  saveState(); renderTasks();
}

function addMeal(){
  const cal = parseInt($("#mealCalories").value,10);
  const pro = parseInt($("#mealProtein").value,10);
  if (!cal || !pro) return;
  state.meals.push({ calories: cal, protein: pro, date: TODAY_KEY() });
  $("#mealCalories").value = "";
  $("#mealProtein").value = "";
  saveState(); renderMealsAndRings();
}

function deleteMeal(idxToday){
  // delete only from today's meal subset
  const today = TODAY_KEY();
  let count = -1;
  for (let i=0; i<state.meals.length; i++){
    if (state.meals[i].date === today){
      count++;
      if (count === idxToday){
        state.meals.splice(i,1);
        break;
      }
    }
  }
  saveState(); renderMealsAndRings();
}

function openSettingsTab(){ switchTab("settingsTab"); }

// ---------- Nav / Tabs ----------
function switchTab(tabId){
  $all(".tab").forEach(t => t.classList.remove("active"));
  document.getElementById(tabId).classList.add("active");
  $all(".nav-btn").forEach(b => b.classList.remove("active"));
  const btn = document.querySelector(`.nav-btn[data-tab="${tabId}"]`);
  if (btn) btn.classList.add("active");
}

// ---------- Event Wiring ----------
window.addEventListener("DOMContentLoaded", () => {
  // Splash hide after render
  setTimeout(() => { document.getElementById("splash").classList.add("hidden"); }, 900);

  // Buttons / Nav
  document.getElementById("settingsBtn").addEventListener("click", openSettingsTab);
  $all(".nav-btn").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));

  // Add task buttons
  document.getElementById("addTaskHomeBtn").addEventListener("click", () => addTask("home"));
  document.getElementById("addTaskManageBtn").addEventListener("click", () => addTask("manage"));

  // Enter key for task inputs
  $("#newTaskHome").addEventListener("keydown", e => { if (e.key === "Enter") addTask("home"); });
  $("#newTaskManage").addEventListener("keydown", e => { if (e.key === "Enter") addTask("manage"); });

  // Meals
  document.getElementById("addMealBtn").addEventListener("click", addMeal);

  // Settings live display
  const c = $("#calorieGoal"), p = $("#proteinGoal");
  c.addEventListener("input", () => $("#calorieGoalVal").textContent = `${c.value} cal`);
  p.addEventListener("input", () => $("#proteinGoalVal").textContent = `${p.value} g`);

  // Save settings
  $("#saveSettingsBtn").addEventListener("click", () => {
    const newCals = clamp($("#calorieGoal").value, 1000, 6000);
    const newProt = clamp($("#proteinGoal").value, 50, 400);
    state.goals.calories = Number(newCals);
    state.goals.protein  = Number(newProt);
    state.resetMealsDaily = $("#resetMealsDaily").checked;
    saveState();
    renderAll();
    switchTab("homeTab");
    alert("✅ Settings saved");
  });

  renderAll();
});
