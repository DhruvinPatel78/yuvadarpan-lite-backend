const STAFF_ROLES = [
  "ADMIN",
  "SAMAJ_MANAGER",
  "CITY_MANAGER",
  "DISTRICT_MANAGER",
  "VIBHAG_MANAGER",
  "REGION_MANAGER",
  "STATE_MANAGER",
  "COUNTRY_MANAGER",
];

/**
 * Staff push notifications are disabled (Firebase removed).
 * Kept as a no-op so existing call sites stay intact until FCM is added again.
 */
const notifyStaffEvent = async () => {};

module.exports = {
  notifyStaffEvent,
  STAFF_ROLES,
};
