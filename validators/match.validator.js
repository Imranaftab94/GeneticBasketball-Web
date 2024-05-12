import Joi from "joi";

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
