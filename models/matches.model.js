import mongoose from "mongoose";
import { MatchStatus } from "../constants/match-status.constant.js";

const matcheSchema = new mongoose.Schema(
  {
    community_center: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CommunityCenter",
      required: true,
    },
    name: {
      type: String,
      default: null,
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
    team_A: {
      name: {
        type: String,
      },
      players: [
        {
          user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
          },
          bookingId: {
            type: String
          },
          gersyNumber: {
            type: Number,
            default: 0,
          }
        },
      ],
      matchScore: {
        type: Number,
        default: 0,
      },
      isWinner: {
        type: Boolean,
        default: false
      }
    },
    team_B: {
      name: {
        type: String,
      },
      players: [
        {
          user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
          },
          bookingId: {
            type: String
          },
          gersyNumber: {
            type: Number,
            default: 0,
          }
        },
      ],
      matchScore: {
        type: Number,
        default: 0,
      },
      isWinner: {
        type: Boolean,
        default: false
      }
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Create the model from the schema and export it
const Matches = mongoose.model("Matches", matcheSchema);
export { Matches };
