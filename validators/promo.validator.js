import Joi from "joi";

const promoCodeValidationSchema = Joi.object({
  code: Joi.string().required(),
  discount: Joi.number().min(0).max(100).required(),
  expiryDate: Joi.date().required(),
  maxUsage: Joi.number().integer().min(1).required(),
});

export { promoCodeValidationSchema };
