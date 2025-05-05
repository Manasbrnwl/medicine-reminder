function getCurrentDateTime() {
  // Return the current date/time as a Date object
  return new Date();
}

function convertIntoISTTime(time) {
  // Convert time to a Date object if it's not already
  return new Date(time);
}

function addHoursToDate(hoursToAdd) {
  // Get current date
  const now = new Date();

  // Create a new date by adding the specified hours
  const futureDate = new Date(now);
  futureDate.setHours(futureDate.getHours() + hoursToAdd);

  // Return as Date object
  return futureDate;
}

function subtractHoursToDate(hoursToSubtract) {
  // Get current date
  const now = new Date();

  // Create a new date by subtracting the specified hours
  const pastDate = new Date(now);
  pastDate.setHours(pastDate.getHours() - hoursToSubtract);

  // Return as Date object
  return pastDate;
}

// Format a date to ISO string format for display purposes
function formatDateToString(date) {
  const dateObj = new Date(date);
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  const hours = String(dateObj.getHours()).padStart(2, "0");
  const minutes = String(dateObj.getMinutes()).padStart(2, "0");
  const seconds = String(dateObj.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

function addISTOffset(time) {
  // Convert input time to Date object if it's not already
  const dateObj = new Date(time);
  // Add 5 hours and 30 minutes (IST offset)
  // dateObj.setHours(dateObj.getHours() + 5);
  // dateObj.setMinutes(dateObj.getMinutes() + 30);
  
  return dateObj;
}

module.exports = {
  getCurrentDateTime,
  convertIntoISTTime,
  addHoursToDate,
  subtractHoursToDate,
  formatDateToString,
  addISTOffset
};
