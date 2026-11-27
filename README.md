# Claude-Bridge

<p>
  <a href="https://claude.ai/artifact/2mejx5sucT1gdPXL8U9vWa"><img alt="Bauplan lesen" src="https://img.shields.io/badge/Bauplan_lesen-%E2%86%92-D1593B?style=for-the-badge"></a>
  <a href="INSTALLATION.md"><img alt="Installation" src="https://img.shields.io/badge/Installation-8_Schritte-385453?style=for-the-badge"></a>
  <a href="https://github.com/grischan15/claude-bridge"><img alt="Code auf GitHub" src="https://img.shields.io/badge/Code_auf_GitHub-grischan15%2Fclaude--bridge-1A2C46?style=for-the-badge&logo=github&logoColor=F4F0E1"></a>
</p>

```bash
git clone https://github.com/grischan15/claude-bridge.git
```

Eine kleine lokale Bridge, über die deine eigenen Web-Apps die `claude`-CLI ansprechen.
Die App schickt einen Prompt per HTTP, die Bridge startet `claude` als Unterprozess und
streamt die Antwort live zurück (Server-Sent Events).

Die CLI ist mit deinem eigenen Claude-Abo angemeldet. Die Aufrufe laufen also über dein
Abo, nicht über einen API-Key.

> **Das Bild dazu:** Dein Rechner ist ein Bürogebäude. Darin sitzt ein Experte mit
> Flatrate-Vertrag (die `claude`-CLI mit deinem Abo). Die Bridge ist der Empfang vor
> seiner Tür. Deine Apps sind die Abteilungen, die Aufträge abgeben. Der Token ist der
> Hausausweis. Und der Empfang hat nur eine interne Durchwahl, keine Tür zur Straße.

---

## Inhalt

- [Was die Bridge kann](#was-die-bridge-kann)
- [Schnellstart](#schnellstart)
- [So rufst du sie auf](#so-rufst-du-sie-auf)
- [Was zurückkommt](#was-zurückkommt)
- [Sicherheit in drei Sätzen](#sicherheit-in-drei-sätzen)
- [Projektstruktur](#projektstruktur)
- [Entwicklung](#entwicklung)
- [Grenzen](#grenzen)
- [Mehrere Agents: p3-dispatch](#mehrere-agents-p3-dispatch)
- [Lizenz](#lizenz)

**Ausführliche Erklärung mit allen Abläufen (Was, Wie, Warum, Alltagsbild):**
[Claude-Bridge Bauplan](https://claude.ai/artifact/2mejx5sucT1gdPXL8U9vWa)

Die ausführliche Schritt-für-Schritt-Installation steht in **[INSTALLATION.md](INSTALLATION.md)**.
Den vollständigen Request-Vertrag mit allen Feldern findest du in
**[docs/consumer-guide.md](docs/consumer-guide.md)**.

---

## Was die Bridge kann

| Funktion | Kurz |
|---|---|
| `GET /health` | Antwortet `{ "ok": true, "version": "0.3.0" }`, ohne Token. |
| `POST /run` | Nimmt Prompt-Vorlage, Daten, optionalen Stil-Text und Optionen. Antwortet als Stream. |
| Vorlagen | Prompts als [Nunjucks](https://mozilla.github.io/nunjucks/)-Vorlagen mit `{{ variablen }}` und `{% if %}`. |
| Modellwahl | `opus`, `sonnet`, `haiku` oder volle Modell-ID, mit Ausweichmodell. |
| Sandbox | Eingebaute Tools (Bash, Write …) standardmäßig gesperrt. |
| Warteschlange | Höchstens 3 Läufe gleichzeitig, der Rest wartet geordnet. |
| Abbruch | Legt die App auf oder läuft der Timeout ab, wird der Prozess beendet und aufgeräumt. |

**Content-agnostisch:** Die Bridge speichert keine Prompts und keine Agents. Alles
Inhaltliche schickt deine App bei jedem Aufruf mit. Deine App bleibt die einzige Quelle
ihrer Inhalte.

---

## Schnellstart

Voraussetzungen: Node.js 20 oder neuer, die `claude`-CLI installiert und mit deinem Abo
angemeldet. Details in [INSTALLATION.md](INSTALLATION.md).

```bash
git clone <url-dieses-repos> claude-bridge
cd claude-bridge
npm install
npm start
```

Beim ersten Start legt die Bridge `~/.claude-bridge/token.txt` an und zeigt:

```
claude-bridge listening on http://127.0.0.1:7777
token: 3f9c…
```

Prüfen, ob sie läuft:

```bash
curl http://127.0.0.1:7777/health
```

---

## So rufst du sie auf

**PowerShell (Windows):**

```powershell
$TOKEN = Get-Content "$HOME/.claude-bridge/token.txt"
$body = @{
  agentId = "demo"; namespace = "general"
  promptTemplate = "Begruesse {{name}} auf Deutsch in einem Satz."
  data = @{ name = "Max" }
  execution = @{ model = "haiku"; tools = @(); strictMcp = $true }
} | ConvertTo-Json -Depth 5
curl.exe -N -X POST "http://127.0.0.1:7777/run" `
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d $body
```

**bash (macOS, Linux, Git Bash):**

```bash
TOKEN=$(cat ~/.claude-bridge/token.txt)
curl -N -X POST http://127.0.0.1:7777/run \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"agentId":"demo","promptTemplate":"Begruesse {{name}} auf Deutsch in einem Satz.","data":{"name":"Max"},"execution":{"model":"haiku","tools":[],"strictMcp":true}}'
```

`-N` schaltet die Pufferung ab, sonst zeigt curl den Stream erst am Ende.

### Der Request

```jsonc
{
  "agentId": "demo",                 // nur ein Label fuer Logs
  "namespace": "general",            // nur ein Label fuer Logs
  "promptTemplate": "Hallo {{name}}", // Pflicht
  "data": { "name": "Max" },         // fuellt die Vorlage
  "systemPrompt": "Du schreibst kurz und klar.", // optional, z. B. deine Brand Voice
  "execution": {
    "model": "sonnet",
    "fallbackModel": "haiku",
    "tools": [],                     // [] = keine eingebauten Tools
    "strictMcp": true,               // true = auch MCP-Connectoren aus
    "timeoutSeconds": 120
  }
}
```

Aus einer Browser-App rufst du die Bridge mit `fetch` auf und liest den Stream zeilenweise.
Ein fertiges Beispiel steht in [docs/consumer-guide.md](docs/consumer-guide.md#9-copy-paste-beispiele).
Wichtig: Der Token gehört nie in den Code, der im Browser landet. Hol ihn über einen kleinen
lokalen Server oder eine Dev-Middleware.

---

## Was zurückkommt

Ein Stream von Events, in dieser Reihenfolge:

```
run_start → (queued) → delta … → rate_limit … → result → run_end
```

| Event | Bedeutung |
|---|---|
| `run_start` | Lauf angenommen, mit `runId`. Kommt sofort. |
| `queued` | Alle Plätze belegt, du wartest. |
| `delta` | Ein Stück Text (`blockType: "text"`) oder Denken (`"thinking"`). |
| `rate_limit` | Stand deines Kontingents. `status` ungleich `"allowed"` heißt: gebremst. |
| `result` | Der ganze Text, dazu `isError` und `stopReason`. |
| `error` | `claude` konnte nicht gestartet werden. |
| `run_end` | Immer zuletzt, mit `exitCode` und Anfang von `stderr`. |

Rechne mit etwa **10 Sekunden**, bis das erste `delta` kommt. Die CLI lädt bei jedem Start
ihre Einstellungen.

---

## Sicherheit in drei Sätzen

1. Die Bridge lauscht nur auf `127.0.0.1`. Aus dem Internet oder deinem WLAN ist sie nicht erreichbar.
2. Ohne den Token aus `~/.claude-bridge/token.txt` nimmt sie keinen Lauf an. Jeder Rechner erzeugt seinen eigenen.
3. Eingebaute Tools sind aus, solange du sie nicht ausdrücklich freigibst.

Mehr, inklusive der Regeln, die du nicht brechen solltest: **[SECURITY.md](SECURITY.md)**.

---

## Projektstruktur

```
src/
  index.ts              Einstieg: Token, Ordner, Server starten
  server.ts             Express: CORS, JSON, /health, Auth, /run
  config.ts             Host, Port, Pfade, Token, Parallel-Limit
  concurrency.ts        Warteschlange (Semaphore)
  claude/
    buildArgs.ts        Optionen -> CLI-Flags
    spawnClaude.ts      claude starten, Prompt ueber stdin
    streamParser.ts     CLI-Ausgabe -> delta / rate_limit / result
    types.ts            Event-Typen
  render/
    template.ts         Nunjucks
    systemPromptFile.ts Stil-Text als Temp-Datei
  http/
    auth.ts             Token pruefen
    runContract.ts      Request pruefen, Standardwerte
    runHandler.ts       der ganze Ablauf eines Laufs
    sse.ts              Stream schreiben
tests/                  Vitest, je Baustein eine Datei
docs/consumer-guide.md  Vollstaendiger Vertrag fuer Apps
examples/test-echo.md   Beispiel, wie eine App einen Agent ablegen kann
```

Laufzeitdaten liegen außerhalb des Projekts in `~/.claude-bridge/`.

---

## Entwicklung

```bash
npm test          # alle Tests (Vitest)
npm run typecheck # TypeScript pruefen
npm run dev       # Neustart bei jeder Aenderung
```

Einstellungen über Umgebungsvariablen:

| Variable | Standard | Wirkung |
|---|---|---|
| `BRIDGE_MAX_CONCURRENCY` | `3` | Wie viele Läufe gleichzeitig. |

Host (`127.0.0.1`) und Port (`7777`) stehen fest in `src/config.ts`.

---

## Grenzen

- **Ein Rechner, eine Person.** Die Bridge ist für deine eigenen Werkzeuge auf deinem eigenen Rechner gebaut.
- **Abo-Bedingungen.** Dein Claude-Abo ist für deine persönliche Nutzung gedacht. Willst du Kunden oder Besucher Läufe auslösen lassen, ist die Claude-API mit eigenem Key der richtige Weg. Lies die aktuellen Bedingungen von Anthropic.
- **Kosten-Anzeige.** `totalCostUsd` meldet die CLI immer. Bei einem Abo ist das eine Anzeige, keine Rechnung.
- **Kein Verlauf.** Die Bridge speichert keine Läufe und keine Logs.
- **Ein Auftrag, ein Modell.** Die Bridge spricht nur `claude` an und arbeitet keine Pläne mit mehreren Schritten ab. Dafür gibt es p3-dispatch (nächster Abschnitt).

---

## Mehrere Agents: p3-dispatch

Die Bridge beantwortet einzelne Aufträge. Willst du einen ganzen Plan abarbeiten lassen,
mit mehreren KI-Helfern parallel, nimm das Schwesterprojekt
**[p3-dispatch](https://github.com/grischan15/p3-dispatch)**:

- ein Controller verteilt die Aufgaben eines Plans, sobald ihre Abhängigkeiten fertig sind
- Claude (`claude -p`) und optional Codex (`codex exec`) arbeiten je in einem eigenen Git-Worktree
- der jeweils andere Anbieter prüft das Ergebnis, bevor es gemergt wird
- läuft ebenfalls nur über deine Abo-Logins, ohne API-Keys

Im Bild: Die Bridge ist der Empfang, p3-dispatch der Projektleiter, der mehrere Experten einteilt.

---

## Lizenz

[MIT](LICENSE)
