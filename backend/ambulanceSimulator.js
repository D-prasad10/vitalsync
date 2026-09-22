/**
 * MediResQ Emergency GPS Response & Ambulance Simulator Service
 * Handles Haversine distance, estimated ETA, response progress,
 * coordinate validation, and simulated emergency responder movement.
 */

// Earth radius in kilometers
const EARTH_RADIUS_KM = 6371;

/**
 * Validates latitude and longitude within physical bounds.
 * @param {number} lat - Latitude (-90 to +90)
 * @param {number} lng - Longitude (-180 to +180)
 * @returns {boolean}
 */
function isValidCoordinates(lat, lng) {
  if (lat == null || lng == null) return false;
  const numLat = Number(lat);
  const numLng = Number(lng);
  if (isNaN(numLat) || isNaN(numLng)) return false;
  if (numLat === 0 && numLng === 0) return false; // Default GPS 0,0 null island
  return numLat >= -90 && numLat <= 90 && numLng >= -180 && numLng <= 180;
}

/**
 * Calculate distance between two GPS coordinates using the Haversine formula.
 * @param {number} lat1 
 * @param {number} lon1 
 * @param {number} lat2 
 * @param {number} lon2 
 * @returns {number} Distance in kilometers rounded to 2 decimal places
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  if (!isValidCoordinates(lat1, lon1) || !isValidCoordinates(lat2, lon2)) {
    return 0;
  }

  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = EARTH_RADIUS_KM * c;
  return Math.round(distance * 100) / 100;
}

/**
 * Calculate estimated prototype ETA in minutes.
 * Average urban emergency speed: 40 km/h.
 * @param {number} distanceKm 
 * @param {number} speedKmh 
 * @returns {number} Estimated ETA in minutes
 */
function calculateETA(distanceKm, speedKmh = 40) {
  if (!distanceKm || distanceKm <= 0.05) return 0;
  const hours = distanceKm / speedKmh;
  const minutes = Math.round(hours * 60);
  return Math.max(1, minutes);
}

/**
 * Calculate response progress based on distance reduction:
 * progress = 1 - (currentDistance / initialDistance)
 * @param {number} initialDistance 
 * @param {number} currentDistance 
 * @returns {number} Percentage 0 to 100
 */
function calculateProgress(initialDistance, currentDistance) {
  if (currentDistance <= 0.04) return 100; // Arrived (within 40 meters)
  if (!initialDistance || initialDistance <= 0) return 0;
  const ratio = 1 - (currentDistance / initialDistance);
  const percent = Math.round(ratio * 100);
  return Math.min(100, Math.max(0, percent));
}

class AmbulanceSimulatorService {
  constructor(db, io) {
    this.db = db;
    this.io = io;
    this.timer = null;
    this.isRunning = false;
    this.speedStep = 0.0007; // Approx 75 meters per tick in coordinates
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.timer = setInterval(() => this.tick(), 2500);
    console.log('[AMBULANCE SIMULATOR] Engine started (2.5s cycle).');
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    console.log('[AMBULANCE SIMULATOR] Engine stopped.');
  }

  toggle() {
    if (this.isRunning) this.stop();
    else this.start();
    return this.isRunning;
  }

  /**
   * Perform one step of movement for all EN_ROUTE emergencies.
   */
  async tick() {
    if (!this.db) return;

    this.db.all(
      `SELECT e.*, a.latitude as amb_lat, a.longitude as amb_lng, a.name as amb_name
       FROM emergencies e
       JOIN ambulances a ON e.ambulance_id = a.id
       WHERE e.status = 'EN_ROUTE'`,
      [],
      (err, activeList) => {
        if (err || !activeList || activeList.length === 0) return;

        for (const emg of activeList) {
          this.stepEmergency(emg);
        }
      }
    );
  }

  stepEmergency(emg) {
    const targetLat = emg.latitude;
    const targetLng = emg.longitude;
    const currentLat = emg.amb_lat;
    const currentLng = emg.amb_lng;

    // If patient has no GPS fix, responder navigates to assigned clinical station / bed
    if (!isValidCoordinates(targetLat, targetLng) || !isValidCoordinates(currentLat, currentLng)) {
      return;
    }

    const distBefore = haversineDistance(currentLat, currentLng, targetLat, targetLng);

    // If already within 40m, mark as ARRIVED
    if (distBefore <= 0.04) {
      this.markArrived(emg);
      return;
    }

    // Direction vector towards patient
    const dLat = targetLat - currentLat;
    const dLng = targetLng - currentLng;
    const angle = Math.atan2(dLng, dLat);

    const stepLat = Math.cos(angle) * this.speedStep;
    const stepLng = Math.sin(angle) * this.speedStep;

    let nextLat = currentLat + stepLat;
    let nextLng = currentLng + stepLng;

    const distAfter = haversineDistance(nextLat, nextLng, targetLat, targetLng);

    // If stepped past or within threshold
    if (distAfter <= 0.04 || distAfter > distBefore) {
      nextLat = targetLat;
      nextLng = targetLng;
      this.markArrived(emg);
      return;
    }

    const initialDist = emg.initial_distance || distBefore;
    const newEta = calculateETA(distAfter);
    const newProgress = calculateProgress(initialDist, distAfter);
    const now = Date.now();

    // Update ambulance location
    this.db.run(
      `UPDATE ambulances SET latitude = ?, longitude = ?, updated_at = ? WHERE id = ?`,
      [nextLat, nextLng, now, emg.ambulance_id]
    );

    // Update emergency telemetry
    this.db.run(
      `UPDATE emergencies 
       SET current_distance = ?, estimated_eta_minutes = ?, progress = ?, updated_at = ?
       WHERE id = ?`,
      [distAfter, newEta, newProgress, now, emg.id]
    );

    const updatedAmbulance = {
      ambulanceId: emg.ambulance_id,
      name: emg.amb_name,
      status: 'EN_ROUTE',
      latitude: nextLat,
      longitude: nextLng,
      distance: distAfter,
      eta: newEta,
      progress: newProgress,
      isSimulated: true,
      updatedAt: now
    };

    const updatedEmergency = {
      ...emg,
      current_distance: distAfter,
      estimated_eta_minutes: newEta,
      progress: newProgress,
      updated_at: now
    };

    if (this.io) {
      this.io.emit('ambulance:location', updatedAmbulance);
      this.io.emit('emergency:updated', updatedEmergency);
    }
  }

  markArrived(emg) {
    const now = Date.now();
    this.db.run(
      `UPDATE emergencies 
       SET status = 'ARRIVED', current_distance = 0, estimated_eta_minutes = 0, progress = 100, updated_at = ?
       WHERE id = ?`,
      [now, emg.id]
    );

    this.db.run(
      `UPDATE ambulances SET status = 'ARRIVED', updated_at = ? WHERE id = ?`,
      [now, emg.ambulance_id]
    );

    const alertMsg = `Ambulance ${emg.ambulance_id} arrived for ${emg.patient_name}`;
    console.log(`[AMBULANCE] ${alertMsg}`);

    if (this.io) {
      this.io.emit('ambulance:status', {
        ambulanceId: emg.ambulance_id,
        status: 'ARRIVED',
        updatedAt: now
      });

      this.io.emit('emergency:updated', {
        ...emg,
        status: 'ARRIVED',
        current_distance: 0,
        estimated_eta_minutes: 0,
        progress: 100,
        updated_at: now
      });

      this.io.emit('emergency_alert', {
        id: `alert-arr-${emg.id}`,
        patientId: emg.patient_id,
        patientName: emg.patient_name,
        severity: 'stable',
        message: alertMsg,
        alerts: [alertMsg],
        timestamp: now,
        status: 'active'
      });
    }
  }
}

module.exports = {
  isValidCoordinates,
  haversineDistance,
  calculateETA,
  calculateProgress,
  AmbulanceSimulatorService
};
