# Claude-Bridge — Consumer Integration Guide

**Zielgruppe:** Entwickler von Consumer-Projekten (z.B. ein CRM oder Dashboard), die KI-Aufrufe ueber
die lokale Claude-Bridge starten moechten.
**Version:** 0.3.0 (content-agnostische Bridge)

---

## 1. Was die Bridge ist

Die Claude-Bridge ist eine **content-agnostische Ausfuehrungs- und Streaming-Schicht**.
Sie empfaengt einen Prompt-Template-Text + Daten vom Consumer-Projekt, rendert den
Prompt, spawnt `claude` CLI als Subprocess und streamt das Ergebnis als Server-Sent-
Events (SSE) zurueck.

**Was die Bridge NICHT macht:**
- Sie speichert **keine** Agent-Definitionen des Projekts.
- Sie speichert **keine** Brand-Voice-Texte oder System-Prompts.
- Sie kennt den Agent inhaltlich nicht — `agentId` ist nur ein Logging-Label.

**Konsequenz:** Das Consumer-Projekt bleibt die einzige Source of Truth fuer seine
eigenen Inhalte (Agent-MD-Dateien, Prompts, Brand Voice). Aenderungen an diesen
Inhalten erfordern keine Anpassung in der Bridge.

---

## 2. Token und Auth

### Token lesen

Die Bridge generiert beim ersten Start ein Bearer-Token und schreibt es nach:

```
~/.claude-bridge/token.txt
```

Consumer-Projekte lesen das Token aus dieser Datei zur Laufzeit (nie einchecken!).

### Bind-Adresse

Die Bridge laeuft ausschliesslich auf:

```
http://127.0.0.1:7777
```

Kein externer Zugriff. Alle Aufrufe erfolgen lokal.

### Authorization-Header

Jeder Aufruf ausser `GET /health` benoetigt:

```
Authorization: Bearer <token>
```

Fehlt der Header oder ist der Token falsch, antwortet die Bridge mit `401 Unauthorized`.

### Health-Check (ohne Auth)

```
GET http://127.0.0.1:7777/health
→ { "ok": true, "version": "0.3.0" }
```

---

## 3. `POST /run` Contract

### Endpoint

```
POST http://127.0.0.1:7777/run
Content-Type: application/json
Authorization: Bearer <token>
```

### Request-Schema

```jsonc
{
  // Label fuer Logging + SSE-Echo (kein Pflichtfeld, default "unknown")
  "agentId":   "crm-linkedin-message",

  // Label fuer Logging (kein Pflichtfeld, default "unknown")
  "namespace": "crm",

  // PFLICHT: Nunjucks-Template-Text (aus dem Projekt-Repo)
  "promptTemplate": "Schreib eine kurze Nachricht an {{contact.full_name}}. Anlass: {{intent}}.",

  // Render-Kontext fuer das Template (default: leeres Objekt)
  "data": {
    "contact": { "full_name": "Max Mustermann" },
    "intent":  "Termin vereinbaren"
  },

  // Optional: Brand-Voice- / System-Prompt-Text (aus dem Projekt-Repo)
  // Fehlt er, laeuft der Call ohne zusaetzlichen System-Prompt.
  "systemPrompt": "<Inhalt der brand-voice.md>",

  // Alle execution-Felder sind optional
  "execution": {
    "model":          "sonnet",   // Alias oder volle Model-ID (s. Abschnitt 4)
    "fallbackModel":  "haiku",    // Auto-Fallback bei Ueberlast/Nichtverfuegbarkeit
    "tools":          [],         // [] = keine built-in Tools (empfohlener Default)
    "strictMcp":      true,       // true = MCP-Server-Tools aus (empfohlener Default)
    "cwd":            null,       // Arbeitsverzeichnis fuer den Subprocess (selten noetig)
    "timeoutSeconds": 120         // Kill nach Timeout (kein Default = kein Timeout)
  }
}
```

### Antwort

Die Bridge antwortet sofort mit `200 OK` und `Content-Type: text/event-stream`.
Der Body ist ein SSE-Stream (s. Abschnitt 7). Es gibt keine JSON-Antwort bei Erfolg —
das Ergebnis kommt via `result`-Event.

### Pflicht- und optionale Felder (Zusammenfassung)

| Feld | Pflicht | Default |
|---|---|---|
| `promptTemplate` | ja | — |
| `agentId` | nein | `"unknown"` |
| `namespace` | nein | `"unknown"` |
| `data` | nein | `{}` |
| `systemPrompt` | nein | kein System-Prompt |
| `execution` | nein | alle Defaults (s.u.) |
| `execution.model` | nein | CLI-Default |
| `execution.fallbackModel` | nein | kein Fallback |
| `execution.tools` | nein | `undefined` (keine built-in Tools, CLI: `--tools ToolSearch`) |
| `execution.strictMcp` | nein | `undefined` (kein `--strict-mcp-config`) |
| `execution.cwd` | nein | `null` (Bridge-Verzeichnis) |
| `execution.timeoutSeconds` | nein | kein Timeout |

---

## 4. Modellwahl

### Erlaubte Werte fuer `execution.model`

- **Kurzaliase:** `opus`, `sonnet`, `haiku`, `fable`
- **Volle Model-IDs:** z.B. `claude-opus-4-5`, `claude-sonnet-4-5` (aktuell in der CLI konfiguriert)

### `fallbackModel`

Wenn das primaere Modell nicht verfuegbar ist (Ueberlast, Maintenance), wechselt
die CLI automatisch auf `fallbackModel`. Gleiches Format wie `model`.

### Empfehlungen pro Anwendungsfall

| Anwendungsfall | Empfohlenes Modell |
|---|---|
| Kurztext, strukturierte Ausgabe (JSON), einfache Klassifikation | `haiku` |
| Standardaufgaben (Nachrichten, Zusammenfassungen, moderate Komplexitaet) | `sonnet` |
| Tiefe Recherche, Architektur-Analyse, vielschichtige Argumentation | `opus` |
| Kreativer Content (Brand Voice-nah) | `fable` |

### Wer bestimmt das Modell?

Das **Projekt** bestimmt das Modell in der Agent-MD-Datei (Frontmatter `model: sonnet`)
und schickt es pro Call mit. Die Bridge wertet den Wert aus, aber ueberschreibt nie.
Fehlt `model` im Request, nutzt die CLI ihren intern konfigurierten Default.

---

## 5. Sandbox-Konventionen

### Default: volle Sandbox (empfohlen)

Fuer Agenten, die keinen externen Tool-Zugriff brauchen (Texterstellung, Analyse):

```json
"execution": {
  "tools":     [],
  "strictMcp": true
}
```

- `tools: []` → `--tools ToolSearch` (keine built-in Tools wie Bash, Read, Write; `ToolSearch` haelt nur den Zugang zu MCP-Connectoren offen)
- `strictMcp: true` → `--strict-mcp-config` (MCP-Server-Tools deaktiviert)

Damit laeuft der Agent vollstaendig sandboxed und kann nur den Prompt verarbeiten.

### Ausnahme: MCP-Connector-Agents

Agents, die einen claude.ai-MCP-Connector benoetigen (z.B. Indeed-Jobsuche via
`mcp__claude_ai_Indeed__search_jobs`), setzen `strictMcp: false` oder lassen es weg:

```json
"execution": {
  "tools":     [],
  "strictMcp": false
}
```

So bleiben die MCP-Server-Tools erreichbar, waehrend built-in Tools weiterhin gesperrt
sind. `strictMcp` weglassen hat denselben Effekt.

### Einzelne built-in Tools erlauben

Um nur bestimmte Tools zu erlauben (z.B. nur `Read`):

```json
"execution": {
  "tools": ["Read"],
  "strictMcp": true
}
```

---

## 6. Brand Voice uebergeben

### Prinzip: kein Inhalt in der Bridge

Die Bridge speichert **keine** Brand-Voice-Dateien. Das Projekt liest seine eigene
`brand-voice.md` (oder aequivalente Datei) und schickt den Textinhalt als
`systemPrompt` mit:

```javascript
// Im Consumer-Projekt (Node.js-Beispiel)
import { readFileSync } from 'fs'
import { join } from 'path'

const brandVoice = readFileSync(join(import.meta.dirname, 'brand-voice.md'), 'utf8')

const body = {
  promptTemplate: '...',
  data: { ... },
  systemPrompt: brandVoice,  // <-- ganzer Text, nicht ein Pfad
  execution: { model: 'sonnet', tools: [], strictMcp: true }
}
```

### Was die Bridge damit macht

Die Bridge schreibt `systemPrompt` in eine **Temp-Datei** und uebergibt sie via
`--append-system-prompt-file <tmp>` an die CLI. Grund: lange Brand-Voice-Texte wuerden
das Windows-Kommandozeilen-Laengenlimit (~32k Zeichen) reissen, wenn sie direkt als
Argument uebergeben wuerden. Die Temp-Datei wird nach Run-Ende (auch im Fehlerfall)
automatisch geloescht.

**Wichtig:** `--append-system-prompt-file` haengt den Text an Claudes Default-System-
Prompt **an** — er ueberschreibt ihn nicht.

---

## 7. SSE-Events lesen

### Content-Type und Format

Die Bridge antwortet mit `Content-Type: text/event-stream`. Jedes SSE-Frame hat die Form:

```
event: <event-name>
data: <json-objekt>

```

(Zwei Zeilenumbrueche beenden das Frame.)

### Event-Reihenfolge

```
run_start  →  delta* (0..n)  →  rate_limit* (0..n)  →  result  →  run_end
```

`delta` und `rate_limit` koennen in beliebiger Anzahl und Reihenfolge erscheinen.
Im Fehlerfall kann vor `run_end` ein `error`-Event erscheinen.

### Event-Definitionen

#### `run_start`

Wird sofort nach dem Spawn gesendet. Bestaetigt, dass der Run gestartet wurde.

```json
{
  "runId":     "550e8400-e29b-41d4-a716-446655440000",
  "agentId":   "crm-linkedin-message",
  "namespace": "crm"
}
```

| Feld | Typ | Beschreibung |
|---|---|---|
| `runId` | `string` (UUID) | Eindeutige Run-ID fuer diesen Aufruf |
| `agentId` | `string` | Echo des gesendeten `agentId`-Labels |
| `namespace` | `string` | Echo des gesendeten `namespace`-Labels |

#### `delta`

Inkrementelles Text-Stueck waehrend der Generierung (Thinking oder Output-Text).

```json
{
  "type":      "delta",
  "blockType": "text",
  "text":      "Sehr geehrter Herr Mustermann,"
}
```

| Feld | Typ | Beschreibung |
|---|---|---|
| `type` | `"delta"` | Event-Typ |
| `blockType` | `"thinking"` \| `"text"` | `"thinking"` = internes Reasoning (Extended Thinking); `"text"` = Output-Text |
| `text` | `string` | Textinhalt des Blocks |

#### `rate_limit`

Wird gesendet, wenn die CLI ein Rate-Limit-Event meldet (z.B. Budget-Ueberschreitung
oder bevorstehender Reset).

```json
{
  "type": "rate_limit",
  "info": {
    "status":                 "allowed",
    "resetsAt":               1718870400,
    "rateLimitType":          "requests_per_day",
    "overageStatus":          "disabled",
    "overageDisabledReason":  null,
    "isUsingOverage":         false
  }
}
```

| Feld | Typ | Beschreibung |
|---|---|---|
| `type` | `"rate_limit"` | Event-Typ |
| `info.status` | `string` | `"allowed"` = OK; andere Werte = blockiert (s. Abschnitt 8) |
| `info.resetsAt` | `number` | Unix-Timestamp: wann das Limit zurueckgesetzt wird |
| `info.rateLimitType` | `string` | Art des Limits (z.B. `"requests_per_day"`) |
| `info.overageStatus` | `string` | Overage-Zustand |
| `info.overageDisabledReason` | `string \| null` | Grund bei deaktiviertem Overage |
| `info.isUsingOverage` | `boolean` | Wird Overage genutzt? |

#### `result`

Das Endergebnis des Runs. Kommt genau einmal, kurz vor `run_end`.

```json
{
  "type":         "result",
  "text":         "Sehr geehrter Herr Mustermann, ...",
  "isError":      false,
  "totalCostUsd": 0.0032,
  "sessionId":    "sess_abc123",
  "stopReason":   "end_turn"
}
```

| Feld | Typ | Beschreibung |
|---|---|---|
| `type` | `"result"` | Event-Typ |
| `text` | `string` | Kompletter generierter Text |
| `isError` | `boolean` | `true` wenn Claude einen Fehler gemeldet hat |
| `totalCostUsd` | `number` | Kosten dieses Calls in USD (informatorisch bei Max-Subscription) |
| `sessionId` | `string` | Interne Sitzungs-ID der CLI |
| `stopReason` | `string` | Warum die Generierung endete (z.B. `"end_turn"`, `"max_tokens"`) |

#### `run_end`

Letztes Event. Zeigt an, dass der Subprocess beendet wurde.

```json
{
  "runId":    "550e8400-e29b-41d4-a716-446655440000",
  "exitCode": 0,
  "stderr":   ""
}
```

| Feld | Typ | Beschreibung |
|---|---|---|
| `runId` | `string` | Dieselbe UUID wie in `run_start` |
| `exitCode` | `number \| null` | Exit-Code des Subprocesses; `0` = Erfolg |
| `stderr` | `string` | Erste 2000 Zeichen von stderr (leer bei Erfolg) |

#### `error`

Wird gesendet, wenn der Subprocess nicht gestartet werden konnte (z.B. `claude` nicht
im PATH). Kommt anstelle von `result`, direkt vor `run_end`.

```json
{
  "message": "spawn claude ENOENT"
}
```

---

## 8. Fehlerfaelle

### HTTP 401 — Ungueltige Authentifizierung

**Ursache:** Header fehlt oder Token ist falsch.

```json
HTTP/1.1 401 Unauthorized
```

**Loesung:** Token aus `~/.claude-bridge/token.txt` lesen und korrekt als
`Authorization: Bearer <token>` senden.

### HTTP 400 — Ungueltige Request-Body

**Ursachen:**
- `promptTemplate` fehlt oder ist kein String
- `systemPrompt` ist gesetzt, aber kein String
- `data` ist kein Objekt
- `execution` ist kein Objekt
- Template-Rendering ist fehlgeschlagen (Syntax-Fehler im Nunjucks-Template)

```json
HTTP/1.1 400 Bad Request
{ "error": "promptTemplate is required and must be a non-empty string" }
```

oder bei Render-Fehler:

```json
{ "error": "template render failed: unexpected token" }
```

**Loesung:** Request-Body pruefen. Template-Syntax in Nunjucks validieren.

### SSE `rate_limit` mit `status != "allowed"`

Wenn `info.status` nicht `"allowed"` ist, wurde der Call blockiert oder limitiert.

```json
{ "type": "rate_limit", "info": { "status": "blocked", "resetsAt": 1718870400, ... } }
```

**Empfehlung:** Status pruefen und dem Nutzer anzeigen. `resetsAt` als Datum formatieren
und kommunizieren ("Naechster Call moeglich ab: ...").

### `run_end.exitCode != 0`

Ein Exit-Code ungleich `0` bedeutet, dass `claude` CLI mit einem Fehler beendet hat.
`stderr` enthaelt die ersten 2000 Zeichen der Fehlerausgabe.

```json
{ "runId": "...", "exitCode": 1, "stderr": "Error: model not found ..." }
```

**Empfehlung:** `stderr` loggen und dem Nutzer eine generische Fehlermeldung zeigen.
Haufige Ursachen: Modell nicht verfuegbar, OAuth-Session abgelaufen, Timeout.

### Timeout

Wenn `execution.timeoutSeconds` gesetzt ist und der Subprocess nicht rechtzeitig
endet, wird er beendet. Der Stream endet mit `run_end` (exitCode typischerweise `null`
oder `1`). Kein separates Timeout-Event.

### Client trennt die Verbindung

Wenn der Consumer die SSE-Verbindung schliesst, beendet die Bridge den Subprocess
sofort und bereinigt alle Ressourcen (Temp-Datei etc.).

---

## 9. Copy-Paste-Beispiele

### (a) PowerShell — `curl.exe` mit SSE-Stream

```powershell
$TOKEN = Get-Content "$HOME/.claude-bridge/token.txt"
$body = @{
  agentId = "demo"; namespace = "general"
  promptTemplate = "Begruesse {{name}} auf Deutsch."
  data = @{ name = "Max" }
  systemPrompt = "Du bist hoeflich und kurz."
  execution = @{ model = "haiku"; tools = @(); strictMcp = $true }
} | ConvertTo-Json -Depth 5
curl.exe -N -X POST "http://127.0.0.1:7777/run" `
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d $body
```

**Hinweis:** `-N` (no-buffering) ist noetig, damit curl.exe den SSE-Stream kontinuierlich
ausgibt statt auf den Connection-Close zu warten.

### (b) Browser — `fetch` mit SSE-Stream (zeilenweise)

Minimales Snippet fuer einen Browser-basierten Consumer (z.B. eine Svelte/React-App),
der den Stream zeilenweise liest und die einzelnen Events unterscheidet:

```javascript
async function runBridgeAgent({ agentId, namespace, promptTemplate, data, systemPrompt, execution }) {
  const token = await fetchTokenFromBackend() // Token NIE im Frontend-Bundle!
  const response = await fetch('http://127.0.0.1:7777/run', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ agentId, namespace, promptTemplate, data, systemPrompt, execution }),
  })

  if (!response.ok) {
    const err = await response.json()
    throw new Error(`Bridge error ${response.status}: ${err.error}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE-Frames werden durch Doppel-Newline getrennt
    const frames = buffer.split('\n\n')
    buffer = frames.pop() // letztes (evtl. unvollstaendiges) Frame zurueckhalten

    for (const frame of frames) {
      const lines = frame.split('\n')
      let eventName = ''
      let dataLine = ''
      for (const line of lines) {
        if (line.startsWith('event: ')) eventName = line.slice(7).trim()
        if (line.startsWith('data: '))  dataLine  = line.slice(6).trim()
      }
      if (!eventName || !dataLine) continue

      const payload = JSON.parse(dataLine)

      switch (eventName) {
        case 'run_start':
          console.log('[Bridge] Run gestartet:', payload.runId)
          break

        case 'delta':
          if (payload.blockType === 'text') {
            // Inkrementellen Text an die UI anhaengen
            appendToOutput(payload.text)
          }
          // payload.blockType === 'thinking' koennte optional angezeigt werden
          break

        case 'rate_limit':
          if (payload.info.status !== 'allowed') {
            const resetDate = new Date(payload.info.resetsAt * 1000).toLocaleString()
            showWarning(`Rate-Limit erreicht. Naechster Call moeglich ab: ${resetDate}`)
          }
          break

        case 'result':
          console.log('[Bridge] Kosten:', payload.totalCostUsd, 'USD')
          if (payload.isError) {
            showError('Claude hat einen Fehler gemeldet.')
          }
          break

        case 'run_end':
          if (payload.exitCode !== 0) {
            console.error('[Bridge] Run fehlgeschlagen. stderr:', payload.stderr)
          }
          break

        case 'error':
          showError(`Bridge-Fehler: ${payload.message}`)
          break
      }
    }
  }
}
```

**Wichtig:** Der Bearer-Token darf **nie** im Browser-Bundle gespeichert werden. Da die
Bridge auf `127.0.0.1` laeuft, kann der Token nur von einem lokalen Prozess (z.B. dem
Vite-Dev-Server als Middleware) injiziert werden. Im Production-Build ohne lokales
Backend existiert kein sicherer Weg.
