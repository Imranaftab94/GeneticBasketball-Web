import asyncHandler from "express-async-handler";
import { User } from "../models/user.model.js";
import { statusCodes } from "../constants/statusCodes.constant.js";
import { errorResponse, successResponse } from "../helpers/response.helper.js";
import {
	matchSchemaValidator,
	playerMatchStatsSchema,
	updateHighlightSchema,
	updateMatchStatusSchema,
} from "../validators/match.validator.js";
import { CommunityCenter } from "../models/community.model.js";
import { Matches } from "../models/matches.model.js";
import {
	modifyBookingStatus,
	sendMatchStartPaymentInfo,
} from "../services/event-loop-functions.service.js";
import mongoose, { MongooseError } from "mongoose";
import { MatchStatus } from "../constants/match-status.constant.js";
import { PlayerMatchStats } from "../models/player_stats.model.js";
import {
	calculatePlayerRanking,
	calculateStatsSumAsArray,
	getMatchStatisticsSimple,
	getMatchStatisticsTournament1,
	updateHighlights,
	updateMatchWinner,
} from "../services/matches.service.js";
import { TournamentPlayerMatchStat } from "../models/tournament_player_stats.model.js";
import { Team } from "../models/tournament_team.model.js";
import { generateThumbnailAndUpload } from "../services/generate-thumbnail.service.js";
import { TournamentMatches } from "../models/tournament_match.model.js";
import { Tournament } from "../models/tournament.model.js";
import { BookingStatus } from "../constants/common.constant.js";

const createMatch = asyncHandler(async (req, res) => {
	const { error } = matchSchemaValidator.validate(req.body);
	if (error) {
		return errorResponse(
			res,
			error.details[0].message,
			statusCodes.BAD_REQUEST
		);
	}

	const {
		community_center,
		team_A,
		team_B,
		startTime,
		endTime,
		match_date,
		day,
		name,
	} = req.body;

	try {
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

		// Function to validate existence of users in a team
		const validateTeamUsers = async (team) => {
			const userIds = team.map((player) => player.user);
			const users = await User.find({ _id: { $in: userIds } }, "_id");
			const existingUserIds = users.map((user) => user._id.toString());
			const missingUserIds = userIds.filter(
				(id) => !existingUserIds.includes(id)
			);
			return missingUserIds;
		};

		// Check if all users in team_A exist
		const missingTeamAUsers = await validateTeamUsers(team_A.players);
		if (missingTeamAUsers.length > 0) {
			return errorResponse(
				res,
				`Users not found in Team ${team_A.name}: ${missingTeamAUsers.join(
					", "
				)}`,
				statusCodes.NOT_FOUND
			);
		}

		// Check if all users in team_B exist
		const missingTeamBUsers = await validateTeamUsers(team_B.players);
		if (missingTeamBUsers.length > 0) {
			return errorResponse(
				res,
				`Users not found in Team ${team_B.name}: ${missingTeamBUsers.join(
					", "
				)}`,
				statusCodes.NOT_FOUND
			);
		}

		// Check that no user is in both Team A and Team B
		const teamAUsers = new Set(
			team_A.players.map((player) => player.user.toString())
		);
		const teamBUsers = new Set(
			team_B.players.map((player) => player.user.toString())
		);
		const intersection = new Set(
			[...teamAUsers].filter((user) => teamBUsers.has(user))
		);

		if (intersection.size > 0) {
			return errorResponse(
				res,
				`Users must be unique across teams. Overlapping user(s): ${[
					...intersection,
				].join(", ")}`,
				statusCodes.BAD_REQUEST
			);
		}

		// If all checks pass, save the new match
		const match = new Matches({
			community_center,
			team_A,
			team_B,
			startTime,
			endTime,
			match_date,
			day,
			name,
			created_by: req.user._id,
		});
		const savedMatch = await match.save();
		setTimeout(() => {
			let team = [...team_A.players, ...team_B.players];
			let bookingIds = team.map((_team) => _team.bookingId);
			modifyBookingStatus(community_center, bookingIds);
		}, 3000);

		successResponse(res, savedMatch, statusCodes.CREATED);
	} catch (error) {
		return errorResponse(res, error.message, statusCodes.BAD_REQUEST);
	}
});

const getMatchesBasedonUser = asyncHandler(async (req, res) => {
	try {
		// Retrieve matches where the user is in team_A or team_B
		const matches = await Matches.aggregate([
			{
				$match: {
					$or: [
						{ "team_A.players.user": req.user._id },
						{ "team_B.players.user": req.user._id },
					],
				},
			},
			{
				$lookup: {
					from: "communitycenters",
					localField: "community_center",
					foreignField: "_id",
					as: "community_center",
				},
			},
			{ $unwind: "$community_center" },
			{
				$addFields: {
					allBookingIds: {
						$setUnion: [
							{
								$map: {
									input: "$team_A.players",
									as: "a",
									in: "$$a.bookingId",
								},
							},
							{
								$map: {
									input: "$team_B.players",
									as: "b",
									in: "$$b.bookingId",
								},
							},
						],
					},
				},
			},
			{
				$lookup: {
					from: "users",
					localField: "team_A.players.user",
					foreignField: "_id",
					as: "team_A_users",
				},
			},
			{
				$lookup: {
					from: "users",
					localField: "team_B.players.user",
					foreignField: "_id",
					as: "team_B_users",
				},
			},
			// Lookup player stats for team A
			{
				$lookup: {
					from: "playermatchstats",
					localField: "team_A.players.user",
					foreignField: "player",
					as: "team_A_stats",
				},
			},
			// Lookup player stats for team B
			{
				$lookup: {
					from: "playermatchstats",
					localField: "team_B.players.user",
					foreignField: "player",
					as: "team_B_stats",
				},
			},
			{
				$project: {
					community_center: {
						name: 1,
						email: 1,
						address: 1,
						description: 1,
					},
					match_date: 1,
					status: 1,
					startTime: 1,
					endTime: 1,
					name: 1,
					match_score: 1,
					highlights: { $ifNull: ["$highlights", null] },
					team_A: {
						name: 1,
						matchScore: 1,
						isWinner: 1,
						players: {
							$map: {
								input: "$team_A.players",
								as: "player",
								in: {
									user: "$$player.user",
									bookingId: "$$player.bookingId",
									gersyNumber: "$$player.gersyNumber",
									firstName: {
										$arrayElemAt: [
											"$team_A_users.firstName",
											{ $indexOfArray: ["$team_A_users._id", "$$player.user"] },
										],
									},
									lastName: {
										$arrayElemAt: [
											"$team_A_users.lastName",
											{ $indexOfArray: ["$team_A_users._id", "$$player.user"] },
										],
									},
									email: {
										$arrayElemAt: [
											"$team_A_users.email",
											{ $indexOfArray: ["$team_A_users._id", "$$player.user"] },
										],
									},
									profilePhoto: {
										$arrayElemAt: [
											"$team_A_users.profilePhoto",
											{ $indexOfArray: ["$team_A_users._id", "$$player.user"] },
										],
									},
									ratings: {
										$arrayElemAt: [
											"$team_A_users.ratings",
											{ $indexOfArray: ["$team_A_users._id", "$$player.user"] },
										],
									},
									rating: {
										$arrayElemAt: [
											"$team_A_users.rating",
											{ $indexOfArray: ["$team_A_users._id", "$$player.user"] },
										],
									},
									stats: {
										$let: {
											vars: {
												filteredStats: {
													$arrayElemAt: [
														{
															$filter: {
																input: "$team_A_stats",
																as: "stat",
																cond: {
																	$and: [
																		{ $eq: ["$$stat.match", "$_id"] },
																		{ $eq: ["$$stat.player", "$$player.user"] },
																	],
																},
															},
														},
														0,
													],
												},
											},
											in: {
												$cond: {
													if: { $ne: ["$$filteredStats", null] },
													then: {
														minutesPlayed: "$$filteredStats.minutesPlayed",
														fieldGoalsMade: "$$filteredStats.fieldGoalsMade",
														fieldGoalsAttempted:
															"$$filteredStats.fieldGoalsAttempted",
														threePointersMade:
															"$$filteredStats.threePointersMade",
														threePointersAttempted:
															"$$filteredStats.threePointersAttempted",
														freeThrowsMade: "$$filteredStats.freeThrowsMade",
														freeThrowsAttempted:
															"$$filteredStats.freeThrowsAttempted",
														offensiveRebounds:
															"$$filteredStats.offensiveRebounds",
														defensiveRebounds:
															"$$filteredStats.defensiveRebounds",
														assists: "$$filteredStats.assists",
														steals: "$$filteredStats.steals",
														blocks: "$$filteredStats.blocks",
														turnovers: "$$filteredStats.turnovers",
														pointsScored: "$$filteredStats.pointsScored",
													},
													else: null,
												},
											},
										},
									},
								},
							},
						},
					},
					team_B: {
						name: 1,
						matchScore: 1,
						isWinner: 1,
						players: {
							$map: {
								input: "$team_B.players",
								as: "player",
								in: {
									user: "$$player.user",
									bookingId: "$$player.bookingId",
									gersyNumber: "$$player.gersyNumber",
									firstName: {
										$arrayElemAt: [
											"$team_B_users.firstName",
											{ $indexOfArray: ["$team_B_users._id", "$$player.user"] },
										],
									},
									lastName: {
										$arrayElemAt: [
											"$team_B_users.lastName",
											{ $indexOfArray: ["$team_B_users._id", "$$player.user"] },
										],
									},
									email: {
										$arrayElemAt: [
											"$team_B_users.email",
											{ $indexOfArray: ["$team_B_users._id", "$$player.user"] },
										],
									},
									profilePhoto: {
										$arrayElemAt: [
											"$team_B_users.profilePhoto",
											{ $indexOfArray: ["$team_B_users._id", "$$player.user"] },
										],
									},
									ratings: {
										$arrayElemAt: [
											"$team_B_users.ratings",
											{ $indexOfArray: ["$team_B_users._id", "$$player.user"] },
										],
									},
									rating: {
										$arrayElemAt: [
											"$team_B_users.rating",
											{ $indexOfArray: ["$team_B_users._id", "$$player.user"] },
										],
									},
									stats: {
										$let: {
											vars: {
												filteredStats: {
													$arrayElemAt: [
														{
															$filter: {
																input: "$team_B_stats",
																as: "stat",
																cond: {
																	$and: [
																		{ $eq: ["$$stat.match", "$_id"] },
																		{ $eq: ["$$stat.player", "$$player.user"] },
																	],
																},
															},
														},
														0,
													],
												},
											},
											in: {
												$cond: {
													if: { $ne: ["$$filteredStats", null] },
													then: {
														minutesPlayed: "$$filteredStats.minutesPlayed",
														fieldGoalsMade: "$$filteredStats.fieldGoalsMade",
														fieldGoalsAttempted:
															"$$filteredStats.fieldGoalsAttempted",
														threePointersMade:
															"$$filteredStats.threePointersMade",
														threePointersAttempted:
															"$$filteredStats.threePointersAttempted",
														freeThrowsMade: "$$filteredStats.freeThrowsMade",
														freeThrowsAttempted:
															"$$filteredStats.freeThrowsAttempted",
														offensiveRebounds:
															"$$filteredStats.offensiveRebounds",
														defensiveRebounds:
															"$$filteredStats.defensiveRebounds",
														assists: "$$filteredStats.assists",
														steals: "$$filteredStats.steals",
														blocks: "$$filteredStats.blocks",
														turnovers: "$$filteredStats.turnovers",
														pointsScored: "$$filteredStats.pointsScored",
													},
													else: null,
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
		]);

		successResponse(res, matches, statusCodes.OK);
	} catch (error) {
		return errorResponse(res, error.message, statusCodes.BAD_REQUEST);
	}
});

const getMatchesBasedonCommunity = asyncHandler(async (req, res) => {
	try {
		if (!req.query.community_center) {
			return errorResponse(
				res,
				"Community center id is required",
				statusCodes.BAD_REQUEST
			);
		}

		const matches = await Matches.aggregate([
			{
				$match: {
					community_center: new mongoose.Types.ObjectId(
						req.query.community_center
					),
				},
			},
			{
				$lookup: {
					from: "communitycenters",
					localField: "community_center",
					foreignField: "_id",
					as: "community_center",
				},
			},
			{ $unwind: "$community_center" },
			{
				$addFields: {
					allBookingIds: {
						$setUnion: [
							{
								$map: {
									input: "$team_A.players",
									as: "a",
									in: "$$a.bookingId",
								},
							},
							{
								$map: {
									input: "$team_B.players",
									as: "b",
									in: "$$b.bookingId",
								},
							},
						],
					},
				},
			},
			{
				$lookup: {
					from: "users",
					localField: "team_A.players.user",
					foreignField: "_id",
					as: "team_A_users",
				},
			},
			{
				$lookup: {
					from: "users",
					localField: "team_B.players.user",
					foreignField: "_id",
					as: "team_B_users",
				},
			},
			// Lookup player stats for team A
			{
				$lookup: {
					from: "playermatchstats",
					localField: "team_A.players.user",
					foreignField: "player",
					as: "team_A_stats",
				},
			},
			// Lookup player stats for team B
			{
				$lookup: {
					from: "playermatchstats",
					localField: "team_B.players.user",
					foreignField: "player",
					as: "team_B_stats",
				},
			},
			{
				$project: {
					community_center: {
						name: 1,
						email: 1,
						address: 1,
						description: 1,
					},
					match_date: 1,
					status: 1,
					startTime: 1,
					endTime: 1,
					name: 1,
					match_score: 1,
					highlights: { $ifNull: ["$highlights", null] },
					team_A: {
						name: 1,
						matchScore: 1,
						isWinner: 1,
						players: {
							$map: {
								input: "$team_A.players",
								as: "player",
								in: {
									user: "$$player.user",
									bookingId: "$$player.bookingId",
									gersyNumber: "$$player.gersyNumber",
									firstName: {
										$arrayElemAt: [
											"$team_A_users.firstName",
											{ $indexOfArray: ["$team_A_users._id", "$$player.user"] },
										],
									},
									lastName: {
										$arrayElemAt: [
											"$team_A_users.lastName",
											{ $indexOfArray: ["$team_A_users._id", "$$player.user"] },
										],
									},
									email: {
										$arrayElemAt: [
											"$team_A_users.email",
											{ $indexOfArray: ["$team_A_users._id", "$$player.user"] },
										],
									},
									profilePhoto: {
										$arrayElemAt: [
											"$team_A_users.profilePhoto",
											{ $indexOfArray: ["$team_A_users._id", "$$player.user"] },
										],
									},
									ratings: {
										$arrayElemAt: [
											"$team_A_users.ratings",
											{ $indexOfArray: ["$team_A_users._id", "$$player.user"] },
										],
									},
									rating: {
										$arrayElemAt: [
											"$team_A_users.rating",
											{ $indexOfArray: ["$team_A_users._id", "$$player.user"] },
										],
									},
									stats: {
										$let: {
											vars: {
												filteredStats: {
													$arrayElemAt: [
														{
															$filter: {
																input: "$team_A_stats",
																as: "stat",
																cond: {
																	$and: [
																		{ $eq: ["$$stat.match", "$_id"] },
																		{ $eq: ["$$stat.player", "$$player.user"] },
																	],
																},
															},
														},
														0,
													],
												},
											},
											in: {
												$cond: {
													if: { $ne: ["$$filteredStats", null] },
													then: {
														minutesPlayed: "$$filteredStats.minutesPlayed",
														fieldGoalsMade: "$$filteredStats.fieldGoalsMade",
														fieldGoalsAttempted:
															"$$filteredStats.fieldGoalsAttempted",
														threePointersMade:
															"$$filteredStats.threePointersMade",
														threePointersAttempted:
															"$$filteredStats.threePointersAttempted",
														freeThrowsMade: "$$filteredStats.freeThrowsMade",
														freeThrowsAttempted:
															"$$filteredStats.freeThrowsAttempted",
														offensiveRebounds:
															"$$filteredStats.offensiveRebounds",
														defensiveRebounds:
															"$$filteredStats.defensiveRebounds",
														assists: "$$filteredStats.assists",
														steals: "$$filteredStats.steals",
														blocks: "$$filteredStats.blocks",
														turnovers: "$$filteredStats.turnovers",
														pointsScored: "$$filteredStats.pointsScored",
													},
													else: null,
												},
											},
										},
									},
								},
							},
						},
					},
					team_B: {
						name: 1,
						matchScore: 1,
						isWinner: 1,
						players: {
							$map: {
								input: "$team_B.players",
								as: "player",
								in: {
									user: "$$player.user",
									bookingId: "$$player.bookingId",
									gersyNumber: "$$player.gersyNumber",
									firstName: {
										$arrayElemAt: [
											"$team_B_users.firstName",
											{ $indexOfArray: ["$team_B_users._id", "$$player.user"] },
										],
									},
									lastName: {
										$arrayElemAt: [
											"$team_B_users.lastName",
											{ $indexOfArray: ["$team_B_users._id", "$$player.user"] },
										],
									},
									email: {
										$arrayElemAt: [
											"$team_B_users.email",
											{ $indexOfArray: ["$team_B_users._id", "$$player.user"] },
										],
									},
									profilePhoto: {
										$arrayElemAt: [
											"$team_B_users.profilePhoto",
											{ $indexOfArray: ["$team_B_users._id", "$$player.user"] },
										],
									},
									ratings: {
										$arrayElemAt: [
											"$team_B_users.ratings",
											{ $indexOfArray: ["$team_B_users._id", "$$player.user"] },
										],
									},
									rating: {
										$arrayElemAt: [
											"$team_B_users.rating",
											{ $indexOfArray: ["$team_B_users._id", "$$player.user"] },
										],
									},
									stats: {
										$let: {
											vars: {
												filteredStats: {
													$arrayElemAt: [
														{
															$filter: {
																input: "$team_B_stats",
																as: "stat",
																cond: {
																	$and: [
																		{ $eq: ["$$stat.match", "$_id"] },
																		{ $eq: ["$$stat.player", "$$player.user"] },
																	],
																},
															},
														},
														0,
													],
												},
											},
											in: {
												$cond: {
													if: { $ne: ["$$filteredStats", null] },
													then: {
														minutesPlayed: "$$filteredStats.minutesPlayed",
														fieldGoalsMade: "$$filteredStats.fieldGoalsMade",
														fieldGoalsAttempted:
															"$$filteredStats.fieldGoalsAttempted",
														threePointersMade:
															"$$filteredStats.threePointersMade",
														threePointersAttempted:
															"$$filteredStats.threePointersAttempted",
														freeThrowsMade: "$$filteredStats.freeThrowsMade",
														freeThrowsAttempted:
															"$$filteredStats.freeThrowsAttempted",
														offensiveRebounds:
															"$$filteredStats.offensiveRebounds",
														defensiveRebounds:
															"$$filteredStats.defensiveRebounds",
														assists: "$$filteredStats.assists",
														steals: "$$filteredStats.steals",
														blocks: "$$filteredStats.blocks",
														turnovers: "$$filteredStats.turnovers",
														pointsScored: "$$filteredStats.pointsScored",
													},
													else: null,
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
		]);

		successResponse(res, matches, statusCodes.OK);
	} catch (error) {
		return errorResponse(res, error.message, statusCodes.BAD_REQUEST);
	}
});

const changeMatchStatus = asyncHandler(async (req, res) => {
	try {
		const { error } = updateMatchStatusSchema.validate(req.body);
		if (error) {
			return errorResponse(
				res,
				error.details[0].message,
				statusCodes.BAD_REQUEST
			);
		}

		const { id, status } = req.body;
		if (status === MatchStatus.FINISHED) {
			let match = await updateMatchWinner(id);
			successResponse(res, match, statusCodes.OK);
		} else {
			// Find the match by ID
			const match = await Matches.findById(id);

			if (!match) {
				return errorResponse(res, "Match not found.", statusCodes.NOT_FOUND);
			}

			// Update the match status using the schema method
			match.status = status;
			await match.save();

			let data = { message: "Match status updated successfully.", match };
			setTimeout(() => {
				if (status === MatchStatus.ONGOING) {
					sendMatchStartPaymentInfo(
						match.community_center,
						match.startTime,
						match.endTime,
						match.match_date
					);
				}
			}, 3000);
			successResponse(res, data, statusCodes.OK);
		}
	} catch (error) {
		return errorResponse(
			res,
			"Internal Server Error",
			statusCodes.INTERNAL_SERVER_ERROR
		);
	}
});

const getAllMatchesWithinAdmin = asyncHandler(async (req, res) => {
	try {
		const matches = await Matches.aggregate([
			{
				$lookup: {
					from: "communitycenters",
					localField: "community_center",
					foreignField: "_id",
					as: "community_center",
				},
			},
			{ $unwind: "$community_center" },
			{
				$addFields: {
					allBookingIds: {
						$setUnion: [
							{
								$map: {
									input: "$team_A.players",
									as: "a",
									in: "$$a.bookingId",
								},
							},
							{
								$map: {
									input: "$team_B.players",
									as: "b",
									in: "$$b.bookingId",
								},
							},
						],
					},
				},
			},
			{
				$lookup: {
					from: "users",
					localField: "team_A.players.user",
					foreignField: "_id",
					as: "team_A_users",
				},
			},
			{
				$lookup: {
					from: "users",
					localField: "team_B.players.user",
					foreignField: "_id",
					as: "team_B_users",
				},
			},
			{
				$lookup: {
					from: "playermatchstats",
					localField: "team_A.players.user",
					foreignField: "player",
					as: "team_A_stats",
				},
			},
			{
				$lookup: {
					from: "playermatchstats",
					localField: "team_B.players.user",
					foreignField: "player",
					as: "team_B_stats",
				},
			},
			{
				$project: {
					community_center: {
						name: 1,
						email: 1,
						address: 1,
						description: 1,
					},
					match_date: 1,
					status: 1,
					startTime: 1,
					endTime: 1,
					name: 1,
					match_score: 1,
					highlights: { $ifNull: ["$highlights", null] },
					team_A: {
						name: 1,
						matchScore: 1,
						isWinner: 1,
						players: {
							$map: {
								input: "$team_A.players",
								as: "player",
								in: {
									user: "$$player.user",
									bookingId: "$$player.bookingId",
									gersyNumber: "$$player.gersyNumber",
									firstName: {
										$arrayElemAt: [
											"$team_A_users.firstName",
											{ $indexOfArray: ["$team_A_users._id", "$$player.user"] },
										],
									},
									lastName: {
										$arrayElemAt: [
											"$team_A_users.lastName",
											{ $indexOfArray: ["$team_A_users._id", "$$player.user"] },
										],
									},
									email: {
										$arrayElemAt: [
											"$team_A_users.email",
											{ $indexOfArray: ["$team_A_users._id", "$$player.user"] },
										],
									},
									profilePhoto: {
										$arrayElemAt: [
											"$team_A_users.profilePhoto",
											{ $indexOfArray: ["$team_A_users._id", "$$player.user"] },
										],
									},
									ratings: {
										$arrayElemAt: [
											"$team_A_users.ratings",
											{ $indexOfArray: ["$team_B_users._id", "$$player.user"] },
										],
									},
									rating: {
										$arrayElemAt: [
											"$team_A_users.rating",
											{ $indexOfArray: ["$team_B_users._id", "$$player.user"] },
										],
									},
									stats: {
										$let: {
											vars: {
												filteredStats: {
													$arrayElemAt: [
														{
															$filter: {
																input: "$team_A_stats",
																as: "stat",
																cond: {
																	$and: [
																		{ $eq: ["$$stat.match", "$_id"] },
																		{ $eq: ["$$stat.player", "$$player.user"] },
																	],
																},
															},
														},
														0,
													],
												},
											},
											in: {
												$cond: {
													if: { $ne: ["$$filteredStats", null] },
													then: {
														minutesPlayed: "$$filteredStats.minutesPlayed",
														fieldGoalsMade: "$$filteredStats.fieldGoalsMade",
														fieldGoalsAttempted:
															"$$filteredStats.fieldGoalsAttempted",
														threePointersMade:
															"$$filteredStats.threePointersMade",
														threePointersAttempted:
															"$$filteredStats.threePointersAttempted",
														freeThrowsMade: "$$filteredStats.freeThrowsMade",
														freeThrowsAttempted:
															"$$filteredStats.freeThrowsAttempted",
														offensiveRebounds:
															"$$filteredStats.offensiveRebounds",
														defensiveRebounds:
															"$$filteredStats.defensiveRebounds",
														assists: "$$filteredStats.assists",
														steals: "$$filteredStats.steals",
														blocks: "$$filteredStats.blocks",
														turnovers: "$$filteredStats.turnovers",
														pointsScored: "$$filteredStats.pointsScored",
													},
													else: null,
												},
											},
										},
									},
								},
							},
						},
					},
					team_B: {
						name: 1,
						matchScore: 1,
						isWinner: 1,
						players: {
							$map: {
								input: "$team_B.players",
								as: "player",
								in: {
									user: "$$player.user",
									bookingId: "$$player.bookingId",
									gersyNumber: "$$player.gersyNumber",
									firstName: {
										$arrayElemAt: [
											"$team_B_users.firstName",
											{ $indexOfArray: ["$team_B_users._id", "$$player.user"] },
										],
									},
									lastName: {
										$arrayElemAt: [
											"$team_B_users.lastName",
											{ $indexOfArray: ["$team_B_users._id", "$$player.user"] },
										],
									},
									email: {
										$arrayElemAt: [
											"$team_B_users.email",
											{ $indexOfArray: ["$team_B_users._id", "$$player.user"] },
										],
									},
									profilePhoto: {
										$arrayElemAt: [
											"$team_B_users.profilePhoto",
											{ $indexOfArray: ["$team_B_users._id", "$$player.user"] },
										],
									},
									ratings: {
										$arrayElemAt: [
											"$team_B_users.ratings",
											{ $indexOfArray: ["$team_B_users._id", "$$player.user"] },
										],
									},
									rating: {
										$arrayElemAt: [
											"$team_B_users.rating",
											{ $indexOfArray: ["$team_B_users._id", "$$player.user"] },
										],
									},
									stats: {
										$let: {
											vars: {
												filteredStats: {
													$arrayElemAt: [
														{
															$filter: {
																input: "$team_B_stats",
																as: "stat",
																cond: {
																	$and: [
																		{ $eq: ["$$stat.match", "$_id"] },
																		{ $eq: ["$$stat.player", "$$player.user"] },
																	],
																},
															},
														},
														0,
													],
												},
											},
											in: {
												$cond: {
													if: { $ne: ["$$filteredStats", null] },
													then: {
														minutesPlayed: "$$filteredStats.minutesPlayed",
														fieldGoalsMade: "$$filteredStats.fieldGoalsMade",
														fieldGoalsAttempted:
															"$$filteredStats.fieldGoalsAttempted",
														threePointersMade:
															"$$filteredStats.threePointersMade",
														threePointersAttempted:
															"$$filteredStats.threePointersAttempted",
														freeThrowsMade: "$$filteredStats.freeThrowsMade",
														freeThrowsAttempted:
															"$$filteredStats.freeThrowsAttempted",
														offensiveRebounds:
															"$$filteredStats.offensiveRebounds",
														defensiveRebounds:
															"$$filteredStats.defensiveRebounds",
														assists: "$$filteredStats.assists",
														steals: "$$filteredStats.steals",
														blocks: "$$filteredStats.blocks",
														turnovers: "$$filteredStats.turnovers",
														pointsScored: "$$filteredStats.pointsScored",
													},
													else: null,
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
		]);

		successResponse(res, matches, statusCodes.OK);
	} catch (error) {
		return errorResponse(res, error.message, statusCodes.BAD_REQUEST);
	}
});

const addOrUpdatePlayerMatchStat = asyncHandler(async (req, res) => {
	try {
		// Validate request body using Joi or a similar library
		const { error } = playerMatchStatsSchema.validate(req.body);
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
		const matchExists = await Matches.exists({ _id: req.body.match });
		if (!matchExists) {
			return errorResponse(res, "Match not found.", statusCodes.NOT_FOUND);
		}

		// Check if player match stat already exists
		let playerMatchStats = await PlayerMatchStats.findOne({
			player: req.body.player,
			match: req.body.match,
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

			playerMatchStats = new PlayerMatchStats(newStats);
			playerMatchStats.match = req.body.match; // Set match ID securely
			playerMatchStats.player = req.body.player; // Set player ID securely
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

const getPlayerOverallStats = asyncHandler(async (req, res) => {
	try {
		if (!req.query.user) {
			errorResponse(res, "User id is required.", statusCodes.BAD_REQUEST);
			return;
		}

		const playerId = new mongoose.Types.ObjectId(req.query.user);

		// Aggregate regular matches
		const regularMatches = await Matches.aggregate([
			{
				$match: {
					status: MatchStatus.FINISHED,
					$or: [
						{ "team_A.players.user": playerId },
						{ "team_B.players.user": playerId },
					],
				},
			},
			{
				$project: {
					_id: 0,
					isTeamA: { $in: [playerId, "$team_A.players.user"] },
					isTeamB: { $in: [playerId, "$team_B.players.user"] },
					teamAWon: "$team_A.isWinner",
					teamBWon: "$team_B.isWinner",
				},
			},
			{
				$group: {
					_id: null,
					totalMatches: { $sum: 1 },
					wonMatches: {
						$sum: {
							$cond: {
								if: {
									$or: [
										{ $and: ["$isTeamA", "$teamAWon"] },
										{ $and: ["$isTeamB", "$teamBWon"] },
									],
								},
								then: 1,
								else: 0,
							},
						},
					},
					lostMatches: {
						$sum: {
							$cond: {
								if: {
									$or: [
										{ $and: ["$isTeamA", "$teamBWon"] },
										{ $and: ["$isTeamB", "$teamAWon"] },
									],
								},
								then: 1,
								else: 0,
							},
						},
					},
				},
			},
		]);

		console.log("Regular Matches", regularMatches);

		const regularMatchStats = regularMatches[0] || {
			totalMatches: 0,
			wonMatches: 0,
			lostMatches: 0,
		};

		// Aggregate tournament matches
		const tournamentMatches = await Team.aggregate([
			{
				$match: {
					"players.user": playerId,
				},
			},
			{
				$project: {
					_id: 0,
					isWinner: "$isWinner",
				},
			},
			{
				$group: {
					_id: null,
					totalMatches: { $sum: 1 },
					wonMatches: {
						$sum: {
							$cond: { if: "$isWinner", then: 1, else: 0 },
						},
					},
					lostMatches: {
						$sum: {
							$cond: { if: { $not: "$isWinner" }, then: 1, else: 0 },
						},
					},
				},
			},
		]);

		const tournamentMatchStats = tournamentMatches[0] || {
			totalMatches: 0,
			wonMatches: 0,
			lostMatches: 0,
		};

		// Combine regular match stats and tournament match stats
		const combinedMatchStats = {
			totalMatches:
				regularMatchStats.totalMatches + tournamentMatchStats.totalMatches,
			wonMatches:
				regularMatchStats.wonMatches + tournamentMatchStats.wonMatches,
			lostMatches:
				regularMatchStats.lostMatches + tournamentMatchStats.lostMatches,
		};

		// Aggregate regular player stats
		const playerStats = await PlayerMatchStats.aggregate([
			{
				$match: {
					player: playerId,
				},
			},
			{
				$group: {
					_id: null,
					totalMinutesPlayed: { $sum: "$minutesPlayed" },
					totalFieldGoalsMade: { $sum: "$fieldGoalsMade" },
					totalFieldGoalsAttempted: { $sum: "$fieldGoalsAttempted" },
					totalThreePointersMade: { $sum: "$threePointersMade" },
					totalThreePointersAttempted: { $sum: "$threePointersAttempted" },
					totalFreeThrowsMade: { $sum: "$freeThrowsMade" },
					totalFreeThrowsAttempted: { $sum: "$freeThrowsAttempted" },
					totalOffensiveRebounds: { $sum: "$offensiveRebounds" },
					totalDefensiveRebounds: { $sum: "$defensiveRebounds" },
					totalAssists: { $sum: "$assists" },
					totalSteals: { $sum: "$steals" },
					totalBlocks: { $sum: "$blocks" },
					totalTurnovers: { $sum: "$turnovers" },
					totalPointsScored: { $sum: "$pointsScored" },
				},
			},
		]);

		const regularPlayerStats = playerStats[0] || {
			totalMinutesPlayed: 0,
			totalFieldGoalsMade: 0,
			totalFieldGoalsAttempted: 0,
			totalThreePointersMade: 0,
			totalThreePointersAttempted: 0,
			totalFreeThrowsMade: 0,
			totalFreeThrowsAttempted: 0,
			totalOffensiveRebounds: 0,
			totalDefensiveRebounds: 0,
			totalAssists: 0,
			totalSteals: 0,
			totalBlocks: 0,
			totalTurnovers: 0,
			totalPointsScored: 0,
		};

		// Aggregate tournament player stats
		const tournamentPlayerStats = await TournamentPlayerMatchStat.aggregate([
			{
				$match: {
					player: playerId,
				},
			},
			{
				$group: {
					_id: null,
					totalFieldGoalsMade: { $sum: "$fieldGoalsMade" },
					totalFieldGoalsAttempted: { $sum: "$fieldGoalsAttempted" },
					totalThreePointersMade: { $sum: "$threePointersMade" },
					totalThreePointersAttempted: { $sum: "$threePointersAttempted" },
					totalFreeThrowsMade: { $sum: "$freeThrowsMade" },
					totalFreeThrowsAttempted: { $sum: "$freeThrowsAttempted" },
					totalOffensiveRebounds: { $sum: "$offensiveRebounds" },
					totalDefensiveRebounds: { $sum: "$rebounds" }, // Assuming rebounds include both offensive and defensive
					totalAssists: { $sum: "$assists" },
					totalSteals: { $sum: "$steals" },
					totalBlocks: { $sum: "$blocks" },
					totalTurnovers: { $sum: "$turnovers" },
					totalPointsScored: { $sum: "$pointsScored" },
				},
			},
		]);

		const tournamentPlayerStatsResult = tournamentPlayerStats[0] || {
			totalFieldGoalsMade: 0,
			totalFieldGoalsAttempted: 0,
			totalThreePointersMade: 0,
			totalThreePointersAttempted: 0,
			totalFreeThrowsMade: 0,
			totalFreeThrowsAttempted: 0,
			totalOffensiveRebounds: 0,
			totalDefensiveRebounds: 0,
			totalAssists: 0,
			totalSteals: 0,
			totalBlocks: 0,
			totalTurnovers: 0,
			totalPointsScored: 0,
		};

		// Combine regular player stats and tournament player stats
		const combinedPlayerStats = {
			totalMinutesPlayed: regularPlayerStats.totalMinutesPlayed, // No minutes played field in tournament stats
			totalFieldGoalsMade:
				regularPlayerStats.totalFieldGoalsMade +
				tournamentPlayerStatsResult.totalFieldGoalsMade,
			totalFieldGoalsAttempted:
				regularPlayerStats.totalFieldGoalsAttempted +
				tournamentPlayerStatsResult.totalFieldGoalsAttempted,
			totalThreePointersMade:
				regularPlayerStats.totalThreePointersMade +
				tournamentPlayerStatsResult.totalThreePointersMade,
			totalThreePointersAttempted:
				regularPlayerStats.totalThreePointersAttempted +
				tournamentPlayerStatsResult.totalThreePointersAttempted,
			totalFreeThrowsMade:
				regularPlayerStats.totalFreeThrowsMade +
				tournamentPlayerStatsResult.totalFreeThrowsMade,
			totalFreeThrowsAttempted:
				regularPlayerStats.totalFreeThrowsAttempted +
				tournamentPlayerStatsResult.totalFreeThrowsAttempted,
			totalOffensiveRebounds:
				regularPlayerStats.totalOffensiveRebounds +
				tournamentPlayerStatsResult.totalOffensiveRebounds,
			totalDefensiveRebounds:
				regularPlayerStats.totalDefensiveRebounds +
				tournamentPlayerStatsResult.totalDefensiveRebounds,
			totalAssists:
				regularPlayerStats.totalAssists +
				tournamentPlayerStatsResult.totalAssists,
			totalSteals:
				regularPlayerStats.totalSteals +
				tournamentPlayerStatsResult.totalSteals,
			totalBlocks:
				regularPlayerStats.totalBlocks +
				tournamentPlayerStatsResult.totalBlocks,
			totalTurnovers:
				regularPlayerStats.totalTurnovers +
				tournamentPlayerStatsResult.totalTurnovers,
			totalPointsScored:
				regularPlayerStats.totalPointsScored +
				tournamentPlayerStatsResult.totalPointsScored,
		};

		const response = {
			totalMatches: combinedMatchStats.totalMatches,
			wonMatches: combinedMatchStats.wonMatches,
			lostMatches: combinedMatchStats.lostMatches,
			...combinedPlayerStats,
		};

		successResponse(res, response, statusCodes.OK);
	} catch (error) {
		errorResponse(res, error.message, statusCodes.BAD_REQUEST);
	}
});

const getMatchesBasedonBookingId = asyncHandler(async (req, res) => {
	try {
		// Retrieve matches where the user is in team_A or team_B
		if (!req.query.bookingId) {
			return errorResponse(
				res,
				"Booking id is required",
				statusCodes.BAD_REQUEST
			);
		}
		const matches = await Matches.aggregate([
			{
				$match: {
					$or: [
						{ "team_A.players.bookingId": req.query.bookingId },
						{ "team_B.players.bookingId": req.query.bookingId },
					],
				},
			},
			{
				$lookup: {
					from: "communitycenters",
					localField: "community_center",
					foreignField: "_id",
					as: "community_center",
				},
			},
			{ $unwind: "$community_center" },
			{
				$addFields: {
					allBookingIds: {
						$setUnion: [
							{
								$map: {
									input: "$team_A.players",
									as: "a",
									in: "$$a.bookingId",
								},
							},
							{
								$map: {
									input: "$team_B.players",
									as: "b",
									in: "$$b.bookingId",
								},
							},
						],
					},
				},
			},
			{
				$lookup: {
					from: "users",
					localField: "team_A.players.user",
					foreignField: "_id",
					as: "team_A_users",
				},
			},
			{
				$lookup: {
					from: "users",
					localField: "team_B.players.user",
					foreignField: "_id",
					as: "team_B_users",
				},
			},
			// Lookup player stats for team A
			{
				$lookup: {
					from: "playermatchstats",
					localField: "team_A.players.user",
					foreignField: "player",
					as: "team_A_stats",
				},
			},
			// Lookup player stats for team B
			{
				$lookup: {
					from: "playermatchstats",
					localField: "team_B.players.user",
					foreignField: "player",
					as: "team_B_stats",
				},
			},
			{
				$project: {
					community_center: {
						name: 1,
						email: 1,
						address: 1,
						description: 1,
					},
					match_date: 1,
					status: 1,
					startTime: 1,
					endTime: 1,
					name: 1,
					match_score: 1,
					highlights: { $ifNull: ["$highlights", null] },
					team_A: {
						name: 1,
						matchScore: 1,
						isWinner: 1,
						players: {
							$map: {
								input: "$team_A.players",
								as: "player",
								in: {
									user: "$$player.user",
									bookingId: "$$player.bookingId",
									gersyNumber: "$$player.gersyNumber",
									firstName: {
										$arrayElemAt: [
											"$team_A_users.firstName",
											{ $indexOfArray: ["$team_A_users._id", "$$player.user"] },
										],
									},
									lastName: {
										$arrayElemAt: [
											"$team_A_users.lastName",
											{ $indexOfArray: ["$team_A_users._id", "$$player.user"] },
										],
									},
									email: {
										$arrayElemAt: [
											"$team_A_users.email",
											{ $indexOfArray: ["$team_A_users._id", "$$player.user"] },
										],
									},
									profilePhoto: {
										$arrayElemAt: [
											"$team_A_users.profilePhoto",
											{ $indexOfArray: ["$team_A_users._id", "$$player.user"] },
										],
									},
									ratings: {
										$arrayElemAt: [
											"$team_A_users.ratings",
											{ $indexOfArray: ["$team_A_users._id", "$$player.user"] },
										],
									},
									rating: {
										$arrayElemAt: [
											"$team_A_users.rating",
											{ $indexOfArray: ["$team_A_users._id", "$$player.user"] },
										],
									},
									stats: {
										$let: {
											vars: {
												filteredStats: {
													$arrayElemAt: [
														{
															$filter: {
																input: "$team_A_stats",
																as: "stat",
																cond: {
																	$and: [
																		{ $eq: ["$$stat.match", "$_id"] },
																		{ $eq: ["$$stat.player", "$$player.user"] },
																	],
																},
															},
														},
														0,
													],
												},
											},
											in: {
												$cond: {
													if: { $ne: ["$$filteredStats", null] },
													then: {
														minutesPlayed: "$$filteredStats.minutesPlayed",
														fieldGoalsMade: "$$filteredStats.fieldGoalsMade",
														fieldGoalsAttempted:
															"$$filteredStats.fieldGoalsAttempted",
														threePointersMade:
															"$$filteredStats.threePointersMade",
														threePointersAttempted:
															"$$filteredStats.threePointersAttempted",
														freeThrowsMade: "$$filteredStats.freeThrowsMade",
														freeThrowsAttempted:
															"$$filteredStats.freeThrowsAttempted",
														offensiveRebounds:
															"$$filteredStats.offensiveRebounds",
														defensiveRebounds:
															"$$filteredStats.defensiveRebounds",
														assists: "$$filteredStats.assists",
														steals: "$$filteredStats.steals",
														blocks: "$$filteredStats.blocks",
														turnovers: "$$filteredStats.turnovers",
														pointsScored: "$$filteredStats.pointsScored",
													},
													else: null,
												},
											},
										},
									},
								},
							},
						},
					},
					team_B: {
						name: 1,
						matchScore: 1,
						isWinner: 1,
						players: {
							$map: {
								input: "$team_B.players",
								as: "player",
								in: {
									user: "$$player.user",
									bookingId: "$$player.bookingId",
									gersyNumber: "$$player.gersyNumber",
									firstName: {
										$arrayElemAt: [
											"$team_B_users.firstName",
											{ $indexOfArray: ["$team_B_users._id", "$$player.user"] },
										],
									},
									lastName: {
										$arrayElemAt: [
											"$team_B_users.lastName",
											{ $indexOfArray: ["$team_B_users._id", "$$player.user"] },
										],
									},
									email: {
										$arrayElemAt: [
											"$team_B_users.email",
											{ $indexOfArray: ["$team_B_users._id", "$$player.user"] },
										],
									},
									profilePhoto: {
										$arrayElemAt: [
											"$team_B_users.profilePhoto",
											{ $indexOfArray: ["$team_B_users._id", "$$player.user"] },
										],
									},
									ratings: {
										$arrayElemAt: [
											"$team_B_users.ratings",
											{ $indexOfArray: ["$team_B_users._id", "$$player.user"] },
										],
									},
									rating: {
										$arrayElemAt: [
											"$team_B_users.rating",
											{ $indexOfArray: ["$team_B_users._id", "$$player.user"] },
										],
									},

									stats: {
										$let: {
											vars: {
												filteredStats: {
													$arrayElemAt: [
														{
															$filter: {
																input: "$team_B_stats",
																as: "stat",
																cond: {
																	$and: [
																		{ $eq: ["$$stat.match", "$_id"] },
																		{ $eq: ["$$stat.player", "$$player.user"] },
																	],
																},
															},
														},
														0,
													],
												},
											},
											in: {
												$cond: {
													if: { $ne: ["$$filteredStats", null] },
													then: {
														minutesPlayed: "$$filteredStats.minutesPlayed",
														fieldGoalsMade: "$$filteredStats.fieldGoalsMade",
														fieldGoalsAttempted:
															"$$filteredStats.fieldGoalsAttempted",
														threePointersMade:
															"$$filteredStats.threePointersMade",
														threePointersAttempted:
															"$$filteredStats.threePointersAttempted",
														freeThrowsMade: "$$filteredStats.freeThrowsMade",
														freeThrowsAttempted:
															"$$filteredStats.freeThrowsAttempted",
														offensiveRebounds:
															"$$filteredStats.offensiveRebounds",
														defensiveRebounds:
															"$$filteredStats.defensiveRebounds",
														assists: "$$filteredStats.assists",
														steals: "$$filteredStats.steals",
														blocks: "$$filteredStats.blocks",
														turnovers: "$$filteredStats.turnovers",
														pointsScored: "$$filteredStats.pointsScored",
													},
													else: null,
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
		]);

		let data = matches.length > 0 ? matches[0] : null;

		successResponse(res, data, statusCodes.OK);
	} catch (error) {
		return errorResponse(res, error.message, statusCodes.BAD_REQUEST);
	}
});

// @desc    Upload Match Higlights
// @route   POST /api/v1/matches/uploadHighlights
// @access  Private

const uploadHighlights = asyncHandler(async (req, res) => {
	try {
		if (!req.file) {
			return errorResponse(
				res,
				"Video Frame is required",
				statusCodes.BAD_REQUEST
			);
		}
		const { error } = updateHighlightSchema.validate(req.body);
		if (error) {
			return errorResponse(
				res,
				error.details[0].message,
				statusCodes.BAD_REQUEST
			);
		}
		const file = req.file.buffer;
		const { id, name, awsUrl } = req.body;
		await generateThumbnailAndUpload(file, req.file.originalname).then(
			async (_res) => {
				let highlights = {
					name,
					awsUrl,
					thumbnailImage: _res, // Assuming generateThumbnailAndUpload returns relevant data
				};
				let response = await updateHighlights(id, highlights);

				successResponse(res, response, statusCodes.OK);
			}
		);
	} catch (error) {
		return errorResponse(res, error.message, statusCodes.BAD_REQUEST);
	}
});

// @desc    Get communities and tournaments list
// @route   GET /api/v1/matches/scoreBoard
// @access  Private
const scoreBoard = asyncHandler(async (req, res) => {
	// Fetch community centers for the player
	// let playerId = new mongoose.Types.ObjectId('662ea34e5023bf752f5dd62b');
	let playerId = req.user.id;

	const communityCenters = await CommunityCenter.find({
		"communityTimeSlots.slots.bookings.bookedBy": playerId,
	}).exec();

	const communityCenterIds = communityCenters.map((cc) => cc._id);
	const matches = await Matches.find({
		community_center: { $in: communityCenterIds },
		match_date: req.query.date ? req.query.date : { $exists: true },
	})
		.populate({
			path: "team_A",
			select: "isWinner",
		})
		.populate({
			path: "team_B",
			select: "isWinner matchScore",
		})
		.populate({
			path: "community_center",
			select: "name image address", // Only select these fields
		})
		.exec();

	const teams = await Team.find({
		"players.user": playerId,
	});

	// Extract team IDs
	const teamIds = teams.map((team) => team._id);

	// Find matches where any of these teams is either team_A or team_B
	let tournamentMatchFilter = {
		$or: [{ team_A: { $in: teamIds } }, { team_B: { $in: teamIds } }],
	};

	if (req.query.date) {
		tournamentMatchFilter.match_date = req.query.date;
	} else {
		tournamentMatchFilter.match_date = { $exists: true };
	}
	const tournament_matches = await TournamentMatches.find(tournamentMatchFilter)
		.populate({
			path: "team_A",
			select: "name matchScore isWinner",
		})
		.populate({
			path: "team_B",
			select: "name matchScore isWinner",
		})
		.populate({
			path: "tournament",
			select: "name",
		})
		.populate({
			path: "community_center",
			select: "name image address", // Only select these fields
		})
		.exec();
	let currentCommunityCenterListing = communityCenters.map((community) => ({
		name: community.name,
		_id: community._id,
		image: community.image,
		address: community.address,
	}));
	let communityCenterListing = [
		...matches.map((match) => match.community_center),
		...tournament_matches.map((match) => match.community_center),
		...currentCommunityCenterListing,
	];
	const uniqueCommunityCenters = communityCenterListing.filter(
		(community, index) =>
			index ===
			communityCenterListing.findIndex(
				(other) => community._id.toString() === other._id.toString()
			)
	);
	const matchesIdsForSimple = matches.map((match) => match._id);
	const matchesIdsForTournament = tournament_matches.map((match) => match._id);
	let matchStat = await getMatchStatistics(matchesIdsForSimple);
	let tournamentMatchStat = await getMatchStatisticsTournament(
		matchesIdsForTournament
	);
	const bookings = await addMatchTypeToBookings(
		communityCenters,
		playerId,
		req.query.date
	);

	// Combine match statistics
	let combinedStats = [...matchStat, ...tournamentMatchStat];

	// Combine matches and sort by createdAt in descending order
	let combineMatches = [...matches, ...tournament_matches]
		.sort((a, b) => b.createdAt - a.createdAt)
		.map((match) => ({
			...match.toObject(), // Convert Mongoose document to plain object if needed
			topPlayers:
				combinedStats.find(
					(stat) => stat.matchId.toString() === match._id.toString()
				) || null,
		}));

	// Combine matches and bookings
	let combineMatchesAndBookings = [...combineMatches, ...bookings];

	// Format the final response
	let formattedResponse = uniqueCommunityCenters.map((communityCenter) => {
		// Convert community center ID to string
		let communityCenterId = communityCenter._id.toString();

		// Filter matches based on community center ID
		let filteredMatches = combineMatchesAndBookings.filter((cobm) => {
			// Convert match community center ID to string
			let matchCommunityCenterId = cobm.community_center._id.toString();
			// Return comparison result
			return matchCommunityCenterId === communityCenterId;
		});

		// Return formatted response for this community center
		return {
			name: communityCenter.name,
			_id: communityCenter._id,
			image: communityCenter.image,
			matches: filteredMatches,
		};
	});

	successResponse(res, formattedResponse, statusCodes.OK);
});

const getMatchStatistics = async (matchIds) => {
	try {
		const results = await PlayerMatchStats.aggregate([
			{ $match: { match: { $in: matchIds } } },
			{
				$group: {
					_id: "$match",
					topScorerStat: {
						$max: {
							$cond: [
								{ $ne: ["$pointsScored", null] },
								{ pointsScored: "$pointsScored", player: "$player" },
								null,
							],
						},
					},
					topFieldGoalsAttemptedStat: {
						$max: {
							$cond: [
								{ $ne: ["$fieldGoalsAttempted", null] },
								{
									fieldGoalsAttempted: "$fieldGoalsAttempted",
									player: "$player",
								},
								null,
							],
						},
					},
					topDefensiveReboundsStat: {
						$max: {
							$cond: [
								{ $ne: ["$defensiveRebounds", null] },
								{ defensiveRebounds: "$defensiveRebounds", player: "$player" },
								null,
							],
						},
					},
					topAssistsStat: {
						$max: {
							$cond: [
								{ $ne: ["$assists", null] },
								{ assists: "$assists", player: "$player" },
								null,
							],
						},
					},
				},
			},
			{
				$lookup: {
					from: "users",
					localField: "topScorerStat.player",
					foreignField: "_id",
					as: "topScorerUser",
				},
			},
			{
				$lookup: {
					from: "users",
					localField: "topFieldGoalsAttemptedStat.player",
					foreignField: "_id",
					as: "topFieldGoalsAttemptedUser",
				},
			},
			{
				$lookup: {
					from: "users",
					localField: "topDefensiveReboundsStat.player",
					foreignField: "_id",
					as: "topDefensiveReboundsUser",
				},
			},
			{
				$lookup: {
					from: "users",
					localField: "topAssistsStat.player",
					foreignField: "_id",
					as: "topAssistsUser",
				},
			},
			{
				$project: {
					_id: 1,
					match: "$_id",
					topScorer: {
						pointsScored: "$topScorerStat.pointsScored",
						user: {
							$cond: {
								if: { $gt: ["$topScorerStat.pointsScored", 0] },
								then: {
									_id: { $arrayElemAt: ["$topScorerUser._id", 0] },
									firstName: { $arrayElemAt: ["$topScorerUser.firstName", 0] },
									lastName: { $arrayElemAt: ["$topScorerUser.lastName", 0] },
									displayName: {
										$arrayElemAt: ["$topScorerUser.displayName", 0],
									},
									profilePhoto: {
										$arrayElemAt: ["$topScorerUser.profilePhoto", 0],
									},
									email: { $arrayElemAt: ["$topScorerUser.email", 0] },
									ratings: { $arrayElemAt: ["$topScorerUser.ratings", 0] },
									rating: { $arrayElemAt: ["$topScorerUser.rating", 0] },
								},
								else: null,
							},
						},
					},
					topFieldGoalsAttempted: {
						fieldGoalsAttempted:
							"$topFieldGoalsAttemptedStat.fieldGoalsAttempted",
						user: {
							$cond: {
								if: {
									$gt: ["$topFieldGoalsAttemptedStat.fieldGoalsAttempted", 0],
								},
								then: {
									_id: { $arrayElemAt: ["$topFieldGoalsAttemptedUser._id", 0] },
									firstName: {
										$arrayElemAt: ["$topFieldGoalsAttemptedUser.firstName", 0],
									},
									lastName: {
										$arrayElemAt: ["$topFieldGoalsAttemptedUser.lastName", 0],
									},
									displayName: {
										$arrayElemAt: [
											"$topFieldGoalsAttemptedUser.displayName",
											0,
										],
									},
									profilePhoto: {
										$arrayElemAt: [
											"$topFieldGoalsAttemptedUser.profilePhoto",
											0,
										],
									},
									email: {
										$arrayElemAt: ["$topFieldGoalsAttemptedUser.email", 0],
									},
									ratings: {
										$arrayElemAt: ["$topFieldGoalsAttemptedUser.ratings", 0],
									},
									rating: {
										$arrayElemAt: ["$topFieldGoalsAttemptedUser.rating", 0],
									},
								},
								else: null,
							},
						},
					},
					topDefensiveRebounds: {
						defensiveRebounds: "$topDefensiveReboundsStat.defensiveRebounds",
						user: {
							$cond: {
								if: { $gt: ["$topDefensiveReboundsStat.defensiveRebounds", 0] },
								then: {
									_id: { $arrayElemAt: ["$topDefensiveReboundsUser._id", 0] },
									firstName: {
										$arrayElemAt: ["$topDefensiveReboundsUser.firstName", 0],
									},
									lastName: {
										$arrayElemAt: ["$topDefensiveReboundsUser.lastName", 0],
									},
									displayName: {
										$arrayElemAt: ["$topDefensiveReboundsUser.displayName", 0],
									},
									profilePhoto: {
										$arrayElemAt: ["$topDefensiveReboundsUser.profilePhoto", 0],
									},
									email: {
										$arrayElemAt: ["$topDefensiveReboundsUser.email", 0],
									},
									ratings: {
										$arrayElemAt: ["$topDefensiveReboundsUser.ratings", 0],
									},
									rating: {
										$arrayElemAt: ["$topDefensiveReboundsUser.rating", 0],
									},
								},
								else: null,
							},
						},
					},
					topAssists: {
						assists: "$topAssistsStat.assists",
						user: {
							$cond: {
								if: { $gt: ["$topAssistsStat.assists", 0] },
								then: {
									_id: { $arrayElemAt: ["$topAssistsUser._id", 0] },
									firstName: {
										$arrayElemAt: ["$topAssistsUser.firstName", 0],
									},
									lastName: {
										$arrayElemAt: ["$topAssistsUser.lastName", 0],
									},
									displayName: {
										$arrayElemAt: ["$topAssistsUser.displayName", 0],
									},
									profilePhoto: {
										$arrayElemAt: ["$topAssistsUser.profilePhoto", 0],
									},
									email: {
										$arrayElemAt: ["$topAssistsUser.email", 0],
									},
									ratings: {
										$arrayElemAt: ["$topAssistsUser.ratings", 0],
									},
									rating: {
										$arrayElemAt: ["$topAssistsUser.rating", 0],
									},
								},
								else: null,
							},
						},
					},
				},
			},
		]);

		// Ensure all matches have the necessary fields, including null values if no data exists
		const formattedResults = results.map((result) => ({
			matchId: result._id,
			topScorer:
				result.topScorer.pointsScored > 0
					? {
							pointsScored: result.topScorer.pointsScored,
							user: result.topScorer.user,
					  }
					: null,
			topFieldGoalsAttempted:
				result.topFieldGoalsAttempted.fieldGoalsAttempted > 0
					? {
							fieldGoalsAttempted:
								result.topFieldGoalsAttempted.fieldGoalsAttempted,
							user: result.topFieldGoalsAttempted.user,
					  }
					: null,
			topDefensiveRebounds:
				result.topDefensiveRebounds.defensiveRebounds > 0
					? {
							defensiveRebounds: result.topDefensiveRebounds.defensiveRebounds,
							user: result.topDefensiveRebounds.user,
					  }
					: null,
			topAssists:
				result.topAssists.assists > 0
					? {
							assists: result.topAssists.assists,
							user: result.topAssists.user,
					  }
					: null,
		}));

		return formattedResults;
	} catch (error) {
		console.error("Error fetching match statistics:", error);
		throw new Error("Unable to fetch match statistics");
	}
};

const getMatchStatisticsTournament = async (matchIds) => {
	try {
		const results = await TournamentPlayerMatchStat.aggregate([
			{ $match: { match: { $in: matchIds } } },
			{
				$group: {
					_id: "$match",
					topScorerStat: {
						$max: {
							$cond: [
								{ $ne: ["$pointsScored", null] },
								{ pointsScored: "$pointsScored", player: "$player" },
								null,
							],
						},
					},
					topFieldGoalsAttemptedStat: {
						$max: {
							$cond: [
								{ $ne: ["$fieldGoalsAttempted", null] },
								{
									fieldGoalsAttempted: "$fieldGoalsAttempted",
									player: "$player",
								},
								null,
							],
						},
					},
					topDefensiveReboundsStat: {
						$max: {
							$cond: [
								{ $ne: ["$defensiveRebounds", null] },
								{ defensiveRebounds: "$defensiveRebounds", player: "$player" },
								null,
							],
						},
					},
					topAssistsStat: {
						$max: {
							$cond: [
								{ $ne: ["$assists", null] },
								{ assists: "$assists", player: "$player" },
								null,
							],
						},
					},
				},
			},
			{
				$lookup: {
					from: "users",
					localField: "topScorerStat.player",
					foreignField: "_id",
					as: "topScorerUser",
				},
			},
			{
				$lookup: {
					from: "users",
					localField: "topFieldGoalsAttemptedStat.player",
					foreignField: "_id",
					as: "topFieldGoalsAttemptedUser",
				},
			},
			{
				$lookup: {
					from: "users",
					localField: "topDefensiveReboundsStat.player",
					foreignField: "_id",
					as: "topDefensiveReboundsUser",
				},
			},
			{
				$lookup: {
					from: "users",
					localField: "topAssistsStat.player",
					foreignField: "_id",
					as: "topAssistsUser",
				},
			},
			{
				$project: {
					_id: 1,
					match: "$_id",
					topScorer: {
						pointsScored: "$topScorerStat.pointsScored",
						user: {
							$cond: {
								if: { $gt: ["$topScorerStat.pointsScored", 0] },
								then: {
									_id: { $arrayElemAt: ["$topScorerUser._id", 0] },
									firstName: { $arrayElemAt: ["$topScorerUser.firstName", 0] },
									lastName: { $arrayElemAt: ["$topScorerUser.lastName", 0] },
									displayName: {
										$arrayElemAt: ["$topScorerUser.displayName", 0],
									},
									profilePhoto: {
										$arrayElemAt: ["$topScorerUser.profilePhoto", 0],
									},
									email: { $arrayElemAt: ["$topScorerUser.email", 0] },
									ratings: { $arrayElemAt: ["$topScorerUser.ratings", 0] },
									rating: { $arrayElemAt: ["$topScorerUser.rating", 0] },
								},
								else: null,
							},
						},
					},
					topFieldGoalsAttempted: {
						fieldGoalsAttempted:
							"$topFieldGoalsAttemptedStat.fieldGoalsAttempted",
						user: {
							$cond: {
								if: {
									$gt: ["$topFieldGoalsAttemptedStat.fieldGoalsAttempted", 0],
								},
								then: {
									_id: { $arrayElemAt: ["$topFieldGoalsAttemptedUser._id", 0] },
									firstName: {
										$arrayElemAt: ["$topFieldGoalsAttemptedUser.firstName", 0],
									},
									lastName: {
										$arrayElemAt: ["$topFieldGoalsAttemptedUser.lastName", 0],
									},
									displayName: {
										$arrayElemAt: [
											"$topFieldGoalsAttemptedUser.displayName",
											0,
										],
									},
									profilePhoto: {
										$arrayElemAt: [
											"$topFieldGoalsAttemptedUser.profilePhoto",
											0,
										],
									},
									email: {
										$arrayElemAt: ["$topFieldGoalsAttemptedUser.email", 0],
									},
									ratings: {
										$arrayElemAt: ["$topFieldGoalsAttemptedUser.ratings", 0],
									},
									rating: {
										$arrayElemAt: ["$topFieldGoalsAttemptedUser.rating", 0],
									},
								},
								else: null,
							},
						},
					},
					topDefensiveRebounds: {
						defensiveRebounds: "$topDefensiveReboundsStat.defensiveRebounds",
						user: {
							$cond: {
								if: { $gt: ["$topDefensiveReboundsStat.defensiveRebounds", 0] },
								then: {
									_id: { $arrayElemAt: ["$topDefensiveReboundsUser._id", 0] },
									firstName: {
										$arrayElemAt: ["$topDefensiveReboundsUser.firstName", 0],
									},
									lastName: {
										$arrayElemAt: ["$topDefensiveReboundsUser.lastName", 0],
									},
									displayName: {
										$arrayElemAt: ["$topDefensiveReboundsUser.displayName", 0],
									},
									profilePhoto: {
										$arrayElemAt: ["$topDefensiveReboundsUser.profilePhoto", 0],
									},
									email: {
										$arrayElemAt: ["$topDefensiveReboundsUser.email", 0],
									},
									ratings: {
										$arrayElemAt: ["$topDefensiveReboundsUser.ratings", 0],
									},
									rating: {
										$arrayElemAt: ["$topDefensiveReboundsUser.rating", 0],
									},
								},
								else: null,
							},
						},
					},
					topAssists: {
						assists: "$topAssistsStat.assists",
						user: {
							$cond: {
								if: { $gt: ["$topAssistsStat.assists", 0] },
								then: {
									_id: { $arrayElemAt: ["$topAssistsUser._id", 0] },
									firstName: {
										$arrayElemAt: ["$topAssistsUser.firstName", 0],
									},
									lastName: {
										$arrayElemAt: ["$topAssistsUser.lastName", 0],
									},
									displayName: {
										$arrayElemAt: ["$topAssistsUser.displayName", 0],
									},
									profilePhoto: {
										$arrayElemAt: ["$topAssistsUser.profilePhoto", 0],
									},
									email: {
										$arrayElemAt: ["$topAssistsUser.email", 0],
									},
									ratings: {
										$arrayElemAt: ["$topAssistsUser.ratings", 0],
									},
									rating: {
										$arrayElemAt: ["$topAssistsUser.rating", 0],
									},
								},
								else: null,
							},
						},
					},
				},
			},
		]);

		// Ensure all matches have the necessary fields, including null values if no data exists
		const formattedResults = results.map((result) => ({
			matchId: result._id,
			topScorer:
				result.topScorer.pointsScored > 0
					? {
							pointsScored: result.topScorer.pointsScored,
							user: result.topScorer.user,
					  }
					: null,
			topFieldGoalsAttempted:
				result.topFieldGoalsAttempted.fieldGoalsAttempted > 0
					? {
							fieldGoalsAttempted:
								result.topFieldGoalsAttempted.fieldGoalsAttempted,
							user: result.topFieldGoalsAttempted.user,
					  }
					: null,
			topDefensiveRebounds:
				result.topDefensiveRebounds.defensiveRebounds > 0
					? {
							defensiveRebounds: result.topDefensiveRebounds.defensiveRebounds,
							user: result.topDefensiveRebounds.user,
					  }
					: null,
			topAssists:
				result.topAssists.assists > 0
					? {
							assists: result.topAssists.assists,
							user: result.topAssists.user,
					  }
					: null,
		}));

		return formattedResults;
	} catch (error) {
		console.error("Error fetching match statistics:", error);
		throw new Error("Unable to fetch match statistics");
	}
};

const addMatchTypeToBookings = (communityCenters, playerId, bookingDate) => {
	// Convert bookingDate to a Date object if provided
	const bookingDateObj = bookingDate ? new Date(bookingDate) : null;

	return communityCenters.flatMap((center) => {
		return center.communityTimeSlots.flatMap((slot) =>
			slot.slots.flatMap((slotDetails) => {
				// Check if there is any pending booking for the given player
				const hasPendingBooking = slotDetails.bookings.some((booking) => {
					const bookingDateInDb = new Date(booking.bookingDate);
					return (
						booking.status === "Pending" &&
						(!bookingDateObj ||
							bookingDateInDb.getTime() === bookingDateObj.getTime())
					);
				});

				// If there is a pending booking, include the slot with all its bookings
				if (hasPendingBooking) {
					return {
						community_center: { _id: center._id }, // Use center._id for the community center
						startTime: slotDetails.startTime, // Add startTime
						endTime: slotDetails.endTime, // Add endTime
						match_type: "Bookings", // Add match_type to each booking
						bookings: slotDetails.bookings.filter((_booking) => {
							const bookingDateInDb = new Date(_booking.bookingDate);
							return (
								!bookingDateObj ||
								bookingDateInDb.getTime() === bookingDateObj.getTime()
							);
						}), // Add the entire bookings array
					};
				}

				// Otherwise, return an empty array
				return [];
			})
		);
	});
};

const addMatchTypeToBookingsAdminSide = (communityCenters, bookingDate) => {
	// Convert bookingDate to a Date object if provided
	const bookingDateObj = bookingDate ? new Date(bookingDate) : null;

	return communityCenters.flatMap((center) => {
		return center.communityTimeSlots.flatMap((slot) =>
			slot.slots.flatMap((slotDetails) => {
				// Check if there is any pending booking
				const hasPendingBooking = slotDetails.bookings.some((booking) => {
					const bookingDateInDb = new Date(booking.bookingDate);
					return (
						booking.status === "Pending" &&
						(!bookingDateObj ||
							bookingDateInDb.getTime() === bookingDateObj.getTime())
					);
				});

				// If there is a pending booking, include the slot with all its bookings
				if (hasPendingBooking) {
					return {
						community_center: { _id: center._id }, // Use center._id for the community center
						startTime: slotDetails.startTime, // Add startTime
						endTime: slotDetails.endTime, // Add endTime
						match_type: "Bookings", // Add match_type to each booking
						bookings: slotDetails.bookings.filter((_booking) => {
							const bookingDateInDb = new Date(_booking.bookingDate);
							return (
								!bookingDateObj ||
								bookingDateInDb.getTime() === bookingDateObj.getTime()
							);
						}), // Add the entire bookings array
					};
				}

				// Otherwise, return an empty array
				return [];
			})
		);
	});
};

// @desc    Get communities and tournaments list
// @route   GET /api/v1/matches/admin/scoreBoard
// @access  Private
const scoreBoardAdminSide = asyncHandler(async (req, res) => {
	// Fetch community centers
	const communityCenters = await CommunityCenter.find({}).exec();

	const communityCenterIds = communityCenters.map((cc) => cc._id);
	const matches = await Matches.find({
		community_center: { $in: communityCenterIds },
		match_date: req.query.date ? req.query.date : { $exists: true },
	})
		.populate({
			path: "team_A",
			select: "isWinner",
		})
		.populate({
			path: "team_B",
			select: "isWinner matchScore",
		})
		.populate({
			path: "community_center",
			select: "name image address", // Only select these fields
		})
		.exec();
	const tournament_matches = await TournamentMatches.find({
		community_center: { $in: communityCenterIds },
		match_date: req.query.date ? req.query.date : { $exists: true },
	})
		.populate({
			path: "team_A",
			select: "name matchScore isWinner",
		})
		.populate({
			path: "team_B",
			select: "name matchScore isWinner",
		})
		.populate({
			path: "tournament",
			select: "name",
		})
		.populate({
			path: "community_center",
			select: "name image address", // Only select these fields
		})
		.exec();
	let currentCommunityCenterListing = communityCenters.map((community) => ({
		name: community.name,
		_id: community._id,
		image: community.image,
		address: community.address,
	}));
	let communityCenterListing = [
		...matches.map((match) => match.community_center),
		...tournament_matches.map((match) => match.community_center),
		...currentCommunityCenterListing,
	];
	const uniqueCommunityCenters = communityCenterListing.filter(
		(community, index) =>
			index ===
			communityCenterListing.findIndex(
				(other) => community._id.toString() === other._id.toString()
			)
	);

	const matchesIdsForSimple = matches.map((match) => match._id);
	const matchesIdsForTournament = tournament_matches.map((match) => match._id);
	let matchStat = await getMatchStatistics(matchesIdsForSimple);
	let tournamentMatchStat = await getMatchStatisticsTournament(
		matchesIdsForTournament
	);
	const bookings = await addMatchTypeToBookingsAdminSide(
		communityCenters,
		req.query.date
	);

	// console.log("Unique", bookings);

	// Combine match statistics
	let combinedStats = [...matchStat, ...tournamentMatchStat];

	// Combine matches and sort by createdAt in descending order
	let combineMatches = [...matches, ...tournament_matches]
		.sort((a, b) => b.createdAt - a.createdAt)
		.map((match) => ({
			...match.toObject(), // Convert Mongoose document to plain object if needed
			topPlayers:
				combinedStats.find(
					(stat) => stat.matchId.toString() === match._id.toString()
				) || null,
		}));

	// Combine matches and bookings
	let combineMatchesAndBookings = [...combineMatches, ...bookings];

	// Format the final response
	let formattedResponse = uniqueCommunityCenters.map((communityCenter) => {
		// Convert community center ID to string
		let communityCenterId = communityCenter._id.toString();

		// Filter matches based on community center ID
		let filteredMatches = combineMatchesAndBookings.filter((cobm) => {
			// Convert match community center ID to string
			let matchCommunityCenterId = cobm.community_center._id.toString();
			// Return comparison result
			return matchCommunityCenterId === communityCenterId;
		});

		// Return formatted response for this community center
		return {
			name: communityCenter.name,
			_id: communityCenter._id,
			image: communityCenter.image,
			matches: filteredMatches,
		};
	});

	successResponse(res, formattedResponse, statusCodes.OK);
});

// @desc    Get Match Detail with stat
// @route   GET /api/v1/matches/matchDetail?matchId=${matchId}
// @access  Private
const getMatchDetailsWithStats = async (req, res) => {
	const { matchId } = req.query;

	try {
		// Try to find the match in the Matches collection
		let match = await Matches.findById(matchId)
			.populate({
				path: "community_center",
				select: "name image",
			})
			.populate({
				path: "team_A.players.user",
				select: "firstName lastName profilePhoto email address ratings rating",
			})
			.populate({
				path: "team_B.players.user",
				select: "firstName lastName profilePhoto email address ratings rating",
			})
			.exec();

		if (match) {
			// Match found in Matches collection, fetch player stats
			const playerStats = await PlayerMatchStats.find({ match: matchId })
				.populate("player", "firstName lastName profilePhoto email address")
				.exec();

			// Combine match details with player stats
			const matchDetails = match.toObject();
			matchDetails.team_A.players = matchDetails.team_A.players.map(
				(player) => {
					const stat = playerStats.find(
						(stat) => stat.player._id.toString() === player.user._id.toString()
					);
					player.stats = stat ? stat.toObject() : null;
					if (player.stats) {
						delete player.stats.player; // Remove player field from stats
					}
					return player;
				}
			);
			matchDetails.team_B.players = matchDetails.team_B.players.map(
				(player) => {
					const stat = playerStats.find(
						(stat) => stat.player._id.toString() === player.user._id.toString()
					);
					player.stats = stat ? stat.toObject() : null;
					if (player.stats) {
						delete player.stats.player; // Remove player field from stats
					}
					return player;
				}
			);

			return successResponse(res, matchDetails, statusCodes.OK);
		}

		// Match not found in Matches collection, try TournamentMatches collection
		match = await TournamentMatches.findById(matchId)
			.populate({
				path: "community_center",
				select: "name image",
			})
			.populate({
				path: "tournament",
				select:
					"-_location -tournament_matches -tournament_bookings -tournament_team",
			})
			.populate({
				path: "team_A",
				populate: {
					path: "players.user",
					select:
						"firstName lastName profilePhoto email address ratings rating",
				},
			})
			.populate({
				path: "team_B",
				populate: {
					path: "players.user",
					select:
						"firstName lastName profilePhoto email address ratings rating",
				},
			})
			.exec();

		if (match) {
			// Match found in TournamentMatches collection, fetch player stats
			const playerStats = await TournamentPlayerMatchStat.find({
				match: matchId,
			})
				.populate(
					"player",
					"firstName lastName profilePhoto email address ratings rating"
				)
				.exec();

			// Combine match details with player stats
			const matchDetails = match.toObject();
			matchDetails.team_A.players = matchDetails.team_A.players.map(
				(player) => {
					const stat = playerStats.find(
						(stat) => stat.player._id.toString() === player.user._id.toString()
					);
					player.stats = stat ? stat.toObject() : null;
					if (player.stats) {
						delete player.stats.player; // Remove player field from stats
					}
					return player;
				}
			);
			matchDetails.team_B.players = matchDetails.team_B.players.map(
				(player) => {
					const stat = playerStats.find(
						(stat) => stat.player._id.toString() === player.user._id.toString()
					);
					player.stats = stat ? stat.toObject() : null;
					if (player.stats) {
						delete player.stats.player; // Remove player field from stats
					}
					return player;
				}
			);

			return successResponse(res, matchDetails, statusCodes.OK);
		}

		// Match not found in either collection
		return errorResponse(res, "Match not found.", statusCodes.NOT_FOUND);
	} catch (error) {
		console.error(error);
		return errorResponse(res, error.message, statusCodes.INTERNAL_SERVER_ERROR);
	}
};

// @desc    Get Community centers in which the player has played matches
// @route   GET /api/v1/matches/communityCentersList
// @access  Private

const communityCenterListingBasedOnUser = asyncHandler(async (req, res) => {
	try {
		const playerId = req.query.playerId;
		if (!playerId) {
			return errorResponse(
				res,
				"Player id is required.",
				statusCodes.BAD_REQUEST
			);
		}
		const player = new mongoose.Types.ObjectId(playerId);

		// Step 1: Aggregate to get community centers from tournaments and matches
		const teams = await Team.aggregate([
			{ $match: { "players.user": player } },
			{
				$lookup: {
					from: "tournaments",
					localField: "tournament",
					foreignField: "_id",
					as: "tournament",
				},
			},
			{ $unwind: "$tournament" },
			{
				$lookup: {
					from: "communitycenters",
					localField: "tournament.community_center",
					foreignField: "_id",
					as: "community_center",
				},
			},
			{ $unwind: "$community_center" },
			{
				$project: {
					_id: "$community_center._id",
					name: "$community_center.name",
					image: "$community_center.image",
				},
			},
		]);

		// Step 2: Find community centers from matches
		const matches = await Matches.aggregate([
			{
				$match: {
					$or: [
						{ "team_A.players.user": player },
						{ "team_B.players.user": player },
					],
				},
			},
			{
				$lookup: {
					from: "communitycenters",
					localField: "community_center",
					foreignField: "_id",
					as: "community_center",
				},
			},
			{ $unwind: "$community_center" },
			{
				$project: {
					_id: "$community_center._id",
					name: "$community_center.name",
					image: "$community_center.image",
				},
			},
		]);

		// Combine and remove duplicates
		const allCommunityCenters = [...teams, ...matches];
		const uniqueCommunityCenters = allCommunityCenters.filter(
			(center, index, self) =>
				index ===
				self.findIndex((c) => c._id.toString() === center._id.toString())
		);

		successResponse(res, uniqueCommunityCenters, statusCodes.OK);
	} catch (error) {
		errorResponse(res, error.message, statusCodes.INTERNAL_SERVER_ERROR);
	}
});

// player overall stats based on filter
const getPlayerMatchStatsWithFilter = asyncHandler(async (req, res) => {
	try {
		if (!req.query.userId) {
			errorResponse(res, "User id is required", statusCodes.BAD_GATEWAY);
		}
		// Fetch community centers
		let playerId = new mongoose.Types.ObjectId(req.query.userId);
		const matches = await Matches.find({
			$or: [
				{ "team_A.players.user": playerId },
				{ "team_B.players.user": playerId },
			],
			community_center: req.query.community_center
				? req.query.community_center
				: { $exists: true },
			match_date: req.query.date ? req.query.date : { $exists: true },
			status: MatchStatus.FINISHED,
		})
			.populate({
				path: "team_A",
				select: "isWinner name matchScore",
			})
			.populate({
				path: "team_B",
				select: "isWinner matchScore",
			})
			.populate({
				path: "community_center",
				select: "name image address", // Only select these fields
			})
			.exec();
		const simpleMatchesIds = matches.map((match) => match._id);
		const teams = await Team.find({
			"players.user": playerId,
		});

		// Extract team IDs
		const teamIds = teams.map((team) => team._id);

		// Find matches where any of these teams is either team_A or team_B
		let tournamentMatchFilter = {
			$or: [{ team_A: { $in: teamIds } }, { team_B: { $in: teamIds } }],
			community_center: req.query.community_center
				? req.query.community_center
				: { $exists: true },
			status: MatchStatus.FINISHED,
		};

		if (req.query.date) {
			tournamentMatchFilter.match_date = req.query.date;
		} else {
			tournamentMatchFilter.match_date = { $exists: true };
		}
		const tournament_matches = await TournamentMatches.find(
			tournamentMatchFilter
		)
			.populate({
				path: "team_A",
				select: "name matchScore isWinner",
			})
			.populate({
				path: "team_B",
				select: "name matchScore isWinner",
			})
			.populate({
				path: "tournament",
				select: "name",
			})
			.populate({
				path: "community_center",
				select: "name image address", // Only select these fields
			})
			.exec();
		const TournamentMatchesIds = tournament_matches.map((match) => match._id);
		const SimpleMatchStats = await getMatchStatisticsSimple(
			simpleMatchesIds,
			playerId
		);

		const TournamentMatchStats = await getMatchStatisticsTournament1(
			TournamentMatchesIds,
			playerId
		);

		let combinedStats = [...SimpleMatchStats, ...TournamentMatchStats];
		let combinedMatches = [...matches, ...tournament_matches];
		let totalStatistics = calculateStatsSumAsArray(combinedStats);
		let totalWins = 0;
		let totalLosses = 0;
		let totalRankingPoints = 0;

		const formattedMatches = combinedMatches.map((match) => {
			let playerData = {
				team: null,
				stats: null,
				isWinner: false,
				matchScore: 0,
				opponentScore: 0,
			};
			let isWinner = false;

			// Find the player in team_A
			const teamAPlayer =
				match.team_A.players &&
				match.team_A.players.find(
					(player) => player.user.toString() === playerId.toString()
				);
			if (teamAPlayer) {
				isWinner = match.team_A.isWinner;
				const playerStats = combinedStats.find(
					(stat) =>
						stat.player.toString() === playerId.toString() &&
						stat.match.toString() === match._id.toString()
				);
				teamAPlayer.stats = playerStats || {
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
				teamAPlayer.isWinner = isWinner;
				const rankingPoints = calculatePlayerRanking(
					playerStats,
					teamAPlayer.isWinner
				);
				totalRankingPoints += rankingPoints ? rankingPoints : 0;
				playerData = {
					team: "A",
					stats: playerStats,
					isWinner: isWinner,
					rankingPoints: rankingPoints ? rankingPoints : 0,
					matchScore: match.team_A.matchScore,
					opponentScore: match.team_B.matchScore,
				};
			}

			// Find the player in team_B
			const teamBPlayer =
				match.team_B.players &&
				match.team_B.players.find(
					(player) => player.user.toString() === playerId.toString()
				);
			if (teamBPlayer) {
				isWinner = match.team_B.isWinner;
				const playerStats = combinedStats.find(
					(stat) =>
						stat.player.toString() === playerId.toString() &&
						stat.match.toString() === match._id.toString()
				);
				teamBPlayer.stats = playerStats || {
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
				teamBPlayer.isWinner = isWinner;
				const rankingPoints = calculatePlayerRanking(
					playerStats,
					teamBPlayer.isWinner
				);
				totalRankingPoints += rankingPoints ? rankingPoints : 0;
				playerData = {
					team: "B",
					stats: playerStats,
					isWinner: isWinner,
					rankingPoints: rankingPoints ? rankingPoints : 0,
					matchScore: match.team_B.matchScore,
					opponentScore: match.team_A.matchScore,
				};
			}

			// Update win/loss count
			if (isWinner) {
				totalWins++;
			} else {
				totalLosses++;
			}

			return {
				...match.toObject(), // Convert mongoose document to plain object
				playerData: playerData,
				team_A: {
					name: match.team_A.name,
					matchScore: match.team_A.matchScore,
					isWinner: match.team_A.isWinner,
				},
				team_B: {
					name: match.team_B.name,
					matchScore: match.team_B.matchScore,
					isWinner: match.team_B.isWinner,
				},
			};
		});

		totalStatistics.totalRankingPoints = totalRankingPoints;
		let formattedResponse = {
			matches: formattedMatches,
			totalWins,
			totalLosses,
			totalMatches: combinedMatches.length,
			totalStatistics,
		};

		successResponse(res, formattedResponse, statusCodes.OK);
	} catch (error) {
		console.log(error);
		errorResponse(res, error, statusCodes.INTERNAL_SERVER_ERROR);
	}
});

export {
	createMatch,
	getMatchesBasedonUser,
	getMatchesBasedonCommunity,
	changeMatchStatus,
	getAllMatchesWithinAdmin,
	addOrUpdatePlayerMatchStat,
	getPlayerOverallStats,
	getMatchesBasedonBookingId,
	uploadHighlights,
	scoreBoard,
	scoreBoardAdminSide,
	getMatchDetailsWithStats,
	communityCenterListingBasedOnUser,
	getPlayerMatchStatsWithFilter,
};
