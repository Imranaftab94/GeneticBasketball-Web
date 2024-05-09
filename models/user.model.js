import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { Roles } from "../constants/role.constant.js";



// Define Schema for User
const userSchema = mongoose.Schema(
  {
    firstName: {
      type: String,
      default: null,
    },
    lastName: {
      type: String,
      default: null,
    },
    displayName: {
      type: String,
      default: null,
    },
    profilePhoto: {
      type: String,
      default: null,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
    },
    role: {
      type: String,
      default: Roles.SIMPLE_USER,
    },
    socialPlatform: {
      type: String,
    },
    socialId: {
      type: String,
    },
    birthdate: {
      type: Date,
      default: null,
    },
    height: {
      type: String,
      default: null,
    },
    position: {
      type: String,
      default: null,
    },
    radius: {
      type: Number,
    },
    address: {
      type: String,
      default: null,
    },
    isCompletedProfile: {
      type: Boolean,
      default: false,
    },
    location: {
      latitude: {
        type: Number,
      },
      longitude: {
        type: Number,
      },
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    otpCode: {
      type: String,
    },
    fcmTokens: [String],
    coins:{
      type: Number,
      default: 0,
    }
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
