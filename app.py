from flask import Flask, render_template, request, jsonify
from werkzeug.utils import secure_filename
from pathlib import Path
import threading, queue, csv, io, os, sys, time, subprocess
from contextlib import redirect_stdout

import whatsTeste_v2 as wa

BASE = Path(__file__).resolve().parent
UPLOADS = BASE / "uploads"
UPLOADS.mkdir(exist_ok=True)
ALLOWED = {".png", ".jpg", ".jpeg", ".webp", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".txt", ".zip", ".mp4"}
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024

state_lock = threading.RLock()
driver = None
worker = None
logs = []
job = {"running": False, "kind": None, "total": 0, "done": 0, "status": "Aguardando"}
jarvis_process = None

def log(message):
    line = str(message).strip()
    if not line: return
    with state_lock:
        logs.append({"time": time.strftime("%H:%M:%S"), "message": line})
        del logs[:-500]

class QueueWriter(io.TextIOBase):
    def write(self, text):
        if text and text.strip():
            for line in text.rstrip().splitlines(): log(line)
        return len(text)
    def flush(self): pass

def parse_contacts(file_storage=None, manual=None):
    rows = []
    if file_storage and file_storage.filename:
        content = file_storage.read()
        try: decoded = content.decode("utf-8-sig")
        except UnicodeDecodeError: decoded = content.decode("latin-1")
        sample = decoded[:4096]
        try: delimiter = csv.Sniffer().sniff(sample, delimiters=",;\t").delimiter
        except csv.Error: delimiter = ";"
        for row in csv.reader(io.StringIO(decoded), delimiter=delimiter):
            row = [x.strip() for x in row]
            if len(row) >= 2 and any(row):
                if row[0].strip().lower() in {"nome","name","cliente","client"}: continue
                rows.append([row[0], row[1]])
    if manual:
        for line in manual.splitlines():
            bits = [x.strip() for x in line.replace(";", ",").split(",")]
            if len(bits) >= 2 and bits[0] and bits[1]: rows.append(bits[:2])
    clean, seen = [], set()
    for name, phone in rows:
        digits = wa.normalizar_telefone_br(phone)
        if len(digits) >= 10 and digits not in seen:
            clean.append([name, digits]); seen.add(digits)
    return clean

def start_job(kind, total):
    global worker
    with state_lock:
        if job["running"]: return False
        logs.clear()
        job.update(running=True, kind=kind, total=total, done=0, status="Iniciando")
    return True

def finish_job(status="Concluído"):
    with state_lock:
        job["running"] = False
        job["status"] = status

def require_driver():
    global driver
    if driver is None:
        raise RuntimeError("Conecte o WhatsApp Web antes de iniciar esta ação.")
    try: driver.current_url
    except Exception:
        driver = None
        raise RuntimeError("A sessão do Firefox foi encerrada. Conecte novamente.")
    return driver

def run_worker(fn):
    global worker
    def target():
        try:
            with redirect_stdout(QueueWriter()):
                fn()
            finish_job("Concluído")
            log("Operação finalizada.")
        except Exception as exc:
            log(f"ERRO: {exc}")
            finish_job("Falhou")
    worker = threading.Thread(target=target, daemon=True)
    worker.start()

@app.get("/")
def index(): return render_template("index.html")

@app.get("/api/status")
def status():
    with state_lock:
        return jsonify(job=job.copy(), logs=logs[-120:], connected=driver is not None and bool(getattr(driver, "session_id", None)))

@app.post("/api/connect")
def connect():
    global driver
    with state_lock:
        if driver is not None and getattr(driver, "session_id", None):
            return jsonify(ok=True, message="WhatsApp já está conectado.")
    def task():
        global driver
        try:
            log("Abrindo Firefox e carregando WhatsApp Web…")
            with redirect_stdout(QueueWriter()):
                opened = wa.abrir_whats()
            if opened is None: raise RuntimeError("Não foi possível iniciar o Firefox. Verifique se ele está instalado.")
            driver = opened
            log("WhatsApp Web aberto. Escaneie o QR Code, se solicitado.")
            finish_job("Aguardando autenticação")
        except Exception as exc:
            log(f"Falha na conexão: {exc}")
            finish_job("Falhou")
    if not start_job("Conexão", 0): return jsonify(ok=False, error="Já existe uma operação em andamento."), 409
    run_worker(task)
    return jsonify(ok=True, message="Abrindo o WhatsApp Web no Firefox.")

@app.post("/api/disconnect")
def disconnect():
    global driver
    if driver:
        try: driver.quit()
        except Exception: pass
        driver = None
    log("Sessão do navegador encerrada.")
    return jsonify(ok=True)

@app.post("/api/send")
def send():
    global driver
    message = request.form.get("message","").strip()
    contacts = parse_contacts(request.files.get("contacts_file"), request.form.get("manual_contacts",""))
    files = request.files.getlist("attachments")
    if not contacts: return jsonify(ok=False,error="Adicione contatos por CSV ou informe nome e telefone."),400
    if not message and not files: return jsonify(ok=False,error="Informe uma mensagem ou anexe um arquivo."),400
    saved=[]
    for f in files:
        if not f.filename: continue
        name=secure_filename(f.filename)
        if Path(name).suffix.lower() not in ALLOWED: return jsonify(ok=False,error=f"Tipo de arquivo não permitido: {name}"),400
        target=UPLOADS / f"{int(time.time()*1000)}_{name}"
        f.save(target); saved.append(target)
    try: active=require_driver()
    except Exception as exc: return jsonify(ok=False,error=str(exc)),400
    if not start_job("Envio",len(contacts)): return jsonify(ok=False,error="Já existe uma operação em andamento."),409
    photo = next((p for p in saved if p.suffix.lower() in {".png",".jpg",".jpeg",".webp"}),None)
    docs = [p for p in saved if p != photo]
    welcome=request.form.get("welcome")=="true"
    def task():
        log(f"Iniciando envio para {len(contacts)} contato(s).")
        for idx, person in enumerate(contacts,1):
            with state_lock: job["done"]=idx-1; job["status"]=f"Enviando {idx}/{len(contacts)}"
            try:
                ok=wa.abrir_conversa(active, person[1])
                if not ok: raise RuntimeError("Número não localizado no WhatsApp.")
                if photo:
                    wa.enviar_foto_como_midia(active,str(photo))
                for doc in docs:
                    send_document(active,doc)
                if welcome and person[0]:
                    wa.digitar_mensagem(active,f"Olá, {person[0]}! Tudo bem?")
                if message: wa.digitar_mensagem(active,message)
                log(f"✓ {idx}/{len(contacts)} — {person[0]} ({person[1]})")
            except Exception as exc: log(f"✕ {person[0]} ({person[1]}): {exc}")
            with state_lock: job["done"]=idx
        log("Fila de envio processada. Confira os itens marcados com erro antes de repetir.")
    run_worker(task)
    return jsonify(ok=True,count=len(contacts))

def send_document(active, path):
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.common.keys import Keys
    import time as _time
    attach = wa.encontrar_elemento(active, [
        (By.CSS_SELECTOR,'button[aria-label="Anexar"]'),
        (By.CSS_SELECTOR,'button[aria-label="Attach"]'),
    ], timeout=10)
    wa.clicar(active,attach); _time.sleep(0.5)
    # Seleciona explicitamente Documento/Document no menu de anexos.
    document_option=wa.encontrar_elemento(active,[
        (By.XPATH,"//*[self::span or self::div or self::li][normalize-space()='Documento']"),
        (By.XPATH,"//*[self::span or self::div or self::li][normalize-space()='Document']"),
    ],timeout=8)
    wa.clicar(active,document_option); _time.sleep(0.5)
    inputs=active.find_elements(By.CSS_SELECTOR,'input[type="file"]')
    if not inputs: raise RuntimeError("O WhatsApp não disponibilizou o seletor de documentos.")
    target=next((x for x in inputs if "image" not in (x.get_attribute("accept") or "").lower()),inputs[0])
    target.send_keys(str(path))
    button=WebDriverWait(active,25).until(lambda d: next((b for b in d.find_elements(By.XPATH,"//div[@role='button'] | //button") if b.is_displayed() and ("Enviar" in (b.get_attribute("aria-label") or "") or "Send" in (b.get_attribute("aria-label") or ""))),None))
    wa.clicar(active,button)
    _time.sleep(1.5)

@app.post("/api/contacts")
def contacts():
    people=parse_contacts(request.files.get("contacts_file"),request.form.get("manual_contacts",""))
    if not people: return jsonify(ok=False,error="Nenhum contato válido encontrado."),400
    try: active=require_driver()
    except Exception as exc: return jsonify(ok=False,error=str(exc)),400
    if not start_job("Contatos",len(people)): return jsonify(ok=False,error="Já existe uma operação em andamento."),409
    def task():
        added=[]; missing=[]
        wa.adicionar_contatos(people,added,missing,driver=active)
        with state_lock: job["done"]=len(people)
        log(f"Resultado: {len(added)} adicionado(s), {len(missing)} com falha.")
    run_worker(task)
    return jsonify(ok=True,count=len(people))

@app.post("/api/jarvis")
def jarvis():
    global jarvis_process
    if jarvis_process and jarvis_process.poll() is None:
        return jsonify(ok=True,message="Jarvis já está em execução.",url="http://localhost:5173")
    script=BASE/"Jarvis"/"iniciar.sh"
    if not script.exists(): return jsonify(ok=False,error="Arquivos do Jarvis não encontrados no pacote."),404
    env_file=BASE/"Jarvis"/"backend"/".env"
    example=BASE/"Jarvis"/"backend"/".env.example"
    if not env_file.exists():
        if example.exists(): env_file.write_text(example.read_text(encoding="utf-8"),encoding="utf-8")
        return jsonify(ok=False,error="Configuração necessária: edite Jarvis/backend/.env e informe DATABASE_URL (PostgreSQL) e FOURSQUARE_API_KEY. Depois clique novamente."),400
    env_text=env_file.read_text(encoding="utf-8",errors="ignore")
    if "SUA_CHAVE_FOURSQUARE_AQUI" in env_text or "USUARIO:SENHA" in env_text:
        return jsonify(ok=False,error="O arquivo Jarvis/backend/.env ainda contém valores de exemplo. Configure o banco PostgreSQL e a chave Foursquare."),400
    log_file=open(BASE/"Jarvis"/"jarvis-launcher.log","a",encoding="utf-8")
    jarvis_process=subprocess.Popen(["bash",str(script)],cwd=str(script.parent),stdout=log_file,stderr=subprocess.STDOUT,start_new_session=True)
    return jsonify(ok=True,message="Inicialização do Jarvis solicitada. Se for a primeira vez, aguarde a instalação das dependências.",url="http://localhost:5173")

@app.get("/api/jarvis/status")
def jarvis_status():
    running=jarvis_process is not None and jarvis_process.poll() is None
    return jsonify(running=running,url="http://localhost:5173")

if __name__ == "__main__":
    import webbrowser
    host=os.environ.get("WEB_HOST","127.0.0.1")
    port=int(os.environ.get("WEB_PORT","8765"))
    threading.Timer(1.2,lambda:webbrowser.open(f"http://{host}:{port}")).start()
    app.run(host=host,port=port,debug=False,threaded=True)
