/**
 * Authentication Service
 * Manajemen Pendaftaran (Registrasi) & Masuk (Login) Petugas NOC / Admin
 * Terintegrasi ke MySQL table `users` dengan enkripsi PBKDF2 SHA-512
 */

const crypto = require('crypto');
const { pool } = require('../config/database');

const PASSWORD_SALT = process.env.AUTH_SALT || 'multiwan_unugha_secret_salt_2026';

class AuthService {
  /**
   * Enkripsi kata sandi menggunakan PBKDF2 SHA-512
   */
  static hashPassword(password) {
    if (!password) return '';
    return crypto.pbkdf2Sync(password, PASSWORD_SALT, 1000, 64, 'sha512').toString('hex');
  }

  /**
   * Verifikasi kecocokan password
   */
  static verifyPassword(password, hash) {
    if (!password || !hash) return false;
    const computed = this.hashPassword(password);
    return computed === hash;
  }

  /**
   * Registrasi Pengguna Baru ke MySQL
   */
  static async register({ fullname, username, email, password, role = 'operator' }) {
    if (!fullname || !username || !email || !password) {
      throw new Error('Semua kolom wajib diisi (Nama, Username, Email, Password)');
    }

    // Normalisasi input
    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    // Validasi panjang username & password
    if (cleanUsername.length < 3) {
      throw new Error('Username minimal terdiri dari 3 karakter');
    }
    if (password.length < 6) {
      throw new Error('Kata sandi minimal terdiri dari 6 karakter');
    }

    try {
      // 1. Cek apakah username atau email sudah ada
      const [existing] = await pool.query(
        'SELECT id, username, email FROM users WHERE username = ? OR email = ? LIMIT 1',
        [cleanUsername, cleanEmail]
      );

      if (existing && existing.length > 0) {
        if (existing[0].username === cleanUsername) {
          throw new Error('Username sudah digunakan oleh akun lain');
        }
        if (existing[0].email === cleanEmail) {
          throw new Error('Alamat email sudah terdaftar');
        }
      }

      // 2. Hash password
      const passwordHash = this.hashPassword(password);

      // 3. Simpan ke database MySQL
      const [result] = await pool.execute(
        `INSERT INTO users (fullname, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
        [fullname.trim(), cleanUsername, cleanEmail, passwordHash, role]
      );

      return {
        id: result.insertId,
        fullname: fullname.trim(),
        username: cleanUsername,
        email: cleanEmail,
        role: role
      };
    } catch (err) {
      throw err;
    }
  }

  /**
   * Autentikasi Pengguna (Login)
   */
  static async login({ usernameOrEmail, password }) {
    if (!usernameOrEmail || !password) {
      throw new Error('Username/Email dan kata sandi wajib diisi');
    }

    const identifier = usernameOrEmail.trim().toLowerCase();

    try {
      // 1. Cari user di MySQL
      const [rows] = await pool.query(
        'SELECT id, fullname, username, email, password_hash, role FROM users WHERE username = ? OR email = ? LIMIT 1',
        [identifier, identifier]
      );

      if (!rows || rows.length === 0) {
        throw new Error('Akun dengan username/email tersebut tidak ditemukan');
      }

      const user = rows[0];

      // 2. Verifikasi password hash
      const isValid = this.verifyPassword(password, user.password_hash);
      if (!isValid) {
        throw new Error('Kata sandi yang Anda masukkan salah');
      }

      // 3. Update waktu login terakhir
      await pool.execute(
        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
        [user.id]
      );

      return {
        id: user.id,
        fullname: user.fullname,
        username: user.username,
        email: user.email,
        role: user.role,
        loginAt: Date.now()
      };
    } catch (err) {
      throw err;
    }
  }

  /**
   * Dapatkan profil user berdasarkan ID
   */
  static async getUserById(userId) {
    try {
      const [rows] = await pool.query(
        'SELECT id, fullname, username, email, role, last_login, created_at FROM users WHERE id = ? LIMIT 1',
        [userId]
      );
      return rows && rows.length > 0 ? rows[0] : null;
    } catch (err) {
      return null;
    }
  }
}

module.exports = AuthService;
