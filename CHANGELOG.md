# Änderungen

Format nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/).

## [0.3.0] – 2026-11-26

Erste veröffentlichte Version.

### Enthalten
- `GET /health` und `POST /run` mit Server-Sent-Events-Stream
- Bearer-Token, pro Rechner zufällig erzeugt in `~/.claude-bridge/token.txt`
- Prompt-Vorlagen mit Nunjucks, optionaler System-Prompt als Temp-Datei
- Modellwahl mit Ausweichmodell
- Sandbox: eingebaute Tools standardmäßig gesperrt, MCP-Connectoren über `ToolSearch` erreichbar, mit `strictMcp` ganz aus
- Warteschlange mit höchstens 3 gleichzeitigen Läufen (`BRIDGE_MAX_CONCURRENCY`)
- Timeout und sauberes Aufräumen bei Abbruch
- Prompt über stdin statt als Argument (umgeht die Längengrenze der Windows-Kommandozeile)
