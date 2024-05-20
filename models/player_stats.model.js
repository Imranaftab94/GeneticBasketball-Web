import mongoose from "mongoose";
const Schema = mongoose.Schema;

// Player game stats schema
const playerMatchStatsSchema = new Schema(
  {
    player: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    match: {
      type: Schema.Types.ObjectId,
      ref: "Matches",
    },
    minutesPlayed: Number,
    fieldGoalsMade: Number,
    fieldGoalsAttempted: Number,
    threePointersMade: Number,
    threePointersAttempted: Number,
    freeThrowsMade: Number,
    freeThrowsAttempted: Number,
    offensiveRebounds: Number,
    defensiveRebounds: Number,
    assists: Number,
    steals: Number,
    blocks: Number,
    turnovers: Number,
    pointsScored: Number,
  },
  {
    timestamps: true,
  }
);

const PlayerMatchStats = mongoose.model(
  "PlayerMatchStat",
  playerMatchStatsSchema
);
export { PlayerMatchStats };
