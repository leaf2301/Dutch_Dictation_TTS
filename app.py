import os
import re
import uuid
import asyncio
import json
import ssl
import sqlite3
import urllib.request
import urllib.parse
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory, send_file
import edge_tts

app = Flask(__name__, static_folder="static")

SOURCES_DIR = os.path.join(os.path.dirname(__file__), "sources")
os.makedirs(SOURCES_DIR, exist_ok=True)
CONFIG_FILE = os.path.join(os.path.dirname(__file__), "config.json")

DEFAULT_SETTINGS = {
    "hidden_pct": 100,
    "backward_sec": 3,
    "forward_sec": 10,
    "pace": 1.0,
}

def load_settings() -> dict:
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                settings = DEFAULT_SETTINGS.copy()
                settings.update(data)
                return settings
        except Exception:
            pass
    return DEFAULT_SETTINGS.copy()

def save_settings(new_settings: dict) -> dict:
    settings = load_settings()
    settings.update(new_settings)
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(settings, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving settings: {e}")
    return settings

DB_PATH = os.path.join(os.path.dirname(__file__), "dict.db")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

LOOKUP_CACHE = {}


def init_db():
    """Initialize local Dutch SQLite dictionary database and seed common Dutch vocabulary."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS dictionary (
        word TEXT PRIMARY KEY,
        phonetic TEXT,
        nl TEXT,
        vn TEXT
    );
    """)
    sample_data = [
        ("hallo", "/haˈloː/", "(interjectie) Begroeting als men iemand ontmoet.", "xin chào"),
        ("dankuwel", "/dɑŋk.yˈʋɛl/", "(interjectie) Uitdrukking van dankbaarheid.", "cảm ơn bạn"),
        ("alsjeblieft", "/ɑls.jəˈblift/", "(interjectie) Vriendelijk verzoek of aanbod.", "làm ơn, xin mời"),
        ("goedemorgen", "/ˌɣu.dəˈmɔr.ɣən/", "(interjectie) Begroeting in de ochtend.", "chào buổi sáng"),
        ("goedemiddag", "/ˌɣu.dəˈmɪ.dɑx/", "(interjectie) Begroeting in de middag.", "chào buổi chiều"),
        ("goedenacht", "/ˌɣu.dəˈnɑxt/", "(interjectie) Afscheidsgroet voor het slapengaan.", "chúc ngủ ngon"),
        ("welkom", "/ˈʋɛl.kɔm/", "(adjectief) Hartelijk ontvangen.", "chào mừng"),
        ("nederlands", "/ˈneː.dər.lɑnts/", "(substantief/adj) De taal van Nederland en Vlaanderen.", "tiếng Hà Lan"),
        ("taal", "/taːl/", "(substantief) Systeem van gesproken en geschreven woorden.", "ngôn ngữ, tiếng"),
        ("leren", "/ˈleː.rən/", "(werkwoord) Kennis of vaardigheden verkrĳgen.", "học, học tập"),
        ("oefenen", "/ˈu.fə.nən/", "(werkwoord) Herhaaldelijk doen om beter te worden.", "luyện tập, thực hành"),
        ("luisteren", "/ˈlœy̯s.tə.rən/", "(werkwoord) Aandachtig horen.", "lắng nghe"),
        ("schrijven", "/ˈsxrɛi̯.vən/", "(werkwoord) Woorden vastleggen op papier of scherm.", "viết"),
        ("spreken", "/ˈspreː.kən/", "(werkwoord) Woorden uiten met de stem.", "nói"),
        ("begrijpen", "/bəˈɣrɛi̯.pən/", "(werkwoord) De betekenis van iets vatten.", "hiểu"),
        ("voorbeeld", "/ˈvoːr.beːlt/", "(substantief) Iets wat dient om te verduidelijken.", "ví dụ, tấm gương")
    ]
    cur.executemany("""
    INSERT OR IGNORE INTO dictionary (word, phonetic, nl, vn)
    VALUES (?, ?, ?, ?)
    """, sample_data)
    conn.commit()
    conn.close()


init_db()


def clean_text_for_tts(text):
    """Strip markdown / special characters so TTS reads only natural words."""
    text = re.sub(r"^#{1,6}\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"\*{1,3}(.*?)\*{1,3}", r"\1", text)
    text = re.sub(r"_{1,3}(.*?)_{1,3}", r"\1", text)
    text = re.sub(r"~~(.*?)~~", r"\1", text)
    text = re.sub(r"`{1,3}(.*?)`{1,3}", r"\1", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"^[\s]*[-*•]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^[\s]*\d+\.\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"[#@^\\|<>{}[\]~]", "", text)
    text = re.sub(r"\n{2,}", "\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def get_safe_title(text):
    """Extract and sanitize first line as title slug for folder & file names."""
    first_line = text.split("\n")[0].strip()
    clean = clean_text_for_tts(first_line)
    safe = re.sub(r"[^a-zA-Z0-9]+", "_", clean).strip("_")
    return safe[:40] if safe else "Dutch_Lesson"


@app.route("/")
def index():
    return send_file("templates/index.html")


@app.route("/api/voices")
def get_voices():
    """Return list of Dutch voices (nl-NL and nl-BE) available in edge-tts."""
    voices = asyncio.run(edge_tts.list_voices())
    nl_voices = [
        {
            "name": v["Name"],
            "short": v["ShortName"],
            "gender": v["Gender"],
            "locale": v["Locale"],
        }
        for v in voices
        if v["Locale"].startswith("nl-")
    ]
    nl_voices.sort(key=lambda v: (v["locale"], v["gender"], v["short"]))
    return jsonify(nl_voices)


@app.route("/api/synthesize", methods=["POST"])
def synthesize():
    """Convert Dutch text to speech and return audio URL + word boundaries."""
    data = request.get_json()
    raw_text = data.get("text", "").strip()
    voice = data.get("voice", "nl-NL-ColetteNeural")

    if not raw_text:
        return jsonify({"error": "Text is required"}), 400

    text = clean_text_for_tts(raw_text)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    folder_name = f"lesson_{timestamp}"
    folder_path = os.path.join(SOURCES_DIR, folder_name)
    os.makedirs(folder_path, exist_ok=True)

    audio_filename = "audio.mp3"
    audio_path = os.path.join(folder_path, audio_filename)

    word_boundaries = []

    async def _generate():
        communicate = edge_tts.Communicate(text, voice, boundary="WordBoundary")
        with open(audio_path, "wb") as f:
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    f.write(chunk["data"])
                elif chunk["type"] == "WordBoundary":
                    word_boundaries.append(
                        {
                            "text": chunk["text"],
                            "offset": chunk["offset"],
                            "duration": chunk["duration"],
                        }
                    )

    asyncio.run(_generate())

    boundaries_sec = []
    for wb in word_boundaries:
        boundaries_sec.append(
            {
                "text": wb["text"],
                "start": wb["offset"] / 10_000_000,
                "duration": wb["duration"] / 10_000_000,
            }
        )

    metadata = {
        "text": raw_text,
        "voice": voice,
        "word_boundaries": boundaries_sec,
    }
    try:
        with open(os.path.join(folder_path, "metadata.json"), "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Could not save metadata.json: {e}")

    return jsonify(
        {
            "audio_url": f"/api/audio/{folder_name}/{audio_filename}",
            "folder_name": folder_name,
            "word_boundaries": boundaries_sec,
        }
    )


@app.route("/api/audio/<folder_name>/<filename>")
def serve_audio(folder_name, filename):
    """Serve generated Dutch audio file from sources/<folder_name>/<filename>."""
    folder_path = os.path.join(SOURCES_DIR, folder_name)
    return send_from_directory(folder_path, filename)


def translate_nl_to_vi(text):
    """Translate Dutch text to Vietnamese using Google Translate free endpoint."""
    try:
        url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=nl&tl=vi&dt=t&q=" + urllib.parse.quote(text)
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=6, context=ssl_ctx) as response:
            res_json = json.loads(response.read().decode("utf-8"))
            if res_json and res_json[0]:
                translated = "".join([part[0] for part in res_json[0] if part and part[0]])
                if translated and translated.strip().lower() != text.strip().lower():
                    return translated.strip()
    except Exception:
        pass
    return ""


def translate_nl_to_nl(text):
    """Translate or define Dutch word in Dutch."""
    try:
        url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=nl&tl=nl&dt=t&q=" + urllib.parse.quote(text)
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=6, context=ssl_ctx) as response:
            res_json = json.loads(response.read().decode("utf-8"))
            if res_json and res_json[0]:
                translated = "".join([part[0] for part in res_json[0] if part and part[0]])
                return translated.strip()
    except Exception:
        pass
    return text


def get_offline_lookup(clean_word):
    """Try to find Dutch word in SQLite dictionary database."""
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT phonetic, nl, vn FROM dictionary WHERE LOWER(word) = LOWER(?)", (clean_word.lower(),))
        row = cur.fetchone()
        if row and (row[1] or row[2]):
            conn.close()
            return {
                "word": clean_word,
                "phonetic": row[0] or f"/{clean_word.lower()}/",
                "nl": row[1] or "Geen Nederlandse definitie gevonden.",
                "vn": row[2] or clean_word,
                "source": "offline"
            }
        conn.close()
    except Exception:
        pass
    return None


def save_offline_lookup(clean_word, phonetic, nl, vn):
    """Save newly fetched online Dutch word definition to local SQLite DB."""
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("""
        INSERT OR REPLACE INTO dictionary (word, phonetic, nl, vn)
        VALUES (?, ?, ?, ?)
        """, (clean_word.lower(), phonetic, nl, vn))
        conn.commit()
        conn.close()
    except Exception:
        pass


@app.route("/api/lookup", methods=["POST"])
def lookup_word():
    """Lookup Dutch phonetic, NL definition, and VN translation."""
    data = request.get_json()
    raw_word = data.get("word", "").strip()
    clean_word = re.sub(r"^[^a-zA-Z0-9'äëïöüéèàij]+|[^a-zA-Z0-9'äëïöüéèàij]+$", "", raw_word, flags=re.IGNORECASE)

    if not clean_word:
        return jsonify({"error": "Word is required"}), 400

    cache_key = clean_word.lower()
    if cache_key in LOOKUP_CACHE:
        return jsonify(LOOKUP_CACHE[cache_key])

    offline_res = get_offline_lookup(clean_word)
    if offline_res:
        LOOKUP_CACHE[cache_key] = offline_res
        return jsonify(offline_res)

    vn_trans = translate_nl_to_vi(clean_word)
    nl_def = translate_nl_to_nl(clean_word)

    res = {
        "word": clean_word,
        "phonetic": f"/{clean_word.lower()}/",
        "nl": nl_def or clean_word,
        "vn": vn_trans or clean_word,
        "source": "online"
    }

    save_offline_lookup(clean_word, res["phonetic"], res["nl"], res["vn"])

    LOOKUP_CACHE[cache_key] = res
    return jsonify(res)


@app.route("/api/save-vocab", methods=["POST"])
def save_vocab_to_file():
    """Save Dutch vocabulary list directly to a local .txt file inside the lesson folder."""
    data = request.get_json()
    words = data.get("words", [])
    folder_name = data.get("folder_name", "").strip()

    if not words:
        return jsonify({"error": "No words to save"}), 400

    if folder_name and os.path.exists(os.path.join(SOURCES_DIR, folder_name)):
        target_dir = os.path.join(SOURCES_DIR, folder_name)
    else:
        target_dir = os.path.join(SOURCES_DIR, "general_vocab")
        os.makedirs(target_dir, exist_ok=True)

    file_path = os.path.join(target_dir, "vocabulary.txt")
    lines = [
        "==================================================",
        "          SAVED DUTCH VOCABULARY LIST             ",
        "==================================================\n"
    ]

    for idx, item in enumerate(words, 1):
        stt = item.get("stt", idx)
        word = item.get("word", "")
        phonetic = item.get("phonetic", "")
        nl = item.get("nl", item.get("en", ""))
        vn = item.get("vn", "")

        lines.append(f"{stt}. {word} - {phonetic}")
        lines.append(f"NL: {nl}")
        lines.append(f"VN: {vn}\n")

    with open(file_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    return jsonify({
        "success": True,
        "filename": "vocabulary.txt",
        "filepath": file_path,
        "message": f"Successfully saved {len(words)} word(s) to local file."
    })


@app.route("/api/settings", methods=["GET", "POST"])
def api_settings():
    if request.method == "POST":
        data = request.get_json() or {}
        updated = save_settings(data)
        return jsonify(updated)
    return jsonify(load_settings())


@app.route("/api/save-progress", methods=["POST"])
def api_save_progress():
    data = request.get_json() or {}
    folder_name = data.get("folder_name", "").strip()

    if not folder_name:
        return jsonify({"error": "Missing folder_name"}), 400

    target_folder = os.path.join(SOURCES_DIR, folder_name)
    if not os.path.exists(target_folder):
        return jsonify({"error": f"Folder {folder_name} does not exist"}), 404

    progress_file = os.path.join(target_folder, "progress.json")
    progress_data = {
        "folder_name": folder_name,
        "raw_text": data.get("raw_text", ""),
        "voice": data.get("voice", ""),
        "hidden_pct": data.get("hidden_pct", 100),
        "pace": data.get("pace", 1.0),
        "audio_time": data.get("audio_time", 0),
        "user_inputs": data.get("user_inputs", {}),
        "last_saved_at": datetime.now().isoformat(),
    }

    try:
        with open(progress_file, "w", encoding="utf-8") as f:
            json.dump(progress_data, f, indent=2, ensure_ascii=False)

        safe_resume_param = urllib.parse.quote(folder_name)
        cmd_path = os.path.join(target_folder, "continue.command")
        cmd_content = f"""#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/../../" && pwd)"
cd "$APP_DIR"

export PORT=5011

if [ -x "$APP_DIR/.venv/bin/python" ]; then
    PY="$APP_DIR/.venv/bin/python"
elif [ -x "$APP_DIR/venv/bin/python" ]; then
    PY="$APP_DIR/venv/bin/python"
elif [ -x "$APP_DIR/.venv/bin/python3" ]; then
    PY="$APP_DIR/.venv/bin/python3"
elif [ -x "/opt/homebrew/bin/python3" ]; then
    PY="/opt/homebrew/bin/python3"
elif [ -x "/usr/local/bin/python3" ]; then
    PY="/usr/local/bin/python3"
else
    PY="python3"
fi

lsof -ti:$PORT | xargs kill -9 2>/dev/null
sleep 0.5

(sleep 2.0 && open "http://127.0.0.1:$PORT/?resume={safe_resume_param}") &
exec "$PY" app.py
"""
        with open(cmd_path, "w", encoding="utf-8") as f:
            f.write(cmd_content)

        try:
            os.chmod(cmd_path, 0o755)
        except Exception:
            pass

        return jsonify(
            {
                "success": True,
                "message": "Progress saved successfully",
                "folder_name": folder_name,
                "cmd_path": cmd_path,
            }
        )
    except Exception as e:
        return jsonify({"error": f"Failed to save progress: {e}"}), 500


@app.route("/api/resume-progress", methods=["GET"])
def api_resume_progress():
    folder_name = request.args.get("folder", "").strip()
    if not folder_name:
        return jsonify({"error": "Missing folder query parameter"}), 400

    target_folder = os.path.join(SOURCES_DIR, folder_name)
    if not os.path.exists(target_folder):
        return jsonify({"error": f"Folder {folder_name} not found"}), 404

    progress_file = os.path.join(target_folder, "progress.json")
    metadata_file = os.path.join(target_folder, "metadata.json")

    if not os.path.exists(progress_file):
        return jsonify({"error": "No saved progress found for this lesson"}), 404

    try:
        with open(progress_file, "r", encoding="utf-8") as f:
            progress_data = json.load(f)

        metadata_data = {}
        if os.path.exists(metadata_file):
            with open(metadata_file, "r", encoding="utf-8") as f:
                metadata_data = json.load(f)

        return jsonify(
            {
                "success": True,
                "progress": progress_data,
                "metadata": metadata_data,
                "audio_url": f"/api/audio/{folder_name}/audio.mp3",
                "folder_name": folder_name,
            }
        )
    except Exception as e:
        return jsonify({"error": f"Error loading progress: {e}"}), 500


if __name__ == "__main__":
    run_port = int(os.environ.get("PORT", 5001))
    app.run(debug=True, port=run_port)
