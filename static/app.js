/* ── English Dictation App ────────────────────────────────── */

// DOM refs
const textInput = document.getElementById("textInput");
const voiceSelect = document.getElementById("voiceSelect");
const btnGenerate = document.getElementById("btnGenerate");
const statusEl = document.getElementById("status");

const trackingSection = document.getElementById("trackingSection");
const audioBar = document.getElementById("audioBar");
const btnPlay = document.getElementById("btnPlay");
const progressBar = document.getElementById("progressBar");
const progressFill = document.getElementById("progressFill");
const timeDisplay = document.getElementById("timeDisplay");
const trackingWords = document.getElementById("trackingWords");
const audioEl = document.getElementById("audioEl");
const speedToggle = document.getElementById("speedToggle");
const speedMenu = document.getElementById("speedMenu");

const dictationSection = document.getElementById("dictationSection");
const dictationGrid = document.getElementById("dictationGrid");
const btnCheck = document.getElementById("btnCheck");
const btnReplay = document.getElementById("btnReplay");
const scoreBar = document.getElementById("scoreBar");
const scoreFill = document.getElementById("scoreFill");
const scorePercent = document.getElementById("scorePercent");
const scoreDetail = document.getElementById("scoreDetail");

const pctSelect = document.getElementById("pctSelect");
const btnApplyPct = document.getElementById("btnApplyPct");

// State
let wordBoundaries = [];
let originalWords = [];
let isChecked = false;
let trackingHidden = true;
let currentRawText = "";
let currentFolderName = "";

/* ── Load Voices ─────────────────────────────────────────── */
async function loadVoices() {
  try {
    const res = await fetch("/api/voices");
    const voices = await res.json();
    voiceSelect.innerHTML = "";
    voices.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.short;
      opt.textContent = `${v.short}  (${v.gender})`;
      voiceSelect.appendChild(opt);
    });
    const defaultVoice = voices.find((v) => v.short === "nl-NL-ColetteNeural") || voices[0];
    if (defaultVoice) voiceSelect.value = defaultVoice.short;
    btnGenerate.disabled = false;
  } catch (e) {
    voiceSelect.innerHTML = '<option value="">Failed to load voices</option>';
    setStatus("Could not load voices. Is the server running?", true);
  }
}

/* ── Generate TTS ────────────────────────────────────────── */
btnGenerate.addEventListener("click", async () => {
  const text = textInput.value.trim();
  if (!text) {
    setStatus("Please paste some English text first.", true);
    return;
  }

  btnGenerate.classList.add("loading");
  btnGenerate.disabled = true;
  setStatus("Generating audio…");

  try {
    const res = await fetch("/api/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: voiceSelect.value }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Server error");
    }

    const data = await res.json();
    wordBoundaries = data.word_boundaries;
    currentFolderName = data.folder_name || "";
    audioEl.src = data.audio_url;
    audioEl.load();

    buildTrackingWords();
    buildDictation(text);

    trackingSection.classList.add("visible");
    audioBar.classList.add("visible");
    dictationSection.classList.add("visible");
    if (btnApplyPct) btnApplyPct.disabled = false;
    if (pctSelect) pctSelect.disabled = false;
    setStatus("Ready! Press play to listen, then type your dictation below.");
  } catch (e) {
    setStatus("Error: " + e.message, true);
  } finally {
    btnGenerate.classList.remove("loading");
    btnGenerate.disabled = false;
  }
});

/* ── Tracking Words ──────────────────────────────────────── */
let lastActiveIndex = -1;

function buildTrackingWords() {
  lastActiveIndex = -1;
  trackingWords.innerHTML = '<span class="track-word active">…</span>';
  trackingWords.classList.toggle("hidden", trackingHidden);
  const btnHideTrack = document.getElementById("btnHideTrack");
  if (btnHideTrack) btnHideTrack.textContent = trackingHidden ? "👁 Show" : "👁 Hide";
}

function updateTracking() {
  const time = audioEl.currentTime;
  let activeIdx = -1;

  for (let i = 0; i < wordBoundaries.length; i++) {
    const wb = wordBoundaries[i];
    if (time >= wb.start && time <= wb.start + wb.duration) {
      activeIdx = i;
      break;
    }
  }

  if (activeIdx !== lastActiveIndex) {
    lastActiveIndex = activeIdx;
    if (activeIdx >= 0 && wordBoundaries[activeIdx]) {
      trackingWords.innerHTML = `<span class="track-word active">${wordBoundaries[activeIdx].text}</span>`;
    } else {
      trackingWords.innerHTML = `<span class="track-word">…</span>`;
    }
  }
}

/* ── Audio Player ────────────────────────────────────────── */
btnPlay.addEventListener("click", togglePlay);

audioEl.addEventListener("timeupdate", () => {
  updateTracking();
  updateProgress();
});

audioEl.addEventListener("ended", () => {
  btnPlay.textContent = "▶";
});

function updateProgress() {
  if (audioEl.duration) {
    const pct = (audioEl.currentTime / audioEl.duration) * 100;
    progressFill.style.width = pct + "%";
    timeDisplay.textContent = `${fmtTime(audioEl.currentTime)} / ${fmtTime(audioEl.duration)}`;
  }
}

progressBar.addEventListener("click", (e) => {
  if (audioEl.duration) {
    const rect = progressBar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audioEl.currentTime = pct * audioEl.duration;
  }
});

// Speed Dropdown logic
speedToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  speedMenu.classList.toggle("open");
});

document.addEventListener("click", (e) => {
  if (!speedMenu.contains(e.target) && e.target !== speedToggle) {
    speedMenu.classList.remove("open");
  }
});

document.querySelectorAll(".speed-opt").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".speed-opt").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const speed = parseFloat(btn.dataset.speed);
    audioEl.playbackRate = speed;
    speedToggle.textContent = `${speed}×`;
    speedMenu.classList.remove("open");
  });
});

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/* ── Backward / Forward Skip ─────────────────────────────── */
let backwardSec = 3;
let forwardSec = 10;
const MIN_SKIP = 3;
const MAX_SKIP = 10;

const btnBackward = document.getElementById("btnBackward");
const btnForward = document.getElementById("btnForward");
const bwdVal = document.getElementById("bwdVal");
const fwdVal = document.getElementById("fwdVal");

function doBackward() {
  audioEl.currentTime = Math.max(0, audioEl.currentTime - backwardSec);
}

function doForward() {
  if (audioEl.duration) {
    audioEl.currentTime = Math.min(audioEl.duration, audioEl.currentTime + forwardSec);
  }
}

function togglePlay() {
  if (audioEl.paused) {
    audioEl.play();
    btnPlay.textContent = "⏸";
  } else {
    audioEl.pause();
    btnPlay.textContent = "▶";
  }
}

btnBackward.addEventListener("click", doBackward);
btnForward.addEventListener("click", doForward);

// − / + adjustment buttons
document.getElementById("bwdMinus").addEventListener("click", () => {
  backwardSec = Math.max(MIN_SKIP, backwardSec - 1);
  bwdVal.textContent = backwardSec;
});
document.getElementById("bwdPlus").addEventListener("click", () => {
  backwardSec = Math.min(MAX_SKIP, backwardSec + 1);
  bwdVal.textContent = backwardSec;
});
document.getElementById("fwdMinus").addEventListener("click", () => {
  forwardSec = Math.max(MIN_SKIP, forwardSec - 1);
  fwdVal.textContent = forwardSec;
});
document.getElementById("fwdPlus").addEventListener("click", () => {
  forwardSec = Math.min(MAX_SKIP, forwardSec + 1);
  fwdVal.textContent = forwardSec;
});

/* ── Keyboard Shortcuts ──────────────────────────────────── */
document.addEventListener("keydown", (e) => {
  // Shift → play/pause
  if (e.key === "Shift") {
    e.preventDefault();
    togglePlay();
    return;
  }
  // ArrowLeft → backward skip
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    doBackward();
    return;
  }
  // ArrowRight → forward skip
  if (e.key === "ArrowRight") {
    e.preventDefault();
    doForward();
    return;
  }
});

/* ── Dictation ───────────────────────────────────────────── */

/**
 * Normalize a word for comparison: lowercase, strip leading/trailing punctuation.
 * Keeps internal punctuation like apostrophes (it's, don't).
 */
function normalizeWord(w) {
  return w.toLowerCase().replace(/^[^a-zA-Z0-9'äëïöüéèàij]+|[^a-zA-Z0-9'äëïöüéèàij]+$/gi, "");
}

/**
 * Clean text of markdown / special characters for TTS and dictation.
 */
function cleanTextForTTS(text) {
  return text
    // Headings: ## Title → Title
    .replace(/^#{1,6}\s*/gm, "")
    // Bold/italic: **text**, *text*, __text__, _text_
    .replace(/\*{1,3}(.*?)\*{1,3}/g, "$1")
    .replace(/_{1,3}(.*?)_{1,3}/g, "$1")
    // Strikethrough: ~~text~~
    .replace(/~~(.*?)~~/g, "$1")
    // Inline code: `code`
    .replace(/`{1,3}(.*?)`{1,3}/g, "$1")
    // Markdown links: [text](url) → text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    // URLs
    .replace(/https?:\/\/\S+/g, "")
    // HTML tags
    .replace(/<[^>]+>/g, "")
    // Bullet / list markers
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    // Special symbols
    .replace(/[#@^\\|<>{}[\]~]/g, "")
    // Collapse whitespace
    .replace(/\n{2,}/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/**
 * Determine which word indices in a sentence should be hidden.
 * Uses bucket sampling across the sentence so words are evenly distributed
 * and no sentence is 0% or 100% hidden when pct < 100%.
 */
function determineHiddenIndices(wordsInLine, hiddenPct) {
  const N = wordsInLine.length;
  const hiddenSet = new Set();

  if (N === 0) return hiddenSet;
  if (hiddenPct >= 100) {
    for (let i = 0; i < N; i++) hiddenSet.add(i);
    return hiddenSet;
  }

  // Target count of hidden words for this line
  let targetCount = Math.round(N * (hiddenPct / 100));
  if (N >= 2) {
    targetCount = Math.max(1, Math.min(N - 1, targetCount));
  } else {
    targetCount = 1;
  }

  // Divide indices 0...N-1 into targetCount equal buckets and pick 1 per bucket
  const bucketSize = N / targetCount;
  for (let b = 0; b < targetCount; b++) {
    const start = Math.floor(b * bucketSize);
    const end = Math.floor((b + 1) * bucketSize);
    const chosen = start + Math.floor(Math.random() * Math.max(1, end - start));
    hiddenSet.add(chosen);
  }

  return hiddenSet;
}

function buildDictation(text) {
  currentRawText = text;
  dictationGrid.innerHTML = "";
  isChecked = false;
  originalWords = [];

  const hiddenPct = parseInt(pctSelect ? pctSelect.value : 100, 10) || 100;
  const rawLines = text.split("\n");
  let wordCounter = 0;

  rawLines.forEach((rawLine) => {
    const cleanedLine = cleanTextForTTS(rawLine);
    const wordsInLine = cleanedLine.split(/\s+/).filter(Boolean);
    if (wordsInLine.length === 0) return;

    if (dictationGrid.children.length > 0) {
      const lineBreak = document.createElement("div");
      lineBreak.className = "dictation-break";
      dictationGrid.appendChild(lineBreak);
    }

    const hiddenSet = determineHiddenIndices(wordsInLine, hiddenPct);

    wordsInLine.forEach((word, wIdx) => {
      const i = wordCounter++;
      originalWords.push(word);

      const isHidden = hiddenSet.has(wIdx);
      const box = document.createElement("div");
      box.className = "word-box" + (isHidden ? "" : " unhidden");

      if (isHidden) {
        const input = document.createElement("input");
        input.type = "text";
        input.dataset.index = i;
        input.dataset.answer = word;
        const charW = Math.max(word.length * 0.65 + 1.5, 3.5);
        input.style.width = charW + "em";
        input.autocomplete = "off";
        input.spellcheck = false;

        const badge = document.createElement("div");
        badge.className = "word-badge";

        box.appendChild(input);
        box.appendChild(badge);

        // Key handlers
        input.addEventListener("keydown", (e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            handleAdvance(input, i);
          }
          if (e.key === "Backspace" && input.value === "" && i > 0) {
            e.preventDefault();
            const inputs = Array.from(dictationGrid.querySelectorAll("input"));
            let prevInput = null;
            inputs.forEach((inp) => {
              if (parseInt(inp.dataset.index, 10) < i) prevInput = inp;
            });
            if (prevInput) {
              prevInput.focus();
              prevInput.setSelectionRange(prevInput.value.length, prevInput.value.length);
            }
          }
          if (e.key === "Tab") {
            e.preventDefault();
            const inputs = Array.from(dictationGrid.querySelectorAll("input"));
            const currentPos = inputs.indexOf(input);
            const nextPos = e.shiftKey ? currentPos - 1 : currentPos + 1;
            if (nextPos >= 0 && nextPos < inputs.length) inputs[nextPos].focus();
          }
        });

        // Clear state when user focuses missing input
        input.addEventListener("focus", () => {
          if (input.classList.contains("missing")) {
            input.placeholder = "";
            input.classList.remove("missing");
          }
        });

        // Live feedback: clear check state when user modifies
        input.addEventListener("input", () => {
          box.removeAttribute("data-tooltip");
          if (isChecked) {
            input.placeholder = "";
            input.classList.remove("correct", "incorrect", "missing");
            box.querySelector(".word-badge").textContent = "";
            box.querySelector(".word-badge").className = "word-badge";
          }
        });
      } else {
        // Unhidden hint word with matching dummy badge for perfect vertical alignment
        const unhiddenSpan = document.createElement("div");
        unhiddenSpan.className = "unhidden-word";
        unhiddenSpan.textContent = word;

        const dummyBadge = document.createElement("div");
        dummyBadge.className = "word-badge";

        box.appendChild(unhiddenSpan);
        box.appendChild(dummyBadge);
      }

      dictationGrid.appendChild(box);
    });
  });

  // Focus first input
  const firstInput = dictationGrid.querySelector("input");
  if (firstInput) firstInput.focus();

  scoreBar.classList.remove("visible");
}

function handleAdvance(input, index) {
  // Move to next input
  const inputs = Array.from(dictationGrid.querySelectorAll("input"));
  const currentPos = inputs.indexOf(input);
  if (currentPos + 1 < inputs.length) {
    inputs[currentPos + 1].focus();
  }
}

/* ── Check Logic ─────────────────────────────────────────── */
btnCheck.addEventListener("click", () => {
  const inputs = dictationGrid.querySelectorAll("input");
  let correctCount = 0;
  let wrongCount = 0;
  let missingCount = 0;

  inputs.forEach((input) => {
    const answer = input.dataset.answer;
    const typed = input.value.trim();
    const badge = input.parentElement.querySelector(".word-badge");
    const box = input.parentElement;

    // Remove old classes, placeholder, and tooltip
    input.classList.remove("correct", "incorrect", "missing");
    input.placeholder = "";
    if (badge) badge.className = "word-badge";
    box.removeAttribute("data-tooltip");

    if (!typed) {
      // Empty = missing -> display word as dim placeholder text without changing value
      input.classList.add("missing");
      input.placeholder = answer;
      if (badge) badge.textContent = "";
      missingCount++;
    } else if (normalizeWord(typed) === normalizeWord(answer)) {
      // Correct -> keep typed text
      input.classList.add("correct");
      if (badge) {
        badge.textContent = "✓";
        badge.classList.add("badge-correct");
      }
      correctCount++;
    } else {
      // Wrong -> mark incorrect and add hover tooltip with correct answer
      input.classList.add("incorrect");
      if (badge) {
        badge.textContent = "✗";
        badge.classList.add("badge-wrong");
      }
      box.dataset.tooltip = answer;
      wrongCount++;
    }
  });

  isChecked = true;

  // Show score (only count hidden words)
  const total = inputs.length;
  const pct = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  scoreFill.style.width = pct + "%";
  scorePercent.textContent = pct + "%";

  // Detail text
  scoreDetail.textContent = `${correctCount} correct · ${wrongCount} wrong · ${missingCount} missing  (${total} blanks)`;

  // Color
  if (pct >= 80) {
    scoreFill.style.background = "var(--success)";
    scorePercent.style.color = "var(--success)";
  } else if (pct >= 50) {
    scoreFill.style.background = "var(--warning)";
    scorePercent.style.color = "var(--warning)";
  } else {
    scoreFill.style.background = "var(--error)";
    scorePercent.style.color = "var(--error)";
  }

  scoreBar.classList.add("visible");
});

btnReplay.addEventListener("click", () => {
  const inputs = dictationGrid.querySelectorAll("input");
  const boxes = dictationGrid.querySelectorAll(".word-box");
  inputs.forEach((input) => {
    input.value = "";
    input.placeholder = "";
    input.classList.remove("correct", "incorrect", "missing");
  });
  boxes.forEach((box) => {
    box.removeAttribute("data-tooltip");
    const badge = box.querySelector(".word-badge");
    if (badge) {
      badge.textContent = "";
      badge.className = "word-badge";
    }
  });
  isChecked = false;
  scoreBar.classList.remove("visible");
  if (btnApplyPct) btnApplyPct.disabled = false;
  if (pctSelect) pctSelect.disabled = false;

  // Pause audio at 0:00 without auto-play
  audioEl.currentTime = 0;
  audioEl.pause();
  btnPlay.textContent = "▶";

  if (inputs.length) inputs[0].focus();
});

/* ── Helpers ─────────────────────────────────────────────── */
function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.className = "status" + (isError ? " error" : "");
}

/* ── Hide / Show Tracking ────────────────────────────────── */
const btnHideTrack = document.getElementById("btnHideTrack");
btnHideTrack.addEventListener("click", () => {
  trackingHidden = !trackingHidden;
  trackingWords.classList.toggle("hidden", trackingHidden);
  btnHideTrack.textContent = trackingHidden ? "👁 Show" : "👁 Hide";
});

/* ── Hidden Percentage Select & Apply ────────────────────── */
if (btnApplyPct) {
  btnApplyPct.addEventListener("click", () => {
    if (currentRawText) {
      buildDictation(currentRawText);
      btnApplyPct.disabled = true;
      if (pctSelect) pctSelect.disabled = true;
    }
  });
}

/* ── Context Popup & Vocabulary Feature ──────────────────── */
const contextPopup = document.getElementById("contextPopup");
const popupStt = document.getElementById("popupStt");
const popupWord = document.getElementById("popupWord");
const popupPhonetic = document.getElementById("popupPhonetic");
const popupEn = document.getElementById("popupNl") || document.getElementById("popupEn");
const popupVn = document.getElementById("popupVn");
const btnPopupSave = document.getElementById("btnPopupSave");

const vocabChip = document.getElementById("vocabChip");
const chipCount = document.getElementById("chipCount");
const vocabPanel = document.getElementById("vocabPanel");
const panelCount = document.getElementById("panelCount");
const btnClosePanel = document.getElementById("btnClosePanel");
const btnExportVocab = document.getElementById("btnExportVocab");
const vocabList = document.getElementById("vocabList");

let savedVocab = [];
let currentLookupData = null;
const clientLookupCache = {};

// Right-click on selection -> open context popup
document.addEventListener("contextmenu", async (e) => {
  const selection = window.getSelection().toString().trim();
  if (!selection || selection.length > 50) {
    contextPopup.classList.remove("visible");
    return;
  }

  e.preventDefault();

  const nextStt = savedVocab.length + 1;
  const cleanWordKey = selection.toLowerCase();

  const posX = Math.min(e.clientX, window.innerWidth - 330);
  const posY = Math.min(e.clientY, window.innerHeight - 200);
  contextPopup.style.left = Math.max(10, posX) + "px";
  contextPopup.style.top = Math.max(10, posY) + "px";

  // Check client-side cache for instant display (0ms)
  if (clientLookupCache[cleanWordKey]) {
    const data = clientLookupCache[cleanWordKey];
    const defText = data.nl || data.en || "";
    currentLookupData = {
      stt: nextStt,
      word: data.word,
      phonetic: data.phonetic,
      en: defText,
      vn: data.vn,
    };
    popupStt.textContent = nextStt;
    popupWord.textContent = data.word;
    popupPhonetic.textContent = data.phonetic;
    if (popupEn) popupEn.textContent = defText;
    popupVn.textContent = data.vn;
    btnPopupSave.disabled = false;
    contextPopup.classList.add("visible");
    return;
  }

  // Pre-set word immediately with subtle placeholder
  popupStt.textContent = nextStt;
  popupWord.textContent = selection;
  popupPhonetic.textContent = "";
  if (popupEn) popupEn.textContent = "…";
  popupVn.textContent = "…";
  btnPopupSave.disabled = true;

  try {
    const res = await fetch("/api/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word: selection }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    clientLookupCache[cleanWordKey] = data;
    const defText = data.nl || data.en || "";

    currentLookupData = {
      stt: nextStt,
      word: data.word,
      phonetic: data.phonetic,
      en: defText,
      vn: data.vn,
    };

    popupWord.textContent = data.word;
    popupPhonetic.textContent = data.phonetic;
    if (popupEn) popupEn.textContent = defText;
    popupVn.textContent = data.vn;
    btnPopupSave.disabled = false;
    contextPopup.classList.add("visible");
  } catch (err) {
    if (popupEn) popupEn.textContent = "Could not fetch definition.";
    popupVn.textContent = "Không thể tra từ.";
    contextPopup.classList.add("visible");
  }
});

// Close popup on outside click
document.addEventListener("click", (e) => {
  if (contextPopup && !contextPopup.contains(e.target)) {
    contextPopup.classList.remove("visible");
  }
});

// Save word button in popup
btnPopupSave.addEventListener("click", () => {
  if (!currentLookupData) return;

  const exists = savedVocab.some((w) => w.word.toLowerCase() === currentLookupData.word.toLowerCase());
  if (!exists) {
    const wasEmpty = savedVocab.length === 0;
    currentLookupData.stt = savedVocab.length + 1;
    savedVocab.push(currentLookupData);
    updateVocabUI();

    // Auto-show panel ONLY when panel was empty
    if (wasEmpty) {
      vocabPanel.classList.add("open");
    }
  }

  contextPopup.classList.remove("visible");
});

// Render saved vocabulary list
function updateVocabUI() {
  const count = savedVocab.length;
  chipCount.textContent = count;
  panelCount.textContent = count;

  if (count === 0) {
    vocabList.innerHTML = '<div class="vocab-empty">No words saved yet. Highlight any word & right-click!</div>';
    return;
  }

  vocabList.innerHTML = "";
  savedVocab.forEach((item, idx) => {
    item.stt = idx + 1;
    const card = document.createElement("div");
    card.className = "vocab-card";
    const labelLang = document.getElementById("popupNl") ? "NL" : "EN";
    const defVal = item.nl || item.en || "";
    card.innerHTML = `
      <button class="btn-del-vocab" data-index="${idx}" title="Remove word">✖</button>
      <div class="vocab-card-header">
        <span class="vocab-card-title">${item.stt}. ${item.word}</span>
        <span class="vocab-card-phonetic">${item.phonetic}</span>
      </div>
      <div class="vocab-card-line"><strong>${labelLang}:</strong> ${defVal}</div>
      <div class="vocab-card-line"><strong>VN:</strong> ${item.vn}</div>
    `;
    vocabList.appendChild(card);
  });

  vocabList.querySelectorAll(".btn-del-vocab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = parseInt(btn.dataset.index, 10);
      savedVocab.splice(index, 1);
      updateVocabUI();
    });
  });
}

// Toggle panel with floating chip
vocabChip.addEventListener("click", () => {
  vocabPanel.classList.toggle("open");
});

btnClosePanel.addEventListener("click", () => {
  vocabPanel.classList.remove("open");
});

// Save vocabulary to local file
btnExportVocab.addEventListener("click", async () => {
  if (savedVocab.length === 0) {
    alert("No words saved to export!");
    return;
  }

  try {
    btnExportVocab.disabled = true;
    btnExportVocab.textContent = "Saving…";

    const res = await fetch("/api/save-vocab", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ words: savedVocab, folder_name: currentFolderName }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Save failed");

    alert(`Saved to local file:\n${data.filepath}`);
  } catch (err) {
    alert("Error saving file: " + err.message);
  } finally {
    btnExportVocab.disabled = false;
    btnExportVocab.textContent = "💾 Save to File";
  }
});

/* ── Init ────────────────────────────────────────────────── */
loadVoices();
