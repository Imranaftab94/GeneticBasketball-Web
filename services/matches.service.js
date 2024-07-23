import mongoose from "mongoose";
import { MatchStatus } from "../constants/match-status.constant.js";
import { Matches } from "../models/matches.model.js";
import { PlayerMatchStats } from "../models/player_stats.model.js";
import { TournamentMatches } from "../models/tournament_match.model.js";
import { TournamentPlayerMatchStat } from "../models/tournament_player_stats.model.js";
import { Team } from "../models/tournament_team.model.js";

async function updateMatchWinner(matchId) {
	try {
		// Find the match
		const match = await Matches.findById(matchId);
		if (!match) {
			throw new Error("Match not found");
		}

		// Get player stats for the match
		const playerStats = await PlayerMatchStats.find({ match: matchId });
		if (!playerStats.length === 0) {
			throw new Error("Match not found");
		}

		// Calculate total points for team A and team B
		const teamAPoints = playerStats
			.filter((stat) =>
				match.team_A.players.some((player) => player.user.equals(stat.player))
			)
			.reduce((total, stat) => total + stat.pointsScored, 0);

		const teamBPoints = playerStats
			.filter((stat) =>
				match.team_B.players.some((player) => player.user.equals(stat.player))
			)
			.reduce((total, stat) => total + stat.pointsScored, 0);

		// Determine the winner
		if (teamAPoints > teamBPoints) {
			match.team_A.isWinner = true;
			match.team_B.isWinner = false;
		} else if (teamBPoints > teamAPoints) {
			match.team_A.isWinner = false;
			match.team_B.isWinner = true;
		}

		// Update match object with the winner and scores
		match.status = MatchStatus.FINISHED;
		match.team_A.matchScore = teamAPoints;
		match.team_B.matchScore = teamBPoints;

		// Save the updated match
		const updatedMatch = await match.save();

		return updatedMatch;
	} catch (error) {
		console.error("Failed to update match winner:", error.message);
		throw error;
	}
}

//Update Tournament Match Winner
async function updateTournamentMatchWinner(matchId) {
	try {
		// Find the match
		const match = await TournamentMatches.findById(matchId)
			.populate({
				path: "team_A",
				select: "_id name players matchScore isWinner",
				populate: {
					path: "players.user",
					select: "firstName lastName email profilePhoto coins", // Select player details from User model
				},
			})
			.populate({
				path: "team_B",
				select: "_id name players matchScore isWinner", // Only select these fields
				populate: {
					path: "players.user",
					select: "firstName lastName email profilePhoto position", // Select player details from User model
				},
			})
			.exec();
		if (!match) {
			throw new Error("Match not found");
		}

		// Get player stats for the match
		const playerStats = await TournamentPlayerMatchStat.find({
			match: matchId,
		});
		if (!playerStats.length === 0) {
			throw new Error("Match not found");
		}

		// Calculate total points for team A and team B
		const teamAPoints = playerStats
			.filter((stat) =>
				match.team_A.players.some((player) => player.user.equals(stat.player))
			)
			.reduce((total, stat) => total + stat.pointsScored, 0);

		const teamBPoints = playerStats
			.filter((stat) =>
				match.team_B.players.some((player) => player.user.equals(stat.player))
			)
			.reduce((total, stat) => total + stat.pointsScored, 0);

		// Determine the winner
		if (teamAPoints > teamBPoints) {
			match.team_A.isWinner = true;
			match.team_B.isWinner = false;
		} else if (teamBPoints > teamAPoints) {
			match.team_A.isWinner = false;
			match.team_B.isWinner = true;
		}

		await Team.findByIdAndUpdate(match.team_A._id, {
			matchScore: teamAPoints,
			isWinner: match.team_A.isWinner,
		});

		await Team.findByIdAndUpdate(match.team_B._id, {
			matchScore: teamBPoints,
			isWinner: match.team_B.isWinner,
		});

		// Update match object with the winner and scores
		match.status = MatchStatus.FINISHED;
		match.team_A.matchScore = teamAPoints;
		match.team_B.matchScore = teamBPoints;

		// Save the updated match
		const updatedMatch = await match.save();
		const stats = await TournamentPlayerMatchStat.find({
			match: matchId,
		});

		// Organize stats by matchId and playerId
		const statsMap = stats.reduce((acc, stat) => {
			if (!acc[stat.match]) {
				acc[stat.match] = {};
			}
			acc[stat.match][stat.player] = stat;
			return acc;
		}, {});
		match.team_A.players.forEach((player) => {
			player.stats = statsMap[match._id]?.[player.user._id] || {};
		});
		match.team_B.players.forEach((player) => {
			player.stats = statsMap[match._id]?.[player.user._id] || {};
		});

		return updatedMatch;
	} catch (error) {
		console.error("Failed to update match winner:", error.message);
		throw error;
	}
}

/**
 * Update highlights for a match (tournament or simple).
 *
 * @param {string} matchId - The ID of the match to update.
 * @param {Object} highlights - The highlights object containing name, awsUrl, and thumbnailImage.
 * @returns {Promise<Object>} - The updated match object or an error message.
 */
const updateHighlights = async (matchId, highlights) => {
	try {
		// Check if the match exists in the tournament matches collection
		let match = await TournamentMatches.findById(matchId);
		if (match) {
			// Update highlights for the tournament match
			match.highlights = highlights;
			await match.save();
			return { message: "Highlights updated for tournament match", match };
		}

		// Check if the match exists in the simple matches collection
		match = await Matches.findById(matchId);
		if (match) {
			// Update highlights for the simple match
			match.highlights = highlights;
			await match.save();
			return { message: "Highlights updated for simple match", match };
		}

		// If match not found in either collection
		return { message: "Match not found" };
	} catch (error) {
		console.error(error);
		return { message: "An error occurred while updating highlights", error };
	}
};

const getMatchStatisticsSimple = async (matchIds, playerId) => {
	try {
		// Query to find player match stats for all provided matchIds
		const results = await PlayerMatchStats.find({
			match: { $in: matchIds },
			player: new mongoose.Types.ObjectId(playerId),
		}); // Populate the 'player' field with user details

		// Format the results as an array of player match stats objects
		const formattedResults = results.map((result) => ({
			player: result.player,
			match: result.match,
			minutesPlayed: result.minutesPlayed,
			fieldGoalsMade: result.fieldGoalsMade,
			fieldGoalsAttempted: result.fieldGoalsAttempted,
			threePointersMade: result.threePointersMade,
			threePointersAttempted: result.threePointersAttempted,
			freeThrowsMade: result.freeThrowsMade,
			freeThrowsAttempted: result.freeThrowsAttempted,
			offensiveRebounds: result.offensiveRebounds,
			defensiveRebounds: result.defensiveRebounds,
			assists: result.assists,
			steals: result.steals,
			blocks: result.blocks,
			turnovers: result.turnovers,
			pointsScored: result.pointsScored,
		}));

		return formattedResults;
	} catch (error) {
		console.error("Error fetching match statistics:", error);
		throw new Error("Unable to fetch match statistics");
	}
};

const getMatchStatisticsTournament1 = async (matchIds, playerId) => {
	try {
		// Query to find player match stats for all provided matchIds
		const results = await TournamentPlayerMatchStat.find({
			match: { $in: matchIds },
			player: playerId,
		}); // Populate the 'player' field with user details

		// Format the results as an array of player match stats objects
		const formattedResults = results.map((result) => ({
			player: result.player,
			match: result.match,
			minutesPlayed: result.minutesPlayed,
			fieldGoalsMade: result.fieldGoalsMade,
			fieldGoalsAttempted: result.fieldGoalsAttempted,
			threePointersMade: result.threePointersMade,
			threePointersAttempted: result.threePointersAttempted,
			freeThrowsMade: result.freeThrowsMade,
			freeThrowsAttempted: result.freeThrowsAttempted,
			offensiveRebounds: result.offensiveRebounds,
			defensiveRebounds: result.defensiveRebounds,
			assists: result.assists,
			steals: result.steals,
			blocks: result.blocks,
			turnovers: result.turnovers,
			pointsScored: result.pointsScored,
		}));

		return formattedResults;
	} catch (error) {
		console.error("Error fetching match statistics:", error);
		throw new Error("Unable to fetch match statistics");
	}
};

function calculateStatsSumAsArray(statsArray) {
	let totals = {
		minutesPlayed: 0,
		fieldGoalsMade: 0,
		fieldGoalsAttempted: 0,
		threePointersMade: 0,
		threePointersAttempted: 0,
		freeThrowsMade: 0,
		freeThrowsAttempted: 0,
		offensiveRebounds: 0,
		defensiveRebounds: 0,
		assists: 0,
		steals: 0,
		blocks: 0,
		turnovers: 0,
		pointsScored: 0,
	};

	// Iterate through each object in the stats array
	statsArray.forEach((stats) => {
		for (let key in stats) {
			if (stats.hasOwnProperty(key) && key !== "player" && key !== "match") {
				totals[key] += stats[key];
			}
		}
	});

	return totals;
}

export {
	updateMatchWinner,
	updateTournamentMatchWinner,
	updateHighlights,
	getMatchStatisticsSimple,
	getMatchStatisticsTournament1,
	calculateStatsSumAsArray,
};
