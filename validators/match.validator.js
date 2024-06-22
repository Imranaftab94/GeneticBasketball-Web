import Joi from 'joi'
import { MatchStatus } from '../constants/match-status.constant.js'

const teamSchema = Joi.object({
  name: Joi.string().required(),
  players: Joi.array().items(
    Joi.object({
      user: Joi.string().required(),
      bookingId: Joi.string().required(),
      gersyNumber: Joi.number().required()
    })
  ).required()
})

export const matchSchemaValidator = Joi.object({
  community_center: Joi.string().required(),
  startTime: Joi.string().required(),
  endTime: Joi.string().required(),
  name: Joi.string().required(),
  day: Joi.string()
    .valid('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN')
    .required(),
  match_date: Joi.date().required(),
  team_A: teamSchema,
  team_B: teamSchema
}).options({ abortEarly: false })

export const updateMatchStatusSchema = Joi.object({
  id: Joi.string().required(),
  status: Joi.string()
    .valid(...Object.values(MatchStatus))
    .required(),
  players: Joi.array().optional()
})

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
  pointsScored: Joi.number().required()
})
