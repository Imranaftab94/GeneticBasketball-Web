import Joi from "joi";
import { TOURNAMENT_STATUS } from "../constants/match-status.constant.js";

const createTournamentSchema = Joi.object({
  name: Joi.string().required(),
  community_center: Joi.string().required(),
  location: Joi.object({
    latitude: Joi.number().required(),
    longitude: Joi.number().required(),
  }).required(),
  startDate: Joi.date().required(),
  endDate: Joi.date().required(),
  maxPlayers: Joi.number().required(),
  ageGroup: Joi.string().required(),
  prize: Joi.string().required(),
  entryFee: Joi.number().required(),
  status: Joi.string()
    .valid(...Object.values(TOURNAMENT_STATUS))
    .default(TOURNAMENT_STATUS.UPCOMING),
});

export { createTournamentSchema };
