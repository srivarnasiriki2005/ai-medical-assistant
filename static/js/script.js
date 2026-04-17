"use strict";
/* =================================================================
   AI Medical Assistant — Complete Frontend Script
   Handles: Chat (RAG), ML Training, ML Testing & Prediction
================================================================= */

const API = "";   // same-origin Flask server

/* ── DOM ─────────────────────────────────────────────────────────── */
const statusDot    = document.getElementById("statusDot");
const statusLabel  = document.getElementById("statusLabel");
const chatArea     = document.getElementById("chatArea");
const welcomeCard  = document.getElementById("welcomeCard");
const questionInput= document.getElementById("questionInput");
const submitBtn    = document.getElementById("submitBtn");
const charCountEl  = document.getElementById("charCount");

/* Templates */
const tplUser   = document.getElementById("tplUser");
const tplAI     = document.getElementById("tplAI");
const tplLoader = document.getElementById("tplLoader");

let isLoading = false;

/* =================================================================
   HEALTH CHECK
================================================================= */
async function checkHealth() {
  setStatus("checking","Connecting…");
  try {
    const r = await fetch(`${API}/health`, { signal: AbortSignal.timeout(5000) });
    const d = await r.json();
    const chunks = d.chunks || 0;
    const ml     = d.ml_trained ? "ML✓" : "ML✗";
    setStatus("online", `Online · ${chunks} chunks · ${ml}`);
    return d;
  } catch {
    setStatus("offline","Offline");
    return null;
  }
}
function setStatus(state, label) {
  statusDot.className = `status-dot ${state}`;
  statusLabel.textContent = label;
}

/* =================================================================
   TAB SWITCHING
================================================================= */
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${tab}`).classList.add("active");
    // Show/hide quick questions
    document.getElementById("quickQs").style.display = (tab === "chat") ? "flex" : "none";
  });
});

/* =================================================================
   CHAT — Submit
================================================================= */
async function handleSubmit() {
  const q = questionInput.value.trim();
  if (!q || isLoading) { if (!q) shakeInput(); return; }
  if (q.length > 1000) { showCharError(); return; }

  hideWelcome();
  appendUser(q);
  questionInput.value = "";
  updateChar();
  autoResize();
  setLoading(true);

  const loader = appendLoader();
  scrollChat();

  try {
    updateLoaderTxt(loader, "Searching knowledge base…");
    const res = await fetch(`${API}/ask`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ question: q }),
      signal:  AbortSignal.timeout(45000)
    });

    updateLoaderTxt(loader, "Generating answer…");

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    loader.remove();

    if (data.error) appendAIError(data.error);
    else             appendAI(data.answer, data.sources || []);

  } catch (err) {
    loader.remove();
    const msg = err.name === "TimeoutError"
      ? "Request timed out. Try again."
      : err.message || "Unexpected error.";
    appendAIError(msg);
  } finally {
    setLoading(false);
    scrollChat();
  }
}

/* ── Chat helpers ───────────────────────────────────────────────── */
function hideWelcome() {
  if (welcomeCard && welcomeCard.parentNode) {
    welcomeCard.style.transition = "opacity .3s,transform .3s";
    welcomeCard.style.opacity    = "0";
    welcomeCard.style.transform  = "translateY(-10px)";
    setTimeout(() => welcomeCard.remove(), 300);
  }
}

function appendUser(text) {
  const node = tplUser.content.cloneNode(true);
  node.querySelector(".msg-text").textContent = text;
  chatArea.appendChild(node);
  scrollChat();
}

function appendAI(answer, sources) {
  const node    = tplAI.content.cloneNode(true);
  const textEl  = node.querySelector(".msg-text");
  renderMd(textEl, answer);

  if (sources.length) {
    const wrap   = node.querySelector(".sources-wrap");
    const toggle = node.querySelector(".src-toggle");
    const list   = node.querySelector(".src-list");
    const count  = node.querySelector(".src-count");

    wrap.hidden    = false;
    count.textContent = sources.length;

    sources.forEach(s => {
      const li = document.createElement("li");
      li.className = "src-item";

      const fileDiv = document.createElement("div");
      fileDiv.className = "src-file";
      fileDiv.textContent = `📄 ${s.file}`;

      const sc = document.createElement("span");
      sc.className = "src-score";
      sc.textContent = `Score: ${s.score}`;
      fileDiv.appendChild(sc);

      const ex = document.createElement("div");
      ex.className = "src-excerpt";
      ex.textContent = s.excerpt;

      li.appendChild(fileDiv);
      li.appendChild(ex);
      list.appendChild(li);
    });

    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      list.hidden = open;
      count.textContent = sources.length;
      toggle.childNodes[0].textContent = open ? "📎 Show sources " : "📎 Hide sources ";
    });
  }

  chatArea.appendChild(node);
  scrollChat();
}

function appendAIError(msg) {
  const node = tplAI.content.cloneNode(true);
  node.querySelector(".msg-bubble").classList.add("error");
  node.querySelector(".msg-text").textContent = `⚠️ ${msg}`;
  chatArea.appendChild(node);
  scrollChat();
}

function appendLoader() {
  chatArea.appendChild(tplLoader.content.cloneNode(true));
  return chatArea.querySelector("#loaderMsg");
}

function updateLoaderTxt(el, txt) {
  if (el) { const p = el.querySelector(".loader-txt"); if (p) p.textContent = txt; }
}

function scrollChat() {
  chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: "smooth" });
}

/* ── Markdown renderer (safe, no innerHTML) ─────────────────────── */
function renderMd(container, text) {
  container.textContent = "";
  let para = null;

  text.split("\n").forEach(line => {
    const t = line.trim();
    if (!t) { para = null; return; }

    if (/^#{1,3} /.test(t)) {
      para = null;
      const el = document.createElement("strong");
      el.style.cssText = "display:block;margin:10px 0 4px;color:var(--accent2)";
      el.textContent   = t.replace(/^#+\s*/,"");
      container.appendChild(el);
      return;
    }
    if (/^[-*] /.test(t)) {
      para = null;
      const ul = lastOrNew(container,"UL");
      const li = document.createElement("li");
      li.textContent = t.replace(/^[-*] /,"");
      ul.appendChild(li);
      return;
    }
    if (/^\d+\. /.test(t)) {
      para = null;
      const ol = lastOrNew(container,"OL");
      const li = document.createElement("li");
      li.textContent = t.replace(/^\d+\.\s*/,"");
      ol.appendChild(li);
      return;
    }
    if (!para) {
      para = document.createElement("p");
      container.appendChild(para);
    } else {
      para.textContent += " ";
    }
    para.textContent += t;
  });
}

function lastOrNew(parent, tag) {
  const last = parent.lastElementChild;
  if (last && last.tagName === tag) return last;
  const el = document.createElement(tag.toLowerCase());
  el.style.marginBottom = "7px";
  el.style.paddingLeft  = "18px";
  parent.appendChild(el);
  return el;
}

/* ── Input helpers ──────────────────────────────────────────────── */
function setLoading(v) {
  isLoading = v;
  submitBtn.disabled    = v;
  questionInput.disabled = v;
}
function updateChar() {
  const n = questionInput.value.length;
  charCountEl.textContent = `${n} / 1000`;
  charCountEl.classList.toggle("warn", n > 850);
}
function autoResize() {
  questionInput.style.height = "auto";
  questionInput.style.height = Math.min(questionInput.scrollHeight, 160) + "px";
}
function shakeInput() {
  const w = questionInput.closest(".input-wrap");
  w.style.animation = "none";
  void w.offsetWidth;
  w.style.animation = "shake .35s ease";
}
function showCharError() {
  charCountEl.textContent = "Too long!";
  charCountEl.classList.add("warn");
  setTimeout(updateChar, 2000);
}

// Inject shake keyframe
const shakeKf = document.createElement("style");
shakeKf.textContent = "@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}";
document.head.appendChild(shakeKf);

/* ── Chat events ────────────────────────────────────────────────── */
submitBtn.addEventListener("click", handleSubmit);
questionInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
});
questionInput.addEventListener("input", () => { updateChar(); autoResize(); });
document.querySelectorAll(".qbtn").forEach(b => {
  b.addEventListener("click", () => {
    questionInput.value = b.dataset.q;
    updateChar(); autoResize();
    handleSubmit();
  });
});

/* =================================================================
   ML — DATASET PREVIEW
================================================================= */
document.getElementById("loadDatasetBtn").addEventListener("click", async () => {
  const info  = document.getElementById("datasetInfo");
  const table = document.getElementById("datasetTable");
  info.textContent = "Loading dataset…";
  table.innerHTML  = "";

  try {
    const r = await fetch(`${API}/ml/dataset-preview`);
    const d = await r.json();

    info.innerHTML = `
      <strong>Shape:</strong> ${d.shape[0]} rows × ${d.shape[1]} columns &nbsp;|&nbsp;
      <strong>Distribution:</strong>
      <span class="risk-Low">Low: ${d.label_distribution.Low || 0}</span>,
      <span class="risk-Medium">Medium: ${d.label_distribution.Medium || 0}</span>,
      <span class="risk-High">High: ${d.label_distribution.High || 0}</span>
      (showing first 20 rows)
    `;

    const tbl = document.createElement("table");
    const hRow = document.createElement("tr");
    d.columns.forEach(col => {
      const th = document.createElement("th");
      th.textContent = col;
      hRow.appendChild(th);
    });
    tbl.appendChild(hRow);

    d.rows.forEach(row => {
      const tr = document.createElement("tr");
      d.columns.forEach(col => {
        const td = document.createElement("td");
        if (col === "risk_level") {
          td.className = `risk-${row[col]}`;
        }
        td.textContent = row[col];
        tr.appendChild(td);
      });
      tbl.appendChild(tr);
    });

    table.appendChild(tbl);
  } catch (e) {
    info.textContent = "Error: " + e.message;
  }
});

/* =================================================================
   ML — TRAIN
================================================================= */
document.getElementById("trainBtn").addEventListener("click", async () => {
  const btn      = document.getElementById("trainBtn");
  const loader   = document.getElementById("trainLoader");
  const resultCard = document.getElementById("trainResultCard");
  const resultsDiv = document.getElementById("trainResults");

  const algo = document.getElementById("algorithmSelect").value;
  const n    = parseInt(document.getElementById("samplesSelect").value);

  btn.disabled    = true;
  loader.hidden   = false;
  resultCard.hidden = true;

  try {
    const r = await fetch(`${API}/ml/train`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ algorithm: algo, n_samples: n }),
      signal:  AbortSignal.timeout(120000)
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error);

    const res = d.result;
    loader.hidden  = true;

    // Build results HTML
    resultsDiv.innerHTML = `
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-val">${res.accuracy}%</div>
          <div class="metric-lbl">Test Accuracy</div>
        </div>
        <div class="metric-card">
          <div class="metric-val">${res.cv_mean}%</div>
          <div class="metric-lbl">CV Mean (5-fold)</div>
        </div>
        <div class="metric-card">
          <div class="metric-val">±${res.cv_std}%</div>
          <div class="metric-lbl">CV Std Dev</div>
        </div>
        <div class="metric-card">
          <div class="metric-val">${res.training_time_sec}s</div>
          <div class="metric-lbl">Train Time</div>
        </div>
        <div class="metric-card">
          <div class="metric-val">${res.train_size}</div>
          <div class="metric-lbl">Train Samples</div>
        </div>
        <div class="metric-card">
          <div class="metric-val">${res.test_size}</div>
          <div class="metric-lbl">Test Samples</div>
        </div>
      </div>

      <div style="margin-top:16px">
        <p class="section-label" style="margin-bottom:8px">Cross-Validation Scores (5 folds)</p>
        <div class="cv-scores">
          ${res.cv_scores.map((s,i) => `<span class="cv-badge">Fold ${i+1}: ${s}%</span>`).join("")}
        </div>
      </div>

      ${buildFeatureImportance(res.feature_importance)}
      ${buildConfusionMatrix(res.confusion_matrix, res.classes)}
    `;

    resultCard.hidden = false;
    refreshHistory();

  } catch (e) {
    alert("Training error: " + e.message);
  } finally {
    btn.disabled  = false;
    loader.hidden = true;
  }
});

function buildFeatureImportance(featImp) {
  if (!featImp || !Object.keys(featImp).length) return "";
  const entries = Object.entries(featImp).sort((a,b)=>b[1]-a[1]);
  const max     = entries[0][1];
  const rows    = entries.map(([name,val]) => `
    <div class="feat-row">
      <div class="feat-name">${name.replace(/_/g," ")}</div>
      <div class="feat-bar-wrap">
        <div class="feat-bar-fill" style="width:${max>0?((val/max)*100).toFixed(1):0}%"></div>
      </div>
      <div class="feat-val">${(val*100).toFixed(1)}%</div>
    </div>
  `).join("");
  return `
    <div style="margin-top:16px">
      <p class="section-label" style="margin-bottom:10px">Feature Importance</p>
      <div class="feat-bars">${rows}</div>
    </div>`;
}

function buildConfusionMatrix(cm, classes) {
  if (!cm || !classes) return "";
  const size = classes.length;
  // Build grid: headers + data
  let cells = `<div class="cm-grid" style="grid-template-columns:repeat(${size+1},50px)">`;
  // Top-left blank
  cells += `<div class="cm-cell cm-header"></div>`;
  // Header row
  classes.forEach(c => { cells += `<div class="cm-cell cm-header">${c}</div>`; });
  // Data rows
  cm.forEach((row, ri) => {
    cells += `<div class="cm-cell cm-header">${classes[ri]}</div>`;
    row.forEach((val, ci) => {
      const cls = ri === ci ? "cm-diag" : "cm-off";
      cells += `<div class="cm-cell ${cls}">${val}</div>`;
    });
  });
  cells += "</div>";
  return `
    <div style="margin-top:16px">
      <p class="section-label" style="margin-bottom:10px">Confusion Matrix (Predicted →)</p>
      ${cells}
    </div>`;
}

/* =================================================================
   ML — HISTORY
================================================================= */
async function refreshHistory() {
  try {
    const r = await fetch(`${API}/ml/history`);
    const d = await r.json();
    const el = document.getElementById("historyList");
    if (!d.history.length) { el.textContent = "No training runs yet."; return; }
    el.innerHTML = d.history.map((h,i) => `
      <div style="display:flex;justify-content:space-between;align-items:center;
           padding:7px 0;border-bottom:1px solid var(--border);font-size:.8rem;">
        <span><strong>#${i+1}</strong> ${h.algorithm.replace(/_/g," ")}</span>
        <span style="color:var(--green);font-family:var(--mono)">${h.accuracy}%</span>
        <span style="color:var(--text3);font-size:.7rem">${h.trained_at}</span>
      </div>`
    ).join("");
  } catch(e) {
    document.getElementById("historyList").textContent = "Error: " + e.message;
  }
}
document.getElementById("refreshHistoryBtn").addEventListener("click", refreshHistory);

/* =================================================================
   ML — PREDICT
================================================================= */
// Preset values
const PRESETS = {
  Low:    { age:30, bmi:22,   bp:110, glucose:85,  chol:170, hr:68, smoking:0, diabetes:0 },
  Medium: { age:50, bmi:28,   bp:135, glucose:140, chol:220, hr:82, smoking:1, diabetes:0 },
  High:   { age:70, bmi:35,   bp:170, glucose:260, chol:300, hr:98, smoking:1, diabetes:1 },
};
function fillPreset(name) {
  const p = PRESETS[name];
  document.getElementById("p_age").value     = p.age;
  document.getElementById("p_bmi").value     = p.bmi;
  document.getElementById("p_bp").value      = p.bp;
  document.getElementById("p_glucose").value = p.glucose;
  document.getElementById("p_chol").value    = p.chol;
  document.getElementById("p_hr").value      = p.hr;
  document.getElementById("p_smoking").value  = p.smoking;
  document.getElementById("p_diabetes").value = p.diabetes;
}
document.getElementById("presetLow").addEventListener("click",  () => fillPreset("Low"));
document.getElementById("presetMed").addEventListener("click",  () => fillPreset("Medium"));
document.getElementById("presetHigh").addEventListener("click", () => fillPreset("High"));

document.getElementById("predictBtn").addEventListener("click", async () => {
  const btn = document.getElementById("predictBtn");
  const resultDiv = document.getElementById("predictResult");
  btn.disabled = true;
  btn.textContent = "Predicting…";

  const payload = {
    age:              parseFloat(document.getElementById("p_age").value),
    bmi:              parseFloat(document.getElementById("p_bmi").value),
    blood_pressure:   parseFloat(document.getElementById("p_bp").value),
    glucose:          parseFloat(document.getElementById("p_glucose").value),
    cholesterol:      parseFloat(document.getElementById("p_chol").value),
    heart_rate:       parseFloat(document.getElementById("p_hr").value),
    smoking:          parseInt(document.getElementById("p_smoking").value),
    diabetes_history: parseInt(document.getElementById("p_diabetes").value),
  };

  try {
    const r = await fetch(`${API}/ml/predict`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload)
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    const res = d.result;

    const classes   = Object.keys(res.probabilities);
    const probBars  = classes.map(c => `
      <div class="pb-row">
        <div class="pb-name">${c}</div>
        <div class="pb-wrap">
          <div class="pb-fill-${c}" style="width:${res.probabilities[c]}%"></div>
        </div>
        <div class="pb-pct">${res.probabilities[c]}%</div>
      </div>
    `).join("");

    resultDiv.hidden = false;
    resultDiv.innerHTML = `
      <div class="pred-card ${res.prediction}">
        <div class="pred-label ${res.prediction}">🏥 ${res.prediction} Risk</div>
        <div class="pred-conf">Confidence: ${res.confidence}%</div>
        <div class="pred-bars">${probBars}</div>
        <div class="pred-advice">${res.advice}</div>
      </div>`;
  } catch (e) {
    resultDiv.hidden = false;
    resultDiv.innerHTML = `<div class="info-box" style="color:var(--red)">⚠️ ${e.message}</div>`;
  } finally {
    btn.disabled    = false;
    btn.textContent = "🔮 Predict Risk";
  }
});

/* =================================================================
   ML — BATCH TEST
================================================================= */
document.getElementById("testBtn").addEventListener("click", async () => {
  const btn = document.getElementById("testBtn");
  const resultDiv = document.getElementById("testResults");
  const n = parseInt(document.getElementById("testSamplesSelect").value);

  btn.disabled = true;
  btn.textContent = "Testing…";
  resultDiv.hidden  = false;
  resultDiv.innerHTML = `<div class="info-box">Running batch test on ${n} synthetic patients…</div>`;

  try {
    const r = await fetch(`${API}/ml/test`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ n_test: n })
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error);

    const samples = (d.sample_predictions || []).map(s => `
      <tr class="sample-row ${s.correct ? 'correct' : 'wrong'}">
        <td>${s.actual}</td>
        <td class="risk-${s.predicted}">${s.predicted}</td>
        <td>${s.age}</td>
        <td>${s.bmi}</td>
        <td>${s.glucose}</td>
      </tr>`
    ).join("");

    resultDiv.innerHTML = `
      <div class="metrics-grid" style="margin-bottom:16px">
        <div class="metric-card">
          <div class="metric-val">${d.accuracy}%</div>
          <div class="metric-lbl">Accuracy</div>
        </div>
        <div class="metric-card">
          <div class="metric-val">${d.n_tested}</div>
          <div class="metric-lbl">Patients Tested</div>
        </div>
      </div>

      ${buildConfusionMatrix(d.confusion_matrix, d.classes)}

      <div style="margin-top:16px">
        <p class="section-label" style="margin-bottom:8px">Sample Predictions (first 10)</p>
        <div class="table-wrap">
          <table>
            <tr>
              <th>Actual</th><th>Predicted</th>
              <th>Age</th><th>BMI</th><th>Glucose</th>
            </tr>
            ${samples}
          </table>
        </div>
      </div>`;
  } catch (e) {
    resultDiv.innerHTML = `<div class="info-box" style="color:var(--red)">⚠️ ${e.message}</div>`;
  } finally {
    btn.disabled    = false;
    btn.textContent = "🧪 Run Batch Test";
  }
});

/* =================================================================
   INIT
================================================================= */
(function init() {
  checkHealth();
  setInterval(checkHealth, 30_000);
  refreshHistory();
  questionInput.focus();
})();
