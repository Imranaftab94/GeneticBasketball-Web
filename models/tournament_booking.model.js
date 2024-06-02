// models/TournamentBooking.js
import mongoose from "mongoose";
import { PLAYER_TOURNAMENT_BOOKING_STATUS } from "../constants/match-status.constant.js";

const TournamentBookingSchema = new mongoose.Schema(
  {
    player: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    tournament: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(PLAYER_TOURNAMENT_BOOKING_STATUS),
      default: PLAYER_TOURNAMENT_BOOKING_STATUS.BOOKED,
    },
  },
  {
    timestamps: true,
  }
);

const TournamentBooking = mongoose.model(
  "Tournament_Booking",
  TournamentBookingSchema
);
export { TournamentBooking };
