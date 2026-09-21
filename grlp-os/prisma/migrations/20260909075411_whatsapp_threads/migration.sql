-- CreateEnum
CREATE TYPE "public"."ThreadKind" AS ENUM ('DIRECT', 'GROUP');

-- AlterTable
ALTER TABLE "public"."Communication" ADD COLUMN     "senderName" TEXT,
ADD COLUMN     "senderPhone" TEXT,
ADD COLUMN     "threadId" TEXT;

-- CreateTable
CREATE TABLE "public"."MessageThread" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'whatsapp',
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "public"."ThreadKind" NOT NULL DEFAULT 'DIRECT',
    "counterpartyPhone" TEXT,
    "counterpartyName" TEXT,
    "contactId" TEXT,
    "propertyId" TEXT,
    "ownerId" TEXT,
    "category" "public"."CommunicationCategory",
    "importance" "public"."Priority" NOT NULL DEFAULT 'NORMAL',
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "firstMessageAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "waitingOnUs" BOOLEAN NOT NULL DEFAULT false,
    "summary" TEXT,
    "summaryProvenance" "public"."ProvenanceKind" NOT NULL DEFAULT 'INFERENCE',
    "summaryUpdatedAt" TIMESTAMP(3),
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Commitment" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "what" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "saidAt" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Commitment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageThread_externalId_key" ON "public"."MessageThread"("externalId");

-- CreateIndex
CREATE INDEX "MessageThread_lastMessageAt_idx" ON "public"."MessageThread"("lastMessageAt");

-- CreateIndex
CREATE INDEX "MessageThread_ownerId_waitingOnUs_idx" ON "public"."MessageThread"("ownerId", "waitingOnUs");

-- CreateIndex
CREATE INDEX "MessageThread_category_idx" ON "public"."MessageThread"("category");

-- CreateIndex
CREATE INDEX "Commitment_threadId_idx" ON "public"."Commitment"("threadId");

-- CreateIndex
CREATE INDEX "Commitment_settledAt_idx" ON "public"."Commitment"("settledAt");

-- AddForeignKey
ALTER TABLE "public"."Communication" ADD CONSTRAINT "Communication_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "public"."MessageThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MessageThread" ADD CONSTRAINT "MessageThread_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "public"."Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MessageThread" ADD CONSTRAINT "MessageThread_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "public"."Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MessageThread" ADD CONSTRAINT "MessageThread_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Commitment" ADD CONSTRAINT "Commitment_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "public"."MessageThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
