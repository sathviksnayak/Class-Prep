import mongoose, { Schema, model, models } from "mongoose";

const documentSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    type: {
      type: String,
      required: true,
    },

    size: {
      type: Number,
      required: true,
    },

    folderId: {
      type: Schema.Types.ObjectId,
      ref: "Folder",
      default: null,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    fileUrl: {
      type: String,
      default: null,
    },

    extractedText: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);
export const Document =
  models.Document || model("Document", documentSchema);