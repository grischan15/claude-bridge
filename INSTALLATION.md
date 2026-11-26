# Installation

Schritt für Schritt, von null bis zum ersten Lauf. Plane etwa 20 Minuten ein.

Jeder Schritt hat dieselbe Form: **Was** du tust, **Wie** genau, **Warum** es nötig ist,
und woran du merkst, dass es **geklappt** hat.

---

## Übersicht

```
1. Node.js installieren
2. claude-CLI installieren
3. claude-CLI anmelden
4. Bridge herunterladen
5. Abhaengigkeiten installieren
6. Tests laufen lassen
7. Bridge starten
8. Ersten Lauf ausloesen
```

---

## 1. Node.js installieren

**Was:** Node.js in Version 20 oder neuer.

**Wie:**
- Windows und macOS: Installer von [nodejs.org](https://nodejs.org) (Version „LTS“).
- Linux: über den Paketmanager deiner Distribution oder [nvm](https://github.com/nvm-sh/nvm).
- Mit nvm reicht im Projektordner später `nvm use`, die Version steht in `.nvmrc`.

**Warum:** Die Bridge ist in TypeScript geschrieben und läuft mit Node.

**Geklappt, wenn:**

```bash
node --version   # v20.x oder hoeher
npm --version
```

---

## 2. claude-CLI installieren

**Was:** Claude Code, das Kommandozeilen-Programm `claude`.

**Wie:** Folge der offiziellen Anleitung von Anthropic:
[docs.claude.com/en/docs/claude-code/setup](https://docs.claude.com/en/docs/claude-code/setup).

**Warum:** Die Bridge macht nichts selbst. Sie startet bei jedem Auftrag `claude` und reicht
die Antwort weiter.

**Geklappt, wenn:**

```bash
claude --version
```

> **Windows:** Kommt „Befehl nicht gefunden“, öffne ein neues Terminal. Der Installer trägt
> `claude` erst für neue Fenster in den Suchpfad ein.

---

## 3. claude-CLI anmelden

**Was:** Einmal interaktiv mit deinem Claude-Abo anmelden.

**Wie:**

```bash
claude
```

Folge der Anmeldung im Browser. Danach mit `/exit` beenden.

**Warum:** Die Bridge erbt diese Anmeldung. Ohne sie bekommt jeder Lauf einen Fehler.

**Geklappt, wenn:**

```bash
claude -p "Sag nur: bereit"
```

antwortet. Funktioniert das nicht, funktioniert die Bridge auch nicht. Erst hier weitermachen,
wenn dieser Test klappt.

---

## 4. Bridge herunterladen

**Was:** Den Code auf deinen Rechner holen.

**Wie:**

```bash
git clone <url-dieses-repos> claude-bridge
cd claude-bridge
```

Ohne git: Auf der Repo-Seite „Code“ → „Download ZIP“, entpacken, Terminal im Ordner öffnen.

**Warum:** Wähle einen normalen lokalen Ordner, **nicht** in OneDrive, Dropbox oder iCloud.
Sync-Programme sperren Dateien, während sie kopieren, und das bricht `npm install`.

---

## 5. Abhängigkeiten installieren

**Was:** Die benötigten Pakete (Express, Nunjucks, TypeScript-Werkzeuge).

**Wie:**

```bash
npm install
```

**Warum:** Sie stehen in `package.json` und landen im Ordner `node_modules/`.

**Geklappt, wenn:** der Befehl ohne `ERR!` endet. Warnungen (`WARN`) sind in Ordnung.

---

## 6. Tests laufen lassen

**Was:** Prüfen, ob alles richtig zusammengebaut ist.

**Wie:**

```bash
npm test
npm run typecheck
```

**Warum:** Die Tests rufen `claude` nicht wirklich auf. Sie prüfen jeden Baustein für sich.
So siehst du Probleme mit der Installation, bevor dein Abo ins Spiel kommt.

**Geklappt, wenn:** alle Tests grün sind und `typecheck` nichts ausgibt.

---

## 7. Bridge starten

**Was:** Den Server starten.

**Wie:**

```bash
npm start
```

**Warum:** Beim ersten Start legt die Bridge den Ordner `~/.claude-bridge/` an und erzeugt
darin einen zufälligen Token in `token.txt`. Bei jedem weiteren Start nutzt sie denselben.

**Geklappt, wenn:**

```
claude-bridge listening on http://127.0.0.1:7777
token: …
```

und in einem **zweiten** Terminal:

```bash
curl http://127.0.0.1:7777/health
# {"ok":true,"version":"0.3.0"}
```

Das erste Terminal bleibt offen, solange die Bridge laufen soll. Beenden mit `Strg+C`.

---

## 8. Ersten Lauf auslösen

**Was:** Ein echter Aufruf über dein Abo.

**Wie (PowerShell):**

```powershell
$TOKEN = Get-Content "$HOME/.claude-bridge/token.txt"
$body = @{
  promptTemplate = "Begruesse {{name}} auf Deutsch in einem Satz."
  data = @{ name = "Max" }
  execution = @{ model = "haiku"; tools = @(); strictMcp = $true }
} | ConvertTo-Json -Depth 5
curl.exe -N -X POST "http://127.0.0.1:7777/run" `
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d $body
```

**Wie (bash):**

```bash
TOKEN=$(cat ~/.claude-bridge/token.txt)
curl -N -X POST http://127.0.0.1:7777/run \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"promptTemplate":"Begruesse {{name}} auf Deutsch in einem Satz.","data":{"name":"Max"},"execution":{"model":"haiku","tools":[],"strictMcp":true}}'
```

**Warum `haiku`:** schnell und schont dein Kontingent. Für den Test reicht es.

**Geklappt, wenn:** nach etwa 10 Sekunden Events durchlaufen:

```
event: run_start
event: delta        (mehrmals)
event: result
event: run_end      mit "exitCode":0
```

Ab hier kann deine eigene App die Bridge nutzen. Wie, steht in
[docs/consumer-guide.md](docs/consumer-guide.md).

---

## Wenn etwas nicht klappt

| Meldung | Ursache | Lösung |
|---|---|---|
| `401 Unauthorized` | Token fehlt oder falsch | Token neu aus `~/.claude-bridge/token.txt` lesen. Kein Leerzeichen nach `Bearer `. |
| `400` mit `promptTemplate is required` | Pflichtfeld fehlt | `promptTemplate` mitschicken. |
| `event: error` mit `spawn claude ENOENT` | `claude` nicht gefunden | Schritt 2 prüfen. Bridge im selben Terminal starten, in dem `claude --version` klappt. |
| `run_end` mit `exitCode` ungleich 0 | CLI-Fehler | `stderr` im Event lesen. Oft: Anmeldung abgelaufen, Schritt 3 wiederholen. |
| `rate_limit` mit `status` ungleich `allowed` | Kontingent erreicht | Bis `resetsAt` warten (Unix-Zeit). |
| `EADDRINUSE` beim Start | Port 7777 belegt | Läuft die Bridge schon in einem anderen Fenster? Dort beenden. |
| Lange keine Antwort | Normale Startzeit | Die CLI braucht rund 10 Sekunden bis zum ersten Text. |
| Stream kommt erst am Ende | curl puffert | `-N` an curl anhängen. |

## Token neu erzeugen

Bridge beenden, `~/.claude-bridge/token.txt` löschen, Bridge neu starten. Danach brauchen
alle Apps den neuen Token.

## Deinstallieren

Projektordner löschen und `~/.claude-bridge/` löschen. Mehr legt die Bridge nicht an.
