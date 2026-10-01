ALTER TABLE "TestTemplate"
    ADD COLUMN "schoolName" TEXT,
    ADD COLUMN "testTitle" TEXT,
    ADD COLUMN "className" TEXT,
    ADD COLUMN "subject" TEXT,
    ADD COLUMN "examName" TEXT,
    ADD COLUMN "academicYear" TEXT,
    ADD COLUMN "duration" TEXT,
    ADD COLUMN "maximumMarks" INTEGER,
    ADD COLUMN "totalMarks" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "sections" JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN "rawHeaderText" TEXT;

UPDATE "TestTemplate" AS template
SET "totalMarks" = COALESCE((
    SELECT SUM(value::INTEGER) FROM jsonb_each_text(template."questionCounts")
), 0),
"sections" = COALESCE((
    SELECT jsonb_build_array(jsonb_build_object(
        'id', 'legacy-section-a',
        'name', 'Section A',
        'questionTypes', COALESCE(jsonb_agg(jsonb_build_object(
            'id', 'legacy-' || item.key,
            'type', item.key,
            'label', CASE item.key
                WHEN 'mcq' THEN 'Multiple Choice Questions'
                WHEN 'fillInTheBlanks' THEN 'Fill in the Blanks'
                WHEN 'trueFalse' THEN 'True / False'
                WHEN 'shortAnswer' THEN 'Short Answer'
                ELSE item.key
            END,
            'count', item.value::INTEGER,
            'attempt', item.value::INTEGER,
            'marksEach', 1
        )) FILTER (WHERE item.value::INTEGER > 0), '[]'::jsonb)
    ))
    FROM jsonb_each_text(template."questionCounts") AS item(key, value)
), '[{"id":"legacy-section-a","name":"Section A","questionTypes":[]}]'::jsonb);

ALTER TABLE "TestTemplate" DROP CONSTRAINT "TestTemplate_sourceDocumentId_fkey";
DROP INDEX "TestTemplate_sourceDocumentId_idx";
ALTER TABLE "TestTemplate" DROP COLUMN "sourceDocumentId";
ALTER TABLE "TestTemplate" DROP COLUMN "questionCounts";
