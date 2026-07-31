import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MapPin, 
  Phone, 
  MessageSquare, 
  Share2, 
  Check, 
  X, 
  Navigation, 
  Compass, 
  Send, 
  User, 
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Info,
  Bike,
  Car as CarIcon,
  ExternalLink,
  Edit,
  ChevronUp,
  ChevronDown,
  GripVertical
} from 'lucide-react';
import { toast } from 'sonner';
import { db, auth } from '../firebase';
import { collection, doc, setDoc, onSnapshot, query, where, addDoc, serverTimestamp } from 'firebase/firestore';

interface PassengerProfile {
  id: string;
  name: string;
  avatar: string;
  phone: string;
  whatsapp: string;
  origin: string;
  destination: string;
  rating: number;
  trips: number;
  lat: number;
  lng: number;
  vehicleType: 'Car' | 'Bike';
  role?: 'driver' | 'passenger';
}

const CITY_COORDS: { [key: string]: { lat: number; lng: number } } = {
  'karak': { lat: 33.1111, lng: 71.0924 },
  'karak city': { lat: 33.1111, lng: 71.0924 },
  'latamber': { lat: 33.1021, lng: 70.8712 },
  'islamabad': { lat: 33.6844, lng: 73.0479 },
  'rawalpindi': { lat: 33.5651, lng: 73.0169 },
  'peshawar': { lat: 34.0151, lng: 71.5249 },
  'kohat': { lat: 33.5820, lng: 71.4428 },
  'bannu': { lat: 32.9889, lng: 70.6056 },
  'lahore': { lat: 31.5204, lng: 74.3587 },
  'karachi': { lat: 24.8607, lng: 67.0011 },
  'multan': { lat: 30.1575, lng: 71.5249 },
  'mardan': { lat: 34.1989, lng: 72.0404 },
  'swabi': { lat: 34.1202, lng: 72.4698 },
};

export default function LiveActivePassengerMap({
  userRole = 'driver',
  driverProfile,
  onClose,
  autoActive = true,
  setAutoActive = () => {},
  selfOrigin = 'Karak City',
  setSelfOrigin = () => {},
  selfDestination = 'Latamber',
  setSelfDestination = () => {},
  selfVehicleType = 'All',
  setSelfVehicleType = () => {},
  travelScope = 'intercity',
}: {
  userRole?: 'driver' | 'passenger';
  driverProfile: any;
  onClose: () => void;
  autoActive?: boolean;
  setAutoActive?: (val: boolean) => void;
  selfOrigin?: string;
  setSelfOrigin?: (val: string) => void;
  selfDestination?: string;
  setSelfDestination?: (val: string) => void;
  selfVehicleType?: 'Car' | 'Bike' | 'All';
  setSelfVehicleType?: (val: 'Car' | 'Bike' | 'All') => void;
  travelScope?: 'intercity' | 'intracity' | null;
}) {
  const [activeTargets, setActiveTargets] = useState<PassengerProfile[]>([]);
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [modalOrigin, setModalOrigin] = useState('');
  const [modalDestination, setModalDestination] = useState('');
  const [modalVehicleType, setModalVehicleType] = useState<'Car' | 'Bike' | 'All'>('All');

  const [vehicleFilter, setVehicleFilter] = useState<'All' | 'Car' | 'Bike'>('All');

  const filteredTargets = React.useMemo(() => {
    if (vehicleFilter === 'All') return activeTargets;
    return activeTargets.filter(t => t.vehicleType === vehicleFilter);
  }, [activeTargets, vehicleFilter]);

  const [selectedPassenger, setSelectedPassenger] = useState<PassengerProfile | null>(null);
  
  // Script / CSS loader for Leaflet
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapInstanceRef = useRef<any>(null);
  const markersRef = useRef<{ [key: string]: any }>({});
  
  const [showChat, setShowChat] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<{sender: 'me' | 'them', text: string, time: string}[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  const [tripStarted, setTripStarted] = useState(false);
  const [tripProgress, setTripProgress] = useState(0);
  const [tripCompleted, setTripCompleted] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const activeMsgNotifiedRef = useRef<Set<string>>(new Set());
  const activeNotifNotifiedRef = useRef<Set<string>>(new Set());

  // Dynamically initialize driverCoords based on selfOrigin city or Islamabad default
  const getInitialCoords = () => {
    const key = (selfOrigin || '').toLowerCase().trim();
    return CITY_COORDS[key] || CITY_COORDS['islamabad'] || { lat: 33.6844, lng: 73.0479 };
  };

  const [driverCoords, setDriverCoords] = useState<{ lat: number; lng: number }>(getInitialCoords);
  const hasAutoCenteredRef = useRef(false);

  const currentUid = auth.currentUser?.uid || driverProfile?.uid || driverProfile?.id;

  // Update driverCoords when selfOrigin changes if GPS hasn't auto-centered yet
  useEffect(() => {
    const key = (selfOrigin || '').toLowerCase().trim();
    if (CITY_COORDS[key]) {
      const cityCoords = CITY_COORDS[key];
      setDriverCoords(cityCoords);
      if (leafletMapInstanceRef.current && !hasAutoCenteredRef.current) {
        leafletMapInstanceRef.current.setView([cityCoords.lat, cityCoords.lng], 13);
      }
    }
  }, [selfOrigin]);

  // Reset auto-center flag when active mode turns on
  useEffect(() => {
    if (autoActive) {
      hasAutoCenteredRef.current = false;
    }
  }, [autoActive]);

  // Continuous real GPS Geolocation watch + immediate position fetch
  useEffect(() => {
    if (!navigator.geolocation) return;

    const handlePos = (position: GeolocationPosition) => {
      const newCoords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      setDriverCoords(newCoords);

      // Center Leaflet map on the real user GPS location ONCE when fetched/active mode enabled
      if (leafletMapInstanceRef.current && !hasAutoCenteredRef.current) {
        leafletMapInstanceRef.current.setView([newCoords.lat, newCoords.lng], 13);
        hasAutoCenteredRef.current = true;
      }
    };

    navigator.geolocation.getCurrentPosition(
      handlePos,
      (err) => console.warn("GPS direct fetch warning:", err),
      { enableHighAccuracy: true, timeout: 10000 }
    );

    const watchId = navigator.geolocation.watchPosition(
      handlePos,
      (error) => {
        console.warn("Using default GPS center:", error.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 3000
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Publish current user's live active location to Firestore activeLocations
  useEffect(() => {
    if (!currentUid || !autoActive) return;

    const userLocationRef = doc(db, 'activeLocations', currentUid);
    const payload = {
      uid: currentUid,
      name: driverProfile?.displayName || driverProfile?.name || 'User',
      avatar: driverProfile?.photoURL || driverProfile?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
      phone: driverProfile?.phoneNumber || driverProfile?.phone || driverProfile?.whatsappNumber || driverProfile?.whatsapp || '',
      whatsapp: driverProfile?.whatsappNumber || driverProfile?.whatsapp || driverProfile?.phoneNumber || driverProfile?.phone || '',
      origin: selfOrigin || 'Islamabad',
      destination: selfDestination || 'Karak',
      vehicleType: selfVehicleType === 'All' ? (driverProfile?.vehicleType || 'Car') : selfVehicleType,
      role: userRole,
      lat: driverCoords.lat,
      lng: driverCoords.lng,
      rating: driverProfile?.rating || 5.0,
      trips: driverProfile?.trips || 0,
      isLive: true,
      updatedAt: Date.now()
    };

    setDoc(userLocationRef, payload, { merge: true }).catch(err => {
      console.warn("Active location publish failed:", err);
    });
  }, [currentUid, autoActive, driverCoords.lat, driverCoords.lng, selfOrigin, selfDestination, selfVehicleType, userRole, driverProfile]);

  // Clean up live status immediately when turning offline or unmounting
  useEffect(() => {
    if (!autoActive) {
      if (currentUid) {
        setDoc(doc(db, 'activeLocations', currentUid), { isLive: false, updatedAt: Date.now() }, { merge: true }).catch(() => {});
      }
      setActiveTargets([]);
    }
    return () => {
      if (currentUid && autoActive) {
        setDoc(doc(db, 'activeLocations', currentUid), { isLive: false, updatedAt: Date.now() }, { merge: true }).catch(() => {});
      }
    };
  }, [currentUid, autoActive]);

  // Listen to Firestore activeLocations + rides / rideRequests in real time
  useEffect(() => {
    if (!autoActive) return;

    const activeLocsMap: { [id: string]: PassengerProfile } = {};
    const ridesMap: { [id: string]: PassengerProfile } = {};

    const syncTargets = () => {
      const combined: { [id: string]: PassengerProfile } = { ...ridesMap, ...activeLocsMap };
      setActiveTargets(Object.values(combined));
    };

    // 1. Real-time listener for activeLocations
    const unsubActiveLocs = onSnapshot(collection(db, 'activeLocations'), (snapshot) => {
      const targetRole = userRole === 'passenger' ? 'driver' : 'passenger';

      // Clear previous active locations to prevent stale/offline users from persisting
      for (const key in activeLocsMap) delete activeLocsMap[key];

      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();

        // Strictly show users who are currently LIVE in real-time (isLive === true)
        if (
          data.uid &&
          data.uid !== currentUid &&
          data.isLive === true &&
          (data.role === targetRole || data.role === 'both')
        ) {
          activeLocsMap[data.uid] = {
            id: data.uid,
            name: data.name || 'Active User',
            avatar: data.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
            phone: data.phone || '',
            whatsapp: data.whatsapp || data.phone || '',
            origin: data.origin || 'Islamabad',
            destination: data.destination || 'Karak',
            rating: data.rating || 5.0,
            trips: data.trips || 0,
            lat: data.lat || 33.6844,
            lng: data.lng || 73.0479,
            vehicleType: data.vehicleType === 'Bike' ? 'Bike' : 'Car',
            role: data.role
          };
        }
      });

      syncTargets();
    }, (err) => console.warn("activeLocations sync warning:", err));

    // 2. Real-time listener for rides or rideRequests (Only for users who are currently LIVE)
    const collName = userRole === 'passenger' ? 'rides' : 'rideRequests';
    const unsubRides = onSnapshot(collection(db, collName), (snapshot) => {
      const now = Date.now();
      for (const key in ridesMap) delete ridesMap[key];

      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        const targetId = userRole === 'passenger' ? (data.driverId || docSnap.id) : (data.passengerId || docSnap.id);

        const createdAtMs = data.createdAt?.toMillis ? data.createdAt.toMillis() : (data.createdAt || 0);
        const isRecentPost = createdAtMs ? (now - createdAtMs < 2 * 60 * 60 * 1000) : true;

        // ONLY display if the user is currently LIVE in activeLocations and post is pending/available
        if (
          targetId && 
          targetId !== currentUid && 
          (data.status === 'available' || data.status === 'pending') &&
          activeLocsMap[targetId] &&
          isRecentPost
        ) {
          const origKey = (data.origin || '').toLowerCase().trim();
          const baseCoords = CITY_COORDS[origKey] || { lat: 33.1111 + (Math.random() - 0.5) * 0.04, lng: 71.0924 + (Math.random() - 0.5) * 0.04 };

          ridesMap[targetId] = {
            id: targetId,
            name: (userRole === 'passenger' ? data.driverName : data.passengerName) || activeLocsMap[targetId]?.name || 'User',
            avatar: (userRole === 'passenger' ? data.driverPhoto : data.passengerPhoto) || activeLocsMap[targetId]?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
            phone: data.phoneNumber || data.whatsappNumber || activeLocsMap[targetId]?.phone || '',
            whatsapp: data.whatsappNumber || data.phoneNumber || activeLocsMap[targetId]?.whatsapp || '',
            origin: data.origin || activeLocsMap[targetId]?.origin || 'Karak',
            destination: data.destination || activeLocsMap[targetId]?.destination || 'Islamabad',
            rating: activeLocsMap[targetId]?.rating || 4.9,
            trips: activeLocsMap[targetId]?.trips || 8,
            lat: activeLocsMap[targetId]?.lat || data.lat || baseCoords.lat,
            lng: activeLocsMap[targetId]?.lng || data.lng || baseCoords.lng,
            vehicleType: data.vehicle === 'Bike' ? 'Bike' : 'Car',
            role: userRole === 'passenger' ? 'driver' : 'passenger'
          };
        }
      });

      syncTargets();
    }, (err) => console.warn("rides sync warning:", err));

    return () => {
      unsubActiveLocs();
      unsubRides();
    };
  }, [autoActive, userRole, currentUid]);

  // Dynamically Load Leaflet Assets from CDN
  useEffect(() => {
    if (window.hasOwnProperty('L')) {
      setLeafletLoaded(true);
      return;
    }

    // Append Leaflet Styles
    const cssLink = document.createElement('link');
    cssLink.rel = 'stylesheet';
    cssLink.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(cssLink);

    // Append Leaflet JS
    const jsScript = document.createElement('script');
    jsScript.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    jsScript.async = true;
    jsScript.onload = () => {
      setLeafletLoaded(true);
    };
    document.body.appendChild(jsScript);

    return () => {
      // Keep static assets but we clean up dynamic elements if required
    };
  }, []);

  // Initialize Leaflet Map Instance ONCE
  useEffect(() => {
    if (!leafletLoaded || !autoActive || !mapRef.current) {
      if (leafletMapInstanceRef.current) {
        leafletMapInstanceRef.current.remove();
        leafletMapInstanceRef.current = null;
      }
      return;
    }
    const L = (window as any).L;
    if (!L) return;

    if (!leafletMapInstanceRef.current) {
      const map = L.map(mapRef.current, {
        zoomControl: true,
        scrollWheelZoom: false, // Disables unconscious map scrolling when mouse reaches the map container!
        doubleClickZoom: true,
        dragging: true,
        tap: !L.Browser.mobile, // standard Leaflet check for clickable components
      }).setView([driverCoords.lat, driverCoords.lng], 13);
      
      leafletMapInstanceRef.current = map;

      // Google Maps high-detail standard road layer (Includes streets, alleys, chowks, shops, Urdu/English labels!)
      L.tileLayer('https://{s}.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '&copy; <a href="https://maps.google.com">Google Maps</a>'
      }).addTo(map);

      // Auto-resize viewport container gracefully on load
      setTimeout(() => {
        map.invalidateSize();
      }, 300);
    }
  }, [leafletLoaded, autoActive]);

  // Clean-up completely on unmount
  useEffect(() => {
    return () => {
      if (leafletMapInstanceRef.current) {
        leafletMapInstanceRef.current.remove();
        leafletMapInstanceRef.current = null;
      }
    };
  }, []);

  // Plot and Update Markers inside the Map container smoothly without reloading Map instance
  useEffect(() => {
    const map = leafletMapInstanceRef.current;
    if (!map) return;
    const L = (window as any).L;
    if (!L) return;

    // Clear previous markers
    Object.keys(markersRef.current).forEach(key => {
      if (markersRef.current[key] && key !== 'driver_popup_shown') {
         map.removeLayer(markersRef.current[key]);
         delete markersRef.current[key];
      }
    });

    // 1. Plot Driver/Self Pin
    const selfEmoji = selfVehicleType === 'Bike' ? '🏍️' : '🚗';
    const driverIcon = L.divIcon({
      className: 'custom-driver-pin',
      html: `
        <div class="relative flex items-center justify-center">
          <div class="absolute w-12 h-12 bg-blue-500/30 rounded-full animate-ping"></div>
          <div class="w-10 h-10 rounded-full bg-blue-600 border-2 border-white shadow-xl flex items-center justify-center text-white text-base">
            ${selfEmoji}
          </div>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });

    const driverMarker = L.marker([driverCoords.lat, driverCoords.lng], { icon: driverIcon })
      .addTo(map)
      .bindPopup(`
        <div class="p-1 font-sans text-slate-900 leading-normal" style="min-width: 150px;">
          <p class="font-black text-sm text-slate-900 mb-0.5">Aap (${driverProfile?.displayName || 'Aap'})</p>
          <div class="text-[11px] font-bold text-slate-500 space-y-0.5">
            <p><span class="bg-blue-105 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase mr-1">${userRole === 'driver' ? 'DRIVER' : 'PASSENGER'}</span> ${selfVehicleType === 'Bike' ? '🏍️ Motorcycle' : selfVehicleType === 'Car' ? '🚗 Gari' : '🚗/🏍️ All'}</p>
            <p class="mt-1"><span class="text-blue-600 font-extrabold">Route:</span> ${selfOrigin} ➔ ${selfDestination}</p>
          </div>
        </div>
      `);

    markersRef.current['driver'] = driverMarker;

    if (!markersRef.current['driver_popup_shown']) {
      driverMarker.openPopup();
      markersRef.current['driver_popup_shown'] = true;
    }

    // 2. Plot all active targets (drivers/passengers) dynamically
    filteredTargets.forEach((p) => {
      const isSelected = selectedPassenger?.id === p.id;
      const passIcon = L.divIcon({
        className: `custom-pass-pin-${p.id}`,
        html: `
          <div class="relative flex flex-col items-center group cursor-pointer animate-fade-in">
            <div class="absolute w-12 h-12 ${isSelected ? 'bg-emerald-500/40' : 'bg-amber-500/20'} rounded-full animate-pulse"></div>
            <div class="relative w-10 h-10 rounded-full p-0.5 bg-slate-950 border-2 ${isSelected ? 'border-emerald-500 scale-110 shadow-emerald-500/40' : 'border-amber-400 shadow-amber-400/20'} shadow-lg flex items-center justify-center">
              <img src="${p.avatar}" class="w-full h-full rounded-full object-cover" referrerpolicy="no-referrer" />
              <!-- Small car/bike icon badge next to profile image to identify ride type clearly -->
              <div class="absolute -bottom-1 -right-1 w-[16px] h-[16px] rounded-full border border-white text-[8px] flex items-center justify-center shadow-lg ${p.vehicleType === 'Car' ? 'bg-blue-600' : 'bg-orange-500'}" style="width: 16px; height: 16px; font-size: 8px; color: white;">
                ${p.vehicleType === 'Car' ? '🚗' : '🏍️'}
              </div>
            </div>
            <div class="mt-1 px-1.5 py-0.5 rounded bg-white text-[9px] font-black text-slate-800 shadow-md border border-slate-100 whitespace-nowrap flex items-center gap-0.5">
              <span>${p.name}</span>
              <span class="opacity-80">${p.vehicleType === 'Car' ? '(Car)' : '(Bike)'}</span>
            </div>
          </div>
        `,
        iconSize: [60, 75],
        iconAnchor: [30, 37]
      });

      const pMarker = L.marker([p.lat, p.lng], { icon: passIcon })
        .addTo(map)
        .on('click', () => {
          setSelectedPassenger(prev => prev?.id === p.id ? null : p);
          // Auto center on selected target
          map.setView([p.lat, p.lng], 14);
        });

      markersRef.current[p.id] = pMarker;
    });
  }, [leafletLoaded, autoActive, driverCoords, selectedPassenger?.id, filteredTargets, selfOrigin, selfDestination, selfVehicleType]);

  // Load real-time chat messages from Firestore
  useEffect(() => {
    if (!showChat) return;

    const passenger = activeTargets.find(p => p.id === showChat);
    const myUid = auth.currentUser?.uid;

    if (!myUid || showChat.startsWith('pass-') || showChat.startsWith('driver-')) {
      setChatMessages([
        { sender: 'them', text: `Assalam-o-Alaikum! Kia aap abhi ${passenger?.destination || 'Destination'} ja rahe hain?`, time: '10:02 AM' },
        { sender: 'me', text: 'Walaikum Assalam. Ji haan, mai udhar hi nikalne laga hoon.', time: '10:03 AM' },
        { sender: 'them', text: 'Boht behtareen! Mujhse booking confirm karlein taake hum time pe nikal sakein.', time: '10:04 AM' }
      ]);
      return;
    }

    const q = query(
      collection(db, 'messages'),
      where('participants', 'array-contains', myUid)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const msgs: { sender: 'me' | 'them', text: string, time: string }[] = [];
      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data.participants && data.participants.includes(showChat)) {
          const isMe = data.senderId === myUid;
          let timeStr = 'Abhi';
          if (data.timestamp?.toDate) {
            timeStr = data.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          }
          msgs.push({
            sender: isMe ? 'me' : 'them',
            text: data.text || '',
            time: timeStr
          });
        }
      });

      if (msgs.length > 0) {
        setChatMessages(msgs);
      } else {
        setChatMessages([
          { sender: 'them', text: `Assalam-o-Alaikum! Mai map par live hoon (${passenger?.name || 'User'}).`, time: 'Abhi' }
        ]);
      }
    }, (err) => console.warn("Messages sync warning:", err));

    return () => unsub();
  }, [showChat, activeTargets]);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Real-time listener for incoming messages to auto-open chat modal on active screen
  useEffect(() => {
    const myUid = auth.currentUser?.uid;
    if (!myUid || !autoActive) return;

    const qNewMsgs = query(
      collection(db, 'messages'),
      where('receiverId', '==', myUid)
    );

    let initialLoad = true;
    const unsub = onSnapshot(qNewMsgs, (snapshot) => {
      if (initialLoad) {
        snapshot.docs.forEach(d => activeMsgNotifiedRef.current.add(d.id));
        initialLoad = false;
        return;
      }

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const msgId = change.doc.id;
          if (activeMsgNotifiedRef.current.has(msgId)) return;
          activeMsgNotifiedRef.current.add(msgId);

          const msg = change.doc.data();
          const senderId = msg.senderId;

          if (senderId && senderId !== myUid) {
            const targetPassenger = activeTargets.find(p => p.id === senderId);
            if (targetPassenger) {
              setSelectedPassenger(targetPassenger);
            }
            setShowChat(senderId);

            toast.info(`💬 Naya Peghaam: ${msg.text.slice(0, 45)}`, {
              description: "Chat modal active screen par open ho gaya hai."
            });
          }
        }
      });
    }, (err) => console.warn("Live chat pop listener warning:", err));

    return () => unsub();
  }, [autoActive, activeTargets]);

  // Real-time listener for incoming booking notifications in active mode
  useEffect(() => {
    const myUid = auth.currentUser?.uid;
    if (!myUid || !autoActive) return;

    const qNotifs = query(
      collection(db, 'notifications'),
      where('userId', '==', myUid),
      where('read', '==', false)
    );

    let init = true;
    const unsub = onSnapshot(qNotifs, (snapshot) => {
      if (init) {
        snapshot.docs.forEach(d => activeNotifNotifiedRef.current.add(d.id));
        init = false;
        return;
      }

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const notifId = change.doc.id;
          if (activeNotifNotifiedRef.current.has(notifId)) return;
          activeNotifNotifiedRef.current.add(notifId);

          const notif = change.doc.data();
          if (notif.type === 'booking_request' || notif.type === 'booking_confirmed') {
            toast.success(`📢 ${notif.title}`, {
              description: notif.body,
              duration: 9000
            });
            if (notif.type === 'booking_confirmed') {
              setBookingConfirmed(true);
            }
            if (notif.senderId) {
              const p = activeTargets.find(t => t.id === notif.senderId);
              if (p) setSelectedPassenger(p);
            }
          }
        }
      });
    }, (err) => console.warn("Active mode notification listener warning:", err));

    return () => unsub();
  }, [autoActive, activeTargets]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !showChat) return;
    const msgText = newMessage.trim();
    const myUid = auth.currentUser?.uid;

    setChatMessages(prev => [...prev, { sender: 'me', text: msgText, time: 'Abhi' }]);
    setNewMessage('');

    if (myUid && !showChat.startsWith('pass-') && !showChat.startsWith('driver-')) {
      try {
        await addDoc(collection(db, 'messages'), {
          senderId: myUid,
          receiverId: showChat,
          participants: [myUid, showChat],
          text: msgText,
          timestamp: serverTimestamp()
        });

        // Also create a notification document in Firestore for target receiver
        await addDoc(collection(db, 'notifications'), {
          userId: showChat,
          type: 'chat_message',
          title: `Naya Peghaam (${driverProfile?.displayName || 'User'}) 💬`,
          body: msgText,
          read: false,
          createdAt: serverTimestamp(),
          senderId: myUid,
          senderName: driverProfile?.displayName || 'User'
        });
      } catch (err) {
        console.warn("Message save error:", err);
      }
    }
  };

  const handleSendBookingRequest = async () => {
    if (!selectedPassenger || isSubmittingBooking) return;
    setIsSubmittingBooking(true);
    const myUid = auth.currentUser?.uid;

    try {
      const bookingPayload = {
        rideId: `active-req-${Date.now()}`,
        type: userRole === 'driver' ? 'ride_offer' : 'ride_request',
        passengerId: userRole === 'driver' ? selectedPassenger.id : (myUid || 'user'),
        passengerName: userRole === 'driver' ? selectedPassenger.name : (driverProfile?.displayName || 'Passenger'),
        passengerPhoto: userRole === 'driver' ? selectedPassenger.avatar : (driverProfile?.photoURL || ''),
        driverId: userRole === 'driver' ? (myUid || 'driver') : selectedPassenger.id,
        driverName: userRole === 'driver' ? (driverProfile?.displayName || 'Driver') : selectedPassenger.name,
        driverPhoto: userRole === 'driver' ? (driverProfile?.photoURL || '') : selectedPassenger.avatar,
        origin: selfOrigin || selectedPassenger.origin || 'Karak',
        destination: selfDestination || selectedPassenger.destination || 'Islamabad',
        date: new Date().toISOString().split('T')[0],
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        seats: 1,
        status: 'pending',
        createdAt: serverTimestamp(),
        source: 'live_active_mode'
      };

      const bookingRef = await addDoc(collection(db, 'bookings'), bookingPayload);

      // 1. Notification for Target User
      await addDoc(collection(db, 'notifications'), {
        userId: selectedPassenger.id,
        type: 'booking_request',
        title: 'Naya Ride Booking Request 🚗',
        body: `${driverProfile?.displayName || 'User'} ne Active Mode se aap ke sath booking request bheji hai! Route: ${bookingPayload.origin} ➔ ${bookingPayload.destination}`,
        read: false,
        createdAt: serverTimestamp(),
        senderId: myUid,
        senderName: driverProfile?.displayName || 'User',
        bookingId: bookingRef.id
      });

      // 2. Notification for Sender
      if (myUid) {
        await addDoc(collection(db, 'notifications'), {
          userId: myUid,
          type: 'booking_sent',
          title: 'Booking Request Bhej Di Gayi 📩',
          body: `Aap ki booking request ${selectedPassenger.name} ko bhej di gayi hai.`,
          read: false,
          createdAt: serverTimestamp(),
          senderId: myUid,
          senderName: driverProfile?.displayName || 'User',
          bookingId: bookingRef.id
        });
      }

      toast.success(`Mubarak! Booking request ${selectedPassenger.name} ko bhej di gayi hai.`);
    } catch (err) {
      console.error("Booking request error:", err);
      toast.error("Booking request bhejne me masla aaya.");
    } finally {
      setIsSubmittingBooking(false);
    }
  };

  const handleConfirmBooking = async () => {
    if (!selectedPassenger) return;
    setShowConfirmDialog(false);
    setBookingConfirmed(true);
    const myUid = auth.currentUser?.uid;

    try {
      const bookingPayload = {
        rideId: `active-booking-${Date.now()}`,
        type: userRole === 'driver' ? 'ride_offer' : 'ride_request',
        passengerId: userRole === 'driver' ? selectedPassenger.id : (myUid || 'user'),
        passengerName: userRole === 'driver' ? selectedPassenger.name : (driverProfile?.displayName || 'Passenger'),
        passengerPhoto: userRole === 'driver' ? selectedPassenger.avatar : (driverProfile?.photoURL || ''),
        driverId: userRole === 'driver' ? (myUid || 'driver') : selectedPassenger.id,
        driverName: userRole === 'driver' ? (driverProfile?.displayName || 'Driver') : selectedPassenger.name,
        driverPhoto: userRole === 'driver' ? (driverProfile?.photoURL || '') : selectedPassenger.avatar,
        origin: selfOrigin || selectedPassenger.origin || 'Karak',
        destination: selfDestination || selectedPassenger.destination || 'Islamabad',
        date: new Date().toISOString().split('T')[0],
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        seats: 1,
        status: 'confirmed',
        createdAt: serverTimestamp(),
        source: 'live_active_mode'
      };

      const bookingRef = await addDoc(collection(db, 'bookings'), bookingPayload);

      // Notification for Target User
      await addDoc(collection(db, 'notifications'), {
        userId: selectedPassenger.id,
        type: 'booking_confirmed',
        title: 'Safar Confirm Ho Gaya 🎉',
        body: `${driverProfile?.displayName || 'User'} ne Active Mode se aap ke sath safar confirm kar diya hai! Route: ${bookingPayload.origin} ➔ ${bookingPayload.destination}`,
        read: false,
        createdAt: serverTimestamp(),
        senderId: myUid,
        senderName: driverProfile?.displayName || 'User',
        bookingId: bookingRef.id
      });

      // Notification for Sender
      if (myUid) {
        await addDoc(collection(db, 'notifications'), {
          userId: myUid,
          type: 'booking_confirmed',
          title: 'Mubarak! Safar Confirm Ho Gaya 🎉',
          body: `Aap ka safar ${selectedPassenger.name} ke sath active map par confirm ho gaya hai.`,
          read: false,
          createdAt: serverTimestamp(),
          senderId: myUid,
          senderName: driverProfile?.displayName || 'User',
          bookingId: bookingRef.id
        });
      }

      toast.success("Mubarak! Safar confirm ho gaya aur dono users ko notification bhej diya gaya hai.");
    } catch (err) {
      console.error("Confirm booking error:", err);
      toast.success("Mubarak! Booking confirm ho gayi hai.");
    }
  };

  const handleShareLiveLocation = () => {
    const shareLink = `https://easytravel.pk/track/live-${selectedPassenger?.id || 'trip'}-xyz`;
    navigator.clipboard.writeText(shareLink);
    toast.success("Live Location link copy ho gaya hai! Kisi bhi dost ya pyare ke sath share karein.", {
      description: shareLink,
      duration: 4000
    });
  };

  // Simulate trip motion progress bar
  useEffect(() => {
    let interval: any;
    if (tripStarted && tripProgress < 100) {
      interval = setInterval(() => {
        setTripProgress(prev => {
          const next = prev + 10;
          if (next >= 100) {
            clearInterval(interval);
            setTripCompleted(true);
            toast.success("Safar mukamal ho chuka hai! Mukamal destination par pohanch gaye hain.");
            return 100;
          }
          return next;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [tripStarted, tripProgress]);

  return (
    <div className="space-y-4">
      {/* Premium Sub-Header Card */}
      <Card className="border-none bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white shadow-xl rounded-2xl p-5 overflow-hidden relative">
         <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl" />
         <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-white/5 rounded-full blur-2xl" />

         <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
           {/* Text removed as requested - replaced with real route info */}
           <div className="space-y-1.5 max-w-xl">
             <div className="relative flex items-center justify-center min-h-[36px] mb-2 w-full">
               <button
                 onClick={onClose}
                 className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 text-white transition-all font-bold shadow-md cursor-pointer border border-white/10 shrink-0"
                 title="Wapas Jayein"
               >
                 <ArrowLeft className="w-4 h-4 text-white" />
               </button>
               <span className="inline-flex items-center gap-1.5 bg-white/10 backdrop-blur-md text-[10.5px] tracking-wider uppercase px-3 py-1.5 rounded-full text-blue-200 border border-white/15 font-extrabold mx-auto">
                 <Sparkles className="w-3 h-3 text-amber-300 animate-spin" style={{ animationDuration: '3s' }} /> Active Live Ride Routing
               </span>
             </div>
             {autoActive ? (
               <div className="space-y-1">
                 <div className="text-white">
                   <p className="text-[10px] font-black uppercase text-blue-200 tracking-wider">Aap Ka Active Route:</p>
                   <div className="flex items-center gap-x-3 gap-y-2 mt-1 flex-wrap">
                     <div className="text-xl sm:text-2xl font-black tracking-tight font-sans drop-shadow flex items-center gap-x-2 leading-none">
                       <span>{selfOrigin}</span>
                       <span className="text-blue-300 text-lg">➔</span>
                       <span>{selfDestination}</span>
                     </div>
                    {userRole === 'driver' && (
                      <button
                        onClick={() => {
                          setModalOrigin('');
                          setModalDestination('');
                          setModalVehicleType(travelScope === 'intercity' ? 'Car' : selfVehicleType);
                          setShowRouteModal(true);
                        }}
                        className="bg-white/20 hover:bg-white/30 text-white text-[10px] leading-none font-bold px-3 py-1.5 rounded-full shadow-sm hover:shadow-md hover:scale-105 active:scale-95 transition-all border border-white/30 flex items-center gap-1.5 backdrop-blur-sm shrink-0"
                      >
                        <Edit className="w-3 h-3" />
                        <span>Change Route</span>
                      </button>
                    )}
                   </div>
                 </div>
                 <div className="flex items-center gap-1.5 text-xs text-blue-100 font-semibold">
                   <span className="bg-emerald-500 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded animate-pulse">LIVE</span>
                   <span>Role: <span className="font-extrabold text-white">{userRole === 'driver' ? 'Driver' : 'Passenger'}</span></span>
                   <span className="text-blue-300 font-bold">•</span>
                   <span>Gari: <span className="font-extrabold text-white">{selfVehicleType === 'All' ? '🚗 Car / 🏍️ Bike' : selfVehicleType === 'Car' ? '🚗 Car' : '🏍️ Bike'}</span></span>
                 </div>
               </div>
             ) : (
               <p className="text-sm text-blue-100 font-semibold leading-relaxed">
                 Active mode on karein taake maps par live show hon aur routes set kar sakein.
               </p>
             )}
           </div>

           <div className="flex items-center gap-4">
             {/* Live Toggle Switch */}
             <div className="bg-white/10 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10 flex items-center gap-2">
               <span className="text-xs font-bold text-blue-100">
                 {autoActive ? 'Live Active' : 'Offline'}
               </span>
               <button 
                 onClick={() => {
                   const n = !autoActive;
                  if (n) {
                    setModalOrigin('');
                    setModalDestination('');
                    setModalVehicleType(travelScope === 'intercity' ? 'Car' : selfVehicleType);
                    setShowRouteModal(true);
                    return;
                  }
                   setAutoActive(n);
                   if (n) {
                     toast.success(
                       userRole === 'passenger'
                         ? "Aap live aur active ho gaye hain! Drivers ko aapki real location aur status dikhegi."
                         : "Aap live aur active ho gaye hain! Passengers ko aapki real location dikhegi."
                     );
                   } else {
                     toast.info("Aap offline ho gaye hain.");
                   }
                 }}
                 className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${autoActive ? 'bg-emerald-500' : 'bg-slate-400'}`}
               >
                 <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoActive ? 'translate-x-6' : 'translate-x-1'}`} />
               </button>
             </div>
           </div>
         </div>
      </Card>

      {/* Main Interactive Map Section */}
      {autoActive ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          
          {/* Map canvas container wrapper with professional side scroller strip */}
          <div className="lg:col-span-2 flex gap-1.5 sm:gap-3 items-stretch">
            
            {/* Map canvas container */}
            <div className="flex-1 relative group overflow-hidden bg-slate-900 h-[500px] rounded-3xl border border-slate-200 shadow-inner flex flex-col justify-end">
            
            {/* Map Frame anchor */}
            <div className="absolute inset-0 z-0 bg-slate-100">
              {!leafletLoaded ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-white space-y-3">
                  <Compass className="w-12 h-12 text-blue-500 animate-spin" />
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Loading Real Interactive Map...</p>
                </div>
              ) : (
                <div ref={mapRef} className="w-full h-full" style={{ minHeight: '100%' }} />
              )}
            </div>

            {/* Custom Recenter Button moved to bottom left corner with text */}
            <button
              onClick={() => {
                if (leafletMapInstanceRef.current) {
                  leafletMapInstanceRef.current.setView([driverCoords.lat, driverCoords.lng], 13);
                  toast.success("Map aapki location par recenter ho gaya hai!");
                }
              }}
              className="absolute bottom-4 left-4 z-[1000] flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/95 backdrop-blur-md text-white shadow-xl border border-slate-800 hover:bg-slate-850 active:scale-95 transition-all cursor-pointer pointer-events-auto group font-bold text-xs"
              title="Apni location par wapis jayein (Recenter Map)"
            >
              <Navigation className="w-4 h-4 text-emerald-400 group-hover:rotate-45 transition-transform" />
              <span>Re-center</span>
            </button>
            {/* Bottom Floating Navigation control bar when trip is in progress */}
            <AnimatePresence>
              {tripStarted && (
                <motion.div 
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 30 }}
                  className="absolute bottom-4 left-4 right-4 z-[1000] bg-slate-950/95 p-4 rounded-3xl border border-slate-800 shadow-2xl space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
                      <span className="text-[10px] uppercase font-mono tracking-widest text-slate-400 font-bold">Route Navigation Live</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      {tripCompleted ? 'Pohanch Gaye ✓' : `${100 - tripProgress} mins baki`}
                    </span>
                  </div>

                  {/* Route progress line bar */}
                  <div className="space-y-1">
                    <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden p-0.5 border border-slate-700">
                      <motion.div 
                        className="bg-emerald-500 h-full rounded-full relative"
                        style={{ width: `${tripProgress}%` }}
                        layout
                      >
                        <span className="absolute right-0 top-0 w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                      </motion.div>
                    </div>
                    <div className="flex justify-between text-[9px] font-black text-slate-500 uppercase tracking-wider">
                      <span>{selectedPassenger?.origin}</span>
                      <span>Safar progress: {tripProgress}%</span>
                      <span>{selectedPassenger?.destination}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 pt-1">
                    <div className="text-xs text-slate-300 font-medium">
                      Co-passenger: <span className="text-white font-bold">{selectedPassenger?.name}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button 
                        size="sm"
                        variant="ghost"
                        onClick={handleShareLiveLocation}
                        className="text-xs text-blue-400 hover:text-blue-300 gap-1.5 font-bold p-0 bg-transparent h-auto border-none shadow-none"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        Live Location Share Karein
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Smart Floating Overlay Profile Card for Selected Passenger / Driver */}
            <AnimatePresence>
              {selectedPassenger && (
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: -10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: -10 }}
                  className="absolute top-4 left-4 right-4 z-[1001] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[85%] flex flex-col pointer-events-auto text-slate-900 overflow-y-auto"
                  style={{ maxWidth: '380px' }}
                >
                  {/* Modal Card Header */}
                  <div className="bg-gradient-to-r from-slate-900 to-slate-950 text-white p-4 flex items-center justify-between relative">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 bg-slate-800 border-2 border-slate-700 rounded-xl overflow-hidden shadow-md shrink-0">
                        <img src={selectedPassenger.avatar} alt="User picture" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                      <div>
                        <h4 className="text-sm font-extrabold text-white leading-tight">{selectedPassenger.name}</h4>
                        <span className="inline-block bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full mt-0.5">
                          ID: {selectedPassenger.id.startsWith('driver') ? `ET-DRIV-${selectedPassenger.id.replace('driver-', '409')}` : `ET-PASS-${selectedPassenger.id.replace('pass-', '018')}`}
                        </span>
                      </div>
                    </div>

                    {/* Close Button top-right */}
                    <button 
                      onClick={() => setSelectedPassenger(null)}
                      className="p-1 h-7 w-7 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center border border-white/5 transition-all"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Passenger/Driver Specific statistics */}
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-500">
                    <span className="text-amber-500">★ {selectedPassenger.rating} (Rating)</span>
                    <span>•</span>
                    <span className="text-slate-700">{selectedPassenger.trips} Trips</span>
                    <span>•</span>
                    <span className="text-blue-650 bg-blue-50 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase flex items-center gap-1 shrink-0">
                      {selectedPassenger.vehicleType === 'Car' ? (
                        <>
                          <CarIcon className="w-2.5 h-2.5 text-blue-650" />
                          <span>Car</span>
                        </>
                      ) : (
                        <>
                          <Bike className="w-3.5 h-3.5 text-orange-600" />
                          <span>Bike</span>
                        </>
                      )}
                    </span>
                  </div>

                  {/* Main Routing layout & Quick actions row */}
                  <div className="p-4 space-y-3">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-2 text-xs leading-relaxed">
                      <div className="flex items-start gap-2">
                        <MapPin className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                        <div>
                          <span className="text-[8px] text-slate-400 font-extrabold uppercase leading-none block">Kahan Se</span>
                          <span className="font-bold text-slate-800 text-xs">{selectedPassenger.origin}</span>
                        </div>
                      </div>
                      <div className="h-2 border-l border-dashed border-slate-300 ml-1.5" />
                      <div className="flex items-start gap-2">
                        <MapPin className="w-3.5 h-3.5 text-red-600 mt-0.5 shrink-0" />
                        <div>
                          <span className="text-[8px] text-slate-400 font-extrabold uppercase leading-none block">Kahan Tak</span>
                          <span className="font-bold text-slate-800 text-xs">{selectedPassenger.destination}</span>
                        </div>
                      </div>
                    </div>

                    {/* Quick actions direct contact row */}
                    <div className="grid grid-cols-2 gap-2">
                      {/* Phone Voice Call button */}
                      <button 
                        onClick={() => {
                          toast.info(`Calling ${selectedPassenger.name}: ${selectedPassenger.phone}`);
                          window.location.href = `tel:${selectedPassenger.phone}`;
                        }}
                        className="rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs gap-1.5 h-9 shadow-sm flex items-center justify-center bg-white cursor-pointer"
                      >
                        <Phone className="w-3.5 h-3.5 text-blue-600" />
                        Call Karein
                      </button>

                      {/* WhatsApp chat click */}
                      <a 
                        href={`https://wa.me/${selectedPassenger.whatsapp}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl h-9 shadow-sm w-full bg-white cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500" viewBox="0 0 24 24">
                          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.513 2.261 2.262 3.504 5.275 3.501 8.479-.005 6.66-5.341 12.002-11.95 12.002-2.003-.001-3.974-.5-5.733-1.45L0 24zm6.09-3.328l.386.23c1.64.974 3.535 1.488 5.483 1.49 5.541.002 10.05-4.507 10.054-10.055.002-2.688-1.042-5.216-2.941-7.115C17.13 3.322 14.61 2.277 11.921 2.22l-.125.04c-2.6.012-5.1.986-7.05 2.155a9.8 9.8 0 00-2.887 7.1H1.5c.008 1.95.498 3.845 1.5 5.485l.235.39-.99 3.61 3.8-1zm14.39-10.36c-.22-.11-.27-.12-.48-.22a3.8 3.8 0 00-.7-.28c-.14-.03-.27-.05-.4.07-.15.15-.43.53-.53.65-.1.12-.2.13-.42.02-.22-.11-.93-.34-1.77-1.1a7.04 7.04 0 01-1.22-1.52c-.13-.22-.01-.34.1-.45.1-.1.22-.26.33-.39.11-.13.15-.22.22-.37.07-.15.03-.28-.02-.39s-1.08-1.52-1.18-1.63c-.15-.15-.31-.12-.43-.12h-.37c-.13 0-.34.05-.52.24a2.76 2.76 0 00-1.5 4.8c1.32 1.34 2.94 2.34 4.7 2.93a10.4 10.4 0 002.8.27c.8 0 1.5-.1 2-.18.6-.1 1.2-.5 1.4-1 .2-.5.2-1 .15-1.1-.05-.1-.18-.15-.4-.26z" />
                        </svg>
                        WhatsApp
                      </a>
                    </div>

                    {/* Direct App Chat trigger */}
                    <button 
                      onClick={() => {
                        setShowChat(selectedPassenger.id);
                      }}
                      className="w-full bg-slate-900 border-none hover:bg-slate-800 text-white font-extrabold text-xs h-10 rounded-xl shadow-md flex items-center justify-center gap-1.5 cursor-pointer animate-fade-in"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Direct Chat (Guftagu Karein)</span>
                    </button>

                    {/* Booking confirmation section */}
                    <div className="border-t border-slate-100 pt-3 space-y-2">
                      {!bookingConfirmed ? (
                        <>
                          <button 
                            onClick={handleSendBookingRequest}
                            disabled={isSubmittingBooking}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black text-xs h-10 rounded-xl shadow-md flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <Send className="w-3.5 h-3.5" />
                            {isSubmittingBooking ? 'Bhej rahe hain...' : 'Booking Request Bhejein'}
                          </button>
                          <button 
                            onClick={() => setShowConfirmDialog(true)}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs h-10 rounded-xl shadow-lg flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Confirm Booking Direct
                          </button>
                        </>
                      ) : (
                        <div className="space-y-2">
                          <div className="bg-emerald-50 text-emerald-800 p-2.5 rounded-xl flex items-center gap-2 border border-emerald-100 text-left">
                            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                            <div>
                              <p className="text-[11px] font-bold font-sans">Booking Confirm Ho Chuki Hai.</p>
                              <p className="text-[9px] text-emerald-600 font-normal font-sans">Aap dono ka trip connect kar diya gaya hai.</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => {
                              setBookingConfirmed(false);
                              setTripStarted(false);
                              setTripProgress(0);
                              setTripCompleted(false);
                              setSelectedPassenger(null);
                            }}
                            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold h-9 rounded-xl cursor-pointer"
                          >
                            Reset / Naya Safar Dhoonden
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Professional Page Scroll Strip */}
          <div 
            className="w-5 sm:w-6 bg-gradient-to-b from-slate-50 via-slate-100 to-slate-50 border border-slate-200 rounded-full flex flex-col items-center justify-between py-2 select-none cursor-ns-resize shadow shrink-0 transition-all active:scale-[0.99] touch-pan-y"
            style={{ height: '500px' }}
            title="Page Scroll Strip: Click buttons or drag here to scroll page up/down"
          >
            {/* Scroll Up Button */}
            <button
              onClick={() => {
                window.scrollBy({ top: -350, behavior: 'smooth' });
                toast.success("Scrolling Up ✓", { duration: 800 });
              }}
              className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white hover:bg-blue-50 text-slate-600 shadow-sm border border-slate-200 flex items-center justify-center transition-all active:scale-90"
              title="Page scroll up"
            >
              <ChevronUp className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-600" />
            </button>

            {/* Decorative minimalist track and grip */}
            <div className="flex-1 flex flex-col items-center justify-center my-1 w-full relative">
              <div className="w-[1.5px] h-full bg-slate-200 rounded-full relative flex items-center justify-center">
                <div className="absolute w-2.5 h-6 sm:w-3 sm:h-7 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-sm hover:border-slate-300">
                  <div className="w-0.5 h-2 bg-slate-300 rounded" />
                </div>
              </div>
            </div>

            {/* Scroll Down Button */}
            <button
              onClick={() => {
                window.scrollBy({ top: 350, behavior: 'smooth' });
                toast.success("Scrolling Down ✓", { duration: 800 });
              }}
              className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white hover:bg-blue-50 text-slate-600 shadow-sm border border-slate-200 flex items-center justify-center transition-all active:scale-90"
              title="Page scroll down"
            >
              <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-600" />
            </button>
          </div>

          </div>

          {/* Right Sidebar - General Active Users surroundings list */}
          <div className="lg:col-span-1 border border-slate-100 bg-white rounded-3xl p-5 shadow-lg flex flex-col h-[500px]">
            <div className="border-b border-slate-100 pb-3 mb-3">
              <h4 className="font-extrabold text-sm text-slate-900 flex items-center gap-1.5 uppercase tracking-wider">
                <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-ping" />
                {userRole === 'passenger' ? 'Active Drivers Near You' : 'Active Passengers'}
              </h4>
            </div>

            {/* Vehicle Type filter segments for quick ride choice */}
            <div className="grid grid-cols-3 gap-1 bg-slate-50 p-1 rounded-xl mb-3 border border-slate-100 shrink-0">
              <button 
                onClick={() => setVehicleFilter('All')}
                className={`py-1.5 text-[10px] font-bold rounded-lg transition-all ${vehicleFilter === 'All' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-850'}`}
              >
                All
              </button>
              <button 
                onClick={() => setVehicleFilter('Car')}
                className={`py-1.5 text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-0.5 ${vehicleFilter === 'Car' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-850'}`}
              >
                <CarIcon className="w-3 h-3" />
                Cars
              </button>
              <button 
                onClick={() => setVehicleFilter('Bike')}
                className={`py-1.5 text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-0.5 ${vehicleFilter === 'Bike' ? 'bg-orange-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-850'}`}
              >
                <Bike className="w-3 h-3" />
                Bikes
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {filteredTargets.map((p) => {
                const isSelected = selectedPassenger?.id === p.id;
                return (
                  <div 
                    key={p.id}
                    onClick={() => {
                      setSelectedPassenger(p);
                      // Center map to target location
                      if (leafletMapInstanceRef.current) {
                        leafletMapInstanceRef.current.setView([p.lat, p.lng], 14);
                      }
                    }}
                    className={`flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer ${
                      isSelected 
                        ? 'bg-blue-50 border-blue-200 shadow-md ring-1 ring-blue-100' 
                        : 'border-slate-100 hover:bg-slate-50 shadow-sm'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative w-11 h-11 rounded-xl overflow-hidden border border-slate-100 shadow-inner shrink-0 bg-slate-100">
                        <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        {/* Dynamic vehicle badge next to profile image */}
                        <div className="absolute -bottom-0.5 -right-0.5 w-[15px] h-[15px] rounded-full border border-white text-[7px] flex items-center justify-center shadow-md text-white font-bold bg-slate-950">
                          {p.vehicleType === 'Car' ? '🚗' : '🏍️'}
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        <h5 className="text-xs font-extrabold text-slate-950 flex items-center gap-1">
                          {p.name}
                        </h5>
                        <p className="text-[10px] text-slate-500 font-semibold">{p.origin} ➔ {p.destination}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="inline-flex items-center text-[8px] font-semibold text-amber-600 bg-amber-50 px-1 py-0.5 rounded">
                            ★ {p.rating}
                          </span>
                          <span className="inline-flex items-center text-[8px] font-bold text-blue-650 bg-blue-50 px-1.5 py-0.5 rounded uppercase">
                            {p.vehicleType === 'Car' ? 'Car' : 'Bike'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 p-1.5 rounded-full bg-slate-100 hover:bg-blue-600 hover:text-white transition-all">
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500 hover:text-white" />
                    </div>
                  </div>
                );
              })}
              {filteredTargets.length === 0 && (
                <div className="p-8 text-center text-slate-400 text-xs font-semibold">
                  Is category me abhi koi active {userRole === 'passenger' ? 'driver' : 'passenger'} nahi hai.
                </div>
              )}
            </div>
            
            <div className="pt-3 border-t border-slate-100">
              <div className="p-3 bg-blue-50 rounded-2xl border border-blue-100 flex items-start gap-2 text-blue-700">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <p className="text-[10px] leading-snug font-medium">
                  {userRole === 'passenger'
                    ? 'Kisi bhi driver ke profile par click karke direct unki screen/gari ka details box dekhein, call karein ya direct chat room open karein.'
                    : 'Kisi bhi passenger ke profile par click karke direct unko screen par pop up popup box me dekhein, call karein ya chat room open karein.'}
                </p>
              </div>
            </div>
          </div>

        </div>
      ) : (
        <div className="bg-slate-50 rounded-3xl p-12 text-center border border-slate-200 max-w-lg mx-auto space-y-5">
          <div className="w-16 h-16 bg-slate-100 text-slate-400 border border-slate-200 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <X className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h4 className="text-lg font-bold text-slate-800">Aap is Waqt Offline Mode Hain</h4>
            <p className="text-sm text-slate-500 leading-relaxed">
              {userRole === 'passenger'
                ? 'Active Mode ko on karein taake aap active rides aur drivers ko maps aur surroundings me dekh sakein.'
                : 'Active Mode ko on karein taake aap active passengers around you ko maps aur surroundings me dekh sakein.'}
            </p>
          </div>
          <Button 
            onClick={() => {
              setAutoActive(true);
              toast.success("Active mode on ho gaya hai!");
            }}
            className="bg-blue-600 hover:bg-blue-700 font-extrabold text-xs h-10 px-5 rounded-xl shadow-lg border-none text-white"
          >
            Live Active Mode On Karein
          </Button>
        </div>
      )}



      {/* CHAT/GUP SHUP MODAL (Direct direct chat room pop up inside app) */}
      <AnimatePresence>
        {showChat && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col h-[500px]"
            >
              {/* Chat Header */}
              <div className="bg-slate-950 text-white p-4 flex items-center justify-between border-b border-slate-900">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full overflow-hidden border border-slate-800 bg-slate-800">
                    <img 
                      src={activeTargets.find(p => p.id === showChat)?.avatar} 
                      alt="User Avatar" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      {activeTargets.find(p => p.id === showChat)?.name}
                    </h4>
                    <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                      Live Chat Active
                    </span>
                  </div>
                </div>

                <button 
                  onClick={() => setShowChat(null)}
                  className="p-1 px-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all h-8 w-8 flex items-center justify-center border border-white/5"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Chat Msg Area */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-slate-50">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex flex-col ${msg.sender === 'me' ? 'items-end' : 'items-start'}`}>
                    <div className={`p-3 max-w-[80%] rounded-2xl text-xs font-semibold shadow-sm leading-relaxed ${msg.sender === 'me' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white text-slate-800 rounded-tl-none border border-slate-100'}`}>
                      {msg.text}
                    </div>
                    <span className="text-[8px] text-slate-400 font-bold block mt-1 px-1">{msg.time}</span>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input Area */}
              <div className="p-3 border-t border-slate-100 bg-white flex items-center gap-2">
                <input 
                  type="text" 
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSendMessage();
                  }}
                  placeholder="Apna paigam yahan likhein (In Roman Urdu)..."
                  className="flex-1 text-xs border border-slate-200 h-10 px-3.5 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 font-medium"
                />
                <Button 
                  onClick={handleSendMessage}
                  size="icon"
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-10 w-10 shrink-0 border-none"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MUTUAL BOOKING CONFIRMATION DIALOG (Prompt requested) */}
      <AnimatePresence>
        {showConfirmDialog && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden p-6 text-center space-y-4"
            >
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-100">
                <Check className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-extrabold text-slate-900">Kia safar ki booking confirm karni hai?</h4>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  Confirm karne ke baad aap dono ka safar active map navigation screen par tabdeel ho jayega.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <Button 
                  onClick={() => setShowConfirmDialog(false)}
                  variant="outline"
                  className="rounded-xl font-bold h-10 text-xs text-slate-600"
                >
                  Nahi (Cancel)
                </Button>
                <Button 
                  onClick={handleConfirmBooking}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-extrabold h-10 text-xs border-none cursor-pointer"
                >
                  Ji Haan (Confirm)
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ROUTE SELECTION MODAL (Kahan Se - Kahan Tak) */}
      <AnimatePresence>
        {showRouteModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1200] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden p-6 space-y-6 border border-slate-100"
            >
              {/* Header */}
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto border border-blue-100">
                  <Navigation className="w-6 h-6 animate-pulse text-blue-600" />
                </div>
                <div>
                  <h4 className="text-lg font-black text-slate-905 tracking-tight">Active Route Set Karein</h4>
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
                      className="w-full h-11 px-4 rounded-xl border border-slate-200 text-sm bg-slate-50/50 text-slate-900 placeholder:italic placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-sans"
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
                      className="w-full h-11 px-4 rounded-xl border border-slate-200 text-sm bg-slate-50/50 text-slate-900 placeholder:italic placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-sans"
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
                              <span className={`text-[8px] font-medium block ${modalVehicleType === opt.value ? 'text-blue-105' : 'text-slate-400'}`}>
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
                              <span className={`text-[9px] font-medium block ${modalVehicleType === opt.value ? 'text-blue-105' : 'text-slate-400'}`}>
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
                  className="rounded-2xl font-bold h-11 text-xs text-slate-600 hover:bg-slate-50 border border-slate-201"
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
                    toast.success(
                      `Aap live ho chuke hain! Route: ${modalOrigin.trim()} ➔ ${modalDestination.trim()} (${modalVehicleType === 'All' ? 'Car & Bike All' : modalVehicleType})`
                    );
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-extrabold h-11 text-xs border-none shadow-lg shadow-blue-500/20"
                >
                  Yes [OK]
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

// Inline minimalist local reusable UI building blocks
function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white text-slate-950 shadow-sm ${className || ''}`} {...props}>
      {children}
    </div>
  );
}

function Button({ className, variant, size, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'outline' | 'ghost' | 'default', size?: 'sm' | 'icon' | 'default' }) {
  let baseClass = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer duration-200";
  
  if (variant === 'outline') {
    baseClass += " border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground";
  } else if (variant === 'ghost') {
    baseClass += " hover:bg-accent hover:text-accent-foreground";
  } else {
    baseClass += " bg-primary text-primary-foreground shadow hover:bg-primary/90";
  }

  if (size === 'sm') {
    baseClass += " h-8 rounded-md px-3 text-xs";
  } else if (size === 'icon') {
    baseClass += " h-9 w-9";
  } else {
    baseClass += " h-10 px-4 py-2";
  }

  return (
    <button className={`${baseClass} ${className || ''}`} {...props}>
      {children}
    </button>
  );
}
