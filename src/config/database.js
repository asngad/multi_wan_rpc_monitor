/**
 * MySQL Database Connection Pool
 * Menggunakan mysql2/promise untuk operasi asinkronus performa tinggi
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.MYSQLHOST || process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.MYSQLPORT || process.env.DB_PORT || '3306', 10),
  user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
  password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '',
  database: process.env.MYSQLDATABASE || process.env.DB_NAME || 'multi_wan_rpc_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
});

// Helper untuk uji koneksi
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ [MySQL] Terhubung sukses ke database "multi_wan_rpc_db"');
    connection.release();
    return true;
  } catch (error) {
    console.warn('⚠️ [MySQL] Gagal terhubung ke MySQL:', error.message);
    console.warn('   (Aplikasi tetap berjalan dalam mode in-memory fallback)');
    return false;
  }
}

module.exports = {
  pool,
  testConnection
};
