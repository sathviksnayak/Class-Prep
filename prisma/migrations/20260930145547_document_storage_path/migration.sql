/*
  Warnings:

  - You are about to drop the column `fileUrl` on the `Document` table. All the data in the column will be lost.
  - Added the required column `storagePath` to the `Document` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Document" DROP COLUMN "fileUrl",
ADD COLUMN     "storagePath" TEXT NOT NULL;
