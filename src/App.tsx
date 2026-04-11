import { memo, useState, useEffect } from 'react';
import { auth, db, signInWithGoogle, logout, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp, 
  orderBy,
  getDoc,
  setDoc,
  deleteDoc,
  limit,
  increment,
  getCountFromServer
} from 'firebase/firestore';
import { UserProfile, Ride, RideRequest, ChatMessage, Complaint, Analytics, Warning } from './types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Toaster, toast } from 'sonner';
import { 
  Car, 
  User as UserIcon, 
  Search, 
  Plus, 
  MessageSquare, 
  Phone, 
  Navigation, 
  Clock, 
  Calendar as CalendarIcon,
  MapPin,
  LogOut,
  Sparkles,
  Send,
  MessageCircle,
  ShieldCheck,
  Users,
  LayoutDashboard,
  AlertCircle,
  Eye,
  Info
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [view, setView] = useState<'main' | 'register' | 'dashboard' | 'search' | 'post' | 'profile_view' | 'chat' | 'my_rides' | 'my_requests' | 'edit_profile' | 'admin_dashboard' | 'complaint'>('main');
  const [activeWarning, setActiveWarning] = useState<Warning | null>(null);
  const [activeComplaintReply, setActiveComplaintReply] = useState<Complaint | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });
  }, []);

  const handleInstall = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult: any) => {
        if (choiceResult.outcome === 'accepted') {
          setDeferredPrompt(null);
        }
      });
    }
  };

  useEffect(() => {
    if (!user) return;
    
    // Listen for pending warnings for this user
    const q = query(collection(db, 'warnings'), where('userId', '==', user.uid), where('status', '==', 'pending'));
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        setActiveWarning({ id: snap.docs[0].id, ...snap.docs[0].data() } as Warning);
      } else {
        setActiveWarning(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'warnings');
    });

    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    
    // Listen for resolved complaints with admin replies that haven't been acknowledged
    const q = query(
      collection(db, 'complaints'), 
      where('userId', '==', user.uid), 
      where('status', '==', 'resolved'),
      where('userAcknowledged', '==', false)
    );
    const unsub = onSnapshot(q, (snap) => {
      const replied = snap.docs.find(doc => doc.data().adminReply);
      if (replied) {
        setActiveComplaintReply({ id: replied.id, ...replied.data() } as Complaint);
      } else {
        setActiveComplaintReply(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'complaints');
    });

    return () => unsub();
  }, [user]);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [userRole, setUserRole] = useState<'driver' | 'passenger' | null>(null);
  const [rides, setRides] = useState<Ride[]>([]);
  const [requests, setRequests] = useState<RideRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<any>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        setUser(currentUser);
        if (currentUser) {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (userDoc.exists()) {
            const p = userDoc.data() as UserProfile;
            setProfile(p);
            setUserRole(p.role as any);
          }
        } else {
          setProfile(null);
          setUserRole(null);
        }
      } catch (error) {
        console.error("Auth listener error:", error);
      } finally {
        setLoading(false);
      }
    });

    // Fallback to stop loading if Firebase takes too long
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 5000);

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  // Real-time Listeners
  useEffect(() => {
    if (!user) return;
    const qRides = query(
      collection(db, 'rides'), 
      where('status', '==', 'available'), 
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const unsubRides = onSnapshot(qRides, (snapshot) => {
      setRides(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ride)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'rides');
    });
    const qReqs = query(
      collection(db, 'rideRequests'), 
      where('status', '==', 'pending'), 
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const unsubReqs = onSnapshot(qReqs, (snapshot) => {
      setRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RideRequest)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'rideRequests');
    });
    return () => { unsubRides(); unsubReqs(); };
  }, [user]);

  // Notification Listener
  useEffect(() => {
    if (!user) return;

    // Request permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const sendNotification = (title: string, body: string) => {
      // Browser Notification
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(title, { 
            body, 
            icon: '/favicon.ico',
            tag: title // Prevent duplicate notifications for same event
          });
        } catch (e) {
          console.error('Notification error:', e);
        }
      }
      // In-app Toast
      toast.info(title, { description: body });
    };

    // 1. Listen for new ride requests (for drivers)
    const qNewRequests = query(
      collection(db, 'rideRequests'),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc'),
      limit(5)
    );
    
    let initialRequestsLoad = true;
    const unsubNewRequests = onSnapshot(qNewRequests, (snapshot) => {
      if (initialRequestsLoad) {
        initialRequestsLoad = false;
        return;
      }
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' && userRole === 'driver') {
          const req = change.doc.data() as RideRequest;
          // Only notify if it's not the user's own request
          if (req.passengerId !== user.uid) {
            sendNotification('New Ride Request', `${req.passengerName} needs a ride to ${req.destination}`);
          }
        }
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'rideRequests');
    });

    // 2. Listen for ride confirmations (for passengers)
    const qMyRequests = query(
      collection(db, 'rideRequests'),
      where('passengerId', '==', user.uid)
    );
    
    let initialMyRequestsLoad = true;
    const unsubMyRequests = onSnapshot(qMyRequests, (snapshot) => {
      if (initialMyRequestsLoad) {
        initialMyRequestsLoad = false;
        return;
      }
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'modified') {
          const req = change.doc.data() as RideRequest;
          if (req.status === 'matched') {
            sendNotification('Ride Confirmed!', `Your request to ${req.destination} has been matched.`);
          }
        }
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'rideRequests');
    });

    // 3. Listen for new messages
    const qMessages = query(
      collection(db, 'messages'),
      where('receiverId', '==', user.uid),
      orderBy('timestamp', 'desc'),
      limit(1)
    );
    
    let initialMessagesLoad = true;
    const unsubMessages = onSnapshot(qMessages, (snapshot) => {
      if (initialMessagesLoad) {
        initialMessagesLoad = false;
        return;
      }
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const msg = change.doc.data() as ChatMessage;
          sendNotification('New Message', msg.text);
        }
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'messages');
    });

    return () => {
      unsubNewRequests();
      unsubMyRequests();
      unsubMessages();
    };
  }, [user, userRole]);

  // Visit Tracking
  useEffect(() => {
    const trackVisit = async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const analyticsRef = doc(db, 'analytics', today);
      try {
        const docSnap = await getDoc(analyticsRef);
        if (docSnap.exists()) {
          await updateDoc(analyticsRef, { visits: increment(1) });
        } else {
          await setDoc(analyticsRef, { visits: 1 });
        }
      } catch (error) {
        console.error("Visit tracking error:", error);
      }
    };
    trackVisit();
  }, []);

  if (loading) return <LoadingSpinner />;

  const renderView = () => {
    switch (view) {
      case 'main':
        return <MainPage setView={setView} setUserRole={setUserRole} user={user} />;
      case 'register':
        return <RegistrationForm user={user} role={userRole!} setView={setView} setProfile={setProfile} />;
      case 'dashboard':
        return <Dashboard user={user} profile={profile} setView={setView} userRole={userRole!} />;
      case 'post':
        return <PostForm user={user} profile={profile} setView={setView} type={userRole === 'driver' ? 'ride' : 'request'} />;
      case 'search':
        return <RouteSearch setView={setView} userRole={userRole!} setSelectedItem={setSelectedItem} />;
      case 'profile_view':
        return <DetailedProfileView item={selectedItem} setView={setView} />;
      case 'my_rides':
        return <MyRides user={user} setView={setView} />;
      case 'my_requests':
        return <MyRequests user={user} setView={setView} />;
      case 'edit_profile':
        return <EditProfile user={user} profile={profile} setView={setView} setProfile={setProfile} />;
      case 'admin_dashboard':
        return <AdminDashboard setView={setView} />;
      case 'complaint':
        return <ComplaintForm user={user} profile={profile} setView={setView} />;
      default:
        return <MainPage setView={setView} setUserRole={setUserRole} user={user} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Toaster position="top-center" />
      <Header user={user} setView={setView} onSignInClick={() => setShowSignInModal(true)} onInstall={deferredPrompt ? handleInstall : undefined} />
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {renderView()}
          </motion.div>
        </AnimatePresence>
      </main>
      <AnimatedFooter setView={setView} />

      {activeWarning && view === 'dashboard' && (
        <UserWarningModal warning={activeWarning} onClose={() => setActiveWarning(null)} />
      )}

      {activeComplaintReply && view === 'dashboard' && (
        <ComplaintReplyModal complaint={activeComplaintReply} onClose={() => setActiveComplaintReply(null)} />
      )}

      {/* Sign In Modal */}
      <AnimatePresence>
        {showSignInModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md"
            >
              <RegistrationForm 
                user={user} 
                role={userRole || 'passenger'} 
                setView={(v) => { setView(v); setShowSignInModal(false); }} 
                setProfile={(p) => { setProfile(p); setShowSignInModal(false); }}
                onClose={() => setShowSignInModal(false)}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Header({ user, setView, onSignInClick, onInstall }: { user: User | null, setView: (v: any) => void, onSignInClick: () => void, onInstall?: () => void }) {
  return (
    <header className="bg-white border-b sticky top-0 z-50 shadow-sm">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('main')}>
          <div className="bg-blue-600 w-10 h-10 rounded-lg flex items-center justify-center shadow-md">
            <span className="text-white font-black text-xl italic">R.</span>
          </div>
          <div className="flex flex-col">
            <h1 className="text-2xl font-black tracking-tighter leading-none">
              <span className="text-red-600">Ride</span>
              <span className="text-blue-600">Share</span>
            </h1>
            
            {/* Car Animation directly below App Name */}
            <div className="h-5 w-28 relative overflow-hidden mt-0.5">
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
                  className="text-blue-500 font-bold text-[8px] tracking-tighter whitespace-nowrap"
                >
                  Let's Share Our Ride
                </motion.div>
              </div>

              <motion.div
                animate={{ 
                  left: ["0%", "85%", "85%", "0%", "0%"],
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
        </div>
        <div className="flex items-center gap-3">
          {onInstall && (
            <Button 
              variant="outline" 
              size="sm" 
              className="rounded-full border-blue-500 text-blue-600 hover:bg-blue-50 h-8 text-xs font-bold animate-slow-blink" 
              onClick={onInstall}
            >
              Install App
            </Button>
          )}
          {user && user.email === 'munirkhattak.pk@gmail.com' && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="flex gap-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-full px-2 h-8"
              onClick={() => setView('admin_dashboard')}
            >
              <ShieldCheck className="w-4 h-4" />
              <span className="text-xs font-bold">Admin</span>
            </Button>
          )}
          {user ? (
            <div className="flex items-center gap-3 bg-slate-100 p-1 pr-3 rounded-full">
              <Avatar className="w-8 h-8 border cursor-pointer hover:ring-2 ring-blue-400 transition-all" onClick={() => setView('dashboard')}>
                <AvatarImage src={user.photoURL || ''} />
                <AvatarFallback>{user.displayName?.charAt(0)}</AvatarFallback>
              </Avatar>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={logout}>
                <LogOut className="w-4 h-4 text-slate-500" />
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="rounded-full px-6 border-blue-200 text-blue-600 hover:bg-blue-50" onClick={onSignInClick}>
              Sign In
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

function MainPage({ setView, setUserRole, user }: { setView: (v: any) => void, setUserRole: (r: any) => void, user: User | null }) {
  return (
    <div className="space-y-6 py-6">
      <div className="text-center space-y-3">
        <motion.h2 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight flex flex-col items-center"
        >
          <span>RideShare me</span>
          <span className="text-blue-600">Khush Amdeed!</span>
        </motion.h2>
        <div className="space-y-2 max-w-2xl mx-auto px-4">
          <p className="text-xl font-semibold text-slate-700">
            Ab Karak se ya Kesi bhi Shehar se - Safar hua Bahut Asaan
          </p>
          <p className="text-slate-500 leading-relaxed">
            Passenger ho ya Car Owner - Kesi bhi waqt safar karen Entehaai Araam aur Kam Kharchay k saath
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-4">
        <motion.div
          whileHover={{ scale: 1.02, translateY: -5 }}
          whileTap={{ scale: 0.98 }}
        >
          <Card 
            className="h-full cursor-pointer border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-800 text-white group relative"
            onClick={() => { setUserRole('driver'); setView(user ? 'dashboard' : 'register'); }}
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Car className="w-24 h-24 rotate-12" />
            </div>
            <CardHeader className="p-6 relative z-10">
              <div className="bg-white/20 w-12 h-12 rounded-xl flex items-center justify-center mb-4 backdrop-blur-md">
                <Car className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-3xl font-bold mb-1">Main Car Owner Hoon</CardTitle>
              <CardDescription className="text-blue-100 text-lg font-medium">
                Mujhe Passenger Chahye
              </CardDescription>
            </CardHeader>
          </Card>
        </motion.div>

        <motion.div
          whileHover={{ scale: 1.02, translateY: -5 }}
          whileTap={{ scale: 0.98 }}
        >
          <Card 
            className="h-full cursor-pointer border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-gradient-to-br from-orange-500 to-rose-600 text-white group relative"
            onClick={() => { setUserRole('passenger'); setView(user ? 'dashboard' : 'register'); }}
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <UserIcon className="w-24 h-24 -rotate-12" />
            </div>
            <CardHeader className="p-6 relative z-10">
              <div className="bg-white/20 w-12 h-12 rounded-xl flex items-center justify-center mb-4 backdrop-blur-md">
                <UserIcon className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-3xl font-bold mb-1">Main Passenger Hoon</CardTitle>
              <CardDescription className="text-orange-50/90 text-lg font-medium">
                Mujhe Ride Chahye
              </CardDescription>
            </CardHeader>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

function RegistrationForm({ user, role: initialRole, setView, setProfile, onClose }: { user: User | null, role: 'driver' | 'passenger', setView: (v: any) => void, setProfile: (p: any) => void, onClose?: () => void }) {
  const [step, setStep] = useState(user ? 2 : 1);
  const [selectedRole, setSelectedRole] = useState<'driver' | 'passenger'>(initialRole);
  const [formData, setFormData] = useState({
    displayName: user?.displayName || '',
    phoneNumber: '',
    whatsappNumber: '',
    photoURL: user?.photoURL || ''
  });

  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithGoogle();
      if (result) {
        setFormData(prev => ({
          ...prev,
          displayName: result.displayName || '',
          photoURL: result.photoURL || ''
        }));
        setStep(2);
      }
    } catch (error) {
      toast.error(`Sign in fail ho gaya: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const customId = `RS-${Math.floor(100000 + Math.random() * 900000)}`;
      const newProfile: UserProfile = {
        uid: user.uid,
        customId: customId,
        displayName: formData.displayName,
        email: user.email || '',
        photoURL: formData.photoURL,
        phoneNumber: formData.phoneNumber,
        whatsappNumber: formData.whatsappNumber,
        role: selectedRole,
        createdAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'users', user.uid), newProfile);
      setProfile(newProfile);
      toast.success(`Registration mukammal ho gayi! Aap ki ID: ${customId}`);
      setView('dashboard');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'users');
    }
  };

  if (step === 1) {
    return (
      <Card className="max-w-md mx-auto mt-10 relative">
        {onClose && (
          <Button variant="ghost" size="icon" className="absolute right-2 top-2" onClick={onClose}>
            <Plus className="rotate-45" />
          </Button>
        )}
        <CardHeader className="text-center">
          <CardTitle>Sign In Karein</CardTitle>
          <CardDescription>{selectedRole === 'driver' ? 'Car Owner' : 'Passenger'} ke taur par continue karein</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleGoogleSignIn} className="w-full py-6 text-lg gap-3 bg-white text-slate-900 border hover:bg-slate-50">
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="Google" />
            Continue with Google
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-md mx-auto mt-10 relative">
      {onClose && (
        <Button variant="ghost" size="icon" className="absolute right-2 top-2" onClick={onClose}>
          <Plus className="rotate-45" />
        </Button>
      )}
      <CardHeader>
        <CardTitle>Profile Mukammal Karein</CardTitle>
        <CardDescription>Apni maloomat darj karein</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex justify-center mb-6">
            <Avatar className="w-24 h-24 border-4 border-blue-100">
              <AvatarImage src={formData.photoURL} />
              <AvatarFallback>{formData.displayName.charAt(0)}</AvatarFallback>
            </Avatar>
          </div>
          <div className="space-y-2">
            <Label>Naam</Label>
            <Input value={formData.displayName} onChange={e => setFormData({...formData, displayName: e.target.value})} required />
          </div>
          <div className="space-y-2">
            <Label>WhatsApp Number</Label>
            <Input placeholder="+92..." value={formData.whatsappNumber} onChange={e => setFormData({...formData, whatsappNumber: e.target.value})} required />
          </div>
          <div className="space-y-2">
            <Label>Phone Number</Label>
            <Input placeholder="+92..." value={formData.phoneNumber} onChange={e => setFormData({...formData, phoneNumber: e.target.value})} required />
          </div>
          <div className="space-y-3">
            <Label className="text-base font-bold">Apna Status Bataen</Label>
            <div className="grid grid-cols-2 gap-3">
              <Button 
                type="button"
                variant={selectedRole === 'driver' ? 'default' : 'outline'}
                className={`h-12 rounded-xl ${selectedRole === 'driver' ? 'bg-blue-600' : ''}`}
                onClick={() => setSelectedRole('driver')}
              >
                Car Owner
              </Button>
              <Button 
                type="button"
                variant={selectedRole === 'passenger' ? 'default' : 'outline'}
                className={`h-12 rounded-xl ${selectedRole === 'passenger' ? 'bg-orange-500' : ''}`}
                onClick={() => setSelectedRole('passenger')}
              >
                Passenger
              </Button>
            </div>
          </div>
          <Button type="submit" className="w-full py-6 text-lg bg-blue-600 hover:bg-blue-700 rounded-xl">
            Register Karein
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ComplaintForm({ user, profile, setView }: { user: User | null, profile: UserProfile | null, setView: (v: any) => void }) {
  const [formData, setFormData] = useState({
    subject: '',
    description: ''
  });
  const [submittedNumber, setSubmittedNumber] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    try {
      const complaintNumber = `COMP-${Math.floor(100000 + Math.random() * 900000)}`;
      await addDoc(collection(db, 'complaints'), {
        userId: user.uid,
        userName: profile.displayName,
        userCustomId: profile.customId,
        complaintNumber: complaintNumber,
        subject: formData.subject,
        description: formData.description,
        status: 'pending',
        userAcknowledged: false,
        createdAt: serverTimestamp()
      });
      setSubmittedNumber(complaintNumber);
      toast.success("Complaint darj kar di gayi hai. Shukriya!");
      
      // Show number for 10 seconds then go back to dashboard
      setTimeout(() => {
        setSubmittedNumber(null);
        setView('dashboard');
      }, 10000);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'complaints');
    }
  };

  if (submittedNumber) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-6 text-center animate-in fade-in zoom-in duration-300">
        <div className="bg-emerald-100 p-6 rounded-full">
          <Sparkles className="w-12 h-12 text-emerald-600" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-slate-900">Shikayat Darj Ho Gayi!</h2>
          <p className="text-slate-500">Aap ka Complaint Number ye hai:</p>
        </div>
        <div className="bg-slate-900 text-white px-8 py-4 rounded-2xl shadow-2xl">
          <p className="text-4xl font-black tracking-widest font-mono">{submittedNumber}</p>
        </div>
        <p className="text-sm text-slate-400 max-w-xs">
          Iska screenshot le lein ya note kar lein. Ye screen 10 seconds baad khud band ho jayegi.
        </p>
        <Button variant="outline" onClick={() => setView('dashboard')}>Dashboard Par Jayen</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => setView('dashboard')}>
          <Navigation className="rotate-180" />
        </Button>
        <h2 className="text-xl font-bold">Shikayat Darj Karein</h2>
      </div>

      <Card className="max-w-md mx-auto border-none shadow-2xl rounded-[2rem] overflow-hidden">
        <CardHeader className="bg-slate-900 text-white p-8">
          <CardTitle className="text-2xl">Complaint Form</CardTitle>
          <CardDescription className="text-slate-300">Hamein batayein ke aap ko kya masla pesh aya.</CardDescription>
        </CardHeader>
        <CardContent className="p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label className="text-slate-700 font-bold">Unwan (Subject)</Label>
              <Input 
                className="h-12 rounded-xl border-slate-200 focus:ring-rose-500 focus:border-rose-500"
                value={formData.subject} 
                onChange={e => setFormData({...formData, subject: e.target.value})} 
                placeholder="Masle ka unwan..."
                required 
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700 font-bold">Tafseel (Description)</Label>
              <textarea 
                className="flex min-h-[150px] w-full rounded-xl border border-slate-200 bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.description} 
                onChange={e => setFormData({...formData, description: e.target.value})} 
                placeholder="Apni shikayat tafseel se bayan karein..."
                required 
              />
            </div>
            <Button type="submit" className="w-full h-14 text-lg font-bold bg-rose-600 hover:bg-rose-700 rounded-xl shadow-lg shadow-rose-200 transition-all active:scale-95">
              Submit Complaint
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function EditProfile({ user, profile, setView, setProfile }: { user: User | null, profile: UserProfile | null, setView: (v: any) => void, setProfile: (p: any) => void }) {
  const [formData, setFormData] = useState({
    displayName: profile?.displayName || '',
    phoneNumber: profile?.phoneNumber || '',
    whatsappNumber: profile?.whatsappNumber || '',
    bio: profile?.bio || '',
    photoURL: profile?.photoURL || ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    try {
      const updatedProfile: UserProfile = {
        ...profile,
        displayName: formData.displayName,
        photoURL: formData.photoURL,
        phoneNumber: formData.phoneNumber,
        whatsappNumber: formData.whatsappNumber,
        bio: formData.bio,
      };
      await updateDoc(doc(db, 'users', user.uid), updatedProfile as any);
      setProfile(updatedProfile);
      toast.success("Profile update ho gaya!");
      setView('dashboard');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => setView('dashboard')}>
          <Navigation className="rotate-180" />
        </Button>
        <h2 className="text-xl font-bold">Edit Profile</h2>
      </div>

      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Profile Edit Karein</CardTitle>
          <CardDescription>Apni maloomat ko yahan update karein</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex justify-center mb-6">
              <Avatar className="w-24 h-24 border-4 border-blue-100">
                <AvatarImage src={formData.photoURL} />
                <AvatarFallback>{formData.displayName.charAt(0)}</AvatarFallback>
              </Avatar>
            </div>

            <div className="space-y-2">
              <Label>Naam</Label>
              <Input 
                value={formData.displayName} 
                onChange={e => setFormData({...formData, displayName: e.target.value})} 
                required 
              />
            </div>

            <div className="space-y-2">
              <Label>Phone Number</Label>
              <Input 
                value={formData.phoneNumber} 
                onChange={e => setFormData({...formData, phoneNumber: e.target.value})} 
                placeholder="03xx-xxxxxxx"
              />
            </div>

            <div className="space-y-2">
              <Label>WhatsApp Number</Label>
              <Input 
                value={formData.whatsappNumber} 
                onChange={e => setFormData({...formData, whatsappNumber: e.target.value})} 
                placeholder="03xx-xxxxxxx"
              />
            </div>

            <div className="space-y-2">
              <Label>Bio</Label>
              <Input 
                value={formData.bio} 
                onChange={e => setFormData({...formData, bio: e.target.value})} 
                placeholder="Apne baare mein batayein..."
              />
            </div>

            <div className="space-y-2">
              <Label>Photo URL</Label>
              <Input 
                value={formData.photoURL} 
                onChange={e => setFormData({...formData, photoURL: e.target.value})} 
                placeholder="https://..."
              />
            </div>

            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">
              Save Changes
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={() => setView('dashboard')}>
              Cancel
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Dashboard({ user, profile, setView, userRole }: { user: User | null, profile: UserProfile | null, setView: (v: any) => void, userRole: 'driver' | 'passenger' }) {
  return (
    <div className="space-y-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
          <Button 
            variant="outline" 
            size="sm" 
            className="rounded-full h-8 px-3 text-xs gap-1.5 border-slate-200 hover:bg-slate-50"
            onClick={() => setView('edit_profile')}
          >
            <UserIcon className="w-3.5 h-3.5" />
            Profile
          </Button>
        </div>
        <Badge className={userRole === 'driver' ? 'bg-blue-600' : 'bg-orange-500'}>
          {userRole === 'driver' ? 'Car Owner' : 'Passenger'}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-5">
        <Button 
          className="h-24 text-xl gap-4 bg-indigo-600 hover:bg-indigo-700 shadow-xl rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98]"
          onClick={() => setView('post')}
        >
          <div className="bg-white/20 p-2 rounded-xl">
            <Plus className="w-7 h-7" />
          </div>
          {userRole === 'driver' ? 'Naya Post Lagayen' : 'Naya Add Lagayen'}
        </Button>
        <Button 
          className="h-24 text-xl gap-4 bg-emerald-600 hover:bg-emerald-700 shadow-xl rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98]"
          onClick={() => setView('search')}
        >
          <div className="bg-white/20 p-2 rounded-xl">
            <Search className="w-7 h-7" />
          </div>
          {userRole === 'driver' ? 'Passenger Dhoonden' : 'Car Owner Dhoonden'}
        </Button>
        {userRole === 'driver' && (
          <Button 
            className="h-24 text-xl gap-4 bg-amber-600 hover:bg-amber-700 shadow-xl rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98]"
            onClick={() => setView('my_rides')}
          >
            <div className="bg-white/20 p-2 rounded-xl">
              <Car className="w-7 h-7" />
            </div>
            Mere Posts (My Rides)
          </Button>
        )}
        {userRole === 'passenger' && (
          <Button 
            className="h-24 text-xl gap-4 bg-rose-600 hover:bg-rose-700 shadow-xl rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98]"
            onClick={() => setView('my_requests')}
          >
            <div className="bg-white/20 p-2 rounded-xl">
              <UserIcon className="w-7 h-7" />
            </div>
            Mere Adds (My Requests)
          </Button>
        )}
      </div>
    </div>
  );
}

function RouteSearch({ setView, userRole, setSelectedItem }: { setView: (v: any) => void, userRole: 'driver' | 'passenger', setSelectedItem: (item: any) => void }) {
  const [searchData, setSearchData] = useState({
    origin: '',
    destination: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    day: format(new Date(), 'EEEE'),
    time: ''
  });
  const [results, setResults] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const collectionName = userRole === 'driver' ? 'rideRequests' : 'rides';
    
    // Fetch all documents and filter client-side for case-insensitivity
    const q = query(collection(db, collectionName));
    
    onSnapshot(q, (snapshot) => {
      let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Client-side filtering
      if (searchData.origin) {
        data = data.filter((item: any) => item.origin?.trim().toLowerCase() === searchData.origin.trim().toLowerCase());
      }
      if (searchData.destination) {
        data = data.filter((item: any) => item.destination?.trim().toLowerCase() === searchData.destination.trim().toLowerCase());
      }
      if (searchData.date) {
        data = data.filter((item: any) => item.date === searchData.date);
      }
      
      setResults(data);
      setHasSearched(true);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, collectionName);
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setView('dashboard')}><Navigation className="rotate-180" /></Button>
            Kaha se Kaha aur Kab jana hai
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Kahan Se (City)</Label>
                <Input placeholder="e.g. Karak" value={searchData.origin} onChange={e => setSearchData({...searchData, origin: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Kahan Tak (City)</Label>
                <Input placeholder="e.g. Islamabad" value={searchData.destination} onChange={e => setSearchData({...searchData, destination: e.target.value})} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tareekh (Date)</Label>
                <Input type="date" value={searchData.date} onChange={e => {
                  const d = new Date(e.target.value);
                  setSearchData({...searchData, date: e.target.value, day: format(d, 'EEEE')});
                }} />
              </div>
              <div className="space-y-2">
                <Label>Din (Day)</Label>
                <Input value={searchData.day} readOnly className="bg-slate-50" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Waqt (Time)</Label>
              <select 
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={searchData.time}
                onChange={e => setSearchData({...searchData, time: e.target.value})}
              >
                <option value="">All Times</option>
                <option value="Subah (Morning)">Subah (Morning)</option>
                <option value="Dopehar (Afternoon)">Dopehar (Afternoon)</option>
                <option value="Sham (Evening)">Sham (Evening)</option>
                <option value="Raat (Night)">Raat (Night)</option>
              </select>
            </div>
            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">Dhoonden</Button>
          </form>
        </CardContent>
      </Card>

      {hasSearched && (
        <div className="space-y-4">
          <h3 className="font-bold text-lg border-b pb-2">Results:</h3>
          {results.length === 0 ? (
            <EmptyState message="Filhal koi post nahi mili." />
          ) : (
            results.map(item => (
              <Card key={item.id} className="hover:border-blue-400 cursor-pointer" onClick={() => { setSelectedItem(item); setView('profile_view'); }}>
                <CardHeader className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={item.driverPhoto || item.passengerPhoto} />
                        <AvatarFallback>U</AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle className="text-base">{item.driverName || item.passengerName}</CardTitle>
                        <CardDescription>{item.date} | {item.time}</CardDescription>
                      </div>
                    </div>
                    {item.price && <div className="font-bold text-blue-600">Rs. {item.price}</div>}
                  </div>
                </CardHeader>
                <CardFooter className="p-2 bg-slate-50 flex gap-2">
                  <Button variant="ghost" size="sm" className="flex-1 gap-1" onClick={(e) => { e.stopPropagation(); window.open(`tel:${item.phoneNumber}`, '_self'); }}><Phone className="w-3 h-3" /> Call</Button>
                  <Button variant="ghost" size="sm" className="flex-1 gap-1 text-green-600" onClick={(e) => { e.stopPropagation(); window.open(`https://wa.me/${item.whatsappNumber?.replace(/\D/g, '')}`, '_blank'); }}><MessageCircle className="w-3 h-3" /> WhatsApp</Button>
                  <Button variant="ghost" size="sm" className="flex-1 gap-1 text-blue-600" onClick={(e) => { e.stopPropagation(); setSelectedItem(item); setView('profile_view'); }}><MessageSquare className="w-3 h-3" /> Chat</Button>
                </CardFooter>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const AnimatedFooter = memo(function AnimatedFooter({ setView }: { setView: (v: any) => void }) {
  return (
    <footer className="bg-white border-t pt-8 pb-6 overflow-hidden relative">
      <div className="max-w-4xl mx-auto px-4 relative">
        <div className="text-center space-y-6 relative z-20">
          <div className="space-y-2">
            <h3 className="text-slate-900 font-bold text-xl tracking-tight">Our Partners</h3>
            <div className="h-1 w-12 bg-blue-600 mx-auto rounded-full" />
          </div>

          {/* Google Ads Placeholder */}
          <div className="w-full max-w-md mx-auto">
            <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center min-h-[100px] group hover:border-blue-200 transition-colors">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded">Advertisement</span>
              </div>
              <p className="text-slate-400 text-xs font-medium italic">Google Ads Space</p>
              <div className="mt-2 flex gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 pt-4">
            <p className="text-slate-400 font-normal text-sm font-sans">For any Complaint or Query</p>
            <Button 
              variant="link" 
              className="text-blue-400 font-medium text-lg p-0 h-auto hover:no-underline hover:text-blue-500 transition-colors font-sans"
              onClick={() => setView('complaint')}
            >
              Contact Us
            </Button>
          </div>
        </div>
      </div>
    </footer>
  );
});

function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-50 p-4">
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center gap-6"
      >
        <div className="bg-blue-600 w-20 h-20 rounded-2xl flex items-center justify-center shadow-xl">
          <span className="text-white font-black text-4xl italic">R.</span>
        </div>
        
        <div className="flex flex-col items-center">
          <h1 className="text-5xl font-black tracking-tighter leading-none mb-3">
            <span className="text-red-600">Ride</span>
            <span className="text-blue-600">Share</span>
          </h1>
          
          {/* Car Animation */}
          <div className="h-8 w-40 relative overflow-hidden">
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
                className="text-blue-500 font-bold text-[12px] tracking-tighter whitespace-nowrap"
              >
                Let's Share Our Ride
              </motion.div>
            </div>

            <motion.div
              animate={{ 
                left: ["0%", "85%", "85%", "0%", "0%"],
                rotateY: [0, 0, 180, 180, 0]
              }}
              transition={{ 
                duration: 6, 
                repeat: Infinity, 
                ease: "easeInOut",
                times: [0, 0.45, 0.5, 0.95, 1]
              }}
              className="absolute bottom-1"
            >
              <div className="relative">
                <Car className="w-6 h-6 text-blue-600 fill-blue-100/50" />
                <motion.div 
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ duration: 0.3, repeat: Infinity }}
                  className="absolute -left-1 top-1/2 w-2 h-1 bg-blue-400/50 blur-[0.5px]"
                />
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function PostForm({ user, profile, setView, type }: { user: User | null, profile: UserProfile | null, setView: (v: any) => void, type: 'ride' | 'request' }) {
  const [formData, setFormData] = useState({
    origin: '',
    destination: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    day: format(new Date(), 'EEEE'),
    time: '',
    pickupPoint: '',
    dropoffPoint: '',
    seats: '3',
    price: '1000'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const collectionName = type === 'ride' ? 'rides' : 'rideRequests';
      const data = type === 'ride' ? {
        driverId: user.uid,
        driverName: user.displayName,
        driverPhoto: user.photoURL,
        phoneNumber: profile?.phoneNumber || '',
        whatsappNumber: profile?.whatsappNumber || '',
        origin: formData.origin,
        destination: formData.destination,
        date: formData.date,
        day: formData.day,
        time: formData.time,
        pickupPoint: formData.pickupPoint,
        dropoffPoint: formData.dropoffPoint,
        availableSeats: parseInt(formData.seats),
        price: parseInt(formData.price),
        status: 'available',
        createdAt: serverTimestamp()
      } : {
        passengerId: user.uid,
        passengerName: user.displayName,
        passengerPhoto: user.photoURL,
        phoneNumber: profile?.phoneNumber || '',
        whatsappNumber: profile?.whatsappNumber || '',
        origin: formData.origin,
        destination: formData.destination,
        date: formData.date,
        day: formData.day,
        time: formData.time,
        status: 'pending',
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, collectionName), data);
      toast.success('Post lag gaya hai!');
      setView('dashboard');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, type === 'ride' ? 'rides' : 'rideRequests');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setView('dashboard')}><Navigation className="rotate-180" /></Button>
          {type === 'ride' ? 'Naya Post Lagayen' : 'Naya Add Lagayen'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Kahan Se (City)</Label>
              <Input placeholder="e.g. Karak" value={formData.origin} onChange={e => setFormData({...formData, origin: e.target.value})} required />
            </div>
            <div className="space-y-2">
              <Label>Kahan Tak (City)</Label>
              <Input placeholder="e.g. Islamabad" value={formData.destination} onChange={e => setFormData({...formData, destination: e.target.value})} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tareekh (Date)</Label>
              <Input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} required />
            </div>
            <div className="space-y-2">
              <Label>Din (Day)</Label>
              <Input value={formData.day} onChange={e => setFormData({...formData, day: e.target.value})} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Waqt (Time)</Label>
            <Input type="time" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} required />
          </div>
          {type === 'ride' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Seats</Label>
                <Input type="number" value={formData.seats} onChange={e => setFormData({...formData, seats: e.target.value})} required />
              </div>
              <div className="space-y-2">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1">
                      <Label>Karaaya</Label>
                      <Popover>
                        <PopoverTrigger className="text-slate-400 hover:text-blue-600 transition-colors">
                          <Info className="w-4 h-4" />
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-4 bg-white shadow-xl border-slate-200 rounded-xl">
                          <p className="text-sm text-slate-600 leading-relaxed">
                            Karaaya entehaai munaasib rakhen, Ziaada karaaya na rakhen takeh ksi bhi qisam k maslay/tanaazay se bacha ja sakay
                          </p>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <span className="font-normal text-[0.70rem] text-slate-500 leading-none">(Entehaai Munaasib Karaaya Rakhen)</span>
                  </div>
                <Input type="number" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} required />
              </div>
            </div>
          )}
          <Button type="submit" className="w-full bg-blue-600">{type === 'ride' ? 'Post Karein' : 'Add Laga Den'}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function DetailedProfileView({ item, setView }: { item: any, setView: (v: any) => void }) {
  if (!item) return null;
  return (
    <Card className="max-w-md mx-auto">
      <CardHeader className="text-center">
        <div className="flex justify-start mb-4">
          <Button variant="ghost" size="icon" onClick={() => setView('search')}><Navigation className="rotate-180" /></Button>
        </div>
        <Avatar className="w-24 h-24 mx-auto border-4 border-blue-100 mb-4">
          <AvatarImage src={item.driverPhoto || item.passengerPhoto} />
          <AvatarFallback>U</AvatarFallback>
        </Avatar>
        <CardTitle className="text-2xl">{item.driverName || item.passengerName}</CardTitle>
        <CardDescription>{item.origin} se {item.destination}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="bg-slate-50 p-4 rounded-xl space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Tareekh:</span>
            <span className="font-medium">{item.date} ({item.day})</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Waqt:</span>
            <span className="font-medium">{item.time}</span>
          </div>
          {item.price && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Karaaya:</span>
              <span className="font-bold text-blue-600">Rs. {item.price}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3">
          <Button className="w-full gap-2 py-6 text-lg bg-blue-600" onClick={() => window.open(`tel:${item.phoneNumber}`, '_self')}>
            <Phone className="w-5 h-5" /> Call Karein
          </Button>
          <Button className="w-full gap-2 py-6 text-lg bg-green-600 hover:bg-green-700" onClick={() => window.open(`https://wa.me/${item.whatsappNumber?.replace(/\D/g, '')}`, '_blank')}>
            <MessageCircle className="w-5 h-5" /> WhatsApp Karein
          </Button>
          <Button variant="outline" className="w-full gap-2 py-6 text-lg border-2 border-blue-200 text-blue-700">
            <MessageSquare className="w-5 h-5" /> In-App Chat
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center px-4">
      <div className="bg-slate-100 p-4 rounded-full mb-4">
        <Search className="w-8 h-8 text-slate-400" />
      </div>
      <p className="text-slate-500 max-w-xs">{message}</p>
    </div>
  );
}

function MyRides({ user, setView }: { user: User | null, setView: (v: any) => void }) {
  const [myRides, setMyRides] = useState<Ride[]>([]);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'rides'), 
      where('driverId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    
    const unsub = onSnapshot(q, (snapshot) => {
      setMyRides(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ride)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'rides');
    });
    return unsub;
  }, [user]);

  const filteredRides = filter === 'all' ? myRides : myRides.filter(r => r.status === filter);

  const updateStatus = async (rideId: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'rides', rideId), { status: newStatus });
      toast.success('Status update ho gaya!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rides/${rideId}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => setView('dashboard')}><Navigation className="rotate-180" /></Button>
        <h2 className="text-xl font-bold">Mere Posts (My Rides)</h2>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {['all', 'available', 'full', 'completed', 'cancelled'].map(s => (
          <Button 
            key={s} 
            variant={filter === s ? 'default' : 'outline'} 
            size="sm" 
            className="capitalize"
            onClick={() => setFilter(s)}
          >
            {s === 'all' ? 'All' : s}
          </Button>
        ))}
      </div>

      <div className="space-y-4">
        {filteredRides.length === 0 ? (
          <EmptyState message="Koi ride nahi mili." />
        ) : (
          filteredRides.map(ride => (
            <Card key={ride.id} className="border-l-4 border-blue-600">
              <CardHeader className="p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{ride.origin} se {ride.destination}</CardTitle>
                    <CardDescription>{ride.date} | {ride.time}</CardDescription>
                  </div>
                  <Badge variant={ride.status === 'available' ? 'default' : 'secondary'}>
                    {ride.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0 text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Seats:</span>
                  <span className="font-medium">{ride.availableSeats}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Karaaya:</span>
                  <span className="font-bold text-blue-600">Rs. {ride.price}</span>
                </div>
              </CardContent>
              <CardFooter className="p-2 bg-slate-50 flex gap-2">
                <select 
                  className="flex-1 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={ride.status}
                  onChange={(e) => updateStatus(ride.id, e.target.value)}
                >
                  <option value="available">Available</option>
                  <option value="full">Full</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <Button variant="destructive" size="sm" onClick={async () => {
                  if (confirm('Kya aap ye post delete karna chahte hain?')) {
                    try {
                      await deleteDoc(doc(db, 'rides', ride.id));
                      toast.success('Post delete ho gaya!');
                    } catch (error) {
                      handleFirestoreError(error, OperationType.DELETE, `rides/${ride.id}`);
                    }
                  }
                }}>Delete</Button>
              </CardFooter>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function MyRequests({ user, setView }: { user: User | null, setView: (v: any) => void }) {
  const [myRequests, setMyRequests] = useState<RideRequest[]>([]);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'rideRequests'), 
      where('passengerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    
    const unsub = onSnapshot(q, (snapshot) => {
      setMyRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RideRequest)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'rideRequests');
    });
    return unsub;
  }, [user]);

  const filteredRequests = filter === 'all' ? myRequests : myRequests.filter(r => r.status === filter);

  const updateStatus = async (requestId: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'rideRequests', requestId), { status: newStatus });
      toast.success('Status update ho gaya!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rideRequests/${requestId}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => setView('dashboard')}><Navigation className="rotate-180" /></Button>
        <h2 className="text-xl font-bold">Mere Adds (My Requests)</h2>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {['all', 'pending', 'matched', 'cancelled'].map(s => (
          <Button 
            key={s} 
            variant={filter === s ? 'default' : 'outline'} 
            size="sm" 
            className="capitalize"
            onClick={() => setFilter(s)}
          >
            {s === 'all' ? 'All' : s}
          </Button>
        ))}
      </div>

      <div className="space-y-4">
        {filteredRequests.length === 0 ? (
          <EmptyState message="Koi add nahi mila." />
        ) : (
          filteredRequests.map(req => (
            <Card key={req.id} className="border-l-4 border-orange-500">
              <CardHeader className="p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{req.origin} se {req.destination}</CardTitle>
                    <CardDescription>{req.date} | {req.time}</CardDescription>
                  </div>
                  <Badge variant={req.status === 'pending' ? 'default' : 'secondary'}>
                    {req.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardFooter className="p-2 bg-slate-50 flex gap-2">
                <select 
                  className="flex-1 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={req.status}
                  onChange={(e) => updateStatus(req.id, e.target.value)}
                >
                  <option value="pending">Pending</option>
                  <option value="matched">Matched</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <Button variant="destructive" size="sm" onClick={async () => {
                  if (confirm('Kya aap ye add delete karna chahte hain?')) {
                    try {
                      await deleteDoc(doc(db, 'rideRequests', req.id));
                      toast.success('Add delete ho gaya!');
                    } catch (error) {
                      handleFirestoreError(error, OperationType.DELETE, `rideRequests/${req.id}`);
                    }
                  }
                }}>Delete</Button>
              </CardFooter>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function AIChat() {
  return (
    <Card className="h-[500px] flex flex-col items-center justify-center">
      <Sparkles className="w-12 h-12 text-blue-600 mb-4" />
      <p className="text-slate-500">AI Assistant jald hi dastyab hoga.</p>
    </Card>
  );
}

function AdminDashboard({ setView }: { setView: (v: any) => void }) {
  const [stats, setStats] = useState({
    drivers: 0,
    passengers: 0,
    rides: 0,
    complaints: 0,
    visits: 0
  });
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [drivers, setDrivers] = useState<UserProfile[]>([]);
  const [passengers, setPassengers] = useState<UserProfile[]>([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedUserForWarning, setSelectedUserForWarning] = useState<UserProfile | null>(null);
  const [selectedComplaintForReply, setSelectedComplaintForReply] = useState<Complaint | null>(null);

  useEffect(() => {
    // Real-time stats and lists
    const unsubDrivers = onSnapshot(query(collection(db, 'users'), where('role', '==', 'driver')), (snap) => {
      setStats(prev => ({ ...prev, drivers: snap.size }));
      setDrivers(snap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });
    const unsubPassengers = onSnapshot(query(collection(db, 'users'), where('role', '==', 'passenger')), (snap) => {
      setStats(prev => ({ ...prev, passengers: snap.size }));
      setPassengers(snap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });
    const unsubRides = onSnapshot(collection(db, 'rides'), (snap) => {
      setStats(prev => ({ ...prev, rides: snap.size }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'rides');
    });
    const unsubComplaintsCount = onSnapshot(collection(db, 'complaints'), (snap) => {
      setStats(prev => ({ ...prev, complaints: snap.size }));
      setComplaints(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Complaint)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'complaints');
    });
    
    const today = format(new Date(), 'yyyy-MM-dd');
    const unsubVisits = onSnapshot(doc(db, 'analytics', today), (docSnap) => {
      if (docSnap.exists()) {
        setStats(prev => ({ ...prev, visits: docSnap.data().visits }));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `analytics/${today}`);
    });

    return () => {
      unsubDrivers();
      unsubPassengers();
      unsubRides();
      unsubComplaintsCount();
      unsubVisits();
    };
  }, []);

  const issueWarning = (user: UserProfile) => {
    setSelectedUserForWarning(user);
  };

  const deleteAccount = async (uid: string) => {
    if (confirm('Kya aap waqai ye account delete karna chahte hain? Ye amal wapis nahi ho sakta.')) {
      try {
        await deleteDoc(doc(db, 'users', uid));
        toast.success('Account delete ho gaya!');
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `users/${uid}`);
      }
    }
  };

  return (
    <div className="space-y-6">
      {selectedUserForWarning && (
        <AdminWarningModal 
          user={selectedUserForWarning} 
          onClose={() => setSelectedUserForWarning(null)} 
        />
      )}
      {selectedComplaintForReply && (
        <AdminComplaintReplyModal 
          complaint={selectedComplaintForReply} 
          onClose={() => setSelectedComplaintForReply(null)} 
        />
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setView('dashboard')}>
            <Navigation className="rotate-180" />
          </Button>
          <h2 className="text-2xl font-bold">Admin Dashboard</h2>
        </div>
        <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">
          Live Updates
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard title="Car Owners" value={stats.drivers} icon={<Car className="w-5 h-5" />} color="bg-blue-500" onClick={() => setActiveTab('drivers')} />
        <StatCard title="Passengers" value={stats.passengers} icon={<Users className="w-5 h-5" />} color="bg-orange-500" onClick={() => setActiveTab('passengers')} />
        <StatCard title="Total Rides" value={stats.rides} icon={<Navigation className="w-5 h-5" />} color="bg-emerald-500" />
        <StatCard title="Complaints" value={stats.complaints} icon={<AlertCircle className="w-5 h-5" />} color="bg-rose-500" onClick={() => setActiveTab('complaints')} />
        <StatCard title="Today Visits" value={stats.visits} icon={<Eye className="w-5 h-5" />} color="bg-indigo-500" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="drivers">Car Owners</TabsTrigger>
          <TabsTrigger value="passengers">Passengers</TabsTrigger>
          <TabsTrigger value="complaints">Complaints</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>App Performance</CardTitle>
              <CardDescription>Real-time statistics of your application</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-sm text-slate-500 mb-1">Total Registered Users</p>
                <p className="text-3xl font-bold text-slate-900">{stats.drivers + stats.passengers}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                  <p className="text-xs text-blue-600 font-medium mb-1 uppercase tracking-wider">Growth Rate</p>
                  <p className="text-xl font-bold text-blue-900">+12%</p>
                </div>
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                  <p className="text-xs text-emerald-600 font-medium mb-1 uppercase tracking-wider">Active Rides</p>
                  <p className="text-xl font-bold text-emerald-900">{stats.rides}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="drivers" className="mt-4">
          <UserList users={drivers} onWarning={issueWarning} onDelete={deleteAccount} />
        </TabsContent>

        <TabsContent value="passengers" className="mt-4">
          <UserList users={passengers} onWarning={issueWarning} onDelete={deleteAccount} />
        </TabsContent>

        <TabsContent value="complaints" className="mt-4">
          <div className="space-y-4">
            {complaints.length === 0 ? (
              <EmptyState message="Abhi tak koi complaint nahi aayi." />
            ) : (
              complaints.map(complaint => (
                <Card key={complaint.id} className="border-l-4 border-rose-500">
                  <CardHeader className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-[10px]">{complaint.complaintNumber}</Badge>
                          <CardTitle className="text-lg">{complaint.subject}</CardTitle>
                        </div>
                        <CardDescription className="flex flex-col">
                          <span>By: <span className="font-bold text-slate-900">{complaint.userName}</span></span>
                          <span className="text-[10px] font-mono text-slate-400">User ID: {complaint.userCustomId || complaint.userId}</span>
                          <span className="text-[10px]">{format(complaint.createdAt?.toDate() || new Date(), 'PPp')}</span>
                        </CardDescription>
                      </div>
                      <Badge variant={complaint.status === 'pending' ? 'destructive' : 'default'}>
                        {complaint.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <p className="text-slate-600 text-sm bg-slate-50 p-3 rounded-lg border border-slate-100 italic">"{complaint.description}"</p>
                    {complaint.adminReply && (
                      <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                        <p className="text-[10px] font-bold text-blue-600 uppercase mb-1">Aap ka Jawab:</p>
                        <p className="text-sm text-blue-800">{complaint.adminReply}</p>
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="p-2 bg-slate-50 flex justify-end gap-2">
                    {complaint.status === 'pending' ? (
                      <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => setSelectedComplaintForReply(complaint)}>
                        Jawab Likhein (Reply)
                      </Button>
                    ) : (
                      <span className="text-xs text-slate-400 font-medium px-3 py-1">Resolved</span>
                    )}
                  </CardFooter>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UserList({ users, onWarning, onDelete }: { users: UserProfile[], onWarning: (u: UserProfile) => void, onDelete: (uid: string) => void }) {
  return (
    <div className="space-y-4">
      {users.length === 0 ? (
        <EmptyState message="Koi user nahi mila." />
      ) : (
        users.map(u => (
          <Card key={u.uid}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={u.photoURL} />
                  <AvatarFallback>{u.displayName.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-bold text-slate-900">{u.displayName}</p>
                  <p className="text-xs text-slate-500 font-mono">{u.customId || 'No ID'}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="text-orange-600 border-orange-200 hover:bg-orange-50" onClick={() => onWarning(u)}>
                  Warning
                </Button>
                <Button variant="destructive" size="sm" onClick={() => onDelete(u.uid)}>
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function StatCard({ title, value, icon, color, onClick }: { title: string, value: number, icon: React.ReactNode, color: string, onClick?: () => void }) {
  return (
    <Card className={`overflow-hidden border-none shadow-md cursor-pointer transition-transform hover:scale-105 active:scale-95`} onClick={onClick}>
      <div className={`${color} p-3 text-white flex items-center justify-between`}>
        {icon}
        <span className="text-xs font-bold uppercase tracking-wider opacity-80">{title}</span>
      </div>
      <CardContent className="p-4 text-center">
        <p className="text-2xl font-black text-slate-900">{value}</p>
      </CardContent>
    </Card>
  );
}

function AdminWarningModal({ user, onClose }: { user: UserProfile, onClose: () => void }) {
  const [message, setMessage] = useState('');

  const handleIssueWarning = async () => {
    if (!message.trim()) return;
    try {
      await addDoc(collection(db, 'warnings'), {
        userId: user.uid,
        adminMessage: message,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      toast.success(`Warning issued to ${user.displayName}`);
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'warnings');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Issue Warning</CardTitle>
          <CardDescription>User: {user.displayName} ({user.customId})</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Warning Message</Label>
            <textarea 
              className="w-full min-h-[100px] p-3 rounded-md border border-input bg-background text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Complaint ki tafseel aur warning yahan likhein..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-rose-600 hover:bg-rose-700" onClick={handleIssueWarning}>Issue Warning</Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function AdminComplaintReplyModal({ complaint, onClose }: { complaint: Complaint, onClose: () => void }) {
  const [reply, setReply] = useState('');

  const handleSendReply = async () => {
    if (!reply.trim()) return;
    try {
      await updateDoc(doc(db, 'complaints', complaint.id), {
        adminReply: reply,
        status: 'resolved',
        userAcknowledged: false
      });
      toast.success(`Reply sent for Complaint ${complaint.complaintNumber}`);
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `complaints/${complaint.id}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Reply to Complaint</CardTitle>
          <CardDescription>
            Complaint No: {complaint.complaintNumber}<br />
            User: {complaint.userName}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 bg-slate-50 rounded-lg text-sm italic">
            "{complaint.description}"
          </div>
          <div className="space-y-2">
            <Label>Aap ka Jawab (Reply)</Label>
            <textarea 
              className="w-full min-h-[100px] p-3 rounded-md border border-input bg-background text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="User ko jawab yahan likhein..."
              value={reply}
              onChange={(e) => setReply(e.target.value)}
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleSendReply}>Send Reply</Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function ComplaintReplyModal({ complaint, onClose }: { complaint: Complaint, onClose: () => void }) {
  const [isOpen, setIsOpen] = useState(false);

  const handleAcknowledge = async () => {
    try {
      await updateDoc(doc(db, 'complaints', complaint.id), {
        userAcknowledged: true
      });
      toast.success("Shukriya!");
      setIsOpen(false);
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `complaints/${complaint.id}`);
    }
  };

  if (!isOpen) {
    return (
      <Button 
        className="fixed bottom-24 right-6 rounded-full h-14 px-6 shadow-2xl bg-blue-600 hover:bg-blue-700 animate-bounce z-50"
        onClick={() => setIsOpen(true)}
      >
        <MessageCircle className="w-5 h-5 mr-2" />
        Message from Helpline
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md border-none shadow-2xl rounded-[2rem] overflow-hidden">
        <CardHeader className="bg-blue-600 text-white p-6">
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="w-6 h-6" />
            Helpline Response
          </CardTitle>
          <CardDescription className="text-blue-100">
            Regarding Complaint No: <span className="font-mono font-bold">{complaint.complaintNumber}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase">Aap ki Shikayat:</p>
            <p className="text-sm text-slate-600 italic">"{complaint.description}"</p>
          </div>
          <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl">
            <p className="text-[10px] font-bold text-blue-600 uppercase mb-2">Helpline ka Jawab:</p>
            <p className="text-slate-800 font-medium leading-relaxed">{complaint.adminReply}</p>
          </div>
        </CardContent>
        <CardFooter className="p-6 bg-slate-50">
          <Button className="w-full h-12 text-lg font-bold bg-slate-900 hover:bg-slate-800 rounded-xl" onClick={handleAcknowledge}>
            Close
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function UserWarningModal({ warning, onClose }: { warning: Warning, onClose: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [reply, setReply] = useState('');

  const handleSubmitReply = async () => {
    if (!reply.trim()) return;
    try {
      await updateDoc(doc(db, 'warnings', warning.id), {
        userReply: reply,
        status: 'replied'
      });
      toast.success("Aap ka jawab bhej diya gaya hai.");
      setIsOpen(false);
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `warnings/${warning.id}`);
    }
  };

  if (!isOpen) {
    return (
      <Button 
        className="fixed bottom-24 right-6 rounded-full h-14 px-6 shadow-2xl bg-rose-600 hover:bg-rose-700 animate-bounce z-50"
        onClick={() => setIsOpen(true)}
      >
        <AlertCircle className="w-5 h-5 mr-2" />
        Message from Helpline
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-rose-600">
            <AlertCircle className="w-5 h-5" />
            Helpline Message
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg text-sm text-rose-900">
            <p className="font-bold mb-1">Admin Message:</p>
            <p>{warning.adminMessage}</p>
          </div>
          <div className="space-y-2">
            <Label>Aap ka Jawab</Label>
            <textarea 
              className="w-full min-h-[100px] p-3 rounded-md border border-input bg-background text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Yahan apna jawab likhein..."
              value={reply}
              onChange={(e) => setReply(e.target.value)}
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setIsOpen(false)}>Band Karein</Button>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleSubmitReply}>Submit</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
