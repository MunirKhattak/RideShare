import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, signInWithGoogle, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile } from '../types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Car, 
  User as UserIcon, 
  ArrowRight, 
  Check, 
  ShieldCheck, 
  Phone,
  Bike
} from 'lucide-react';
import { toast } from 'sonner';

interface LaunchSignInScreenProps {
  user: User | null;
  profile: UserProfile | null;
  setUser?: (u: any) => void;
  setProfile: (p: UserProfile | null) => void;
  setView: (v: string) => void;
}

export default function LaunchSignInScreen({ user, profile, setUser, setProfile, setView }: LaunchSignInScreenProps) {
  const [step, setStep] = useState<1 | 2>(1); // 1 = Sign In, 2 = Complete Profile
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [roleGroup, setRoleGroup] = useState<'vehicle_owner' | 'passenger'>('vehicle_owner');
  const [subVehicleType, setSubVehicleType] = useState<'Car' | 'Bike'>('Car');
  const [formData, setFormData] = useState({
    displayName: '',
    whatsappNumber: '',
    photoURL: ''
  });

  // Track if we need to show profile completion when user updates
  useEffect(() => {
    if (user && !profile) {
      setFormData({
        displayName: user.displayName || '',
        whatsappNumber: '',
        photoURL: user.photoURL || ''
      });
      setStep(2);
    } else if (user && profile) {
      // Completed, go to main dashboard
      setView('dashboard');
    }
  }, [user, profile, setView]);

  const handleGoogleSignIn = async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    try {
      const result = await signInWithGoogle();
      if (result) {
        // Fetch user doc
        const userDoc = await getDoc(doc(db, 'users', result.uid));
        if (userDoc.exists()) {
          const p = userDoc.data() as UserProfile;
          setProfile(p);
          toast.success(`Khush Amdeed, ${p.displayName}!`);
          setView('dashboard');
        } else {
          // Proceed to profile completion (handled by useEffect)
          setStep(2);
        }
      }
    } catch (error: any) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.warn("Google Sign-In failed, fallback to Guest mode activated:", error);
      
      // Since Google Login is blocked/failed in the iframe, let's auto-login with Demo Guest mode instantly
      toast.warning(
        "Google Login is blocked in iframe/browser! Securing with Demo Guest mode...",
        { duration: 5000 }
      );
      
      setTimeout(() => {
        handleOfflineGuestSignIn();
      }, 1000);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleOfflineGuestSignIn = () => {
    try {
      const mockUid = `mock-${Math.floor(100000 + Math.random() * 900000)}`;
      const mockUser = {
        uid: mockUid,
        displayName: 'Demo Guest User',
        email: 'demo@easytravel.com',
        photoURL: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150'
      };
      
      // Save to localStorage
      localStorage.setItem('easytravel_mock_user', JSON.stringify(mockUser));
      
      // Dispatch state update directly
      if (setUser) {
        setUser(mockUser as any);
      }
      
      // Dispatch event to notify App component about auth change
      window.dispatchEvent(new Event('easytravel_mock_auth_changed'));
      
      toast.success("Demo Guest mode kamyab! Apne profile ki maloomat darj karein.");
    } catch (err) {
      toast.error("Offline login fail ho gaya.");
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || isSubmitting) return;

    // Phone number validation: 03 followed by 9 digits (11 total digits)
    const phoneRegex = /^03\d{9}$/;
    if (!phoneRegex.test(formData.whatsappNumber)) {
      toast.error('WhatsApp number 03 se shuru hona chahiye aur 11 digits ka hona chahiye (e.g., 03001234567)');
      return;
    }

    setIsSubmitting(true);
    try {
      const customId = `ET-${Math.floor(100000 + Math.random() * 900000)}`;
      const newProfile: any = {
        uid: user.uid,
        customId: customId,
        displayName: formData.displayName,
        email: user.email || '',
        photoURL: formData.photoURL,
        phoneNumber: formData.whatsappNumber,
        whatsappNumber: formData.whatsappNumber,
        role: roleGroup === 'passenger' ? 'passenger' : 'driver',
        easyCoins: 0,
        createdAt: new Date(),
      };

      if (roleGroup === 'vehicle_owner') {
        newProfile.vehicleType = subVehicleType;
      }

      if (user.uid.startsWith('mock-')) {
        localStorage.setItem(`easytravel_mock_profile_${user.uid}`, JSON.stringify(newProfile));
        localStorage.setItem('easytravel_mock_profile', JSON.stringify(newProfile));
        setProfile(newProfile);
        toast.success(`Registration mukammal ho gayi! ID: ${customId}`);
        setView('dashboard');
      } else {
        try {
          const finalProfile = {
            ...newProfile,
            createdAt: serverTimestamp()
          };
          await setDoc(doc(db, 'users', user.uid), finalProfile);
          setProfile(newProfile);
          toast.success(`Registration mukammal ho gayi! ID: ${customId}`);
          setView('dashboard');
        } catch (dbErr) {
          console.warn("Could not save profile to Firestore, saving locally as backup:", dbErr);
          localStorage.setItem(`easytravel_mock_profile_${user.uid}`, JSON.stringify(newProfile));
          localStorage.setItem('easytravel_mock_profile', JSON.stringify(newProfile));
          setProfile(newProfile);
          toast.success(`Registration locally save ho gayi! ID: ${customId}`);
          setView('dashboard');
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'users');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-premium-login-gradient flex flex-col justify-start py-8 pb-24 px-4 sm:px-6 lg:px-8 font-sans relative overflow-y-auto">
      
      {/* Decorative background gradients (very subtle, clean) */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-100/20 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-red-50/30 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Header containing application branding matching the original splash screen */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center z-10">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center gap-4"
        >
          {/* Logo element identical to the splash screen */}
          <div className="w-20 h-20 flex items-center justify-center">
            <img src="/icon.svg" className="w-20 h-20 object-contain drop-shadow-lg" alt="EasyTravel Logo" referrerPolicy="no-referrer" />
          </div>

          <div className="flex flex-col items-center">
            <h1 className="text-4xl font-extrabold tracking-tight leading-none mb-2">
              <span className="text-red-600">Easy</span>
              <span className="text-blue-600">Travel</span>
            </h1>
            
            {/* Center-aligned beautiful animated tagline with driving car - w-56 with meticulously calculated safe boundaries */}
            <div className="h-6 w-56 relative overflow-hidden mt-1 mx-auto">
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <motion.div
                  animate={{ 
                    clipPath: [
                      "inset(0 100% 0 0)",
                      "inset(0 0% 0 0)",
                      "inset(0 0% 0 0)",
                      "inset(0 0% 0 100%)",
                      "inset(0 100% 0 0)"
                    ]
                  }}
                  transition={{ 
                    duration: 6, 
                    repeat: Infinity, 
                    ease: "easeInOut" 
                  }}
                  className="text-blue-500 font-extrabold text-xs tracking-wide whitespace-nowrap"
                >
                  Let's Travel Together
                </motion.div>
              </div>

              <motion.div
                animate={{ 
                  left: ["14%", "81%", "81%", "14%", "14%"],
                  rotateY: [0, 0, 180, 180, 0]
                }}
                transition={{ 
                  duration: 6, 
                  repeat: Infinity, 
                  ease: "easeInOut",
                  times: [0, 0.45, 0.5, 0.95, 1]
                }}
                className="absolute bottom-0.5"
              >
                <div className="relative">
                  <Car className="w-4 h-4 text-blue-600 fill-blue-100/50" />
                  <motion.div 
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{ duration: 0.3, repeat: Infinity }}
                    className="absolute -left-0.5 top-1/2 w-1 h-0.5 bg-blue-400/50 blur-[0.5px]"
                  />
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Main card or content area */}
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md z-10">
        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.div
              key="signin-view"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              {/* Card 1: The Problem Card (Halka Sa Red/Orange Warm Tint) */}
              <Card className="border border-red-100 bg-[#FEF2F2] shadow-lg rounded-2xl p-2 transition-all duration-300">
                <CardHeader className="text-center pb-3 pt-5 px-4">
                  <CardTitle className="text-[14px] sm:text-[15px] font-extrabold text-slate-800 leading-snug px-2">
                    Es Digital Daur Me Bhi Kharaab Transport aur Bhaari Karaaye Se Pareshan Hain?
                  </CardTitle>
                </CardHeader>
              </Card>

              {/* Card 2: The Solution & Login Card (Pure White Card) */}
              <Card className="border border-slate-100 bg-white shadow-xl rounded-2xl p-2 transition-all duration-300">
                <CardHeader className="text-center pb-2 pt-6 px-6">
                  <CardDescription className="text-[#333333] text-sm sm:text-base mt-1 leading-relaxed px-2 font-semibold">
                    Ab pareshan hona chorh dein! <span className="text-blue-600 font-bold">EasyTravel</span> laya hai aik hi click me in sab maslon ka behtareen Digital Solution.
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="space-y-4 px-6 pb-6 pt-4">
                  {/* Continue with Google button with a subtle popup movement */}
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 12 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    transition={{ 
                      type: "spring",
                      stiffness: 200,
                      damping: 18,
                      delay: 0.1
                    }}
                  >
                    <motion.div
                      animate={{
                        scale: [1, 1.025, 1],
                      }}
                      transition={{
                        duration: 2.4,
                        repeat: Infinity,
                        repeatType: "reverse",
                        ease: "easeInOut"
                      }}
                      whileHover={{ scale: 1.04, y: -1 }}
                      whileTap={{ scale: 0.98, y: 1 }}
                    >
                      <Button 
                        onClick={handleGoogleSignIn} 
                        disabled={isSigningIn}
                        className="w-full py-6 text-base font-extrabold rounded-xl gap-3 bg-white text-slate-800 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 shadow-md transition-all duration-200 h-12"
                      >
                        {isSigningIn ? (
                          <div className="w-5 h-5 border-2 border-slate-800 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
                        )}
                        Continue with Google
                      </Button>
                    </motion.div>
                  </motion.div>


                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="complete-profile-view"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
            >
              <Card className="border border-slate-100 bg-white shadow-xl rounded-2xl p-2">
                <CardHeader className="text-center pb-2 pt-6">
                  <CardTitle className="text-xl font-bold text-slate-800">Profile Mukammal Karein</CardTitle>
                  <CardDescription className="text-slate-500 text-sm">
                    Apni maloomat darj karein taake log aap se rabta kar sakein.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-6 pb-6 pt-2">
                  <form onSubmit={handleProfileSubmit} className="space-y-4">
                    <div className="flex justify-center mb-4">
                      <Avatar className="w-16 h-16 border-2 border-blue-500">
                        <AvatarImage src={formData.photoURL} />
                        <AvatarFallback className="bg-slate-100 text-slate-800">{formData.displayName.charAt(0) || 'U'}</AvatarFallback>
                      </Avatar>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-slate-700 text-xs font-bold">Poora Naam</Label>
                      <Input 
                        value={formData.displayName} 
                        onChange={e => setFormData({...formData, displayName: e.target.value})} 
                        required 
                        placeholder="Apna poora naam likhein"
                        className="bg-white border-slate-200 text-slate-950 rounded-xl h-11 placeholder:text-slate-400 focus:border-blue-500 font-medium"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-slate-700 text-xs font-bold">WhatsApp Number</Label>
                      <div className="relative">
                        <Phone className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                        <Input 
                          placeholder="e.g. 03001234567" 
                          value={formData.whatsappNumber} 
                          onChange={e => setFormData({...formData, whatsappNumber: e.target.value})} 
                          required 
                          className="pl-10 bg-white border-slate-200 text-slate-950 rounded-xl h-11 placeholder:text-slate-400 font-semibold"
                        />
                      </div>
                      <p className="text-[10px] text-slate-400 italic">WhatsApp number 03 se shuru hona chahiye (pure 11 digits).</p>
                    </div>

                    {/* Choose Role Selection */}
                    <div className="space-y-3 pt-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-slate-700 text-xs font-bold">Apna Role select kren</Label>
                        <span className="text-[10px] text-slate-400 font-medium">(baad me ap role change kr skte hain)</span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <Button 
                          type="button"
                          variant={roleGroup === 'vehicle_owner' ? 'default' : 'outline'}
                          className={`h-11 rounded-xl text-xs font-bold transition-all border-slate-200 ${
                            roleGroup === 'vehicle_owner' 
                              ? 'bg-blue-600 hover:bg-blue-700 text-white border-none shadow-md shadow-blue-600/10' 
                              : 'bg-transparent text-slate-600 hover:bg-slate-50'
                          }`}
                          onClick={() => setRoleGroup('vehicle_owner')}
                        >
                          <Car className="w-3.5 h-3.5 mr-1" /> Vehicle Owner
                        </Button>
                        
                        <Button 
                          type="button"
                          variant={roleGroup === 'passenger' ? 'default' : 'outline'}
                          className={`h-11 rounded-xl text-xs font-bold transition-all border-slate-200 ${
                            roleGroup === 'passenger' 
                              ? 'bg-blue-600 hover:bg-blue-700 text-white border-none shadow-md shadow-blue-600/10' 
                              : 'bg-transparent text-slate-600 hover:bg-slate-50'
                          }`}
                          onClick={() => setRoleGroup('passenger')}
                        >
                          <UserIcon className="w-3.5 h-3.5 mr-1" /> Passenger
                        </Button>
                      </div>

                      <div className="space-y-1.5 p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                        <Label className="text-slate-500 text-[10px] font-extrabold uppercase tracking-wider block">
                          Vehicle ki qisam {roleGroup !== 'vehicle_owner' && <span className="text-slate-400 font-normal normal-case">(Sirf Vehicle Owner ke liye)</span>}
                        </Label>
                        <div className="grid grid-cols-2 gap-2">
                          <Button 
                            type="button"
                            variant={subVehicleType === 'Car' ? 'default' : 'outline'}
                            className={`h-9 rounded-lg text-[11px] font-bold transition-all border-slate-200 ${
                              subVehicleType === 'Car' 
                                ? 'bg-slate-900 hover:bg-slate-800 text-white border-none shadow-sm' 
                                : 'bg-white text-slate-600 hover:bg-slate-50'
                            } ${roleGroup !== 'vehicle_owner' ? 'opacity-50 cursor-not-allowed' : ''}`}
                            onClick={() => {
                              if (roleGroup === 'vehicle_owner') {
                                setSubVehicleType('Car');
                              } else {
                                setRoleGroup('vehicle_owner');
                                setSubVehicleType('Car');
                              }
                            }}
                          >
                            <Car className="w-3 h-3 mr-1" /> Car Owner
                          </Button>
                          
                          <Button 
                            type="button"
                            variant={subVehicleType === 'Bike' ? 'default' : 'outline'}
                            className={`h-9 rounded-lg text-[11px] font-bold transition-all border-slate-200 ${
                              subVehicleType === 'Bike' 
                                ? 'bg-slate-900 hover:bg-slate-800 text-white border-none shadow-sm' 
                                : 'bg-white text-slate-600 hover:bg-slate-50'
                            } ${roleGroup !== 'vehicle_owner' ? 'opacity-50 cursor-not-allowed' : ''}`}
                            onClick={() => {
                              if (roleGroup === 'vehicle_owner') {
                                setSubVehicleType('Bike');
                              } else {
                                setRoleGroup('vehicle_owner');
                                setSubVehicleType('Bike');
                              }
                            }}
                          >
                            <Bike className="w-3 h-3 mr-1" /> Bike Owner
                          </Button>
                        </div>
                      </div>
                    </div>

                    <Button 
                      type="submit" 
                      disabled={isSubmitting}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl h-11 mt-4 shadow-lg shadow-blue-600/15 active:scale-[0.98]"
                    >
                      {isSubmitting ? 'Pukaara ja raha hai...' : 'Register Karein'} <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer deleted to clean layout and satisfy user design instructions */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center z-10" />

    </div>
  );
}
