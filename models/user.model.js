import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { Roles } from "../constants/role.constant.js";

// Define schema for timeslot
const timeslotSchema = mongoose.Schema({
  day: {
    type: String,
    required: true,
  },
  startTime: {
    type: String,
    required: true,
  },
  endTime: {
    type: String,
    required: true,
  },
});

// Define Schema for User
const userSchema = mongoose.Schema(
  {
    firstName: {
      type: String,
    },
    lastName: {
      type: String,
    },
    displayName: {
      type: String,
    },
    profilePhoto: {
      type: String,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      default: Roles.SIMPLE_USER,
    },
    birthdate: {
      type: Date,
    },
    height: {
      type: String,
    },
    position: {
      type: String,
    },
    radius: {
      type: Number,
    },
    address: {
      type: String,
    },
    isCompletedProfile: {
      type: Boolean,
      default: false,
    },
    timeSlots: [timeslotSchema],
  },
  {
    timestamps: true,
  }
);

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

export const User = mongoose.model("User", userSchema);
