/**
 * Gateway Dashboard API
 * 
 * GET  — Returns full dashboard data (skills, health, logs, stats)
 * POST — Trigger a skill manually from the admin dashboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDashboardData, getSkillDetails, triggerSkill, triggerSkillAsync } from '@/lib/gateway';
import { loadAllSkills } from '@/lib/skills/loader';
import { createLogger } from '@/lib/logger';

const log = createLogger('gateway-dashboard-api');

/**
 * Verify admin access (simple bearer token check)
 */
function verifyAdmin(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  // Allow in development
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  return false;
}

/**
 * GET /api/gateway/dashboard
 * Returns dashboard data for the admin panel.
 */
export async function GET(request: NextRequest) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  loadAllSkills();

  const { searchParams } = new URL(request.url);
  const skillName = searchParams.get('skill');

  if (skillName) {
    const details = getSkillDetails(skillName);
    if (!details) {
      return NextResponse.json({ error: `Skill "${skillName}" not found` }, { status: 404 });
    }
    return NextResponse.json(details);
  }

  const dashboard = getDashboardData();
  return NextResponse.json(dashboard);
}

/**
 * POST /api/gateway/dashboard
 * Trigger a skill manually.
 * 
 * Body: { skillName: string, payload: object, async?: boolean }
 */
export async function POST(request: NextRequest) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  loadAllSkills();

  try {
    const body = await request.json();
    const { skillName, payload, async: isAsync } = body as {
      skillName: string;
      payload: Record<string, unknown>;
      async?: boolean;
    };

    if (!skillName) {
      return NextResponse.json({ error: 'Missing skillName' }, { status: 400 });
    }

    log.info(`Manual trigger: skill "${skillName}"`, { isAsync });

    if (isAsync) {
      const result = await triggerSkillAsync(skillName, payload || {}, 'manual');
      return NextResponse.json(result);
    } else {
      const result = await triggerSkill(skillName, payload || {}, 'manual');
      return NextResponse.json(result);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`Dashboard trigger error: ${errorMsg}`, error);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
