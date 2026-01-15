/**
 * Autonomous TAYA Developer
 * 
 * Questo script usa Claude Opus 4.1 con i tool nativi (Bash + Text Editor)
 * per scansionare il codice, identificare violazioni delle regole TAYA,
 * e creare automaticamente una Pull Request con le correzioni.
 * 
 * Esecuzione: npx tsx scripts/taya-improver.ts
 */

import Anthropic from '@anthropic-ai/sdk';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Configurazione
const MODEL = 'claude-opus-4-1-20250805';
const MAX_TOKENS = 8192;
const PROJECT_ROOT = process.cwd();

// Inizializza client Anthropic
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Tool definitions - using 'as any' to bypass strict type checking for beta tools
const tools = [
  {
    type: 'bash_20250124',
    name: 'bash',
  },
  {
    type: 'text_editor_20250728',
    name: 'str_replace_based_edit_tool',
  },
] as any;

// Stato della sessione bash (simulato)
let currentWorkingDir = PROJECT_ROOT;

/**
 * Esegue un comando bash e ritorna l'output
 */
function executeBashCommand(command: string): string {
  try {
    console.log(`\n🔧 Executing: ${command}`);
    const output = execSync(command, {
      cwd: currentWorkingDir,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB
      timeout: 60000, // 60 secondi
    });
    return output || '(comando eseguito con successo, nessun output)';
  } catch (error: any) {
    return `Errore: ${error.message}\nStderr: ${error.stderr || ''}\nStdout: ${error.stdout || ''}`;
  }
}

/**
 * Gestisce le operazioni del text editor
 */
function handleTextEditorCommand(input: any): string {
  const { command, path: filePath } = input;
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(currentWorkingDir, filePath);

  try {
    switch (command) {
      case 'view': {
        if (fs.statSync(fullPath).isDirectory()) {
          const files = fs.readdirSync(fullPath);
          return `Directory contents of ${filePath}:\n${files.join('\n')}`;
        }
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');
        
        if (input.view_range) {
          const [start, end] = input.view_range;
          const endLine = end === -1 ? lines.length : end;
          const selectedLines = lines.slice(start - 1, endLine);
          return selectedLines.map((line, i) => `${start + i}: ${line}`).join('\n');
        }
        
        return lines.map((line, i) => `${i + 1}: ${line}`).join('\n');
      }

      case 'str_replace': {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const { old_str, new_str } = input;
        
        if (!content.includes(old_str)) {
          return `Errore: La stringa da sostituire non è stata trovata nel file.\nCercato: "${old_str.substring(0, 100)}..."`;
        }
        
        const newContent = content.replace(old_str, new_str);
        fs.writeFileSync(fullPath, newContent, 'utf-8');
        return `File ${filePath} modificato con successo.`;
      }

      case 'create': {
        const { file_text } = input;
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, file_text, 'utf-8');
        return `File ${filePath} creato con successo.`;
      }

      case 'insert': {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');
        const { insert_line, new_str } = input;
        lines.splice(insert_line, 0, new_str);
        fs.writeFileSync(fullPath, lines.join('\n'), 'utf-8');
        return `Testo inserito alla linea ${insert_line} in ${filePath}.`;
      }

      default:
        return `Comando non riconosciuto: ${command}`;
    }
  } catch (error: any) {
    return `Errore: ${error.message}`;
  }
}

/**
 * Processa una tool call di Claude
 */
function processToolCall(toolName: string, toolInput: any): string {
  console.log(`\n📦 Tool: ${toolName}`);
  console.log(`   Input: ${JSON.stringify(toolInput).substring(0, 200)}...`);

  if (toolName === 'bash') {
    if (toolInput.restart) {
      currentWorkingDir = PROJECT_ROOT;
      return 'Sessione bash riavviata.';
    }
    return executeBashCommand(toolInput.command);
  }

  if (toolName === 'str_replace_based_edit_tool') {
    return handleTextEditorCommand(toolInput);
  }

  return `Tool non riconosciuto: ${toolName}`;
}

/**
 * Esegue il loop dell'agent
 */
async function runAgent(): Promise<void> {
  console.log('🚀 Avvio Autonomous TAYA Developer');
  console.log(`📁 Working directory: ${PROJECT_ROOT}`);
  console.log(`🤖 Model: ${MODEL}`);
  console.log('─'.repeat(60));

  // Leggi le regole TAYA
  const tayaRulesPath = path.join(PROJECT_ROOT, 'TAYA_RULES.md');
  if (!fs.existsSync(tayaRulesPath)) {
    console.error('❌ TAYA_RULES.md non trovato nella root del progetto');
    process.exit(1);
  }
  const tayaRules = fs.readFileSync(tayaRulesPath, 'utf-8');

  // Prompt iniziale
  const systemPrompt = `Sei un developer esperto specializzato nella filosofia "They Ask You Answer" (TAYA).
Il tuo compito è migliorare il codice del sito e-commerce Autonord Service per aderire meglio ai principi TAYA.

REGOLE IMPORTANTI:
1. Fai UNA SOLA modifica per esecuzione (la più impattante)
2. Dopo la modifica, esegui "pnpm run build" per verificare che il codice compili
3. Se il build fallisce, correggi l'errore
4. Spiega chiaramente quale regola TAYA stavi applicando

Hai accesso a:
- bash: per eseguire comandi shell (git, npm, ecc.)
- str_replace_based_edit_tool: per leggere e modificare file

Il progetto è un sito Next.js con:
- /app: pagine e route
- /components: componenti React
- /lib: utility e API

Procedi con metodo:
1. Prima leggi TAYA_RULES.md per capire le regole
2. Scansiona i file principali (/app/page.tsx, /components/*)
3. Identifica UNA violazione
4. Correggi il codice
5. Verifica con build`;

  const userPrompt = `Ecco le regole TAYA che devi seguire:

${tayaRules}

---

Ora:
1. Crea un nuovo branch git con nome univoco (es: taya-improvement-TIMESTAMP)
2. Scansiona i file del progetto per trovare UNA violazione delle regole TAYA
3. Correggi la violazione modificando il codice
4. Esegui "pnpm run build" per verificare
5. Se il build passa, fai commit con messaggio descrittivo
6. Pusha il branch e crea una Pull Request con "gh pr create"

Inizia ora.`;

  // Messaggi iniziali
  let messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userPrompt },
  ];

  // Loop dell'agent
  let iterations = 0;
  const maxIterations = 20; // Limite di sicurezza

  while (iterations < maxIterations) {
    iterations++;
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📍 Iterazione ${iterations}/${maxIterations}`);
    console.log('═'.repeat(60));

    try {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        tools: tools,
        messages: messages,
      });

      console.log(`\n🤖 Stop reason: ${response.stop_reason}`);

      // Processa la risposta
      let hasToolUse = false;
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          console.log(`\n💬 Claude:\n${block.text}`);
        } else if (block.type === 'tool_use') {
          hasToolUse = true;
          const result = processToolCall(block.name, block.input);
          console.log(`\n📤 Result: ${result.substring(0, 500)}${result.length > 500 ? '...' : ''}`);
          
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      // Se non ci sono tool calls, abbiamo finito
      if (!hasToolUse || response.stop_reason === 'end_turn') {
        console.log('\n✅ Agent ha completato il task');
        break;
      }

      // Aggiungi la risposta dell'assistente e i risultati dei tool
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });

    } catch (error: any) {
      console.error(`\n❌ Errore API: ${error.message}`);
      
      if (error.status === 429) {
        console.log('⏳ Rate limit raggiunto, attendo 60 secondi...');
        await new Promise(resolve => setTimeout(resolve, 60000));
        continue;
      }
      
      break;
    }
  }

  if (iterations >= maxIterations) {
    console.log('\n⚠️ Raggiunto limite massimo di iterazioni');
  }

  console.log('\n🏁 TAYA Developer terminato');
}

// Esegui
runAgent().catch(console.error);
