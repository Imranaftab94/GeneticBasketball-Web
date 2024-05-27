import mongoose from "mongoose";
import { TOURNAMENT_STATUS } from "../constants/match-status.constant.js";

const TournamentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    community_center: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CommunityCenter",
      required: true,
    },
    _location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
      },
    },
    location: {
      latitude: {
        type: Number,
        default: null,
      },
      longitude: {
        type: Number,
        default: null,
      },
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    maxPlayers: { type: Number, required: true },
    ageGroup: { type: String, required: true },
    prize: { type: String, required: true },
    entryFee: { type: Number, required: true, default: 0 },
    status: {
      type: String,
      enum: Object.values(TOURNAMENT_STATUS),
      default: TOURNAMENT_STATUS.UPCOMING,
    },
    tournament_matches: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Tournament_Match" },
    ],
    tournament_bookings: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Tournament_Booking" },
    ],
    tournament_team: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Tournament_Team" },
    ],
  },
  {
    timestamps: true,
  }
);

const Tournament = mongoose.model("Tournament", TournamentSchema);
export { Tournament };
