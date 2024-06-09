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
import { updateTournamentMatchWinner } from "../services/matches.service.js";

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

    const { id, status } = req.body;
    if (status === MatchStatus.FINISHED) {
      let match = await updateTournamentMatchWinner(id);
      successResponse(res, match, statusCodes.OK);
    } else {
      // Find the match by ID
      const match = await TournamentMatches.findById(id);

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
    const playerRankings = await TournamentPlayerMatchStat.aggregate([
      {
        $match: { tournament: new mongoose.Types.ObjectId(tournamentId) }, // Match specific tournament
      },
      {
        $group: {
          _id: "$player",
          totalPoints: { $sum: "$pointsScored" },
        },
      },
      {
        $sort: { totalPoints: -1 },
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
          totalPoints: ranking.totalPoints,
        };
      })
    );

    successResponse(res, rankedPlayers, statusCodes.OK);
  } catch (err) {
    console.error("Error getting player rankings within tournament:", err);
    throw err;
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
};
