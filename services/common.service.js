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
