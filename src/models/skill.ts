import mongoose from "mongoose";

export interface ISkill {
  name: string;
  description: string;
  image: string;
  position?: number;
}

const skillSchema = new mongoose.Schema<ISkill>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    image: {
      type: String,
      required: true,
    },
    position: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

skillSchema.set("toJSON", { virtuals: true });
skillSchema.set("toObject", { virtuals: true });

const Skill = mongoose.model<ISkill>("Skill", skillSchema);

export default Skill;
