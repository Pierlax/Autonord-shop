/**
 * Gateway Execute Endpoint
 * 
 * Receives skill execution requests from QStash (or direct calls)
 * and executes them via the Gateway.
 * 
 * This is the universal worker endpoint — all skills are executed through here.
 */

import { NextRequest, NextResponse } from 'next/server';
import { executeSkill } from '@/lib/skills/registry';
import { loadAllSkills } from '@/lib/skills/loader';
import type { SkillContext } from '@/lib/skills/types';
import { createLogger } from '@/lib/logger';
import { env } from '@/lib/env';

const log = createLogger('gateway-api');

// Allow up to 300 seconds for AI pipelines
export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  // QStash requests are signed — trust them if upstash-signature header is present
  if (request.headers.get('upstash-signature')) {
    return true;
  }
  // Direct calls (cron, manual) must supply CRON_SECRET
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${env.CRON_SECRET}`;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Ensure skills are loaded
    loadAllSkills();

    const body = await request.json();
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
