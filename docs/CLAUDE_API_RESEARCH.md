# Claude API Research - Tool Capabilities

## Scoperta Importante: Claude Ha Tool Nativi!

Anthropic ha rilasciato **tool nativi** che permettono a Claude di:
- Eseguire comandi bash
- Modificare file
- Eseguire codice
- Navigare il web

Questo rende possibile l'**Autonomous TAYA Developer**!

---

## Tool Disponibili

### 1. Bash Tool (`bash_20250124`)
- Esegue comandi shell in una sessione persistente
- Mantiene stato (variabili ambiente, working directory)
- Può eseguire git, npm, build commands

```python
tools=[{
    "type": "bash_20250124",
    "name": "bash"
}]
```

### 2. Text Editor Tool (`text_editor_20250728`)
- Visualizza file
- Modifica file con str_replace
- Crea nuovi file
- Insert a linee specifiche

```python
tools=[{
    "type": "text_editor_20250728",
    "name": "str_replace_based_edit_tool"
}]
```

### 3. Code Execution Tool (`code_execution_20250825`)
- Esegue codice in sandbox sicura
- Supporta Bash e file operations
- Può installare pacchetti
- Beta: richiede header `anthropic-beta: code-execution-2025-08-25`

```python
tools=[{
    "type": "code_execution_20250825",
    "name": "code_execution"
}]
```

---

## Modelli Compatibili

| Modello | Bash | Text Editor | Code Execution |
|---------|------|-------------|----------------|
| Claude Opus 4.5 | ✅ | ✅ | ✅ |
| Claude Opus 4.1 | ✅ | ✅ | ✅ |
| Claude Opus 4 | ✅ | ✅ | ✅ |
| Claude Sonnet 4.5 | ✅ | ✅ | ✅ |
| Claude Sonnet 4 | ✅ | ✅ | ✅ |

---

## Implementazione Autonomous TAYA Developer

Con questi tool, possiamo creare un agent che:

1. **Legge** il file TAYA_RULES.md
2. **Scansiona** i file del progetto
3. **Identifica** violazioni delle regole
4. **Modifica** il codice direttamente
5. **Esegue** build per verificare
6. **Committa** e crea PR

### Esempio di Chiamata API

```python
import anthropic

client = anthropic.Anthropic()

response = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=4096,
    tools=[
        {"type": "bash_20250124", "name": "bash"},
        {"type": "text_editor_20250728", "name": "str_replace_based_edit_tool"}
    ],
    messages=[{
        "role": "user",
        "content": """
        Leggi il file TAYA_RULES.md nella root del progetto.
        Poi scansiona i file in /app e /components.
        Trova UNA violazione delle regole TAYA e correggila.
        Dopo la correzione, esegui 'npm run build' per verificare.
        """
    }]
)
```

---

## Costi

| Tool | Token Aggiuntivi |
|------|------------------|
| Bash | +245 token per chiamata |
| Text Editor | +700 token per chiamata |
| Code Execution | Variabile |

---

## Limitazioni

- **No comandi interattivi**: vim, less, password prompts non funzionano
- **No GUI**: Solo command line
- **Sessione**: Persiste nella conversazione, persa tra chiamate API
- **Output limits**: Output grandi vengono troncati

---

## Conclusione

L'Autonomous TAYA Developer è **fattibile** usando:
- **Bash tool** per git operations
- **Text Editor tool** per modifiche codice
- **GitHub CLI** (già installato) per creare PR

Non serve "Claude Code CLI" - basta usare l'API con i tool nativi!
