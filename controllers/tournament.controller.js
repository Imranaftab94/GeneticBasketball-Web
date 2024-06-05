import asyncHandler from "express-async-handler";
import { User } from "../models/user.model.js";
import { statusCodes } from "../constants/statusCodes.constant.js";
import { errorResponse, successResponse } from "../helpers/response.helper.js";
import {
  createTournamentSchema,
  startTournamentValidationSchema,
  tournamentBookingValidationSchema,
  tournamentMatchSchemaValidator,
} from "../validators/tournament.validator.js";
import { CommunityCenter } from "../models/community.model.js";
import { Tournament } from "../models/tournament.model.js";
import { TournamentBooking } from "../models/tournament_booking.model.js";
import {
  PLAYER_TOURNAMENT_BOOKING_STATUS,
  TOURNAMENT_STATUS,
} from "../constants/match-status.constant.js";
import { updateTournamentBookingStatus } from "../services/event-loop-functions.service.js";
import mongoose from "mongoose";
import { Team } from "../models/tournament_team.model.js";
import { TournamentMatches } from "../models/tournament_match.model.js";

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
    const matches = await TournamentMatches.find({ tournament: tournamentId })
      .populate({
        path: "team_A",
        select: "_id name players matchScore isWinner", // Only select these fields
      })
      .populate({
        path: "team_B",
        select: "_id name players matchScore isWinner", // Only select these fields
      })
      .populate({
        path: "community_center",
        select: "_id name image address", // Only select these fields
      })
      .populate({
        path: "tournament",
        select: "_id name prize status", // Only select these fields
      })
      .exec();

    successResponse(res, matches, statusCodes.OK);
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
    const { tournamentId } = req.query;
    if (!tournamentId) {
      errorResponse(res, "Tournament id is required", statusCodes.BAD_REQUEST);
    }
    const findTournament = await Tournament.findById(tournamentId).select("-_location -tournament_matches -tournament_bookings -tournament_team")
    .populate({
      path: "community_center",
      select: "name image address", // Only select these fields
    });
    const bookings = await TournamentBooking.find({
      tournament: tournamentId,
      status: PLAYER_TOURNAMENT_BOOKING_STATUS.BOOKED,
    });

    const data = {
      tournament: findTournament,
      bookings
    }
    successResponse(res, data, statusCodes.OK);
  } catch (error) {
    errorResponse(res, err.message, statusCodes.INTERNAL_SERVER_ERROR);
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
  getBookingsByTournament
};
