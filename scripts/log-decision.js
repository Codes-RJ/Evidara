import { appendFileSync } from 'node:fs';
import { initializeLocalFolders } from './init-local.js';

const [decision, reason, ...extra] = process.argv.slice(2);
if (!decision?.trim() || !reason?.trim() || extra.length) {
    console.error('Usage: node scripts/log-decision.js "Decision" "Reason"');
    process.exitCode = 1;
} else {
    // Logs are local and ignored, but must still exclude credentials and private source text.
    initializeLocalFolders();
    const entry = {
        timestamp: new Date().toISOString(),
        decision: decision.trim(),
        reason: reason.trim(),
    };
    appendFileSync(
        new URL('../logs/decisions/decisions.jsonl', import.meta.url),
        `${JSON.stringify(entry)}\n`,
        'utf8',
    );
    console.log('Decision recorded in logs/decisions/decisions.jsonl.');
}
