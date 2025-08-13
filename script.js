/* ---------- Utilities ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const log = (msg) => {
  const box = $("#processLog");
  if (!box) return;
  const line = document.createElement("div");
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
};
const fmt = (n, d=2) => (Number.isFinite(n) ? Number(n).toFixed(d) : "—");

/* ---------- Data: Templates & Sample ---------- */
const PRESETS = [
  {
    title: "Customer Satisfaction (CSAT)",
    desc: "Measure satisfaction, identify friction, and prioritize quick wins.",
    chips: ["CSAT", "Support", "Post-purchase"],
    questions: [
      { type: "rating", label: "Overall, how satisfied are you?" },
      { type: "text", label: "What worked well?" },
      { type: "text", label: "What could be improved?" },
      { type: "choice", label: "How did you interact with us?", options: ["Web", "Mobile App", "Phone", "In-store"] }
    ]
  },
  {
    title: "Product Feedback",
    desc: "Feature usefulness, quality, and reliability signals.",
    chips: ["Product", "UX", "Reliability"],
    questions: [
      { type: "rating", label: "Rate product quality" },
      { type: "rating", label: "Rate feature usefulness" },
      { type: "text", label: "Bugs or issues you faced?" }
    ]
  },
  {
    title: "Employee Pulse",
    desc: "Quick weekly pulse to track morale and blockers.",
    chips: ["HR", "Engagement", "Pulse"],
    questions: [
      { type: "rating", label: "How was your week?" },
      { type: "text", label: "One thing that slowed you down" },
      { type: "text", label: "Shout-out to a teammate" }
    ]
  }
];

const SAMPLE_CSV = `rating,comment,category,userId,timestamp
5,"Loved the speed!",Performance,u1,2025-08-10
1,"App keeps crashing",Stability,u2,2025-08-11
3,"UI is fine but checkout failed twice",Checkout,u3,2025-08-12
4,"Good overall; support solved it quickly",Support,u4,2025-08-12
2,"Slow on low-end phones",Performance,u2,2025-08-12
, "Bad",Performance,u5,2025-08-12
5,"Amazing experience",General,u6,2025-08-13
1,"Terrible latency and frequent timeouts",Performance,u7,2025-08-13
4,"Nice design",UI,u8,2025-08-13
`;

/* ---------- Survey Builder ---------- */
const builder = {
  state: { title: "", questions: [] },

  renderQuestion(q, idx){
    const item = document.createElement("div");
    item.className = "q-item";
    const typeLabel = q.type === "rating" ? "Rating" : (q.type === "choice" ? "Choice" : "Text");
    item.innerHTML = `
      <header>
        <strong>${q.label}</strong>
        <div class="meta">${typeLabel}</div>
      </header>
      ${q.type === "choice" ? `<div class="meta">Options: ${q.options.join(", ")}</div>` : ""}
      <div style="text-align:right">
        <button data-idx="${idx}" class="btn btn-ghost q-remove">Remove</button>
      </div>
    `;
    return item;
  },

  refresh(){
    const list = $("#questionsList");
    list.innerHTML = "";
    this.state.questions.forEach((q, i) => list.appendChild(this.renderQuestion(q, i)));
    $$(".q-remove", list).forEach(btn => {
      btn.addEventListener("click", (e) => {
        const i = Number(e.currentTarget.dataset.idx);
        this.state.questions.splice(i, 1);
        this.refresh();
      });
    });
  },

  addQuestion(){
    const type = $("#qType").value;
    const label = $("#qLabel").value.trim();
    if(!label) return alert("Please enter a question label.");
    let q = { type, label };
    if(type === "choice"){
      const raw = $("#qOptions").value.trim();
      const options = raw.split(",").map(s=>s.trim()).filter(Boolean);
      if(options.length < 2) return alert("Provide at least two choices.");
      q.options = options;
    }
    this.state.questions.push(q);
    $("#qLabel").value = "";
    $("#qOptions").value = "";
    this.refresh();
  }
};

/* ---------- Processing & Analysis ---------- */
const Cleaner = {
  parse(input){
    input = input.trim();
    if(!input) return [];
    try {
      // Try JSON
      const json = JSON.parse(input);
      if(Array.isArray(json)) return json;
    } catch(_) {}
    // Otherwise CSV
    const lines = input.split(/\r?\n/).filter(Boolean);
    const header = lines.shift().split(",").map(s=>s.trim());
    return lines.map(l=>{
      const parts = parseCSVLine(l);
      const obj = {};
      header.forEach((h, i)=> obj[h] = parts[i] ?? "");
      return obj;
    });
  },

  normalize(rows){
    // trim strings, coerce rating, standardize timestamp
    return rows.map(r => {
      const rating = Number(r.rating);
      return {
        userId: (r.userId ?? "").toString().trim(),
        comment: (r.comment ?? "").toString().trim(),
        category: (r.category ?? "").toString().trim() || "General",
        rating: Number.isFinite(rating) ? rating : null,
        timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : null
      };
    });
  },

  dedupe(rows){
    const seen = new Set();
    return rows.filter(r=>{
      const key = `${r.userId}::${r.comment}`;
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },

  impute(rows, strategy = "mean"){
    // Fill missing rating using chosen strategy
    const vals = rows.map(r=>r.rating).filter(v=>Number.isFinite(v)).sort((a,b)=>a-b);
    const mean = vals.reduce((a,b)=>a+b,0) / (vals.length || 1);
    const median = vals.length ? (vals[Math.floor((vals.length-1)/2)] + vals[Math.ceil((vals.length-1)/2)]) / 2 : 3;
    const mode = (()=> {
      const c = new Map(); vals.forEach(v=> c.set(v, (c.get(v)||0)+1));
      let best = null, bestN = -1;
      for(const [k, n] of c) if(n > bestN){ best = k; bestN = n; }
      return best ?? 3;
    })();

    return rows.flatMap(r=>{
      if(r.rating == null || !Number.isFinite(r.rating)){
        if(strategy === "drop") return [];
        r.rating = strategy === "median" ? median : strategy === "mode" ? mode : mean;
      }
      if(!r.timestamp) r.timestamp = new Date().toISOString();
      return [r];
    });
  }
};

const Analyzer = {
  // tiny lexicon for demo
  negWords: ["bad","slow","crash","crashing","bug","bugs","terrible","broken","timeout","fail","failed","lag","poor","issue","issues","problem","problems"],
  posWords: ["good","great","love","loved","amazing","fast","nice","smooth","excellent","awesome"],

  sentiment(comment){
    if(!comment) return 0;
    const t = comment.toLowerCase();
    let score = 0;
    this.posWords.forEach(w => { if(t.includes(w)) score += 1; });
    this.negWords.forEach(w => { if(t.includes(w)) score -= 1; });
    return Math.max(-2, Math.min(2, score));
  },

  run(rows){
    const withSent = rows.map(r => ({ ...r, sentiment: this.sentiment(r.comment) }));
    const avgRating = withSent.reduce((a,b)=>a+b.rating,0) / (withSent.length || 1);
    const neg = withSent.filter(r => r.rating < 3 || r.sentiment < 0);
    const negPct = (neg.length / (withSent.length || 1)) * 100;

    // category negativity
    const byCat = new Map();
    withSent.forEach(r=>{
      const c = byCat.get(r.category) || { total:0, neg:0 };
      c.total++;
      if(r.rating < 3 || r.sentiment < 0) c.neg++;
      byCat.set(r.category, c);
    });
    let topIssue = "—";
    let worst = -1;
    for(const [cat, v] of byCat){
      const rate = v.total ? v.neg/v.total : 0;
      if(rate > worst){ worst = rate; topIssue = cat; }
    }

    return { rows: withSent, avgRating, negPct, byCat, topIssue };
  },

  suggestions(analysis){
    const out = [];
    if(analysis.avgRating < 3.5) out.push("Introduce a rapid-response task force for low ratings (<3). Aim for first reply in under 30 minutes.");
    if(analysis.negPct > 25) out.push("Set up proactive alerts: when negative comments exceed 25% in a day, auto-notify the on-call owner.");
    if(analysis.topIssue !== "—") out.push(`Run a root-cause deep dive on **${analysis.topIssue}**. Sample 10 negative tickets and map quick wins.`);
    out.push("Publish a changelog to close the loop with users who left critical feedback.");
    return out;
  }
};

/* ---------- Dashboard ---------- */
const Dashboard = {
  charts: {},
  updateKpis(a){
    $("#kpiTotal").textContent = a.rows.length;
    $("#kpiAvgRating").textContent = fmt(a.avgRating, 2);
    $("#kpiNegativePct").textContent = fmt(a.negPct, 1) + "%";
    $("#kpiTopIssue").textContent = a.topIssue;

    // hero minis
    $("#kpiResponses").textContent = a.rows.length;
    $("#kpiSentiment").textContent = fmt(a.rows.reduce((s,r)=>s+r.sentiment,0)/(a.rows.length||1), 2);
    $("#kpiNegSignals").textContent = a.rows.filter(r=>r.sentiment<0 || r.rating<3).length;
  },

  draw(a){
    // Ratings distribution
    const dist = [1,2,3,4,5].map(star => a.rows.filter(r => Math.round(r.rating) === star).length);
    this.renderBar("ratingsBar", ["1★","2★","3★","4★","5★"], dist, "Count");

    // Sentiment over time (daily avg)
    const byDay = new Map();
    a.rows.forEach(r=>{
      const d = new Date(r.timestamp).toISOString().slice(0,10);
      const slot = byDay.get(d) || [];
      slot.push(r.sentiment);
      byDay.set(d, slot);
    });
    const days = Array.from(byDay.keys()).sort();
    const sent = days.map(d => {
      const arr = byDay.get(d); return arr.reduce((s,n)=>s+n,0)/(arr.length||1);
    });
    this.renderLine("sentimentLine", days, sent, "Avg Sentiment");

    // Category Pie: negative counts by category
    const cats = Array.from(a.byCat.keys());
    const negCounts = cats.map(c => a.byCat.get(c).neg);
    this.renderPie("categoryPie", cats, negCounts);
  },

  renderBar(id, labels, data, label){
    this._destroy(id);
    this.charts[id] = new Chart($("#"+id), {
      type: "bar",
      data: { labels, datasets: [{ label, data }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
  },

  renderLine(id, labels, data, label){
    this._destroy(id);
    this.charts[id] = new Chart($("#"+id), {
      type: "line",
      data: { labels, datasets: [{ label, data, tension: 0.35, fill: false }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, suggestedMin: -2, suggestedMax: 2 } } }
    });
  },

  renderPie(id, labels, data){
    this._destroy(id);
    this.charts[id] = new Chart($("#"+id), {
      type: "pie",
      data: { labels, datasets: [{ data }] },
      options: { plugins: { legend: { position: "bottom" } } }
    });
  },

  miniLine(samples){
    this._destroy("miniLine");
    this.charts["miniLine"] = new Chart($("#miniLine"), {
      type: "line",
      data: { labels: samples.map((_,i)=>i+1), datasets: [{ data: samples, tension: 0.35, fill: false }] },
      options: { plugins: { legend: { display: false } }, scales: { x: { display:false }, y: { display:false } } }
    });
  },

  _destroy(id){
    const c = this.charts[id];
    if(c){ c.destroy(); delete this.charts[id]; }
  }
};

/* ---------- CSV helper ---------- */
function parseCSVLine(line){
  // Very small CSV parser that supports quotes
  const out = [];
  let cur = "", inQ = false;
  for(let i=0;i<line.length;i++){
    const ch = line[i];
    if(ch === '"' ){ inQ = !inQ; continue; }
    if(ch === "," && !inQ){ out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/* ---------- Storage (for saved surveys) ---------- */
const STORAGE_KEYS = {
  SURVEY_INDEX: "smart_surveys_index_v1"
};
const keySurvey = id => `smart_survey_${id}`;

function saveSurvey(survey){
  const id = survey.id || crypto.randomUUID();
  survey.id = id;
  localStorage.setItem(keySurvey(id), JSON.stringify(survey));
  const index = JSON.parse(localStorage.getItem(STORAGE_KEYS.SURVEY_INDEX) || "[]");
  if(!index.includes(id)){
    index.push(id);
    localStorage.setItem(STORAGE_KEYS.SURVEY_INDEX, JSON.stringify(index));
  }
  return id;
}

/* ---------- Wire-up UI ---------- */
document.addEventListener("DOMContentLoaded", () => {
  // Builder behavior
  $("#qType").addEventListener("change", (e)=>{
    $("#qOptions").classList.toggle("hide", e.target.value !== "choice");
  });
  $("#addQuestionBtn").addEventListener("click", ()=> builder.addQuestion());
  $("#newSurveyBtn").addEventListener("click", ()=>{
    builder.state = { title: "", questions: [] };
    $("#surveyTitle").value = "";
    builder.refresh();
    window.location.hash = "#builder";
  });
  $("#saveSurveyBtn").addEventListener("click", ()=>{
    builder.state.title = $("#surveyTitle").value.trim();
    if(!builder.state.title) return alert("Please add a survey title.");
    if(builder.state.questions.length === 0) return alert("Add at least one question.");
    const id = saveSurvey(builder.state);
    alert("Survey saved ✔");
    log(`Saved survey "${builder.state.title}" (id: ${id})`);
  });
  $("#clearBuilderBtn").addEventListener("click", ()=>{
    builder.state = { title: "", questions: [] };
    $("#surveyTitle").value = "";
    builder.refresh();
  });

  // Templates
  const grid = $("#templatesGrid");
  PRESETS.forEach(p=>{
    const card = document.createElement("div");
    card.className = "template-card";
    card.innerHTML = `
      <h5>${p.title}</h5>
      <p>${p.desc}</p>
      <div class="chips">${p.chips.map(c=>`<span class="chip">${c}</span>`).join("")}</div>
      <div style="margin-top:10px; display:flex; gap:8px;">
        <button class="btn btn-primary use-template">Use Template</button>
        <button class="btn btn-ghost preview-template">Preview</button>
      </div>
    `;
    $(".use-template", card).addEventListener("click", ()=>{
      builder.state = { title: p.title, questions: structuredClone(p.questions) };
      $("#surveyTitle").value = p.title;
      builder.refresh();
      window.location.hash = "#builder";
      log(`Loaded template "${p.title}" into builder.`);
    });
    $(".preview-template", card).addEventListener("click", ()=>{
      alert(p.questions.map((q,i)=>`${i+1}. [${q.type}] ${q.label}${q.options? " ("+q.options.join(", ")+")":""}`).join("\n"));
    });
    grid.appendChild(card);
  });

  // Processing defaults
  $("#rawInput").value = SAMPLE_CSV;

  // Run analysis
  $("#runAnalysisBtn").addEventListener("click", ()=>{
    const raw = $("#rawInput").value;
    const fill = $("#fillStrategy").value;
    const dedupe = $("#dedupeToggle").checked;

    log("Parsing input…");
    let rows = Cleaner.parse(raw);
    log(`Parsed ${rows.length} rows.`);

    log("Normalizing data…");
    rows = Cleaner.normalize(rows);

    if(dedupe){
      const before = rows.length;
      rows = Cleaner.dedupe(rows);
      log(`Removed duplicates: ${before - rows.length}`);
    }

    log(`Handling missing values with strategy: ${fill.toUpperCase()}…`);
    rows = Cleaner.impute(rows, fill);

    log("Running sentiment & negative pattern detection…");
    const analysis = Analyzer.run(rows);

    // Update dashboard
    Dashboard.updateKpis(analysis);
    Dashboard.draw(analysis);
    Dashboard.miniLine(sparkOf(analysis.rows.length));

    // Fill table
    fillTable(analysis.rows);

    // Suggestions
    const ideas = Analyzer.suggestions(analysis);
    const ul = $("#suggestionsList");
    ul.innerHTML = ideas.map(t => `<li>${t}</li>`).join("");

    log("Done ✅");
    window.location.hash = "#dashboard";
  });

  // Export
  $("#exportBtn").addEventListener("click", ()=>{
    const rows = currentTableRows();
    if(rows.length === 0) return alert("Nothing to export.");
    const header = "userId,rating,category,sentiment,comment,timestamp\n";
    const body = rows.map(r=>[
      csvSafe(r.userId),
      r.rating,
      csvSafe(r.category),
      r.sentiment,
      csvSafe(r.comment),
      r.timestamp
    ].join(",")).join("\n");
    const blob = new Blob([header+body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "cleaned_responses.csv";
    a.click();
    URL.revokeObjectURL(url);
  });

  // Table search
  $("#tableSearch").addEventListener("input", (e)=>{
    const q = e.target.value.toLowerCase();
    $$("#resultsTable tbody tr").forEach(tr=>{
      const txt = tr.textContent.toLowerCase();
      tr.style.display = txt.includes(q) ? "" : "none";
    });
  });
});

/* ---------- Helpers (table, export, sparkline) ---------- */
function fillTable(rows){
  const tb = $("#resultsTable tbody");
  tb.innerHTML = rows.map(r=>`
    <tr>
      <td>${esc(r.userId)}</td>
      <td>${fmt(r.rating, 1)}</td>
      <td>${esc(r.category)}</td>
      <td>${r.sentiment}</td>
      <td>${esc(r.comment)}</td>
      <td>${new Date(r.timestamp).toLocaleString()}</td>
    </tr>
  `).join("");
}
function currentTableRows(){
  const trs = $$("#resultsTable tbody tr");
  return trs.map(tr=>{
    const tds = $$("td", tr).map(td=>td.textContent);
    return {
      userId: tds[0],
      rating: Number(tds[1]),
      category: tds[2],
      sentiment: Number(tds[3]),
      comment: tds[4],
      timestamp: new Date(tds[5]).toISOString()
    };
  });
}
function esc(s){ return (s ?? "").toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function csvSafe(s){ const v = (s ?? "").toString(); return /[,"\n]/.test(v) ? `"${v.replace(/"/g,'""')}"` : v; }
function sparkOf(n){
  const arr = [];
  let v = 3 + Math.random()*2;
  for(let i=0; i<Math.max(8, Math.min(24, n)); i++){
    v += (Math.random()-0.5)*0.6;
    v = Math.max(1, Math.min(5, v));
    arr.push(Number(v.toFixed(2)));
  }
  return arr;
}

/* ---------- Nice: pre-fill tiny hero chart once ---------- */
document.addEventListener("DOMContentLoaded", ()=>{
  Dashboard.miniLine(sparkOf(12));
});
