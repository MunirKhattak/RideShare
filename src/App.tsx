import { memo, useState, useEffect, useRef, useMemo } from 'react';
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
  arrayUnion,
  getCountFromServer,
  getDocFromServer
} from 'firebase/firestore';
import { UserProfile, Ride, RideRequest, ChatMessage, Complaint, Analytics, Warning, Booking } from './types';
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
  PlayCircle
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import confetti from 'canvas-confetti';

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
  const [view, setViewState] = useState<'main' | 'register' | 'dashboard' | 'search' | 'post' | 'edit_post' | 'profile_view' | 'chat' | 'messages' | 'my_rides' | 'my_requests' | 'edit_profile' | 'admin_dashboard' | 'complaint'>('main');
  const [activeWarning, setActiveWarning] = useState<Warning | null>(null);
  const [activeComplaintReply, setActiveComplaintReply] = useState<Complaint | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [rewardTask, setRewardTask] = useState<any>(null);
  const [bookingTask, setBookingTask] = useState<any>(null);
  const [activeBookings, setActiveBookings] = useState<Booking[]>([]);
  const [showInterstitialAd, setShowInterstitialAd] = useState(false);

  const [waModalData, setWaModalData] = useState<any>(null);
  const [pendingStatusReport, setPendingStatusReport] = useState<any>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [allRides, setAllRides] = useState<Ride[]>([]);

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
    });
    return () => unsub();
  }, [user]);

  const prevRidesRef = useRef<Record<string, any>>({});
  const lastNotificationRef = useRef<Record<string, number>>({});

  // Monitor Rides for Notifications
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'rides'),
      where('participants', 'array-contains', user.uid)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const ride = { id: change.doc.id, ...change.doc.data() } as any;
        const oldRide = prevRidesRef.current[ride.id];

        if (change.type === 'modified' && oldRide) {
          const isDriver = user.uid === ride.driverId;
          
          // 1. Check for Start Confirmation from OTHER user
          const otherParticipants = ride.participants?.filter((id: string) => id !== user.uid) || [];
          
          otherParticipants.forEach((otherId: string) => {
            const newOtherStatus = ride.rewardStatus?.[otherId];
            const oldOtherStatus = oldRide.rewardStatus?.[otherId];

            // If other user confirmed start and they hadn't before
            if (newOtherStatus?.startTimeConfirmed && !oldOtherStatus?.startTimeConfirmed) {
              const role = isDriver ? 'Passenger' : 'Car Owner';
              showNotification("Safar Shuru!", {
                body: `${role} ${newOtherStatus.name} ne safar shuru hone ki tasdeeq kar di hai.`,
                tag: `start-confirmed-${ride.id}`,
                data: { url: `${window.location.origin}/?view=dashboard` }
              });
            }

            // 2. Check for Completion from OTHER user
            const newOtherConfirmed = isDriver ? newOtherStatus?.passengerConfirmed : newOtherStatus?.driverConfirmed;
            const oldOtherConfirmed = isDriver ? oldOtherStatus?.passengerConfirmed : oldOtherStatus?.driverConfirmed;

            if (newOtherConfirmed && !oldOtherConfirmed) {
              const role = isDriver ? 'Passenger' : 'Car Owner';
              showNotification("Safar Mukamal?", {
                body: `${role} ${newOtherStatus.name} ne ride mukammal hone ka status diya hai. Click kar ke confirm karein.`,
                tag: `complete-other-${ride.id}`,
                data: { url: `${window.location.origin}/?view=dashboard&action=complete_ride&rideId=${ride.id}` }
              });
            }
          });
        }
        
        // Update ref with latest data
        prevRidesRef.current[ride.id] = ride;
      });

      // Initial load: populate ref
      if (snapshot.docChanges().length === snapshot.docs.length) {
        snapshot.docs.forEach(doc => {
          prevRidesRef.current[doc.id] = { id: doc.id, ...doc.data() };
        });
      }
    });

    return () => unsub();
  }, [user]);

  // Scheduled Reminders (30m and 5h AFTER start)
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'rides'),
      where('participants', 'array-contains', user.uid)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const now = new Date().getTime();
      snapshot.docs.forEach(doc => {
        const ride = doc.data() as Ride;
        const rideTime = new Date(`${ride.date}T${ride.time || '00:00'}`).getTime();
        const diffMs = now - rideTime; // Time passed since start
        const diffMins = diffMs / (1000 * 60);
        const diffHours = diffMins / 60;

        const myStatus = ride.rewardStatus?.[user.uid];
        const rideKey = `${doc.id}-${user.uid}`;

        // 30 Minute AFTER Start Reminder
        if (diffMins > 29 && diffMins < 40 && !myStatus?.startTimeConfirmed) {
          const lastTime = lastNotificationRef.current[`${rideKey}-start`];
          if (!lastTime || (now - lastTime > 15 * 60 * 1000)) { // 15 mins throttle
            showNotification("Kia ap ne Safar shuru kr lya?", {
              body: `Aap ka safar (${ride.origin} se ${ride.destination}) shuru karne ka waqt ho chuka hai.`,
              tag: `reminder-start-30m-${doc.id}`,
              data: { url: `${window.location.origin}/?view=dashboard&action=start_ride&rideId=${doc.id}` }
            });
            lastNotificationRef.current[`${rideKey}-start`] = now;
          }
        }

        // 5 Hour AFTER Start Reminder
        if (diffHours > 4.9 && diffHours < 5.5 && (!myStatus?.driverConfirmed && !myStatus?.passengerConfirmed)) {
          const lastTime = lastNotificationRef.current[`${rideKey}-complete`];
          if (!lastTime || (now - lastTime > 15 * 60 * 1000)) { // 15 mins throttle
            showNotification("Kia apka safar mukamal hua?", {
              body: `Aap ka safar (${ride.origin} se ${ride.destination}) shuru hue 5 ghantay ho gaye hain.`,
              tag: `reminder-complete-5h-${doc.id}`,
              data: { url: `${window.location.origin}/?view=dashboard&action=complete_ride&rideId=${doc.id}` }
            });
            lastNotificationRef.current[`${rideKey}-complete`] = now;
          }
        }
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'rides');
    });

    return () => unsub();
  }, [user]);

  useEffect(() => {
    // Handle deep links from notifications
    const params = new URLSearchParams(window.location.search);
    const urlView = params.get('view');
    const action = params.get('action');
    const rideId = params.get('rideId');

    if (urlView === 'dashboard') {
      setViewState('dashboard');
      
      if (action && rideId) {
        if (user) {
          const fetchRide = async () => {
            if (rideId === 'demo') {
              setRewardTask({
                ride: { id: 'demo', origin: 'Lahore', destination: 'Islamabad', date: '2024-05-20', time: '10:00' },
                passengerId: 'demo',
                type: action === 'start_ride' ? 'start' : 'complete',
                otherUser: { name: 'Demo User', id: 'demo' }
              });
              window.history.replaceState({}, '', window.location.pathname);
              return;
            }
            try {
              const rideDoc = await getDoc(doc(db, 'rides', rideId));
              if (rideDoc.exists()) {
                const rideData = { id: rideDoc.id, ...rideDoc.data() } as any;
                const isDriver = user.uid === rideData.driverId;
                const passengerId = isDriver 
                  ? (rideData.participants?.find((id: string) => id !== user.uid) || 'demo') 
                  : user.uid;
                
                setRewardTask({
                  ride: rideData,
                  passengerId,
                  type: action === 'start_ride' ? 'start' : 'complete',
                  otherUser: {
                    name: isDriver ? (rideData.rewardStatus?.[passengerId]?.name || 'User') : rideData.driverName,
                    id: (isDriver ? passengerId : rideData.driverId).substring(0, 4)
                  }
                });
                // Clean up URL only after handling
                window.history.replaceState({}, '', window.location.pathname);
              }
            } catch (error) {
              console.error("Error fetching deep link ride:", error);
              // Clean up on error too
              window.history.replaceState({}, '', window.location.pathname);
            }
          };
          fetchRide();
        }
        // If no user yet, don't clear URL, wait for next effect run when user is set
      } else {
        // Only view=dashboard, no action, can clear
        window.history.replaceState({}, '', window.location.pathname);
      }
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
        
        const snap = await getDoc(doc(db, 'dummy', 'dummy')); // Just to trigger a read check if needed, but we use onSnapshot or getDocs
        // Actually, we can just use a simple query
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

          // 1. Start Confirmation (30 mins after start)
          if (diffMins >= 30 && !status.startTimeConfirmed && user.uid === pId) {
            setRewardTask(prev => prev?.ride?.id === ride.id && prev?.type === 'start' ? prev : {
              ride,
              passengerId: pId,
              type: 'start',
              otherUser: { name: ride.driverName, id: ride.driverId.substring(0, 4) }
            });
          }

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
          if (diffMins >= 300 && !status.driverConfirmed && !status.passengerConfirmed) {
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
    });
    return () => unsub();
  }, [user]);

  const setView = (newView: any, item?: any) => {
    if (item) setSelectedItem(item);
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
      } else {
        // If no state, we are at the beginning. Let the browser handle it (minimize/close app)
        // Or default to main
        setViewState('main');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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
          }
        } else {
          setProfile(null);
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
        if (change.type === 'added' && profile.role === 'driver') {
          const req = change.doc.data() as RideRequest;
          // Only notify if it's not the user's own request
          if (req.passengerId !== user.uid) {
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
          showNotification('New Message', {
            body: msg.text,
            tag: `msg-${change.doc.id}`
          });
        }
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'messages');
    });

    // 4. Listen for new rides (for passengers)
    const qNewRides = query(
      collection(db, 'rides'),
      where('status', '==', 'available'),
      orderBy('createdAt', 'desc'),
      limit(5)
    );
    
    let initialRidesLoad = true;
    const unsubNewRides = onSnapshot(qNewRides, (snapshot) => {
      if (initialRidesLoad) {
        initialRidesLoad = false;
        return;
      }
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' && profile.role === 'passenger') {
          const ride = change.doc.data() as Ride;
          if (ride.driverId !== user.uid) {
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
    };
  }, [user, profile]);

  // Visit Tracking
  useEffect(() => {
    const trackVisit = async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const analyticsRef = doc(db, 'analytics', today);
      try {
        // Test connection first
        try {
          await getDocFromServer(doc(db, 'test', 'connection'));
        } catch (e) {
          if (e instanceof Error && e.message.includes('the client is offline')) {
            console.warn("Firestore is offline, skipping visit tracking.");
            return;
          }
        }

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

  const handleCreateBooking = async (ride: Ride | RideRequest, seats: number) => {
    if (!user || !profile) return;
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
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'bookings');
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
        if (bookingData.type === 'ride_booking') {
          const rideRef = doc(db, 'rides', bookingData.rideId);
          await updateDoc(rideRef, {
            availableSeats: increment(-bookingData.seats),
            participants: arrayUnion(bookingData.passengerId)
          });
        } else {
          const requestRef = doc(db, 'rideRequests', bookingData.rideId);
          await updateDoc(requestRef, {
            status: 'matched',
            participants: arrayUnion(bookingData.driverId)
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

    if (task.ride.id === 'demo') {
      if (task.type === 'start') setRewardTask({ ...task, type: 'start_success' });
      else if (task.type === 'complete') setRewardTask({ ...task, type: 'success' });
      else setRewardTask(null);
      return;
    }

    try {
      const rideRef = doc(db, task.ride.collection || 'rides', task.ride.id);
      const rewardKey = `rewardStatus.${task.passengerId}`;

      if (task.type === 'start') {
        await updateDoc(rideRef, {
          [`${rewardKey}.startTimeConfirmed`]: true
        });
        setRewardTask({ ...task, type: 'start_success' });
        toast.success("Safar shuru hone ki tasdeeq ho gayi!");
      } else if (task.type === 'complete') {
        const isDriver = user?.uid === task.ride.driverId;
        await updateDoc(rideRef, {
          [`${rewardKey}.${isDriver ? 'driverConfirmed' : 'passengerConfirmed'}`]: true
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

  if (loading) return <LoadingSpinner />;

  const renderView = () => {
    switch (view) {
      case 'main':
        return <MainPage setView={setView} setProfile={setProfile} user={user} profile={profile} />;
      case 'register':
        return <RegistrationForm user={user} role={(profile?.role as 'driver' | 'passenger') || 'passenger'} setView={setView} setProfile={setProfile} />;
      case 'dashboard':
        return (
          <Dashboard 
            user={user} 
            profile={profile} 
            setView={setView} 
            onDemoStart={() => setRewardTask({ 
              ride: { id: 'demo', driverId: 'demo', driverName: 'Ali Khan', date: '2026-04-12', time: '10:00' }, 
              passengerId: 'demo', 
              type: 'start', 
              otherUser: { name: 'Ali Khan', id: '4829' } 
            })} 
            onRewardAction={setRewardTask}
            onCompleteRide={setRewardTask}
            activeBookings={activeBookings}
            onUpdateBookingStatus={handleUpdateBookingStatus}
          />
        );
      case 'post':
        return <PostForm user={user} profile={profile} setView={setView} type={profile?.role === 'driver' ? 'ride' : 'request'} />;
      case 'edit_post':
        return <PostForm user={user} profile={profile} setView={setView} type={profile?.role === 'driver' ? 'ride' : 'request'} editItem={selectedItem} />;
      case 'search':
        return <RouteSearch setView={setView} userRole={(profile?.role as 'driver' | 'passenger') || 'passenger'} onWhatsAppClick={setWaModalData} />;
      case 'profile_view':
        return <DetailedProfileView 
          item={selectedItem} 
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
      default:
        return <MainPage setView={setView} setProfile={setProfile} user={user} profile={profile} />;
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

      {pendingStatusReport && !rewardTask && (
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

      {rewardTask && (
        <RewardModal 
          task={rewardTask} 
          onConfirm={() => handleRewardAction(rewardTask, 'confirm')}
          onClose={() => setRewardTask(null)}
          onShowAd={() => setShowInterstitialAd(true)}
          user={user}
        />
      )}

      {bookingTask && (
        <BookingModal 
          ride={bookingTask} 
          user={user} 
          onClose={() => setBookingTask(null)} 
          onConfirm={(seats) => handleCreateBooking(bookingTask, seats)} 
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

function Header({ user, setView, onSignInClick, onInstall }: { user: User | null, setView: (v: any, item?: any) => void, onSignInClick: () => void, onInstall?: () => void }) {
  return (
    <header className="bg-white border-b sticky top-0 z-50 shadow-sm">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('main')}>
          <div className="bg-blue-600 w-10 h-10 rounded-lg flex items-center justify-center shadow-md">
            <span className="text-white font-black text-xl italic">ET.</span>
          </div>
          <div className="flex flex-col">
            <h1 className="text-2xl font-black tracking-tighter leading-none">
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
  onConfirm 
}: { 
  ride: Ride | RideRequest, 
  user: User | null, 
  onClose: () => void, 
  onConfirm: (seats: number) => void 
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
          >
            Confirm Booking
          </Button>
          <Button variant="ghost" className="text-slate-400 font-bold hover:text-slate-600" onClick={onClose}>
            Wapas
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

function RewardModal({ task, onConfirm, onClose, user, onShowAd }: { task: any, onConfirm: () => void, onClose: () => void, user: any, onShowAd?: () => void }) {
  const { state, type } = task;
  const displayType = type || task.type;
  const adTriggered = useRef(false);

  const isDriver = user?.uid === task.ride.driverId;
  const otherUserRole = isDriver ? 'Passenger' : 'Car Owner';

  useEffect(() => {
    if (displayType === 'success' || displayType === 'start_success') {
      const duration = 3 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      const interval: any = setInterval(function() {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
      }, 250);

      // Intercept back button
      window.history.pushState({ modal: 'reward-success' }, '');
      const handlePopState = () => {
        if (!adTriggered.current) {
          adTriggered.current = true;
          onClose();
          if (onShowAd) onShowAd();
        }
      };
      window.addEventListener('popstate', handlePopState);

      return () => {
        window.removeEventListener('popstate', handlePopState);
        if (interval) clearInterval(interval);
      };
    }
  }, [displayType, onClose, onShowAd]);

  const handleFinalAction = () => {
    if (!adTriggered.current) {
      adTriggered.current = true;
      // If we're still on the dummy state, go back to clean history
      if (window.history.state?.modal === 'reward-success') {
        window.history.back();
      }
      onClose();
      if (onShowAd) onShowAd();
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl border border-slate-100"
      >
        {displayType === 'start' && (
          <div className="p-8 text-center space-y-6">
            <div className="w-24 h-24 bg-blue-50 rounded-3xl flex items-center justify-center mx-auto shadow-sm border border-blue-100">
              <Clock className="w-12 h-12 text-blue-600" />
            </div>
            <div className="space-y-3">
              <h3 className="text-3xl font-black text-slate-900 tracking-tight">Safar Shuru?</h3>
              <div className="space-y-2">
                <p className="text-slate-600 leading-relaxed">
                  Kia apka safar <span className="font-bold text-slate-900">{otherUserRole} {task.otherUser?.name || 'User'}</span> k sath shuru hua?
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3 pt-2">
              <Button className="h-16 rounded-2xl bg-blue-600 hover:bg-blue-700 text-xl font-black shadow-lg shadow-blue-200 transition-all active:scale-95" onClick={onConfirm}>Haan, Shuru ho gaya</Button>
              <Button variant="ghost" className="text-slate-400 font-bold hover:text-slate-600" onClick={onClose}>Abhi nahi</Button>
            </div>
          </div>
        )}

        {(displayType === 'complete' || displayType === 'confirm_complete') && (
          <div className="p-8 text-center space-y-6">
            <div className="w-24 h-24 bg-orange-50 rounded-3xl flex items-center justify-center mx-auto shadow-sm border border-orange-100">
              <MapPin className="w-12 h-12 text-orange-600" />
            </div>
            <div className="space-y-3">
              <h3 className="text-3xl font-black text-slate-900 tracking-tight">Safar Mukamal?</h3>
              <p className="text-slate-600 leading-relaxed">
                {displayType === 'confirm_complete' 
                  ? <>Kia apka safar <span className="font-bold text-slate-900">{otherUserRole} {task.otherUser?.name || 'User'}</span> k sath Mukamal hua? Unhon ne ride mukammal honay ka status diya hai.</>
                  : <>Kia apka safar <span className="font-bold text-slate-900">{otherUserRole} {task.otherUser?.name || 'User'}</span> k sath Mukamal hua?</>
                }
              </p>
            </div>
            <div className="flex flex-col gap-3 pt-2">
              <Button className="h-16 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-xl font-black shadow-lg shadow-emerald-200 transition-all active:scale-95" onClick={onConfirm}>Haan, Mukamal Hua</Button>
              <Button variant="ghost" className="text-slate-400 font-bold hover:text-slate-600" onClick={onClose}>Wapas</Button>
            </div>
          </div>
        )}

        {displayType === 'start_success' && (
          <div className="p-10 text-center space-y-8 relative">
            <div className="w-28 h-28 bg-blue-50 rounded-[2rem] flex items-center justify-center mx-auto shadow-sm border border-blue-100 animate-pulse">
              <Sparkles className="w-16 h-16 text-blue-600" />
            </div>
            <div className="space-y-4">
              <h3 className="text-4xl font-black text-blue-600 tracking-tighter">AlhamduLillah</h3>
              <div className="space-y-4 text-slate-600 leading-relaxed">
                <p className="font-medium text-lg">Keh aap ka safar shuru hua.</p>
                <p className="text-slate-500">
                  Aap ka safar kheriat se ho, <br/>
                  <span className="font-bold text-slate-900">{user?.displayName || 'User'}</span> Apna khyal rakhen.
                </p>
              </div>
            </div>
            <Button className="w-full h-16 rounded-2xl bg-blue-600 hover:bg-blue-700 text-xl font-black shadow-xl transition-all active:scale-95" onClick={handleFinalAction}>Allah Haafiz</Button>
          </div>
        )}

        {displayType === 'success' && (
          <div className="p-10 text-center space-y-8 relative">
            <div className="w-28 h-28 bg-emerald-50 rounded-[2rem] flex items-center justify-center mx-auto shadow-sm border border-emerald-100 animate-pulse">
              <CheckCircle2 className="w-16 h-16 text-emerald-600" />
            </div>
            <div className="space-y-4">
              <h3 className="text-4xl font-black text-emerald-600 tracking-tighter">AlhamduLillah</h3>
              <div className="space-y-4 text-slate-600 leading-relaxed">
                <p className="font-medium">Keh aap apni manzil ko kamyaabi se phunch gay.</p>
                <p className="text-sm">
                  Ab jab bhi safar krna ho to <span className="font-black text-blue-600">EasyTravel</span> ap k lye har waqt Haazir hai.
                </p>
                <p className="text-lg">
                  <span className="font-black text-slate-900">{user?.displayName || 'User'}</span> Apna khyal rakhen
                </p>
              </div>
            </div>
            <Button className="w-full h-16 rounded-2xl bg-slate-900 hover:bg-black text-xl font-black shadow-xl transition-all active:scale-95" onClick={handleFinalAction}>Allah Haafiz</Button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function NewBookingCard({ 
  booking, 
  user, 
  onAction 
}: { 
  booking: Booking, 
  user: User | null, 
  onAction: (id: string, status: 'confirmed' | 'cancelled') => void 
}) {
  const isDriver = user?.uid === booking.driverId;
  const otherUserName = isDriver ? booking.passengerName : booking.driverName;
  const otherUserWhatsapp = isDriver ? booking.passengerWhatsapp : booking.driverWhatsapp;

  return (
    <Card className="border-none shadow-lg overflow-hidden bg-white border-l-4 border-emerald-500">
      <CardContent className="p-5">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-50 p-2 rounded-xl">
                <Badge className="bg-emerald-600 text-white font-bold">New Booking</Badge>
              </div>
              <div>
                <p className="text-sm font-black text-slate-900">{otherUserName}</p>
                <p className="text-[10px] text-slate-500">{booking.origin} to {booking.destination}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-slate-900">{booking.seats} Seats</p>
              <p className="text-[10px] text-slate-500">{booking.date} • {booking.time}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {otherUserWhatsapp && (
              <Button 
                size="sm" 
                variant="outline" 
                className="flex-1 h-10 rounded-xl border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 gap-2"
                onClick={() => window.open(`https://wa.me/${otherUserWhatsapp}`, '_blank')}
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </Button>
            )}
            <Button 
              size="sm" 
              variant="outline" 
              className="flex-1 h-10 rounded-xl border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 gap-2"
              onClick={() => {/* In-app chat logic */}}
            >
              <MessageSquare className="w-4 h-4" />
              Chat
            </Button>
          </div>

          {booking.status === 'pending' && isDriver && (
            <div className="flex items-center gap-2 pt-2">
              <Button 
                className="flex-1 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md"
                onClick={() => onAction(booking.id, 'confirmed')}
              >
                Confirm
              </Button>
              <Button 
                variant="ghost" 
                className="flex-1 h-12 rounded-xl text-slate-400 font-bold hover:text-rose-600"
                onClick={() => onAction(booking.id, 'cancelled')}
              >
                Cancel
              </Button>
            </div>
          )}

          {booking.status === 'confirmed' && (
            <div className="bg-emerald-50 p-3 rounded-xl text-center">
              <p className="text-emerald-700 font-bold text-sm flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Booking Confirmed!
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MainPage({ setView, setProfile, user, profile }: { setView: (v: any, item?: any) => void, setProfile: (p: any) => void, user: User | null, profile: UserProfile | null }) {
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
    <div className="space-y-6 py-6">
      <div className="text-center space-y-3">
        <motion.h2 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight flex flex-col items-center"
        >
          <span><span className="text-red-500">EasyTravel</span> me</span>
          <span className="text-emerald-600">Khush Amdeed!</span>
        </motion.h2>
        <div className="space-y-4 max-w-2xl mx-auto px-4 pt-4 font-outfit">
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-blue-50/80 border border-blue-100 py-4 px-6 rounded-2xl shadow-sm"
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
            className="bg-slate-50 border border-slate-200 py-3 px-6 rounded-xl"
          >
            <p className="text-sm md:text-base font-semibold text-slate-600 leading-relaxed">
              <span className="font-black text-slate-900">Car Owner</span> k pas Seats Khaali hain ? - Aur - <span className="font-black text-slate-900">Passenger</span> Kharab Transport System se Pareshaan hai ?
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-emerald-50/40 border border-emerald-100/30 py-4 px-6 rounded-2xl"
          >
            <p className="text-sm md:text-base text-slate-600 font-medium leading-relaxed">
              Abhi <span className="font-bold text-emerald-700">EasyTravel</span> pe Search Karen ya Post Lagayen - <span className="font-black text-emerald-800">Car Owner</span> apna Fuel ka Kharcha Bachaaen - <span className="font-black text-emerald-800">Passenger</span> apna Safar Araam Deh Banaaen
            </p>
          </motion.div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-4">
        <motion.div
          whileHover={{ scale: 1.02, translateY: -5 }}
          whileTap={{ scale: 0.98 }}
        >
          <Card 
            className="h-full cursor-pointer border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-800 text-white group relative"
            onClick={() => handleRoleSelection('driver')}
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
            onClick={() => handleRoleSelection('passenger')}
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
    } catch (error) {
      toast.error(`Sign in fail ho gaya: ${error instanceof Error ? error.message : String(error)}`);
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
      const customId = `RS-${Math.floor(100000 + Math.random() * 900000)}`;
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
                      // In a real app, you would upload this to Firebase Storage
                      // For now, we'll set a placeholder or handle it
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
  onDemoStart, 
  onRewardAction, 
  onCompleteRide,
  activeBookings,
  onUpdateBookingStatus
}: { 
  user: User | null, 
  profile: UserProfile | null, 
  setView: (v: any, item?: any) => void, 
  onDemoStart: () => void, 
  onRewardAction: (task: any) => void, 
  onCompleteRide: (task: any) => void,
  activeBookings: Booking[],
  onUpdateBookingStatus: (id: string, status: 'confirmed' | 'cancelled') => void
}) {
  const userRole = profile?.role || 'passenger';
  const [activeRides, setActiveRides] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'rides'),
      where('participants', 'array-contains', user.uid)
    );
    return onSnapshot(q, (snap) => {
      const rides = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setActiveRides(rides);
    });
  }, [user]);

  const rewardTasks = useMemo(() => {
    if (!user) return [];
    const tasks: any[] = [];
    activeRides.forEach(ride => {
      const isDriver = user.uid === ride.driverId;
      if (isDriver) {
        // Driver sees all passengers in this ride
        Object.entries(ride.rewardStatus || {}).forEach(([pId, status]: [string, any]) => {
          if (!status.rewardIssued) {
            tasks.push({
              ride,
              passengerId: pId,
              status,
              isDriver: true
            });
          }
        });
      } else {
        // Passenger sees only their own status in this ride
        const status = ride.rewardStatus?.[user.uid];
        if (status && !status.rewardIssued) {
          tasks.push({
            ride,
            passengerId: user.uid,
            status,
            isDriver: false
          });
        }
      }
    });
    return tasks;
  }, [activeRides, user]);

  return (
    <div className="space-y-6 py-4">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
            <Badge className={userRole === 'driver' ? 'bg-blue-600' : 'bg-orange-500'}>
              {userRole === 'driver' ? 'Car Owner' : 'Passenger'}
            </Badge>
          </div>
          
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="rounded-full border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 gap-2 h-9" onClick={onDemoStart}>
              <PlayCircle className="w-4 h-4" />
              <span className="font-bold">Demo</span>
            </Button>

            <Button 
              variant="outline" 
              size="sm" 
              className="rounded-full h-9 px-4 text-xs gap-2 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
              onClick={() => setView('edit_profile')}
            >
              <UserIcon className="w-3 h-3" />
              Profile
            </Button>
          </div>
        </div>
      </div>

      {activeBookings.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider px-1">Bookings</h3>
          <div className="grid grid-cols-1 gap-3">
            {activeBookings.map(booking => (
              <NewBookingCard 
                key={booking.id} 
                booking={booking} 
                user={user} 
                onAction={onUpdateBookingStatus} 
              />
            ))}
          </div>
        </div>
      )}

      {rewardTasks.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider px-1">Active Rides</h3>
          <div className="grid grid-cols-1 gap-3">
            {rewardTasks.map((task, idx) => {
              const { ride, passengerId, status, isDriver } = task;
              const myConfirmed = isDriver ? status.driverConfirmed : status.passengerConfirmed;
              const otherConfirmed = isDriver ? status.passengerConfirmed : status.driverConfirmed;

              return (
                <Card key={`${ride.id}-${passengerId}-${idx}`} className="border-none shadow-md overflow-hidden bg-white border-l-4 border-blue-500">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="bg-blue-50 p-2 rounded-xl">
                          {isDriver ? <Users className="w-5 h-5 text-blue-600" /> : <Car className="w-5 h-5 text-blue-600" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">
                            {isDriver ? `Passenger: ${status.name}` : `${ride.origin} to ${ride.destination}`}
                            {otherConfirmed && <span className="ml-2 text-[10px] text-emerald-600 font-normal">(Mukamal ✓)</span>}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {isDriver ? `${ride.origin} to ${ride.destination}` : `${ride.date} • ${ride.time}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {!status.startTimeConfirmed ? (
                          <Button 
                            size="sm" 
                            className="bg-blue-600 hover:bg-blue-700 h-8 rounded-lg text-xs font-bold px-3"
                            onClick={() => onCompleteRide({
                              ride,
                              passengerId,
                              type: 'start',
                              otherUser: { 
                                name: isDriver ? status.name : ride.driverName,
                                id: (isDriver ? passengerId : ride.driverId).substring(0, 4)
                              }
                            })}
                          >
                            Safar Shuru Karein
                          </Button>
                        ) : !myConfirmed ? (
                          <Button 
                            size="sm" 
                            className="bg-emerald-600 hover:bg-emerald-700 h-8 rounded-lg text-xs font-bold px-3"
                            onClick={() => onCompleteRide({
                              ride,
                              passengerId,
                              type: otherConfirmed ? 'confirm_complete' : 'complete',
                              otherUser: { 
                                name: isDriver ? status.name : ride.driverName,
                                id: (isDriver ? passengerId : ride.driverId).substring(0, 4)
                              }
                            })}
                          >
                            Safar Mukamal
                          </Button>
                        ) : (
                          <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 h-8 px-3 rounded-lg">
                            {otherConfirmed ? 'Processing...' : 'Intezar...'}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

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
    </div>
  );
}

function RouteSearch({ setView, userRole, onWhatsAppClick }: { setView: (v: any, item?: any) => void, userRole: 'driver' | 'passenger', onWhatsAppClick: (item: any) => void }) {
  const [searchData, setSearchData] = useState({
    origin: '',
    destination: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    day: format(new Date(), 'EEEE'),
    time: ''
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
    
    // Fetch all documents and filter client-side for case-insensitivity
    const q = query(collection(db, collectionName));
    
    onSnapshot(q, (snapshot) => {
      let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Client-side filtering
      data = data.filter((item: any) => !item.isDeleted);
      if (dataToSearch.origin) {
        data = data.filter((item: any) => item.origin?.trim().toLowerCase() === dataToSearch.origin.trim().toLowerCase());
      }
      if (dataToSearch.destination) {
        data = data.filter((item: any) => item.destination?.trim().toLowerCase() === dataToSearch.destination.trim().toLowerCase());
      }
      if (dataToSearch.date) {
        data = data.filter((item: any) => item.date === dataToSearch.date);
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
            <EmptyState message="Filhal koi post nahi mili." />
          ) : (
            results.map((item, index) => (
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
                  <CardFooter className="p-2 bg-slate-50 flex gap-2">
                    <Button variant="ghost" size="sm" className="flex-1 gap-1" onClick={(e) => { 
                      e.stopPropagation(); 
                      trackInteraction(item.id, 'call', userRole === 'driver' ? 'rideRequests' : 'rides');
                      window.open(`tel:${item.whatsappNumber}`, '_self'); 
                    }}><Phone className="w-3 h-3" /> Call</Button>
                    <Button variant="ghost" size="sm" className="flex-1 gap-1 text-green-600" onClick={(e) => { 
                      e.stopPropagation(); 
                      trackInteraction(item.id, 'whatsapp', userRole === 'driver' ? 'rideRequests' : 'rides');
                      onWhatsAppClick(item); 
                    }}><MessageCircle className="w-3 h-3" /> WhatsApp</Button>
                    <Button variant="ghost" size="sm" className="flex-1 gap-1 text-blue-600" onClick={(e) => { 
                      e.stopPropagation(); 
                      trackInteraction(item.id, 'chat', userRole === 'driver' ? 'rideRequests' : 'rides');
                      setView('chat', item); 
                    }}><MessageSquare className="w-3 h-3" /> Chat</Button>
                  </CardFooter>
                </Card>
                {index === 1 && <AdSlot label="Search Result Ad" />}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const AnimatedFooter = memo(function AnimatedFooter({ setView }: { setView: (v: any, item?: any) => void }) {
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
          <span className="text-white font-black text-4xl italic">ET.</span>
        </div>
        
        <div className="flex flex-col items-center">
          <h1 className="text-5xl font-black tracking-tighter leading-none mb-3">
            <span className="text-red-600">Easy</span>
            <span className="text-blue-600">Travel</span>
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

function PostForm({ user, profile, setView, type, editItem }: { user: User | null, profile: UserProfile | null, setView: (v: any, item?: any) => void, type: 'ride' | 'request', editItem?: any }) {
  const [formData, setFormData] = useState({
    origin: editItem?.origin || '',
    destination: editItem?.destination || '',
    date: editItem?.date || format(new Date(), 'yyyy-MM-dd'),
    day: editItem?.day || format(new Date(), 'EEEE'),
    time: editItem?.time || '',
    pickupPoint: editItem?.pickupPoint || '',
    dropoffPoint: editItem?.dropoffPoint || '',
    seats: editItem?.availableSeats?.toString() || '3',
    price: editItem?.price?.toString() || '1000'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const collectionName = type === 'ride' ? 'rides' : 'rideRequests';
    try {
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
        status: editItem ? editItem.status : 'available',
        finalStatus: editItem ? editItem.finalStatus : 'pending',
        participants: editItem?.participants || [user.uid],
        ...(editItem ? {} : { createdAt: serverTimestamp() })
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
        status: editItem ? editItem.status : 'pending',
        finalStatus: editItem ? editItem.finalStatus : 'pending',
        participants: editItem?.participants || [user.uid],
        ...(editItem ? {} : { createdAt: serverTimestamp() })
      };

      if (editItem) {
        await updateDoc(doc(db, collectionName, editItem.id), data);
        toast.success('Post update ho gaya!');
      } else {
        await addDoc(collection(db, collectionName), data);
        toast.success('Post lag gaya hai!');
      }
      setView('dashboard');
    } catch (error) {
      handleFirestoreError(error, editItem ? OperationType.UPDATE : OperationType.CREATE, editItem ? `${collectionName}/${editItem.id}` : collectionName);
    }
  };

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

function DetailedProfileView({ 
  item, 
  setView, 
  onWhatsAppClick,
  onBookClick
}: { 
  item: any, 
  setView: (v: any, item?: any) => void, 
  onWhatsAppClick: (item: any) => void,
  onBookClick?: (item: any) => void
}) {
  if (!item) return null;
  const isUserProfile = !!item.uid;
  const name = isUserProfile ? item.displayName : (item.driverName || item.passengerName);
  const photo = isUserProfile ? item.photoURL : (item.driverPhoto || item.passengerPhoto);
  const role = isUserProfile ? item.role : (item.driverId ? 'driver' : 'passenger');

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader className="text-center">
        <div className="flex justify-start mb-4">
          <Button variant="ghost" size="icon" onClick={() => setView(isUserProfile ? 'admin_dashboard' : 'search')}><Navigation className="rotate-180" /></Button>
        </div>
        <Avatar className="w-24 h-24 mx-auto border-4 border-blue-100 mb-4">
          <AvatarImage src={photo} />
          <AvatarFallback>U</AvatarFallback>
        </Avatar>
        <CardTitle className="text-2xl">{name}</CardTitle>
        {isUserProfile ? (
          <Badge className="mt-1 capitalize">{role}</Badge>
        ) : (
          <CardDescription>{item.origin} se {item.destination}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {!isUserProfile ? (
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
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-slate-600">
              <Phone className="w-5 h-5 text-blue-500" />
              <span>{item.phoneNumber || 'No Phone'}</span>
            </div>
            <div className="flex items-center gap-3 text-slate-600">
              <MessageCircle className="w-5 h-5 text-green-500" />
              <span>{item.whatsappNumber || 'No WhatsApp'}</span>
            </div>
            {item.bio && (
              <div className="pt-4 border-t">
                <p className="text-sm text-slate-500 italic">"{item.bio}"</p>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3">
          <Button className="w-full gap-2 py-6 text-lg bg-blue-600" onClick={() => {
            if (!isUserProfile) trackInteraction(item.id, 'call', item.driverId ? 'rides' : 'rideRequests');
            window.open(`tel:${item.whatsappNumber}`, '_self');
          }}>
            <Phone className="w-5 h-5" /> Call Karein
          </Button>
          <Button className="w-full gap-2 py-6 text-lg bg-green-600 hover:bg-green-700" onClick={() => {
            if (!isUserProfile) trackInteraction(item.id, 'whatsapp', item.driverId ? 'rides' : 'rideRequests');
            onWhatsAppClick(item);
          }}>
            <MessageCircle className="w-5 h-5" /> WhatsApp Karein
          </Button>
          {!isUserProfile && (
            <Button 
              className="w-full gap-2 py-8 text-xl bg-slate-900 hover:bg-black text-white font-black shadow-xl shadow-slate-200 rounded-2xl transition-all active:scale-95" 
              onClick={() => onBookClick && onBookClick(item)}
            >
              {item.driverId ? 'Book Your Seat' : 'Book Passenger'}
            </Button>
          )}
          {!isUserProfile && (
            <Button variant="outline" className="w-full gap-2 py-6 text-lg border-2 border-blue-200 text-blue-700" onClick={() => {
              trackInteraction(item.id, 'chat', item.driverId ? 'rides' : 'rideRequests');
              setView('chat');
            }}>
              <MessageSquare className="w-5 h-5" /> In-App Chat
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Chat({ user, item, setView }: { user: User | null, item: any, setView: (v: any, item?: any) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const rideItem = item?.ride || item;
  
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

  useEffect(() => {
    if (!user || !otherUserId || !rideItem) return;

    // Query messages where this user is a participant and it belongs to this ride
    const q = query(
      collection(db, 'messages'),
      where('rideId', '==', rideItem.id),
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
    });

    return () => unsub();
  }, [user, otherUserId, rideItem?.id]);

  const isDriver = user.uid === rideItem.driverId;
  const isPassengerAlreadyAdded = rideItem.participants?.includes(otherUserId);

  const handleConfirmRide = async () => {
    if (!isDriver || isPassengerAlreadyAdded || !otherUserId) return;
    
    try {
      const rideRef = doc(db, 'rides', rideItem.id);
      await updateDoc(rideRef, {
        participants: arrayUnion(user.uid, otherUserId),
        [`rewardStatus.${otherUserId}`]: {
          name: otherUserName,
          driverConfirmed: false,
          passengerConfirmed: false,
          rewardIssued: false,
          startTimeConfirmed: false
        }
      });
      toast.success(`${otherUserName} ko ride mein shamil kar liya gaya hai!`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'rides');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newMessage.trim() || !otherUserId || !rideItem) return;

    const msgText = newMessage.trim();
    setNewMessage('');

    try {
      await addDoc(collection(db, 'messages'), {
        senderId: user.uid,
        receiverId: otherUserId,
        participants: [user.uid, otherUserId],
        text: msgText,
        rideId: rideItem.id,
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
          <AvatarImage src={otherUserPhoto} />
          <AvatarFallback>{otherUserName?.charAt(0) || 'U'}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <CardTitle className="text-lg truncate">{otherUserName || 'User'}</CardTitle>
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
                          <span className="ml-1">
                            {msg.status === 'read' ? (
                              <CheckCheck className="w-3 h-3 text-cyan-300" />
                            ) : msg.status === 'delivered' ? (
                              <CheckCheck className="w-3 h-3 text-blue-200" />
                            ) : (
                              <Check className="w-3 h-3 text-blue-200" />
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
      
      const chatMap = new Map();
      allMessages.forEach(msg => {
        const otherId = msg.participants.find(p => p !== user.uid);
        const key = `${msg.rideId}_${otherId}`;
        if (!chatMap.has(key)) {
          chatMap.set(key, {
            lastMessage: msg,
            otherId,
            rideId: msg.rideId
          });
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
    const fetchDetails = async () => {
      if (chat.otherId) {
        const userDoc = await getDoc(doc(db, 'users', chat.otherId));
        if (userDoc.exists()) setOtherUser(userDoc.data() as UserProfile);
      }
      if (chat.rideId) {
        const rideDoc = await getDoc(doc(db, 'rides', chat.rideId));
        if (rideDoc.exists()) {
           setRide({ id: rideDoc.id, ...rideDoc.data() });
        } else {
           const reqDoc = await getDoc(doc(db, 'rideRequests', chat.rideId));
           if (reqDoc.exists()) setRide({ id: reqDoc.id, ...reqDoc.data() });
        }
      }
    };
    fetchDetails();
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
          <div className="flex justify-between items-baseline mb-1">
            <h4 className="font-bold text-slate-900 truncate">{otherUser?.displayName || 'Loading...'}</h4>
            <span className="text-[10px] text-slate-400 font-medium">
              {chat.lastMessage.timestamp?.toDate ? format(chat.lastMessage.timestamp.toDate(), 'HH:mm') : ''}
            </span>
          </div>
          <p className="text-sm text-slate-500 truncate mb-2">{chat.lastMessage.text}</p>
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

  const [allRequests, setAllRequests] = useState<RideRequest[]>([]);

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
        <StatCard title="Total Rides" value={stats.rides} icon={<Navigation className="w-5 h-5" />} color="bg-emerald-500" onClick={() => setActiveTab('rides')} />
        <StatCard title="Complaints" value={stats.complaints} icon={<AlertCircle className="w-5 h-5" />} color="bg-rose-500" onClick={() => setActiveTab('complaints')} />
        <StatCard title="Today Visits" value={stats.visits} icon={<Eye className="w-5 h-5" />} color="bg-indigo-500" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-8">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="drivers">Owners</TabsTrigger>
          <TabsTrigger value="passengers">Pass.</TabsTrigger>
          <TabsTrigger value="rides">Rides</TabsTrigger>
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
          <TabsTrigger value="complaints">Compl.</TabsTrigger>
          <TabsTrigger value="warnings">Warn.</TabsTrigger>
          <TabsTrigger value="demo">Demo</TabsTrigger>
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
        <TabsContent value="demo" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Notification & Flow Demo</CardTitle>
              <CardDescription>Yahan se aap real system notifications aur unka flow test kar sakte hain.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {Notification.permission !== 'granted' && (
                <div className="p-6 bg-rose-50 border-2 border-rose-100 rounded-2xl text-center space-y-4">
                  <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
                  <div className="space-y-1">
                    <h4 className="font-bold text-rose-900">Notifications Blocked</h4>
                    <p className="text-sm text-rose-700">Aap AI Studio ke andar app chala rahe hain. Iframe mein notifications block hoti hain.</p>
                    <p className="text-xs font-bold text-rose-600 mt-2">Hal: Upar bane "Open in new tab" icon par click karein aur naye tab mein permission allow karein.</p>
                  </div>
                  <Button 
                    className="bg-rose-600 hover:bg-rose-700"
                    onClick={() => {
                      Notification.requestPermission().then(permission => {
                        if (permission === 'granted') toast.success("Notifications enabled!");
                        else toast.error("Permission still denied. Please open in a new tab.");
                      });
                    }}
                  >
                    Enable Notifications Now
                  </Button>
                </div>
              )}

              <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-800">
                <p className="font-bold mb-1">Note:</p>
                <p>Notification test karne ke liye zaroori hai ke aap ne browser mein notification permission allow ki ho. Button dabane ke baad app se bahar nikal jayen (Home screen par) taake aap notification panel mein message dekh saken.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-6 bg-white border rounded-2xl shadow-sm space-y-4">
                  <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
                    <Clock className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-bold">Safar Shuru Reminder</h4>
                    <p className="text-xs text-slate-500">30 mins baad aane wali notification.</p>
                  </div>
                  <Button 
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    onClick={() => {
                      const testRideId = allRides[0]?.id || 'demo';
                      showNotification("Kia ap ne Safar shuru kr lya?", {
                        body: "Aap ka safar shuru karne ka waqt ho chuka hai. Click kar ke confirm karein.",
                        tag: "test-start",
                        data: { url: `${window.location.origin}/?view=dashboard&action=start_ride&rideId=${testRideId}` }
                      });
                      toast.info("Notification bhej di gayi hai. App se bahar jayen.");
                    }}
                  >
                    Test Start
                  </Button>
                </div>

                <div className="p-6 bg-white border rounded-2xl shadow-sm space-y-4">
                  <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center">
                    <MapPin className="w-6 h-6 text-orange-600" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-bold">Safar Mukamal Reminder</h4>
                    <p className="text-xs text-slate-500">5 ghantay baad aane wali notification.</p>
                  </div>
                  <Button 
                    className="w-full bg-orange-600 hover:bg-orange-700"
                    onClick={() => {
                      const testRideId = allRides[0]?.id || 'demo';
                      showNotification("Kia apka safar mukamal hua?", {
                        body: "Aap ka safar shuru hue 5 ghantay ho gaye hain. Click kar ke status batayein.",
                        tag: "test-complete",
                        data: { url: `${window.location.origin}/?view=dashboard&action=complete_ride&rideId=${testRideId}` }
                      });
                      toast.info("Notification bhej di gayi hai. App se bahar jayen.");
                    }}
                  >
                    Test Complete
                  </Button>
                </div>

                <div className="p-6 bg-white border rounded-2xl shadow-sm space-y-4">
                  <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center">
                    <LayoutDashboard className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-bold">Dashboard Manual Flow</h4>
                    <p className="text-xs text-slate-500">Bina notification ke manual status update.</p>
                  </div>
                  <Button 
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                    onClick={async () => {
                      if (!user) return;
                      try {
                        const testRide = {
                          driverId: user.uid,
                          driverName: user.displayName || 'Demo Driver',
                          origin: 'Demo City A',
                          destination: 'Demo City B',
                          date: format(new Date(), 'yyyy-MM-dd'),
                          time: '12:00 PM',
                          pickupPoint: 'Point A',
                          dropoffPoint: 'Point B',
                          availableSeats: 4,
                          price: 2500,
                          status: 'available',
                          participants: [user.uid, 'demo-passenger'],
                          rewardStatus: {
                            [user.uid]: {
                              name: user.displayName || 'Me',
                              startTimeConfirmed: false,
                              driverConfirmed: false,
                              passengerConfirmed: false,
                              rewardIssued: false
                            }
                          },
                          createdAt: serverTimestamp()
                        };
                        await addDoc(collection(db, 'rides'), testRide);
                        toast.success("Test Ride create ho gayi! Ab Dashboard mein ja kar check karein.");
                        setView('dashboard');
                      } catch (error) {
                        console.error("Error creating test ride:", error);
                        toast.error("Test ride create nahi ho saki.");
                      }
                    }}
                  >
                    Test Dashboard Flow
                  </Button>
                </div>
              </div>

              <div className="p-6 bg-slate-900 rounded-2xl text-white space-y-4">
                <h4 className="font-bold flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-yellow-400" />
                  Flow Steps Demo
                </h4>
                <ol className="text-sm space-y-3 text-slate-300 list-decimal list-inside">
                  <li>Upar wala button dabayein.</li>
                  <li>Mobile ka Notification Panel check karein.</li>
                  <li>Notification par click karein (App khulegi aur modal aayega).</li>
                  <li>Modal par "Haan" click karein (Success modal aayega).</li>
                  <li>Success modal band karein ya back jayen (Full Screen Ad aayega).</li>
                </ol>
              </div>
            </CardContent>
          </Card>
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
