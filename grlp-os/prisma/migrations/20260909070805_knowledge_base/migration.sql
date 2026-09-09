-- CreateEnum
CREATE TYPE "public"."KnowledgeCategory" AS ENUM ('SOP', 'POLICY', 'COMPLIANCE', 'TEMPLATE_GUIDE', 'TRAINING', 'AREA_INFO', 'REFERENCE');

-- CreateTable
CREATE TABLE "public"."KnowledgeDocument" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "public"."KnowledgeCategory" NOT NULL,
    "appliesTo" TEXT NOT NULL DEFAULT 'BOTH',
    "sourceProvider" TEXT NOT NULL DEFAULT 'dropbox',
    "sourcePath" TEXT NOT NULL,
    "sourceRev" TEXT,
    "sourceModifiedAt" TIMESTAMP(3),
    "text" TEXT NOT NULL,
    "extractionNote" TEXT,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeDocument_key_key" ON "public"."KnowledgeDocument"("key");

-- CreateIndex
CREATE INDEX "KnowledgeDocument_category_idx" ON "public"."KnowledgeDocument"("category");

-- CreateIndex
CREATE INDEX "KnowledgeDocument_appliesTo_idx" ON "public"."KnowledgeDocument"("appliesTo");
