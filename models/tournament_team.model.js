// models/Team.js
import mongoose from "mongoose";

const TeamSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    tournament: { type: mongoose.Schema.Types.ObjectId, ref: "Tournament" },
    players: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        bookingId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Tournament_Booking",
        },
        gersyNumber: {
          type: Number,
          default: 0,
        },
      },
    ],
    matchScore: {
      type: Number,
      default: 0,
    },
    isWinner: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const Team = mongoose.model("Tournament_Team", TeamSchema);
export { Team };
