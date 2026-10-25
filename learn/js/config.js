// Settings for the online learning pages (see ONLINE-LEARNING.md).
//
// The Supabase project URL and its publishable ("anon") key are meant to be
// public. What each visitor can see and do is decided by the database's access
// rules, not by hiding these values. Never put a secret or service-role key here.
export const config = {
  supabaseUrl: '',
  supabaseKey: '',
  // Turn on once the Razorpay keys are added to Supabase. While off, the plans
  // page asks students to call or WhatsApp the school to join.
  onlinePayments: false,
  // Shows "Continue with Google" (needs the Google provider set up in Supabase Auth).
  googleSignIn: false,
  schoolPhone: '+919514488517',
  schoolWhatsApp: '919514488517',
};
