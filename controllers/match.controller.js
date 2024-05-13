import asyncHandler from "express-async-handler";
import { User } from "../models/user.model.js";
import { statusCodes } from "../constants/statusCodes.constant.js";
import { errorResponse, successResponse } from "../helpers/response.helper.js";
import { matchSchemaValidator, updateMatchStatusSchema } from "../validators/match.validator.js";
import { CommunityCenter } from "../models/community.model.js";
import { Matches } from "../models/matches.model.js";
import {
  modifyBookingStatus,
  sendMatchStartPaymentInfo,
} from "../services/event-loop-functions.service.js";
import mongoose from "mongoose";
import { MatchStatus } from "../constants/match-status.constant.js";

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
    const missingTeamAUsers = await validateTeamUsers(team_A);
    if (missingTeamAUsers.length > 0) {
      return errorResponse(
        res,
        `Users not found in Team A: ${missingTeamAUsers.join(", ")}`,
        statusCodes.NOT_FOUND
      );
    }

    // Check if all users in team_B exist
    const missingTeamBUsers = await validateTeamUsers(team_B);
    if (missingTeamBUsers.length > 0) {
      return errorResponse(
        res,
        `Users not found in Team B: ${missingTeamBUsers.join(", ")}`,
        statusCodes.NOT_FOUND
      );
    }

    // Check that no user is in both Team A and Team B
    const teamAUsers = new Set(team_A.map((player) => player.user.toString()));
    const teamBUsers = new Set(team_B.map((player) => player.user.toString()));
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
      created_by: req.user._id,
    });
    const savedMatch = await match.save();
    setTimeout(() => {
      let team = [...team_A, ...team_B];
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
              { "team_A.user": req.user._id },
              { "team_B.user": req.user._id },
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
                { $map: { input: "$team_A", as: "a", in: "$$a.bookingId" } },
                { $map: { input: "$team_B", as: "b", in: "$$b.bookingId" } },
              ],
            },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "team_A.user",
            foreignField: "_id",
            as: "team_A_users",
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "team_B.user",
            foreignField: "_id",
            as: "team_B_users",
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
            match_score: 1,
            team_A: {
              $map: {
                input: "$team_A",
                as: "player",
                in: {
                  user: "$$player.user",
                  bookingId: "$$player.bookingId",
                  player_score: "$$player.player_score",
                  firstName: {
                    $arrayElemAt: [
                      "$team_A_users.firstName",
                      { $indexOfArray: ["$team_A_users._id", "$$player.user"] }
                    ],
                  },
                  lastName: {
                    $arrayElemAt: [
                      "$team_A_users.lastName",
                      { $indexOfArray: ["$team_A_users._id", "$$player.user"] }
                    ],
                  },
                  email: {
                    $arrayElemAt: [
                      "$team_A_users.email",
                      { $indexOfArray: ["$team_A_users._id", "$$player.user"] }
                    ],
                  },
                  profilePhoto: {
                    $arrayElemAt: [
                      "$team_A_users.profilePhoto",
                      { $indexOfArray: ["$team_A_users._id", "$$player.user"] }
                    ],
                  },
                },
              },
            },
            team_B: {
              $map: {
                input: "$team_B",
                as: "player",
                in: {
                  user: "$$player.user",
                  bookingId: "$$player.bookingId",
                  player_score: "$$player.player_score",
                  firstName: {
                    $arrayElemAt: [
                      "$team_B_users.firstName",
                      { $indexOfArray: ["$team_B_users._id", "$$player.user"] }
                    ],
                  },
                  lastName: {
                    $arrayElemAt: [
                      "$team_B_users.lastName",
                      { $indexOfArray: ["$team_B_users._id", "$$player.user"] }
                    ],
                  },
                  email: {
                    $arrayElemAt: [
                      "$team_B_users.email",
                      { $indexOfArray: ["$team_B_users._id", "$$player.user"] }
                    ],
                  },
                  profilePhoto: {
                    $arrayElemAt: [
                      "$team_B_users.profilePhoto",
                      { $indexOfArray: ["$team_B_users._id", "$$player.user"] }
                    ],
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
            community_center: new mongoose.Types.ObjectId(req.query.community_center),
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
                { $map: { input: "$team_A", as: "a", in: "$$a.bookingId" } },
                { $map: { input: "$team_B", as: "b", in: "$$b.bookingId" } },
              ],
            },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "team_A.user",
            foreignField: "_id",
            as: "team_A_users",
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "team_B.user",
            foreignField: "_id",
            as: "team_B_users",
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
            match_score: 1,
            team_A: {
              $map: {
                input: "$team_A",
                as: "player",
                in: {
                  user: "$$player.user",
                  bookingId: "$$player.bookingId",
                  player_score: "$$player.player_score",
                  firstName: {
                    $arrayElemAt: [
                      "$team_A_users.firstName",
                      { $indexOfArray: ["$team_A_users._id", "$$player.user"] }
                    ],
                  },
                  lastName: {
                    $arrayElemAt: [
                      "$team_A_users.lastName",
                      { $indexOfArray: ["$team_A_users._id", "$$player.user"] }
                    ],
                  },
                  email: {
                    $arrayElemAt: [
                      "$team_A_users.email",
                      { $indexOfArray: ["$team_A_users._id", "$$player.user"] }
                    ],
                  },
                  profilePhoto: {
                    $arrayElemAt: [
                      "$team_A_users.profilePhoto",
                      { $indexOfArray: ["$team_A_users._id", "$$player.user"] }
                    ],
                  },
                },
              },
            },
            team_B: {
              $map: {
                input: "$team_B",
                as: "player",
                in: {
                  user: "$$player.user",
                  bookingId: "$$player.bookingId",
                  player_score: "$$player.player_score",
                  firstName: {
                    $arrayElemAt: [
                      "$team_B_users.firstName",
                      { $indexOfArray: ["$team_B_users._id", "$$player.user"] }
                    ],
                  },
                  lastName: {
                    $arrayElemAt: [
                      "$team_B_users.lastName",
                      { $indexOfArray: ["$team_B_users._id", "$$player.user"] }
                    ],
                  },
                  email: {
                    $arrayElemAt: [
                      "$team_B_users.email",
                      { $indexOfArray: ["$team_B_users._id", "$$player.user"] }
                    ],
                  },
                  profilePhoto: {
                    $arrayElemAt: [
                      "$team_B_users.profilePhoto",
                      { $indexOfArray: ["$team_B_users._id", "$$player.user"] }
                    ],
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
      // Retrieve matches where the user is in team_A or team_B
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
                { $map: { input: "$team_A", as: "a", in: "$$a.bookingId" } },
                { $map: { input: "$team_B", as: "b", in: "$$b.bookingId" } },
              ],
            },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "team_A.user",
            foreignField: "_id",
            as: "team_A_users",
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "team_B.user",
            foreignField: "_id",
            as: "team_B_users",
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
            match_score: 1,
            team_A: {
              $map: {
                input: "$team_A",
                as: "player",
                in: {
                  user: "$$player.user",
                  bookingId: "$$player.bookingId",
                  player_score: "$$player.player_score",
                  firstName: {
                    $arrayElemAt: [
                      "$team_A_users.firstName",
                      { $indexOfArray: ["$team_A_users._id", "$$player.user"] }
                    ],
                  },
                  lastName: {
                    $arrayElemAt: [
                      "$team_A_users.lastName",
                      { $indexOfArray: ["$team_A_users._id", "$$player.user"] }
                    ],
                  },
                  email: {
                    $arrayElemAt: [
                      "$team_A_users.email",
                      { $indexOfArray: ["$team_A_users._id", "$$player.user"] }
                    ],
                  },
                  profilePhoto: {
                    $arrayElemAt: [
                      "$team_A_users.profilePhoto",
                      { $indexOfArray: ["$team_A_users._id", "$$player.user"] }
                    ],
                  },
                },
              },
            },
            team_B: {
              $map: {
                input: "$team_B",
                as: "player",
                in: {
                  user: "$$player.user",
                  bookingId: "$$player.bookingId",
                  player_score: "$$player.player_score",
                  firstName: {
                    $arrayElemAt: [
                      "$team_B_users.firstName",
                      { $indexOfArray: ["$team_B_users._id", "$$player.user"] }
                    ],
                  },
                  lastName: {
                    $arrayElemAt: [
                      "$team_B_users.lastName",
                      { $indexOfArray: ["$team_B_users._id", "$$player.user"] }
                    ],
                  },
                  email: {
                    $arrayElemAt: [
                      "$team_B_users.email",
                      { $indexOfArray: ["$team_B_users._id", "$$player.user"] }
                    ],
                  },
                  profilePhoto: {
                    $arrayElemAt: [
                      "$team_B_users.profilePhoto",
                      { $indexOfArray: ["$team_B_users._id", "$$player.user"] }
                    ],
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
  
  

export {
  createMatch,
  getMatchesBasedonUser,
  getMatchesBasedonCommunity,
  changeMatchStatus,
  getAllMatchesWithinAdmin,
};
