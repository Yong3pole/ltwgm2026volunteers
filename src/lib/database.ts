import mysql, { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

export type ShiftAvailability = {
  shiftId: string;
  date: string;
  label: string;
  startTime: string;
  endTime: string;
  capacity: number;
  reserved: number;
};

type BookingInput = {
  shiftId: string;
  fullName: string;
  phone: string;
  organization: string;
  leaderName: string;
  leaderPhone: string;
};

type ShiftRow = RowDataPacket & { capacity: number };
type ReferenceRow = RowDataPacket & { reference: string };
type AdminRequestRow = RowDataPacket & {
  reference: string;
  shiftId: string;
  date: string;
  shiftLabel: string;
  startTime: string;
  endTime: string;
  fullName: string;
  phone: string;
  organization: string;
  leaderName: string;
  leaderPhone: string;
  status: "pending" | "confirmed" | "rejected" | "cancelled";
  createdAt: string;
};
export type WaitlistRow = {
  reference: string;
  shiftId: string;
  date: string;
  shiftLabel: string;
  startTime: string;
  endTime: string;
  fullName: string;
  phone: string;
  organization: string;
  leaderName: string;
  leaderPhone: string;
  createdAt: string;
};

let pool: Pool | undefined;
let initialized = false;
let initialization: Promise<void> | undefined;

function getPool() {
  if (!pool) {
    const connectionString = process.env.MYSQL_URL;
    if (!connectionString) {
      throw new Error("Database is not configured. Set MYSQL_URL.");
    }

    const url = new URL(connectionString);
    pool = mysql.createPool({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      connectionLimit: 5,
      waitForConnections: true,
      enableKeepAlive: true,
    });
  }

  return pool;
}

function getScheduleDates() {
  const dates: string[] = [];
  const current = new Date("2026-11-28T00:00:00Z");
  const end = new Date("2027-01-10T00:00:00Z");

  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

export async function initializeDatabase() {
  if (initialized) return;
  if (initialization) return initialization;

  initialization = (async () => {
    const db = getPool();
    await db.query(`
      CREATE TABLE IF NOT EXISTS shifts (
        id VARCHAR(64) PRIMARY KEY,
        service_date DATE NOT NULL,
        label VARCHAR(80) NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        capacity INT NOT NULL DEFAULT 2,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        UNIQUE KEY unique_shift_time (service_date, start_time, end_time)
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS booking_requests (
        id CHAR(36) PRIMARY KEY,
        reference VARCHAR(32) NOT NULL UNIQUE,
        shift_id VARCHAR(64) NOT NULL,
        full_name VARCHAR(120) NOT NULL,
        phone VARCHAR(40) NOT NULL,
        organization VARCHAR(160) NOT NULL,
        leader_contact VARCHAR(160) NOT NULL,
        leader_name VARCHAR(120) NULL,
        leader_phone VARCHAR(40) NULL,
        status ENUM('pending', 'confirmed', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shift_id) REFERENCES shifts(id),
        INDEX active_shift_phone (shift_id, phone, status),
        INDEX active_shift_status (shift_id, status)
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS waitlist_entries (
        id CHAR(36) PRIMARY KEY,
        reference VARCHAR(32) NOT NULL UNIQUE,
        shift_id VARCHAR(64) NOT NULL,
        full_name VARCHAR(120) NOT NULL,
        phone VARCHAR(40) NOT NULL,
        organization VARCHAR(160) NOT NULL,
        leader_contact VARCHAR(160) NOT NULL,
        leader_name VARCHAR(120) NULL,
        leader_phone VARCHAR(40) NULL,
        status ENUM('waiting', 'promoted', 'cancelled') NOT NULL DEFAULT 'waiting',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shift_id) REFERENCES shifts(id)
      )
    `);

    for (const table of ["booking_requests", "waitlist_entries"]) {
      const [columns] = await db.query<RowDataPacket[]>(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME IN ('leader_name', 'leader_phone')`,
        [table],
      );
      const existingColumns = new Set(columns.map((column) => column.COLUMN_NAME));
      if (!existingColumns.has("leader_name")) {
        await db.query(`ALTER TABLE ${table} ADD COLUMN leader_name VARCHAR(120) NULL`);
      }
      if (!existingColumns.has("leader_phone")) {
        await db.query(`ALTER TABLE ${table} ADD COLUMN leader_phone VARCHAR(40) NULL`);
      }
    }

    for (const date of getScheduleDates()) {
      await db.execute(
        `INSERT IGNORE INTO shifts (id, service_date, label, start_time, end_time)
         VALUES (?, ?, 'Day shift', '10:00:00', '16:00:00'),
                (?, ?, 'Evening shift', '15:00:00', '21:00:00')`,
        [`${date}-day`, date, `${date}-evening`, date],
      );
    }

    initialized = true;
  })();

  try {
    await initialization;
  } finally {
    initialization = undefined;
  }
}

export async function getShiftAvailability() {
  await initializeDatabase();
  const [rows] = await getPool().query<ShiftAvailability[] & RowDataPacket[]>(`
    SELECT
      s.id AS shiftId,
      DATE_FORMAT(s.service_date, '%Y-%m-%d') AS date,
      s.label,
      TIME_FORMAT(s.start_time, '%H:%i') AS startTime,
      TIME_FORMAT(s.end_time, '%H:%i') AS endTime,
      s.capacity,
      COUNT(b.id) AS reserved
    FROM shifts s
    LEFT JOIN booking_requests b
      ON b.shift_id = s.id
      AND b.status IN ('pending', 'confirmed')
    WHERE s.active = TRUE
    GROUP BY s.id, s.service_date, s.label, s.start_time, s.end_time, s.capacity
    ORDER BY s.service_date, s.start_time
  `);

  return rows;
}

export async function createBookingRequest(input: BookingInput) {
  await initializeDatabase();
  const db = getPool();
  const connection = await db.getConnection();
  const id = crypto.randomUUID();
  const reference = `LTW-${id.slice(0, 8).toUpperCase()}`;

  try {
    await connection.beginTransaction();
    const [duplicateRows] = await connection.execute<ReferenceRow[]>(
      `SELECT reference FROM booking_requests
       WHERE shift_id = ? AND phone = ?
         AND status IN ('pending', 'confirmed')
       LIMIT 1 FOR UPDATE`,
      [input.shiftId, input.phone],
    );
    if (duplicateRows[0]) {
      throw new Error("This phone number already has a request for that shift.");
    }

    const [shiftRows] = await connection.execute<ShiftRow[]>(
      "SELECT capacity FROM shifts WHERE id = ? AND active = TRUE FOR UPDATE",
      [input.shiftId],
    );
    if (!shiftRows[0]) {
      throw new Error("That shift is not available.");
    }

    const [reservedRows] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS count FROM booking_requests
       WHERE shift_id = ? AND status IN ('pending', 'confirmed')`,
      [input.shiftId],
    );
    const reserved = Number(reservedRows[0].count);

    if (reserved < shiftRows[0].capacity) {
      await connection.execute(
        `INSERT INTO booking_requests
          (id, reference, shift_id, full_name, phone, organization, leader_contact, leader_name, leader_phone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, reference, input.shiftId, input.fullName, input.phone, input.organization, input.leaderName, input.leaderName, input.leaderPhone || null],
      );
      await connection.commit();
      return { reference, status: "pending", waitlisted: false };
    }

    const waitlistId = crypto.randomUUID();
    const waitlistReference = `WAIT-${waitlistId.slice(0, 8).toUpperCase()}`;
    await connection.execute(
      `INSERT INTO waitlist_entries
        (id, reference, shift_id, full_name, phone, organization, leader_contact, leader_name, leader_phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [waitlistId, waitlistReference, input.shiftId, input.fullName, input.phone, input.organization, input.leaderName, input.leaderName, input.leaderPhone || null],
    );
    await connection.commit();
    return { reference: waitlistReference, status: "waiting", waitlisted: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getAdminRequests() {
  await initializeDatabase();
  const [rows] = await getPool().query<AdminRequestRow[] & RowDataPacket[]>(`
    SELECT
      b.reference,
      b.shift_id AS shiftId,
      DATE_FORMAT(s.service_date, '%Y-%m-%d') AS date,
      s.label AS shiftLabel,
      TIME_FORMAT(s.start_time, '%H:%i') AS startTime,
      TIME_FORMAT(s.end_time, '%H:%i') AS endTime,
      b.full_name AS fullName,
      b.phone,
      b.organization,
      COALESCE(b.leader_name, b.leader_contact) AS leaderName,
      COALESCE(b.leader_phone, '') AS leaderPhone,
      b.status,
      DATE_FORMAT(b.created_at, '%Y-%m-%dT%H:%i:%sZ') AS createdAt
    FROM booking_requests b
    INNER JOIN shifts s ON s.id = b.shift_id
    ORDER BY FIELD(b.status, 'pending', 'confirmed', 'rejected', 'cancelled'),
      s.service_date, s.start_time, b.created_at
  `);

  return rows;
}

export async function updateBookingStatus(
  reference: string,
  status: "confirmed" | "rejected",
) {
  await initializeDatabase();
  const [result] = await getPool().execute(
    `UPDATE booking_requests
     SET status = ?
     WHERE reference = ? AND status = 'pending'`,
    [status, reference],
  );

  if (!("affectedRows" in result) || result.affectedRows !== 1) {
    throw new Error("That pending request was not found.");
  }
}

export async function editBookingRequest(
  reference: string,
  input: {
    shiftId: string;
    fullName: string;
    phone: string;
    organization: string;
    leaderName: string;
    leaderPhone: string;
  },
) {
  await initializeDatabase();
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();
    const [bookingRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id, shift_id AS shiftId, status
       FROM booking_requests WHERE reference = ? FOR UPDATE`,
      [reference],
    );
    const booking = bookingRows[0];
    if (!booking) throw new Error("That booking was not found.");

    const [shiftRows] = await connection.execute<ShiftRow[]>(
      "SELECT capacity FROM shifts WHERE id = ? AND active = TRUE FOR UPDATE",
      [input.shiftId],
    );
    if (!shiftRows[0]) throw new Error("That shift is not available.");

    const [duplicateRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id FROM booking_requests
       WHERE shift_id = ? AND phone = ? AND id <> ?
         AND status IN ('pending', 'confirmed')
       LIMIT 1`,
      [input.shiftId, input.phone, booking.id],
    );
    if (duplicateRows[0]) {
      throw new Error("This phone number already has a request for that shift.");
    }

    const [reservedRows] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS count FROM booking_requests
       WHERE shift_id = ? AND status IN ('pending', 'confirmed') AND id <> ?`,
      [input.shiftId, booking.id],
    );
    if (Number(reservedRows[0].count) >= shiftRows[0].capacity) {
      throw new Error("That shift is already full.");
    }

    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE booking_requests
       SET shift_id = ?, full_name = ?, phone = ?, organization = ?,
           leader_name = ?, leader_phone = ?, leader_contact = ?
       WHERE id = ?`,
      [
        input.shiftId,
        input.fullName,
        input.phone,
        input.organization,
        input.leaderName,
        input.leaderPhone || null,
        input.leaderName,
        booking.id,
      ],
    );
    if (result.affectedRows !== 1) throw new Error("That booking was not found.");
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function deleteBookingRequest(reference: string) {
  await initializeDatabase();
  const [result] = await getPool().execute<ResultSetHeader>(
    "DELETE FROM booking_requests WHERE reference = ?",
    [reference],
  );

  if (result.affectedRows !== 1) {
    throw new Error("That booking was not found.");
  }
}

export async function getAdminWaitlist() {
  await initializeDatabase();
  const [rows] = await getPool().query<WaitlistRow[] & RowDataPacket[]>(`
    SELECT
      w.reference,
      w.shift_id AS shiftId,
      DATE_FORMAT(s.service_date, '%Y-%m-%d') AS date,
      s.label AS shiftLabel,
      TIME_FORMAT(s.start_time, '%H:%i') AS startTime,
      TIME_FORMAT(s.end_time, '%H:%i') AS endTime,
      w.full_name AS fullName,
      w.phone,
      w.organization,
      COALESCE(w.leader_name, w.leader_contact) AS leaderName,
      COALESCE(w.leader_phone, '') AS leaderPhone,
      DATE_FORMAT(w.created_at, '%Y-%m-%dT%H:%i:%sZ') AS createdAt
    FROM waitlist_entries w
    INNER JOIN shifts s ON s.id = w.shift_id
    WHERE w.status = 'waiting'
    ORDER BY w.created_at
  `);
  return rows;
}

export async function promoteWaitlistEntry(reference: string) {
  await initializeDatabase();
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [waitRows] = await connection.execute<RowDataPacket[]>(
      `SELECT * FROM waitlist_entries WHERE reference = ? AND status = 'waiting' FOR UPDATE`,
      [reference],
    );
    const waitlist = waitRows[0];
    if (!waitlist) throw new Error("That waitlist entry was not found.");

    const [shiftRows] = await connection.execute<ShiftRow[]>(
      "SELECT capacity FROM shifts WHERE id = ? AND active = TRUE FOR UPDATE",
      [waitlist.shift_id],
    );
    if (!shiftRows[0]) throw new Error("That shift is no longer available.");
    const [reservedRows] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS count FROM booking_requests
       WHERE shift_id = ? AND status IN ('pending', 'confirmed')`,
      [waitlist.shift_id],
    );
    if (Number(reservedRows[0].count) >= shiftRows[0].capacity) {
      throw new Error("That shift is still full.");
    }

    const id = crypto.randomUUID();
    const bookingReference = `LTW-${id.slice(0, 8).toUpperCase()}`;
    await connection.execute(
      `INSERT INTO booking_requests
        (id, reference, shift_id, full_name, phone, organization, leader_contact, leader_name, leader_phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, bookingReference, waitlist.shift_id, waitlist.full_name, waitlist.phone,
        waitlist.organization, waitlist.leader_name ?? waitlist.leader_contact,
        waitlist.leader_name ?? waitlist.leader_contact, waitlist.leader_phone || null],
    );
    await connection.execute(
      "UPDATE waitlist_entries SET status = 'promoted' WHERE reference = ?",
      [reference],
    );
    await connection.commit();
    return bookingReference;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function removeWaitlistEntry(reference: string) {
  await initializeDatabase();
  const [result] = await getPool().execute<ResultSetHeader>(
    "UPDATE waitlist_entries SET status = 'cancelled' WHERE reference = ? AND status = 'waiting'",
    [reference],
  );
  if (result.affectedRows !== 1) throw new Error("That waitlist entry was not found.");
}
