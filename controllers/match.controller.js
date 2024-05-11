import asyncHandler from "express-async-handler";
import { User } from "../models/user.model.js";
import { statusCodes } from "../constants/statusCodes.constant.js";
import { errorResponse, successResponse } from "../helpers/response.helper.js";
import { matchSchemaValidator } from "../validators/match.validator.js";
import { CommunityCenter } from "../models/community.model.js";
import { Matches } from "../models/matches.model.js";

const createMatch = asyncHandler(async (req, res) => {
    const { error } = matchSchemaValidator.validate(req.body);
    if (error) {
      return errorResponse(res, error.details[0].message, statusCodes.BAD_REQUEST);
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
      const communityCenterExists = await CommunityCenter.findById(community_center);
      if (!communityCenterExists) {
        return errorResponse(res, "Community center not found.", statusCodes.NOT_FOUND);
      }
  
      // Function to validate existence of users in a team
      const validateTeamUsers = async (team) => {
        const userIds = team.map(player => player.user);
        const users = await User.find({ _id: { $in: userIds } }, '_id');
        const existingUserIds = users.map(user => user._id.toString());
        const missingUserIds = userIds.filter(id => !existingUserIds.includes(id));
        return missingUserIds;
      };
  
      // Check if all users in team_A exist
      const missingTeamAUsers = await validateTeamUsers(team_A);
      if (missingTeamAUsers.length > 0) {
        return errorResponse(res, `Users not found in Team A: ${missingTeamAUsers.join(", ")}`, statusCodes.NOT_FOUND);
      }
  
      // Check if all users in team_B exist
      const missingTeamBUsers = await validateTeamUsers(team_B);
      if (missingTeamBUsers.length > 0) {
        return errorResponse(res, `Users not found in Team B: ${missingTeamBUsers.join(", ")}`, statusCodes.NOT_FOUND);
      }
  
      // Check that no user is in both Team A and Team B
      const teamAUsers = new Set(team_A.map(player => player.user.toString()));
      const teamBUsers = new Set(team_B.map(player => player.user.toString()));
      const intersection = new Set([...teamAUsers].filter(user => teamBUsers.has(user)));
  
      if (intersection.size > 0) {
        return errorResponse(res, `Users must be unique across teams. Overlapping user(s): ${[...intersection].join(", ")}`, statusCodes.BAD_REQUEST);
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
      });
      const savedMatch = await match.save();
      successResponse(res, savedMatch, statusCodes.CREATED);
    } catch (error) {
      return errorResponse(res, error.message, statusCodes.BAD_REQUEST);
    }
  });
  

export { createMatch };
