import express from 'express'
import { addRating, addTopUpCoins, authUser, deletUserAccount, getUserProfile, logoutFcmToken, registerUser, resetPassword, sendOTP, socialAuth, updateUserProfile, verifyAccountEmail, verifyOTPCode} from '../controllers/user.controller.js'
import { protect } from '../middleware/auth.middleware.js'
const router = express.Router()

router.post('/register', registerUser)
router.post('/login', authUser)
router.route('/updateProfile').put(protect, updateUserProfile)
router.post('/socialAuth', socialAuth)
router.route('/profile').get(protect, getUserProfile)
router.post('/sendOTP', sendOTP)
router.post('/verifyOTP', verifyOTPCode)
router.post('/resetPassword', resetPassword)
router.post('/verifyAccountEmail', verifyAccountEmail)
router.post('/logout', logoutFcmToken)
router.route('/deleteAccount').delete(protect, deletUserAccount)
router.route('/addCoinsTopup').post(protect, addTopUpCoins)
router.route('/addRating').post(protect, addRating)

export default router
