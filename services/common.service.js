export const extractFirstAndLastName = (fullName) => {
  // Split the full name into parts based on spaces
  const nameParts = fullName.split(" ");

  // Extract the first name (first part)
  const firstName = nameParts.shift(); // Remove and return the first part

  // Whatever is left is considered the last name
  const lastName = nameParts.join(" ");

  return {
    firstName,
    lastName,
  };
};

/**
 * Genereate otp
 * @param {lenght} number
 * @returns
 */
export const generateOTP = (length) => {
  const digits = "0123456789";
  let OTP = "";
  for (let i = 0; i < length; i++) {
    OTP += digits[Math.floor(Math.random() * 10)];
  }
  return OTP;
};
