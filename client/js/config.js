/**
 * SGA.IN Client Portal - Configuration
 * Controlled by a single flag DEMO_MODE.
 */

export const CONFIG = {
  APP_NAME: "Shilp Griha Associate",
  SHORT_NAME: "SGA",
  FOUNDER: "Ar. Vikas Verma, Architect",
  TAGLINE_HI: "नक्शा सही, निर्माण सही",
  PORTAL_NAME: "Client Portal",
  STUDENT_PORTAL_NAME: "Student Notes Portal",
  STUDIO_NAME: "Shilp Griha Associate",
  SITE_DOMAIN: "www.sgaup31.in",
  LOGO_URL: "/assets/logo-full.png",
  FAVICON_URL: "/favicon.png",
  PHONE: "+91 79854 36965",
  PHONE_TEL: "+917985436965",
  WHATSAPP_LINK: "https://wa.me/917985436965",
  EMAIL: "ar.vikasverma0401@gmail.com",
  ADDRESS: "Laxmi Nagar Colony, Cinema Road, in front of Shree Siddhivinayak Palace, Gola Gokarnath, Lakhimpur Kheri, Uttar Pradesh 262802, India",
  SERVICE_AREA: "Gola Gokarnath, Lakhimpur Kheri and nearby areas of Uttar Pradesh",
  DIRECTIONS_URL: "https://www.google.com/maps?gs_lcrp=EgZjaHJvbWUqCggAEAAY4wIYgAQyCggAEAAY4wIYgAQyDQgBEC4YrwEYxwEYgAQyBggCEEUYOTINCAMQABiGAxiABBiKBTINCAQQABiGAxiABBiKBTIKCAUQABiABBiiBDIKCAYQABiABBiiBDIGCAcQRRg80gEJMTA2NTRqMGo3qAIAsAIA&um=1&ie=UTF-8&fb=1&gl=in&sa=X&geocode=Kc-4FEcAQ585Metx1h-VJKp4&daddr=Gola+Gokaran+Nath,+Gola,+Uttar+Pradesh+262802",
  MAP_EMBED_URL: "https://www.google.com/maps?q=Gola+Gokaran+Nath,+Gola,+Uttar+Pradesh+262802&output=embed",
  HOURS: "Hours: to be confirmed",
  SOCIAL_LINKS: {
    instagram: "",
    justdial: "",
    googleReview: ""
  },
  BYLINE: "NXT Services",
  DEMO_MODE: true, // Controls demo ribbon, reset code banner, and browser-only notices
  BACKEND: "local", // "gas" | "local" - Set to "gas" to use live Apps Script + Drive backend
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbx_PASTE_APPS_SCRIPT_ID_HERE/exec",
  GOOGLE_DRIVE_SCOPES: ["https://www.googleapis.com/auth/drive.file"],
  OAUTH_CLIENT_ID: "671570765970-is96p9eerljpecpo3sttk002v0rtb8sm.apps.googleusercontent.com",
  PAYMENT_PROVIDER: "demo", // "demo" | "razorpay"
  NOTES_PREVIEW_PAGES: 3, // Free preview limit
  DB_VERSION: 2,
  API_DELAY_MIN: 200,
  API_DELAY_MAX: 380,
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION_MINUTES: 15,
  SESSION_DAYS_REMEMBER: 30,
  SESSION_HOURS_STANDARD: 8,
  RESET_CODE_EXPIRY_MINUTES: 15,
  MAX_FILE_SIZE_MB: 8,
  MAX_FILES_PER_REQUEST: 8,
  ALLOWED_EXTENSIONS: ['.pdf', '.jpg', '.jpeg', '.png'],
  ALLOWED_MIME_TYPES: ['application/pdf', 'image/jpeg', 'image/png']
};
