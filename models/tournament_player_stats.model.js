import mongoose from "mongoose";
const Schema = mongoose.Schema;

// Player game stats schema
const playerMatchStatsSchema = new Schema(
	{
		player: {
			type: Schema.Types.ObjectId,
			ref: "User",
		},
		tournament: { type: mongoose.Schema.Types.ObjectId, ref: "Tournament" },
		match: {
			type: Schema.Types.ObjectId,
			ref: "Tournament_Match",
		},
		fieldGoalsMade: Number,
		fieldGoalsAttempted: Number,
		threePointersMade: Number,
		fieldGoalsPercentage: Number,
		threePointersPercentage: Number,
		threePointersAttempted: Number,
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

const TournamentPlayerMatchStat = mongoose.model(
	"Tournament_PlayerMatch_Stat",
	playerMatchStatsSchema
);
export { TournamentPlayerMatchStat };
