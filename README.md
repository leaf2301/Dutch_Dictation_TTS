# 🇳🇱 Dutch Dictation & TTS Practice App

A web application designed for practicing Dutch listening, dictation, and vocabulary building using Microsoft Edge Neural Dutch Text-to-Speech (TTS).

---

## 🌟 Key Features

- **Dutch Neural Text-to-Speech**: High-quality Dutch and Belgian voices powered by `edge-tts` (e.g., `nl-NL-ColetteNeural`, `nl-NL-FennaNeural`, `nl-BE-ArnaudNeural`).
- **Interactive Dictation Grid**: Practice dictation by filling in blank spaces. Customize blank percentage from 50% to 100%.
- **Single-Word Real-Time Tracking**: Displays only the single active word currently being read in real time.
- **Instant Word Lookup & Translation**: Select and right-click any Dutch word to view its phonetic breakdown, Dutch definition, and Vietnamese translation.
- **Hybrid Offline-First Dictionary**: Uses an offline SQLite database (`dict.db`) for instant 0ms word lookup, with online API fallback.
- **Vocabulary Drawer & Export**: Save words into a drawer panel and export `vocabulary.txt` directly into the lesson's folder inside `sources/`.
- **Keyboard Shortcuts & Audio Controls**:
  - `Shift`: Play / Pause audio (works even while typing in input boxes).
  - `←` / `→`: Skip backward 3s / forward 10s.
  - Adjustable playback speed (0.5× to 1.5×).

---

## 🚀 How to Use

### 1. Installation

Install the required Python dependencies:

```bash
pip install -r requirements.txt
```

### 2. Running the App

Start the Flask server:

```bash
python app.py
```

Open your browser and navigate to:
[http://127.0.0.1:5001](http://127.0.0.1:5001)

### 3. Quick Start Guide

1. **Paste Text**: Paste your Dutch passage into the text input area.
2. **Select Voice & Generate**: Pick a voice (e.g., `nl-NL-ColetteNeural`) and click **▶ Generate**.
3. **Practice Dictation**: Press `Shift` to play the audio, and type the missing words into the input boxes.
4. **Check Score**: Click **✓ Check** to verify your answers and see your score. Click **🔁 Replay** to reset the inputs and start over from 0:00.
5. **Lookup & Save Vocab**: Highlight any word in the passage and right-click to view definitions. Click **💾 Save** to add it to your saved vocabulary panel.
6. **Save to File**: Click **💾 Save to File** in the vocabulary panel to export saved words to `sources/<lesson_title>/vocabulary.txt`.
