import os, time, wave, socket, json, logging
import sounddevice as sd
from flask import Flask, jsonify, send_from_directory, request
from datetime import datetime

# ================= НАСТРОЙКИ =================
DEFAULT_BASE_PATH = r"\\Mikola\tds\record"
CONFIG_FILE = "agent_config.json"

SAMPLE_RATE = 44100
CHANNELS = 1
CHUNK = 1024
FILE_DURATION_SEC = 5 * 60   # 5 минут

HOSTNAME = socket.gethostname()

# -------- конфигурация --------
def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"base_path": DEFAULT_BASE_PATH}

def save_config(cfg):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)

config = load_config()

def get_record_folder():
    folder = os.path.join(config["base_path"], HOSTNAME)
    os.makedirs(folder, exist_ok=True)
    return folder

RECORD_FOLDER = get_record_folder()

# ================= СОСТОЯНИЕ =================
recording = False
stream = None
current_wav = None
file_start_time = 0

# ================= АУДИО =================
def open_new_file():
    global current_wav, file_start_time, RECORD_FOLDER

    RECORD_FOLDER = get_record_folder()

    filename = datetime.now().strftime("%Y-%m-%d_%H-%M-%S.wav")
    path = os.path.join(RECORD_FOLDER, filename)

    current_wav = wave.open(path, "wb")
    current_wav.setnchannels(CHANNELS)
    current_wav.setsampwidth(2)
    current_wav.setframerate(SAMPLE_RATE)

    file_start_time = time.time()

def close_current_file():
    global current_wav
    if current_wav:
        current_wav.close()
        current_wav = None

def audio_callback(indata, frames, time_info, status):
    global current_wav, file_start_time

    if not recording:
        return

    if time.time() - file_start_time >= FILE_DURATION_SEC:
        close_current_file()
        open_new_file()

    current_wav.writeframes(indata.tobytes())

def start_recording():
    global recording, stream

    if recording:
        return

    open_new_file()

    stream = sd.InputStream(
        samplerate=SAMPLE_RATE,
        channels=CHANNELS,
        callback=audio_callback,
        blocksize=CHUNK
    )
    stream.start()
    recording = True

def stop_recording():
    global recording, stream

    recording = False
    if stream:
        stream.stop()
        stream.close()
        stream = None

    close_current_file()

# ================= FLASK API =================
app = Flask(__name__)

# тихий режим логов
logging.getLogger("werkzeug").setLevel(logging.ERROR)

@app.route("/start")
def api_start():
    start_recording()
    return jsonify({"status": "recording"})

@app.route("/stop")
def api_stop():
    stop_recording()
    return jsonify({"status": "stopped"})

@app.route("/status")
def api_status():
    try:
        LOCAL_IP = socket.gethostbyname(socket.gethostname())
    except:
        LOCAL_IP = "0.0.0.0"

    return jsonify({
        "status": "recording" if recording else "stopped",
        "hostname": HOSTNAME,
        "ip": LOCAL_IP,
        "path": config["base_path"]
    })

@app.route("/set_path")
def set_path():
    new_path = request.args.get("path")
    if not new_path:
        return jsonify({"error": "no path provided"}), 400

    config["base_path"] = new_path
    save_config(config)

    global RECORD_FOLDER
    RECORD_FOLDER = get_record_folder()

    return jsonify({"status": "ok", "new_path": new_path})

@app.route("/path")
def get_path():
    return jsonify({"base_path": config["base_path"]})

@app.route("/files")
def list_files():
    files = sorted(os.listdir(RECORD_FOLDER), reverse=True)
    return jsonify({"files": files})

@app.route("/records/<path:filename>")
def get_file(filename):
    return send_from_directory(RECORD_FOLDER, filename)

# -------- УДАЛЕНИЕ ВЫБРАННЫХ ФАЙЛОВ --------
@app.route("/delete", methods=["POST"])
def delete_files():
    data = request.json or {}
    files = data.get("files", [])

    deleted = []
    not_found = []

    for fname in files:
        path = os.path.join(RECORD_FOLDER, fname)
        if os.path.exists(path):
            try:
                os.remove(path)
                deleted.append(fname)
            except Exception as e:
                not_found.append(f"{fname} (error: {str(e)})")
        else:
            not_found.append(fname)

    return jsonify({
        "deleted": deleted,
        "not_found_or_error": not_found
    })

# -------- ОЧИСТКА ПО ДНЯМ --------
@app.route("/cleanup", methods=["POST"])
def cleanup_old_files():
    data = request.json or {}
    days = int(data.get("days", 30))

    cutoff = time.time() - (days * 86400)
    deleted = []

    for fname in os.listdir(RECORD_FOLDER):
        path = os.path.join(RECORD_FOLDER, fname)

        if not os.path.isfile(path):
            continue

        if os.path.getmtime(path) < cutoff:
            try:
                os.remove(path)
                deleted.append(fname)
            except:
                pass

    return {
        "deleted_count": len(deleted),
        "deleted": deleted[:50]
    }

if __name__ == "__main__":
    print(f"Recorder Agent running on {HOSTNAME}")
    app.run(host="0.0.0.0", port=5000, debug=False, use_reloader=False)