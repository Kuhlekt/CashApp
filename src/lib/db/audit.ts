// src/lib/db/audit.ts
// Tamper-evident audit log writer — SHA-256 rolling hash chain
// Every entry includes hash of previous entry, making tampering detectable

import { createHash } from 'crypto'
import prisma from './client'

let currentChainHash = '0000000000000000000000000000000000000000000000000000000000000000'

export async function loadChainTip(orgId: string): Promise<void> {
  const last = await prisma.auditLog.findFirst({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
    select: { chainHash: true },
  })
  if (last?.chainHash) currentChainHash = last.chainHash
}

export function computeChainHash(
  prevHash: string,
  event: string,
  message: string,
  actor: string,
  timestamp: string
): string {
  return createHash('sha256')
    .update(`${prevHash}:${event}:${message}:${actor}:${timestamp}`)
    .digest('hex')
}

export async function auditLog({
  orgId,
  sessionId,
  userId,
  category,
  event,
  message,
  actor,
  metadata,
}: {
  orgId: string
  sessionId?: string
  userId?: string
  category: 'user' | 'system' | 'approve'
  event: string
  message: string
  actor: string
  metadata?: Record<string, unknown>
}) {
  const now = new Date()
  const chainHash = computeChainHash(
    currentChainHash,
    event,
    message,
    actor,
    now.toISOString()
  )
  currentChainHash = chainHash

  const entry = await prisma.auditLog.create({
    data: {
      orgId,
      sessionId,
      userId,
      category,
      event,
      message,
      actor,
      chainHash,
      metadata: metadata ?? {},
    },
  })

  return entry
}

export async function verifyAuditChain(orgId: string): Promise<{
  valid: boolean
  totalEvents: number
  firstBreach?: string
}> {
  const logs = await prisma.auditLog.findMany({
    where: { orgId },
    orderBy: { createdAt: 'asc' },
  })

  let prevHash = '0000000000000000000000000000000000000000000000000000000000000000'
  for (const log of logs) {
    const expected = computeChainHash(
      prevHash,
      log.event,
      log.message,
      log.actor,
      log.createdAt.toISOString()
    )
    if (expected !== log.chainHash) {
      return { valid: false, totalEvents: logs.length, firstBreach: log.id }
    }
    prevHash = log.chainHash
  }

  return { valid: true, totalEvents: logs.length }
}
