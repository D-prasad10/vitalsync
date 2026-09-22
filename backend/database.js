const sqlite3 = require('sqlite3').verbose();
const path = require('path');

let resolveDbReady;
const readyPromise = new Promise((resolve) => {
  resolveDbReady = resolve;
});

const dbPath = path.resolve(__dirname, 'health_monitor.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    
    db.serialize(() => {
      // Patients Table
      db.run(`
        CREATE TABLE IF NOT EXISTS patients (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          age INTEGER,
          room_number TEXT,
          gender TEXT DEFAULT 'Not Specified',
          mobile TEXT DEFAULT 'N/A',
          weight REAL DEFAULT 0.0,
          guardian_contact TEXT DEFAULT 'N/A',
          blood_group TEXT DEFAULT 'N/A',
          photo TEXT DEFAULT NULL,
          doctor_name TEXT DEFAULT NULL,
          doctor_phone TEXT DEFAULT NULL,
          doctor_specialization TEXT DEFAULT NULL,
          doctor_email TEXT DEFAULT NULL
        )
      `, () => {
        // Simple migration if columns don't exist (ignore errors if they do)
        db.run(`ALTER TABLE patients ADD COLUMN gender TEXT DEFAULT 'Not Specified'`, () => {});
        db.run(`ALTER TABLE patients ADD COLUMN mobile TEXT DEFAULT 'N/A'`, () => {});
        db.run(`ALTER TABLE patients ADD COLUMN weight REAL DEFAULT 0.0`, () => {});
        db.run(`ALTER TABLE patients ADD COLUMN guardian_contact TEXT DEFAULT 'N/A'`, () => {});
        db.run(`ALTER TABLE patients ADD COLUMN blood_group TEXT DEFAULT 'N/A'`, () => {});
        db.run(`ALTER TABLE patients ADD COLUMN photo TEXT DEFAULT NULL`, () => {});
        db.run(`ALTER TABLE patients ADD COLUMN doctor_name TEXT DEFAULT NULL`, () => {});
        db.run(`ALTER TABLE patients ADD COLUMN doctor_phone TEXT DEFAULT NULL`, () => {});
        db.run(`ALTER TABLE patients ADD COLUMN doctor_specialization TEXT DEFAULT NULL`, () => {});
        db.run(`ALTER TABLE patients ADD COLUMN doctor_email TEXT DEFAULT NULL`, () => {});
        db.run(`ALTER TABLE patients ADD COLUMN device_id TEXT DEFAULT NULL`, () => {});
      });
      
      // Thresholds Table (1 to 1 relation with patient)
      db.run(`
        CREATE TABLE IF NOT EXISTS thresholds (
          patient_id INTEGER PRIMARY KEY,
          hr_max INTEGER DEFAULT 100,
          hr_min INTEGER DEFAULT 60,
          bp_sys_max INTEGER DEFAULT 130,
          bp_dia_max INTEGER DEFAULT 85,
          spo2_min INTEGER DEFAULT 95,
          temp_max REAL DEFAULT 99.5,
          FOREIGN KEY (patient_id) REFERENCES patients(id)
        )
      `);
      
      // Sensor Logs Table (for 7-day history)
      db.run(`
        CREATE TABLE IF NOT EXISTS sensor_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          patient_id INTEGER,
          hr INTEGER,
          bp_sys INTEGER,
          bp_dia INTEGER,
          spo2 INTEGER,
          temp REAL,
          timestamp INTEGER,
          health_score INTEGER,
          humidity REAL DEFAULT NULL,
          pressure REAL DEFAULT NULL,
          ecg_val INTEGER DEFAULT NULL,
          mq135 TEXT DEFAULT NULL,
          gps_lat REAL DEFAULT NULL,
          gps_lng REAL DEFAULT NULL,
          raw_payload TEXT DEFAULT NULL,
          ai_risk_level TEXT DEFAULT NULL,
          ai_anomaly_score REAL DEFAULT NULL,
          FOREIGN KEY (patient_id) REFERENCES patients(id)
        )
      `, () => {
        db.run(`ALTER TABLE sensor_logs ADD COLUMN health_score INTEGER`, () => {});
        db.run(`ALTER TABLE sensor_logs ADD COLUMN humidity REAL`, () => {});
        db.run(`ALTER TABLE sensor_logs ADD COLUMN pressure REAL`, () => {});
        db.run(`ALTER TABLE sensor_logs ADD COLUMN ecg_val INTEGER`, () => {});
        db.run(`ALTER TABLE sensor_logs ADD COLUMN mq135 TEXT`, () => {});
        db.run(`ALTER TABLE sensor_logs ADD COLUMN gps_lat REAL`, () => {});
        db.run(`ALTER TABLE sensor_logs ADD COLUMN gps_lng REAL`, () => {});
        db.run(`ALTER TABLE sensor_logs ADD COLUMN raw_payload TEXT`, () => {});
        db.run(`ALTER TABLE sensor_logs ADD COLUMN dht_temp REAL`, () => {});
        db.run(`ALTER TABLE sensor_logs ADD COLUMN bmp_temp REAL`, () => {});
        db.run(`ALTER TABLE sensor_logs ADD COLUMN max_ir INTEGER`, () => {});
        db.run(`ALTER TABLE sensor_logs ADD COLUMN max_red INTEGER`, () => {});
        db.run(`ALTER TABLE sensor_logs ADD COLUMN device_ip TEXT`, () => {});
        db.run(`ALTER TABLE sensor_logs ADD COLUMN ai_risk_level TEXT DEFAULT NULL`, () => {});
        db.run(`ALTER TABLE sensor_logs ADD COLUMN ai_anomaly_score REAL DEFAULT NULL`, () => {});
      });

      // Devices Table (tracks registered hardware units and patient mapping)
      db.run(`
        CREATE TABLE IF NOT EXISTS devices (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          device_id TEXT UNIQUE NOT NULL,
          patient_id INTEGER,
          ip TEXT,
          status TEXT DEFAULT 'OFFLINE',
          last_seen INTEGER,
          created_at INTEGER,
          updated_at INTEGER,
          FOREIGN KEY (patient_id) REFERENCES patients(id)
        )
      `, () => {
        db.run(`ALTER TABLE devices ADD COLUMN status TEXT DEFAULT 'OFFLINE'`, () => {});
        db.run(`ALTER TABLE devices ADD COLUMN last_seen INTEGER`, () => {});
        db.run(`ALTER TABLE devices ADD COLUMN ip TEXT`, () => {});
      });

      // Alerts Table (tracks hardware, environmental, emergency, and clinical safety alerts)
      db.run(`
        CREATE TABLE IF NOT EXISTS alerts (
          id TEXT PRIMARY KEY,
          patient_id INTEGER,
          patient_name TEXT,
          device_id TEXT DEFAULT NULL,
          severity TEXT NOT NULL DEFAULT 'warning',
          type TEXT DEFAULT 'general_alert',
          message TEXT,
          alerts TEXT,
          acknowledged INTEGER DEFAULT 0,
          timestamp INTEGER,
          status TEXT DEFAULT 'active',
          FOREIGN KEY (patient_id) REFERENCES patients(id)
        )
      `, () => {
        db.run(`ALTER TABLE alerts ADD COLUMN device_id TEXT`, () => {});
        db.run(`ALTER TABLE alerts ADD COLUMN type TEXT DEFAULT 'general_alert'`, () => {});
        db.run(`ALTER TABLE alerts ADD COLUMN acknowledged INTEGER DEFAULT 0`, () => {});
        db.run(`ALTER TABLE alerts ADD COLUMN patient_name TEXT`, () => {});
        db.run(`ALTER TABLE alerts ADD COLUMN alerts TEXT`, () => {});
        db.run(`ALTER TABLE alerts ADD COLUMN status TEXT DEFAULT 'active'`, () => {});
      });

      // AI Predictions Table (tracks risk evaluations received from AI Engine)
      db.run(`
        CREATE TABLE IF NOT EXISTS ai_predictions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          patient_id INTEGER,
          device_id TEXT,
          risk_level TEXT,
          risk_type TEXT,
          confidence REAL,
          model_version TEXT,
          explanation TEXT,
          timestamp INTEGER NOT NULL,
          FOREIGN KEY (patient_id) REFERENCES patients(id)
        )
      `);

      // Staff Table (doctors and caretakers who can log in)
      db.run(`
        CREATE TABLE IF NOT EXISTS staff (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          staff_id TEXT UNIQUE NOT NULL,
          role TEXT NOT NULL,
          name TEXT NOT NULL,
          mobile TEXT NOT NULL,
          email TEXT NOT NULL
        )
      `, () => {
        db.get('SELECT id FROM staff LIMIT 1', (err, row) => {
          if (!row) {
            db.run(`INSERT INTO staff (staff_id, role, name, mobile, email) VALUES ('DR-00123', 'doctor', 'Dr. Ashish Patra', '9348505908', 'ashishpatra752006@gmail.com')`);
            db.run(`INSERT INTO staff (staff_id, role, name, mobile, email) VALUES ('CR-00456', 'caretaker', 'Caretaker Ashish', '9348505908', 'ashishpatra752006@gmail.com')`);
            console.log('Staff seed data inserted.');
          }
        });
      });


      // Ambulances Table (emergency responder tracking)
      db.run(`
        CREATE TABLE IF NOT EXISTS ambulances (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'AVAILABLE',
          latitude REAL,
          longitude REAL,
          assigned_patient_id INTEGER DEFAULT NULL,
          assigned_emergency_id TEXT DEFAULT NULL,
          is_simulated INTEGER DEFAULT 1,
          updated_at INTEGER
        )
      `, () => {
        db.get('SELECT id FROM ambulances LIMIT 1', (err, row) => {
          if (!row) {
            const now = Date.now();
            db.run(`INSERT INTO ambulances (id, name, status, latitude, longitude, is_simulated, updated_at) VALUES ('AMB-001', 'Critical Care Unit 1', 'AVAILABLE', 20.3002, 85.8150, 1, ?)`, [now]);
            db.run(`INSERT INTO ambulances (id, name, status, latitude, longitude, is_simulated, updated_at) VALUES ('AMB-002', 'Advanced Life Support 2', 'AVAILABLE', 20.2850, 85.8350, 1, ?)`, [now]);
            db.run(`INSERT INTO ambulances (id, name, status, latitude, longitude, is_simulated, updated_at) VALUES ('AMB-003', 'Rapid Response Unit 3', 'AVAILABLE', 20.3120, 85.8200, 1, ?)`, [now]);
            console.log('Ambulance fleet seeded.');
          }
        });
      });

      // Emergencies Table (GPS emergency response lifecycle)
      db.run(`
        CREATE TABLE IF NOT EXISTS emergencies (
          id TEXT PRIMARY KEY,
          patient_id INTEGER,
          patient_name TEXT,
          emergency_type TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'CREATED',
          latitude REAL,
          longitude REAL,
          gps_fix INTEGER DEFAULT 0,
          gps_sat INTEGER DEFAULT 0,
          ambulance_id TEXT DEFAULT NULL,
          initial_distance REAL DEFAULT 0,
          current_distance REAL DEFAULT 0,
          estimated_eta_minutes REAL DEFAULT 0,
          progress REAL DEFAULT 0,
          notes TEXT,
          created_at INTEGER,
          updated_at INTEGER,
          FOREIGN KEY (patient_id) REFERENCES patients(id)
        )
      `);

      // Seed Patient Data (if empty)
      db.get('SELECT id FROM patients LIMIT 1', (err, row) => {
        if (!row) {
          db.run(`INSERT INTO patients (name, age, room_number, gender, mobile, weight, guardian_contact, blood_group) VALUES ('John Doe', 45, '101A', 'Male', '+1 555-0100', 175.5, '+1 555-0101', 'O+')`);
          db.run(`INSERT INTO patients (name, age, room_number, gender, mobile, weight, guardian_contact, blood_group) VALUES ('Jane Smith', 62, '204B', 'Female', '+1 555-0200', 142.0, '+1 555-0201', 'A-')`);
          
          db.run(`INSERT INTO thresholds (patient_id) VALUES (1)`);
          db.run(`INSERT INTO thresholds (patient_id) VALUES (2)`, () => {
            console.log('Seed data inserted.');
            if (resolveDbReady) resolveDbReady();
          });
        } else {
          // Ensure every patient has a threshold record
          db.run(`
            INSERT OR IGNORE INTO thresholds (patient_id)
            SELECT id FROM patients WHERE id NOT IN (SELECT patient_id FROM thresholds)
          `, () => {
            if (resolveDbReady) resolveDbReady();
          });
        }
      });
    });
  }
});

db.readyPromise = readyPromise;

// Async Promise Wrappers for robust query execution across services
db.getAsync = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
});

db.allAsync = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
});

db.runAsync = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) {
    if (err) return reject(err);
    resolve({ lastID: this.lastID, changes: this.changes });
  });
});

module.exports = db;
