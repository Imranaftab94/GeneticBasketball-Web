import asyncHandler from "express-async-handler";
import { User } from "../models/user.model.js";
import { statusCodes } from "../constants/statusCodes.constant.js";
import { errorResponse, successResponse } from "../helpers/response.helper.js";
import {
	TournamentPlayerMatchStatsSchema,
	createTournamentSchema,
	startTournamentValidationSchema,
	tournamentBookingValidationSchema,
	tournamentMatchSchemaValidator,
	updateTournamentSchema,
} from "../validators/tournament.validator.js";
import { CommunityCenter } from "../models/community.model.js";
import { Tournament } from "../models/tournament.model.js";
import { TournamentBooking } from "../models/tournament_booking.model.js";
import {
	MatchStatus,
	PLAYER_TOURNAMENT_BOOKING_STATUS,
	TOURNAMENT_STATUS,
} from "../constants/match-status.constant.js";
import {
	sendMatchStartPaymentInfo,
	updateTournamentBookingStatus,
} from "../services/event-loop-functions.service.js";
import mongoose from "mongoose";
import { Team } from "../models/tournament_team.model.js";
import { TournamentMatches } from "../models/tournament_match.model.js";
import { TournamentPlayerMatchStat } from "../models/tournament_player_stats.model.js";
import { updateMatchStatusSchema } from "../validators/match.validator.js";
import {
	calculatePlayerRanking,
	updateTournamentMatchWinner,
} from "../services/matches.service.js";

const createTournament = asyncHandler(async (req, res) => {
	const { error } = createTournamentSchema.validate(req.body);
	if (error) {
		return errorResponse(
			res,
			error.details[0].message,
			statusCodes.BAD_REQUEST
		);
	}

	try {
		const {
			name,
			community_center,
			location: { latitude, longitude },
			startDate,
			endDate,
			maxPlayers,
			ageGroup,
			prize,
			entryFee,
			status = TOURNAMENT_STATUS.UPCOMING, // Defaulting status in destructuring, redundant with Joi default
		} = req.body;

		// Check if the community center exists
		const communityCenterExists = await CommunityCenter.findById(
			community_center
		);
		if (!communityCenterExists) {
			return errorResponse(
				res,
				"Community center not found.",
				statusCodes.NOT_FOUND
			);
		}

		let coordinates = [req.body.location.longitude, req.body.location.latitude];
		let _location = {
			type: "Point",
			coordinates,
		};

		// Create a new tournament using destructured values
		const tournament = new Tournament({
			name,
			community_center,
			location: { latitude, longitude },
			_location,
			startDate,
			endDate,
			maxPlayers,
			ageGroup,
			prize,
			entryFee,
			status,
		});

		await tournament.save();

		let data = {
			message: "Tournament has been created scuccessfully!",
			tournament,
		};

		successResponse(res, data, statusCodes.CREATED);
	} catch (error) {
		return errorResponse(res, error.message, statusCodes.BAD_REQUEST);
	}
});

const listTournaments = asyncHandler(async (req, res) => {
	try {
		const tournaments = await Tournament.find({})
			.sort({ createdAt: -1 })
			.select("-_location")
			.populate({
				path: "community_center",
				select: "name image address", // Only select these fields
			});

		successResponse(res, tournaments, statusCodes.OK);
	} catch (err) {
		errorResponse(
			res,
			"An error occurred while fetching tournaments",
			statusCodes.INTERNAL_SERVER_ERROR
		);
	}
});

const addTournamentBooking = asyncHandler(async (req, res) => {
	// Validate the request body
	const { error } = tournamentBookingValidationSchema.validate(req.body);

	if (error) {
		errorResponse(res, error.details[0].message, statusCodes.BAD_REQUEST);
		return;
	}

	// Extract validated data
	const { player, tournament } = req.body;

	try {
		// Fetch the player and tournament from the database
		const foundPlayer = await User.findById(player);
		const foundTournament = await Tournament.findById(tournament);

		if (!foundPlayer || !foundTournament) {
			return errorResponse(
				res,
				"Player or tournament not found",
				statusCodes.NOT_FOUND
			);
		}

		// Check if the max players count has been reached
		const existingBookingsCount = await TournamentBooking.countDocuments({
			tournament,
		});
		if (existingBookingsCount >= foundTournament.maxPlayers) {
			return errorResponse(
				res,
				"Tournament has reached its maximum player limit",
				statusCodes.BAD_REQUEST
			);
		}

		// Check if the player already has a booking for the tournament
		const existingBooking = await TournamentBooking.findOne({
			player,
			tournament,
		});
		if (existingBooking) {
			return errorResponse(
				res,
				"Player already has a booking for this tournament",
				statusCodes.BAD_REQUEST
			);
		}

		// Check if the player has enough coins
		if (foundPlayer.coins < foundTournament.entryFee) {
			return errorResponse(
				res,
				"Insufficient coins to enter the tournament",
				statusCodes.BAD_REQUEST
			);
		}

		// Deduct the entry fee from the player's coins
		foundPlayer.coins -= foundTournament.entryFee;
		await foundPlayer.save();

		// Create a new tournament booking
		const tournamentBooking = new TournamentBooking({
			player,
			tournament,
		});

		// Save the tournament booking to the database
		await tournamentBooking.save();

		let data = {
			message: "Tournament booking created successfully.",
			tournamentBooking,
		};
		successResponse(res, data, statusCodes.CREATED);
	} catch (err) {
		errorResponse(
			res,
			"An error occurred while creating the tournament booking",
			statusCodes.INTERNAL_SERVER_ERROR
		);
	}
});

// start the tournament
// Controller to update tournament status and booking statuses
const updateTournamentAndBookings = asyncHandler(async (req, res) => {
	const { error } = startTournamentValidationSchema.validate(req.body);

	if (error) {
		errorResponse(res, error.details[0].message, statusCodes.BAD_REQUEST);
		return;
	}
	const { tournamentId, bookings } = req.body;

	try {
		// Update the tournament status
		const updatedTournament = await Tournament.findByIdAndUpdate(
			tournamentId,
			{ status: TOURNAMENT_STATUS.ONGOING },
			{ new: true }
		);

		if (!updatedTournament) {
			return errorResponse(res, "Tournament not found", statusCodes.NOT_FOUND);
		}

		setTimeout(() => {
			updateTournamentBookingStatus(
				bookings,
				tournamentId,
				updatedTournament.entryFee
			);
		}, 1000);

		let data = {
			message: "Tournament has been started successfully",
		};
		successResponse(res, data, statusCodes.OK);
	} catch (error) {
		errorResponse(
			res,
			"An error occurred while updating statuses",
			statusCodes.INTERNAL_SERVER_ERROR
		);
	}
});

//Create match with teams

const createMatchWithTeams = asyncHandler(async (req, res) => {
	const { error, value } = tournamentMatchSchemaValidator.validate(req.body);

	if (error) {
		errorResponse(res, error.details[0].message, statusCodes.BAD_REQUEST);
	}

	const findTournament = await Tournament.findById(req.body.tournament);

	console.log(findTournament);

	if (!findTournament) {
		return errorResponse(res, "Tournament not found", statusCodes.NOT_FOUND);
	}
	const communityCenter = await CommunityCenter.findById(
		req.body.community_center
	);
	if (!communityCenter) {
		return errorResponse(
			res,
			"Community center not found",
			statusCodes.NOT_FOUND
		);
	}

	const session = await mongoose.startSession();
	session.startTransaction();

	try {
		const {
			community_center,
			tournament,
			startTime,
			endTime,
			name,
			day,
			match_date,
			team_A,
			team_B,
		} = req.body;

		// Create Team A
		const teamAData = {
			name: team_A.name,
			tournament: tournament,
			players: team_A.players,
		};

		const createdTeamA = new Team(teamAData);
		await createdTeamA.save({ session });

		// Create Team B
		const teamBData = {
			name: team_B.name,
			tournament: tournament,
			players: team_B.players,
		};

		const createdTeamB = new Team(teamBData);
		await createdTeamB.save({ session });

		// Create Match
		const matchData = {
			community_center,
			tournament,
			name,
			startTime,
			endTime,
			day,
			match_date,
			team_A: createdTeamA._id,
			team_B: createdTeamB._id,
			created_by: req.user._id,
		};

		const createdMatch = new TournamentMatches(matchData);
		await createdMatch.save({ session });

		await session.commitTransaction();
		session.endSession();

		let data = {
			message: "Match and teams created successfully",
			match: createdMatch,
			teamA: createdTeamA,
			teamB: createdTeamB,
		};
		successResponse(res, data, statusCodes.CREATED);
	} catch (error) {
		await session.abortTransaction();
		session.endSession();
		console.log(error);
		errorResponse(
			res,
			"Internal server error.",
			statusCodes.INTERNAL_SERVER_ERROR
		);
	}
});

// Function to get matches by tournament ID including team details
const getMatchesByTournament = asyncHandler(async (req, res) => {
	try {
		const { tournamentId } = req.query;
		if (!tournamentId) {
			return errorResponse(
				res,
				"TournamentId is required",
				statusCodes.NOT_FOUND
			);
		}

		const findTournament = await Tournament.findById(tournamentId)
			.select(
				"-_location -tournament_matches -tournament_bookings -tournament_team"
			)
			.populate({
				path: "community_center",
				select: "name image address", // Only select these fields
			});

		const matches = await TournamentMatches.find({ tournament: tournamentId })
			.populate({
				path: "team_A",
				select: "_id name players matchScore isWinner",
				populate: {
					path: "players.user",
					select: "firstName lastName email profilePhoto coins ratings rating", // Select player details from User model
				},
			})
			.populate({
				path: "team_B",
				select: "_id name players matchScore isWinner", // Only select these fields
				populate: {
					path: "players.user",
					select:
						"firstName lastName email profilePhoto position ratings rating", // Select player details from User model
				},
			})
			.exec();

		const matchIds = matches.map((match) => match._id);
		const stats = await TournamentPlayerMatchStat.find({
			tournament: tournamentId,
			match: { $in: matchIds },
		});

		// Organize stats by matchId and playerId
		const statsMap = stats.reduce((acc, stat) => {
			if (!acc[stat.match]) {
				acc[stat.match] = {};
			}
			acc[stat.match][stat.player] = stat;
			return acc;
		}, {});

		// Add stats to the players in the matches
		matches.forEach((match) => {
			match.team_A.players.forEach((player) => {
				player.stats = statsMap[match._id]?.[player.user._id] || {};
			});
			match.team_B.players.forEach((player) => {
				player.stats = statsMap[match._id]?.[player.user._id] || {};
			});
		});

		const data = {
			tournament: findTournament,
			matches,
		};
		successResponse(res, data, statusCodes.OK);
	} catch (error) {
		console.log(error);
		errorResponse(
			res,
			"Internal server error.",
			statusCodes.INTERNAL_SERVER_ERROR
		);
	}
});

//Get tournaments under community
const listTournamentsUnderCommunity = asyncHandler(async (req, res) => {
	const { community_id } = req.query;
	if (!community_id) {
		errorResponse(
			res,
			"Communnity Center id is required",
			statusCodes.BAD_REQUEST
		);
	}
	try {
		const tournaments = await Tournament.find({
			community_center: community_id,
		})
			.sort({ createdAt: -1 })
			.select("-_location")
			.populate({
				path: "community_center",
				select: "name image address", // Only select these fields
			});

		successResponse(res, tournaments, statusCodes.OK);
	} catch (err) {
		errorResponse(res, err.message, statusCodes.INTERNAL_SERVER_ERROR);
	}
});

//Get bookings of the tournament
const getBookingsByTournament = asyncHandler(async (req, res) => {
	try {
		const { tournamentId, status } = req.query;
		if (!tournamentId || !status) {
			errorResponse(
				res,
				"Tournament id / status is required",
				statusCodes.BAD_REQUEST
			);
		}
		const findTournament = await Tournament.findById(tournamentId)
			.select(
				"-_location -tournament_matches -tournament_bookings -tournament_team"
			)
			.populate({
				path: "community_center",
				select: "name image address", // Only select these fields
			});
		const bookings = await TournamentBooking.find({
			tournament: tournamentId,
			status: status,
		}).populate({
			path: "player",
			select: "firstName lastName email profilePhoto position coins", // Select player details from User model
		});

		const data = {
			tournament: findTournament,
			bookings,
		};
		successResponse(res, data, statusCodes.OK);
	} catch (error) {
		errorResponse(res, err.message, statusCodes.INTERNAL_SERVER_ERROR);
	}
});

//Add or update tournament player stat
const addOrUpdateTournamentPlayerMatchStat = asyncHandler(async (req, res) => {
	try {
		// Validate request body using Joi or a similar library
		const { error } = TournamentPlayerMatchStatsSchema.validate(req.body);
		if (error) {
			return errorResponse(
				res,
				error.details[0].message,
				statusCodes.BAD_REQUEST
			);
		}

		// Check if player exists
		const playerExists = await User.exists({ _id: req.body.player });
		if (!playerExists) {
			return errorResponse(res, "Player not found.", statusCodes.NOT_FOUND);
		}

		// Check if match exists
		const matchExists = await TournamentMatches.exists({ _id: req.body.match });
		if (!matchExists) {
			return errorResponse(res, "Match not found.", statusCodes.NOT_FOUND);
		}

		// Check if player match stat already exists
		let playerMatchStats = await TournamentPlayerMatchStat.findOne({
			player: req.body.player,
			match: req.body.match,
			tournament: req.body.tournament,
		});

		if (playerMatchStats) {
			// Update player match stats, excluding match and player ObjectId from the update
			Object.entries(req.body).forEach(([key, value]) => {
				if (key !== "player" && key !== "match") {
					playerMatchStats[key] = value;
				}
			});

			await playerMatchStats.save();
			return successResponse(
				res,
				{
					message: "Player match stats updated successfully",
					data: playerMatchStats,
				},
				statusCodes.OK
			);
		} else {
			// Create new player match stats, excluding direct assignment of match and player ObjectId
			const newStats = { ...req.body };
			delete newStats.match; // Avoid directly setting the match ID
			delete newStats.player; // Avoid directly setting the player ID
			delete newStats.tournament; // Avoid directly setting the player ID

			playerMatchStats = new TournamentPlayerMatchStat(newStats);
			playerMatchStats.match = req.body.match; // Set match ID securely
			playerMatchStats.player = req.body.player; // Set player ID securely
			playerMatchStats.tournament = req.body.tournament; // Set player ID securely
			await playerMatchStats.save();

			return successResponse(
				res,
				{
					message: "Player match stats created successfully",
					data: playerMatchStats,
				},
				statusCodes.CREATED
			);
		}
	} catch (err) {
		console.error("Error adding/updating player match stats:", err);
		return errorResponse(
			res,
			"Internal Server Error",
			statusCodes.INTERNAL_SERVER_ERROR
		);
	}
});

//Update Match status
const changeTournamentMatchStatus = asyncHandler(async (req, res) => {
	try {
		const { error } = updateMatchStatusSchema.validate(req.body);
		if (error) {
			return errorResponse(
				res,
				error.details[0].message,
				statusCodes.BAD_REQUEST
			);
		}

		const { id, status, players } = req.body;

		// Find the match by ID
		const match = await TournamentMatches.findById(id).populate(
			"team_A team_B"
		);

		if (!match) {
			return errorResponse(res, "Match not found.", statusCodes.NOT_FOUND);
		}

		if (status === MatchStatus.FINISHED) {
			let updatedMatch = await updateTournamentMatchWinner(id);
			successResponse(res, updatedMatch, statusCodes.OK);
		} else {
			// Update the match status
			match.status = status;
			await match.save();

			// If the match is starting, update the gersyNumber for players
			if (status === MatchStatus.ONGOING && players && players.length > 0) {
				const updateGersyNumber = async (team, players) => {
					team.players = team.players.map((player) => {
						const updatedPlayer = players.find(
							(p) => p.user.toString() === player.user.toString()
						);
						if (updatedPlayer) {
							player.gersyNumber = updatedPlayer.gersyNumber;
						}
						return player;
					});

					await team.save();
				};

				await Promise.all([
					updateGersyNumber(match.team_A, players),
					updateGersyNumber(match.team_B, players),
				]);

				// Delay for 3 seconds before sending the start payment info
				setTimeout(() => {
					sendMatchStartPaymentInfo(
						match.community_center,
						match.startTime,
						match.endTime,
						match.match_date
					);
				}, 3000);
			}

			let data = { message: "Match status updated successfully.", match };
			successResponse(res, data, statusCodes.OK);
		}
	} catch (error) {
		console.log(error);
		return errorResponse(res, error.message, statusCodes.INTERNAL_SERVER_ERROR);
	}
});

//get player overall ranking in tournament
const getPlayerRankingsWithinTournament = asyncHandler(async (req, res) => {
	try {
		const { tournamentId } = req.query;
		if (!tournamentId) {
			return errorResponse(
				res,
				"Tournament id is required.",
				statusCodes.BAD_REQUEST
			);
		}

		// Aggregate players based on the number of matches they participated in
		const playerRankings = await TournamentPlayerMatchStat.aggregate([
			{
				$match: { tournament: new mongoose.Types.ObjectId(tournamentId) }, // Match specific tournament
			},
			{
				$group: {
					_id: "$player",
					matchCount: { $sum: 1 }, // Count the number of matches each player participated in
				},
			},
			{
				$sort: { matchCount: -1 }, // Sort by match count in descending order
			},
		]);

		// Now fetch user details for each player
		const rankedPlayers = await Promise.all(
			playerRankings.map(async (ranking, index) => {
				const playerDetails = await User.findById(ranking._id);
				return {
					rank: index + 1, // Rank within the tournament
					firstName: playerDetails.firstName,
					lastName: playerDetails.lastName,
					email: playerDetails.email,
					profilePhoto: playerDetails.profilePhoto, // Assuming you have a 'profilePhoto' field in your User model
					matchCount: ranking.matchCount, // Number of matches the player participated in
				};
			})
		);

		successResponse(res, rankedPlayers, statusCodes.OK);
	} catch (err) {
		console.error("Error getting player rankings within tournament:", err);
		errorResponse(res, err.message, statusCodes.BAD_REQUEST);
	}
});

//get tournament overall stats
const getTournamentStats = asyncHandler(async (req, res) => {
	try {
		const { tournamentId } = req.query;
		if (!tournamentId) {
			return errorResponse(
				res,
				"Tournament id is required.",
				statusCodes.BAD_REQUEST
			);
		}
		// Retrieve matches and populate team details
		const matches = await TournamentMatches.find({
			tournament: new mongoose.Types.ObjectId(tournamentId),
		})
			.populate("team_A")
			.populate("team_B")
			.lean();

		// Calculate scores and determine winners
		const matchResults = matches.map((match) => {
			const teamAScore = match.team_A.matchScore || 0;
			const teamBScore = match.team_B.matchScore || 0;
			const teamAWins = match.team_A.isWinner;
			const teamBWins = match.team_B.isWinner;

			return {
				matchDate: match.match_date,
				name: match.name,
				status: match.status,
				teamA: match.team_A.name,
				teamB: match.team_B.name,
				teamAScore,
				teamBScore,
				winner: teamAWins
					? match.team_A.name
					: teamBWins
					? match.team_B.name
					: null,
				teamAWins,
				teamBWins,
			};
		});

		successResponse(res, matchResults, statusCodes.OK);
	} catch (error) {
		console.error("Error getting tournament stats: ", error);
		throw error;
	}
});

//End Tournament
const endTournament = asyncHandler(async (req, res) => {
	const { tournamentId } = req.body;

	if (!tournamentId) {
		return errorResponse(
			res,
			"Tournament id is required",
			statusCodes.BAD_REQUEST
		);
	}

	try {
		// Find matches for the tournament
		const findMatches = await TournamentMatches.find({
			tournament: tournamentId,
		}).lean(); // Use .lean() to get plain JavaScript objects

		// Determine the new status based on the number of matches found
		const newStatus =
			findMatches.length > 0
				? TOURNAMENT_STATUS.COMPLETED
				: TOURNAMENT_STATUS.ENDED;

		// Update the tournament status
		const updatedTournament = await Tournament.findByIdAndUpdate(
			tournamentId,
			{ status: newStatus },
			{ new: true, lean: true } // Return a plain JavaScript object
		);

		if (!updatedTournament) {
			return errorResponse(res, "Tournament not found", statusCodes.NOT_FOUND);
		}

		if (findMatches.length > 0) {
			const findTournament = await Tournament.findById(tournamentId)
				.select(
					"-_location -tournament_matches -tournament_bookings -tournament_team"
				)
				.populate({
					path: "community_center",
					select: "name image address", // Only select these fields
				});

			const matches = await TournamentMatches.find({ tournament: tournamentId })
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

			const matchIds = matches.map((match) => match._id);
			const stats = await TournamentPlayerMatchStat.find({
				tournament: tournamentId,
				match: { $in: matchIds },
			});

			// Organize stats by matchId and playerId
			const statsMap = stats.reduce((acc, stat) => {
				if (!acc[stat.match]) {
					acc[stat.match] = {};
				}
				acc[stat.match][stat.player] = stat;
				return acc;
			}, {});

			// Add stats to the players in the matches
			matches.forEach((match) => {
				match.team_A.players.forEach((player) => {
					player.stats = statsMap[match._id]?.[player.user._id] || {};
				});
				match.team_B.players.forEach((player) => {
					player.stats = statsMap[match._id]?.[player.user._id] || {};
				});
			});

			let data = {
				message: "Tournament has been ended successfully",
				updatedTournament: findTournament,
				matches: matches,
			};
			return successResponse(res, data, statusCodes.OK);
		} else {
			let data = {
				message: "Tournament has been ended successfully",
				updatedTournament,
				matches: findMatches,
			};
			return successResponse(res, data, statusCodes.OK);
		}
	} catch (error) {
		return errorResponse(res, error.message, statusCodes.INTERNAL_SERVER_ERROR);
	}
});

// update tournament
const updateTournament = asyncHandler(async (req, res) => {
	const { error } = updateTournamentSchema.validate(req.body);
	if (error) {
		return errorResponse(
			res,
			error.details[0].message,
			statusCodes.BAD_REQUEST
		);
	}

	try {
		const {
			tournamentId,
			community_center,
			name,
			location: { latitude, longitude },
			startDate,
			endDate,
			maxPlayers,
			ageGroup,
			prize,
			entryFee,
		} = req.body;

		// Find the tournament by ID
		const tournament = await Tournament.findById(tournamentId);

		if (!tournament) {
			return errorResponse(res, "Tournament not found.", statusCodes.NOT_FOUND);
		}

		// Check if the tournament status is UPCOMING
		if (tournament.status !== TOURNAMENT_STATUS.UPCOMING) {
			return errorResponse(
				res,
				"Tournament can only be updated if it's not started.",
				statusCodes.BAD_REQUEST
			);
		}

		// Construct the update object
		const updateData = {
			name,
			community_center,
			"location.latitude": latitude,
			"location.longitude": longitude,
			_location: {
				type: "Point",
				coordinates: [longitude, latitude],
			},
			startDate,
			endDate,
			maxPlayers,
			ageGroup,
			prize,
			entryFee,
		};

		// Remove undefined fields from the update object
		Object.keys(updateData).forEach(
			(key) =>
				(updateData[key] === undefined ||
					(typeof updateData[key] === "object" &&
						Object.keys(updateData[key]).length === 0)) &&
				delete updateData[key]
		);

		// Update the tournament
		const updatedTournament = await Tournament.findByIdAndUpdate(
			tournamentId,
			updateData,
			{
				new: true, // Return the updated document
				runValidators: true, // Validate the update operation
			}
		);

		let data = {
			message: "Tournament has been updated successfully!",
			tournament: updatedTournament,
		};

		successResponse(res, data, statusCodes.OK);
	} catch (error) {
		return errorResponse(res, error.message, statusCodes.BAD_REQUEST);
	}
});

//Get Matches based on user
const getTournamentMatchesBasedOnUser = asyncHandler(async (req, res) => {
	try {
		const playerUD = req.user._id;
		// Find teams where the player is present
		const teams = await Team.find({
			"players.user": playerUD,
		}).select("_id");

		const teamIds = teams.map((team) => team._id);

		// Find matches where either team_A or team_B is in the teamIds
		const _matches = await TournamentMatches.find({
			$or: [{ team_A: { $in: teamIds } }, { team_B: { $in: teamIds } }],
		})
			.populate({
				path: "tournament",
				select:
					"-_location -tournament_matches -tournament_bookings -tournament_team",
			})
			.populate({
				path: "team_A",
				select: "_id name players matchScore isWinner",
				populate: {
					path: "players.user",
					select: "firstName lastName email profilePhoto coins ratings rating",
				},
			})
			.populate({
				path: "team_B",
				select: "_id name players matchScore isWinner",
				populate: {
					path: "players.user",
					select:
						"firstName lastName email profilePhoto position ratings rating",
				},
			})
			.populate({
				path: "community_center",
				select: "name image address", // Only select these fields
			})
			.exec();

		const matchIds = _matches.map((match) => match._id);
		const stats = await TournamentPlayerMatchStat.find({
			match: { $in: matchIds },
		});

		// Organize stats by matchId and playerId
		const statsMap = stats.reduce((acc, stat) => {
			if (!acc[stat.match]) {
				acc[stat.match] = {};
			}
			acc[stat.match][stat.player] = stat;
			return acc;
		}, {});

		// Add stats to the players in the matches
		_matches.forEach((match) => {
			match.team_A.players.forEach((player) => {
				player.stats = statsMap[match._id]?.[player.user._id] || {};
			});
			match.team_B.players.forEach((player) => {
				player.stats = statsMap[match._id]?.[player.user._id] || {};
			});
		});
		successResponse(res, _matches, statusCodes.OK);
	} catch (error) {
		return errorResponse(res, error.message, statusCodes.BAD_REQUEST);
	}
});

// @desc    Get Player Rankings in tournament
// @route   POST /api/v1/tourments/rankings
// @access  Private
const getTournamentPlayerPerformance = async (req, res) => {
	try {
		debugger;
		const { tournamentId } = req.query;

		// Ensure the tournamentId is a valid ObjectId
		if (!tournamentId) {
			return errorResponse(
				res,
				"Tournament id is required",
				statusCodes.BAD_GATEWAY
			);
		}

		// Fetch all teams in the tournament
		const teams = await Team.find({
			tournament: new mongoose.Types.ObjectId(tournamentId),
		}).populate({
			path: "players.user",
			select: "firstName lastName email profilePhoto", // Select player details from User model
		});

		// Check if teams exist
		if (!teams || teams.length === 0) {
			errorResponse(
				res,
				"No teams found for this tournament",
				statusCodes.NOT_FOUND
			);
		}

		let totalTournamentRankingPoints = 0;
		let totalWins = 0;
		let totalLosses = 0;
		let tournamentPlayersPerformance = [];

		// Fetch all matches for this tournament
		const matches = await TournamentMatches.find({
			tournament: new mongoose.Types.ObjectId(tournamentId),
		}).populate("team_A team_B");

		// Check if matches exist
		if (!matches || matches.length === 0) {
			errorResponse(
				res,
				"No matches found for this tournament",
				statusCodes.NOT_FOUND
			);
		}

		for (const team of teams) {
			if (team.players && team.players.length > 0) {
				for (const player of team.players) {
					let playerRankingPoints = 0;
					let playerWins = 0;
					let playerLosses = 0;

					// Calculate player stats for each match
					for (const match of matches) {
						const playerStats = await TournamentPlayerMatchStat.findOne({
							player: player.user._id,
							match: match._id,
						});

						if (playerStats) {
							const isWinner =
								(match.team_A._id.equals(team._id) && match.team_A.isWinner) ||
								(match.team_B._id.equals(team._id) && match.team_B.isWinner);

							// Calculate ranking points for the player's stats
							playerRankingPoints += calculatePlayerRanking(
								playerStats,
								isWinner
							);

							// Track individual player's wins and losses
							if (isWinner) {
								playerWins++;
								totalWins++;
							} else {
								playerLosses++;
								totalLosses++;
							}
						}
					}

					// Add player's performance to the tournament players' performance array
					tournamentPlayersPerformance.push({
						player: player.user,
						totalRankingPoints: playerRankingPoints,
						wins: playerWins,
						losses: playerLosses,
					});

					// Accumulate overall tournament ranking points
					totalTournamentRankingPoints += playerRankingPoints;
				}
			}
		}

		// Sort players by ranking points in descending order to determine rankings
		tournamentPlayersPerformance.sort(
			(a, b) => b.totalRankingPoints - a.totalRankingPoints
		);

		// Add rank to each player based on their position in the sorted array
		tournamentPlayersPerformance = tournamentPlayersPerformance.map(
			(performance, index) => ({
				...performance,
				rank: index + 1,
			})
		);

		// Respond with the tournament's overall performance
		let data = {
			totalTournamentRankingPoints,
			totalWins,
			totalLosses,
			tournamentPlayersPerformance,
		};
		successResponse(res, data, statusCodes.OK);
	} catch (error) {
		return res.status(500).json({
			success: false,
			message: "Failed to retrieve tournament performance data",
			error: error.message,
		});
	}
};

export {
	createTournament,
	listTournaments,
	addTournamentBooking,
	updateTournamentAndBookings,
	createMatchWithTeams,
	getMatchesByTournament,
	listTournamentsUnderCommunity,
	getBookingsByTournament,
	addOrUpdateTournamentPlayerMatchStat,
	changeTournamentMatchStatus,
	getPlayerRankingsWithinTournament,
	getTournamentStats,
	endTournament,
	updateTournament,
	getTournamentMatchesBasedOnUser,
	getTournamentPlayerPerformance,
};
