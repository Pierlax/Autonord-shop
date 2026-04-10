/**
 * Gateway Execute Endpoint
 * 
 * Receives skill execution requests from QStash (or direct calls)
 * and executes them via the Gateway.
 * 
 * This is the universal worker endpoint — all skills are executed through here.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import { executeSkill } from '@/lib/skills/registry';
import { loadAllSkills } from '@/lib/skills/loader';
import type { SkillContext } from '@/lib/skills/types';
import { createLogger } from '@/lib/logger';
import { env, optionalEnv } from '@/lib/env';

const log = createLogger('gateway-api');

// Allow up to 300 seconds for AI pipelines
export const maxDuration = 300;

async function isAuthorized(request: NextRequest, rawBody: string): Promise<boolean> {
  const upstashSignature = request.headers.get('upstash-signature');
  if (upstashSignature) {
    const currentKey = optionalEnv.QSTASH_CURRENT_SIGNING_KEY;
    const nextKey = optionalEnv.QSTASH_NEXT_SIGNING_KEY;
    if (!currentKey || !nextKey) {
      log.warn('QStash signing keys not configured — rejecting signed request');
      return false;
    }
    try {
      const receiver = new Receiver({ currentSigningKey: currentKey, nextSigningKey: nextKey });
      return await receiver.verify({ signature: upstashSignature, body: rawBody });
    } catch {
      return false;
    }
  }
  // Direct calls (cron, manual) must supply CRON_SECRET
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${env.CRON_SECRET}`;
}

export async function POST(request: NextRequest) {
  // Read raw body once — required for QStash signature verification
  const rawBody = await request.text();

  if (!(await isAuthorized(request, rawBody))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Ensure skills are loaded
    loadAllSkills();

    const body = JSON.parse(rawBody);
    const { skillName, context } = body as {
      skillName: string;
      context: SkillContext;
    };

    if (!skillName || !context) {
      return NextResponse.json(
        { error: 'Missing skillName or context' },
        { status: 400 }
      );
    }

    log.info(`Gateway executing skill "${skillName}" [${context.executionId}]`);

    const result = await executeSkill(skillName, context);

    return NextResponse.json({
      success: result.success,
      executionId: context.executionId,
      skillName,
      result,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`Gateway execute error: ${errorMsg}`, error);

    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}
