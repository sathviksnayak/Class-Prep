ALTER TABLE "TestTemplate"
  ALTER COLUMN "maximumMarks" TYPE DOUBLE PRECISION USING "maximumMarks"::DOUBLE PRECISION,
  ALTER COLUMN "totalMarks" TYPE DOUBLE PRECISION USING "totalMarks"::DOUBLE PRECISION;

CREATE TABLE "GeneratedPaper" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "templateId" TEXT,
  "templateSnapshot" JSONB NOT NULL,
  "configuration" JSONB NOT NULL,
  "paper" JSONB NOT NULL,
  "validation" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'review',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GeneratedPaper_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GeneratedPaper_userId_updatedAt_idx" ON "GeneratedPaper"("userId", "updatedAt");
CREATE INDEX "GeneratedPaper_templateId_idx" ON "GeneratedPaper"("templateId");

ALTER TABLE "GeneratedPaper" ADD CONSTRAINT "GeneratedPaper_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeneratedPaper" ADD CONSTRAINT "GeneratedPaper_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "TestTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
