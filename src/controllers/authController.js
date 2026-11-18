/**
 * Auth Controller
 * Menangani rute HTTP untuk pendaftaran, masuk, status session, dan logout
 */

const AuthService = require('../services/authService');

class AuthController {
  // POST /api/auth/register
  async register(req, res) {
    try {
      const { fullname, username, email, password, role } = req.body;
      const user = await AuthService.register({ fullname, username, email, password, role });
      
      res.status(201).json({
        success: true,
        message: 'Registrasi akun berhasil. Silakan login.',
        user
      });
    } catch (err) {
      res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }

  // POST /api/auth/login
  async login(req, res) {
    try {
      const { usernameOrEmail, password } = req.body;
      const user = await AuthService.login({ usernameOrEmail, password });

      res.json({
        success: true,
        message: `Selamat datang kembali, ${user.fullname}!`,
        user,
        token: `session_${user.id}_${Date.now()}` // Mock token / session id
      });
    } catch (err) {
      res.status(401).json({
        success: false,
        message: err.message
      });
    }
  }

  // GET /api/auth/me?userId=xxx
  async me(req, res) {
    try {
      const userId = req.query.userId;
      if (!userId) {
        return res.status(400).json({ success: false, message: 'Parameter userId wajib' });
      }
      const user = await AuthService.getUserById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
      }
      res.json({ success: true, user });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // POST /api/auth/logout
  async logout(req, res) {
    res.json({
      success: true,
      message: 'Anda berhasil keluar dari sistem.'
    });
  }
}

module.exports = new AuthController();
