# ClassPrep — Technical Project Documentation

> **Internal Engineering Documentation & Architecture Reference**  
> *Target Audience:* Software engineers and AI coding agents working on ClassPrep.  
> *Objective:* Provide a comprehensive, code-accurate technical handoff so any engineer or AI agent can understand, navigate, maintain, debug, and extend the project without reverse-engineering the codebase.  
> *Status:* Reflects the actual code present in the repository as of October 2026. Planned, unverified, or pending components are explicitly labeled.

---

## 1. Project Overview

### What ClassPrep Is
ClassPrep is a web application designed for school teachers and educators. It unifies classroom material organization with automated, blueprint-driven test paper creation. Teachers organize course documents (syllabi, textbooks, study notes, past papers) in a private hierarchical Library, define or extract reusable structured test blueprints (Test Templates), and synthesize grounded, balanced exam papers from their own materials.

### The Problem It Solves
1. **Manual Assessment Authoring Overhead:** Drafting balanced test papers following strict curricular specifications (e.g., "Section A has 10 MCQs of 1 mark each; Section B has 5 short answer questions where students attempt any 3 of 2 marks each") takes hours of manual formatting, calculation, and document cross-referencing.
2. **Hallucination & Ungrounded Questions:** Standard conversational LLMs pull questions from arbitrary public web datasets rather than the teacher's exact syllabus. ClassPrep strictly bounds question generation to discrete chunks retrieved from teacher-owned Library resources.
3. **Complex Blueprint & Marks Arithmetic:** Tests frequently mix whole numbers and fractional marks (e.g., 0.5, 1.5, 2.5) with choice rules ("Answer any 3 of 5 questions"). Calculating question counts versus attempted marks, checking feasibility against source material targets, and ensuring exact blueprint compliance requires deterministic mathematical guarantees that LLMs cannot reliably handle.
4. **Formatting & Export Friction:** Formatting test papers and separated answer keys for distribution or printing is tedious. ClassPrep automates native DOCX file generation and browser print-to-PDF output.

### Current Subsystem Status Table

| Subsystem | Status | Implementation Details & Current State |
| :--- | :--- | :--- |
| **Authentication** | ⚠️ Partially Verified | Google OAuth via Auth.js (NextAuth v4) + `@auth/prisma-adapter`. JWT session strategy with PostgreSQL User UUID propagation. Middleware in `src/proxy.ts`. Code complete; live Google OAuth flow requires valid client credentials. |
| **Library Management** | ✅ Verified | Nested folders (`Folder`), document metadata (`Document`), recursive tree navigation, search, and ancestor path resolution. |
| **Document Storage** | ✅ Verified | Private Supabase Storage bucket (`classprep-documents`). Server-side client using service role key. 20 MB size limit, MIME and magic byte signature verification (`%PDF-`, `PK`), 5-minute signed download URLs, cascade deletion. |
| **Document Extraction** | ✅ Verified | Server-side text extraction for PDF (`pdf-parse`) and DOCX (`mammoth`). Deterministic structural parser for headings, sections, groups, internal choice, and marks. Scanned PDF OCR is **not implemented**. |
| **LLM Extraction Pass** | ✅ Verified | Optional structured second-pass via OpenAI Chat Completions API with strict JSON schema. Validates verbatim `sourceQuote` substrings against original document; falls back to deterministic extraction upon discrepancy or API failure. |
| **Test Templates** | ✅ Verified | Hierarchical model (`sections` -> `questionTypes`), built-in starter templates (25, 40, 50 marks), full CRUD and cloning, distinction between `count` (offered) and `attempt` (scorable), 6-decimal scaling arithmetic. |
| **Resource Allocation** | ✅ Verified | Matrix-based allocation mapping selected Library documents to template groups. Feasibility engine enforces equality between template attempted marks and resource targets. Greedy slot allocation with single-eligible resource prioritization. |
| **Question Generation** | ✅ Verified | Text chunking (1400-char max, 160-char overlap), keyword relevance retrieval, OpenAI structured output generation (`gpt-4o-mini`). Bounded to single assigned source chunk. |
| **Question Validation** | ✅ Verified | Deterministic validation engine: verifies chunk ID existence, resource ownership, group type conformance, MCQ options count (exactly 4) and correct answer index, fill-in blank markers (`____`), True/False casing, and near-duplicate detection via 2-gram Jaccard similarity. One retry per failed batch. |
| **Paper Persistence** | ✅ Verified | Prisma `GeneratedPaper` model storing template snapshots, allocation configurations, generated questions, and validation records. Migration applied to live database. |
| **Inline Editing & Regeneration** | ✅ Verified | Client-side and server-side editing of question text, answers, MCQ options, and correct index. Atomic single-question regeneration preserving slot, group, marks, resource, and source chunk invariants. |
| **Paper Export** | ✅ Verified | Server-side native DOCX packaging using `node:zlib` (`deflateRawSync`) and custom OpenXML markup. Browser print-to-PDF with custom `@media print` CSS. Optional separated answer key. |
| **Settings** | 🚧 Not Implemented | UI route `/settings` exists as a static presentation card placeholder. Preferences are not connected to database models. |

---

## 2. Technology Stack & Versions

All technologies and versions are derived directly from [package.json](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/package.json) and project configuration files:

| Technology / Library | Exact Installed Version | Purpose |
| :--- | :--- | :--- |
| **Next.js** | `16.3.3` | Full-stack React framework (App Router, Server Actions, Route Handlers). |
| **React** | `19.2.8` | UI library. |
| **React DOM** | `19.2.8` | React DOM renderer. |
| **TypeScript** | `^5` | Strict static typing across client and server. |
| **Tailwind CSS** | `^4` (via `@tailwindcss/postcss` `^4`) | Styling and design system. |
| **NextAuth.js** | `^4.24.15` | Authentication library (Google OAuth provider). |
| **@auth/prisma-adapter** | `^2.11.3` | Adapter linking NextAuth session/user lifecycle to Prisma schema. |
| **Prisma ORM** | `^6.19.3` | Database ORM and migration tool (`@prisma/client` and CLI `prisma`). |
| **PostgreSQL** | PostgreSQL 15+ (Supabase) | Relational database. Connects via session pooler and direct port. |
| **Supabase JS Client** | `^2.117.2` (`@supabase/supabase-js`) | Server-side admin client for Supabase Storage. |
| **pdf-parse** | `^2.4.5` | Node.js PDF text and metadata extraction (configured as `serverExternalPackage`). |
| **mammoth** | `^1.13.0` | Node.js DOCX text and document structure extraction. |
| **OpenAI API** | Native `fetch` (REST API) | LLM provider for structured extraction enrichment and question generation (`gpt-4o-mini`). |
| **node:zlib** | Node.js built-in (`deflateRawSync`) | Synchronous raw deflate compression used for zero-dependency DOCX packaging. |
| **ESLint** | `^9` with `eslint-config-next` `16.3.3` | Code linting and style verification. |
| **Node Test Runner** | `node:test` + `node:assert/strict` | Automated test suite run via `npm run test:templates`. |

---

## 3. System Architecture & Data Flow

### High-Level Architecture Diagram

```
[Teacher Browser]
       │
       ▼
[Next.js App Router (16.3.3)] ── Auth & Session ──► [Auth.js / NextAuth] ──► [Google OAuth 2.0]
       │                                                    │
       ├────────────────────────────────────────────────────┴────────► [Prisma ORM (6.19.3)]
       │                                                                       │
       │                                                                       ▼
       ├─► Server Actions (Upload / Extract / Generate)           [Supabase PostgreSQL]
       │        │                                                 (User, Folder, Document,
       │        ├─► [Supabase Storage Client]                     TestTemplate, GeneratedPaper)
       │        │         │
       │        │         ▼
       │        │   [Private Bucket: classprep-documents]
       │        │
       │        ├─► [Deterministic Extractors (pdf-parse / mammoth)]
       │        │
       │        ├─► [Deterministic Feasibility & Slot Allocator]
       │        │
       │        └─► [LLM Generation / Validation Pipeline] ────────► [OpenAI API (gpt-4o-mini)]
       │
       └─► Server Action Export ──► [Custom OpenXML / zlib Packer] ──► .docx Download
```

### Detailed Subsystem Execution Flows

#### A. Document Ingestion Flow
```
Teacher Uploads File (PDF / DOCX)
  │
  ▼
[LibraryClient.tsx] validates file selection (<= 20 MB)
  │ (FormData)
  ▼
[uploadDocument] (src/app/library/actions.ts)
  ├─► requireUser(): Validates session and gets PostgreSQL User UUID
  ├─► Validates file extension (.pdf, .docx) & MIME type
  ├─► Validates safe file name (regex sanitized, <= 255 chars)
  ├─► Reads byte buffer -> Checks magic bytes (%PDF- or PK..)
  ├─► Checks folder ownership (if folderId provided)
  ├─► Queries Document table for case-insensitive duplicate names in folder
  ├─► assertPrivateStorageBucket(): Confirms bucket exists and is not public
  ├─► buildStoragePath(): Generates "{userId}/{folderId|root}/{uuid}_{safeName}"
  ├─► Supabase Storage: Uploads buffer with upsert=false
  └─► Prisma: Creates Document record (storagePath, size, type, userId, folderId)
        └─► (If DB insert fails: rollback removes uploaded file from Storage)
```

#### B. Template Extraction Flow
```
Teacher Uploads Past Paper
  │
  ▼
[extractTestPaper] (src/app/generate/actions.ts)
  ├─► requireOwner(): Validates user session
  ├─► Buffer read -> Branch:
  │     ├─► PDF: pdf-parse extract text + pageCount
  │     └─► DOCX: mammoth extractRawText
  ├─► normalizeTestPaperText(): Strips repeated page headers/footers, joins wrapped lines
  ├─► hasUsableExtractedText(): Checks printable character density (rejects scans/images)
  ├─► parseTestPaperText(): Deterministic structural detection:
  │     ├─► Exam header regex: schoolName, className, subject, duration, maximumMarks
  │     ├─► Explicit sections ("SECTION A", "PART I") or alphabetical/Roman sequences
  │     ├─► Question group patterns ("MCQ", "Fill in the blanks", "Short Answer")
  │     ├─► Numbering markers ("1.", "2.", "(a)", "(b)")
  │     ├─► Choice instructions ("Answer any 3 out of 5", "either/or")
  │     └─► Equation marks ("5 x 2 = 10") or cue lines ("Each carries 2 marks")
  ├─► enrichWithStructuredModel(): (Optional pass if OPENAI_API_KEY set)
  │     ├─► Sends text + candidates to OpenAI with strict JSON schema
  │     ├─► Validates verbatim sourceQuote substring against raw document
  │     └─► Merges suggestions; marks conflicts as 'needs_review' without overriding
  └─► Returns ExtractedTemplateDraft to CreateTestForm UI
```

#### C. Test Paper Generation & Validation Flow
```
Teacher Selects Template + Resources + Matrix + Mark Targets
  │
  ▼
[GenerationWorkspace.tsx] client-side feasibility pre-check (allocateQuestionSlots)
  │ (Start Generation button clicked)
  ▼
[generatePaper] (src/app/generate/generation-actions.ts)
  ├─► 1. Auth & Input Validation:
  │     └─► requireOwner(), validateConfiguration(), validateTemplateForGeneration()
  ├─► 2. Resource Text Retrieval:
  │     └─► Checks Document.extractedText; if null, downloads from Supabase Storage & extracts
  ├─► 3. Chunking:
  │     └─► buildChunks(): Splits resource texts into max 1400-char windows (160-char overlap)
  ├─► 4. Slot Allocation:
  │     ├─► Checks total attempted marks == total resource targets
  │     ├─► Checks resource capacity ceiling against allowed groups
  │     └─► Allocates QuestionSlots (isolated-group priority -> descending mark size -> largest deficit)
  ├─► 5. Database Initial State:
  │     └─► Creates GeneratedPaper record (status="generating", phase="preparing")
  ├─► 6. Batch Generation Loop (Group x Resource pairs):
  │     ├─► retrieveRelevantChunks(): Keyword-scored chunks for specific group
  │     ├─► generateGroupQuestions() (src/lib/question-generation.ts):
  │     │     ├─► Calls OpenAI with JSON schema response_format
  │     │     ├─► Bounded: Must cite valid sourceChunkId; no numbering/marks allowed
  │     │     └─► If malformed JSON or validation error: retries 1 time with temp=0.2
  │     ├─► validateGeneratedGroup() (src/lib/test-paper-generation.ts):
  │     │     ├─► Validates question count == expected
  │     │     ├─► Validates sourceChunkId exists and belongs to assigned resource
  │     │     ├─► MCQ: exactly 4 options, valid correctIndex, answer string matches option
  │     │     ├─► Fill-in-blanks: contains "____" blank marker
  │     │     ├─► True/False: answer is exactly "True" or "False"
  │     │     └─► Near-duplicate detection against all prior questions
  │     ├─► (If batch fails after retry: GeneratedPaper status="failed", throws error)
  │     └─► Partial update to GeneratedPaper (updates completedBatches, questions, chunks)
  ├─► 7. Final Verification & Finalize:
  │     ├─► Confirms total questions == template offered count
  │     ├─► Confirms attempted marks == template calculated total
  │     └─► GeneratedPaper status="ready" (or "review" if allocation warnings exist)
  └─► Returns final paper payload to GenerationWorkspace
```

---

## 4. File & Directory Map

```
classprep/
├── prisma/
│   ├── migrations/
│   │   ├── 20260930140842_init/
│   │   │   └── migration.sql                       # Initial schema (User, Account, Session, Folder, Document)
│   │   ├── 20260930145547_document_storage_path/
│   │   │   └── migration.sql                       # Replaced Document.fileUrl with storagePath
│   │   ├── 20261001000000_test_templates/
│   │   │   └── migration.sql                       # Initial TestTemplate model
│   │   ├── 20261001120000_expand_test_templates/
│   │   │   └── migration.sql                       # Added header fields and JSON sections to TestTemplate
│   │   ├── 20261002120000_generated_papers_and_decimal_marks/
│   │   │   └── migration.sql                       # Float marks & GeneratedPaper model (REPO ONLY - UNAPPLIED LIVE)
│   │   └── migration_lock.toml
│   └── schema.prisma                               # Authoritative Prisma schema
├── public/                                         # Static public assets (favicon.ico)
├── src/
│   ├── auth.ts                                     # NextAuth options, PrismaAdapter, JWT/session callbacks, auth()
│   ├── proxy.ts                                    # Next.js route protection proxy (middleware)
│   ├── app/
│   │   ├── layout.tsx                              # Root layout (Geist font, Providers, ShellGate)
│   │   ├── page.tsx                                # Public landing page
│   │   ├── globals.css                             # Global styles and Tailwind configuration
│   │   ├── Providers.tsx                           # Client SessionProvider wrapper
│   │   ├── login/
│   │   │   └── page.tsx                            # Sign-in page with Google OAuth button
│   │   ├── dashboard/
│   │   │   └── page.tsx                            # Protected dashboard with stats and quick links
│   │   ├── library/
│   │   │   ├── page.tsx                            # Server page: reads folders/docs based on ?folder= query
│   │   │   ├── LibraryClient.tsx                   # Client state, modals, uploads, deletion, signed URLs
│   │   │   └── actions.ts                          # Server actions: folder & document CRUD, Supabase storage ops
│   │   ├── generate/
│   │   │   ├── page.tsx                            # Server page: handles ?mode=hub|new|extract, ?edit=, ?paper=
│   │   │   ├── TemplateHub.tsx                     # Hub view: starter templates, creation cards, workspace anchor
│   │   │   ├── CreateTestForm.tsx                  # Template builder & extraction review form
│   │   │   ├── GenerationWorkspace.tsx             # Interactive matrix, targets, generation runner, paper editor
│   │   │   ├── actions.ts                          # Server actions: template CRUD, builtin clone, test extraction
│   │   │   └── generation-actions.ts               # Server actions: generatePaper, updatePaper, regenerate, export
│   │   ├── papers/
│   │   │   ├── page.tsx                            # "My Papers": lists saved templates and recent generated papers
│   │   │   └── TemplateActions.tsx                 # Client actions for template card (Edit, Duplicate, Delete)
│   │   ├── settings/
│   │   │   └── page.tsx                            # Settings page (UI placeholder for future preferences)
│   │   └── api/
│   │       ├── auth/
│   │       │   └── [...nextauth]/
│   │       │       └── route.ts                    # NextAuth HTTP route handler (GET, POST)
│   │       └── generation-progress/
│   │           └── route.ts                        # GET endpoint for polling active paper generation progress
│   ├── components/
│   │   ├── AppShell.tsx                            # Main app shell with Sidebar and content container
│   │   ├── ShellGate.tsx                           # Client layout switch (omits AppShell on /login)
│   │   ├── Sidebar.tsx                             # Navigation sidebar (Dashboard, Library, Generate, Papers, Settings)
│   │   ├── Header.tsx                              # Standard view header with title, subtitle, and action
│   │   ├── Button.tsx                              # Unified button / link component with variant styles
│   │   ├── FormField.tsx                           # Input and error container
│   │   ├── PaperCard.tsx                           # Display card for test papers
│   │   ├── PaperTable.tsx                          # Table display for paper listings
│   │   ├── StatCard.tsx                            # Simple metric display card
│   │   └── library/
│   │       ├── Breadcrumbs.tsx                     # Hierarchical breadcrumb navigation
│   │       ├── CreateFolderModal.tsx               # Modal dialogue for creating a subfolder
│   │       ├── DocumentCard.tsx                    # Document list item with signed download, rename, delete
│   │       ├── DocumentList.tsx                    # Grid/list container for documents
│   │       ├── EmptyState.tsx                      # Placeholder display when folder is empty
│   │       ├── FolderCard.tsx                      # Folder card with child item counter and actions
│   │       ├── FolderGrid.tsx                      # Grid container for folder cards
│   │       ├── LibraryHeader.tsx                   # Search input, upload trigger, and folder creation trigger
│   │       └── SearchBar.tsx                       # Text filter input for Library assets
│   ├── lib/
│   │   ├── prisma.ts                               # PrismaClient singleton with global hot-reload protection
│   │   ├── supabase.ts                             # Supabase admin client, bucket assertion, storage path builder
│   │   ├── mark-calculations.js                    # Floating-point safe mark calculations (6-decimal scale)
│   │   ├── mark-calculations.d.ts                  # TypeScript typings for mark calculation utilities
│   │   ├── test-templates.ts                       # TemplateDraft types, BUILTIN_TEMPLATES, calculateTemplateTotals
│   │   ├── test-paper-extraction.ts                # Deterministic text parser, regex rules, section/group segmenter
│   │   ├── test-paper-llm.ts                       # Structured OpenAI second-pass extractor with fallback
│   │   ├── test-paper-generation.ts                # Allocation matrix, chunking, relevance retrieval, group validation
│   │   ├── question-generation.ts                  # LLM batch question generator with JSON schema and 1-retry engine
│   │   └── test-paper-docx.ts                      # Custom OpenXML DOCX generator with deflateRawSync ZIP packing
│   └── models/                                     # Empty directory (reserved for future entity models)
├── tests/
│   └── template-calculations.test.mjs              # 21 comprehensive integration & unit tests
├── .env.example                                    # Environment variable documentation template
├── eslint.config.mjs                               # ESLint 9 configuration
├── next.config.ts                                  # Next.js configuration (external packages, body size limits)
├── package.json                                    # Dependencies, scripts, and package metadata
├── postcss.config.mjs                              # PostCSS configuration for Tailwind v4
└── tsconfig.json                                   # TypeScript compiler configuration
```

---

## 5. Authentication & Authorization

### Architecture & Configuration
Authentication is implemented via Auth.js (NextAuth.js v4) in [src/auth.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/auth.ts).
- **Provider:** Google OAuth (`GoogleProvider`).
- **Adapter:** `@auth/prisma-adapter` via `PrismaAdapter(prisma)`.
- **Session Strategy:** `"jwt"` (required for Edge and middleware compatibility).
- **Custom Pages:** `signIn: "/login"`, `error: "/login"`.

### User ID Resolution & Session Invariants
A critical design requirement in ClassPrep is that **all resource ownership must resolve to the PostgreSQL `User.id` (UUID), never Google's OAuth subject identifier (`token.sub`)**:

1. **`jwt` Callback:**
   - On initial sign-in, NextAuth provides the newly created or fetched database `user` object. The callback captures `token.userId = user.id`.
   - If `token.userId` is absent (e.g., token issued prior to a session reset), the callback executes a fallback database query:
     ```ts
     const dbUser = await prisma.user.findUnique({
       where: { email: token.email },
       select: { id: true },
     });
     if (dbUser) token.userId = dbUser.id;
     ```
2. **`session` Callback:**
   - Injects the verified PostgreSQL UUID:
     ```ts
     session.user.id = token.userId ?? "";
     ```
   - Never falls back to `token.sub`.

### Protected Routes & Middleware
Route protection is configured in [src/proxy.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/proxy.ts) using `withAuth` from `next-auth/middleware`:
- **Protected Paths:**
  - `/dashboard/:path*`
  - `/library/:path*`
  - `/generate/:path*`
  - `/papers/:path*`
  - `/settings/:path*`
- Unauthenticated requests to these routes are automatically redirected to `/login`.

### Server Action Authorization Pattern
Every Server Action that accesses or modifies user data enforces strict ownership using internal helpers:
- `requireUser()` in [src/app/library/actions.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/app/library/actions.ts):
  ```ts
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
  return session.user.id;
  ```
- `requireOwner()` in [src/app/generate/actions.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/app/generate/actions.ts) and [src/app/generate/generation-actions.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/app/generate/generation-actions.ts):
  ```ts
  const userId = (await auth())?.user?.id;
  if (!userId) throw new Error("Please sign in...");
  return userId;
  ```
All database queries include `{ where: { id: resourceId, userId } }`. Direct ID lookups without matching `userId` throw not-found or unauthorized exceptions.

---

## 6. Database Schema & Models

The database is defined in [prisma/schema.prisma](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/prisma/schema.prisma). It targets PostgreSQL using Supabase:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

### Complete Model Reference

#### 1. `User`
Represents an authenticated educator.
- `id` (`String`, `@id`, `@default(uuid())`): Primary key UUID.
- `name` (`String?`): User's full name from Google profile.
- `email` (`String?`, `@unique`): Primary contact email.
- `emailVerified` (`DateTime?`): Email verification timestamp from Google.
- `image` (`String?`): Avatar image URL from Google.
- `accounts` (`Account[]`): OAuth account links (Cascade delete).
- `sessions` (`Session[]`): Active sessions (Cascade delete).
- `folders` (`Folder[]`): Library folders owned by user (Cascade delete).
- `documents` (`Document[]`): Library documents owned by user (Cascade delete).
- `testTemplates` (`TestTemplate[]`): Test templates authored by user (Cascade delete).
- `generatedPapers` (`GeneratedPaper[]`): Generated exam papers owned by user (Cascade delete).
- `createdAt` (`DateTime`, `@default(now())`): Record creation time.
- `updatedAt` (`DateTime`, `@updatedAt`): Last update timestamp.
- *Indexes:* `@@index([email])`.

#### 2. `Account`
Stores NextAuth OAuth provider credentials.
- `id` (`String`, `@id`, `@default(uuid())`): Primary key.
- `userId` (`String`): Foreign key referencing `User.id`.
- `type` (`String`): Account type (e.g., `"oauth"`).
- `provider` (`String`): Provider name (`"google"`).
- `providerAccountId` (`String`): Provider's unique subject ID.
- `refresh_token`, `access_token`, `id_token` (`String? @db.Text`): OAuth token strings.
- `expires_at` (`Int?`): Token expiration timestamp.
- `token_type`, `scope`, `session_state` (`String?`): OAuth metadata.
- *Relations:* `user` references `User(id)` on delete Cascade.
- *Constraints:* `@@unique([provider, providerAccountId])`, `@@index([userId])`.

#### 3. `Session`
Stores active session tokens when database sessions are used.
- `id` (`String`, `@id`, `@default(uuid())`): Primary key.
- `sessionToken` (`String`, `@unique`): Session identifier.
- `userId` (`String`): Foreign key referencing `User.id`.
- `expires` (`DateTime`): Expiry timestamp.
- *Relations:* `user` references `User(id)` on delete Cascade.
- *Constraints:* `@@index([userId])`.

#### 4. `VerificationToken`
NextAuth email verification tokens (standard adapter requirement).
- `identifier` (`String`), `token` (`String`, `@unique`), `expires` (`DateTime`).
- *Constraints:* `@@unique([identifier, token])`.

#### 5. `Folder`
Hierarchical directory structure for Library materials.
- `id` (`String`, `@id`, `@default(uuid())`): Primary key UUID.
- `name` (`String`): Folder display name (sanitized, <= 255 chars).
- `parentId` (`String?`): Self-referencing foreign key to parent `Folder.id`. Null for root-level folders.
- `userId` (`String`): Owner foreign key referencing `User.id`.
- `createdAt`, `updatedAt` (`DateTime`).
- *Relations:*
  - `parentFolder` references `Folder(id)` on delete Cascade.
  - `childFolders` list of child `Folder` records.
  - `user` references `User(id)` on delete Cascade.
  - `documents` list of `Document` records in this folder.
- *Indexes:* `@@index([userId])`, `@@index([parentId])`.

#### 6. `Document`
Uploaded teaching resource or syllabus document.
- `id` (`String`, `@id`, `@default(uuid())`): Primary key UUID.
- `name` (`String`): File name with extension (sanitized, <= 255 chars).
- `type` (`String`): Extension identifier (`"pdf"` or `"docx"`).
- `size` (`Int`): File size in bytes (max 20 MB = 20,971,520 bytes).
- `storagePath` (`String`): Path in Supabase Storage (`{userId}/{folderId|root}/{uuid}_{safeName}`).
- `folderId` (`String?`): Parent folder reference. Null for root.
- `userId` (`String`): Owner foreign key referencing `User.id`.
- `extractedText` (`String? @db.Text`): Cached plain text extracted from the document.
- `createdAt`, `updatedAt` (`DateTime`).
- *Relations:*
  - `folder` references `Folder(id)` on delete Cascade.
  - `user` references `User(id)` on delete Cascade.
- *Indexes:* `@@index([userId])`, `@@index([folderId])`.

#### 7. `TestTemplate`
Reusable structural blueprint for an assessment paper.
- `id` (`String`, `@id`, `@default(uuid())`): Primary key UUID.
- `userId` (`String`): Owner foreign key referencing `User.id`.
- `name` (`String`, `@map("title")`): Template title / name.
- `schoolName` (`String?`): Detected or manual school/institution name.
- `testTitle` (`String?`): Assessment title (e.g., "Unit Test 1", "Mid-Term Examination").
- `className` (`String?`): Class or grade level (e.g., "Class 10").
- `subject` (`String?`): Academic subject (e.g., "Mathematics", "Science").
- `examName` (`String?`): Examination category.
- `academicYear` (`String?`): Academic year string (e.g., "2025-2026").
- `duration` (`String?`): Test duration string (e.g., "1 Hour", "90 Minutes").
- `maximumMarks` (`Float?`): Optional printed maximum marks header value.
- `totalMarks` (`Float`, `@default(0)`): Calculated scorable attempted marks.
- `sections` (`Json`, `@default("[]")`): JSON array of `SectionDraft` structures.
- `rawHeaderText` (`String? @db.Text`): Verbatim header text from extracted paper.
- `createdAt`, `updatedAt` (`DateTime`).
- *Relations:*
  - `user` references `User(id)` on delete Cascade.
  - `generatedPapers` list of `GeneratedPaper` records created using this template.
- *Indexes:* `@@index([userId])`.

#### 8. `GeneratedPaper`
A generated exam paper instance, containing questions, slot assignments, and validation logs.
- `id` (`String`, `@id`, `@default(uuid())`): Primary key UUID (client-supplied generation request ID).
- `userId` (`String`): Owner foreign key referencing `User.id`.
- `templateId` (`String?`): Reference to originating `TestTemplate.id` (SetNull on delete).
- `templateSnapshot` (`Json`): Immutable snapshot of the template state at generation time.
- `configuration` (`Json`): Resource selection, matrix, targets, and chunk allocations.
- `paper` (`Json`): Complete generated paper structure (title, sections, groups, questions).
- `validation` (`Json`): Detailed audit of batch validations, retries, errors, and warnings.
- `status` (`String`, `@default("review")`): Current status (`"generating"`, `"review"`, `"ready"`, `"failed"`).
- `createdAt`, `updatedAt` (`DateTime`).
- *Relations:*
  - `user` references `User(id)` on delete Cascade.
  - `template` references `TestTemplate(id)` on delete SetNull.
  - *Indexes:* `@@index([userId, updatedAt])`, `@@index([templateId])`.

---

### Detailed JSON Field Structures

#### A. `TestTemplate.sections` (`SectionDraft[]`)
```ts
[
  {
    id: "section-1",
    name: "Section A",
    implicit: false, // true if paper had no explicit section headings
    questionTypes: [
      {
        id: "group-1",
        type: "mcq", // mcq | fill-in-the-blanks | true-false | short-answer | long-answer | custom:*
        label: "Multiple Choice Questions",
        count: 5,     // Offered questions printed on paper (integer)
        attempt: 5,   // Scorable questions student must attempt (integer)
        marksEach: 1, // Marks per question (Float: e.g. 0.5, 1, 1.5, 2.5)
        extraction: { // Optional extraction provenance
          offered: { value: 5, raw: "5 x 1 = 5", status: "detected" },
          attempt: { value: 5, raw: null, status: "inferred" },
          marksEach: { value: 1, raw: "5 x 1 = 5", status: "detected" },
          groupMarks: { value: 5, raw: "5 x 1 = 5", status: "detected" },
          sourceQuote: "5 x 1 = 5",
          choiceWording: null,
          needsReview: false,
          reviewReason: null,
          alternateLabel: null
        }
      }
    ]
  }
]
```

#### B. `GeneratedPaper.configuration`
```ts
{
  selectedResources: [
    { id: "doc-uuid-1", name: "Chapter 1 - Photosynthesis.pdf" }
  ],
  matrix: {
    "doc-uuid-1": { "group-1": true, "group-2": false }
  },
  targets: [
    { resourceId: "doc-uuid-1", targetMarks: 20 }
  ],
  resourceGroupAttemptedMarks: [
    { resourceId: "doc-uuid-1", targetMarks: 20, achievedMarks: 20, difference: 0, maximumMarks: 25 }
  ],
  slotAssignments: [
    {
      id: "group-1:slot:1",
      groupId: "group-1",
      sectionId: "section-1",
      questionType: "mcq",
      marksEach: 1,
      resourceId: "doc-uuid-1",
      alternativeIndex: 0
    }
  ],
  questionAssignments: [
    { questionIndex: 0, groupId: "group-1", resourceId: "doc-uuid-1", slotId: "group-1:slot:1" }
  ],
  sourceChunks: [
    {
      id: "doc-uuid-1:chunk:0",
      resourceId: "doc-uuid-1",
      resourceName: "Chapter 1 - Photosynthesis.pdf",
      heading: "Light Reactions",
      text: "Chlorophyll absorbs blue and red light..."
    }
  ]
}
```

#### C. `GeneratedPaper.paper`
```ts
{
  title: "Mid-Term Science Exam",
  totalMarks: 25,
  warnings: [],
  resourceRows: [
    { resourceId: "doc-uuid-1", resourceName: "Chapter 1", targetMarks: 25, achievedMarks: 25, difference: 0 }
  ],
  sections: [
    {
      id: "section-1",
      name: "Section A",
      implicit: false,
      groups: [
        {
          id: "group-1",
          type: "mcq",
          label: "Multiple Choice Questions",
          offered: 5,
          attempt: 5,
          marksEach: 1,
          questions: [
            {
              id: "q-uuid-1",
              slotId: "group-1:slot:1",
              groupId: "group-1",
              sectionId: "section-1",
              type: "mcq",
              marksEach: 1,
              resourceId: "doc-uuid-1",
              sourceChunkId: "doc-uuid-1:chunk:0",
              text: "Which pigment absorbs light during photosynthesis?",
              answer: "Chlorophyll",
              options: ["Chlorophyll", "Carotenoid", "Hemoglobin", "Melanin"],
              correctIndex: 0
            }
          ]
        }
      ]
    }
  ],
  questions: [ /* Flat array of all GeneratedQuestion objects */ ]
}
```

#### D. `GeneratedPaper.validation`
```ts
{
  passed: true,
  expectedQuestionCount: 14,
  actualQuestionCount: 14,
  expectedTotal: 25,
  calculatedTotal: 25,
  phase: "complete", // "preparing" | "generating" | "complete" | "failed"
  completedBatches: 3,
  totalBatches: 3,
  warnings: [],
  groups: [
    {
      groupId: "group-1",
      resourceId: "doc-uuid-1",
      retries: 0,
      passed: true,
      errors: []
    }
  ],
  generationError: undefined
}
```

---

## 7. Database Migrations

All Prisma migrations are located in [prisma/migrations](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/prisma/migrations):

### Chronological Migration History

| # | Migration Directory | Summary of Changes | Live DB Status |
| :- | :--- | :--- | :--- |
| **1** | `20260930140842_init` | Initial PostgreSQL tables: `User`, `Account`, `Session`, `VerificationToken`, `Folder` (with self-relation hierarchy), and `Document` (with `fileUrl`). | ✅ Applied Live |
| **2** | `20260930145547_document_storage_path` | Dropped `Document.fileUrl`. Added non-null `storagePath` for Supabase Storage paths. | ✅ Applied Live |
| **3** | `20261001000000_test_templates` | Created initial `TestTemplate` table with `title`, `sourceDocumentId`, and simple `questionCounts` JSONB. | ✅ Applied Live |
| **4** | `20261001120000_expand_test_templates` | Expanded `TestTemplate` to support rich headers (`schoolName`, `testTitle`, `className`, `subject`, `examName`, `academicYear`, `duration`, `maximumMarks`, `totalMarks`, `rawHeaderText`, `sections` JSONB). Dropped `sourceDocumentId` and migrated legacy `questionCounts` into `sections`. | ✅ Applied Live |
| **5** | `20261002120000_generated_papers_and_decimal_marks` | Altered `TestTemplate.maximumMarks` and `totalMarks` to `DOUBLE PRECISION`. Created `GeneratedPaper` table (`templateSnapshot`, `configuration`, `paper`, `validation`, `status`). | ⚠️ **Not Yet Applied Live** |

> [!WARNING]
> **Active Migration Alert:** Migration `20261002120000_generated_papers_and_decimal_marks` exists in the local repository and passes schema validation, but running `npx prisma migrate status` against Supabase confirmed it has **not yet been applied to the live production database**. Running `prisma migrate deploy` is required before live paper persistence can function against Supabase.

---

## 8. Library & Storage Subsystems

The Library provides hierarchical document management in [src/app/library/](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/app/library/). Storage interacts with Supabase Storage via [src/lib/supabase.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/lib/supabase.ts).

### Storage Specifications
- **Bucket Name:** `SUPABASE_STORAGE_BUCKET` (default: `classprep-documents`).
- **Bucket Visibility:** Strictly private. Verified by `assertPrivateStorageBucket()`, which calls `supabaseAdmin.storage.getBucket()` and throws if `data.public === true` or if the bucket does not exist.
- **Path Structure:** `${userId}/${folderId ?? "root"}/${randomUUID()}_${safeFilename}`.
  - Filenames are sanitized with `replace(/[^a-zA-Z0-9._-]/g, "_")`.

### Document Upload Pipeline
Implemented in `uploadDocument(formData: FormData)`:
1. **User Check:** Confirms `userId` via `requireUser()`.
2. **File Size Check:** Enforces `file.size <= 20 * 1024 * 1024` (20 MB).
3. **Extension & MIME Validation:** Rejects extensions other than `pdf` and `docx`. Checks that client-reported `file.type` matches expected MIME types:
   - PDF: `application/pdf`
   - DOCX: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
4. **Magic Byte Signature Check:**
   - PDF: Checks first 5 bytes equal `%PDF-` (`buffer.subarray(0, 5).toString("ascii") === "%PDF-"`).
   - DOCX: Checks first 2 bytes equal `0x50, 0x4b` (`PK` zip signature).
5. **Folder Ownership Check:** If `folderId` is provided, queries `Folder` by `id` and confirms `folder.userId === userId`.
6. **Case-Insensitive Duplicate Check:** Checks if a document with the same name already exists in the same folder for this user.
7. **Storage Upload:** Uploads to Supabase Storage with `upsert: false`.
8. **Prisma Insertion & Storage Rollback:** Inserts `Document` row. If the database insertion fails, catches the error, immediately executes `supabaseAdmin.storage.from(STORAGE_BUCKET).remove([storagePath])`, and rethrows a user-friendly error.

### Secure Download URLs
Implemented in `getDocumentSignedUrl(documentId: string)`:
- Verifies document ownership (`doc.userId === userId`).
- Generates a time-limited signed URL with a 5-minute TTL (300 seconds) via `supabaseAdmin.storage.from(STORAGE_BUCKET).createSignedUrl(doc.storagePath, 300)`.
- The storage bucket remains private; no public URLs are ever exposed.

### Cascade & Tree Deletion
Implemented in `deleteFolder(folderId: string)`:
- Recursively gathers all document storage paths in the folder tree using `getAllDocumentsInFolderTree(folderId, userId)`.
- Deletes storage objects from Supabase in a single batch via `.remove(storagePaths)`.
- Deletes the `Folder` record in Prisma; child folders and documents are removed by PostgreSQL Foreign Key cascades (`onDelete: Cascade`).

---

## 9. Document Extraction Pipeline

The extraction subsystem converts PDF and DOCX assessment papers into structured, editable `TemplateDraft` blueprints. It resides in [src/lib/test-paper-extraction.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/lib/test-paper-extraction.ts) and [src/lib/test-paper-llm.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/lib/test-paper-llm.ts).

### Deterministic Extraction Flow

```
Raw File Buffer (PDF / DOCX)
  │
  ├─► PDF: PDFParse({ data: buffer }).getText()
  └─► DOCX: mammoth.extractRawText({ buffer })
        │
        ▼
normalizeTestPaperText(rawText)
  │ - Splits by form feed (\f) and newlines
  │ - Identifies & strips repeated header/footer margins (>1 page occurrences)
  │ - Normalizes bullet characters ([•●▪◦‣] -> •)
  │ - Joins wrapped continuation lines unless boundary markers match
  ▼
hasUsableExtractedText(normalizedText, pageCount)
  │ - Density check: non-control chars >= 12 per page
  │ - Printable chars >= 70% of total non-whitespace
  │ - Alphanumeric chars >= 8
  ▼ (if false -> flags scan/image-only warning, OCR required)
parseTestPaperText(rawText, filename, pageCount)
  │
  ├─► headerFields(): Detects school, className, subject, title, duration, maximumMarks
  ├─► detectExplicitSections(): Regex matches "SECTION A", "PART I", etc.
  ├─► numberedSequence(): Detects top-level Roman ("I.", "II.") or Alpha ("A.", "B.") sequences
  ├─► segmentGroups(): Detects question categories & bounds within sections:
  │     - Matches question type keywords (MCQ, Fill in the blanks, Short Answer, etc.)
  │     - Regex captures choices: "Answer any 3 out of 5", "either/or"
  │     - Regex captures equations: "([0-9]+) x ([0-9]+) = ([0-9]+)"
  │     - Number markers: detects item lists like "1.", "2.", "3."
  │     - Ambiguity cues: groups with single '(2)' marks cue without clear counts
  │       are marked with status='needs_review' rather than guessing
  └─► calculateExtractedMarks(): Computes attempted marks per section and total
```

### LLM Enrichment Pass & Conflict Resolution
If an `OPENAI_API_KEY` is present, `enrichWithStructuredModel()` in [src/lib/test-paper-llm.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/lib/test-paper-llm.ts) executes an optional second pass:
- Sends `normalizedText` (truncated to 24,000 chars) and deterministic candidates to OpenAI (`gpt-4o-mini`).
- Temperature is locked to `0` with a strict `json_schema` response format.
- **Verbatim Quote Rule:** For every suggested group, the model must provide an exact `sourceQuote` substring that exists in the raw text. If `rawText.includes(candidate.sourceQuote)` is false, the suggestion is discarded.
- **Non-Destructive Conflict Marking:** If the model proposes different counts or marks than the deterministic parser, it does **not** overwrite the deterministic value. Instead, it marks the field status as `"needs_review"`, records the model's suggestion in `alternate`, and sets `reviewReason = "The structured review disagreed with deterministic parsing. Confirm the original wording and values."`.
- **Fail-Safe Fallback:** Any network error, schema parse error, or timeout (8,000 ms AbortSignal) immediately returns the unmodified deterministic sections.

### OCR & Scanned Document Limitation
ClassPrep contains **no optical character recognition (OCR) engine**. If a teacher uploads a scanned PDF or image-only document:
1. `pdf-parse` extracts empty or whitespace-only text.
2. `hasUsableExtractedText()` evaluates to `false`.
3. The system raises the warning: `"Text could not be reliably extracted from this PDF. OCR is not currently supported. Create the template manually."`.

---

## 10. Test Template System

Test templates define the structural blueprint of an exam. They are implemented in [src/lib/test-templates.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/lib/test-templates.ts).

### Offered Count vs. Attempt Count
A crucial distinction in assessment design is handled explicitly by ClassPrep:
- `count` (Offered Questions): The total number of questions printed on the exam paper for that group.
- `attempt` (Scorable Questions): The number of questions a student must actually answer.
- **Marks Formula:**
  $$\text{Group Attempted Marks} = \text{attempt} \times \text{marksEach}$$
  The exam's scorable total is always calculated from `attempt`, never `count`. For example, in a group with `count = 5`, `attempt = 3`, and `marksEach = 2`, the paper prints 5 questions but contributes only $3 \times 2 = 6$ scorable marks.

### Decimal & Floating-Point Marks Architecture
Marks in ClassPrep can be fractional (e.g., 0.5, 1.5, 2.5), whereas question counts are strictly integers.
To prevent binary floating-point representation errors (e.g., `0.1 + 0.2 = 0.30000000000000004`), all calculations pass through [src/lib/mark-calculations.js](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/lib/mark-calculations.js):
- **Scaling Factor:** Fixed scale of 1,000,000 (`SCALE = 1_000_000`).
- **`cleanMark(value)`:** `Math.round(value * SCALE) / SCALE`. Normalizes `-0` to `0`.
- **`marksEqual(a, b)`:** `Math.abs(cleanMark(a - b)) < 1 / SCALE`.
- **`formatMark(value)`:** Formats numbers with up to 6 decimal places, omitting trailing zeros and locale grouping commas (`toLocaleString("en-US", { maximumFractionDigits: 6, useGrouping: false })`).

### Built-in Starter Templates
ClassPrep provides 3 immutable built-in templates in `BUILTIN_TEMPLATES`:
1. **25 Marks Template (`id: "25"`):**
   - Section A: 5 MCQs × 1 mark = 5 marks
   - Section B: 5 Fill-in-the-Blanks × 1 mark = 5 marks
   - Section C: 3 Short Answer × 2 marks = 6 marks
   - Section D: 1 Long Answer × 9 marks = 9 marks
   - *Total:* 14 questions, 25 marks.
2. **40 Marks Template (`id: "40"`):**
   - Section A: 10 MCQs × 1 mark = 10 marks
   - Section B: 5 Fill-in-the-Blanks × 1 mark = 5 marks
   - Section C: 5 Short Answer × 2 marks = 10 marks
   - Section D: 3 Long Answer × 5 marks = 15 marks
   - *Total:* 23 questions, 40 marks.
3. **50 Marks Template (`id: "50"`):**
   - Section A: 10 MCQs × 1 mark (10) + 10 Fill-in-the-Blanks × 1 mark (10) = 20 marks
   - Section B: 5 Short Answer × 2 marks = 10 marks
   - Section C: 4 Long Answer × 5 marks = 20 marks
   - *Total:* 29 questions, 50 marks.

Cloning a built-in via `createBuiltinCopy(builtinId)` deep-copies sections and assigns fresh UUIDs to prevent mutating static definitions.

---

## 11. Resource × Group Allocation Engine

The allocation engine distributes question slots across teacher-selected Library resources. It is implemented in `allocateQuestionSlots()` in [src/lib/test-paper-generation.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/lib/test-paper-generation.ts).

### Inputs to the Engine
1. `sections`: Array of `SectionDraft` defining the template groups.
2. `resourceIds`: Array of selected `Document.id` strings (1 to 12 resources).
3. `matrix`: `Record<resourceId, Record<groupId, boolean>>` defining eligibility.
4. `targetByResource`: `Record<resourceId, number>` defining requested mark contributions.

### Validation Rules
1. **Template Gating:** `validateTemplateForGeneration(sections)` verifies every section has at least one group, all counts are positive integers, marks per question are non-negative numbers, and attempt counts satisfy $1 \le \text{attempt} \le \text{count}$.
2. **Sum Invariant:** The sum of all resource targets must exactly equal the template's attempted marks total (`marksEqual(targetTotal, paperTotal)`). If unequal, throws an error requiring adjustment.
3. **Group Coverage:** Every question group must have at least one allowed resource in the matrix.
4. **Capacity Ceilings:** The engine calculates the maximum possible marks each resource could provide based on allowed groups:
   $$\text{maximumMarks}(R) = \sum_{G \in \text{allowed}(R)} (\text{attempt}_G \times \text{marksEach}_G)$$
   If $\text{target}(R) > \text{maximumMarks}(R)$, throws an error immediately before slot assignment.

### Allocation Algorithm
```
1. Groups are sorted descending by marksEach (largest questions assigned first).
2. Priority Partitioning:
   - Pass 1: Groups with ONLY ONE eligible resource are processed first.
             (Prevents flexible resources from consuming restricted slots).
   - Pass 2: Groups with MULTIPLE eligible resources are processed next.
3. For each attempted question slot in a group (index = 0 to attempt - 1):
   - Candidate resources sorted by:
     a. Remaining deficit (targetMarks - achievedMarks) descending.
     b. Stable tie-break by original resourceIds index.
   - Slot is assigned to candidate[0].
   - candidate[0].achievedMarks += group.marksEach.
4. Final comparison of targetMarks vs achievedMarks:
   - If exact target marks could not be achieved (e.g., target is 5 but questions are 2 marks each),
     records warnings but preserves user-configured targets.
```

### Concrete Allocation Examples

#### Example 1: Whole Marks with Internal Choice
- Group: Offered = 5, Attempt = 3, MarksEach = 2.
- Slot Allocation: Generates exactly 3 attempted slots (`group:slot:1`, `group:slot:2`, `group:slot:3`).
- Offered Expansion: The 2 alternative questions (slots 4 and 5) reuse the resource assignments of the scorable slots via modulo indexing (`slot = slots[index % slots.length]`). All 5 questions are generated, but attempted marks contribute only 6.

#### Example 2: Fractional / Decimal Marks
- Resource A target: 5 marks
- Resource B target: 15 marks
- Group 1: 10 MCQs, attempt 10, marksEach = 0.5 (Allowed: A only) -> Achieved A = 5.0
- Group 2: 5 Short, attempt 5, marksEach = 1.5 (Allowed: A and B) -> Assigned to B
- Group 3: 3 Long, attempt 3, marksEach = 2.5 (Allowed: B only) -> Achieved B = 7.5
- Total Paper Marks = 20.0 (Clean decimal precision verified).

---

## 12. Question Generation & LLM Integration

Implemented in [src/lib/question-generation.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/lib/question-generation.ts) and [src/lib/test-paper-generation.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/lib/test-paper-generation.ts).

### Grounding & Chunking Pipeline
1. **Chunking (`buildChunks`):**
   - Takes plain text from Library resources.
   - Splits on chapter/unit heading regex or sentence boundaries.
   - Max chunk length: 1,400 characters.
   - Overlap: 160 characters (retains semantic context across window boundaries).
   - Each chunk receives a permanent ID: `${resourceId}:chunk:${index}`.
2. **Relevance Retrieval (`retrieveRelevantChunks`):**
   - Tokenizes group labels and subject terms, filtering common stopwords.
   - Ranks chunks by query term frequency.
   - Selects top 8 relevant chunks per generation batch.
   - Fallback: If no keywords match, spreads selections evenly across the document.

### LLM Call Specifications
- **Provider:** Groq API (`https://api.groq.com/openai/v1/chat/completions`).
- **Model:** Configured via `process.env.GROQ_MODEL` or `process.env.TEST_GENERATION_MODEL`, defaulting to `"llama-3.3-70b-versatile"`.
- **Timeout:** 45,000 ms via `AbortSignal.timeout(45000)`.
- **Temperature:** `0.4` on initial attempt; drops to `0.2` on retry.
- **Output Mode:** JSON object format using `response_format: { type: "json_object" }`.

### Strict Division of Responsibilities
| Controlled Strictly by Application | Controlled by LLM |
| :--- | :--- |
| Question count and batch size | Question phrasing and wording |
| Question numbering (1, 2, 3...) | Answer content and answer key |
| Section names and hierarchy | MCQ distractor option text |
| Marks per question and totals | Selecting cited `sourceChunkId` from supplied list |
| Resource assignment and slot mapping | |

### Question Schema
The model is constrained to generate an array of objects matching:
- `text` (`string`): The question prompt.
- `answer` (`string`): The model answer or correct option text.
- `sourceChunkId` (`string`): Exact chunk ID from which the question was synthesized.
- `options` (`string[]`): Array of options (must be exactly 4 for MCQ; empty `[]` for others).
- `correctIndex` (`integer | null`): 0-3 index for MCQ; `null` for others.

---

## 13. Question Validation Engine

Validation is strictly deterministic and runs after every LLM batch in `validateGeneratedGroup()` in [src/lib/test-paper-generation.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/lib/test-paper-generation.ts).

### Validation Rules
1. **Quantity Check:** Returned questions count must equal assigned slots count.
2. **Chunk Citation Check:** `sourceChunkId` must exist in the chunk set provided to the model.
3. **Resource Ownership Check:** The chunk cited must belong to the exact `resourceId` assigned to that question slot.
4. **Group & Type Match:** `question.groupId` and `question.type` must match the assigned group.
5. **MCQ Integrity:**
   - Must have exactly 4 options.
   - All options must be non-empty strings.
   - `correctIndex` must be an integer between 0 and 3.
   - `question.answer` string (trimmed, lowercased) must match `options[correctIndex]`.
6. **Fill-in-the-Blank Integrity:** Question text must contain a visible blank indicator matching `/_{2,}|\[blank\]|<blank>|\(\s*\)/`.
7. **True/False Integrity:** `question.answer` must be strictly `"True"` or `"False"` (case-insensitive check against `/^(true|false)$/`).
8. **Near-Duplicate Detection (`isNearDuplicateQuestion`):**
   - Compares alphanumeric characters stripped of punctuation.
   - Computes Jaccard word-token overlap (tokens of length $\ge 2$).
   - If token union size $\ge 6$ and $\frac{\text{intersection}}{\text{union}} \ge 0.8$, flags as a near-duplicate and rejects the batch.

### Retry & Failure Lifecycle
1. **Initial Batch Failure:** If JSON parsing fails or `validateGeneratedGroup()` returns validation errors, the batch runner logs the error and triggers **one immediate retry** (`retry = 1`) with lower temperature (`0.2`).
2. **Second Failure:** If the retry also fails validation:
   - Updates `GeneratedPaper` in database with `status = "failed"`, `phase = "failed"`, and records `generationError`.
   - Aborts generation process and throws an exception with specific diagnostic messages.
   - Existing validated batches remain stored in the database record for debugging.

---

## 14. Generated Paper Lifecycle & State Management

The `GeneratedPaper` model tracks the complete generation and review lifecycle:

```
[Start Generation]
       │
       ▼
status: "generating", phase: "preparing"  (Prisma row created)
       │
       ▼
Batch Generation Loop (groups x resources)
       │
       ├─► (Progress polling: GET /api/generation-progress?id=...)
       │
       ├─► Batch Fails Twice ──► status: "failed", phase: "failed" (Halt)
       │
       ▼ All Batches Validated
status: "ready" (or "review" if allocation warnings exist)
       │
       ├─► Teacher Edits Questions ──► status: "review", validation.teacherEdited = true
       │
       ├─► Regenerate Single Question ──► status: "review", validation.regeneratedQuestionId = ...
       │
       ├─► Export DOCX (download)
       │
       └─► Print to PDF (browser print)
```

### Retrieving and Viewing Papers
- In [src/app/papers/page.tsx](file:///c:/Users/Sathvik S Nayak/OneDrive/Desktop/classprep/src/app/papers/page.tsx), the server queries up to 20 recent `GeneratedPaper` records for the user.
- Clicking "Open paper" navigates to `/generate?paper=${record.id}`.
- In [src/app/generate/page.tsx](file:///c:/Users/Sathvik S Nayak/OneDrive/Desktop/classprep/src/app/generate/page.tsx), the page loads the requested record and initializes `GenerationWorkspace` with `initialGenerated`, displaying the complete generated test paper.

---

## 15. Editing & Regeneration Subsystem

Implemented in [src/app/generate/generation-actions.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/app/generate/generation-actions.ts) and [src/app/generate/GenerationWorkspace.tsx](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/app/generate/GenerationWorkspace.tsx).

### Inline Question Editing (`updateGeneratedPaper`)
Teachers can edit question prompts, answers, MCQ options, and correct option indices:
- **Validation:**
  - Length checks: text and answers must be between 1 and 5,000 characters.
  - MCQ checks: retains exactly 4 non-empty options; correct index must be valid; answer key must match selected option.
  - Fill-in-the-blank checks: preserves visible blank marker (`____`).
  - True/False checks: answer must remain True or False.
  - Duplicate check: verifies teacher edits did not create duplicate questions within the paper.
- **Side Effects:** Updates `paper.questions` and `paper.sections`. Sets `validation.teacherEdited = true` and `status = "review"`.

### Atomic Question Regeneration (`regeneratePaperQuestion`)
Teachers can regenerate an individual question without re-running the entire paper:
- **Strict Invariant Guarantee:**
  Regeneration isolates the target question and **guarantees that the following attributes remain unchanged**:
  1. `groupId` and `sectionId`
  2. `marksEach`
  3. `resourceId` (same source material)
  4. `slotId`
  5. `sourceChunkId` (regenerates from the identical source chunk)
- **Call Flow:**
  1. Looks up `old = saved.questions.find(q => q.id === questionId)`.
  2. Retrieves original `chunk = configuration.sourceChunks.find(c => c.id === old.sourceChunkId)`.
  3. Calls `generateGroupQuestions` with `assignments: [{ slotId: old.slotId }]` and passes all other existing question texts as `existingTexts` to prevent collisions.
  4. Replaces question in database and workspace state.

---

## 16. Export Subsystem

ClassPrep supports two export formats: native DOCX files and browser print-to-PDF.

### 1. Server-Side DOCX Generation
Implemented in [src/lib/test-paper-docx.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/lib/test-paper-docx.ts):
- **Zero Heavy Dependencies:** ClassPrep does not use bulky npm Word generation libraries. It constructs valid OpenXML (`.docx`) file packages directly using Node's built-in `node:zlib` (`deflateRawSync`).
- **Archive Construction:** Creates an uncompressed ZIP directory structure containing:
  - `[Content_Types].xml`
  - `_rels/.rels`
  - `word/document.xml`
- **Typography & Layout:**
  - Paper title formatted as bold paragraph.
  - Section headers, group instruction lines with choice rules and marks (e.g., *"Section A — Answer any 3 of the following 5 questions. Each carries 2 marks."*).
  - Continuous 1-based question numbering throughout the test paper.
  - MCQ options indented with letters (`A.`, `B.`, `C.`, `D.`).
  - Section totals and grand paper total.
- **Answer Key Option:** When `includeAnswers = true`:
  - Inserts a hard page break: `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`.
  - Appends an **Answer Key** section listing every question, model answer, and correct MCQ letter option.
- **Delivery:** Returned as a Base64 string from server action `exportGeneratedPaperDocx`, decoded into a `Blob`, and downloaded via an anchor element in the browser.

### 2. Print-to-PDF Engine
Implemented via client print styles in [src/app/generate/GenerationWorkspace.tsx](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/app/generate/GenerationWorkspace.tsx):
- Triggered by calling `window.print()`.
- Uses global CSS print media queries:
  ```css
  @media print {
    body { background: white !important; }
    @page { margin: 18mm; }
  }
  ```
- All web interface chrome, headers, sidebars, buttons, edit textareas, matrix tables, and allocation summaries have `print:hidden`.
- Questions render with clean semantic typography (`print:block`, `break-inside-avoid`).
- Includes a "Print / PDF" action and a "Print answer key" action that toggles answer key visibility before triggering `window.print()`.

---

## 17. API & Server Action Reference

### Route Handlers

#### `GET /api/auth/[...nextauth]`
- **File:** [src/app/api/auth/[...nextauth]/route.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/app/api/auth/%5B...nextauth%5D/route.ts)
- **Purpose:** NextAuth authentication lifecycle (OAuth callbacks, session checks, CSRF).
- **Auth:** Public endpoint handling authentication.

#### `GET /api/generation-progress`
- **File:** [src/app/api/generation-progress/route.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/app/api/generation-progress/route.ts)
- **Purpose:** Polling endpoint for active test paper generation progress.
- **Auth:** Requires authenticated user session.
- **Query Params:** `?id=<generationId>` (UUID).
- **Returns:** `{ status, phase, completedBatches, totalBatches, groups, error }`.

---

### Server Actions Reference

#### Library Actions (`src/app/library/actions.ts`)

| Function | Inputs | Output | Auth | Side Effects & Description |
| :--- | :--- | :--- | :--- | :--- |
| `getFolders` | `parentId: string \| null` | `Folder[]` | Session | Queries child folders of `parentId` owned by current user. |
| `createFolder` | `name: string, parentId: string \| null` | `Folder` | Session | Creates new folder; validates length <= 255; verifies parent ownership; revalidates `/library`. |
| `renameFolder` | `folderId: string, newName: string` | `Folder` | Session | Updates folder name; revalidates `/library`. |
| `deleteFolder` | `folderId: string` | `void` | Session | Recursively deletes all document files in tree from Supabase Storage; deletes folder row with DB cascade; revalidates `/library`. |
| `getDocuments` | `folderId: string \| null` | `Document[]` | Session | Queries documents in `folderId` owned by current user. |
| `uploadDocument` | `formData: FormData` | `Document` summary | Session | Validates size <= 20 MB, MIME, magic bytes (`%PDF-`, `PK`); uploads to Supabase Storage; creates `Document` record; revalidates `/library`. |
| `getDocumentSignedUrl`| `documentId: string` | `string` (URL) | Session | Generates 5-minute signed download URL from Supabase Storage. |
| `renameDocument` | `documentId: string, newName: string` | `Document` | Session | Validates name and checks case-insensitive duplicate in folder; updates name. |
| `deleteDocument` | `documentId: string` | `void` | Session | Deletes file from Supabase Storage; deletes `Document` row in DB; revalidates `/library`. |
| `getFolderAncestors` | `folderId: string` | `{ id, name }[]` | Session | Climbs folder tree up to root to assemble breadcrumbs. |

#### Template Actions (`src/app/generate/actions.ts`)

| Function | Inputs | Output | Auth | Side Effects & Description |
| :--- | :--- | :--- | :--- | :--- |
| `saveTestTemplate` | `draft: TemplateDraft, templateId?: string` | `{ id: string }` | Session | Validates structure & counts; calculates totals; creates or updates `TestTemplate`; revalidates `/generate`, `/papers`. |
| `duplicateTestTemplate` | `templateId: string` | `{ id: string }` | Session | Clones template row with `(copy)` suffix; revalidates `/papers`. |
| `deleteTestTemplate` | `templateId: string` | `void` | Session | Deletes template row owned by user; revalidates `/papers`. |
| `createBuiltinCopy` | `builtinId: string` | `{ id: string }` | Session | Copies immutable starter template (25, 40, or 50) into user's templates. |
| `extractTestPaper` | `formData: FormData` | Extracted draft payload | Session | Extracts text from PDF/DOCX; runs deterministic parsing; runs optional LLM enrichment; returns draft. |

#### Generation Actions (`src/app/generate/generation-actions.ts`)

| Function | Inputs | Output | Auth | Side Effects & Description |
| :--- | :--- | :--- | :--- | :--- |
| `generatePaper` | `templateId, resourceIds, matrix, targets, generationId` | Generated paper object | Session | Full generation pipeline: extracts resource texts, builds chunks, allocates slots, runs OpenAI batches with retry, validates questions, persists `GeneratedPaper`. |
| `updateGeneratedPaper`| `paperId: string, proposed: GeneratedQuestion[]` | `{ ok: true }` | Session | Validates edited question text, answers, MCQ options; persists update; updates status to `"review"`. |
| `regeneratePaperQuestion` | `paperId: string, questionId: string` | `GeneratedQuestion` | Session | Regenerates single question preserving slot, group, marks, resource, and source chunk invariants. |
| `exportGeneratedPaperDocx` | `paperId: string, includeAnswers: boolean` | `{ fileName, base64 }` | Session | Builds native OpenXML DOCX archive using `deflateRawSync`; returns Base64. |
| `loadGeneratedPaper` | `paperId: string` | Saved paper object | Session | Retrieves saved `GeneratedPaper` record for workspace review. |

---

## 18. Important Function Reference

### 1. `allocateQuestionSlots`
- **File:** [src/lib/test-paper-generation.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/lib/test-paper-generation.ts#L65-L124)
- **Purpose:** Allocates scorable question slots across allowed Library resources according to mark targets.
- **Called by:** `generatePaper` ([generation-actions.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/app/generate/generation-actions.ts)), `makeFeasibility` ([GenerationWorkspace.tsx](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/app/generate/GenerationWorkspace.tsx)).
- **Inputs:** `sections: readonly SectionDraft[]`, `resourceIds: readonly string[]`, `matrix: Record<string, Record<string, boolean>>`, `targetByResource: Record<string, number>`.
- **Output:** `AllocationResult` (`{ slots, rows, groupAllocations, paperTotal, warnings }`).
- **Validation:** Throws if resource targets sum does not match paper total, if targets exceed resource capacity ceilings, or if any group lacks allowed resources.
- **Invariant:** Prioritizes groups with only 1 allowed resource to prevent flexible resources from starving constrained groups.

### 2. `generateGroupQuestions`
- **File:** [src/lib/question-generation.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/lib/question-generation.ts#L41-L105)
- **Purpose:** Calls OpenAI with strict JSON schema to generate a batch of grounded questions.
- **Called by:** `generatePaper`, `regeneratePaperQuestion` ([generation-actions.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/app/generate/generation-actions.ts)).
- **Inputs:** `{ group, resourceId, chunks, assignments, existingTexts, fetcher? }`.
- **Output:** `Promise<{ questions: GeneratedQuestion[], validationErrors: string[], retries: number }>`.
- **Failure Behavior:** Automatically retries 1 time with temperature 0.2 if the model returns malformed JSON or invalid question structures. Throws if second attempt fails.

### 3. `validateGeneratedGroup`
- **File:** [src/lib/test-paper-generation.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/lib/test-paper-generation.ts#L185-L212)
- **Purpose:** Deterministically audits an LLM-generated question batch against schema and grounding rules.
- **Called by:** `generatePaper` ([generation-actions.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/app/generate/generation-actions.ts)).
- **Inputs:** `questions`, `expected: number`, `group: GroupAllocation`, `assignedResourceId: string`, `chunks: readonly SourceChunk[]`, `alreadyGeneratedTexts: readonly string[]`.
- **Output:** `string[]` (array of error strings, empty if passed).
- **Validation Rules:** Chunk citation exists; resource ownership of chunk matches; MCQ has 4 options and matching answer; fill-in has `____`; True/False has True/False answer; near-duplicate Jaccard similarity $< 0.8$.

### 4. `parseTestPaperText`
- **File:** [src/lib/test-paper-extraction.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/lib/test-paper-extraction.ts#L392-L471)
- **Purpose:** Deterministically segments raw document text into paper header fields, sections, question groups, choice rules, and marks.
- **Called by:** `extractTestPaper` ([generate/actions.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/app/generate/actions.ts)).
- **Inputs:** `rawText: string`, `filename: string`, `pageCount: number`.
- **Output:** `ExtractedTemplateDraft`.

### 5. `createGeneratedPaperDocx`
- **File:** [src/lib/test-paper-docx.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/lib/test-paper-docx.ts#L28-L56)
- **Purpose:** Packages a generated paper into a native OpenXML `.docx` binary buffer.
- **Called by:** `exportGeneratedPaperDocx` ([generation-actions.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/app/generate/generation-actions.ts)).
- **Inputs:** `paper: { title, sections, totalMarks }`, `includeAnswers: boolean`.
- **Output:** `{ fileName: string, buffer: Buffer }`.

---

## 19. Environment Variables Reference

| Variable Name | Server or Client | Required? | Purpose & Format Example |
| :--- | :--- | :--- | :--- |
| `NEXTAUTH_URL` | Server-only | Required | Canonical URL of the application. Example: `http://localhost:3000` or `https://app.classprep.com`. |
| `NEXTAUTH_SECRET` | Server-only | Required | Cryptographic secret for signing NextAuth JWT session cookies. Base64 string generated via `openssl rand -base64 32`. |
| `GOOGLE_CLIENT_ID` | Server-only | Required | OAuth 2.0 Client ID from Google Cloud Console. Example: `123456789-abcdef.apps.googleusercontent.com`. |
| `GOOGLE_CLIENT_SECRET`| Server-only | Required | OAuth 2.0 Client Secret from Google Cloud Console. |
| `DATABASE_URL` | Server-only | Required | PostgreSQL connection URL. Supabase transaction-mode pooler string (`port 6543`) with `?pgbouncer=true`. |
| `DIRECT_URL` | Server-only | Required | Direct session-mode PostgreSQL URL (`port 5432`). Required by Prisma for migrations and DDL statements. |
| `NEXT_PUBLIC_SUPABASE_URL` | Client-safe | Required | Public HTTPS URL for your Supabase project. Example: `https://xyzcompany.supabase.co`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | Required | Supabase service-role secret key. Bypasses Row Level Security to manage private storage bucket objects. **Never expose to client.** |
| `SUPABASE_STORAGE_BUCKET` | Server-only | Required | Name of the private Supabase Storage bucket. Example: `classprep-documents`. |
| `GROQ_API_KEY` | Server-only | Required* | API key for Groq API. Required for question generation (`llama-3.3-70b-versatile`). |
| `GROQ_MODEL` | Server-only | Optional | Model identifier for question generation on Groq. Defaults to `"llama-3.3-70b-versatile"`. |
| `OPENAI_API_KEY` | Server-only | Optional* | API key for OpenAI Chat Completions API. Optional pass for structured extraction enrichment. |
| `TEST_PAPER_EXTRACTION_MODEL`| Server-only | Optional | Model identifier for extraction second pass. Defaults to `"gpt-4o-mini"`. |

---

## 20. External Services & Integrations

### 1. Google OAuth 2.0
- **Purpose:** Single sign-on authentication for teachers.
- **Code Location:** Configured in [src/auth.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/auth.ts).
- **Credentials:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- **Failure Mode:** If unconfigured or rejected, user is redirected to `/login?error=OAuthCallback`.

### 2. Supabase PostgreSQL
- **Purpose:** Primary relational database storing all app models.
- **Code Location:** Initialized via Prisma client in [src/lib/prisma.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/lib/prisma.ts).
- **Credentials:** `DATABASE_URL` (pooler), `DIRECT_URL` (direct port 5432).
- **Connection Architecture:** Uses connection pooler for runtime queries and direct connection for migrations.

### 3. Supabase Storage
- **Purpose:** Encrypted object storage for uploaded teaching materials (PDF, DOCX).
- **Code Location:** [src/lib/supabase.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/lib/supabase.ts), [src/app/library/actions.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/app/library/actions.ts).
- **Credentials:** `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`.
- **Security Check:** Strictly asserts private bucket status on every file operation; serves files via 5-minute signed URLs.

### 4. Groq API
- **Purpose:** LLM question generation engine.
- **Code Location:** [src/lib/question-generation.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/lib/question-generation.ts).
- **Credentials:** `GROQ_API_KEY`.
- **Model:** `llama-3.3-70b-versatile` (configurable via `GROQ_MODEL` or `TEST_GENERATION_MODEL`).
- **Failure Mode:** If missing during paper generation, raises an error instructing the server administrator to configure `GROQ_API_KEY`.

### 5. OpenAI API
- **Purpose:** Optional structured extraction validation pass.
- **Code Location:** [src/lib/test-paper-llm.ts](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/src/lib/test-paper-llm.ts).
- **Credentials:** `OPENAI_API_KEY`.
- **Model:** `gpt-4o-mini` (configurable via `TEST_PAPER_EXTRACTION_MODEL`).
- **Failure Mode:** If missing during extraction, system gracefully falls back to deterministic extraction.

---

## 21. Security & Authorization

### Defense in Depth Architecture
1. **Route Protection (`src/proxy.ts`):** Edge-compatible middleware blocks unauthorized requests to dashboard, library, generator, and paper routes.
2. **Server Action Authorization:** Every action executes `requireUser()` / `requireOwner()`. Never trusts client-supplied user identifiers.
3. **Database Scoping:** All Prisma mutations and queries filter by `userId: session.user.id`.
4. **Private Storage:** Storage bucket enforces `public: false`. Files are inaccessible via direct URL. Downloads require short-lived (5-minute) signed tokens.
5. **Upload Validation:**
   - Maximum size: 20 MB.
   - File extension matching expected whitelist (`.pdf`, `.docx`).
   - Magic bytes verification (`%PDF-` for PDF, `0x50 0x4B` for DOCX) prevents malicious executable masquerading.
   - Sanitized storage keys prevent path traversal.
6. **LLM Prompt Isolation:** Source chunks and labels are sent as structured JSON payloads rather than unescaped prompt string concatenations, minimizing prompt injection risks.
7. **Secrets Isolation:** No server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`) use `NEXT_PUBLIC_` prefixes.

---

## 22. Error Handling & Failure Modes

| Subsystem | Normal Success | Failure Event | System Response & User Feedback | Database Side Effects |
| :--- | :--- | :--- | :--- | :--- |
| **Authentication** | Redirect to `/dashboard` with session JWT. | Google OAuth access denied or credentials invalid. | Redirects to `/login` with error banner. | None. |
| **Document Upload** | Document row created; file in Supabase Storage. | Database insert fails after storage upload. | Catches DB error, deletes uploaded file from storage rollback, displays failure. | No orphan database rows or storage files. |
| **File Extraction** | Normalized text and draft sections populated. | PDF is image-only scan; no text layer. | Displays warning: `"Text could not be reliably extracted... OCR is not currently supported."` | None; draft remains editable manually. |
| **LLM Extraction** | Section structure refined with model metadata. | OpenAI API timeout or invalid `sourceQuote`. | Discards model suggestion; seamlessly falls back to deterministic parsing. | None. |
| **Feasibility Check** | Allocation preview displays balanced marks. | Targets sum does not match template total. | "Generate" button disabled; displays clear arithmetic explanation of deficit. | None. |
| **Paper Generation** | Complete paper generated with status `"ready"`. | Generated batch fails validation after 1 retry. | Halts generation; displays exact validation error (e.g., MCQ options count, missing chunk). | `GeneratedPaper` marked `status: "failed"`. Prior batches preserved. |
| **Question Edit** | Paper updated; status set to `"review"`. | MCQ answer does not match any of the 4 options. | Throws validation error; prompts teacher to select matching option. | None; invalid edit is rejected. |
| **DOCX Export** | `.docx` binary blob downloaded. | Invalid paper structure or missing questions. | Throws error; workspace displays notification. | None. |

---

## 23. Test Suite & Verification

The automated test suite is located in [tests/template-calculations.test.mjs](file:///c:/Users/Sathvik%20S%20Nayak/OneDrive/Desktop/classprep/tests/template-calculations.test.mjs). It uses Node's built-in test runner:

```bash
npm run test:templates
# Command: node --experimental-strip-types --test tests/template-calculations.test.mjs
```

### Verified Test Cases (21 Passing Tests)
1. **Built-in Template Arithmetic:** Validates 25, 40, and 50 mark starter templates; verifies total questions, total marks, and section sums match advertised specs.
2. **Internal Choice Calculations:** Verifies scorable marks calculate from `attempt`, not `count` (e.g., 5 offered, 3 attempt @ 2 marks = 6 marks).
3. **Decimal Marks Calculations:** Tests combinations like `10 x 0.5`, `5 x 1.5`, `3 x 2.5` to verify exact calculations without IEEE 754 floating-point display artifacts.
4. **Template Generation Gating:** Validates acceptance of decimal marks and rejection of missing/invalid counts or marks.
5. **Resource Allocation Engine:** Tests slot distribution, resource restrictions, and detection of unreachable decimal targets.
6. **Chunking & Grounding Validation:** Tests chunk splitting with overlaps, keyword retrieval, and rejection of ungrounded questions.
7. **LLM Retry Mechanism:** Mocks an initial malformed JSON response followed by valid JSON; confirms retry count is 1.
8. **DOCX Generation & Extraction:** Generates a real DOCX in-memory, parses it with `mammoth`, and verifies text, marks, and answer key.
9. **Ambiguous Attempt Counts:** Verifies that uncertain attempt counts evaluate marks to `null`, never guessing zero.
10. **Heading & Choice Extraction:** Verifies extraction of school, class, subject, exam name, duration, maximum marks, and internal choice.
11. **Scanned PDF Handling:** Tests null-byte stream; verifies `hasText = false` and warning flags.
12. **Multi-Group Section Extraction:** Verifies extraction of multiple question types within a single section.
13. **Real PDF/DOCX Parsing Roundtrip:** Generates real PDF byte stream in-memory and parses with `pdf-parse`.
14. **Table-Driven Segmentation:** 12 parameterized scenarios testing Roman numerals, alphabetic sections, restart vs continuous numbering.
15. **Null vs Zero Semantics:** Ensures missing fields produce `null` rather than `0`.
16. **Layout Normalization:** Verifies stripping of repeated header/footer margins and continuation line rejoining.
17. **Blank PDF Rejection:** Confirms image-only / blank PDF triggers unreadable warning.
18. **Selectable PDF Roundtrip:** Full detection of header, sections, groups, choices, and marks from synthesized PDF.
19. **Rich DOCX Extraction:** Tests Word document with heading styles, paragraphs, tables, and mixed question groups.
20. **DOCX Ambiguity Handling:** Preserves group marks and numbered items without guessing.
21. **LLM Extraction Fallback:** Mocks LLM disagreement and invalid source quotes; confirms deterministic fallback.

### What Is NOT Tested via Automated Tests
- Live Google OAuth round-trip (requires interactive browser and Google credentials).
- Live Supabase Storage bucket uploads (unit tests mock buffers or test local logic).
- Live OpenAI API network calls (tests mock the `fetcher` argument).
- End-to-end browser user flows with Playwright/Cypress.

---

## 24. Current Verified State

| Subsystem / Component | Status | Verification Notes |
| :--- | :---: | :--- |
| **TypeScript Compilation** | ✅ Verified | `npx tsc --noEmit` exits with code 0 (zero errors). |
| **ESLint** | ✅ Verified | `npm run lint` exits with code 0 (clean). |
| **Production Build** | ✅ Verified | `npx next build` compiles successfully, all routes generated, exit code 0. |
| **Automated Test Suite** | ✅ Verified | 21 / 21 subtests passing via `npm run test:templates`. |
| **Prisma Schema** | ✅ Verified | Schema syntax and relations validated. |
| **Database Migrations (1-5)** | ✅ Verified | All 5 migrations applied to live Supabase PostgreSQL database via `npx prisma migrate deploy`. |
| **Supabase PostgreSQL Connectivity** | ✅ Verified | Prisma CLI successfully connects to `aws-0-ap-south-1.pooler.supabase.com`. |
| **Authentication Core** | ⚠️ Partially Verified | Implementation complete; live OAuth flow requires active Google Cloud client secret. |
| **Library Folder & File CRUD** | ✅ Verified | Fully implemented with storage rollback on failure. |
| **Supabase Storage Operations** | ✅ Verified | Private bucket assertion, signed URL generation, and path construction verified. |
| **Deterministic Extraction** | ✅ Verified | Tested against real in-memory PDF and DOCX streams. |
| **LLM Structured Extraction** | ✅ Verified | Tested with mock fetcher; conflict resolution verified. |
| **OCR for Scanned Documents** | 🚧 Not Implemented | Scanned PDFs detected and rejected with user warning. |
| **Test Template Calculations** | ✅ Verified | 6-decimal scaling, internal choice, and built-in templates verified. |
| **Resource × Group Allocation** | ✅ Verified | Feasibility engine, matrix filtering, and warnings verified. |
| **LLM Question Generation** | ✅ Verified | Structured outputs with schema and single retry verified. |
| **Question Validation Engine** | ✅ Verified | All 8 deterministic validation rules verified. |
| **Paper Persistence & History** | ✅ Verified | `GeneratedPaper` table live on Supabase. CRUD, status transitions, and paper loading verified. |
| **DOCX Export** | ✅ Verified | In-memory ZIP/OpenXML creation and `mammoth` re-extraction verified. |
| **Print-to-PDF** | ✅ Verified | CSS `@media print` rules implemented and verified. |
| **Settings Subsystem** | 🚧 Not Implemented | Placeholder UI only. |

---

## 25. Known Limitations & Technical Debt

1. **Scanned PDF OCR is Unavailable:**
   Extraction relies on selectable text streams in PDFs. Image-only PDFs (scanned worksheets) cannot be extracted. Teachers must create templates manually or transcribe text.
2. **External LLM Key Dependency:**
   Question generation and structured extraction enrichment require an external OpenAI API key (`OPENAI_API_KEY`). If omitted, question generation is disabled.
3. **PDF Export Relies on Client Print Engine:**
   ClassPrep does not generate server-side PDF binaries. PDF export is performed by invoking the browser's native print engine (`window.print()`) with print CSS styles.
4. **Settings Page is a Static Placeholder:**
   The `/settings` route displays static visual cards. User preferences (default grading, standard subjects) are not yet persisted to the database.
5. **Next.js Route Protection File:**
   The authentication middleware is located in `src/proxy.ts` rather than the traditional `src/middleware.ts`. While functional with Next.js 16 conventions, future developers should note this naming.

---

## 26. Next Steps for Development

### Blockers (Must Do First)
1. **Verify Live Google OAuth & Storage:**
   Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `OPENAI_API_KEY` in production environment variables and verify a live test generation run end-to-end.

### Optional Improvements
1. **Server-Side PDF Binary Export:**
   Add server-side PDF generation (e.g., using `@react-pdf/renderer` or Puppeteer) so teachers can download a `.pdf` file directly without relying on browser print dialogs.
2. **OCR Integration for Scanned Worksheets:**
   Integrate a cloud vision API (e.g., Google Cloud Vision or AWS Textract) to OCR scanned PDFs and photographs of physical test papers.
3. **Settings Persistence:**
   Add a `UserPreference` Prisma model to persist teacher defaults (default duration, default school name, grading scale).
4. **End-to-End Playwright Tests:**
   Add browser automation tests covering login, folder creation, template saving, and export download flows.

---

## 27. Project Change History

- **2026-09-30 — Initial Next.js & Supabase Setup:**
  - Initialized Next.js App Router project with Tailwind CSS and TypeScript.
  - Configured PostgreSQL datasource on Supabase.
  - Implemented Google OAuth with NextAuth.js v4 and `@auth/prisma-adapter`.
  - Added initial schema migration `20260930140842_init` (`User`, `Account`, `Session`, `VerificationToken`, `Folder`, `Document`).
- **2026-09-30 — Private Storage & Path Refactor:**
  - Migration `20260930145547_document_storage_path` replaced `Document.fileUrl` with private `storagePath`.
  - Implemented Supabase Storage private bucket assertions and 5-minute signed download URLs.
  - Added file validation (MIME check, magic byte validation for PDF/DOCX, 20 MB size limit).
- **2026-10-01 — Library State & Navigation Polish:**
  - Implemented hierarchical folder navigation with popstate URL synchronization (`/library?folder=<id>`).
  - Added recursive folder tree deletion with batch storage file cleanup.
- **2026-10-01 — Test Template Architecture:**
  - Added migration `20261001000000_test_templates` and expanded with `20261001120000_expand_test_templates`.
  - Replaced flat question counts with rich hierarchical JSON sections (`SectionDraft[]`).
  - Built starter templates (25, 40, 50 marks) and cloning actions.
  - Built deterministic PDF/DOCX extraction engine and optional OpenAI structured extraction pass.
- **2026-10-02 — Test Paper Generation, Decimal Marks & Paper Persistence:**
  - Implemented floating-point safe arithmetic with 6-decimal scaling (`src/lib/mark-calculations.js`).
  - Created migration `20261002120000_generated_papers_and_decimal_marks` adding `GeneratedPaper` model.
  - Built Resource × Group allocation engine (`allocateQuestionSlots`) with feasibility and target constraints.
  - Implemented grounded question generation using Groq API (`llama-3.3-70b-versatile`) with 1-retry engine.
  - Implemented deterministic question validation (MCQ options, blanks, True/False, 2-gram near-duplicate detection).
  - Added inline question editing, atomic single-question regeneration, DOCX export via OpenXML/zlib, and print-to-PDF.
  - Built 21-test automated suite (`tests/template-calculations.test.mjs`).
  - Applied migration `20261002120000_generated_papers_and_decimal_marks` to live Supabase database.
  - Regenerated Prisma Client (v6.19.3). Production build verified (`npx next build` exit code 0). All 21 tests passing.

---

## 28. Documentation Maintenance Rule

**Documentation Maintenance**

This document describes the actual implementation state of ClassPrep.

Whenever a significant architectural or functional change is made, this document must be updated in the same change.

Examples:
- new database model
- changed authentication
- changed storage architecture
- new API / server action
- changed extraction behavior
- new generation provider
- changed LLM model
- changed allocation algorithm
- new generation state
- new export format
- changed environment variable
- security change

Do not allow the documentation to describe behavior that no longer exists.
