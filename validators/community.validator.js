import Joi from "joi";
// Define Joi schema for timeslot
const timeslotSchema = Joi.object({
  day: Joi.string().required(),
  startTime: Joi.string().required(),
  endTime: Joi.string().required(),
  available: Joi.boolean(),
});

// Define Joi schema for Community Center
const communityCenterSchema = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().required(),
  image: Joi.string().required(),
  location: Joi.object({
    latitude: Joi.number().required(),
    longitude: Joi.number().required(),
  }),
  address: Joi.string().required(),
  radius: Joi.number().required(),
  timeSlots: Joi.array().items(timeslotSchema),
  password: Joi.string().required(),
  description: Joi.string(),
});

export { communityCenterSchema };
