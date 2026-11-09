"use strict";

const API_URL = "/predict";
const REQUEST_TIMEOUT_MS = 20000;

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

const form       = document.getElementById("predict-form");
const submitBtn  = document.getElementById("submit-btn");
const resetBtn   = document.getElementById("reset-btn");
const retryBtn   = document.getElementById("retry-btn");
const states     = document.querySelectorAll(".state");
const scoreEl    = document.getElementById("score-value");
const ringBar    = document.getElementById("ring-bar");
const errorText  = document.getElementById("error-text");
const resultCard = document.querySelector(".result-card");

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

  if (field.type === "text") return null;
  if (field.type === "select") return null;

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
    if (field.type === "int" || field.type === "float") {
      payload[field.key] = Number(raw);
    } else {
      payload[field.key] = raw;
    }
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

/* ---------- Result display ---------- */
function animateScore(target) {
  if (countUpFrame) cancelAnimationFrame(countUpFrame);

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finalText = target.toFixed(2);

  if (reduceMotion) {
    scoreEl.textContent = finalText;
    return;
  }

  const duration = 1300;
  const start = performance.now();

  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    scoreEl.textContent = (target * eased).toFixed(2);
    if (t < 1) {
      countUpFrame = requestAnimationFrame(tick);
    } else {
      scoreEl.textContent = finalText; // exact value returned by the model
    }
  }
  countUpFrame = requestAnimationFrame(tick);
}

function showResult(score) {
  showState("success");

  // Restart the ring animation. The ring marks completion only; it is
  // not scaled to the score because no score range is defined.
  ringBar.classList.remove("animate");
  void ringBar.getBoundingClientRect();
  ringBar.classList.add("animate");

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
  getField("age").focus();
}

/* ---------- Wire up ---------- */
form.addEventListener("submit", handleSubmit);
resetBtn.addEventListener("click", handleReset);
retryBtn.addEventListener("click", () => {
  showState("idle");
  form.requestSubmit();
});

// Clear a field's error as soon as the person edits it.
FIELDS.forEach((field) => {
  const control = getField(field.key);
  const evt = field.type === "select" ? "change" : "input";
  control.addEventListener(evt, () => clearFieldError(field.key));
});
