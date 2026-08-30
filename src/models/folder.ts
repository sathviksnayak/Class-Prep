import mongoose, { Schema, model, models } from "mongoose";




const folderSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    parentId: {
      type: Schema.Types.ObjectId,
      ref: "Folder",
      default: null,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Folder =
  models.Folder || model("Folder", folderSchema);