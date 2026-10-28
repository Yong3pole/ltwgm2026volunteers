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
export type AdminScheduleRow = ShiftAvailability & {
  bookingCount: number;
  waitlistCount: number;
};

type BookingInput = {
  groupReference: string;
  people: Array<{
    shiftId: string;
    stakeDistrict: string;
    wardBranch: string;
    fullName: string;
    phone: string;
  }>;
};

type ShiftRow = RowDataPacket & { capacity: number };
type AdminRequestRow = RowDataPacket & {
  reference: string;
  groupReference: string;
  shiftId: string;
  date: string;
  shiftLabel: string;
  startTime: string;
  endTime: string;
  stakeDistrict: string;
  fullName: string;
  phone: string;
  organization: string;
  status: "pending" | "confirmed" | "rejected" | "cancelled";
  createdAt: string;
};
export type WaitlistRow = {
  reference: string;
  groupReference: string;
  shiftId: string;
  date: string;
  shiftLabel: string;
  startTime: string;
  endTime: string;
  stakeDistrict: string;
  fullName: string;
  phone: string;
  organization: string;
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
    const sslRequired = url.searchParams.get("ssl-mode")?.toLowerCase() === "required";
    const sslCa = process.env.MYSQL_SSL_CA;
    pool = mysql.createPool({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      ...(sslRequired ? {
        ssl: sslCa
          ? { ca: sslCa, rejectUnauthorized: true }
          : { rejectUnauthorized: false },
      } : {}),
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
        group_reference VARCHAR(32) NULL,
        stake_district VARCHAR(100) NOT NULL,
        full_name VARCHAR(120) NOT NULL,
        phone VARCHAR(40) NOT NULL,
        organization VARCHAR(160) NOT NULL,
        status ENUM(
          'pending',
          'confirmed',
          'rejected',
          'cancelled'
        ) NOT NULL DEFAULT 'pending',
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
        group_reference VARCHAR(32) NULL,
        stake_district VARCHAR(100) NOT NULL,
        full_name VARCHAR(120) NOT NULL,
        phone VARCHAR(40) NOT NULL,
        organization VARCHAR(160) NOT NULL,
        status ENUM(
          'waiting',
          'promoted',
          'cancelled'
        ) NOT NULL DEFAULT 'waiting',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shift_id) REFERENCES shifts(id)
      )
    `);


    for (const table of ["booking_requests", "waitlist_entries"]) {
      const [columns] = await db.query<RowDataPacket[]>(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME IN ('leader_name', 'leader_phone', 'stake_district')`,
        [table],
      );
      const existingColumns = new Set(columns.map((column) => column.COLUMN_NAME));
      if (!existingColumns.has("leader_name")) {
        await db.query(`ALTER TABLE ${table} ADD COLUMN leader_name VARCHAR(120) NULL`);
      }
      if (!existingColumns.has("leader_phone")) {
        await db.query(`ALTER TABLE ${table} ADD COLUMN leader_phone VARCHAR(40) NULL`);
      }
      if (!existingColumns.has("stake_district")) {
        await db.query(`ALTER TABLE ${table} ADD COLUMN stake_district VARCHAR(100) NOT NULL DEFAULT ''`);
      }
      const [groupColumns] = await db.query<RowDataPacket[]>(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'group_reference'`,
        [table],
      );
      if (groupColumns.length === 0) {
        await db.query(`ALTER TABLE ${table} ADD COLUMN group_reference VARCHAR(32) NULL`);
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

export async function getAdminSchedule() {
  await initializeDatabase();
  const [rows] = await getPool().query<AdminScheduleRow[] & RowDataPacket[]>(`
    SELECT
      s.id AS shiftId,
      DATE_FORMAT(s.service_date, '%Y-%m-%d') AS date,
      s.label,
      TIME_FORMAT(s.start_time, '%H:%i') AS startTime,
      TIME_FORMAT(s.end_time, '%H:%i') AS endTime,
      s.capacity,
      0 AS reserved,
      COUNT(DISTINCT CASE WHEN b.status IN ('pending', 'confirmed') THEN b.id END) AS bookingCount,
      COUNT(DISTINCT CASE WHEN w.status = 'waiting' THEN w.id END) AS waitlistCount
    FROM shifts s
    LEFT JOIN booking_requests b ON b.shift_id = s.id
    LEFT JOIN waitlist_entries w ON w.shift_id = s.id
    WHERE s.active = TRUE
    GROUP BY s.id, s.service_date, s.label, s.start_time, s.end_time, s.capacity
    ORDER BY s.service_date, s.start_time
  `);
  return rows;
}

function validateScheduleDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Use a valid schedule date.");
}

function validateScheduleTime(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) throw new Error("Use a valid time.");
}

export async function addScheduleDate(date: string, sourceDate?: string) {
  validateScheduleDate(date);
  if (sourceDate) validateScheduleDate(sourceDate);
  await initializeDatabase();
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const source = sourceDate
      ? await connection.query<RowDataPacket[]>(
        "SELECT label, start_time AS startTime, end_time AS endTime, capacity FROM shifts WHERE service_date = ? AND active = TRUE ORDER BY start_time",
        [sourceDate],
      )
      : [[
        { label: "Day shift", startTime: "10:00:00", endTime: "16:00:00", capacity: 2 },
        { label: "Evening shift", startTime: "15:00:00", endTime: "21:00:00", capacity: 2 },
      ]];
    const sourceRows = source[0] as RowDataPacket[];
    if (sourceRows.length !== 2) throw new Error("The source date must have two active shifts.");
    const existing = await connection.query<RowDataPacket[]>("SELECT id FROM shifts WHERE service_date = ? AND active = TRUE", [date]);
    if ((existing[0] as RowDataPacket[]).length > 0) throw new Error("That date already exists.");
    for (const row of sourceRows) {
      const suffix = String(row.label).toLowerCase().includes("evening") ? "evening" : "day";
      await connection.execute(
        "INSERT INTO shifts (id, service_date, label, start_time, end_time, capacity, active) VALUES (?, ?, ?, ?, ?, ?, TRUE)",
        [`${date}-${suffix}`, date, row.label, row.startTime, row.endTime, row.capacity],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateScheduleDate(
  currentDate: string,
  date: string,
  shifts: { shiftId: string; startTime: string; endTime: string; capacity: number }[],
) {
  validateScheduleDate(currentDate);
  validateScheduleDate(date);
  if (shifts.length !== 2 || shifts.some((shift) => !shift.shiftId || !Number.isInteger(shift.capacity) || shift.capacity < 1)) {
    throw new Error("Both shifts and valid capacities are required.");
  }
  shifts.forEach((shift) => { validateScheduleTime(shift.startTime); validateScheduleTime(shift.endTime); });
  await initializeDatabase();
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.query<RowDataPacket[]>(
      "SELECT id FROM shifts WHERE service_date = ? AND active = TRUE FOR UPDATE", [currentDate],
    );
    if (existing.length !== 2) throw new Error("That schedule date was not found.");
    if (currentDate !== date) {
      const [conflict] = await connection.query<RowDataPacket[]>(
        "SELECT id FROM shifts WHERE service_date = ? AND active = TRUE FOR UPDATE", [date],
      );
      if (conflict.length > 0) throw new Error("The new date already exists.");
      const shiftIds = existing.map((shift) => shift.id);
      const placeholders = shiftIds.map(() => "?").join(",");
      const [bookings] = await connection.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS count FROM booking_requests WHERE shift_id IN (${placeholders}) AND status IN ('pending', 'confirmed')`, shiftIds,
      );
      const [waitlist] = await connection.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS count FROM waitlist_entries WHERE shift_id IN (${placeholders}) AND status = 'waiting'`, shiftIds,
      );
      if (Number(bookings[0].count) || Number(waitlist[0].count)) {
        throw new Error("Reassign active bookings and waitlist entries before changing this date.");
      }
    }
    for (const shift of shifts) {
      await connection.execute(
        "UPDATE shifts SET service_date = ?, start_time = ?, end_time = ?, capacity = ? WHERE id = ?",
        [date, shift.startTime, shift.endTime, shift.capacity, shift.shiftId],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function removeScheduleDate(date: string) {
  validateScheduleDate(date);
  await initializeDatabase();
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [shifts] = await connection.query<RowDataPacket[]>("SELECT id FROM shifts WHERE service_date = ? AND active = TRUE FOR UPDATE", [date]);
    if (shifts.length !== 2) throw new Error("That schedule date was not found.");
    const shiftIds = shifts.map((shift) => shift.id);
    const placeholders = shiftIds.map(() => "?").join(",");
    const [bookings] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS count FROM booking_requests WHERE shift_id IN (${placeholders}) AND status IN ('pending', 'confirmed')`, shiftIds,
    );
    const [waitlist] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS count FROM waitlist_entries WHERE shift_id IN (${placeholders}) AND status = 'waiting'`, shiftIds,
    );
    if (Number(bookings[0].count) || Number(waitlist[0].count)) {
      throw new Error("Reassign active bookings and waitlist entries before removing this date.");
    }
    await connection.execute(`UPDATE shifts SET active = FALSE WHERE id IN (${placeholders})`, shiftIds);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}


export async function createBookingRequest(input: BookingInput) {
  await initializeDatabase();
  const connection = await getPool().getConnection();
  const results: Array<{ reference: string; waitlisted: boolean }> = [];

  try {
    await connection.beginTransaction();
    for (const person of input.people) {
      const shiftId = person.shiftId;
      const [shiftRows] = await connection.execute<ShiftRow[]>(
        "SELECT capacity FROM shifts WHERE id = ? AND active = TRUE FOR UPDATE",
        [shiftId],
      );
      if (!shiftRows[0]) throw new Error("One of the selected shifts is not available.");

      const [reservedRows] = await connection.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS count FROM booking_requests
         WHERE shift_id = ? AND status IN ('pending', 'confirmed')`,
        [shiftId],
      );
        const id = crypto.randomUUID();
        const reference = `LTW-${id.slice(0, 8).toUpperCase()}`;
        if (Number(reservedRows[0].count) < shiftRows[0].capacity) {
          await connection.execute(
            `INSERT INTO booking_requests
              (id, reference, group_reference, shift_id, stake_district, full_name, phone, organization)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, reference, input.groupReference, shiftId, person.stakeDistrict, person.fullName, person.phone, person.wardBranch],
          );
          results.push({ reference, waitlisted: false });
        } else {
          const waitlistId = crypto.randomUUID();
          const waitlistReference = `WAIT-${waitlistId.slice(0, 8).toUpperCase()}`;
          await connection.execute(
            `INSERT INTO waitlist_entries
              (id, reference, group_reference, shift_id, stake_district, full_name, phone, organization)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [waitlistId, waitlistReference, input.groupReference, shiftId, person.stakeDistrict, person.fullName, person.phone, person.wardBranch],
          );
          results.push({ reference: waitlistReference, waitlisted: true });
        }
      }
    await connection.commit();
    return { groupReference: input.groupReference, results, waitlisted: results.some((result) => result.waitlisted) };
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
      b.group_reference AS groupReference,
      b.shift_id AS shiftId,
      DATE_FORMAT(s.service_date, '%Y-%m-%d') AS date,
      s.label AS shiftLabel,
      TIME_FORMAT(s.start_time, '%H:%i') AS startTime,
      TIME_FORMAT(s.end_time, '%H:%i') AS endTime,
      b.stake_district AS stakeDistrict,
      b.full_name AS fullName,
      b.phone,
      b.organization,
      b.status,
      DATE_FORMAT(b.created_at, '%Y-%m-%dT%H:%i:%sZ') AS createdAt
    FROM booking_requests b
    INNER JOIN shifts s ON s.id = b.shift_id
    ORDER BY FIELD(b.status, 'pending', 'confirmed', 'rejected', 'cancelled'),
      s.service_date, s.start_time, b.created_at
  `);

  return rows;
}

export async function getAdminOverview() {
  const [schedule, requests, waitlist] = await Promise.all([
    getAdminSchedule(),
    getAdminRequests(),
    getAdminWaitlist(),
  ]);
  return { schedule, requests, waitlist };
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
    stakeDistrict: string;
    fullName: string;
    phone: string;
    organization: string;
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
       SET shift_id = ?, stake_district = ?, full_name = ?, phone = ?, organization = ?
       WHERE id = ?`,
      [
        input.shiftId,
        input.stakeDistrict,
        input.fullName,
        input.phone,
        input.organization,
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
      w.group_reference AS groupReference,
      w.shift_id AS shiftId,
      DATE_FORMAT(s.service_date, '%Y-%m-%d') AS date,
      s.label AS shiftLabel,
      TIME_FORMAT(s.start_time, '%H:%i') AS startTime,
      TIME_FORMAT(s.end_time, '%H:%i') AS endTime,
      w.stake_district AS stakeDistrict,
      w.full_name AS fullName,
      w.phone,
      w.organization,
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
    const reservedCount = Number(reservedRows[0].count);
    if (reservedCount >= shiftRows[0].capacity) {
      const [statusRows] = await connection.execute<RowDataPacket[]>(
        `SELECT status, COUNT(*) AS count FROM booking_requests
         WHERE shift_id = ? AND status IN ('pending', 'confirmed')
         GROUP BY status`,
        [waitlist.shift_id],
      );
      const counts = new Map(statusRows.map((row) => [row.status as string, Number(row.count)]));
      const confirmedCount = counts.get("confirmed") ?? 0;
      const pendingCount = counts.get("pending") ?? 0;
      throw new Error(
        `That shift is still full. It already has ${confirmedCount} confirmed and ${pendingCount} pending request${reservedCount === 1 ? "" : "s"}.`,
      );
    }

    const id = crypto.randomUUID();
    const bookingReference = `LTW-${id.slice(0, 8).toUpperCase()}`;
    await connection.execute(
      `INSERT INTO booking_requests
        (id, reference, group_reference, shift_id, stake_district, full_name, phone, organization)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, bookingReference, waitlist.group_reference, waitlist.shift_id, waitlist.stake_district,
        waitlist.full_name, waitlist.phone, waitlist.organization],
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
