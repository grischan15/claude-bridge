# Sicherheit

## Wie die Bridge dich schützt

| Schutz | Wie | Im Bild |
|---|---|---|
| Nur lokal erreichbar | Sie lauscht auf `127.0.0.1`, nicht auf `0.0.0.0`. | Keine Tür zur Straße, nur eine interne Durchwahl. |
| Token | Jeder Lauf braucht `Authorization: Bearer <token>`. Der Token wird pro Rechner zufällig erzeugt (48 Hex-Zeichen). | Hausausweis. |
| CORS | Nur Seiten von `localhost` und `127.0.0.1` dürfen aus dem Browser anfragen. Ohne Token nützt ihnen das nichts. | Der Empfang nimmt nur interne Anrufe an. |
| Sandbox | Eingebaute Tools (Bash, Write, Edit …) sind standardmäßig gesperrt. | Der Experte darf schreiben, aber nicht an Akten und Rechner. |
| Aufräumen | Temp-Dateien werden nach jedem Lauf gelöscht, auch bei Abbruch. | Anlagen kommen in den Schredder. |

## Was die Bridge nicht verhindert

- **Programme, die schon auf deinem Rechner laufen**, können `~/.claude-bridge/token.txt`
  lesen. Gegen Schadsoftware hilft die Bridge nicht.
- **Der Token wird beim Start im Terminal angezeigt.** Teile keine Screenshots davon.

## Regeln, die du nicht brechen solltest

1. **Host nicht ändern.** `HOST` in `src/config.ts` bleibt `127.0.0.1`. Mit `0.0.0.0` wäre
   die Bridge im ganzen Netzwerk erreichbar.
2. **Token nie in Browser-Code.** Alles, was im Browser landet, ist öffentlich lesbar. Hol
   den Token über einen lokalen Server oder eine Dev-Middleware.
3. **Token nie einchecken.** Er liegt in `~/.claude-bridge/`, nicht im Projekt. `token.txt`
   steht zusätzlich in `.gitignore`.
4. **Tools nur mit Grund freigeben.** Mit `"tools": ["Bash"]` kann jede angebundene App über
   einen Prompt Befehle auf deinem Rechner ausführen lassen.
5. **Nicht ungeschützt ins Internet stellen.** Kein Port-Forwarding auf 7777. Wer die Bridge
   von außen nutzen will, braucht einen eigenen Token für außen, eine Liste erlaubter Aufträge
   und ein Limit. Einfacher und sicherer ist eine Warteschlange: Die Online-Seite legt
   Aufträge in einer Datenbank ab, ein lokales Skript holt sie ab.

## Wenn der Token bekannt geworden ist

Bridge beenden, `~/.claude-bridge/token.txt` löschen, neu starten. Der alte Token ist dann
wertlos.

## Eine Schwachstelle melden

Bitte nicht als öffentliches Issue. Melde sie direkt an die Person, die dir dieses Repo
gegeben hat.
