import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import type { SearchRequest, SearchResponse } from '@/types/search-types';
import { normalizePipelinePayload } from '@/lib/pipeline-search';

const execFileAsync = promisify(execFile);

export function localOfferDbPath() {
  return path.resolve(process.cwd(), '..', 'data', 'nearby-offers.db');
}

export function hasLocalOfferDb() {
  return fs.existsSync(localOfferDbPath());
}

export async function runDbSearch(request: SearchRequest): Promise<SearchResponse> {
  const scriptPath = path.resolve(process.cwd(), '..', '..', '..', 'scripts', 'search_offer_db_dk.py');
  const dbPath = localOfferDbPath();

  const args = [
    scriptPath,
    dbPath,
    '--address',
    request.address,
    '--radius-km',
    String(resolveRadiusKm(request)),
    '--json',
  ];

  if (request.maxWalkKm !== null) {
    args.push('--max-walk-km', String(request.maxWalkKm));
  }

  if (request.maxTransitMin !== null) {
    args.push('--max-transit-min', String(request.maxTransitMin));
  }

  for (const query of request.queries) {
    args.push('--query', query);
  }

  const { stdout } = await execFileAsync('python3', args, {
    cwd: path.resolve(process.cwd(), '..', '..', '..'),
    maxBuffer: 20 * 1024 * 1024,
  });

  const payload = JSON.parse(stdout);
  return normalizePipelinePayload(payload, request);
}

function resolveRadiusKm(request: SearchRequest): number {
  if (request.radiusKm !== null) return request.radiusKm;
  if (request.maxWalkKm !== null) return Math.max(request.maxWalkKm * 2, 3);
  if (request.maxTransitMin !== null) return 5;
  return 3;
}

