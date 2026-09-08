-- AlterTable
ALTER TABLE "public"."Template" ADD COLUMN     "process" TEXT,
ADD COLUMN     "stageKey" TEXT,
ADD COLUMN     "variant" TEXT;

-- AlterTable
ALTER TABLE "public"."TemplateVersion" ADD COLUMN     "extractionNote" TEXT,
ADD COLUMN     "sourceModifiedAt" TIMESTAMP(3),
ADD COLUMN     "sourcePath" TEXT,
ADD COLUMN     "sourceProvider" TEXT,
ADD COLUMN     "sourceRev" TEXT;

-- CreateIndex
CREATE INDEX "Template_process_stageKey_idx" ON "public"."Template"("process", "stageKey");
