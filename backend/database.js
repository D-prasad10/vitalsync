const sqlite3 = require('sqlite3').verbose();
const path = require('path');

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
          FOREIGN KEY (patient_id) REFERENCES patients(id)
        )
      `, () => {
        db.run(`ALTER TABLE sensor_logs ADD COLUMN health_score INTEGER`, () => {});
      });

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

      // Seed Patient Data (if empty)
      db.get('SELECT id FROM patients LIMIT 1', (err, row) => {
        if (!row) {
          db.run(`INSERT INTO patients (name, age, room_number, gender, mobile, weight, guardian_contact, blood_group) VALUES ('John Doe', 45, '101A', 'Male', '+1 555-0100', 175.5, '+1 555-0101', 'O+')`);
          db.run(`INSERT INTO patients (name, age, room_number, gender, mobile, weight, guardian_contact, blood_group) VALUES ('Jane Smith', 62, '204B', 'Female', '+1 555-0200', 142.0, '+1 555-0201', 'A-')`);
          
          db.run(`INSERT INTO thresholds (patient_id) VALUES (1)`);
          db.run(`INSERT INTO thresholds (patient_id) VALUES (2)`);
          
          console.log('Seed data inserted.');
        }
      });
    });
  }
});

module.exports = db;
