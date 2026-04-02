/**
 * Cron Jobs CRUD API
 * 
 * GET    — List all cron jobs
 * POST   — Create a new cron job
 * PUT    — Update an existing cron job
 * DELETE — Delete a cron job
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  seedDefaultJobs,
  listJobs,
  createJob,
  updateJob,
  deleteJob,
  type CreateJobInput,
  type UpdateJobInput,
} from '@/lib/cron';
import { createLogger } from '@/lib/logger';

const log = createLogger('cron-api');

function verifyAdmin(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  if (process.env.NODE_ENV === 'development') return true;
  return false;
}

export async function GET(request: NextRequest) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  seedDefaultJobs();
  return NextResponse.json({ jobs: listJobs() });
}

export async function POST(request: NextRequest) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    seedDefaultJobs();
    const body = await request.json() as CreateJobInput;

    if (!body.name || !body.schedule || !body.skillName) {
      return NextResponse.json(
        { error: 'Missing required fields: name, schedule, skillName' },
        { status: 400 }
      );
    }

    const job = createJob(body);
    log.info(`Cron job created via API: "${job.name}"`);
    return NextResponse.json({ job }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json() as UpdateJobInput & { id: string };

    if (!body.id) {
      return NextResponse.json({ error: 'Missing job id' }, { status: 400 });
    }

    const job = updateJob(body.id, body);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    log.info(`Cron job updated via API: "${job.name}"`);
    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing job id' }, { status: 400 });
    }

    const deleted = deleteJob(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    log.info(`Cron job deleted via API: ${id}`);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
