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
  Phone
} from 'lucide-react';
import { toast } from 'sonner';

interface LaunchSignInScreenProps {
  user: User | null;
  profile: UserProfile | null;
  setProfile: (p: UserProfile | null) => void;
  setView: (v: string) => void;
}

export default function LaunchSignInScreen({ user, profile, setProfile, setView }: LaunchSignInScreenProps) {
  const [step, setStep] = useState<1 | 2>(1); // 1 = Sign In, 2 = Complete Profile
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'driver' | 'passenger'>('passenger');
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
      if (errMsg.includes('auth/popup-closed-by-user') || (error && error.code === 'auth/popup-closed-by-user')) {
        toast.warning(
          "Sign-in popup band ho gaya. App use karne ke liye continue karein ya browser ke top bar se 'Open in New Tab' try karein.",
          { duration: 8000 }
        );
      } else {
        toast.error(`Sign in fail ho gaya. Please dobara try karein.`);
      }
    } finally {
      setIsSigningIn(false);
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
      const newProfile: UserProfile = {
        uid: user.uid,
        customId: customId,
        displayName: formData.displayName,
        email: user.email || '',
        photoURL: formData.photoURL,
        phoneNumber: formData.whatsappNumber,
        whatsappNumber: formData.whatsappNumber,
        role: selectedRole,
        easyCoins: 0,
        createdAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'users', user.uid), newProfile);
      setProfile(newProfile);
      toast.success(`Registration mukammal ho gayi! ID: ${customId}`);
      setView('dashboard');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'users');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between py-12 px-4 sm:px-6 lg:px-8 font-sans relative overflow-hidden">
      
      {/* Decorative background gradients (very subtle, clean) */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-100/30 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-red-50/40 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Header containing application branding matching the original splash screen */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center z-10">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center gap-4"
        >
          {/* Logo element identical to the splash screen */}
          <div className="bg-blue-600 w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/15">
            <span className="text-white font-black text-3xl italic">ET.</span>
          </div>

          <div className="flex flex-col items-center">
            <h1 className="text-4xl font-extrabold tracking-tight leading-none mb-2">
              <span className="text-red-600">Easy</span>
              <span className="text-blue-600">Travel</span>
            </h1>
            <p className="text-blue-500 font-bold text-xs tracking-tight flex items-center gap-1">
              Let's Travel Together 🚙
            </p>
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
            >
              <Card className="border border-slate-100 bg-white shadow-xl rounded-2xl p-2">
                <CardHeader className="text-center pb-4 pt-6">
                  <CardTitle className="text-xl font-bold text-slate-800">Khush Amdeed!</CardTitle>
                  <CardDescription className="text-slate-500 text-sm">
                    Apna safar shuru karne ke liye Continue karein.
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="space-y-4 px-6 pb-6 pt-2">
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-center">
                    <p className="text-slate-600 text-sm font-medium italic">
                      "Har safar ki ek kahani hoti hai, aap ki kya hai?"
                    </p>
                  </div>

                  {/* Continue with Google button */}
                  <Button 
                    onClick={handleGoogleSignIn} 
                    disabled={isSigningIn}
                    className="w-full py-6 text-base font-bold rounded-xl gap-3 bg-white text-slate-800 border border-slate-200 hover:bg-slate-50 shadow-sm transition-all duration-200 active:scale-[0.98] h-12"
                  >
                    {isSigningIn ? (
                      <div className="w-5 h-5 border-2 border-slate-800 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
                    )}
                    Continue with Google
                  </Button>

                  <div className="flex items-center justify-center gap-1.5 pt-2 text-[11px] text-slate-400 font-medium">
                    <ShieldCheck className="w-4 h-4 text-blue-500" />
                    Mehfooz aur Asaan Zariya Transport
                  </div>
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
                    <div className="space-y-2 pt-1">
                      <Label className="text-slate-700 text-xs font-bold">Aap kon hain?</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <Button 
                          type="button"
                          variant={selectedRole === 'driver' ? 'default' : 'outline'}
                          className={`h-11 rounded-xl text-xs font-bold transition-all border-slate-200 ${selectedRole === 'driver' ? 'bg-blue-600 hover:bg-blue-700 text-white border-none shadow-md shadow-blue-600/10' : 'bg-transparent text-slate-600 hover:bg-slate-50'}`}
                          onClick={() => setSelectedRole('driver')}
                        >
                          <Car className="w-3.5 h-3.5 mr-1" /> Car Owner
                        </Button>
                        <Button 
                          type="button"
                          variant={selectedRole === 'passenger' ? 'default' : 'outline'}
                          className={`h-11 rounded-xl text-xs font-bold transition-all border-slate-200 ${selectedRole === 'passenger' ? 'bg-blue-600 hover:bg-blue-700 text-white border-none shadow-md shadow-blue-600/10' : 'bg-transparent text-slate-600 hover:bg-slate-50'}`}
                          onClick={() => setSelectedRole('passenger')}
                        >
                          <UserIcon className="w-3.5 h-3.5 mr-1" /> Passenger
                        </Button>
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

      {/* Footer containing standard guidelines */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center z-10">
        <p className="text-[11px] text-slate-400 font-medium">
          Aage barhne se aap hamari{' '}
          <span className="text-blue-500 underline cursor-pointer hover:text-blue-600 font-bold" onClick={() => setView('privacy_policy')}>Privacy Policy</span>{' '}
          se ittifaq karte hain.
        </p>
        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1.5">
          EasyTravel Safe Transportation Program © 2026
        </p>
      </div>

    </div>
  );
}
