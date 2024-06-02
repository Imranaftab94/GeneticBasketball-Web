import asyncHandler from "express-async-handler";
import { User } from "../models/user.model.js";
import { statusCodes } from "../constants/statusCodes.constant.js";
import { errorResponse, successResponse } from "../helpers/response.helper.js";
import { createTournamentSchema, tournamentBookingValidationSchema } from "../validators/tournament.validator.js";
import { CommunityCenter } from "../models/community.model.js";
import { Tournament } from "../models/tournament.model.js";
import { TournamentBooking } from "../models/tournament_booking.model.js";

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
    // Check if the player already has a booking for the tournament
    const existingBooking = await TournamentBooking.findOne({ player, tournament });
    if (existingBooking) {
      return errorResponse(res, "Player already has a booking for this tournament", statusCodes.BAD_REQUEST);
    }

    // Fetch the player and tournament from the database
    const foundPlayer = await User.findById(player);
    const foundTournament = await Tournament.findById(tournament);

    if (!foundPlayer || !foundTournament) {
      return errorResponse(res, "Player or tournament not found", statusCodes.NOT_FOUND);
    }

    // Check if the player has enough coins
    if (foundPlayer.coins < foundTournament.entryFee) {
      return errorResponse(res, "Insufficient coins to enter the tournament", statusCodes.BAD_REQUEST);
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
    errorResponse(res, "An error occurred while creating the tournament booking", statusCodes.INTERNAL_SERVER_ERROR);
  }
});

export { createTournament, listTournaments, addTournamentBooking };
