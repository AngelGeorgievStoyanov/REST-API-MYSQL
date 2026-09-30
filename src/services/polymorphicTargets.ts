import { Prisma } from '@prisma/client';

/** Polymorphic targets (`comments` / `likes` / `reports`) have no FK to the deleted resource. */
export async function clearPolymorphicTargets(
    tx: Prisma.TransactionClient,
    targetTypeName: string,
    targetId: number,
): Promise<void> {
    const targetType = await tx.targetType.findFirst({ where: { name: targetTypeName }, select: { id: true } });
    if (!targetType) return;

    await tx.comment.deleteMany({ where: { targetTypeId: targetType.id, targetId } });
    await tx.like.deleteMany({ where: { targetTypeId: targetType.id, targetId } });
    await tx.report.deleteMany({ where: { targetTypeId: targetType.id, targetId } });
}
