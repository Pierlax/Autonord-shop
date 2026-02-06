/**
 * Autonomous TAYA Developer
 * 
 * Questo script usa Gemini via ai-client.ts con tool nativi (Bash + Text Editor)
 * per scansionare il codice, identificare violazioni delle regole TAYA,
 * e creare automaticamente una Pull Request con le correzioni.
 * 
 * Esecuzione: npx tsx scripts/taya-improver.ts
 */

import { generateTextSafe } from '@/lib/shopify/ai-client';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Configurazione
const MAX_TOKENS = 8192;
const PROJECT_ROOT = process.cwd();

// Stato della sessione bash (simulato)
let currentWorkingDir = PROJECT_ROOT;

/**
 * Esegue un comando bash e ritorna l'output
 */
function executeBashCommand(command: string): string {
  try {
    const result = execSync(command, {
      cwd: currentWorkingDir,
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024 * 10, // 10MB
      timeout: 120000, // 2 min
    });
    return result;
  } catch (error: any) {
    return `Error: ${error.message}\nStdout: ${error.stdout || ''}\nStderr: ${error.stderr || ''}`;
  }
}

/**
 * Esegue un'operazione di text editing
 */
function executeTextEdit(input: any): string {
  const { command, path: filePath } = input;
  const fullPath = path.resolve(currentWorkingDir, filePath);

  try {
    if (command === 'view') {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');
      const start = (input.view_range?.[0] || 1) - 1;
      const end = input.view_range?.[1] || lines.length;
      return lines.slice(start, end).map((l: string, i: number) => `${start + i + 1}\t${l}`).join('\n');
    }

    if (command === 'str_replace') {
      let content = fs.readFileSync(fullPath, 'utf-8');
      if (!content.includes(input.old_str)) {
        return `Error: old_str not found in ${filePath}`;
      }
      content = content.replace(input.old_str, input.new_str);
      fs.writeFileSync(fullPath, content);
      return `Successfully replaced text in ${filePath}`;
    }

    if (command === 'create') {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, input.file_text);
      return `Created ${filePath}`;
    }

    return `Unknown command: ${command}`;
  } catch (error: any) {
    return `Error: ${error.message}`;
  }
}

/**
 * Processa una tool call e ritorna il risultato
 */
function processToolCall(toolName: string, input: any): string {
  if (toolName === 'bash') {
    console.log(`\n🔧 Bash: ${input.command}`);
    // Gestisci cd
    if (input.command.startsWith('cd ')) {
      const newDir = input.command.replace('cd ', '').trim();
      currentWorkingDir = path.resolve(currentWorkingDir, newDir);
      return `Changed directory to ${currentWorkingDir}`;
    }
    return executeBashCommand(input.command);
  }

  if (toolName === 'str_replace_based_edit_tool') {
    console.log(`\n📝 Edit: ${input.command} on ${input.path}`);
    return executeTextEdit(input);
  }

  return `Unknown tool: ${toolName}`;
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('🚀 TAYA Autonomous Developer');
  console.log(`📂 Project root: ${PROJECT_ROOT}`);
  console.log('═'.repeat(60));

  const userPrompt = `Sei un developer senior che lavora sul progetto Autonord-shop.
Il progetto segue la filosofia "They Ask, You Answer" (TAYA) di Marcus Sheridan.

REGOLE TAYA DA VERIFICARE:
1. Mai usare frasi marketing vuote (vedi BANNED_PHRASES in lib/agents/taya-police.ts)
2. Mai mentire o esagerare sulle specifiche dei prodotti
3. Sempre includere pro E contro (mai solo lati positivi)
4. Sempre rispondere alle domande scomode (prezzi, problemi, confronti)
5. Mai usare "questo prodotto" o "questo articolo" - nominare sempre il prodotto
6. Mai usare superlativi vuoti (migliore, eccezionale, straordinario)
7. Sempre citare dati specifici quando possibile

REGOLE CODICE:
1. TypeScript strict mode
2. Niente any (usa unknown + type guard)
3. Niente console.log in produzione (usa il logger)
4. Gestione errori con try/catch specifici
5. Variabili d'ambiente validate in lib/env.ts

Ora:
1. Crea un nuovo branch git con nome univoco (es: taya-improvement-TIMESTAMP)
2. Scansiona i file del progetto per trovare UNA violazione delle regole TAYA
3. Correggi la violazione modificando il codice
4. Esegui "pnpm run build" per verificare
5. Se il build passa, fai commit con messaggio descrittivo
6. Pusha il branch e crea una Pull Request con "gh pr create"

Inizia ora.`;

  // Loop dell'agent - iterative refinement
  let iterations = 0;
  const maxIterations = 20;
  let conversationHistory = '';

  while (iterations < maxIterations) {
    iterations++;
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📍 Iterazione ${iterations}/${maxIterations}`);
    console.log('═'.repeat(60));

    try {
      const prompt = iterations === 1 
        ? userPrompt 
        : `${userPrompt}\n\n--- CONVERSAZIONE PRECEDENTE ---\n${conversationHistory}\n\nContinua da dove eri rimasto. Se hai finito, rispondi con "TASK_COMPLETE".`;

      const result = await generateTextSafe({
        system: 'Sei un developer senior che analizza e corregge codice. Rispondi con comandi bash o operazioni di editing. Quando hai finito, scrivi TASK_COMPLETE.',
        prompt,
        maxTokens: MAX_TOKENS,
        temperature: 0.3,
      });

      const responseText = result.text;
      console.log(`\n💬 AI:\n${responseText.substring(0, 2000)}${responseText.length > 2000 ? '...' : ''}`);

      // Check if task is complete
      if (responseText.includes('TASK_COMPLETE')) {
        console.log('\n✅ Agent ha completato il task');
        break;
      }

      // Extract and execute bash commands from the response
      const bashCommands = responseText.match(/```bash\n([\s\S]*?)```/g);
      if (bashCommands) {
        for (const cmdBlock of bashCommands) {
          const cmd = cmdBlock.replace(/```bash\n/, '').replace(/```/, '').trim();
          console.log(`\n🔧 Executing: ${cmd}`);
          const output = executeBashCommand(cmd);
          console.log(`📤 Output: ${output.substring(0, 500)}`);
          conversationHistory += `\nCommand: ${cmd}\nOutput: ${output.substring(0, 500)}\n`;
        }
      }

      // Extract and execute edit operations
      const editBlocks = responseText.match(/```edit\n([\s\S]*?)```/g);
      if (editBlocks) {
        for (const editBlock of editBlocks) {
          const editContent = editBlock.replace(/```edit\n/, '').replace(/```/, '').trim();
          try {
            const editOp = JSON.parse(editContent);
            const output = executeTextEdit(editOp);
            console.log(`📝 Edit result: ${output}`);
            conversationHistory += `\nEdit: ${JSON.stringify(editOp).substring(0, 200)}\nResult: ${output}\n`;
          } catch {
            console.log(`⚠️ Could not parse edit block`);
          }
        }
      }

      conversationHistory += `\nAI Response: ${responseText.substring(0, 500)}\n`;

    } catch (error: any) {
      console.error(`\n❌ Errore API: ${error.message}`);
      
      if (error.message?.includes('429') || error.message?.includes('rate')) {
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

main().catch(console.error);
