import mongoose from "mongoose";

const promoCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  discount: { type: Number, required: true }, // For example, a percentage discount
  expiryDate: { type: Date, required: true },
  usageCount: { type: Number, default: 0 },
  maxUsage: { type: Number, default: 1 }, // Maximum number of times the promo code can be used
});

const PromoCode = mongoose.model("Promo_Code", promoCodeSchema);

export { PromoCode };
