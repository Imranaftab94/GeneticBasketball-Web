import Joi from "joi";
import { MatchStatus } from "../constants/match-status.constant.js";

const playerSchema = Joi.object({
  user: Joi.string().required(),
  bookingId: Joi.string().required(),
});

export const matchSchemaValidator = Joi.object({
  community_center: Joi.string().required(),
  startTime: Joi.string().required(),
  endTime: Joi.string().required(),
  day: Joi.string()
    .valid("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN")
    .required(),
  match_date: Joi.date().required(),
  team_A: Joi.array().items(playerSchema).length(5).required(),
  team_B: Joi.array().items(playerSchema).length(5).required(),
}).options({ abortEarly: false });

export const updateMatchStatusSchema = Joi.object({
  id: Joi.string().required(),
  status: Joi.string()
    .valid(...Object.values(MatchStatus))
    .required(),
});

export const playerMatchStatsSchema = Joi.object({
  player: Joi.string().required(),
  match: Joi.string().required(),
  minutesPlayed: Joi.number().required(),
  fieldGoalsMade: Joi.number().required(),
  fieldGoalsAttempted: Joi.number().required(),
  threePointersMade: Joi.number().required(),
  threePointersAttempted: Joi.number().required(),
  freeThrowsMade: Joi.number().required(),
  freeThrowsAttempted: Joi.number().required(),
  offensiveRebounds: Joi.number().required(),
  defensiveRebounds: Joi.number().required(),
  assists: Joi.number().required(),
  steals: Joi.number().required(),
  blocks: Joi.number().required(),
  turnovers: Joi.number().required(),
  pointsScored: Joi.number().required(),
});
