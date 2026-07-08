import { memo, useState, useEffect, useRef, useMemo } from 'react';
import { app, auth, db, signInWithGoogle, logout, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  getDocs,
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
  arrayUnion,
  getCountFromServer
} from 'firebase/firestore';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { UserProfile, Ride, RideRequest, ChatMessage, Complaint, Analytics, Warning, Booking, WalletRechargeRequest } from './types';
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
  CheckCircle2,
  Car, 
  Bike,
  User as UserIcon, 
  Search, 
  Plus, 
  MessageSquare, 
  Phone, 
  Navigation, 
  ArrowLeft,
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
  Info,
  Check,
  CheckCheck,
  Trophy,
  Coins,
  Gift,
  X,
  PlayCircle,
  WifiOff,
  Smartphone,
  Download,
  Lock,
  Shield,
  Mail,
  FileText,
  ChevronRight,
  ChevronDown,
  Wallet,
  Edit
} from 'lucide-react';
import IntracityDemo, { LOCAL_LOCATIONS } from './components/IntracityDemo';
import LiveActivePassengerMap from './components/LiveActivePassengerMap';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import confetti from 'canvas-confetti';
import LaunchSignInScreen from './components/LaunchSignInScreen';
import WalletModal from './components/WalletModal';

const trackInteraction = async (rideId: string, type: 'call' | 'whatsapp' | 'chat', collectionName: 'rides' | 'rideRequests') => {
  try {
    const docRef = doc(db, collectionName, rideId);
    await updateDoc(docRef, {
      [`interactions.${type}`]: increment(1)
    });
  } catch (error) {
    console.error('Error tracking interaction:', error);
  }
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  
  // Support for Guest / Offline Mock User Session
  useEffect(() => {
    const loadMockSession = () => {
      const savedMockUser = localStorage.getItem('easytravel_mock_user');
      const savedMockProfile = localStorage.getItem('easytravel_mock_profile');
      
      if (savedMockUser && savedMockProfile) {
        setUser(JSON.parse(savedMockUser) as any);
        setProfile(JSON.parse(savedMockProfile) as any);
      } else if (!savedMockUser && !savedMockProfile) {
        // If clear occurred, reset state if we have a mock user
        setUser(currentUser => {
          if (currentUser && currentUser.uid.startsWith('mock-')) {
            return null;
          }
          return currentUser;
        });
        setProfile(currentProfile => {
          if (currentProfile && currentProfile.uid.startsWith('mock-')) {
            return null;
          }
          return currentProfile;
        });
      }
    };

    loadMockSession();
    window.addEventListener('easytravel_mock_auth_changed', loadMockSession);
    return () => {
      window.removeEventListener('easytravel_mock_auth_changed', loadMockSession);
    };
  }, []);

  const [view, setViewState] = useState<'main' | 'register' | 'dashboard' | 'search' | 'post' | 'edit_post' | 'profile_view' | 'chat' | 'messages' | 'my_rides' | 'my_requests' | 'edit_profile' | 'admin_dashboard' | 'complaint' | 'privacy_policy'>('main');
  const [travelScope, setTravelScope] = useState<'intercity' | 'intracity' | null>(null);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  const [activeWarning, setActiveWarning] = useState<Warning | null>(null);
  const [activeComplaintReply, setActiveComplaintReply] = useState<Complaint | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [rewardTask, setRewardTask] = useState<any>(null);
  const [bookingTask, setBookingTask] = useState<any>(null);
  const [activeBookings, setActiveBookings] = useState<Booking[]>([]);
  const [showInterstitialAd, setShowInterstitialAd] = useState(false);

  const [waModalData, setWaModalData] = useState<any>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  const [pendingStatusReport, setPendingStatusReport] = useState<any>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [allRides, setAllRides] = useState<Ride[]>([]);
  const appLoadTime = useRef(Date.now());

  // Notification Helper
  const showNotification = (title: string, options?: NotificationOptions & { body?: string, tag?: string }) => {
    if (!('Notification' in window)) {
      toast.error("Aap ka browser notifications support nahi karta.");
      return;
    }

    const body = options?.body || '';
    const tag = options?.tag || title;

    if (Notification.permission === 'granted') {
      const defaultOptions: any = {
        body,
        tag,
        icon: '/icon.svg',
        badge: '/icon.svg',
        vibrate: [200, 100, 200],
        data: { url: window.location.origin },
        ...options
      };
      
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(registration => {
          registration.showNotification(title, defaultOptions);
        }).catch(err => {
          console.error("SW Notification error:", err);
          try {
            new Notification(title, defaultOptions);
          } catch (e) {
            console.error("Fallback notification error:", e);
          }
        });
      } else {
        try {
          new Notification(title, defaultOptions);
        } catch (e) {
          console.error("Fallback notification error:", e);
        }
      }
    } else if (Notification.permission === 'denied') {
      // Don't spam toast if denied, just log
      console.warn("Notification permission denied.");
    } else {
      Notification.requestPermission().then(permission => {
        setNotificationPermission(permission);
        if (permission === 'granted') {
          toast.success("Notifications enabled!");
        }
      });
    }

    // Always show in-app toast as well for immediate feedback
    toast.info(title, { description: body });
  };

  const registerFCMToken = async (currentUser: User) => {
    try {
      const supported = await isSupported();
      if (!supported) {
        console.log("FCM is not supported in this browser context (like direct frames or non-https development).");
        return;
      }
      
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return;
      }

      const messaging = getMessaging(app);
      // NOTE: Go to Firebase Console -> Cloud Messaging -> Web Push Certificates to generate your VAPID key.
      const vapidKey = "BKKpJJh54cVYm6MU0kB5jZ8cbzqdZ6agGvazaRfxplDzz8rfxGmrlRHHfW0iazo78VrZxEcS8RwjGpk4aAiIWio"; // Paste VAPID Public Key here if available.
      
      if (!vapidKey) {
        console.log("FCM VAPID key background setup notice: To enable background push, add a Web Push VAPID key.");
        return;
      }

      const fcmToken = await getToken(messaging, { vapidKey });
      if (fcmToken) {
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          await updateDoc(userRef, {
            fcmTokens: arrayUnion(fcmToken)
          });
          console.log("Background FCM Token saved successfully to Firestore.");
        } else {
          console.log("FCM registration bypassed: User profile document does not exist.");
        }
      }
    } catch (err) {
      console.warn("Background FCM setup: Dynamic check run completed safely:", err);
    }
  };

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          setNotificationPermission(permission);
        });
      }
    }
  }, []);

  useEffect(() => {
    if (!user || user.email !== 'munirkhattak.pk@gmail.com') return;
    
    const unsub = onSnapshot(collection(db, 'rides'), (snap) => {
      setAllRides(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ride)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'rides');
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    // Handle deep links from notifications cleanly
    const params = new URLSearchParams(window.location.search);
    const urlView = params.get('view');
    if (urlView === 'dashboard') {
      setViewState('dashboard');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [user]);

  useEffect(() => {
    // Use setTimeout to ensure scrolling happens after the DOM has updated
    setTimeout(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }, 10);
  }, [view]);

  useEffect(() => {
    if (!user || !profile) return;
    
    // Check for rides/requests that need status report
    const checkPendingReports = async () => {
      const collections: ('rides' | 'rideRequests')[] = ['rides', 'rideRequests'];
      const userIdField = profile.role === 'driver' ? 'driverId' : 'passengerId';
      
      for (const coll of collections) {
        const q = query(
          collection(db, coll),
          where(userIdField, '==', user.uid),
          where('finalStatus', '==', 'pending')
        );
        // We will just rely on the real-time listeners below for pending reports
      }
    };
    
    // Listen for pending reports
    const colls: ('rides' | 'rideRequests')[] = ['rides', 'rideRequests'];
    const userIdField = profile.role === 'driver' ? 'driverId' : 'passengerId';
    
    const unsubs = colls.map(coll => {
      const q = query(
        collection(db, coll),
        where(userIdField, '==', user.uid),
        where('finalStatus', '==', 'pending')
      );
      
      return onSnapshot(q, (snap) => {
        if (!snap.empty) {
          const doc = snap.docs[0];
          const data = doc.data();
          // Check if date is past
          const rideDate = new Date(data.date);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          if (rideDate <= today) {
            setPendingStatusReport({ id: doc.id, collection: coll, ...data });
          }
        }
      }, (error) => {
        console.error(`Error listening for pending status on ${coll}:`, error);
      });
    });

    return () => unsubs.forEach(unsub => unsub());
  }, [user, profile]);

  // Reward System Background Listener
  useEffect(() => {
    if (!user || !profile) return;

    const q = query(
      collection(db, 'rides'),
      where('participants', 'array-contains', user.uid)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      snapshot.docs.forEach(docSnap => {
        const ride = { id: docSnap.id, ...docSnap.data() } as any;
        
        // Handle multiple passengers if driver, or just self if passenger
        const rewardStatuses = ride.rewardStatus || {};
        
        Object.keys(rewardStatuses).forEach(pId => {
          const status = rewardStatuses[pId];
          if (status.rewardIssued) return;

          // Only proceed if user is either the driver or this specific passenger
          if (user.uid !== ride.driverId && user.uid !== pId) return;

          const rideStartTime = new Date(`${ride.date}T${ride.time}`);
          const now = new Date();
          const diffMins = (now.getTime() - rideStartTime.getTime()) / (1000 * 60);

          // 2. Mutual Confirmation
          const isDriver = user.uid === ride.driverId;
          if (status.driverConfirmed && !status.passengerConfirmed && user.uid === pId) {
            setRewardTask(prev => prev?.ride?.id === ride.id && prev?.type === 'confirm_complete' ? prev : {
              ride,
              passengerId: pId,
              type: 'confirm_complete',
              otherUser: { name: ride.driverName, id: ride.driverId.substring(0, 4) }
            });
          } else if (status.passengerConfirmed && !status.driverConfirmed && isDriver) {
            setRewardTask(prev => prev?.ride?.id === ride.id && prev?.type === 'confirm_complete' && prev?.passengerId === pId ? prev : {
              ride,
              passengerId: pId,
              type: 'confirm_complete',
              otherUser: { name: status.name, id: pId.substring(0, 4) }
            });
          }

          // 3. 5 Hours Safety Net (Auto-prompt if not completed)
          const needsConfirmation = isDriver ? !status.driverConfirmed : !status.passengerConfirmed;
          if (diffMins >= 300 && needsConfirmation) {
             // Prompt both to complete
             setRewardTask(prev => prev?.ride?.id === ride.id && prev?.type === 'complete' ? prev : {
               ride,
               passengerId: pId,
               type: 'complete',
               otherUser: { 
                 name: isDriver ? status.name : ride.driverName, 
                 id: (isDriver ? pId : ride.driverId).substring(0, 4) 
               }
             });
          }
        });
      });
    }, (error) => {
      console.error("Error listening for rewards background updates:", error);
    });

    return () => unsub();
  }, [user, profile]);

  // Global listener for delivered messages
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'messages'),
      where('receiverId', '==', user.uid),
      where('status', '==', 'sent')
    );
    const unsub = onSnapshot(q, (snap) => {
      snap.docs.forEach(docSnap => {
        updateDoc(doc(db, 'messages', docSnap.id), { status: 'delivered' }).catch(console.error);
      });
    }, (error) => {
      console.error("Error running global delivered messages listener:", error);
    });
    return () => unsub();
  }, [user]);

  const setView = (newView: any, item?: any) => {
    if (item) setSelectedItem(item);
    if (newView === 'main') {
      setTravelScope(null);
    }
    if (view !== newView) {
      window.history.pushState({ view: newView }, '', '');
      setViewState(newView);
    }
  };

  useEffect(() => {
    // Initialize first state if not present
    if (!window.history.state) {
      window.history.replaceState({ view: 'main' }, '', '');
    }

    const handlePopState = (event: PopStateEvent) => {
      if (event.state && event.state.view) {
        setViewState(event.state.view);
        if (event.state.view === 'main') {
          setTravelScope(null);
        }
      } else {
        // If no state, we are at the beginning. Let the browser handle it (minimize/close app)
        // Or default to main
        setViewState('main');
        setTravelScope(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    // Page load alignment: scroll back to the very top header whenever view or category switches
    window.scrollTo(0, 0);
  }, [view, travelScope]);

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
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Admin Warning', { body: 'You have received a warning from the admin.' });
        }
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
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Complaint Resolved', { body: 'An admin has replied to your complaint.' });
        }
      } else {
        setActiveComplaintReply(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'complaints');
    });

    return () => unsub();
  }, [user]);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [rides, setRides] = useState<Ride[]>([]);
  const [requests, setRequests] = useState<RideRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [splashLoading, setSplashLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSplashLoading(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<any>(null);

  // Auth & Profile Listener
  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (currentUser) {
          setUser(currentUser);
          if (unsubProfile) {
            unsubProfile();
            unsubProfile = null;
          }
          registerFCMToken(currentUser);
          
          // Listen to the user profile in real-time to detect deletion by administrator instantly
          unsubProfile = onSnapshot(doc(db, 'users', currentUser.uid), (snapshot) => {
            if (snapshot.exists()) {
              const p = snapshot.data() as UserProfile;
              setProfile(p);
            } else {
              // Profile doc does not exist in Firestore!
              setProfile(null);
              
              // If the user's profile is deleted by an admin, we clear their Auth session.
              // We only do this if they are not currently in the registration or login views.
              if (viewRef.current !== 'register' && viewRef.current !== 'main') {
                logout().then(() => {
                  toast.error("Aap ka account admin ne remove kar diya hai. Please dobara Register karein.");
                  setView('main');
                }).catch((err) => {
                  console.error("Logout error on database deletion:", err);
                });
              }
            }
            setLoading(false);
          }, (error) => {
            console.error("Profile real-time listener error:", error);
            handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
            setLoading(false);
          });
        } else {
          // Check if there is a local mock user first to avoid overwriting guest session
          const savedMockUser = localStorage.getItem('easytravel_mock_user');
          const savedMockProfile = localStorage.getItem('easytravel_mock_profile');
          if (savedMockUser) {
            setUser(JSON.parse(savedMockUser) as any);
            if (savedMockProfile) {
              setProfile(JSON.parse(savedMockProfile) as any);
            } else {
              setProfile(null);
            }
          } else {
            setUser(null);
            setProfile(null);
          }
          setLoading(false);
        }
      } catch (error) {
        console.error("Auth listener error:", error);
        setLoading(false);
      }
    });

    // Fallback to stop loading if Firebase takes too long
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 5000);

    return () => {
      unsubscribe();
      if (unsubProfile) unsubProfile();
      clearTimeout(timeout);
    };
  }, []);

  // Resolve pending district role selection (from Intracity selection cards) post login/registration
  useEffect(() => {
    if (user && profile) {
      const pendingDistRole = localStorage.getItem('pendingDistrictRole');
      if (pendingDistRole === 'owner' || pendingDistRole === 'passenger') {
        localStorage.removeItem('pendingDistrictRole');
        const targetRole: 'driver' | 'passenger' = pendingDistRole === 'owner' ? 'driver' : 'passenger';
        
        if (profile.role !== targetRole) {
          updateDoc(doc(db, 'users', user.uid), { role: targetRole }).then(() => {
            setProfile({ ...profile, role: targetRole });
            toast.success(`Ab aap ${targetRole === 'driver' ? 'Car Owner' : 'Passenger'} ke dashboard mein hain`);
          }).catch(err => {
            console.error("Error updating pending role:", err);
          });
        }
        
        setTravelScope('intercity');
        setView('dashboard');
      }
    }
  }, [user, profile]);

  // Real-time Listeners
  useEffect(() => {
    if (!user || !profile) return;
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
  }, [user, profile]);

  // Notification Listener
  useEffect(() => {
    if (!user || !profile) return;

    // Request permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // New Custom Notifications Collection
    let initUserNotifs = true;
    const unsubUserNotifs = onSnapshot(
      query(collection(db, 'notifications'), where('userId', '==', user.uid), where('read', '==', false)),
      (snapshot) => {
        if (initUserNotifs) { initUserNotifs = false; return; }
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === 'added') {
            const notif = change.doc.data();
            showNotification(notif.title, { body: notif.body, tag: `sys-notif-${change.doc.id}` });
            await updateDoc(doc(db, 'notifications', change.doc.id), { read: true });
          }
        });
      }, (error) => console.error("Error fetching user notifications: ", error)
    );

    let unsubAdminNotifs = () => {};
    if (profile.role === 'admin') {
      let initAdminNotifs = true;
      unsubAdminNotifs = onSnapshot(
        query(collection(db, 'notifications'), where('userId', '==', 'admin'), where('read', '==', false)),
        (snapshot) => {
          if (initAdminNotifs) { initAdminNotifs = false; return; }
          snapshot.docChanges().forEach(async (change) => {
            if (change.type === 'added') {
              const notif = change.doc.data();
              showNotification(notif.title, { body: notif.body, tag: `sys-notif-${change.doc.id}` });
              await updateDoc(doc(db, 'notifications', change.doc.id), { read: true });
            }
          });
        }, (error) => console.error("Error fetching admin notifications: ", error)
      );
    }

    // 1. Listen for new ride requests (for drivers)
    const qNewRequests = query(
      collection(db, 'rideRequests'),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    
    const unsubNewRequests = onSnapshot(qNewRequests, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' && profile.role === 'driver') {
          const req = change.doc.data() as RideRequest;
          // Only notify if it's not the user's own request AND it's new (after app load)
          const isNew = !req.createdAt || (req.createdAt.toMillis && req.createdAt.toMillis() > appLoadTime.current - 10000);
          
          if (req.passengerId !== user.uid && isNew) {
            // Filter out Karachi if it's bothering the user
            if (req.origin?.toLowerCase().includes('karachi') || req.destination?.toLowerCase().includes('karachi')) {
              return;
            }

            showNotification('New Ride Request', {
              body: `${req.passengerName} needs a ride to ${req.destination}`,
              tag: `new-request-${change.doc.id}`
            });
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
    
    const unsubMyRequests = onSnapshot(qMyRequests, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'modified') {
          const req = change.doc.data() as RideRequest;
          if (req.status === 'matched') {
            showNotification('Ride Confirmed!', {
              body: `Your request to ${req.destination} has been matched.`,
              tag: `request-matched-${change.doc.id}`
            });
          }
        }
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'rideRequests');
    });

    // 3. Listen for new messages (index-free, resilient)
    const qMessages = query(
      collection(db, 'messages'),
      where('receiverId', '==', user.uid)
    );
    
    const unsubMessages = onSnapshot(qMessages, (snapshot) => {
      // Mark any newly cached messages intended for us as 'delivered' if currently 'sent'
      snapshot.docs.forEach((docSnap) => {
        const msg = docSnap.data() as ChatMessage;
        if (msg.status === 'sent') {
          updateDoc(doc(db, 'messages', docSnap.id), { status: 'delivered' }).catch(console.error);
        }
      });

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const msg = change.doc.data() as ChatMessage;
          const isNew = !msg.timestamp || (msg.timestamp.toMillis && msg.timestamp.toMillis() > appLoadTime.current - 10000);
          
          if (isNew) {
            // Check if the user is already viewing this chat to avoid double-notification
            const isCurrentlyChatting = view === 'chat' && (
              selectedItem?.otherUser?.uid === msg.senderId ||
              selectedItem?.chat?.otherId === msg.senderId ||
              selectedItem?.driverId === msg.senderId ||
              selectedItem?.passengerId === msg.senderId
            );

            if (!isCurrentlyChatting) {
              showNotification('New Message', {
                body: msg.text,
                tag: `msg-${change.doc.id}`
              });

              toast("Naya Peghaam", {
                description: msg.text.length > 50 ? `${msg.text.slice(0, 50)}...` : msg.text,
                action: {
                  label: "Inbox",
                  onClick: () => setView('messages')
                }
              });
            }
          }
        }
      });
    }, (error) => {
      console.warn("Global qMessages listener issue, handled gracefully:", error);
    });

    // 4. Listen for new rides (for passengers)
    const qNewRides = query(
      collection(db, 'rides'),
      where('status', '==', 'available'),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    
    const unsubNewRides = onSnapshot(qNewRides, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' && profile.role === 'passenger') {
          const ride = change.doc.data() as Ride;
          const isNew = !ride.createdAt || (ride.createdAt.toMillis && ride.createdAt.toMillis() > appLoadTime.current - 10000);
          
          if (ride.driverId !== user.uid && isNew) {
            // Filter out Karachi
            if (ride.origin?.toLowerCase().includes('karachi') || ride.destination?.toLowerCase().includes('karachi')) {
              return;
            }

            showNotification('New Ride Available', {
              body: `${ride.driverName} is going to ${ride.destination}`,
              tag: `new-ride-${change.doc.id}`
            });
          }
        }
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'rides');
    });

    // Admin Notifications
    let unsubAdminComplaints = () => {};
    let unsubAdminWarnings = () => {};
    
    if (profile.role === 'admin' || user.email === 'munirkhattak.pk@gmail.com') {
      const qComplaints = query(collection(db, 'complaints'), where('status', '==', 'pending'), orderBy('createdAt', 'desc'), limit(1));
      let initComplaints = true;
      unsubAdminComplaints = onSnapshot(qComplaints, (snapshot) => {
        if (initComplaints) { initComplaints = false; return; }
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            showNotification('New Complaint', {
              body: 'A new complaint has been submitted.',
              tag: `complaint-${change.doc.id}`
            });
          }
        });
      });

      const qWarnings = query(collection(db, 'warnings'), where('status', '==', 'replied'), limit(1));
      let initWarnings = true;
      unsubAdminWarnings = onSnapshot(qWarnings, (snapshot) => {
        if (initWarnings) { initWarnings = false; return; }
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'modified') {
            showNotification('Warning Reply', {
              body: 'A user has replied to a warning.',
              tag: `warning-reply-${change.doc.id}`
            });
          }
        });
      });
    }

    // Bookings Listener
    const qBookings = query(
      collection(db, 'bookings'),
      where('participants', 'array-contains', user.uid),
      orderBy('createdAt', 'desc')
    );
    let initBookings = true;
    const unsubBookings = onSnapshot(qBookings, (snapshot) => {
      const bookings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
      setActiveBookings(bookings);

      if (initBookings) { initBookings = false; return; }
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const booking = change.doc.data() as Booking;
          if (booking.driverId === user.uid) {
            showNotification('New Booking!', {
              body: `${booking.passengerName} ne aap ki seat book ki hai.`,
              tag: `new-booking-${change.doc.id}`
            });
          }
        } else if (change.type === 'modified') {
          const booking = change.doc.data() as Booking;
          if (booking.status === 'confirmed' && booking.passengerId === user.uid) {
            showNotification('Booking Confirmed!', {
              body: `${booking.driverName} ne aap ki booking confirm kar di hai.`,
              tag: `booking-confirmed-${change.doc.id}`
            });
          }
        }
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'bookings');
    });

    return () => {
      unsubNewRequests();
      unsubMyRequests();
      unsubMessages();
      unsubNewRides();
      unsubAdminComplaints();
      unsubAdminWarnings();
      unsubBookings();
      unsubUserNotifs();
      unsubAdminNotifs();
    };
  }, [user, profile]);

  // Visit Tracking
  useEffect(() => {
    const trackVisit = async () => {
      if (!navigator.onLine) return;
      try {
        const today = format(new Date(), 'yyyy-MM-dd');
        const analyticsRef = doc(db, 'analytics', today);
        const docSnap = await getDoc(analyticsRef);
        
        if (docSnap.exists()) {
          await updateDoc(analyticsRef, { visits: increment(1) });
        } else {
          await setDoc(analyticsRef, { visits: 1 });
        }
      } catch (error: any) {
        // Only log if it's not an offline error to avoid spamming the console
        if (!error?.message?.toLowerCase().includes('offline') && !error?.message?.toLowerCase().includes('unavailable')) {
          console.error("Visit tracking error:", error);
        }
      }
    };
    
    const timer = setTimeout(trackVisit, 5000);
    return () => clearTimeout(timer);
  }, []);

  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);

  const handleCreateBooking = async (ride: Ride | RideRequest, seats: number) => {
    if (!user || !profile || isSubmittingBooking) return;
    setIsSubmittingBooking(true);
    try {
      const isRideOffer = 'availableSeats' in ride;
      const bookingData: any = {
        rideId: ride.id,
        driverId: isRideOffer ? (ride as Ride).driverId : user.uid,
        passengerId: isRideOffer ? user.uid : (ride as RideRequest).passengerId,
        passengerName: isRideOffer ? profile.displayName : (ride as RideRequest).passengerName,
        driverName: isRideOffer ? (ride as Ride).driverName : profile.displayName,
        seats,
        status: 'pending',
        type: isRideOffer ? 'ride_booking' : 'request_booking',
        participants: [isRideOffer ? (ride as Ride).driverId : user.uid, isRideOffer ? user.uid : (ride as RideRequest).passengerId],
        origin: ride.origin,
        destination: ride.destination,
        date: ride.date,
        time: ride.time,
        passengerWhatsapp: isRideOffer ? profile.whatsappNumber : (ride as RideRequest).whatsappNumber,
        driverWhatsapp: isRideOffer ? (ride as Ride).whatsappNumber : profile.whatsappNumber,
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'bookings'), bookingData);
      setBookingTask(null);
      toast.success("Booking request bhej di gayi hai!");
      // Show Interstitial Ad after successful booking request
      setShowInterstitialAd(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'bookings');
    } finally {
      setIsSubmittingBooking(false);
    }
  };

  const handleUpdateBookingStatus = async (bookingId: string, status: 'confirmed' | 'cancelled') => {
    try {
      const bookingRef = doc(db, 'bookings', bookingId);
      const bookingSnap = await getDoc(bookingRef);
      if (!bookingSnap.exists()) return;
      const bookingData = bookingSnap.data() as Booking;

      await updateDoc(bookingRef, { status });

      if (status === 'confirmed') {
        const rewardStatus = {
          name: bookingData.passengerName,
          startTimeConfirmed: false,
          driverConfirmed: false,
          passengerConfirmed: false,
          rewardIssued: false
        };

        if (bookingData.type === 'ride_booking') {
          const rideRef = doc(db, 'rides', bookingData.rideId);
          await updateDoc(rideRef, {
            availableSeats: increment(-bookingData.seats),
            participants: arrayUnion(bookingData.passengerId),
            [`rewardStatus.${bookingData.passengerId}`]: rewardStatus
          });
        } else {
          const requestRef = doc(db, 'rideRequests', bookingData.rideId);
          await updateDoc(requestRef, {
            status: 'matched',
            participants: arrayUnion(bookingData.driverId),
            driverId: bookingData.driverId,
            driverName: bookingData.driverName,
            [`rewardStatus.${bookingData.passengerId}`]: rewardStatus
          });
        }
        toast.success("Booking confirm ho gayi!");
      } else {
        toast.info("Booking cancel kar di gayi.");
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${bookingId}`);
    }
  };

  const handleRewardAction = async (task: any, action: 'confirm' | 'cancel') => {
    if (action === 'cancel') {
      setRewardTask(null);
      return;
    }

    try {
      const rideRef = doc(db, task.ride.collection || 'rides', task.ride.id);
      const rewardKey = `rewardStatus.${task.passengerId}`;

      if (task.type === 'start') {
        await updateDoc(rideRef, {
          [`${rewardKey}.startTimeConfirmed`]: true,
          [`${rewardKey}.startConfirmedBy`]: user.uid
        });
        setRewardTask({ ...task, type: 'start_success' });
        toast.success("Safar shuru hone ki tasdeeq ho gayi!");
      } else if (task.type === 'complete') {
        const isDriver = user?.uid === task.ride.driverId;
        await updateDoc(rideRef, {
          [`${rewardKey}.${isDriver ? 'driverConfirmed' : 'passengerConfirmed'}`]: true,
          [`${rewardKey}.lastConfirmedBy`]: user.uid
        });
        setRewardTask({ ...task, type: 'success' });
        toast.success("Ride completion status bhej diya gaya!");
      } else if (task.type === 'confirm_complete') {
        // Both confirmed, mark as done (Rewards disabled)
        const rideRef = doc(db, task.ride.collection || 'rides', task.ride.id);
        const rewardKey = `rewardStatus.${task.passengerId}`;
        
        // Mark as issued/done
        await updateDoc(rideRef, {
          [`${rewardKey}.rewardIssued`]: true,
          [`${rewardKey}.driverConfirmed`]: true,
          [`${rewardKey}.passengerConfirmed`]: true
        });

        setRewardTask({ ...task, type: 'success' });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'rides');
    }
  };

  if (loading || splashLoading) return <LoadingSpinner />;

  // Enforce startup Launch Screen & Profile Registration Completion (allow privacy policy without login)
  if (view !== 'privacy_policy' && (!user || !profile)) {
    return (
      <LaunchSignInScreen 
        user={user} 
        profile={profile} 
        setUser={setUser}
        setProfile={setProfile} 
        setView={setView} 
      />
    );
  }

  const renderView = () => {
    switch (view) {
      case 'main':
        return <MainPage setView={setView} setProfile={setProfile} user={user} profile={profile} travelScope={travelScope} onBack={() => setTravelScope(null)} />;
      case 'register': {
        let defaultRegRole: 'driver' | 'passenger' = (profile?.role as 'driver' | 'passenger') || 'passenger';
        try {
          const pendingDistRole = localStorage.getItem('pendingDistrictRole');
          if (pendingDistRole === 'owner') defaultRegRole = 'driver';
          else if (pendingDistRole === 'passenger') defaultRegRole = 'passenger';
        } catch (e) {
          console.error(e);
        }
        return <RegistrationForm user={user} role={defaultRegRole} setView={setView} setProfile={setProfile} />;
      }
      case 'dashboard':
        return (
          <Dashboard 
            user={user} 
            profile={profile} 
            setView={setView} 
            onRewardAction={setRewardTask}
            onCompleteRide={setRewardTask}
            activeBookings={activeBookings}
            onUpdateBookingStatus={handleUpdateBookingStatus}
            isOnline={isOnline}
            travelScope={travelScope}
            onShowAd={() => setShowInterstitialAd(true)}
          />
        );
      case 'post':
        return <PostForm user={user} profile={profile} setView={setView} type={profile?.role === 'driver' ? 'ride' : 'request'} travelScope={travelScope} onShowAd={() => setShowInterstitialAd(true)} />;
      case 'edit_post':
        return <PostForm user={user} profile={profile} setView={setView} type={profile?.role === 'driver' ? 'ride' : 'request'} editItem={selectedItem} travelScope={travelScope} onShowAd={() => setShowInterstitialAd(true)} />;
      case 'search':
        return <RouteSearch setView={setView} userRole={(profile?.role as 'driver' | 'passenger') || 'passenger'} onWhatsAppClick={setWaModalData} onBookClick={setBookingTask} travelScope={travelScope} />;
      case 'profile_view':
        return <DetailedProfileView 
          item={selectedItem} 
          user={user}
          setView={setView} 
          onWhatsAppClick={setWaModalData} 
          onBookClick={(item) => setBookingTask(item)}
        />;
      case 'chat':
        return <Chat user={user} item={selectedItem} setView={setView} />;
      case 'messages':
        return <Inbox user={user} setView={setView} />;
      case 'my_rides':
        return <MyRides user={user} setView={setView} />;
      case 'my_requests':
        return <MyRequests user={user} setView={setView} />;
      case 'edit_profile':
        return <EditProfile user={user} profile={profile} setView={setView} setProfile={setProfile} />;
      case 'admin_dashboard':
        return <AdminDashboard setView={setView} showNotification={showNotification} allRides={allRides} user={user} />;
      case 'complaint':
        return <ComplaintForm user={user} profile={profile} setView={setView} />;
      case 'privacy_policy':
        return <PrivacyPolicy setView={setView} />;
      default:
        return <MainPage setView={setView} setProfile={setProfile} user={user} profile={profile} travelScope={travelScope} onBack={() => setTravelScope(null)} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Toaster position="top-center" />
      
      {!isOnline && (
        <motion.div 
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="bg-red-600 text-white text-[10px] py-1 px-4 text-center font-bold sticky top-0 z-[60] flex items-center justify-center gap-2"
        >
          <WifiOff className="w-3 h-3" />
          Internet nahi hai! Kuch features sahi kaam nahi karenge.
        </motion.div>
      )}

      <Header user={user} profile={profile} setView={(v, item) => {
        if (v === 'main') {
          setTravelScope(null);
        }
        setView(v, item);
      }} onSignInClick={() => setShowSignInModal(true)} onInstall={deferredPrompt ? handleInstall : undefined} />
      

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-8">
        <AnimatePresence mode="wait">
          {travelScope === null && view === 'main' ? (
            <motion.div
              key="scope-selector"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
            >
              <TravelScopeSelection onSelect={(scope) => {
                setTravelScope(scope);
              }} />
            </motion.div>
          ) : (
            <motion.div
              key={view}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {renderView()}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      <AnimatedFooter setView={setView} />

      {activeWarning && view === 'dashboard' && (
        <UserWarningModal warning={activeWarning} onClose={() => setActiveWarning(null)} />
      )}

      {activeComplaintReply && view === 'dashboard' && (
        <ComplaintReplyModal complaint={activeComplaintReply} onClose={() => setActiveComplaintReply(null)} />
      )}

      {pendingStatusReport && (
        <RideStatusPromptModal 
          item={pendingStatusReport} 
          onClose={() => setPendingStatusReport(null)} 
        />
      )}
      {waModalData && (
        <WhatsAppConfirmationModal 
          item={waModalData} 
          user={user} 
          profile={profile} 
          onClose={() => setWaModalData(null)} 
        />
      )}

      {bookingTask && (
        <BookingModal 
          ride={bookingTask} 
          user={user} 
          onClose={() => setBookingTask(null)} 
          onConfirm={(seats) => handleCreateBooking(bookingTask, seats)}
          isSubmitting={isSubmittingBooking}
        />
      )}

      {showInterstitialAd && (
        <InterstitialAd onClose={() => setShowInterstitialAd(false)} />
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
                role={'passenger'} 
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

function Header({ user, profile, setView, onSignInClick, onInstall }: { user: User | null, profile: UserProfile | null, setView: (v: any, item?: any) => void, onSignInClick: () => void, onInstall?: () => void }) {
  return (
    <header className="bg-white border-b sticky top-0 z-50 shadow-sm">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4 cursor-pointer" onClick={() => setView('main')}>
          <img src="/icon.svg" className="w-[56px] h-[56px] object-contain drop-shadow-md" alt="EasyTravel Logo" referrerPolicy="no-referrer" />
          <div className="flex flex-col">
            <h1 className="text-3xl font-black tracking-tighter leading-none">
              <span className="text-red-600">Easy</span>
              <span className="text-blue-600">Travel</span>
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
                  Let's Travel Together
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
              variant="default" 
              size="sm" 
              className="rounded-full bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white h-9 px-4 gap-2 text-xs font-black shadow-lg shadow-blue-200 animate-pulse-subtle border-none" 
              onClick={onInstall}
            >
              <Smartphone className="w-4 h-4" />
              <span>Install App</span>
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
            <Avatar className="w-10 h-10 border-2 cursor-pointer hover:ring-2 ring-blue-400 transition-all shadow-sm" onClick={() => setView('profile_view', { ...profile, uid: user.uid, photoURL: user.photoURL, displayName: user.displayName })}>
              <AvatarImage src={user.photoURL || ''} />
              <AvatarFallback>{user.displayName?.charAt(0)}</AvatarFallback>
            </Avatar>
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

function InterstitialAd({ onClose }: { onClose: () => void }) {
  const [timeLeft, setTimeLeft] = useState(5);
  const [canClose, setCanClose] = useState(false);

  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setCanClose(true);
    }
  }, [timeLeft]);

  return (
    <div className="fixed inset-0 z-[10000] bg-black flex flex-col">
      <div className="absolute top-4 right-4 z-10">
        <Button 
          variant="ghost" 
          size="sm" 
          className="text-white bg-white/10 hover:bg-white/20 rounded-full h-10 w-10 p-0"
          onClick={() => canClose && onClose()}
          disabled={!canClose}
        >
          {canClose ? <X className="w-6 h-6" /> : <span className="text-xs font-bold">{timeLeft}</span>}
        </Button>
      </div>
      
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-8">
        <div className="space-y-2">
          <Badge className="bg-yellow-500 text-black font-bold px-3 py-1">PREMIUM AD</Badge>
          <h2 className="text-3xl font-black text-white leading-tight">Dhamaka Offer! <br/> <span className="text-blue-400">Abhi Click Karein</span></h2>
          <p className="text-slate-400 text-sm">Ye ad dekhne se aap ki earning mein izafa hota hai.</p>
        </div>

        <div className="w-full max-w-xs aspect-[4/5] bg-gradient-to-br from-blue-600 to-indigo-900 rounded-3xl shadow-2xl overflow-hidden relative group cursor-pointer border-4 border-white/10" onClick={() => window.open('https://www.google.com', '_blank')}>
          <img 
            src="https://picsum.photos/seed/ads/800/1000" 
            alt="Premium Ad" 
            className="w-full h-full object-cover opacity-80 group-hover:scale-110 transition-transform duration-700"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-6 text-left">
            <h4 className="text-white font-bold text-xl mb-1">EasyTravel Premium</h4>
            <p className="text-white/70 text-xs mb-4">Sasta aur safe safar, sirf hamare sath. Click kar ke mazeed janey!</p>
            <Button className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold h-12 rounded-xl shadow-lg">
              Visit Now
            </Button>
          </div>
          <div className="absolute top-3 left-3 bg-black/40 backdrop-blur-md px-2 py-1 rounded text-[10px] text-white/80 font-medium">
            Sponsored
          </div>
        </div>

        <div className="text-slate-500 text-[10px] max-w-xs">
          *Ad par click karne se system ko support milti hai aur aap ko behtar services milti hain.
        </div>
      </div>
    </div>
  );
}

function BookingModal({ 
  ride, 
  user, 
  onClose, 
  onConfirm,
  isSubmitting
}: { 
  ride: Ride | RideRequest, 
  user: User | null, 
  onClose: () => void, 
  onConfirm: (seats: number) => void,
  isSubmitting?: boolean
}) {
  const [seats, setSeats] = useState(1);
  const isRideOffer = 'availableSeats' in ride;
  const maxSeats = isRideOffer ? (ride as Ride).availableSeats : 4; // Default max for requests

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl border border-slate-100 p-8 space-y-6"
      >
        <div className="text-center space-y-2">
          <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <Car className="w-10 h-10 text-blue-600" />
          </div>
          <h3 className="text-2xl font-black text-slate-900 tracking-tight">
            {isRideOffer ? 'Seat Book Karein' : 'Passenger Book Karein'}
          </h3>
          <p className="text-slate-500 text-sm">
            {isRideOffer 
              ? `Aap ${ride.origin} se ${ride.destination} tak ki seat book kar rahe hain.`
              : `Aap ${(ride as RideRequest).passengerName} ki request confirm kar rahe hain.`
            }
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <span className="font-bold text-slate-700">Available Seats:</span>
            <Badge className="bg-blue-600 text-white font-bold">{maxSeats}</Badge>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-600 font-bold ml-1">Kitni seats chahiye?</Label>
            <div className="flex items-center gap-4">
              <Button 
                variant="outline" 
                className="h-12 w-12 rounded-xl border-slate-200"
                onClick={() => setSeats(Math.max(1, seats - 1))}
                disabled={isSubmitting}
              >
                -
              </Button>
              <div className="flex-1 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-xl font-black text-slate-900">
                {seats}
              </div>
              <Button 
                variant="outline" 
                className="h-12 w-12 rounded-xl border-slate-200"
                onClick={() => setSeats(Math.min(maxSeats, seats + 1))}
                disabled={isSubmitting}
              >
                +
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-2">
          <Button 
            className="h-16 rounded-2xl bg-blue-600 hover:bg-blue-700 text-xl font-black shadow-lg shadow-blue-200 transition-all active:scale-95"
            onClick={() => onConfirm(seats)}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Bhej rahe hain...' : 'Confirm Booking'}
          </Button>
          <Button variant="ghost" className="text-slate-400 font-bold hover:text-slate-600" onClick={onClose} disabled={isSubmitting}>
            Wapas
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

function NewBookingCard({ 
  booking, 
  user, 
  onAction,
  setView
}: { 
  booking: Booking, 
  user: User | null, 
  onAction: (id: string, status: 'confirmed' | 'cancelled') => void,
  setView: (v: any, item?: any) => void
}) {
  const isDriver = user?.uid === booking.driverId;
  const otherUserName = isDriver ? booking.passengerName : booking.driverName;
  const otherUserWhatsapp = isDriver ? booking.passengerWhatsapp : booking.driverWhatsapp;

  return (
    <Card className="border-none shadow-xl overflow-hidden bg-white rounded-3xl border-t-8 border-emerald-500">
      <CardContent className="p-6">
        <div className="flex flex-col gap-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-emerald-100 p-3 rounded-2xl">
                <Users className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-none hover:bg-emerald-500/20 px-2 py-0 h-5 text-[10px] font-bold uppercase tracking-wider">New Booking</Badge>
                </div>
                <p className="text-lg font-black text-slate-900 leading-tight">{otherUserName}</p>
                <p className="text-xs font-medium text-slate-500 flex items-center gap-1 mt-1">
                  <Navigation className="w-3 h-3" />
                  {booking.origin} to {booking.destination}
                </p>
              </div>
            </div>
            <div className="text-right space-y-1">
              <div className="inline-flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-lg">
                <Users className="w-3 h-3 text-slate-600" />
                <span className="text-xs font-black text-slate-900">{booking.seats} Seats</span>
              </div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{booking.date} • {booking.time}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button 
              size="sm" 
              variant="outline" 
              className="h-12 rounded-2xl border-emerald-100 bg-emerald-50/50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-200 gap-2 font-bold transition-all active:scale-95"
              onClick={() => window.open(`https://wa.me/${otherUserWhatsapp}`, '_blank')}
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              className="h-12 rounded-2xl border-blue-100 bg-blue-50/50 text-blue-700 hover:bg-blue-100 hover:border-blue-200 gap-2 font-bold transition-all active:scale-95"
              onClick={() => setView('chat', booking)}
            >
              <MessageSquare className="w-4 h-4" />
              Chat
            </Button>
          </div>

          {booking.status === 'pending' && isDriver && (
            <div className="flex items-center gap-3 pt-2">
              <Button 
                className="flex-1 h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black shadow-lg shadow-emerald-200 transition-all active:scale-95"
                onClick={() => onAction(booking.id, 'confirmed')}
              >
                Confirm
              </Button>
              <Button 
                variant="ghost" 
                className="flex-1 h-14 rounded-2xl text-slate-400 font-bold hover:text-rose-600 hover:bg-rose-50 transition-all"
                onClick={() => onAction(booking.id, 'cancelled')}
              >
                Cancel
              </Button>
            </div>
          )}

          {booking.status === 'confirmed' && (
            <div className="flex flex-col gap-3 pt-2">
              <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-2xl text-center">
                <p className="text-emerald-700 font-bold text-xs flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Booking Confirmed!
                </p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MainPage({ setView, setProfile, user, profile, travelScope, onBack }: { setView: (v: any, item?: any) => void, setProfile: (p: any) => void, user: User | null, profile: UserProfile | null, travelScope?: 'intercity' | 'intracity' | null, onBack?: () => void }) {
  const handleRoleSelection = async (role: 'driver' | 'passenger') => {
    // If user is already logged in, update their role in the profile
    if (user && profile) {
      if (profile.role !== role) {
        try {
          const updatedProfile = { ...profile, role };
          await updateDoc(doc(db, 'users', user.uid), { role });
          setProfile(updatedProfile);
          toast.success(`Ab aap ${role === 'driver' ? 'Car Owner' : 'Passenger'} ke dashboard mein hain`);
        } catch (error) {
          console.error("Error updating role:", error);
          toast.error("Role update karne mein masla hua");
        }
      }
      setView('dashboard');
    } else {
      // If not logged in, proceed to registration
      setView('register');
    }
  };

  return (
    <div className="space-y-4 pt-1 pb-4">
      {onBack && (
        <div className="px-4 flex items-center justify-between">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onBack}
            className="w-10 h-10 rounded-full hover:bg-slate-100 active:scale-95 transition-all flex items-center justify-center bg-white shadow-md border border-slate-100 shrink-0"
          >
            <ArrowLeft className="w-5 h-5 text-slate-700" />
          </Button>
          <span className="text-xs font-bold text-slate-500 bg-slate-100/90 px-3.5 py-1.5 rounded-full border border-slate-200/50 shadow-xs tracking-wide">
            {travelScope === 'intracity' ? 'Local District' : 'City-To-City'}
          </span>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-4">
        <motion.div
          whileHover={{ scale: 1.02, translateY: -5 }}
          whileTap={{ scale: 0.98 }}
        >
          <Card 
            className="h-full cursor-pointer border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-800 text-white group relative"
            onClick={() => handleRoleSelection('driver')}
          >
            <motion.div 
              animate={{ x: [0, 8, -8, 0], y: [0, -3, 3, 0] }}
              transition={{ repeat: Infinity, duration: 8, ease: "easeInOut" }}
              className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"
            >
              <Car className="w-24 h-24 rotate-12" />
            </motion.div>
            <CardHeader className="p-6 relative z-10">
              <div className="bg-white/20 w-12 h-12 rounded-xl flex items-center justify-center mb-4 backdrop-blur-md">
                <Car className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-3xl font-bold mb-1">
                {travelScope === 'intracity' ? (
                  <>Main Car / Bike <br /> Owner Hoon</>
                ) : (
                  <>Mai Car Owner <br /> Hoon</>
                )}
              </CardTitle>
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
            onClick={() => handleRoleSelection('passenger')}
          >
            <motion.div 
              animate={{ y: [0, -6, 6, 0], scale: [1, 1.04, 0.96, 1], rotate: [-12, -8, -16, -12] }}
              transition={{ repeat: Infinity, duration: 7, ease: "easeInOut" }}
              className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"
            >
              <UserIcon className="w-24 h-24" />
            </motion.div>
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

function PrivacyPolicy({ setView }: { setView: (v: any) => void }) {
  return (
    <div className="space-y-6 py-6 pb-20 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon" className="rounded-full shrink-0" onClick={() => setView('main')}>
          <ArrowLeft className="w-5 h-5 text-slate-700" />
        </Button>
        <div className="flex flex-col flex-1">
          <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Privacy Policy</h2>
          <p className="text-slate-500 text-xs mt-0.5">Last Updated: June 13, 2026 • Version 2.2.0</p>
        </div>
      </div>

      <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-white">
        <CardContent className="p-6 md:p-8 space-y-6">
          <p className="text-slate-600 text-sm md:text-base leading-relaxed font-outfit text-justify">
            Welcome to EasyTravel. We are dedicated to respecting and protecting your privacy under strict confidentiality rules. When you use our application to match, list, or coordinate travels, we collect minimal necessary identity markers such as your name, email, profile picture, travel roles, contact numbers, and device indicators including Firebase Cloud Messaging (FCM) tokens that are processed solely for immediate system notifications about rides or messages. To facilitate coordination, your verified phone and WhatsApp contact coordinates are matched exclusively and shared with your confirmed car owners or passengers without being visible to general external guests. We commit that we never sell, lease, rent, or trade your personal information or contact directory to external marketing networks. To protect user autonomy, we support absolute immediate permanent purging; executing profile deletion instantly and permanently removes all your data from our active Google Firestore databases. While we carry out general moderation and handle safety complaints, users operate as part of a peer marketplace and should always cross-match coordinates, inspect licenses, share active routes with trusted relatives, and report any uncomfortable interactions via our forms.
          </p>

          <div className="pt-6">
            <Button className="w-full bg-blue-600 hover:bg-blue-700 h-14 rounded-2xl font-black text-lg gap-2 shadow-lg shadow-blue-100 active:scale-95 transition-all text-white" onClick={() => setView('main')}>
              <Check className="w-6 h-6" /> Wapis Jayen
            </Button>
          </div>
        </CardContent>
      </Card>
      
      <p className="text-center text-slate-400 text-[10px] font-bold uppercase tracking-widest">EasyTravel Safety Program • Compliance Department</p>
    </div>
  );
}

function RegistrationForm({ user, role: initialRole, setView, setProfile, onClose }: { user: User | null, role: 'driver' | 'passenger', setView: (v: any, item?: any) => void, setProfile: (p: any) => void, onClose?: () => void }) {
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
        // Check if user profile already exists
        const userDoc = await getDoc(doc(db, 'users', result.uid));
        if (userDoc.exists()) {
          // Profile exists, just go to dashboard
          const p = userDoc.data() as UserProfile;
          setProfile(p);
          setView('dashboard');
          if (onClose) onClose();
        } else {
          // Profile doesn't exist, proceed to completion
          setFormData(prev => ({
            ...prev,
            displayName: result.displayName || '',
            photoURL: result.photoURL || ''
          }));
          setStep(2);
        }
      }
    } catch (error: any) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (
        errMsg.includes('auth/popup-closed-by-user') || 
        errMsg.includes('auth/popup-blocked') || 
        (error && error.code === 'auth/popup-closed-by-user') ||
        (error && error.code === 'auth/popup-blocked')
      ) {
        toast.warning(
          "Popup block ho gaya! Iframe/Preview restriction ki wajah se. Ise fix karne ke liye app ko 'New Tab' me open karein (top right arrow icon se) aur wahan se sign in karein.",
          { duration: 8000 }
        );
      } else {
        toast.error(`Sign in fail ho gaya: ${errMsg}`);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    // Phone number validation: 03 followed by 9 digits
    const phoneRegex = /^03\d{9}$/;
    if (!phoneRegex.test(formData.whatsappNumber)) {
      toast.error('WhatsApp number 03 se shuru hona chahiye aur 11 digits ka hona chahiye (e.g., 03001234567)');
      return;
    }

    try {
      const customId = `ET-${Math.floor(100000 + Math.random() * 900000)}`;
      const newProfile: UserProfile = {
        uid: user.uid,
        customId: customId,
        displayName: formData.displayName,
        email: user.email || '',
        photoURL: formData.photoURL,
        phoneNumber: formData.whatsappNumber, // Use WhatsApp number as phone number
        whatsappNumber: formData.whatsappNumber,
        role: selectedRole,
        easyCoins: 0,
        createdAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'users', user.uid), newProfile);
      setProfile(newProfile);
      toast.success(`Registration mukammal ho gayi! Aap ki ID: ${customId}`);
      setView('dashboard');
      if (onClose) onClose();
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
          <CardTitle>Sign In</CardTitle>
          <CardDescription>EasyTravel mein khush amdeed</CardDescription>
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
            <Input placeholder="03xx-xxxxxxx" value={formData.whatsappNumber} onChange={e => setFormData({...formData, whatsappNumber: e.target.value})} required />
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

function AdSlot({ label = "Sponsored Ad" }: { label?: string }) {
  return (
    <div className="w-full bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-4 flex flex-col items-center justify-center min-h-[100px] my-4 group hover:border-blue-200 transition-colors">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-3 h-3 text-slate-400 group-hover:text-blue-400" />
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
      </div>
      <div className="text-xs text-slate-400 text-center italic">
        Yahan Google Ad nazar aayega
      </div>
    </div>
  );
}

function ComplaintForm({ user, profile, setView }: { user: User | null, profile: UserProfile | null, setView: (v: any, item?: any) => void }) {
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

function EditProfile({ user, profile, setView, setProfile }: { user: User | null, profile: UserProfile | null, setView: (v: any, item?: any) => void, setProfile: (p: any) => void }) {
  const [formData, setFormData] = useState({
    displayName: profile?.displayName || '',
    phoneNumber: profile?.phoneNumber || '',
    whatsappNumber: profile?.whatsappNumber || '',
    bio: profile?.bio || '',
    photoURL: profile?.photoURL || ''
  });

  const [editRoleGroup, setEditRoleGroup] = useState<'vehicle_owner' | 'passenger'>(
    profile?.role === 'driver' ? 'vehicle_owner' : 'passenger'
  );
  const [editVehicleType, setEditVehicleType] = useState<'Car' | 'Bike'>(
    profile?.vehicleType || 'Car'
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    
    // Phone number validation: 03 followed by 9 digits
    const phoneRegex = /^03\d{9}$/;
    if (!phoneRegex.test(formData.whatsappNumber)) {
      toast.error('WhatsApp number 03 se shuru hona chahiye aur 11 digits ka hona chahiye (e.g., 03001234567)');
      return;
    }

    try {
      const updatedProfile: UserProfile = {
        ...profile,
        displayName: formData.displayName,
        photoURL: formData.photoURL,
        phoneNumber: formData.whatsappNumber, // Use WhatsApp number as phone number
        whatsappNumber: formData.whatsappNumber,
        role: editRoleGroup === 'passenger' ? 'passenger' : 'driver',
        vehicleType: editRoleGroup === 'vehicle_owner' ? editVehicleType : undefined,
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

      <Card className="max-w-md mx-auto border border-slate-100 shadow-xl rounded-3xl overflow-hidden bg-white">
        <CardHeader>
          <CardTitle>Profile Edit Karein</CardTitle>
          <CardDescription>Apni maloomat ko yahan update karein</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex justify-center mb-6 relative">
              <Avatar className="w-24 h-24 border-4 border-blue-100">
                <AvatarImage src={formData.photoURL} />
                <AvatarFallback>{formData.displayName.charAt(0)}</AvatarFallback>
              </Avatar>
              <label className="absolute bottom-0 right-1/2 translate-x-10 bg-white p-1.5 rounded-full shadow-md cursor-pointer hover:bg-slate-50">
                <Plus className="w-4 h-4 text-blue-600" />
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      toast.info("Gallery upload feature is ready to be linked to Firebase Storage.");
                    }
                  }}
                />
              </label>
            </div>

            <div className="space-y-2">
              <Label>System Generated User ID (Read-only)</Label>
              <Input value={profile?.customId || ''} readOnly className="bg-slate-100 cursor-not-allowed" />
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
              <Label>WhatsApp Number</Label>
              <Input 
                value={formData.whatsappNumber} 
                onChange={e => setFormData({...formData, whatsappNumber: e.target.value})} 
                placeholder="03xx-xxxxxxx"
              />
            </div>

            {/* Role & Vehicle Selection in Edit Profile */}
            <div className="space-y-3 pt-1">
              <Label className="text-sm font-bold text-slate-700">Role & Vehicle Selection</Label>
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  type="button"
                  variant={editRoleGroup === 'vehicle_owner' ? 'default' : 'outline'}
                  className={`h-11 rounded-xl text-xs font-bold transition-all border-slate-200 ${
                    editRoleGroup === 'vehicle_owner' 
                      ? 'bg-blue-600 hover:bg-blue-700 text-white border-none shadow-md' 
                      : 'bg-transparent text-slate-600 hover:bg-slate-50'
                  }`}
                  onClick={() => setEditRoleGroup('vehicle_owner')}
                >
                  <Car className="w-3.5 h-3.5 mr-1" /> Vehicle Owner
                </Button>
                
                <Button 
                  type="button"
                  variant={editRoleGroup === 'passenger' ? 'default' : 'outline'}
                  className={`h-11 rounded-xl text-xs font-bold transition-all border-slate-200 ${
                    editRoleGroup === 'passenger' 
                      ? 'bg-blue-600 hover:bg-blue-700 text-white border-none shadow-md' 
                      : 'bg-transparent text-slate-600 hover:bg-slate-50'
                  }`}
                  onClick={() => setEditRoleGroup('passenger')}
                >
                  <UserIcon className="w-3.5 h-3.5 mr-1" /> Passenger
                </Button>
              </div>

              {editRoleGroup === 'vehicle_owner' && (
                <div className="space-y-1.5 p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                  <Label className="text-slate-500 text-[10px] font-extrabold uppercase tracking-wider block">Vehicle Type</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      type="button"
                      variant={editVehicleType === 'Car' ? 'default' : 'outline'}
                      className={`h-9 rounded-lg text-[11px] font-bold transition-all border-slate-200 ${
                        editVehicleType === 'Car' 
                          ? 'bg-slate-900 hover:bg-slate-800 text-white border-none shadow-sm' 
                          : 'bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                      onClick={() => setEditVehicleType('Car')}
                    >
                      <Car className="w-3 h-3 mr-1" /> Car Owner
                    </Button>
                    
                    <Button 
                      type="button"
                      variant={editVehicleType === 'Bike' ? 'default' : 'outline'}
                      className={`h-9 rounded-lg text-[11px] font-bold transition-all border-slate-200 ${
                        editVehicleType === 'Bike' 
                          ? 'bg-slate-900 hover:bg-slate-800 text-white border-none shadow-sm' 
                          : 'bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                      onClick={() => setEditVehicleType('Bike')}
                    >
                      <Bike className="w-3 h-3 mr-1" /> Bike Owner
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Bio</Label>
              <Input 
                value={formData.bio} 
                onChange={e => setFormData({...formData, bio: e.target.value})} 
                placeholder="Apne baare mein batayein..."
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

function Dashboard({ 
  user, 
  profile, 
  setView, 
  onRewardAction, 
  onCompleteRide,
  activeBookings,
  onUpdateBookingStatus,
  isOnline,
  travelScope,
  onShowAd
}: { 
  user: User | null, 
  profile: UserProfile | null, 
  setView: (v: any, item?: any) => void, 
  onRewardAction: (task: any) => void, 
  onCompleteRide: (task: any) => void,
  activeBookings: Booking[],
  onUpdateBookingStatus: (id: string, status: 'confirmed' | 'cancelled') => void,
  isOnline: boolean,
  travelScope: 'intercity' | 'intracity' | null,
  onShowAd?: () => void
}) {
  const userRole = profile?.role || 'passenger';
  const [activeRidesList, setActiveRidesList] = useState<any[]>([]);
  const [activeRequestsList, setActiveRequestsList] = useState<any[]>([]);
  const [showLiveMap, setShowLiveMap] = useState(false);
  const [autoActive, setAutoActive] = useState(false);
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [showGpsModal, setShowGpsModal] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [now, setNow] = useState(new Date());

  const [selfOrigin, setSelfOrigin] = useState('Karak City');
  const [selfDestination, setSelfDestination] = useState('Latamber');
  const [selfVehicleType, setSelfVehicleType] = useState<'Car' | 'Bike' | 'All'>('All');
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [modalOrigin, setModalOrigin] = useState('');
  const [modalDestination, setModalDestination] = useState('');
  const [modalVehicleType, setModalVehicleType] = useState<'Car' | 'Bike' | 'All'>('All');

  useEffect(() => {
    if (userRole === 'driver') {
      setSelfVehicleType('Car');
    } else {
      setSelfVehicleType('All');
    }
  }, [userRole]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'rides'),
      where('participants', 'array-contains', user.uid)
    );
    return onSnapshot(q, (snap) => {
      const rides = snap.docs.map(doc => ({ id: doc.id, collection: 'rides', ...doc.data() }));
      setActiveRidesList(rides);
    }, (error) => {
      console.error("Error listening for active rides:", error);
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'rideRequests'),
      where('participants', 'array-contains', user.uid)
    );
    return onSnapshot(q, (snap) => {
      const requests = snap.docs.map(doc => ({ id: doc.id, collection: 'rideRequests', ...doc.data() }));
      setActiveRequestsList(requests);
    }, (error) => {
      console.error("Error listening for active ride requests:", error);
    });
  }, [user]);

  const activeRides = useMemo(() => [...activeRidesList, ...activeRequestsList], [activeRidesList, activeRequestsList]);

  const parseRideDate = (dateStr: string, timeStr: string) => {
    try {
      if (!dateStr) return new Date(0);
      // Handle yyyy-MM-dd format
      const parts = dateStr.split('-');
      if (parts.length !== 3) return new Date(dateStr); // Fallback to native
      const [year, month, day] = parts.map(Number);
      const [hours, minutes] = (timeStr || '00:00').split(':').map(Number);
      return new Date(year, month - 1, day, hours, minutes);
    } catch (e) {
      return new Date(0);
    }
  };

  const filteredBookings = useMemo(() => {
    return activeBookings.filter(b => {
      if (b.status === 'cancelled') return false;
      if (b.status === 'pending') return true;
      
      // For confirmed bookings, check if started
      const ride = activeRides.find(r => r.id === b.rideId);
      
      // If ride is deleted or cancelled, hide the booking
      if (!ride || ride.isDeleted || ride.status === 'cancelled') return false;

      const status = ride?.rewardStatus?.[b.passengerId];
      
      // If started, it moves to Active Rides
      if (status?.startTimeConfirmed) return false;

      // Also move automatically if time has passed
      const rideTime = parseRideDate(b.date, b.time).getTime();
      if (now.getTime() >= rideTime) return false;

      // Keep in bookings if not started yet and time hasn't passed
      return true;
    });
  }, [activeBookings, activeRides, now]);

  const rewardTasks = useMemo(() => {
    return [];
  }, []);

  if (showLiveMap) {
    return (
      <div className="py-4">
        <LiveActivePassengerMap 
          userRole={userRole === 'driver' ? 'driver' : 'passenger'}
          driverProfile={profile} 
          onClose={() => {
            setShowLiveMap(false);
          }} 
          autoActive={autoActive}
          setAutoActive={setAutoActive}
          selfOrigin={selfOrigin}
          setSelfOrigin={setSelfOrigin}
          selfDestination={selfDestination}
          setSelfDestination={setSelfDestination}
          selfVehicleType={selfVehicleType}
          setSelfVehicleType={setSelfVehicleType}
          travelScope={travelScope}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 py-4">
      {!isOnline && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm font-medium flex items-center gap-3 shadow-sm"
        >
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <p>Aap is waqt offline hain. Meherbani farma kar apna internet connection check karein aur page reload karein.</p>
        </motion.div>
      )}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
            <Badge className={userRole === 'driver' ? 'bg-blue-600' : 'bg-orange-500'}>
              {userRole === 'driver' ? (profile?.vehicleType === 'Bike' ? 'Bike Owner' : 'Car Owner') : 'Passenger'}
            </Badge>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Compact Smart Wallet Button (Only for Car Owner / Driver) */}
            {userRole === 'driver' && (
              <button 
                onClick={() => setShowWalletModal(true)}
                className="flex items-center gap-1.5 h-9 px-3.5 text-xs font-black rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 shadow-xs cursor-pointer active:scale-95 transition-all shrink-0 select-none ml-auto"
              >
                <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xs">
                  <Wallet className="w-3 h-3" />
                </div>
                <span>Wallet</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Foran Passenger/Ride Mode available for both roles */}
      <>
        <Card 
          onClick={() => {
            if (autoActive) {
              setShowLiveMap(true);
            }
          }}
          className={`border border-slate-100 shadow-md bg-white rounded-2xl overflow-hidden p-4 relative transition-all duration-300 ${autoActive ? 'cursor-pointer hover:border-blue-200 hover:shadow-lg bg-blue-50/5' : ''}`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center">
                <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 text-[13px] font-black px-3 py-1 rounded-full border border-blue-200/60 shadow-sm font-sans whitespace-nowrap">
                  <span className="w-2 h-2 bg-blue-600 rounded-full animate-ping shrink-0" />
                  <span>{userRole === 'driver' ? 'Fauran Passenger Chahye' : 'Fauran Ride Chahye'}</span>
                  <span className="ml-3 tracking-[0.15em] font-extrabold text-[11px] text-blue-500 uppercase shrink-0">(Active Mode)</span>
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-700 leading-relaxed pt-1">
                {userRole === 'driver' 
                  ? 'Agar aap ko abhi foran passenger chahiye, to active button on karein. Aur agay Map pe aur Map k neche List me Active Passengers me se ksi k sath bhi apni Ride Done kren.'
                  : 'Agar aap ko abhi foran rider ya active car / bike owner chahiye, to active button on karein. Aur agay Map pe aur Map k neche List me Active Car/Bike Owners me se ksi k sath bhi apni Ride Done kren.'}
              </p>
            </div>
            
            <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] sm:text-xs font-black uppercase tracking-wider transition-colors duration-200 ${autoActive ? 'text-blue-600 font-extrabold' : 'text-slate-400 opacity-60'}`}>
                  Active
                </span>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!gpsEnabled) {
                      setShowGpsModal(true);
                    } else {
                      const nextVal = !autoActive;
                      if (nextVal) {
                        setModalOrigin('');
                        setModalDestination('');
                        setModalVehicleType(travelScope === 'intercity' ? 'Car' : selfVehicleType);
                        setShowRouteModal(true);
                      } else {
                        setAutoActive(false);
                        toast.info("Active mode turned OFF.");
                      }
                    }
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${autoActive ? 'bg-emerald-500' : 'bg-slate-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoActive ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
          </div>
        </Card>

        {/* GPS Location Permission Enable Modal */}
        <AnimatePresence>
          {showGpsModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-white rounded-3xl max-w-sm w-full shadow-2xl overflow-hidden p-6 text-center space-y-4"
              >
                <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto border border-red-100">
                  <MapPin className="w-8 h-8 animate-pulse" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-lg font-bold text-slate-900">GPS Location Off Hai</h3>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    Apna actual real-time location (GPS location) on karein taake aap active {userRole === 'driver' ? 'passengers' : 'drivers aur rides'} aur surroundings ko maps par dekh sakein.
                  </p>
                </div>
                <div className="flex flex-col gap-2 pt-2">
                  <Button 
                    onClick={() => {
                      setGpsEnabled(true);
                      setShowGpsModal(false);
                      setModalOrigin('');
                      setModalDestination('');
                      setModalVehicleType(travelScope === 'intercity' ? 'Car' : selfVehicleType);
                      setShowRouteModal(true);
                    }}
                    className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 font-bold text-sm text-white rounded-xl shadow-lg border-none"
                  >
                    GPS Turn On Karein
                  </Button>
                  <Button 
                    variant="ghost"
                    onClick={() => setShowGpsModal(false)}
                    className="w-full h-10 text-xs text-slate-400 font-semibold hover:bg-slate-50 hover:text-slate-600"
                  >
                    Abhi Nahi
                  </Button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ROUTE SELECTION MODAL (Kahan Se - Kahan Tak) */}
        <AnimatePresence>
          {showRouteModal && (
            <div className="fixed inset-0 z-[2000] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden p-6 space-y-6 border border-slate-100 text-slate-900"
              >
                {/* Header */}
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto border border-blue-100">
                    <Navigation className="w-6 h-6 animate-pulse text-blue-600" />
                  </div>
                  <div>
                    <h4 className="text-lg font-black text-slate-900 tracking-tight">Active Route Set Karein</h4>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed">
                      Aap is waqt <span className="font-extrabold text-blue-600">{userRole === 'driver' ? 'Driver 🚗' : 'Passenger 🎒'}</span> k taur par online ja rahay hain.
                    </p>
                  </div>
                </div>

                {/* Form inputs */}
                <div className="space-y-4 text-left">
                  {/* From Box */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      Kahan Se? (Where to go from?)
                    </label>
                    <div className="relative">
                      <input 
                        type="text" 
                        value={modalOrigin}
                        onChange={(e) => setModalOrigin(e.target.value)}
                        placeholder="e.g. Karak"
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 text-sm bg-slate-50/50 text-slate-950 placeholder:italic placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-sans"
                      />
                    </div>
                  </div>

                  {/* To Box */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                      Kahan Tak? (Where to go to?)
                    </label>
                    <div className="relative">
                      <input 
                        type="text" 
                        value={modalDestination}
                        onChange={(e) => setModalDestination(e.target.value)}
                        placeholder={travelScope === 'intercity' ? "e.g. Islamabad" : "e.g. Latamber, Karak"}
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 text-sm bg-slate-50/50 text-slate-950 placeholder:italic placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-sans"
                      />
                    </div>
                  </div>

                  {/* Options below the inputs based on role */}
                  {travelScope !== 'intercity' && (
                    <div className="space-y-2 pt-1">
                      {userRole === 'passenger' ? (
                        <>
                          <label className="text-xs font-bold text-slate-700">
                            Safar Kis Cheez Par Karna Hai? (Preference)
                          </label>
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { value: 'All', label: 'All 🎒', desc: 'Any Ride' },
                              { value: 'Car', label: 'Car 🚗', desc: 'Comfortable' },
                              { value: 'Bike', label: 'Bike 🏍️', desc: 'Fast & Eco' }
                            ].map((opt) => (
                              <button
                                type="button"
                                key={opt.value}
                                onClick={() => setModalVehicleType(opt.value as any)}
                                className={`p-2 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-0.5 ${
                                  modalVehicleType === opt.value
                                    ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20 font-black scale-[1.03]'
                                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700 font-semibold'
                                }`}
                              >
                                <span className="text-xs">{opt.label}</span>
                                <span className={`text-[8px] font-medium block ${modalVehicleType === opt.value ? 'text-blue-100' : 'text-slate-400'}`}>
                                  {opt.desc}
                                </span>
                              </button>
                            ))}
                          </div>
                        </>
                      ) : (
                        <>
                          <label className="text-xs font-bold text-slate-700">
                            Aapke Paas Konsi Gari Hai? (Vehicle Type)
                          </label>
                          <div className="grid grid-cols-2 gap-3">
                            {[
                              { value: 'Car', label: 'Car 🚗', desc: '4-Wheel Owner' },
                              { value: 'Bike', label: 'Bike 🏍️', desc: '2-Wheel Owner' }
                            ].map((opt) => (
                              <button
                                type="button"
                                key={opt.value}
                                onClick={() => setModalVehicleType(opt.value as any)}
                                className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-1 ${
                                  modalVehicleType === opt.value
                                    ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20 font-black scale-[1.03]'
                                    : 'bg-slate-50 hover:bg-slate-105 border-slate-200 text-slate-700 font-semibold'
                                }`}
                              >
                                <span className="text-sm">{opt.label}</span>
                                <span className={`text-[9px] font-medium block ${modalVehicleType === opt.value ? 'text-blue-100' : 'text-slate-400'}`}>
                                  {opt.desc}
                                </span>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Submitting Actions */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <Button 
                    onClick={() => setShowRouteModal(false)}
                    variant="outline"
                    className="rounded-2xl font-bold h-11 text-xs text-slate-600 hover:bg-slate-55 border border-slate-200"
                  >
                    Nahi (Cancel)
                  </Button>
                  <Button 
                    onClick={() => {
                      if (!modalOrigin.trim() || !modalDestination.trim()) {
                        toast.error("Meherbani farma kar dono fields fill karein!");
                        return;
                      }
                      setSelfOrigin(modalOrigin.trim());
                      setSelfDestination(modalDestination.trim());
                      setSelfVehicleType(modalVehicleType);
                      setShowRouteModal(false);
                      setAutoActive(true);
                      setShowLiveMap(true); // Navigate directly to map page!
                      toast.success(
                        `Aap live ho chuke hain! Route: ${modalOrigin.trim()} ➔ ${modalDestination.trim()} (${modalVehicleType === 'All' ? 'Car & Bike All' : modalVehicleType})`
                      );
                    }}
                    className="bg-blue-600 hover:bg-blue-750 text-white rounded-2xl font-extrabold h-11 text-xs border-none shadow-lg shadow-blue-500/20"
                  >
                    Yes [OK]
                  </Button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </>

      {filteredBookings.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider px-1">Bookings</h3>
          <div className="grid grid-cols-1 gap-3">
            {filteredBookings.map(booking => (
              <NewBookingCard 
                key={booking.id} 
                booking={booking} 
                user={user} 
                onAction={onUpdateBookingStatus} 
                setView={setView}
              />
            ))}
          </div>
        </div>
      )}

      {/* Informative Advance Booking Banner */}
      <div className="bg-gradient-to-br from-indigo-50/80 via-blue-50/50 to-white border border-indigo-100/80 rounded-2xl p-4 flex items-start gap-3.5 shadow-sm transition-all hover:shadow duration-300">
        <div className="bg-gradient-to-br from-indigo-500 to-blue-600 p-2.5 rounded-xl shadow-md text-white shrink-0 mt-0.5">
          <CalendarIcon className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 leading-none">
            Advance Booking Plan Karen <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
          </h4>
          <p className="text-xs text-slate-600 font-medium leading-relaxed">
            {userRole === 'driver' ? (
              <>
                Agar aap ne <span className="text-indigo-600 font-extrabold">Kal</span> <span className="text-slate-400 font-normal">ya</span> <span className="text-indigo-600 font-extrabold">Baad</span> <span className="text-slate-400 font-normal">me</span> jana hai to neche <span className="text-emerald-600 font-bold">Passenger Dhoonden</span> ya <span className="text-indigo-600 font-bold">Naya Post lagaaen</span> taakeh Passengers aapke sath advance booking kar saken.
              </>
            ) : (
              <>
                Agar aap ne <span className="text-indigo-600 font-extrabold">Kal</span> <span className="text-slate-400 font-normal">ya</span> <span className="text-indigo-600 font-extrabold">Baad</span> <span className="text-slate-400 font-normal">me</span> jana hai to neche <span className="text-emerald-600 font-bold">Car Owner Dhoonden</span> ya <span className="text-indigo-600 font-bold">Naya Post lagaaen</span> taakeh Car Owners aapke sath advance booking kar saken.
              </>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5">
        <Button 
          className="h-24 text-xl gap-4 bg-emerald-600 hover:bg-emerald-700 shadow-xl rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98]"
          onClick={() => setView('search')}
        >
          <div className="bg-white/20 p-2 rounded-xl">
            <Search className="w-7 h-7" />
          </div>
          {userRole === 'driver' ? 'Passenger Dhoonden' : 'Car Owner Dhoonden'}
        </Button>
        <Button 
          className="h-24 text-xl gap-4 bg-indigo-600 hover:bg-indigo-700 shadow-xl rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98]"
          onClick={() => setView('post')}
        >
          <div className="bg-white/20 p-2 rounded-xl">
            <Plus className="w-7 h-7" />
          </div>
          {userRole === 'driver' ? 'Naya Post Lagayen' : 'Naya Post Lagayen'}
        </Button>
        {userRole === 'driver' && (
          <Button 
            className="h-24 text-xl gap-4 bg-amber-600 hover:bg-amber-700 shadow-xl rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98]"
            onClick={() => setView('my_rides')}
          >
            <div className="bg-white/20 p-2 rounded-xl">
              <Car className="w-7 h-7" />
            </div>
            Mere Posts
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
            Mere Posts
          </Button>
        )}
        <Button 
          className="h-24 text-xl gap-4 bg-blue-600 hover:bg-blue-700 shadow-xl rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98]"
          onClick={() => setView('messages')}
        >
          <div className="bg-white/20 p-2 rounded-xl">
            <MessageSquare className="w-7 h-7" />
          </div>
          Messages (Chat)
        </Button>
      </div>
      <AdSlot label="Dashboard Ad" />

      {/* Wallet Modal for commission & loyalty visualization */}
      <WalletModal 
        isOpen={showWalletModal} 
        onClose={() => setShowWalletModal(false)} 
        driverName={profile?.displayName || "Karak Jan"} 
        profile={profile}
        onShowAd={onShowAd}
      />
    </div>
  );
}

function SearchableSelector({
  label,
  value,
  onChange,
  options,
  placeholder = 'Type to search...',
  icon,
}: {
  label?: string;
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
  icon?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearchQuery(value);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const sortedOptions = useMemo(() => {
    return [...options].sort((a, b) => a.localeCompare(b));
  }, [options]);

  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q === '') return sortedOptions;
    return sortedOptions.filter(opt => opt.toLowerCase().includes(q));
  }, [searchQuery, sortedOptions]);

  return (
    <div ref={containerRef} className="relative w-full space-y-1">
      {label && <Label className="text-xs font-bold text-slate-600 block">{label}</Label>}
      <div className="relative">
        {icon && <div className="absolute left-3.5 top-3.5 text-slate-400 z-10">{icon}</div>}
        <Input
          type="text"
          value={searchQuery}
          placeholder={placeholder}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            const val = e.target.value;
            setSearchQuery(val);
            onChange(val);
            setIsOpen(true);
          }}
          className={`w-full bg-white border border-slate-200 text-sm h-11 rounded-xl pr-4 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition-all ${icon ? 'pl-11' : 'pl-4'}`}
        />
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto"
          >
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-xs text-slate-500 font-medium">Koi option nahi mila. Aap jo chahen type kr skte hain.</div>
            ) : (
              <div className="p-1">
                {filteredOptions.map((opt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setSearchQuery(opt);
                      onChange(opt);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs rounded-lg font-semibold transition-colors duration-150 flex items-center justify-between ${
                      value === opt 
                        ? 'bg-blue-50 text-blue-700' 
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>{opt}</span>
                    {value === opt && <Check className="w-4 h-4 text-blue-600" />}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const PAKISTAN_CITIES_AND_DISTRICTS = [
  "Abbottabad", "Astore", "Attock", "Awaran", "Badin", "Bagh", "Bahawalnagar", "Bahawalpur", "Bajaur", "Bannu", 
  "Barkhan", "Batagram", "Bhakkar", "Bhalwal", "Bhimber", "Buner", "Burewala", "Chaghai", "Chakwal", "Chaman", 
  "Charsadda", "Chiniot", "Chishtian", "Chitral", "Dadu", "Daryakhan", "Daska", "Dera Bugti", "Dera Ghazi Khan", "Dera Ismail Khan", 
  "Dir", "Duki", "Faisalabad", "Ghotki", "Gilgit", "Gojra", "Gujranwala", "Gujrat", "Gwadar", "Hafizabad", "Hala", "Hangu", "Haripur", "Harnai", "Hasilpur", "Hattian Bala", 
  "Haveli", "Hazro", "Hub", "Hunza", "Hyderabad", "Islamabad", "Jacobabad", "Jafarabad", "Jamshoro", "Jampur", 
  "Jhang", "Jhelum", "Kahuta", "Kalat", "Kamoke", "Karachi", "Karak", "Kashmore", "Kasur", 
  "Kharan", "Kharian", "Khushab", "Khuzdar", "Kohat", "Kohistan", "Kot Addu", "Kotli", "Kurram", "Lahore", 
  "Lakki Marwat", "Loralai", "Lodhran", "Larkana", "Leiah", "Mandi Bahauddin", "Mansehra", "Mardan", "Mianwali", "Mingora", 
  "Mirpur", "Multan", "Murree", "Muzaffarabad", "Muzaffargarh", "Nankana Sahib", "Narowal", "Naseerabad", 
  "Nawabshah", "Nowshera", "Okara", "Orakzai", "Pakpattan", "Peshawar", "Pishin", "Quetta", "Rahim Yar Khan", 
  "Rajanpur", "Rawalakot", "Rawalpindi", "Sadiqabad", "Sahiwal", "Sambrial", "Sanghar", "Sargodha", "Shakargarh", "Shangla", 
  "Shekhupura", "Shikarpur", "Sialkot", "Sibi", "Sohbatpur", "Sudhanoti", "Sujawal", "Sukkur", "Swabi", "Swat", 
  "Tando Allahyar", "Tando Muhammad Khan", "Takht-e-Nusrati", "Tank", "Taxila", "Tharparkar", "Thatta", "Toba Tek Singh", 
  "Turbat", "Umerkot", "Vehari", "Wah Cantt", "Wazirabad", "Zhob", "Ziarat"
];

const CLEAN_LOCAL_LOCATIONS = [
  "Ahmed Abad",
  "Bahader Khel",
  "Banda Daud Shah",
  "Chowkara",
  "Ghundi Mir Khankhel",
  "Karak City",
  "Latamber",
  "Mithakhel",
  "Nari Panos",
  "Sabirabad",
  "Siraj Khel",
  "Takht-e-Nusrati"
];

function RouteSearch({ setView, userRole, onWhatsAppClick, onBookClick, travelScope }: { setView: (v: any, item?: any) => void, userRole: 'driver' | 'passenger', onWhatsAppClick: (item: any) => void, onBookClick: (item: any) => void, travelScope?: 'intercity' | 'intracity' | null }) {
  const isIntracity = travelScope === 'intracity';
  const searchUnsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (searchUnsubRef.current) {
        searchUnsubRef.current();
      }
    };
  }, []);

  const [searchData, setSearchData] = useState({
    origin: '',
    destination: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    day: format(new Date(), 'EEEE'),
    time: '',
    district: '',
    vehicle: 'Car'
  });
  const [results, setResults] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchHistory, setSearchHistory] = useState<{origin: string, destination: string}[]>([]);

  useEffect(() => {
    const history = localStorage.getItem('rideSearchHistory');
    if (history) {
      try {
        setSearchHistory(JSON.parse(history));
      } catch (e) {
        console.error('Failed to parse search history', e);
      }
    }
  }, []);

  const handleSearch = (e?: React.FormEvent, overrideData?: any) => {
    if (e) e.preventDefault();
    const dataToSearch = overrideData || searchData;
    
    if (dataToSearch.origin || dataToSearch.destination) {
      const newHistoryItem = { origin: dataToSearch.origin, destination: dataToSearch.destination };
      const newHistory = [newHistoryItem, ...searchHistory.filter(h => h.origin !== newHistoryItem.origin || h.destination !== newHistoryItem.destination)].slice(0, 5);
      setSearchHistory(newHistory);
      localStorage.setItem('rideSearchHistory', JSON.stringify(newHistory));
    }

    const collectionName = userRole === 'driver' ? 'rideRequests' : 'rides';
    
    if (searchUnsubRef.current) {
      searchUnsubRef.current();
      searchUnsubRef.current = null;
    }

    // Fetch all documents and filter client-side for case-insensitivity
    const q = query(collection(db, collectionName));
    
    const unsub = onSnapshot(q, (snapshot) => {
      let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Client-side filtering
      data = data.filter((item: any) => !item.isDeleted);
      
      if (isIntracity) {
        data = data.filter((item: any) => item.scope === 'intracity');
        
        if (dataToSearch.district) {
          data = data.filter((item: any) => item.district?.toLowerCase() === dataToSearch.district.toLowerCase());
        }
        if (dataToSearch.vehicle && dataToSearch.vehicle !== 'All') {
          data = data.filter((item: any) => item.vehicle === dataToSearch.vehicle);
        }
        if (dataToSearch.origin) {
          data = data.filter((item: any) => item.origin?.trim().toLowerCase().includes(dataToSearch.origin.trim().toLowerCase()));
        }
        if (dataToSearch.destination) {
          data = data.filter((item: any) => item.destination?.trim().toLowerCase().includes(dataToSearch.destination.trim().toLowerCase()));
        }
        if (dataToSearch.date) {
          data = data.filter((item: any) => item.date === dataToSearch.date);
        }
      } else {
        data = data.filter((item: any) => item.scope !== 'intracity');
        if (dataToSearch.origin) {
          data = data.filter((item: any) => item.origin?.trim().toLowerCase() === dataToSearch.origin.trim().toLowerCase());
        }
        if (dataToSearch.destination) {
          data = data.filter((item: any) => item.destination?.trim().toLowerCase() === dataToSearch.destination.trim().toLowerCase());
        }
        if (dataToSearch.date) {
          data = data.filter((item: any) => item.date === dataToSearch.date);
        }
      }
      
      setResults(data);
      setHasSearched(true);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, collectionName);
    });

    searchUnsubRef.current = unsub;
  };

  const renderResultsUI = () => (
    <>
      {searchHistory.length > 0 && !hasSearched && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-slate-500">Pichli Searches (Recent Searches):</h3>
          <div className="flex flex-wrap gap-2">
            {searchHistory.map((h, idx) => (
              <Badge 
                key={idx} 
                variant="secondary" 
                className="cursor-pointer hover:bg-slate-200 px-3 py-1.5"
                onClick={() => {
                  const newData = { ...searchData, origin: h.origin, destination: h.destination };
                  setSearchData(newData);
                  handleSearch(undefined, newData);
                }}
              >
                <Search className="w-3 h-3 mr-1" />
                {h.origin || 'Any'} se {h.destination || 'Any'}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {hasSearched && (
        <div className="space-y-4">
          <h3 className="font-bold text-lg border-b pb-2">Results:</h3>
          {results.length === 0 ? (
            <EmptyState message={userRole === 'driver' ? "Filhal koi Passenger available nahi hai." : "Filhal koi Driver available nahi hai."} />
          ) : (
            <div className="space-y-4">
              {results.map((item) => (
                <div key={item.id}>
                  <Card className="hover:border-blue-400 cursor-pointer" onClick={() => setView('profile_view', item)}>
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
                    <CardFooter className="p-3 bg-slate-50/50 flex flex-col gap-2">
                      <Button 
                        className="w-full bg-slate-900 hover:bg-black text-white font-black rounded-xl h-12 shadow-lg shadow-slate-200 transition-all active:scale-95" 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          onBookClick(item); 
                        }}
                      >
                        {item.driverId ? 'Book Your Seat' : 'Book Passenger'}
                      </Button>
                      <div className="flex gap-2 w-full">
                        <Button variant="outline" size="sm" className="flex-1 h-10 rounded-lg gap-1 text-blue-600 border-blue-100 bg-blue-50/50 hover:bg-blue-100" onClick={(e) => { 
                          e.stopPropagation(); 
                          trackInteraction(item.id, 'chat', userRole === 'driver' ? 'rideRequests' : 'rides');
                          setView('chat', item); 
                        }}><MessageSquare className="w-3 h-3" /> Chat</Button>
                        <Button variant="outline" size="sm" className="flex-1 h-10 rounded-lg gap-1 text-green-600 border-green-100 bg-green-50/50 hover:bg-green-100" onClick={(e) => { 
                          e.stopPropagation(); 
                          trackInteraction(item.id, 'whatsapp', userRole === 'driver' ? 'rideRequests' : 'rides');
                          onWhatsAppClick(item); 
                        }}><MessageCircle className="w-3 h-3" /> WhatsApp</Button>
                        <Button variant="outline" size="sm" className="flex-1 h-10 rounded-lg gap-1 text-slate-600 border-slate-200 bg-white hover:bg-slate-50" onClick={(e) => { 
                          e.stopPropagation(); 
                          trackInteraction(item.id, 'call', userRole === 'driver' ? 'rideRequests' : 'rides');
                          window.open(`tel:${item.whatsappNumber}`, '_self'); 
                        }}><Phone className="w-3 h-3" /> Call</Button>
                      </div>
                    </CardFooter>
                  </Card>
                </div>
              ))}
            </div>
          )}
          <div className="pt-4 border-t border-slate-100">
            <AdSlot label="Search Results Ad" />
          </div>
        </div>
      )}
    </>
  );

  if (isIntracity) {
    const handleDistrictChange = (d: string) => {
      setSearchData(prev => ({
        ...prev,
        district: d,
        origin: '',
        destination: ''
      }));
    };

    return (
      <div className="space-y-6">
        <Card className="border border-slate-100 shadow-xl rounded-2xl overflow-hidden bg-white">
          <CardHeader className="border-b border-slate-50 pb-4">
            <CardTitle className="flex items-center gap-2 text-slate-800 text-lg font-black">
              <Button 
                variant="ghost" 
                size="icon" 
                className="hover:bg-slate-100 rounded-full h-10 w-10 text-slate-700"
                onClick={() => setView('dashboard')}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              Kaha se Kaha aur Kab jana hai (Local & District)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleSearch} className="space-y-4">
              
              {/* Row 1: District/City Searchable Selector */}
              <div className="space-y-1">
                <SearchableSelector
                  label="Zila / City Search & Select"
                  value={searchData.district}
                  onChange={handleDistrictChange}
                  options={PAKISTAN_CITIES_AND_DISTRICTS}
                  placeholder="Zila / City Search..."
                  icon={<MapPin className="w-4 h-4 text-slate-500" />}
                />
              </div>

              {/* Row 2: Origin and Destination Inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1 relative w-full">
                  <Label className="text-xs font-bold text-slate-600 block">Kahan Se (Locality)</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3.5 top-3.5 text-emerald-600 w-4 h-4 z-10" />
                    <Input
                      type="text"
                      value={searchData.origin}
                      onChange={(e) => setSearchData(prev => ({ ...prev, origin: e.target.value }))}
                      placeholder="Konsi jaga se jana hai..."
                      className="w-full bg-white border border-slate-200 text-sm h-11 rounded-xl pr-4 pl-11 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition-all placeholder:italic placeholder:font-normal placeholder:text-slate-400"
                    />
                  </div>
                </div>

                <div className="space-y-1 relative w-full">
                  <Label className="text-xs font-bold text-slate-600 block">Kahan Tak (Locality)</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3.5 top-3.5 text-rose-600 w-4 h-4 z-10" />
                    <Input
                      type="text"
                      value={searchData.destination}
                      onChange={(e) => setSearchData(prev => ({ ...prev, destination: e.target.value }))}
                      placeholder="Konsi jaga tk jana hai..."
                      className="w-full bg-white border border-slate-200 text-sm h-11 rounded-xl pr-4 pl-11 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition-all placeholder:italic placeholder:font-normal placeholder:text-slate-400"
                    />
                  </div>
                </div>
              </div>

              {/* Row 3: Vehicle selection buttons */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-600 block">Gari / Vehicle Type</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant={searchData.vehicle === 'Car' ? 'default' : 'outline'}
                    className={`h-11 font-black rounded-xl flex items-center justify-center gap-1.5 text-xs transition-all ${
                      searchData.vehicle === 'Car' 
                        ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm' 
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                    onClick={() => setSearchData(prev => ({ ...prev, vehicle: 'Car' }))}
                  >
                    <Car className="w-4 h-4" /> Car 🚗
                  </Button>
                  <Button
                    type="button"
                    variant={searchData.vehicle === 'Bike' ? 'default' : 'outline'}
                    className={`h-11 font-black rounded-xl flex items-center justify-center gap-1.5 text-xs transition-all ${
                      searchData.vehicle === 'Bike' 
                        ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm' 
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                    onClick={() => setSearchData(prev => ({ ...prev, vehicle: 'Bike' }))}
                  >
                    <Bike className="w-4 h-4" /> Bike 🏍️
                  </Button>
                  <Button
                    type="button"
                    variant={searchData.vehicle === 'All' ? 'default' : 'outline'}
                    className={`h-11 font-black rounded-xl flex items-center justify-center gap-1.5 text-xs transition-all ${
                      searchData.vehicle === 'All' 
                        ? 'bg-slate-950 text-white shadow-sm' 
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                    onClick={() => setSearchData(prev => ({ ...prev, vehicle: 'All' }))}
                  >
                    All 🌐
                  </Button>
                </div>
              </div>

              {/* Row 4: Date and Day */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-600 block">Tareekh (Date)</Label>
                  <Input 
                    type="date" 
                    value={searchData.date} 
                    onChange={e => {
                      const d = new Date(e.target.value);
                      setSearchData(prev => ({ ...prev, date: e.target.value, day: format(d, 'EEEE') }));
                    }} 
                    className="h-11 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-600 block">Din (Day)</Label>
                  <Input value={searchData.day} readOnly className="bg-slate-50 h-11 rounded-xl text-slate-500 font-bold" />
                </div>
              </div>

              {/* Row 5: Time of Day selection */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-600 block">Waqt (Time of Day)</Label>
                <select
                  className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none shadow-sm"
                  value={searchData.time}
                  onChange={e => setSearchData(prev => ({ ...prev, time: e.target.value }))}
                >
                  <option value="">All Times</option>
                  <option value="Subah (Morning)">Subah (Morning)</option>
                  <option value="Dopehar (Afternoon)">Dopehar (Afternoon)</option>
                  <option value="Sham (Evening)">Sham (Evening)</option>
                  <option value="Raat (Night)">Raat (Night)</option>
                </select>
              </div>

              <Button 
                type="submit" 
                className="w-full py-6 font-black bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg transition-all active:scale-95 text-sm"
              >
                Dhoonden
              </Button>
            </form>
          </CardContent>
        </Card>
        {renderResultsUI()}
      </div>
    );
  }

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
      
      {renderResultsUI()}
    </div>
  );
}

const AnimatedFooter = memo(function AnimatedFooter({ setView }: { setView: (v: any, item?: any) => void }) {
  return (
    <footer className="bg-white border-t pt-4 pb-4 overflow-hidden relative">
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
            <div className="flex items-center gap-4">
              <Button 
                variant="link" 
                className="text-slate-400 font-medium text-sm p-0 h-auto hover:no-underline hover:text-blue-500 transition-colors font-sans"
                onClick={() => setView('complaint')}
              >
                Contact Us
              </Button>
              <span className="text-slate-200">|</span>
              <Button 
                variant="link" 
                className="text-slate-400 font-medium text-sm p-0 h-auto hover:no-underline hover:text-blue-500 transition-colors font-sans"
                onClick={() => setView('privacy_policy')}
              >
                Privacy Policy
              </Button>
            </div>
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
        <div className="w-24 h-24 flex items-center justify-center">
          <img src="/icon.svg" className="w-24 h-24 object-contain drop-shadow-xl animate-pulse" alt="EasyTravel Logo" referrerPolicy="no-referrer" />
        </div>
        
        <div className="flex flex-col items-center">
          <h1 className="text-5xl font-black tracking-tighter leading-none mb-3">
            <span className="text-red-600">Easy</span>
            <span className="text-blue-600">Travel</span>
          </h1>
          
          {/* Car Animation */}
          <div className="h-8 w-56 relative overflow-hidden">
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
                className="text-blue-500 font-extrabold text-[12px] tracking-wide whitespace-nowrap"
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

function PostForm({ user, profile, setView, type, editItem, travelScope, onShowAd }: { user: User | null, profile: UserProfile | null, setView: (v: any, item?: any) => void, type: 'ride' | 'request', editItem?: any, travelScope?: 'intercity' | 'intracity' | null, onShowAd?: () => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isIntracity = travelScope === 'intracity';

  const [formData, setFormData] = useState({
    origin: editItem?.origin || '',
    destination: editItem?.destination || '',
    date: editItem?.date || format(new Date(), 'yyyy-MM-dd'),
    day: editItem?.day || format(new Date(), 'EEEE'),
    time: editItem?.time || '',
    pickupPoint: editItem?.pickupPoint || '',
    dropoffPoint: editItem?.dropoffPoint || '',
    seats: editItem?.availableSeats?.toString() || '4',
    price: editItem?.price?.toString() || '',
    district: editItem?.district || '',
    vehicle: editItem?.vehicle || 'Car'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || isSubmitting) return;
    setIsSubmitting(true);
    const collectionName = type === 'ride' ? 'rides' : 'rideRequests';
    try {
      const data = type === 'ride' ? {
        driverId: user.uid,
        driverName: profile?.displayName || user.displayName || 'User',
        driverPhoto: user.photoURL,
        phoneNumber: profile?.phoneNumber || '',
        whatsappNumber: profile?.whatsappNumber || '',
        bio: profile?.bio || '',
        origin: formData.origin,
        destination: formData.destination,
        date: formData.date,
        day: formData.day,
        time: formData.time,
        pickupPoint: formData.pickupPoint || 'Main Chowk',
        dropoffPoint: formData.dropoffPoint || 'Main Bazar',
        availableSeats: parseInt(formData.seats) || 1,
        price: parseInt(formData.price) || 0,
        status: editItem ? editItem.status : 'available',
        finalStatus: editItem ? editItem.finalStatus : 'pending',
        participants: editItem?.participants || [user.uid],
        scope: isIntracity ? 'intracity' : 'intercity',
        district: isIntracity ? formData.district : '',
        vehicle: isIntracity ? formData.vehicle : '',
        ...(editItem ? {} : { createdAt: serverTimestamp() })
      } : {
        passengerId: user.uid,
        passengerName: profile?.displayName || user.displayName || 'User',
        passengerPhoto: user.photoURL,
        phoneNumber: profile?.phoneNumber || '',
        whatsappNumber: profile?.whatsappNumber || '',
        bio: profile?.bio || '',
        origin: formData.origin,
        destination: formData.destination,
        date: formData.date,
        day: formData.day,
        time: formData.time,
        pickupPoint: formData.pickupPoint || 'Main Chowk',
        dropoffPoint: formData.dropoffPoint || 'Main Bazar',
        status: editItem ? editItem.status : 'pending',
        finalStatus: editItem ? editItem.finalStatus : 'pending',
        participants: editItem?.participants || [user.uid],
        scope: isIntracity ? 'intracity' : 'intercity',
        district: isIntracity ? formData.district : '',
        vehicle: isIntracity ? formData.vehicle : '',
        availableSeats: parseInt(formData.seats) || 1,
        price: parseInt(formData.price) || 0,
        ...(editItem ? {} : { createdAt: serverTimestamp() })
      };

      if (editItem) {
        await updateDoc(doc(db, collectionName, editItem.id), data);
        toast.success('Post update ho gaya!');
      } else {
        await addDoc(collection(db, collectionName), data);
        toast.success(isIntracity ? 'Local district post lag gaya!' : 'Safar post ho gaya!');
        if (onShowAd) onShowAd();
      }
      setView('dashboard');
    } catch (error) {
      handleFirestoreError(error, editItem ? OperationType.UPDATE : OperationType.CREATE, editItem ? `${collectionName}/${editItem.id}` : collectionName);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isIntracity) {
    const handleDistrictChange = (d: string) => {
      setFormData(prev => ({
        ...prev,
        district: d,
        origin: '',
        destination: ''
      }));
    };

    return (
      <Card className="border border-slate-100 shadow-xl rounded-2xl overflow-hidden bg-white">
        <CardHeader className="border-b border-slate-50 pb-4">
          <CardTitle className="flex items-center gap-2 text-slate-800 text-lg font-black">
            <Button 
              variant="ghost" 
              size="icon" 
              className="hover:bg-slate-100 rounded-full h-10 w-10 text-slate-700"
              onClick={() => setView('dashboard')}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            {editItem ? 'Post Edit Karen' : (type === 'ride' ? 'Ride Offer Karen' : 'Safar Request Karen')} (Local & District)
          </CardTitle>
        </CardHeader>

        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* District Selection */}
            <div className="space-y-1">
              <SearchableSelector
                label="Zila / City Search & Select"
                value={formData.district}
                onChange={handleDistrictChange}
                options={PAKISTAN_CITIES_AND_DISTRICTS}
                placeholder="Zila / City Search..."
                icon={<MapPin className="w-4 h-4 text-slate-500" />}
              />
            </div>

            {/* Vehicle Toggle Option with Icons */}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-600 block">Gari / Ride Vehicle Type</Label>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant={formData.vehicle === 'Car' ? 'default' : 'outline'}
                  className={`h-11 font-black rounded-xl flex items-center justify-center gap-2 text-xs transition-all ${
                    formData.vehicle === 'Car' 
                      ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-700' 
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                  onClick={() => setFormData({...formData, vehicle: 'Car', seats: '4'})}
                >
                  <Car className="w-4 h-4" /> Car (Gari) 🚗
                </Button>
                <Button
                  type="button"
                  variant={formData.vehicle === 'Bike' ? 'default' : 'outline'}
                  className={`h-11 font-black rounded-xl flex items-center justify-center gap-2 text-xs transition-all ${
                    formData.vehicle === 'Bike' 
                      ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-700' 
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                  onClick={() => setFormData({...formData, vehicle: 'Bike', seats: '1'})}
                >
                  <Bike className="w-4 h-4" /> Bike (Motorcycle) 🏍️
                </Button>
              </div>
            </div>

            {/* Locations (From and To inside District) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1 relative w-full">
                <Label className="text-xs font-bold text-slate-600 block">Kahan Se (Locality)</Label>
                <div className="relative">
                  <MapPin className="absolute left-3.5 top-3.5 text-emerald-600 w-4 h-4 z-10" />
                  <Input
                    type="text"
                    value={formData.origin}
                    onChange={(e) => setFormData(prev => ({ ...prev, origin: e.target.value }))}
                    placeholder="Konsi jaga se jana hai..."
                    className="w-full bg-white border border-slate-200 text-sm h-11 rounded-xl pr-4 pl-11 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition-all placeholder:italic placeholder:font-normal placeholder:text-slate-400"
                  />
                </div>
              </div>

              <div className="space-y-1 relative w-full">
                <Label className="text-xs font-bold text-slate-600 block">Kahan Tak (Locality)</Label>
                <div className="relative">
                  <MapPin className="absolute left-3.5 top-3.5 text-rose-600 w-4 h-4 z-10" />
                  <Input
                    type="text"
                    value={formData.destination}
                    onChange={(e) => setFormData(prev => ({ ...prev, destination: e.target.value }))}
                    placeholder="Konsi jaga tk jana hai..."
                    className="w-full bg-white border border-slate-200 text-sm h-11 rounded-xl pr-4 pl-11 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition-all placeholder:italic placeholder:font-normal placeholder:text-slate-400"
                  />
                </div>
              </div>
            </div>

            {/* Date, Day, and Time */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-600 block">Tareekh (Date)</Label>
                <Input 
                  type="date" 
                  value={formData.date} 
                  onChange={e => {
                    const val = e.target.value;
                    if (val) {
                      const d = new Date(val);
                      setFormData({...formData, date: val, day: format(d, 'EEEE')});
                    } else {
                      setFormData({...formData, date: val, day: ''});
                    }
                  }} 
                  required 
                  className="h-11 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-600 block">Din (Day)</Label>
                <Input value={formData.day} readOnly className="bg-slate-50 h-11 rounded-xl text-slate-500 font-bold" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-600 block">Waqt (Time)</Label>
              <Input 
                type="time" 
                value={formData.time} 
                onChange={e => setFormData({...formData, time: e.target.value})} 
                required 
                className="h-11 rounded-xl"
              />
            </div>

            {/* Seats & Rent (Karaya) */}
            <div className="grid grid-cols-2 gap-4 border border-slate-100 bg-slate-50/10 p-4 rounded-xl">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-600 block">Available Seats</Label>
                <select
                  value={formData.seats}
                  onChange={(e) => setFormData({...formData, seats: e.target.value})}
                  className="w-full bg-white border border-slate-200 text-sm h-11 rounded-xl px-3 font-semibold focus:ring-1 focus:ring-blue-500 text-slate-700 outline-none shadow-sm"
                >
                  {formData.vehicle === 'Bike' ? (
                    <option value="1">1 Seat</option>
                  ) : (
                    <>
                      <option value="1">1 Seat</option>
                      <option value="2">2 Seats</option>
                      <option value="3">3 Seats</option>
                      <option value="4">4 Seats</option>
                    </>
                  )}
                </select>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-xs font-bold text-slate-600 block">Karaaya (Fare Rs.)</Label>
                  <Popover>
                    <PopoverTrigger className="text-slate-400 hover:text-blue-600 transition-colors">
                      <Info className="w-3.5 h-3.5" />
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-4 bg-white shadow-2xl border-slate-200 rounded-2xl z-50">
                      <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                        Karaaya bohot munaasib rakhen taake log asaani se raabta kr saken!
                      </p>
                    </PopoverContent>
                  </Popover>
                </div>
                <Input 
                  type="number" 
                  min="0"
                  placeholder="Karaaya munasib rakhein."
                  value={formData.price} 
                  onChange={e => setFormData({...formData, price: e.target.value})} 
                  required 
                  className="h-11 rounded-xl font-black text-blue-700 bg-blue-50/10 focus-visible:ring-blue-550 placeholder:text-blue-400 placeholder:font-normal placeholder:italic placeholder:text-[9.5px] xs:placeholder:text-[11px]"
                />
              </div>
            </div>

            {/* Submit Button */}
            <Button 
              type="submit" 
              className="w-full py-6 text-base font-black bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg transition-all hover:scale-[1.01] active:scale-[0.98]" 
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Posting...' : (type === 'ride' ? '✓ Local Ride Post Karen' : '✓ Passenger Request Post Karen')}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setView('dashboard')}><Navigation className="rotate-180" /></Button>
          {editItem ? 'Post Edit Karen' : (type === 'ride' ? 'Naya Post Lagayen' : 'Naya Post Lagayen')}
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
              <Input type="date" value={formData.date} onChange={e => {
                const val = e.target.value;
                if (val) {
                  const d = new Date(val);
                  setFormData({...formData, date: val, day: format(d, 'EEEE')});
                } else {
                  setFormData({...formData, date: val, day: ''});
                }
              }} required />
            </div>
            <div className="space-y-2">
              <Label>Din (Day)</Label>
              <Input value={formData.day} readOnly className="bg-slate-50" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Waqt (Time)</Label>
            <Input type="time" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Pickup Point</Label>
              <Input placeholder="e.g. Main Chowk" value={formData.pickupPoint} onChange={e => setFormData({...formData, pickupPoint: e.target.value})} required />
            </div>
            <div className="space-y-2">
              <Label>Dropoff Point</Label>
              <Input placeholder="e.g. Faizabad" value={formData.dropoffPoint} onChange={e => setFormData({...formData, dropoffPoint: e.target.value})} required />
            </div>
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
          <Button type="submit" className="w-full bg-blue-600" disabled={isSubmitting}>
            {isSubmitting ? 'Processing...' : (type === 'ride' ? 'Post Karein' : 'Add Laga Den')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function DetailedProfileView({ 
  item, 
  user,
  setView, 
  onWhatsAppClick,
  onBookClick
}: { 
  item: any, 
  user: User | null,
  setView: (v: any, item?: any) => void, 
  onWhatsAppClick: (item: any) => void,
  onBookClick?: (item: any) => void
}) {
  if (!item) return null;
  const isUserProfile = !!item.uid;
  const isCurrentUser = isUserProfile && user && item.uid === user.uid;
  const name = isUserProfile ? item.displayName : (item.driverName || item.passengerName);
  const photo = isUserProfile ? item.photoURL : (item.driverPhoto || item.passengerPhoto);
  const role = isUserProfile ? item.role : (item.driverId ? 'driver' : 'passenger');

  return (
    <Card className="max-w-md mx-auto border border-slate-100 shadow-xl rounded-3xl overflow-hidden bg-white">
      <CardHeader className="text-center pb-2 relative">
        <div className="absolute left-4 top-4">
          <Button 
            variant="ghost" 
            size="icon" 
            className="rounded-full hover:bg-slate-100"
            onClick={() => setView(isCurrentUser ? 'dashboard' : (isUserProfile ? 'admin_dashboard' : 'search'))}
          >
            <Navigation className="rotate-180 w-5 h-5 text-slate-700" />
          </Button>
        </div>
        
        <div className="pt-6">
          <Avatar className="w-28 h-28 mx-auto border-4 border-blue-50/50 shadow-md">
            <AvatarImage src={photo} />
            <AvatarFallback className="bg-blue-600 text-white text-3xl font-bold">
              {name ? name.charAt(0).toUpperCase() : 'U'}
            </AvatarFallback>
          </Avatar>
        </div>

        <div className="mt-4 space-y-1">
          <CardTitle className="text-2xl font-black text-slate-900 tracking-tight">{name}</CardTitle>
          {!isUserProfile && <CardDescription className="text-xs font-semibold text-slate-400">{item.origin} se {item.destination}</CardDescription>}
        </div>
      </CardHeader>

      <CardContent className="space-y-6 px-6 pb-6 pt-2">
        {!isUserProfile ? (
          <div className="bg-slate-50 p-4 rounded-xl space-y-2">
            {item.scope === 'intracity' && (
              <>
                <div className="flex justify-between text-sm border-b border-dashed border-slate-200 pb-2 mb-2">
                  <span className="text-slate-500 font-bold">District / Zila:</span>
                  <span className="font-extrabold text-emerald-700">{item.district || 'Karak'}</span>
                </div>
                <div className="flex justify-between text-sm border-b border-dashed border-slate-200 pb-2 mb-2">
                  <span className="text-slate-500 font-bold">Ride Vehicle:</span>
                  <span className="font-extrabold text-indigo-700">{item.vehicle === 'Bike' ? 'Motorcycle (Bike) 🏍️' : 'Car (Gaari) 🚗'}</span>
                </div>
              </>
            )}
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
        ) : (
          <div className="space-y-3.5">
            {/* User ID Box */}
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col shadow-sm">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">User ID</span>
              <span className="text-base font-extrabold text-slate-800 mt-0.5">{item.customId || 'ET-000000'}</span>
            </div>

            {/* WhatsApp Number Box */}
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col shadow-sm">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">WhatsApp Number</span>
              <span className="text-base font-extrabold text-slate-800 mt-0.5">{item.whatsappNumber || item.phoneNumber || 'N/A'}</span>
            </div>

            {/* Role Box */}
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col shadow-sm">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Role</span>
              <span className="text-base font-extrabold text-slate-800 mt-0.5">
                {item.role === 'passenger' ? 'Passenger 👤' : (item.vehicleType === 'Bike' ? 'Bike Owner 🏍️' : 'Car Owner 🚗')}
              </span>
            </div>

            {/* Bio Box */}
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col shadow-sm">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Bio</span>
              <span className="text-sm font-medium text-slate-600 mt-0.5 italic">
                {item.bio ? `"${item.bio}"` : 'EasyTravel par safar asan banayen!'}
              </span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 pt-2">
          {isCurrentUser ? (
            <>
              <Button className="w-full gap-2 py-6 text-lg bg-blue-600 hover:bg-blue-700 rounded-2xl text-white shadow-xl shadow-blue-200 transition-all active:scale-[0.98] font-bold" onClick={() => setView('edit_profile')}>
                <Edit className="w-5 h-5" /> Edit Profile
              </Button>
              <Button variant="outline" className="w-full gap-2 py-6 text-lg border-2 border-red-100 text-red-600 rounded-2xl hover:bg-red-50 font-bold" onClick={() => {
                logout().then(() => setView('main'));
              }}>
                <LogOut className="w-5 h-5" /> Log out
              </Button>
            </>
          ) : isUserProfile ? (
            <Button 
              className="w-full gap-2 py-6 text-lg bg-green-600 hover:bg-green-700 rounded-2xl text-white shadow-xl shadow-green-100 transition-all active:scale-[0.98] font-bold"
              onClick={() => onWhatsAppClick(item)}
            >
              <MessageCircle className="w-5 h-5" /> WhatsApp Rabta
            </Button>
          ) : (
            <>
              <Button 
                className="w-full gap-2 py-8 text-xl bg-slate-900 hover:bg-black text-white font-black shadow-xl shadow-slate-200 rounded-2xl transition-all active:scale-95" 
                onClick={() => onBookClick && onBookClick(item)}
              >
                {item.driverId ? 'Book Your Seat' : 'Book Passenger'}
              </Button>
              <Button variant="outline" className="w-full gap-2 py-6 text-lg border-2 border-blue-100 bg-blue-50/50 text-blue-700 rounded-2xl" onClick={() => {
                trackInteraction(item.id, 'chat', item.driverId ? 'rides' : 'rideRequests');
                setView('chat', item);
              }}>
                <MessageSquare className="w-5 h-5" /> In-App Chat
              </Button>
              <Button className="w-full gap-2 py-6 text-lg bg-green-600 hover:bg-green-700 rounded-2xl" onClick={() => {
                if (!isUserProfile) trackInteraction(item.id, 'whatsapp', item.driverId ? 'rides' : 'rideRequests');
                onWhatsAppClick(item);
              }}>
                <MessageCircle className="w-5 h-5" /> WhatsApp Karein
              </Button>
              <Button className="w-full gap-2 py-6 text-lg bg-blue-600 hover:bg-blue-700 rounded-2xl" onClick={() => {
                if (!isUserProfile) trackInteraction(item.id, 'call', item.driverId ? 'rides' : 'rideRequests');
                window.open(`tel:${item.whatsappNumber}`, '_self');
              }}>
                <Phone className="w-5 h-5" /> Call Karein
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Chat({ user, item, setView }: { user: User | null, item: any, setView: (v: any, item?: any) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [fetchedOtherUser, setFetchedOtherUser] = useState<UserProfile | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const rideItem = item?.ride || item;
  const chatRideId = rideItem?.rideId || rideItem?.id;
  
  // Determine other user details
  let otherUserId = item?.otherUser?.uid || item?.chat?.otherId;
  let otherUserName = item?.otherUser?.displayName;
  let otherUserPhoto = item?.otherUser?.photoURL;

  // If not provided via chat context, determine from rideItem
  if (!otherUserId) {
    if (rideItem?.driverId && rideItem.driverId !== user?.uid) {
      otherUserId = rideItem.driverId;
      otherUserName = rideItem.driverName;
      otherUserPhoto = rideItem.driverPhoto;
    } else if (rideItem?.passengerId && rideItem.passengerId !== user?.uid) {
      otherUserId = rideItem.passengerId;
      otherUserName = rideItem.passengerName;
      otherUserPhoto = rideItem.passengerPhoto;
    }
  }

  // Real-time user metadata fetching fallback
  useEffect(() => {
    if (!otherUserId) return;
    let active = true;
    const fetchUser = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'users', otherUserId));
        if (docSnap.exists() && active) {
          setFetchedOtherUser(docSnap.data() as UserProfile);
        }
      } catch (err) {
        console.error("Error fetching recipient profile:", err);
      }
    };
    fetchUser();
    return () => {
      active = false;
    };
  }, [otherUserId]);

  const activeOtherName = fetchedOtherUser?.displayName || otherUserName || 'Chat Partner';
  const activeOtherPhoto = fetchedOtherUser?.photoURL || otherUserPhoto;

  useEffect(() => {
    if (!user || !otherUserId || !chatRideId) return;

    // Query messages where this user is a participant and it belongs to this ride
    const q = query(
      collection(db, 'messages'),
      where('rideId', '==', chatRideId),
      where('participants', 'array-contains', user.uid),
      orderBy('timestamp', 'asc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
      setMessages(msgs);
      
      // Mark messages as read
      msgs.forEach(msg => {
        if (msg.receiverId === user.uid && msg.status !== 'read') {
          updateDoc(doc(db, 'messages', msg.id), { status: 'read' }).catch(console.error);
        }
      });

      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'messages');
    });

    return () => unsub();
  }, [user, otherUserId, chatRideId]);

  const isDriver = user?.uid === rideItem?.driverId;
  const isPassengerAlreadyAdded = rideItem?.participants?.includes(otherUserId);

  const handleConfirmRide = async () => {
    if (!isDriver || isPassengerAlreadyAdded || !otherUserId || !rideItem?.id) return;
    
    try {
      const rideRef = doc(db, 'rides', rideItem.id);
      await updateDoc(rideRef, {
        participants: arrayUnion(user.uid, otherUserId),
        [`rewardStatus.${otherUserId}`]: {
          name: activeOtherName,
          driverConfirmed: false,
          passengerConfirmed: false,
          rewardIssued: false,
          startTimeConfirmed: false
        }
      });
      toast.success(`${activeOtherName} ko ride mein shamil kar liya gaya hai!`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'rides');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newMessage.trim() || !otherUserId || !chatRideId) return;

    const msgText = newMessage.trim();
    setNewMessage('');

    try {
      await addDoc(collection(db, 'messages'), {
        senderId: user.uid,
        receiverId: otherUserId,
        participants: [user.uid, otherUserId],
        text: msgText,
        rideId: chatRideId,
        status: 'sent',
        timestamp: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'messages');
    }
  };

  if (!user || !rideItem) return null;

  if (!otherUserId) {
    return (
      <Card className="max-w-md mx-auto p-8 text-center shadow-2xl border-none">
        <MessageCircle className="w-12 h-12 text-slate-200 mx-auto mb-4" />
        <p className="text-slate-500">Aap apne aap se chat nahi kar sakte.</p>
        <Button variant="link" className="text-blue-600 mt-2" onClick={() => setView('search')}>
          Wapas jayen
        </Button>
      </Card>
    );
  }

  return (
    <Card className="max-w-md mx-auto h-[80vh] flex flex-col shadow-2xl border-none overflow-hidden">
      <CardHeader className="border-b p-4 flex flex-row items-center gap-3 space-y-0 bg-white">
        <Button variant="ghost" size="icon" onClick={() => setView('messages')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <Avatar className="w-10 h-10 border-2 border-blue-100">
          <AvatarImage src={activeOtherPhoto} />
          <AvatarFallback>{activeOtherName?.charAt(0) || 'U'}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <CardTitle className="text-lg truncate">{activeOtherName}</CardTitle>
          <p className="text-xs text-slate-500 truncate">{rideItem.origin} to {rideItem.destination}</p>
        </div>
        {isDriver && !isPassengerAlreadyAdded && (
          <Button 
            size="sm" 
            className="bg-emerald-600 hover:bg-emerald-700 text-[10px] h-8 px-2 rounded-lg gap-1"
            onClick={handleConfirmRide}
          >
            <CheckCircle2 className="w-3 h-3" />
            Confirm Ride
          </Button>
        )}
      </CardHeader>
      
      <CardContent className="flex-1 p-0 bg-slate-50">
        <ScrollArea className="h-full p-4">
          <div className="space-y-4">
            {messages.length === 0 ? (
              <div className="text-center text-slate-400 mt-10 flex flex-col items-center gap-2">
                <MessageCircle className="w-12 h-12 opacity-20" />
                <p>No messages yet. Start the conversation!</p>
              </div>
            ) : (
              messages.map((msg) => {
                const isMe = msg.senderId === user.uid;
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 shadow-sm ${
                      isMe 
                        ? 'bg-blue-600 text-white rounded-tr-none' 
                        : 'bg-white border border-slate-100 text-slate-800 rounded-tl-none'
                    }`}>
                      <p className="text-sm leading-relaxed">{msg.text}</p>
                      <div className={`text-[10px] mt-1 opacity-60 flex items-center gap-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                        {msg.timestamp?.toDate ? format(msg.timestamp.toDate(), 'HH:mm') : ''}
                        {isMe && (
                          <span className="ml-1 flex items-center shrink-0">
                            {msg.status === 'read' ? (
                              <CheckCheck className="w-3.5 h-3.5 text-sky-300 font-bold" />
                            ) : msg.status === 'delivered' ? (
                              <CheckCheck className="w-3.5 h-3.5 text-blue-200/80" />
                            ) : (
                              <Check className="w-3.5 h-3.5 text-blue-200/80" />
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </CardContent>

      <div className="p-4 border-t bg-white">
        <form onSubmit={handleSendMessage} className="flex w-full gap-2">
          <Input 
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 rounded-full bg-slate-50 border-none focus-visible:ring-blue-500"
          />
          <Button type="submit" size="icon" className="rounded-full bg-blue-600 hover:bg-blue-700 transition-all active:scale-90" disabled={!newMessage.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </Card>
  );
}

function Inbox({ user, setView }: { user: User | null, setView: (v: any, item?: any) => void }) {
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'messages'),
      where('participants', 'array-contains', user.uid),
      orderBy('timestamp', 'desc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const allMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
      
      // Auto-deliver any incoming messages in the room if they are still 'sent'
      allMessages.forEach(msg => {
        if (msg.receiverId === user.uid && msg.status === 'sent') {
          updateDoc(doc(db, 'messages', msg.id), { status: 'delivered' }).catch(console.error);
        }
      });

      const chatMap = new Map();
      allMessages.forEach(msg => {
        const otherId = (msg.participants && msg.participants.find(p => p !== user.uid)) || 
                        (msg.senderId === user.uid ? msg.receiverId : msg.senderId);
        if (!otherId) return;
        const key = `${msg.rideId}_${otherId}`;
        
        let chatRoom = chatMap.get(key);
        if (!chatRoom) {
          chatRoom = {
            lastMessage: msg,
            otherId,
            rideId: msg.rideId,
            unreadCount: 0
          };
          chatMap.set(key, chatRoom);
        }
        
        // Count unread incoming messages
        if (msg.receiverId === user.uid && msg.status !== 'read') {
          chatRoom.unreadCount++;
        }
      });

      setChats(Array.from(chatMap.values()));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'messages');
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6 max-w-md mx-auto">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => setView('dashboard')}><Navigation className="rotate-180" /></Button>
        <h2 className="text-2xl font-bold text-slate-900">Messages</h2>
      </div>

      <div className="space-y-3">
        {chats.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border-2 border-dashed border-slate-100">
            <MessageSquare className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500">Abhi tak koi messages nahi hain.</p>
            <Button variant="link" className="text-blue-600 mt-2" onClick={() => setView('search')}>
              Rides dhoonden aur chat shuru karein
            </Button>
          </div>
        ) : (
          chats.map((chat, idx) => (
            <div key={idx}>
              <ChatListItem chat={chat} user={user} setView={setView} />
              {idx === 0 && chats.length > 2 && <AdSlot label="Inbox Ad" />}
            </div>
          ))
        )}
      </div>
      {chats.length > 0 && <AdSlot label="Footer Ad" />}
    </div>
  );
}

function ChatListItem({ chat, user, setView }: { chat: any, user: User | null, setView: (v: any, item?: any) => void }) {
  const [otherUser, setOtherUser] = useState<UserProfile | null>(null);
  const [ride, setRide] = useState<any>(null);

  useEffect(() => {
    let active = true;
    const fetchDetails = async () => {
      if (chat.otherId) {
        try {
          const userDoc = await getDoc(doc(db, 'users', chat.otherId));
          if (active) {
            if (userDoc.exists()) {
              setOtherUser(userDoc.data() as UserProfile);
            } else {
              setOtherUser({
                uid: chat.otherId,
                customId: 'ET-User',
                displayName: 'EasyTravel User',
                email: '',
                role: 'passenger',
                createdAt: null
              } as any);
            }
          }
        } catch (e) {
          console.error("Error fetching user details in ChatListItem:", e);
          if (active) {
            setOtherUser({
              uid: chat.otherId,
              customId: 'ET-User',
              displayName: 'EasyTravel User',
              email: '',
              role: 'passenger',
              createdAt: null
            } as any);
          }
        }
      }
      if (chat.rideId) {
        try {
          const rideDoc = await getDoc(doc(db, 'rides', chat.rideId));
          if (active) {
            if (rideDoc.exists()) {
              setRide({ id: rideDoc.id, ...rideDoc.data() });
            } else {
              const reqDoc = await getDoc(doc(db, 'rideRequests', chat.rideId));
              if (active) {
                if (reqDoc.exists()) {
                  setRide({ id: reqDoc.id, ...reqDoc.data() });
                } else {
                  // Check if it is a booking ID of a matched ride
                  const bookingDoc = await getDoc(doc(db, 'bookings', chat.rideId));
                  if (active && bookingDoc.exists()) {
                    setRide({ id: bookingDoc.id, ...bookingDoc.data() });
                  }
                }
              }
            }
          }
        } catch (e) {
          console.error("Error fetching ride details in ChatListItem:", e);
        }
      }
    };
    fetchDetails();
    return () => {
      active = false;
    };
  }, [chat]);

  return (
    <Card 
      className="hover:bg-blue-50/50 cursor-pointer transition-all border-none shadow-sm hover:shadow-md active:scale-[0.98]" 
      onClick={() => setView('chat', { ride, chat, otherUser })}
    >
      <CardContent className="p-4 flex items-center gap-4">
        <Avatar className="w-14 h-14 border-2 border-white shadow-sm">
          <AvatarImage src={otherUser?.photoURL} />
          <AvatarFallback className="bg-blue-100 text-blue-600 font-bold">
            {otherUser?.displayName?.charAt(0) || 'U'}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start mb-1">
            <h4 className="font-bold text-slate-900 truncate pr-2">{otherUser?.displayName || 'Loading...'}</h4>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="text-[10px] text-slate-400 font-medium">
                {chat.lastMessage.timestamp?.toDate ? format(chat.lastMessage.timestamp.toDate(), 'HH:mm') : ''}
              </span>
              {chat.unreadCount > 0 && (
                <span className="flex items-center justify-center bg-blue-600 text-white font-bold text-[10px] h-4 min-w-4 px-1 rounded-full animate-in zoom-in-50 duration-200">
                  {chat.unreadCount}
                </span>
              )}
            </div>
          </div>
          <p className="text-sm text-slate-500 truncate mb-2 flex items-center">
            {chat.lastMessage.senderId === user?.uid && (
              <span className="inline-flex mr-1 shrink-0">
                {chat.lastMessage.status === 'read' ? (
                  <CheckCheck className="w-3.5 h-3.5 text-sky-500 font-bold" />
                ) : chat.lastMessage.status === 'delivered' ? (
                  <CheckCheck className="w-3.5 h-3.5 text-slate-400" />
                ) : (
                  <Check className="w-3.5 h-3.5 text-slate-400" />
                )}
              </span>
            )}
            <span className={`truncate ${chat.unreadCount > 0 ? 'text-slate-900 font-semibold' : ''}`}>
              {chat.lastMessage.text}
            </span>
          </p>
          {ride && (
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-blue-50 rounded-full">
              <Car className="w-3 h-3 text-blue-500" />
              <span className="text-[10px] text-blue-700 font-semibold uppercase tracking-wider">
                {ride.origin} → {ride.destination}
              </span>
            </div>
          )}
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

function MyRides({ user, setView }: { user: User | null, setView: (v: any, item?: any) => void }) {
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
      setMyRides(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ride)).filter(r => !r.isDeleted));
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

  const markAsDone = async (rideId: string, collectionName: 'rides' | 'rideRequests') => {
    try {
      await updateDoc(doc(db, collectionName, rideId), {
        finalStatus: 'done',
        statusReportedAt: serverTimestamp()
      });
      toast.success('Ride Done mark ho gayi hai!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${collectionName}/${rideId}`);
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
                {ride.finalStatus && ride.finalStatus !== 'pending' && (
                  <div className="mt-2 pt-2 border-t flex justify-between items-center">
                    <span className="text-xs text-slate-500">Final Status:</span>
                    <Badge variant="outline" className="capitalize text-[10px]">{ride.finalStatus}</Badge>
                  </div>
                )}
              </CardContent>
              <CardFooter className="p-2 bg-slate-50 flex flex-wrap gap-2">
                <select 
                  className="flex-1 min-w-[100px] h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={ride.status}
                  onChange={(e) => {
                    const newStatus = e.target.value;
                    if (newStatus === 'cancelled') {
                      updateDoc(doc(db, 'rides', ride.id), { status: 'cancelled', finalStatus: 'cancelled' });
                    } else {
                      updateStatus(ride.id, newStatus);
                    }
                  }}
                >
                  <option value="available">Available</option>
                  <option value="full">Full</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                {(!ride.finalStatus || ride.finalStatus === 'pending') && (
                  <Button size="sm" variant="outline" className="text-green-600 border-green-200 hover:bg-green-50" onClick={() => markAsDone(ride.id, 'rides')}>
                    Done
                  </Button>
                )}
                <Button size="sm" variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => setView('edit_post', ride)}>
                  Edit
                </Button>
                <Button variant="destructive" size="sm" onClick={async () => {
                  if (confirm('Kya aap ye post delete karna chahte hain?')) {
                    try {
                      await updateDoc(doc(db, 'rides', ride.id), {
                        isDeleted: true,
                        status: 'cancelled',
                        finalStatus: 'cancelled'
                      });
                      toast.success('Post delete ho gaya!');
                    } catch (error) {
                      handleFirestoreError(error, OperationType.UPDATE, `rides/${ride.id}`);
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

function MyRequests({ user, setView }: { user: User | null, setView: (v: any, item?: any) => void }) {
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
      setMyRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RideRequest)).filter(r => !r.isDeleted));
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

  const markAsDone = async (requestId: string, collectionName: 'rides' | 'rideRequests') => {
    try {
      await updateDoc(doc(db, collectionName, requestId), {
        finalStatus: 'done',
        statusReportedAt: serverTimestamp()
      });
      toast.success('Request Done mark ho gayi hai!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${collectionName}/${requestId}`);
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
              <CardContent className="p-4 pt-0 text-sm space-y-2">
                {req.finalStatus && req.finalStatus !== 'pending' && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">Final Status:</span>
                    <Badge variant="outline" className="capitalize text-[10px]">{req.finalStatus}</Badge>
                  </div>
                )}
              </CardContent>
              <CardFooter className="p-2 bg-slate-50 flex flex-wrap gap-2">
                <select 
                  className="flex-1 min-w-[100px] h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={req.status}
                  onChange={(e) => {
                    const newStatus = e.target.value;
                    if (newStatus === 'cancelled') {
                      updateDoc(doc(db, 'rideRequests', req.id), { status: 'cancelled', finalStatus: 'cancelled' });
                    } else {
                      updateStatus(req.id, newStatus);
                    }
                  }}
                >
                  <option value="pending">Pending</option>
                  <option value="matched">Matched</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                {(!req.finalStatus || req.finalStatus === 'pending') && (
                  <Button size="sm" variant="outline" className="text-green-600 border-green-200 hover:bg-green-50" onClick={() => markAsDone(req.id, 'rideRequests')}>
                    Done
                  </Button>
                )}
                <Button size="sm" variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => setView('edit_post', req)}>
                  Edit
                </Button>
                <Button variant="destructive" size="sm" onClick={async () => {
                  if (confirm('Kya aap ye add delete karna chahte hain?')) {
                    try {
                      await updateDoc(doc(db, 'rideRequests', req.id), {
                        isDeleted: true,
                        status: 'cancelled',
                        finalStatus: 'cancelled'
                      });
                      toast.success('Add delete ho gaya!');
                    } catch (error) {
                      handleFirestoreError(error, OperationType.UPDATE, `rideRequests/${req.id}`);
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

function AdminDashboard({ setView, showNotification, allRides, user }: { setView: (v: any, item?: any) => void, showNotification: (title: string, options?: NotificationOptions) => void, allRides: Ride[], user: User | null }) {
  const [stats, setStats] = useState({
    drivers: 0,
    passengers: 0,
    rides: 0,
    complaints: 0,
    visits: 0
  });
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [drivers, setDrivers] = useState<UserProfile[]>([]);
  const [passengers, setPassengers] = useState<UserProfile[]>([]);
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedUserForWarning, setSelectedUserForWarning] = useState<UserProfile | null>(null);
  const [selectedComplaintForReply, setSelectedComplaintForReply] = useState<Complaint | null>(null);
  const [isCleaning, setIsCleaning] = useState(false);

  const [allRequests, setAllRequests] = useState<RideRequest[]>([]);
  const [paymentRequests, setPaymentRequests] = useState<WalletRechargeRequest[]>([]);
  const [paymentTab, setPaymentTab] = useState<'pending' | 'approved'>('pending');

  useEffect(() => {
    // Real-time stats and lists
    const unsubPayments = onSnapshot(query(collection(db, 'paymentRequests'), orderBy('timestamp', 'desc')), (snap) => {
      setPaymentRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as WalletRechargeRequest)));
    }, (error) => {
      console.error("Error fetching paymentRequests: ", error);
    });
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
    const unsubRequests = onSnapshot(collection(db, 'rideRequests'), (snap) => {
      setAllRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as RideRequest)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'rideRequests');
    });
    const unsubComplaintsCount = onSnapshot(collection(db, 'complaints'), (snap) => {
      setStats(prev => ({ ...prev, complaints: snap.size }));
      setComplaints(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Complaint)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'complaints');
    });
    const unsubWarnings = onSnapshot(collection(db, 'warnings'), (snap) => {
      setWarnings(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Warning)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'warnings');
    });

    const unsubAllBookings = onSnapshot(collection(db, 'bookings'), (snap) => {
      setAllBookings(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'bookings');
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
      unsubPayments();
      unsubDrivers();
      unsubPassengers();
      unsubRides();
      unsubRequests();
      unsubComplaintsCount();
      unsubVisits();
      unsubWarnings();
      unsubAllBookings();
    };
  }, []);

  const handleCleanupKarachi = async () => {
    if (!window.confirm("Kia aap waqai Karachi se mutaliq tamam posts delete karna chahte hain?")) return;
    setIsCleaning(true);
    try {
      const collections = ['rides', 'rideRequests', 'bookings'];
      
      for (const collName of collections) {
        const q = query(collection(db, collName));
        const snapshot = await getDocs(q);
        for (const d of snapshot.docs) {
          const data = d.data();
          if (
            (data.origin && data.origin.toLowerCase().includes('karachi')) ||
            (data.destination && data.destination.toLowerCase().includes('karachi'))
          ) {
            await deleteDoc(doc(db, collName, d.id));
          }
        }
      }
      toast.success(`Karachi se mutaliq posts delete ho gayi hain.`);
    } catch (error) {
      console.error("Cleanup error:", error);
      toast.error("Cleanup mein masla aaya.");
    } finally {
      setIsCleaning(false);
    }
  };

  const handleFullReset = async () => {
    if (!window.confirm("CRITICAL: Kia aap waqai TAMAM rides, requests aur bookings delete kar ke app ko fresh karna chahte hain? Ye amal wapis nahi ho sakta.")) return;
    setIsCleaning(true);
    try {
      const targetCollections = ['rides', 'rideRequests', 'bookings', 'complaints', 'warnings'];
      
      for (const collName of targetCollections) {
        const q = query(collection(db, collName));
        const snapshot = await getDocs(q);
        for (const d of snapshot.docs) {
          await deleteDoc(doc(db, collName, d.id));
        }
      }
      toast.success(`System mukammal taur per clean ho gaya hai!`);
    } catch (error) {
      console.error("Reset error:", error);
      toast.error("Reset process mein masla aaya.");
    } finally {
      setIsCleaning(false);
    }
  };

  const issueWarning = (user: UserProfile) => {
    setSelectedUserForWarning(user);
  };

  const deleteAccount = async (uid: string) => {
    if (confirm('Kya aap waqai ye account delete karna chahte hain? Ye amal wapis nahi ho sakta.')) {
      try {
        await deleteDoc(doc(db, 'users', uid));
        toast.success('Account delete ho gaya!');
      } catch (error) {
        console.error("Delete account error:", error);
        toast.error(`Account delete karne mein masla hua: ${error instanceof Error ? error.message : String(error)}`);
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
        <StatCard title="Total Rides" value={stats.rides} icon={<Navigation className="w-5 h-5" />} color="bg-emerald-500" onClick={() => setActiveTab('rides')} />
        <StatCard title="Complaints" value={stats.complaints} icon={<AlertCircle className="w-5 h-5" />} color="bg-rose-500" onClick={() => setActiveTab('complaints')} />
        <StatCard title="Today Visits" value={stats.visits} icon={<Eye className="w-5 h-5" />} color="bg-indigo-500" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex w-full overflow-x-auto whitespace-nowrap mb-4 gap-2 border-b border-slate-100 pb-2">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="drivers">Owners</TabsTrigger>
          <TabsTrigger value="passengers">Pass.</TabsTrigger>
          <TabsTrigger value="rides">Rides</TabsTrigger>
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
          <TabsTrigger value="complaints">Compl.</TabsTrigger>
          <TabsTrigger value="warnings">Warn.</TabsTrigger>
        </TabsList>
        <TabsContent value="payments" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex justify-between items-center">
                <span>Wallet Recharges</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <Button 
                  variant={paymentTab === 'pending' ? 'default' : 'outline'} 
                  size="sm" 
                  onClick={() => setPaymentTab('pending')}
                  className="rounded-full"
                >
                  Pending ({paymentRequests.filter(p => p.status === 'pending').length})
                </Button>
                <Button 
                  variant={paymentTab === 'approved' ? 'default' : 'outline'} 
                  size="sm" 
                  onClick={() => setPaymentTab('approved')}
                  className="rounded-full"
                >
                  Approved ({paymentRequests.filter(p => p.status === 'approved').length})
                </Button>
              </div>

              {/* Stats overview (Total requests, Total Amount) */}
              <div className="grid grid-cols-3 gap-2 mb-4 bg-slate-50 p-2 rounded-lg border border-slate-100">
                <div className="text-center p-2 bg-white rounded shadow-sm">
                  <p className="text-[9px] uppercase font-bold text-slate-400 mb-1">Today</p>
                  <p className="text-xs font-black text-emerald-600">
                    Rs. {paymentRequests.filter(p => p.status === 'approved' && p.timestamp && new Date(p.timestamp.toDate()).toDateString() === new Date().toDateString()).reduce((acc, curr) => acc + curr.amount, 0)}
                  </p>
                  <p className="text-[9px] font-bold text-slate-500 mt-1">
                    {paymentRequests.filter(p => p.status === 'approved' && p.timestamp && new Date(p.timestamp.toDate()).toDateString() === new Date().toDateString()).length} Reqs
                  </p>
                </div>
                <div className="text-center p-2 bg-white rounded shadow-sm">
                  <p className="text-[9px] uppercase font-bold text-slate-400 mb-1">This Month</p>
                  <p className="text-xs font-black text-emerald-600">
                    Rs. {paymentRequests.filter(p => p.status === 'approved' && p.timestamp && new Date(p.timestamp.toDate()).getMonth() === new Date().getMonth() && new Date(p.timestamp.toDate()).getFullYear() === new Date().getFullYear()).reduce((acc, curr) => acc + curr.amount, 0)}
                  </p>
                  <p className="text-[9px] font-bold text-slate-500 mt-1">
                    {paymentRequests.filter(p => p.status === 'approved' && p.timestamp && new Date(p.timestamp.toDate()).getMonth() === new Date().getMonth() && new Date(p.timestamp.toDate()).getFullYear() === new Date().getFullYear()).length} Reqs
                  </p>
                </div>
                <div className="text-center p-2 bg-white rounded shadow-sm">
                  <p className="text-[9px] uppercase font-bold text-slate-400 mb-1">Total</p>
                  <p className="text-xs font-black text-emerald-600">
                    Rs. {paymentRequests.filter(p => p.status === 'approved').reduce((acc, curr) => acc + curr.amount, 0)}
                  </p>
                  <p className="text-[9px] font-bold text-slate-500 mt-1">
                    {paymentRequests.filter(p => p.status === 'approved').length} Reqs
                  </p>
                </div>
              </div>

              <ScrollArea className="h-[400px]">
                <div className="space-y-3 pr-4">
                  {paymentRequests.filter(p => p.status === paymentTab).length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">Koi {paymentTab} request nahi hai.</p>
                  ) : (
                    paymentRequests.filter(p => p.status === paymentTab).map((req) => (
                      <div key={req.id} className="p-3 border rounded-lg bg-white shadow-sm flex flex-col gap-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-bold text-sm text-slate-800">{req.userDisplayName}</p>
                            <p className="text-xs text-slate-500">{req.method.toUpperCase()} - {req.txnId}</p>
                            <p className="text-[10px] text-slate-400">{req.timestamp ? new Date(req.timestamp.toDate()).toLocaleString() : 'Just now'}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-black text-emerald-600 text-base">Rs. {req.amount}</p>
                            <Badge variant="outline" className={req.status === 'approved' ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}>
                              {req.status}
                            </Badge>
                          </div>
                        </div>
                        {req.status === 'pending' && (
                          <div className="flex gap-2 justify-end mt-2">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 text-xs h-7"
                              onClick={async () => {
                                if(window.confirm('Request decline karna chahte hain?')) {
                                  await updateDoc(doc(db, 'paymentRequests', req.id), { status: 'declined' });
                                  await addDoc(collection(db, 'notifications'), {
                                    userId: req.userId,
                                    title: 'Recharge Declined',
                                    body: `Aapki Rs. ${req.amount} ki recharge request decline ho gayi hai.`,
                                    read: false,
                                    timestamp: serverTimestamp(),
                                    type: 'payment'
                                  });
                                }
                              }}
                            >
                              Decline
                            </Button>
                            <Button 
                              size="sm" 
                              className="bg-emerald-600 hover:bg-emerald-700 text-xs h-7"
                              onClick={async () => {
                                if(window.confirm('Rs. ' + req.amount + ' approve karna chahte hain?')) {
                                  // Update request status
                                  await updateDoc(doc(db, 'paymentRequests', req.id), { status: 'approved' });
                                  
                                  // Update user balance (increment)
                                  const userDocRef = doc(db, 'users', req.userId);
                                  // we don't have increment imported, so we will use a transaction or simply update based on fetched user doc
                                  // but since we might not have 'increment' from firestore, let's fetch the user first
                                  try {
                                    const { getDoc } = await import('firebase/firestore');
                                    const userSnap = await getDoc(userDocRef);
                                    if(userSnap.exists()) {
                                      const currentBalance = userSnap.data().walletBalance || 0;
                                      await updateDoc(userDocRef, { walletBalance: currentBalance + req.amount });
                                    }
                                  } catch (e) { console.error(e) }
                                  
                                  // Send notification to user
                                  await addDoc(collection(db, 'notifications'), {
                                    userId: req.userId,
                                    title: 'Recharge Approved!',
                                    body: `Aapke wallet me Rs. ${req.amount} jama kar diye gaye hain.`,
                                    read: false,
                                    timestamp: serverTimestamp(),
                                    type: 'payment'
                                  });
                                  
                                  toast.success("Payment approved aur balance add kar diya gaya.");
                                }
                              }}
                            >
                              Approve & Add Balance
                            </Button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <Card className="border-red-100 bg-red-50/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                System Cleanup
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-red-600">Karachi se mutaliq tamam posts aur bookings delete karein.</p>
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={handleCleanupKarachi}
                  disabled={isCleaning}
                  className="h-8 text-xs font-bold"
                >
                  {isCleaning ? 'Cleaning...' : 'Cleanup Karachi'}
                </Button>
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-red-100">
                <div>
                  <p className="text-xs text-red-800 font-black">FULL SYSTEM RESET</p>
                  <p className="text-[10px] text-red-500">Tamam posts, bookings aur complaints uraaen.</p>
                </div>
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={handleFullReset}
                  disabled={isCleaning}
                  className="h-10 px-4 text-xs font-black shadow-lg shadow-red-100"
                >
                  {isCleaning ? 'Resetting...' : 'APP FRESH KAREIN'}
                </Button>
              </div>
            </CardContent>
          </Card>

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
          <UserList users={drivers} onWarning={issueWarning} onDelete={deleteAccount} onProfileClick={(u) => setView('profile_view', u)} />
        </TabsContent>

        <TabsContent value="passengers" className="mt-4">
          <UserList users={passengers} onWarning={issueWarning} onDelete={deleteAccount} onProfileClick={(u) => setView('profile_view', u)} />
        </TabsContent>

        <TabsContent value="rides" className="mt-4">
          <div className="space-y-4">
            <h3 className="font-bold text-lg">Car Owner Posts</h3>
            {allRides.map(ride => (
              <AdminRideCard key={ride.id} item={ride} type="ride" />
            ))}
            <h3 className="font-bold text-lg mt-8">Passenger Posts</h3>
            {allRequests.map(req => (
              <AdminRideCard key={req.id} item={req} type="request" />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="bookings" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>All Bookings</CardTitle>
              <CardDescription>Monitor all ride bookings</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {allBookings.length === 0 ? (
                    <EmptyState message="Abhi tak koi booking nahi hui." />
                  ) : (
                    allBookings.map(booking => (
                      <div key={booking.id} className="p-4 border rounded-xl flex justify-between items-center bg-white shadow-sm">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge className={booking.type === 'ride_booking' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}>
                              {booking.type === 'ride_booking' ? 'Ride' : 'Request'}
                            </Badge>
                            <p className="font-bold text-slate-900">{booking.passengerName} ↔ {booking.driverName}</p>
                          </div>
                          <p className="text-xs text-slate-500">{booking.origin} to {booking.destination}</p>
                          <p className="text-xs text-slate-500 font-medium">{booking.seats} Seats • {booking.date} • {booking.time}</p>
                        </div>
                        <Badge className={booking.status === 'confirmed' ? 'bg-emerald-500' : booking.status === 'cancelled' ? 'bg-rose-500' : 'bg-yellow-500'}>
                          {booking.status}
                        </Badge>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
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

        <TabsContent value="warnings" className="mt-4">
          <div className="space-y-4">
            {warnings.length === 0 ? (
              <EmptyState message="Koi warning nahi mili." />
            ) : (
              warnings.map(warning => (
                <Card key={warning.id} className="border-l-4 border-orange-500">
                  <CardHeader className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <CardTitle className="text-lg">Warning to User</CardTitle>
                        <CardDescription className="flex flex-col">
                          <span className="text-[10px] font-mono text-slate-400">User ID: {warning.userId}</span>
                          <span className="text-[10px]">{format(warning.createdAt?.toDate() || new Date(), 'PPp')}</span>
                        </CardDescription>
                      </div>
                      <Badge variant={warning.status === 'pending' ? 'outline' : 'default'} className={warning.status === 'replied' ? 'bg-blue-500' : ''}>
                        {warning.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 space-y-3">
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Admin Message:</p>
                      <p className="text-slate-600 text-sm bg-slate-50 p-3 rounded-lg border border-slate-100 italic">"{warning.adminMessage}"</p>
                    </div>
                    {warning.userReply && (
                      <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                        <p className="text-[10px] font-bold text-blue-600 uppercase mb-1">User Reply:</p>
                        <p className="text-sm text-blue-800">{warning.userReply}</p>
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="p-2 bg-slate-50 flex justify-end gap-2">
                    <Button size="sm" className="bg-orange-600 hover:bg-orange-700" onClick={() => {
                      const u = drivers.find(d => d.uid === warning.userId) || passengers.find(p => p.uid === warning.userId);
                      if (u) issueWarning(u);
                    }}>
                      Naya Message/Warning Bhejein
                    </Button>
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

function UserList({ users, onWarning, onDelete, onProfileClick }: { users: UserProfile[], onWarning: (u: UserProfile) => void, onDelete: (uid: string) => void, onProfileClick: (u: UserProfile) => void }) {
  return (
    <div className="space-y-4">
      {users.length === 0 ? (
        <EmptyState message="Koi user nahi mila." />
      ) : (
        users.map(u => (
          <Card key={u.uid}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3 cursor-pointer group" onClick={() => onProfileClick(u)}>
                <Avatar className="w-10 h-10 ring-2 ring-transparent group-hover:ring-blue-400 transition-all">
                  <AvatarImage src={u.photoURL} />
                  <AvatarFallback>{u.displayName.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{u.displayName}</p>
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

function AdminRideCard({ item, type }: { item: any, type: 'ride' | 'request' }) {
  const rewardStatus = item.rewardStatus || {};
  const participants = item.participants || [];
  
  return (
    <Card className="border-l-4 border-slate-200">
      <CardHeader className="p-4">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-base">{item.origin} → {item.destination}</CardTitle>
            <CardDescription className="text-xs">{item.date} | {item.time}</CardDescription>
            <p className="text-[10px] text-slate-400 mt-1">By: {item.driverName || item.passengerName}</p>
          </div>
          <Badge variant="outline" className={`capitalize text-[10px] ${item.finalStatus === 'done' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : ''}`}>
            {item.finalStatus || 'Pending'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        {/* Real-time Confirmation Status for Admin */}
        {type === 'ride' && participants.length > 0 && (
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-2">
            <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider">Live Confirmation Status</p>
            <div className="space-y-1.5">
              {participants.map((uid: string) => {
                const status = rewardStatus[uid];
                const isDriver = uid === item.driverId;
                return (
                  <div key={uid} className="flex items-center justify-between text-[10px]">
                    <span className="font-bold text-slate-600">{status?.name || (isDriver ? 'Owner' : 'Pass.')}:</span>
                    <div className="flex gap-2">
                      <Badge variant="ghost" className={`h-5 px-1.5 text-[8px] ${status?.startTimeConfirmed ? 'text-blue-600 bg-blue-50' : 'text-slate-300'}`}>
                        {status?.startTimeConfirmed ? 'Started' : 'Not Started'}
                      </Badge>
                      <Badge variant="ghost" className={`h-5 px-1.5 text-[8px] ${status?.driverConfirmed || status?.passengerConfirmed ? 'text-emerald-600 bg-emerald-50' : 'text-slate-300'}`}>
                        {status?.driverConfirmed || status?.passengerConfirmed ? 'Completed' : 'Pending'}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-blue-50 p-2 rounded-lg text-center">
            <p className="text-[10px] text-blue-600 font-bold uppercase">Calls</p>
            <p className="text-lg font-black text-blue-900">{item.interactions?.call || 0}</p>
          </div>
          <div className="bg-green-50 p-2 rounded-lg text-center">
            <p className="text-[10px] text-green-600 font-bold uppercase">WA</p>
            <p className="text-lg font-black text-green-900">{item.interactions?.whatsapp || 0}</p>
          </div>
          <div className="bg-indigo-50 p-2 rounded-lg text-center">
            <p className="text-[10px] text-indigo-600 font-bold uppercase">Chat</p>
            <p className="text-lg font-black text-indigo-900">{item.interactions?.chat || 0}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RideStatusPromptModal({ item, onClose }: { item: any, onClose: () => void }) {
  const [loading, setLoading] = useState(false);

  const reportStatus = async (status: 'done' | 'cancelled' | 'late') => {
    setLoading(true);
    try {
      await updateDoc(doc(db, item.collection, item.id), {
        finalStatus: status,
        statusReportedAt: serverTimestamp()
      });
      toast.success('Shukriya! Status record ho gaya hai.');
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${item.collection}/${item.id}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100"
      >
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 text-white text-center">
          <div className="bg-white/20 w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto mb-6 backdrop-blur-sm border border-white/10 shadow-inner">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <h3 className="text-3xl font-black mb-2 tracking-tighter">Safar Mukamal?</h3>
          <p className="text-blue-100 text-sm font-medium">Aapki ride ka waqt guzar chuka hai. Baraye meherbani status batayein:</p>
        </div>
        
        <div className="p-8 space-y-6">
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 shadow-sm">
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mb-2">Ride Details</p>
            <p className="font-black text-slate-800 text-lg leading-tight">{item.origin} se {item.destination}</p>
            <p className="text-xs text-slate-500 font-bold mt-1">{item.date} | {item.time}</p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <Button 
              disabled={loading}
              onClick={() => reportStatus('done')}
              className="h-16 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-xl font-black gap-3 shadow-lg shadow-emerald-100 transition-all active:scale-95"
            >
              <ShieldCheck className="w-6 h-6" /> Done (Mukammal)
            </Button>
            <div className="grid grid-cols-2 gap-3">
              <Button 
                disabled={loading}
                variant="outline"
                onClick={() => reportStatus('late')}
                className="h-14 rounded-2xl border-2 border-amber-100 text-amber-700 hover:bg-amber-50 text-sm font-black gap-2 transition-all active:scale-95"
              >
                <Clock className="w-4 h-4" /> Late
              </Button>
              <Button 
                disabled={loading}
                variant="outline"
                onClick={() => reportStatus('cancelled')}
                className="h-14 rounded-2xl border-2 border-rose-100 text-rose-700 hover:bg-rose-50 text-sm font-black gap-2 transition-all active:scale-95"
              >
                <AlertCircle className="w-4 h-4" /> Cancel
              </Button>
            </div>
          </div>
          
          <Button variant="ghost" className="w-full text-slate-400 font-bold" onClick={onClose}>Baad mein</Button>
        </div>
      </motion.div>
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

function WhatsAppConfirmationModal({ item, user, profile, onClose }: { item: any, user: User | null, profile: UserProfile | null, onClose: () => void }) {
  const isDriver = profile?.role === 'driver';
  const [formData, setFormData] = useState({
    origin: item.origin || '',
    destination: item.destination || '',
    exactOrigin: '',
    exactDestination: '',
    date: item.date || '',
    day: item.day || '',
    time: item.time || '',
    seats: isDriver ? (item.availableSeats?.toString() || '') : '',
    price: isDriver ? (item.price?.toString() || '') : 'Munaasib'
  });

  const handleSend = () => {
    const roleLabel = isDriver ? 'Car Owner' : 'Passenger';
    const seatsLabel = isDriver ? 'Seats Available' : 'Seats Required';
    
    let message = `*Confirmation Message from EasyTravel*\n\n`;
    message += `${profile?.displayName} (${roleLabel})\n`;
    message += `User ID: ${profile?.customId || 'N/A'}\n\n`;
    message += `*Route:* ${formData.origin} to ${formData.destination}\n`;
    message += `*Exact Locations:*\n`;
    message += `From: ${formData.exactOrigin}\n`;
    message += `To: ${formData.exactDestination}\n\n`;
    message += `*Schedule:*\n`;
    message += `Date: ${formData.date}\n`;
    message += `Day: ${formData.day}\n`;
    message += `Time: ${formData.time}\n\n`;
    message += `*${seatsLabel}:* ${formData.seats}\n`;
    message += `*Karaaya:* ${formData.price}\n\n`;
    message += `Agar ap jana chahtay hain to reply kr den\n`;
    message += `*Shukriya*`;

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${item.whatsappNumber?.replace(/\D/g, '')}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div className="bg-green-600 p-6 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <MessageCircle className="w-8 h-8" />
            <h3 className="text-2xl font-bold">WhatsApp Confirm</h3>
          </div>
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={onClose}>
            <Plus className="w-6 h-6 rotate-45" />
          </Button>
        </div>
        
        <ScrollArea className="flex-1">
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Kahan Se (City)</Label>
                <Input value={formData.origin} readOnly className="bg-slate-50 border-slate-200" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Kahan Tak (City)</Label>
                <Input value={formData.destination} readOnly className="bg-slate-50 border-slate-200" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-blue-600">Konsi jaga se (Location)</Label>
              <Input 
                placeholder="Exact location e.g. Karak Chowk" 
                value={formData.exactOrigin}
                onChange={e => setFormData({...formData, exactOrigin: e.target.value})}
                className="border-blue-100 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-blue-600">Konsi jaga tak (Location)</Label>
              <Input 
                placeholder="Exact location e.g. Faizabad" 
                value={formData.exactDestination}
                onChange={e => setFormData({...formData, exactDestination: e.target.value})}
                className="border-blue-100 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label className="text-[10px] text-slate-500">Date</Label>
                <Input value={formData.date} readOnly className="bg-slate-50 text-xs px-2" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] text-slate-500">Day</Label>
                <Input value={formData.day} readOnly className="bg-slate-50 text-xs px-2" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] text-slate-500">Time</Label>
                <Input value={formData.time} readOnly className="bg-slate-50 text-xs px-2" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-blue-600">
                  {isDriver ? 'Seats Available' : 'Seats Required'}
                </Label>
                <Input 
                  type="number"
                  placeholder="e.g. 2" 
                  value={formData.seats}
                  onChange={e => setFormData({...formData, seats: e.target.value})}
                  className="border-blue-100 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs font-bold text-blue-600">Karaaya</Label>
                    <Popover>
                      <PopoverTrigger className="text-slate-400 hover:text-blue-600 transition-colors">
                        <Info className="w-3 h-3" />
                      </PopoverTrigger>
                      <PopoverContent className="w-80 p-4 bg-white shadow-xl border-slate-200 rounded-xl">
                        <p className="text-sm text-slate-600 leading-relaxed">
                          Karaaya entehaai munaasib rakhen, Ziaada karaaya na rakhen takeh ksi bhi qisam k maslay/tanaazay se bacha ja sakay
                        </p>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <span className="font-normal text-[0.60rem] text-slate-500 leading-none">(Entehaai Munaasib Karaaya Rakhen)</span>
                </div>
                <Input 
                  placeholder="e.g. 500" 
                  value={formData.price}
                  onChange={e => setFormData({...formData, price: e.target.value})}
                  className="border-blue-100 focus:ring-blue-500"
                  readOnly={!isDriver && formData.price === 'Munaasib'}
                />
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="p-6 border-t bg-slate-50 shrink-0">
          <Button 
            onClick={handleSend}
            className="w-full py-7 rounded-2xl bg-green-600 hover:bg-green-700 text-lg font-bold shadow-xl shadow-green-100 transition-all active:scale-95 flex gap-2"
          >
            <MessageCircle className="w-6 h-6" />
            Send to {isDriver ? 'Passenger' : 'Car Owner'}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

function TravelScopeSelection({ onSelect }: { onSelect: (scope: 'intercity' | 'intracity') => void }) {
  return (
    <div className="space-y-6 pt-4 pb-2 animate-fade-in font-outfit">
      <div className="text-center space-y-3">
        <motion.h2 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight flex flex-col items-center"
        >
          <span><span className="text-red-500">EasyTravel</span> me</span>
          <span className="text-emerald-600">Khush Amdeed!</span>
        </motion.h2>
        <div className="space-y-4 max-w-2xl mx-auto px-4 pt-4 font-outfit text-left">
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-blue-50/80 border border-blue-100 py-4 px-6 rounded-2xl shadow-sm text-center"
          >
            <p className="text-base md:text-lg font-bold text-slate-800 tracking-tight">
              <span className="font-black text-blue-600">Passenger</span> ho ya <span className="font-black text-blue-600">Car Owner</span> - Ab Apka Safar ' Hamari Zimedaari
            </p>
            <p className="text-[11px] md:text-sm font-bold text-slate-500 mt-2 whitespace-nowrap overflow-hidden text-ellipsis">
              Fauri Raabta - Araam Deh Safar - Kam Kharcha
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-slate-50 border border-slate-200 py-3 px-6 rounded-xl text-center"
          >
            <p className="text-sm md:text-base font-semibold text-slate-600 leading-relaxed">
              <span className="font-black text-slate-900">Car Owner</span> k pas Seats Khaali hain ? - Aur - <span className="font-black text-slate-900">Passenger</span> Kharab Transport System se Pareshaan hai ?
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-emerald-50/40 border border-emerald-100/30 py-4 px-6 rounded-2xl text-center"
          >
            <p className="text-sm md:text-base text-slate-600 font-medium leading-relaxed">
              Abhi <span className="font-bold text-emerald-700">EasyTravel</span> pe Search Karen ya Post Lagayen - <span className="font-black text-emerald-800">Car Owner</span> apna Fuel ka Kharcha Bachaen - <span className="font-black text-emerald-800">Passenger</span> apna Safar Araam Deh Banaaen
            </p>
          </motion.div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto px-4 mt-8">
        {/* Card 1: Intercity */}
        <motion.div
          whileHover={{ scale: 1.02, translateY: -3 }}
          whileTap={{ scale: 0.98 }}
        >
          <Card 
            className="h-full cursor-pointer border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-700 to-indigo-900 text-white group relative flex flex-col justify-between min-h-[16rem]"
            onClick={() => onSelect('intercity')}
          >
            <motion.div 
              animate={{ x: [0, 8, -8, 0], y: [0, -3, 3, 0] }}
              transition={{ repeat: Infinity, duration: 8, ease: "easeInOut" }}
              className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity"
            >
              <Car className="w-32 h-32 rotate-12" />
            </motion.div>
            <CardHeader className="p-8 relative z-10 flex-1">
              <div className="bg-white/20 w-12 h-12 rounded-2xl flex items-center justify-center mb-6 backdrop-blur-md overflow-hidden">
                <motion.div
                  animate={{ x: [-32, 32] }}
                  transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                  className="flex items-center"
                >
                  <Car className="w-6 h-6 text-white" />
                </motion.div>
              </div>
              <CardTitle className="text-3xl font-bold tracking-tight leading-tight">
                CITY-TO-CITY Safar Karna Hai
              </CardTitle>
              <div className="text-blue-200 mt-6 text-xs font-semibold tracking-wide uppercase opacity-90">
                Maslan (For Example),
              </div>
              <CardDescription className="text-blue-100 mt-2 text-sm md:text-base font-bold tracking-wide leading-relaxed space-y-1 block">
                <span>Karak se Islamabad</span><br />
                <span>Karak se Peshawar</span><br />
                <span>Islamabad se Karak etc</span>
              </CardDescription>
            </CardHeader>
            <div className="px-8 pb-8 pt-0 relative z-10">
            </div>
          </Card>
        </motion.div>

        {/* Card 2: Intracity / District */}
        <motion.div
          whileHover={{ scale: 1.02, translateY: -3 }}
          whileTap={{ scale: 0.98 }}
        >
          <Card 
            className="h-full cursor-pointer border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-gradient-to-br from-emerald-600 via-teal-700 to-teal-900 text-white group relative flex flex-col justify-between min-h-[16rem]"
            onClick={() => onSelect('intracity')}
          >
            <motion.div 
              animate={{ x: [0, -6, 6, 0], y: [0, 5, -5, 0], rotate: [-12, -8, -16, -12] }}
              transition={{ repeat: Infinity, duration: 8, ease: "easeInOut" }}
              className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity"
            >
              <Navigation className="w-32 h-32" />
            </motion.div>
            <CardHeader className="p-8 relative z-10 flex-1">
              <div className="bg-white/20 w-12 h-12 rounded-2xl flex items-center justify-center mb-6 backdrop-blur-md">
                <Navigation className="w-6 h-6 text-white animate-bounce" />
              </div>
              <CardTitle className="text-3xl font-bold tracking-tight leading-tight">
                District / City k Andar Local Safar krna hai
              </CardTitle>
              <div className="text-emerald-200 mt-6 text-xs font-semibold tracking-wide uppercase opacity-90">
                Maslan (For Example)
              </div>
              <CardDescription className="text-emerald-100 mt-2 text-sm md:text-base font-bold tracking-wide leading-relaxed space-y-1 block">
                <span>Karak City se Takhte Nasrati</span><br />
                <span>Bahadar Khel se Karak City</span><br />
                <span>Karak se Sabir Abad</span><br />
                <span>Latamber se Karak etc</span>
              </CardDescription>
            </CardHeader>
            <div className="px-8 pb-8 pt-0 relative z-10">
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
