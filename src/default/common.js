function getCurrentDateTime() {
  let now = new Date();

  // Convert to IST (Asia/Kolkata) manually
  let istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
  let istTime = new Date(now.getTime());

  let year = istTime.getFullYear();
  let month = String(istTime.getMonth() + 1).padStart(2, "0");
  let day = String(istTime.getDate()).padStart(2, "0");
  let hours = String(istTime.getHours()).padStart(2, "0");
  let minutes = String(istTime.getMinutes()).padStart(2, "0");
  let seconds = String(istTime.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

function convertIntoISTTime(time) {
  let now = new Date(time);
  let istTime = new Date(now.getTime());
  let year = istTime.getFullYear();
  let month = String(istTime.getMonth() + 1).padStart(2, "0");
  let day = String(istTime.getDate()).padStart(2, "0");
  let hours = String(istTime.getHours()).padStart(2, "0");
  let minutes = String(istTime.getMinutes()).padStart(2, "0");
  let seconds = String(istTime.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

function addHoursToDate(hoursToAdd) {
  let now = new Date();

  // Convert to IST manually
  let istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
  let istTime = new Date(now.getTime());

  istTime.setHours(istTime.getHours() + hoursToAdd);

  let year = istTime.getFullYear();
  let month = String(istTime.getMonth() + 1).padStart(2, "0");
  let day = String(istTime.getDate()).padStart(2, "0");
  let hours = String(istTime.getHours()).padStart(2, "0");
  let minutes = String(istTime.getMinutes()).padStart(2, "0");
  let seconds = String(istTime.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

function subtractHoursToDate(hoursToAdd) {
  let now = new Date();

  // Convert to IST manually
  let istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
  let istTime = new Date(now.getTime());

  istTime.setHours(istTime.getHours() - hoursToAdd);

  let year = istTime.getFullYear();
  let month = String(istTime.getMonth() + 1).padStart(2, "0");
  let day = String(istTime.getDate()).padStart(2, "0");
  let hours = String(istTime.getHours()).padStart(2, "0");
  let minutes = String(istTime.getMinutes()).padStart(2, "0");
  let seconds = String(istTime.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

module.exports = {
  getCurrentDateTime,
  convertIntoISTTime,
  addHoursToDate,
  subtractHoursToDate
};
