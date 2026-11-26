---
id: test-echo
title: Test-Echo
description: Gibt den Input-Text woertlich zurueck — End-to-End-Smoke-Test
namespace: general
context: global
inputs:
  text:
    type: string
    required: true
outputs:
  text:
    type: string
execution:
  type: claude-cli
  model: sonnet
  tools: []
  strict_mcp: true
  cwd: null
  timeout_seconds: 60
persist_output: false
---

> **Beispiel-Agent fuer den Consumer-Guide.** Diese Datei liegt im Consumer-Projekt
> (Source of Truth). Die Bridge speichert/parst sie NICHT — das Projekt liest sie und
> schickt `promptTemplate` + `data` + `systemPrompt` an `POST /run`.

# Prompt-Template

Gib exakt den folgenden Text zurueck, ohne Anfuehrungszeichen und ohne Zusatz: {{text}}
