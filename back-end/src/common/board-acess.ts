import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BoardAccessResult {
  boardId: string;
  userId: string;
  role: Role | 'OWNER';
  isOwner: boolean;
  isAdmin: boolean;
  isMember: boolean;
  isObserver: boolean;
}

export type RequiredRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'OBSERVER';

// ─── Core resolver ────────────────────────────────────────────────────────────

export async function resolveBoardAccess(
  prisma: PrismaService,
  boardId: string,
  userId: string,
  options: { allowArchived?: boolean } = {},
): Promise<BoardAccessResult> {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: {
      id: true,
      ownerId: true,
      isArchived: true,
      members: {
        where: { userId },
        select: { role: true },
      },
    },
  });

  if (!board || (!options.allowArchived && board.isArchived)) {
    throw new NotFoundException(Board ${boardId} not found);
  }

  const isOwner = board.ownerId === userId;
  const membership = board.members[0] ?? null;

  if (!isOwner && !membership) {
    throw new ForbiddenException('You do not have access to this board');
  }

  const effectiveRole: Role | 'OWNER' = isOwner ? 'OWNER' : membership!.role;

  return {
    boardId,
    userId,
    role: effectiveRole,
    isOwner,
    isAdmin: isOwner || effectiveRole === Role.ADMIN,
    isMember:
      isOwner ||
      effectiveRole === Role.ADMIN ||
      effectiveRole === Role.MEMBER,
    isObserver:
      isOwner ||
      effectiveRole === Role.ADMIN ||
      effectiveRole === Role.MEMBER ||
      effectiveRole === Role.OBSERVER,
  };
}

// ─── Guard helpers ────────────────────────────────────────────────────────────

export async function assertBoardAccess(
  prisma: PrismaService,
  boardId: string,
  userId: string,
  required: RequiredRole,
  options: { allowArchived?: boolean } = {},
): Promise<BoardAccessResult> {
  const access = await resolveBoardAccess(prisma, boardId, userId, options);

  const permitted = (() => {
    switch (required) {
      case 'OBSERVER': return access.isObserver;
      case 'MEMBER':   return access.isMember;
      case 'ADMIN':    return access.isAdmin;
      case 'OWNER':    return access.isOwner;
    }
  })();

  if (!permitted) {
    throw new ForbiddenException(
      This action requires ${required} role or higher,
    );
  }

  return access;
}

// ─── Convenience wrappers ─────────────────────────────────────────────────────

export const assertBoardObserver = (
  prisma: PrismaService,
  boardId: string,
  userId: string,
) => assertBoardAccess(prisma, boardId, userId, 'OBSERVER');

export const assertBoardMember = (
  prisma: PrismaService,
  boardId: string,
  userId: string,
) => assertBoardAccess(prisma, boardId, userId, 'MEMBER');

export const assertBoardAdmin = (
  prisma: PrismaService,
  boardId: string,
  userId: string,
) => assertBoardAccess(prisma, boardId, userId, 'ADMIN');

export const assertBoardOwner = (
  prisma: PrismaService,
  boardId: string,
  userId: string,
) => assertBoardAccess(prisma, boardId, userId, 'OWNER');