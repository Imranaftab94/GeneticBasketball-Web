import mongoose from "mongoose";
import { MatchStatus } from "../constants/match-status.constant.js";

const matcheSchema = new mongoose.Schema(
  {
    community_center: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CommunityCenter",
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
    day: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      default: MatchStatus.UPCOMING,
    },
    match_date: {
      type: Date,
      required: true,
    },
    team_A: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        player_score: {
          type: Number,
          default: null,
        },
      },
    ],
    team_B: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        player_score: {
          type: Number,
          default: null,
        },
      },
    ],
    match_score: {
      team_A: {
        type: Number,
        default: null,
      },
      team_B: {
        type: Number,
        default: null,
      },
      winner: {
        type: String,
        default: null,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Create the model from the schema and export it
const Matches = mongoose.model("Matches", matcheSchema);
export { Matches };
