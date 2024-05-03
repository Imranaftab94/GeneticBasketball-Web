import Joi from "joi";
// Define Joi schema for timeslot
const slotSchema = Joi.object({
  startTime: Joi.string().required(),
  endTime: Joi.string().required(),
  available: Joi.boolean().required(),
});

const daySchema = Joi.object({
  day: Joi.string()
    .valid("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN")
    .required(),
  slots: Joi.array().items(slotSchema).required(),
});

const communityTimeSlotsSchema = Joi.array().items(daySchema);

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
  password: Joi.string().required(),
  description: Joi.string(),
});

//Define Slots schema
const addSlotsSchema = Joi.object({
  communityTimeSlots: Joi.array().required(),
  community_id: Joi.string().required(),
});

export { communityCenterSchema, addSlotsSchema };
