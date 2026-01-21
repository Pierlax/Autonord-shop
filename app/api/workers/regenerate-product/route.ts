/**
 * Worker DISABILITATO - Non crea più prodotti
 */
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // Worker disabilitato - ritorna subito senza fare nulla
  return NextResponse.json({ 
    success: true, 
    message: 'Worker disabled - no action taken',
    disabled: true 
  });
}
