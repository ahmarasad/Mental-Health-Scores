"use strict";

const API_URL = "http://127.0.0.1:8000/predict";
const REQUEST_TIMEOUT_MS = 20000;

/*
  SCORE SCALE AND CATEGORIES
  ---------------------------------------------------------------
  min / max : lowest and highest Mental Health Score in your dataset
  from      : the score where each category starts (inclusive).
              Low starts at min, so it needs no value.

  The three "from" values below split the range 3.6 to 9.4 into four
  equal parts. That is a simple default chosen for this UI, not a
  clinical or dataset-defined cutoff. Change the numbers if you have
  your own boundaries.
*/
const SCORE_SCALE = { min: 3.6, max: 9.4 };

const CATEGORIES = [
  {
    id: "low",
    label: "Low",
    from: null,
    explanation: "This estimate falls in the lowest band of the dataset's score range. It reflects patterns the model learned from its data and is not an assessment of any condition.",
  },
  {
    id: "medium",
    label: "Medium",
    from: 5.05,
    explanation: "This estimate falls in the lower-middle band of the dataset's score range. It reflects patterns the model learned from its data and is not an assessment of any condition.",
  },
  {
    id: "good",
    label: "Good",
    from: 6.5,
    explanation: "This estimate falls in the upper-middle band of the dataset's score range. It reflects patterns the model learned from its data and is not an assessment of any condition.",
  },
  {
    id: "very-good",
    label: "Very Good",
    from: 7.95,
    explanation: "This estimate falls in the highest band of the dataset's score range. It reflects patterns the model learned from its data and is not an assessment of any condition.",
  },
];

const RING_CIRCUMFERENCE = 552.92; // 2 * PI * 88, matches the SVG circle

/*
  Each entry maps a form control (id) to the exact JSON key your
  FastAPI Pydantic model expects.
  type: "int" | "float" | "text" | "select"
*/
const FIELDS = [
  { key: "age",                     label: "Age",                       type: "int",    min: 10, max: 100 },
  { key: "gender",                  label: "Gender",                    type: "select" },
  { key: "country",                 label: "Country",                   type: "text" },
  { key: "academic_Level",          label: "Academic level",            type: "select" },
  { key: "most_Used_Platform",      label: "Most used platform",        type: "select" },
  { key: "purpose_Of_Use",          label: "Purpose of use",            type: "select" },
  { key: "avg_Daily_Usage_Hours",   label: "Average daily usage hours", type: "float",  min: 0, max: 24 },
  { key: "daily_Unlocks",           label: "Daily unlocks",             type: "int",    min: 0 },
  { key: "study_Hours",             label: "Study hours",               type: "float",  min: 0, max: 24 },
  { key: "physical_Activity_Hours", label: "Physical activity hours",   type: "float",  min: 0, max: 24 },
  { key: "sleep_Hours_Per_Night",   label: "Sleep hours per night",     type: "float",  min: 0, max: 24 },
  { key: "stress_Level",            label: "Stress level",              type: "select" },
];

const form          = document.getElementById("predict-form");
const submitBtn     = document.getElementById("submit-btn");
const resetBtn      = document.getElementById("reset-btn");
const retryBtn      = document.getElementById("retry-btn");
const states        = document.querySelectorAll(".state");
const successEl     = document.querySelector(".state-success");
const scoreEl       = document.getElementById("score-value");
const ringBar       = document.getElementById("ring-bar");
const errorText     = document.getElementById("error-text");
const resultCard    = document.querySelector(".result-card");
const badgeLabel    = document.getElementById("category-label");
const explainEl     = document.getElementById("category-explain");
const scaleEl       = document.getElementById("scale");
const scaleBar      = document.getElementById("scale-bar");
const scaleMarker   = document.getElementById("scale-marker");
const scaleTicks    = document.getElementById("scale-ticks");
const progressFill  = document.getElementById("progress-fill");
const progressLabel = document.getElementById("progress-label");

let countUpFrame = null;

/* ---------- UI state ---------- */
function showState(name) {
  states.forEach((el) => {
    el.hidden = el.dataset.state !== name;
  });
}

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitBtn.textContent = isLoading ? "Predicting…" : "Predict score";
}

/* ---------- Progress ---------- */
function updateProgress() {
  const filled = FIELDS.filter((f) => getField(f.key).value.trim() !== "").length;
  progressFill.style.width = `${(filled / FIELDS.length) * 100}%`;
  progressLabel.textContent = `${filled} of ${FIELDS.length} fields completed`;
}

/* ---------- Validation ---------- */
function getField(key) {
  return document.getElementById(key);
}

function setFieldError(key, message) {
  const control = getField(key);
  const wrapper = control.closest(".field");
  wrapper.classList.add("invalid");
  wrapper.querySelector(".error-msg").textContent = message;
  control.setAttribute("aria-invalid", "true");
}

function clearFieldError(key) {
  const control = getField(key);
  const wrapper = control.closest(".field");
  wrapper.classList.remove("invalid");
  wrapper.querySelector(".error-msg").textContent = "";
  control.removeAttribute("aria-invalid");
}

function clearAllErrors() {
  FIELDS.forEach((f) => clearFieldError(f.key));
}

/* Returns an error message string, or null if valid. */
function validateField(field) {
  const raw = getField(field.key).value.trim();

  if (raw === "") {
    return field.type === "select"
      ? `Select ${field.label.toLowerCase()}.`
      : `Enter ${field.label.toLowerCase()}.`;
  }

  if (field.type === "text" || field.type === "select") return null;

  const num = Number(raw);
  if (!Number.isFinite(num)) return `${field.label} must be a number.`;

  if (field.type === "int" && !Number.isInteger(num)) {
    return `${field.label} must be a whole number.`;
  }
  if (field.min !== undefined && num < field.min) {
    return `${field.label} must be at least ${field.min}.`;
  }
  if (field.max !== undefined && num > field.max) {
    return `${field.label} must be at most ${field.max}.`;
  }
  return null;
}

function validateForm() {
  let firstInvalid = null;
  FIELDS.forEach((field) => {
    const message = validateField(field);
    if (message) {
      setFieldError(field.key, message);
      if (!firstInvalid) firstInvalid = field.key;
    } else {
      clearFieldError(field.key);
    }
  });
  return firstInvalid;
}

/* ---------- Payload ---------- */
function buildPayload() {
  const payload = {};
  FIELDS.forEach((field) => {
    const raw = getField(field.key).value.trim();
    payload[field.key] =
      field.type === "int" || field.type === "float" ? Number(raw) : raw;
  });
  return payload;
}

/* ---------- Error handling ---------- */
function labelFor(key) {
  const match = FIELDS.find((f) => f.key === key);
  return match ? match.label : key;
}

async function readErrorMessage(response) {
  let body = null;
  try {
    body = await response.json();
  } catch (_) {
    /* response was not JSON */
  }

  // FastAPI validation errors (422): { detail: [{ loc: [...], msg: "..." }] }
  if (body && Array.isArray(body.detail)) {
    const lines = body.detail.map((item) => {
      const field = Array.isArray(item.loc) ? item.loc[item.loc.length - 1] : "";
      return field ? `${labelFor(field)}: ${item.msg}` : item.msg;
    });
    return `The server rejected the input. ${lines.join(" | ")}`;
  }

  if (body && typeof body.detail === "string") {
    return `Server error (${response.status}): ${body.detail}`;
  }

  return `Server error (${response.status} ${response.statusText || ""}).`.trim();
}

function showError(message) {
  errorText.textContent = message;
  showState("error");
}

/* ---------- Categories ---------- */
function scaleIsConfigured() {
  const { min, max } = SCORE_SCALE;
  const values = [min, ...CATEGORIES.slice(1).map((c) => c.from), max];
  return (
    values.every(Number.isFinite) &&
    min < max &&
    values.every((v, i) => i === 0 || v >= values[i - 1])
  );
}

function categorize(score) {
  if (!scaleIsConfigured()) return null;
  let match = CATEGORIES[0];
  CATEGORIES.slice(1).forEach((c) => {
    if (score >= c.from) match = c;
  });
  return match;
}

function pctOf(value) {
  const { min, max } = SCORE_SCALE;
  return Math.min(Math.max((value - min) / (max - min), 0), 1) * 100;
}

/* Draws the four coloured bands and their boundary numbers. */
function buildScale() {
  const { min, max } = SCORE_SCALE;
  const starts = [min, ...CATEGORIES.slice(1).map((c) => c.from), max];

  scaleBar.innerHTML = "";
  CATEGORIES.forEach((cat, i) => {
    const seg = document.createElement("div");
    seg.className = "scale-seg";
    seg.dataset.c = cat.id;
    seg.style.flex = String(starts[i + 1] - starts[i]);
    scaleBar.appendChild(seg);
  });

  scaleTicks.innerHTML = "";
  starts.forEach((value) => {
    const tick = document.createElement("span");
    tick.style.left = `${pctOf(value)}%`;
    tick.textContent = String(value);
    scaleTicks.appendChild(tick);
  });
}

/* ---------- Result display ---------- */
function animateScore(target) {
  if (countUpFrame) cancelAnimationFrame(countUpFrame);

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finalText = target.toFixed(2);

  if (reduceMotion) {
    scoreEl.textContent = finalText;
    return;
  }

  const from = scaleIsConfigured() ? SCORE_SCALE.min : 0;
  const duration = 1300;
  const start = performance.now();

  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    scoreEl.textContent = (from + (target - from) * eased).toFixed(2);
    if (t < 1) {
      countUpFrame = requestAnimationFrame(tick);
    } else {
      scoreEl.textContent = finalText; // exact value returned by the model
    }
  }
  countUpFrame = requestAnimationFrame(tick);
}

function showResult(score) {
  const category = categorize(score);

  if (category) {
    successEl.dataset.category = category.id;
    badgeLabel.textContent = category.label;
    explainEl.textContent = category.explanation;
    ringBar.style.setProperty(
      "--ring-offset",
      String(RING_CIRCUMFERENCE * (1 - pctOf(score) / 100))
    );
    buildScale();
    scaleEl.hidden = false;
  } else {
    successEl.dataset.category = "none";
    badgeLabel.textContent = "Category unavailable";
    explainEl.textContent = "Add the score range and category boundaries in script.js to see a category.";
    ringBar.style.setProperty("--ring-offset", "0");
    scaleEl.hidden = true;
  }

  showState("success");

  // Restart the ring animation.
  ringBar.classList.remove("animate");
  void ringBar.getBoundingClientRect();
  ringBar.classList.add("animate");

  // Slide the scale marker from the left edge to the score position.
  if (category) {
    scaleMarker.style.transition = "none";
    scaleMarker.style.left = "0%";
    void scaleMarker.getBoundingClientRect();
    scaleMarker.style.transition = "";
    scaleMarker.style.left = `${pctOf(score)}%`;
  }

  animateScore(score);
}

/* ---------- Submit ---------- */
async function handleSubmit(event) {
  event.preventDefault();

  const firstInvalid = validateForm();
  if (firstInvalid) {
    getField(firstInvalid).focus();
    return;
  }

  const payload = buildPayload();

  setLoading(true);
  showState("loading");
  if (window.matchMedia("(max-width: 900px)").matches) {
    resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      showError(await readErrorMessage(response));
      return;
    }

    const data = await response.json();
    const score = data.predicted_mental_health_score;

    if (typeof score !== "number" || !Number.isFinite(score)) {
      showError("The server response did not include a valid predicted_mental_health_score.");
      return;
    }

    showResult(score);
  } catch (err) {
    if (err.name === "AbortError") {
      showError("The request timed out. Check that the FastAPI server is running and try again.");
    } else {
      showError(
        "Could not reach the server at " + API_URL +
        ". Make sure FastAPI is running on port 8000 and try again."
      );
    }
  } finally {
    clearTimeout(timer);
    setLoading(false);
  }
}

/* ---------- Reset ---------- */
function handleReset() {
  if (countUpFrame) cancelAnimationFrame(countUpFrame);
  form.reset();
  clearAllErrors();
  ringBar.classList.remove("animate");
  scoreEl.textContent = "0.00";
  showState("idle");
  setLoading(false);
  updateProgress();
  getField("age").focus();
}

/* ---------- Wire up ---------- */
form.addEventListener("submit", handleSubmit);
resetBtn.addEventListener("click", handleReset);
retryBtn.addEventListener("click", () => {
  showState("idle");
  form.requestSubmit();
});

// Clear a field's error and update progress as soon as the person edits it.
FIELDS.forEach((field) => {
  const control = getField(field.key);
  const evt = field.type === "select" ? "change" : "input";
  control.addEventListener(evt, () => {
    clearFieldError(field.key);
    updateProgress();
  });
});

updateProgress();
