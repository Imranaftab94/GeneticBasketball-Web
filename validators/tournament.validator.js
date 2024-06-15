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

const tournamentBookingValidationSchema = Joi.object({
  player: Joi.string().required(),
  tournament: Joi.string().required(),
});

const tournamentBookingSchema = Joi.object({
  bookingId: Joi.string().required(),
  player: Joi.string().required(),
});

const startTournamentValidationSchema = Joi.object({
  tournamentId: Joi.string().required(),
  bookings: Joi.array().required().items(tournamentBookingSchema),
});

const teamSchema = Joi.object({
  name: Joi.string().required(),
  players: Joi.array()
    .items(
      Joi.object({
        user: Joi.string().required(),
        bookingId: Joi.string().required(),
        gersyNumber: Joi.number().required(),
      })
    )
    .required(),
});

const tournamentMatchSchemaValidator = Joi.object({
  community_center: Joi.string().required(),
  tournament: Joi.string().required(),
  startTime: Joi.string().required(),
  endTime: Joi.string().required(),
  name: Joi.string().required(),
  day: Joi.string()
    .valid("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN")
    .required(),
  match_date: Joi.date().required(),
  team_A: teamSchema.required(),
  team_B: teamSchema.required(),
}).options({ abortEarly: false });

const TournamentPlayerMatchStatsSchema = Joi.object({
  player: Joi.string().required(),
  match: Joi.string().required(),
  tournament: Joi.string().required(),
  fieldGoalsMade: Joi.number().required(),
  fieldGoalsAttempted: Joi.number().required(),
  threePointersMade: Joi.number().required(),
  threePointersAttempted: Joi.number().required(),
  fieldGoalsPercentage: Joi.number().required(),
  threePointersPercentage: Joi.number().required(),
  offensiveRebounds: Joi.number().required(),
  rebounds: Joi.number().required(),
  assists: Joi.number().required(),
  steals: Joi.number().required(),
  blocks: Joi.number().required(),
  turnovers: Joi.number().required(),
  pointsScored: Joi.number().required(),
});

const updateTournamentSchema = Joi.object({
  tournamentId: Joi.string().required(),
  community_center: Joi.string().required(),
  name: Joi.string().required(),
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
});

export {
  createTournamentSchema,
  tournamentBookingValidationSchema,
  startTournamentValidationSchema,
  tournamentMatchSchemaValidator,
  TournamentPlayerMatchStatsSchema,
  updateTournamentSchema
};
