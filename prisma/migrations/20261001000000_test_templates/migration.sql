CREATE TABLE "TestTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceDocumentId" TEXT,
    "questionCounts" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TestTemplate_userId_idx" ON "TestTemplate"("userId");
CREATE INDEX "TestTemplate_sourceDocumentId_idx" ON "TestTemplate"("sourceDocumentId");

ALTER TABLE "TestTemplate" ADD CONSTRAINT "TestTemplate_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TestTemplate" ADD CONSTRAINT "TestTemplate_sourceDocumentId_fkey"
    FOREIGN KEY ("sourceDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
