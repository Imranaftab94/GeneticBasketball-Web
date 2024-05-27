import asyncHandler from "express-async-handler";
import { User } from "../models/user.model.js";
import { statusCodes } from "../constants/statusCodes.constant.js";
import { errorResponse, successResponse } from "../helpers/response.helper.js";
import { createTournamentSchema } from "../validators/tournament.validator.js";
import { CommunityCenter } from "../models/community.model.js";
import { Tournament } from "../models/tournament.model.js";

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

export { createTournament };
