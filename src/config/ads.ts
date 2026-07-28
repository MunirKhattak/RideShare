// Google AdMob & AdSense Configuration
// Standard Google Test Ad Unit IDs are used by default
export const AD_CONFIG = {
  enabled: import.meta.env.VITE_ENABLE_ADS !== 'false',
  isTestMode: true,
  // Standard Google AdMob Test Unit IDs
  bannerAdUnitId: import.meta.env.VITE_ADMOB_BANNER_ID || "ca-app-pub-3940256099942544/6300978111",
  interstitialAdUnitId: import.meta.env.VITE_ADMOB_INTERSTITIAL_ID || "ca-app-pub-3940256099942544/1033173712",
  // Sample Ad Content for Preview
  sampleAds: [
    {
      title: "Kharaab Transport Ki Pareshani Khatam",
      description: "Pehle se apni seat ya gaadi book karein aur bina kisi zillat ke sukoon se safar karein.",
      sponsor: "EasyTravel Rides",
      badge: "Test Banner Ad",
      cta: "Book Ride",
      bgGradient: "from-blue-600 to-indigo-700",
      textColor: "text-white"
    },
    {
      title: "Fuel Kharchay Ki Bachat & Behtareen Munaafa",
      description: "Khali seats share karein aur rozana petrol ke kharchay bacha kar munaafa kamayein.",
      sponsor: "EasyTravel Driver",
      badge: "Test Banner Ad",
      cta: "Offer Ride",
      bgGradient: "from-emerald-600 to-teal-700",
      textColor: "text-white"
    },
    {
      title: "Aasaan & Mehfooz EasyTravel Safar",
      description: "Verified drivers, live location tracking aur ba-aasaani safar ki saholat.",
      sponsor: "EasyTravel Mobility",
      badge: "Test Banner Ad",
      cta: "Explore Now",
      bgGradient: "from-purple-600 to-pink-600",
      textColor: "text-white"
    }
  ]
};
