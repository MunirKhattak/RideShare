import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Car, 
  User as UserIcon, 
  ArrowLeft, 
  MapPin, 
  Clock, 
  Search, 
  Plus, 
  Check, 
  Bike, 
  ArrowLeftRight, 
  CheckCircle2, 
  MessageCircle, 
  PhoneCall, 
  Sparkles,
  ChevronRight,
  Navigation,
  Calendar,
  LayoutDashboard
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

// Authentic local locations of Karak and surrounding areas
export const LOCAL_LOCATIONS = [
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

interface LocalTravelItem {
  id: string;
  from: string;
  to: string;
  vehicle: 'Car' | 'Motorcycle';
  name: string;
  phone: string;
  time: string;
  seats: number;
  rent: string;
  type: 'owner' | 'passenger'; // owner = owner seeking passenger, passenger = passenger seeking owner
  dateAdded?: Date;
}

export default function IntracityDemo({ 
  onBackToHome,
  user,
  profile,
  setView,
  setProfile,
  onSelectRole
}: { 
  onBackToHome: () => void,
  user?: any,
  profile?: any,
  setView?: (v: any, item?: any) => void,
  setProfile?: (p: any) => void,
  onSelectRole?: (role: 'driver' | 'passenger') => void
}) {
  // District Role
  const [districtRole, setDistrictRole] = useState<'owner' | 'passenger' | null>(null);
  
  // Dashboard Sub-View inside District: 'dashboard'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'search' | 'post'>('dashboard');

  // Search Filters
  const [searchFrom, setSearchFrom] = useState('');
  const [searchTo, setSearchTo] = useState('');
  const [searchVehicle, setSearchVehicle] = useState<'All' | 'Car' | 'Motorcycle'>('All');

  // New Post Form State
  const [postFrom, setPostFrom] = useState('');
  const [postTo, setPostTo] = useState('');
  const [postVehicle, setPostVehicle] = useState<'Car' | 'Motorcycle'>('Car');
  const [postTime, setPostTime] = useState('08:30 AM');
  const [postSeats, setPostSeats] = useState(1);
  const [postRent, setPostRent] = useState('');
  const [postName, setPostName] = useState('');
  const [postPhone, setPostPhone] = useState('');

  // Autofill Name and Phone Number from Profile
  useEffect(() => {
    if (profile) {
      if (!postName) setPostName(profile.displayName || '');
      if (!postPhone) setPostPhone(profile.phoneNumber || '');
    }
  }, [profile]);

  // Handle auto-login redirect recovery for pending district role selection
  useEffect(() => {
    if (user && profile) {
      const pendingRole = localStorage.getItem('pendingDistrictRole');
      if (pendingRole === 'owner' || pendingRole === 'passenger') {
        setDistrictRole(pendingRole);
        setActiveTab('dashboard');
        localStorage.removeItem('pendingDistrictRole');
      }
    }
  }, [user, profile]);

  // Initial Seed Data (Authentic local routes)
  const [localItems, setLocalItems] = useState<LocalTravelItem[]>([
    {
      id: 'local-1',
      from: 'Latamber',
      to: 'Karak City',
      vehicle: 'Motorcycle',
      name: 'Niamatullah Khattak',
      phone: '03319087452',
      time: '08:00 AM',
      seats: 1,
      rent: 'Rs. 150',
      type: 'owner',
      dateAdded: new Date()
    },
    {
      id: 'local-2',
      from: 'Karak City',
      to: 'Takht-e-Nusrati',
      vehicle: 'Car',
      name: 'Sher Afzal',
      phone: '03159231267',
      time: '09:30 AM',
      seats: 3,
      rent: 'Rs. 200',
      type: 'owner',
      dateAdded: new Date()
    },
    {
      id: 'local-3',
      from: 'Mithakhel',
      to: 'Karak City',
      vehicle: 'Car',
      name: 'Mehtab Khan',
      phone: '03469854321',
      time: '02:00 PM',
      seats: 4,
      rent: 'Rs. 150',
      type: 'owner',
      dateAdded: new Date()
    },
    {
      id: 'local-4',
      from: 'Takht-e-Nusrati',
      to: 'Chowkara',
      vehicle: 'Motorcycle',
      name: 'Imran Ali',
      phone: '03029113354',
      time: '12:00 PM',
      seats: 1,
      rent: 'Rs. 100',
      type: 'owner',
      dateAdded: new Date()
    },
    {
      id: 'local-5',
      from: 'Sabirabad',
      to: 'Karak City',
      vehicle: 'Car',
      name: 'Kamran Khattak',
      phone: '03451234567',
      time: '08:30 AM',
      seats: 2,
      rent: 'Rs. 180',
      type: 'passenger',
      dateAdded: new Date()
    },
    {
      id: 'local-6',
      from: 'Karak City',
      to: 'Ahmed Abad',
      vehicle: 'Motorcycle',
      name: 'Hizbullah',
      phone: '03339182736',
      time: '05:15 PM',
      seats: 1,
      rent: 'Rs. 120',
      type: 'passenger',
      dateAdded: new Date()
    }
  ]);

  // Selected item modal details
  const [selectedContactItem, setSelectedContactItem] = useState<LocalTravelItem | null>(null);
  const [bookingSuccessModal, setBookingSuccessModal] = useState<boolean>(false);

  // Post Submission Handler
  const handleCreatePost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!postFrom || !postTo) {
      toast.error("Meharbani karke 'Kahan se' aur 'Kahan tak' select kijiye!");
      return;
    }
    if (postFrom === postTo) {
      toast.error("Origin aur Destination aik nahi ho saktay!");
      return;
    }
    if (!postName.trim() || !postPhone.trim()) {
      toast.error("Naam aur Verified Phone Number likhna zaroori hai!");
      return;
    }

    const phoneRegex = /^03\d{9}$/;
    if (!phoneRegex.test(postPhone.trim())) {
      toast.error("Meharbani karke sahi Pakistani mobile number likhein (Format: 03XXXXXXXXX)");
      return;
    }

    const newItem: LocalTravelItem = {
      id: `local-${Date.now()}`,
      from: postFrom,
      to: postTo,
      vehicle: postVehicle,
      name: postName.trim(),
      phone: postPhone.trim(),
      time: postTime,
      seats: postSeats,
      rent: postRent ? `Rs. ${postRent}` : 'Free/Bilmuqabil',
      type: districtRole!,
      dateAdded: new Date()
    };

    setLocalItems(prev => [newItem, ...prev]);
    toast.success(
      districtRole === 'owner' 
        ? "Apki Ride Post ho chuki hai! Passenger jald raabta karenge."
        : "Apki Passenger Request post ho chuki hai! Owner jald raabta karenge."
    );

    // Reset Form & Switch Tab
    setPostFrom('');
    setPostTo('');
    setPostName('');
    setPostPhone('');
    setPostRent('');
    setActiveTab('search');
  };

  // Filtered Results
  const filteredItems = localItems.filter(item => {
    // Only show items matching opposite role or filter based on context
    // Actually, let's show items that match what they are looking for!
    // If user is 'passenger', show 'owner' posts (rides offered by owners)
    // If user is 'owner', show 'passenger' posts (requests of passengers)
    const matchesRole = districtRole === 'passenger' ? item.type === 'owner' : item.type === 'passenger';
    
    const matchesFrom = !searchFrom || item.from.toLowerCase().includes(searchFrom.toLowerCase());
    const matchesTo = !searchTo || item.to.toLowerCase().includes(searchTo.toLowerCase());
    const matchesVehicle = searchVehicle === 'All' || item.vehicle === searchVehicle;

    return matchesRole && matchesFrom && matchesTo && matchesVehicle;
  });

  // Action: Open WhatsApp or Simulate Action
  const handleAction = (item: LocalTravelItem) => {
    setSelectedContactItem(item);
  };

  const confirmActionTrigger = (item: LocalTravelItem) => {
    setSelectedContactItem(null);
    setBookingSuccessModal(true);
    // Open whatsapp URL in a standard safe sandbox-compliant layout
    const msg = `Assalam-o-Alaikum, main ne EasyTravel (Local District Travel) pe apka post dekha. Safar: ${item.from} se ${item.to}. Mujhse raabta karen.`;
    window.open(`https://wa.me/92${item.phone.substring(1)}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className={`space-y-4 ${districtRole ? 'pb-20' : 'pb-4'}`}>
      {/* Dynamic Header */}
      {districtRole ? (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="icon" 
              className="rounded-full shrink-0 h-10 w-10 border border-slate-200 bg-white" 
              onClick={() => {
                setDistrictRole(null);
              }}
            >
              <ArrowLeft className="w-5 h-5 text-slate-700" />
            </Button>
            <div>
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase px-2.5 py-1 rounded-full tracking-wider inline-flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> DEMO • District/City Travel
              </span>
              <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight mt-1">
                {districtRole === 'owner' 
                  ? "Car / Motorcycle Owner Dashboard" 
                  : "Passenger Dashboard"}
              </h1>
              <p className="text-slate-500 text-xs">
                District Karak aur gird-o-nawah ke darmiyan rozana safar share karen.
              </p>
            </div>
          </div>

          <Button 
            variant="outline" 
            size="sm"
            className="rounded-xl border-dashed border-slate-300 font-bold hover:bg-slate-50 text-xs md:text-sm"
            onClick={() => setDistrictRole(null)}
          >
            <ArrowLeftRight className="w-4 h-4 mr-2" /> Role Tabdeel Karen
          </Button>
        </div>
      ) : (
        <div className="flex items-center">
          <Button 
            variant="ghost" 
            size="icon" 
            className="rounded-full shrink-0 h-10 w-10 border border-slate-200 bg-white shadow-sm" 
            onClick={onBackToHome}
          >
            <ArrowLeft className="w-5 h-5 text-slate-700" />
          </Button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* Step 1: Role Selection */}
        {!districtRole ? (
          <motion.div 
            key="role-selection"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {/* Card 1: Owner */}
            <motion.div
              whileHover={{ scale: 1.02, translateY: -5 }}
              whileTap={{ scale: 0.98 }}
            >
              <Card 
                className="h-full cursor-pointer border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-gradient-to-br from-emerald-600 to-teal-800 text-white group relative"
                onClick={() => {
                  if (onSelectRole) {
                    onSelectRole('driver');
                  } else {
                    if (!user || !profile) {
                      localStorage.setItem('pendingDistrictRole', 'owner');
                      toast.info("Meharbani karke pehle standard registration / sign in mukamal karein!");
                      if (setView) setView('register');
                    } else {
                      setDistrictRole('owner');
                      setActiveTab('dashboard');
                    }
                  }
                }}
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
                  <CardTitle className="text-3xl font-bold mb-1">Main Car / Bike <br /> Owner Hoon</CardTitle>
                  <CardDescription className="text-emerald-100 text-lg font-medium">
                    Mujhe Passenger Chahye
                  </CardDescription>
                </CardHeader>
              </Card>
            </motion.div>

            {/* Card 2: Passenger */}
            <motion.div
              whileHover={{ scale: 1.02, translateY: -5 }}
              whileTap={{ scale: 0.98 }}
            >
              <Card 
                className="h-full cursor-pointer border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-gradient-to-br from-indigo-600 to-purple-800 text-white group relative"
                onClick={() => {
                  if (onSelectRole) {
                    onSelectRole('passenger');
                  } else {
                    if (!user || !profile) {
                      localStorage.setItem('pendingDistrictRole', 'passenger');
                      toast.info("Meharbani karke pehle standard registration / sign in mukamal karein!");
                      if (setView) setView('register');
                    } else {
                      setDistrictRole('passenger');
                      setActiveTab('dashboard');
                    }
                  }
                }}
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
                  <CardTitle className="text-3xl font-bold mb-1">Main Passenger <br /> Hoon</CardTitle>
                  <CardDescription className="text-indigo-100 text-lg font-medium">
                    Mujhe Car / Bike Owner Chahye
                  </CardDescription>
                </CardHeader>
              </Card>
            </motion.div>


          </motion.div>
        ) : (
          /* Step 2: Main Search & Posting Interface */
          <motion.div 
            key="dashboard-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {/* Nav Tabs for Dashboard / Search / Post */}
            <div className="flex bg-slate-100/80 p-1.5 rounded-2xl w-full max-w-xl mx-auto relative border border-slate-200">
              <Button
                variant="ghost"
                className={`flex-1 rounded-xl py-2.5 text-xs md:text-sm font-black transition-all ${
                  activeTab === 'dashboard' 
                    ? 'bg-white text-slate-900 shadow-md' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                onClick={() => setActiveTab('dashboard')}
              >
                <LayoutDashboard className="w-4 h-4 mr-1 md:mr-2 inline" /> Dashboard
              </Button>
              <Button
                variant="ghost"
                className={`flex-1 rounded-xl py-2.5 text-xs md:text-sm font-black transition-all ${
                  activeTab === 'search' 
                    ? 'bg-white text-slate-900 shadow-md' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                onClick={() => setActiveTab('search')}
              >
                <Search className="w-4 h-4 mr-1 md:mr-2 inline" /> Safar Dhoondain
              </Button>
              <Button
                variant="ghost"
                className={`flex-1 rounded-xl py-2.5 text-xs md:text-sm font-black transition-all ${
                  activeTab === 'post' 
                    ? 'bg-white text-slate-900 shadow-md' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                onClick={() => setActiveTab('post')}
              >
                <Plus className="w-4 h-4 mr-1 md:mr-2 inline" /> Safar Post Karen
              </Button>
            </div>

            <AnimatePresence mode="wait">
              {activeTab === 'dashboard' ? (
                /* Local Dashboard View */
                <motion.div
                  key="dashboard-tab"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  {/* Local Welcome/Stats banner */}
                  <Card className="border-none shadow-xl rounded-[2rem] bg-gradient-to-r from-slate-900 to-slate-800 text-white overflow-hidden p-6 md:p-8">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="space-y-2 text-left">
                        <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-black uppercase px-2.5 py-1 rounded-full tracking-wider inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Live Active Session
                        </span>
                        <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white">
                          Assalam-o-Alaikum, {profile ? profile.displayName : 'Sari'}! 👋
                        </h2>
                        <p className="text-slate-300 text-sm font-medium">
                          EasyTravel District Travel system mein khush amdeed. Aap is waqt <span className="text-emerald-400 font-extrabold">{districtRole === 'owner' ? 'Car/Bike Owner' : 'Passenger'}</span> ke tour par active hain.
                        </p>
                      </div>
                      
                      <div className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-2xl flex flex-col items-center justify-center min-w-[120px] shadow-inner text-center">
                        <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider">EasyCoins</span>
                        <span className="text-3xl font-black text-emerald-400 mt-1">{profile?.easyCoins || 0}</span>
                        <span className="text-[9px] text-slate-400 mt-1">Safar share karne se earn karen</span>
                      </div>
                    </div>
                  </Card>

                  {/* Beautiful big action buttons */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <Button 
                      className="h-28 text-lg font-black gap-4 bg-emerald-600 hover:bg-emerald-700 shadow-xl rounded-[2rem] transition-all hover:scale-[1.02] active:scale-[0.98] text-white border-0 flex items-center justify-start px-8 group relative overflow-hidden"
                      onClick={() => setActiveTab('search')}
                    >
                      <div className="bg-white/20 p-3 rounded-2xl">
                        <Search className="w-7 h-7" />
                      </div>
                      <div className="text-left">
                        <p className="font-extrabold text-xl text-white">Safar Dhoondain</p>
                        <p className="text-emerald-100 text-xs font-medium mt-0.5">
                          {districtRole === 'owner' ? 'Passengers dhoond kar raabta karen' : 'Car/Bike sahi rasta dhoonden'}
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 ml-auto text-white/70 group-hover:translate-x-1 transition-transform" />
                    </Button>

                    <Button 
                      className="h-28 text-lg font-black gap-4 bg-indigo-600 hover:bg-indigo-700 shadow-xl rounded-[2rem] transition-all hover:scale-[1.02] active:scale-[0.98] text-white border-0 flex items-center justify-start px-8 group relative overflow-hidden"
                      onClick={() => setActiveTab('post')}
                    >
                      <div className="bg-white/20 p-3 rounded-2xl">
                        <Plus className="w-7 h-7" />
                      </div>
                      <div className="text-left">
                        <p className="font-extrabold text-xl text-white">Naya Post Lagayen</p>
                        <p className="text-indigo-100 text-xs font-medium mt-0.5">
                          {districtRole === 'owner' ? 'Apna safar schedule share karen' : 'Apni ride ki zaroorat post karen'}
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 ml-auto text-white/70 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </div>

                  {/* Stats & Tips Card */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white p-5 rounded-2xl shadow-md border border-slate-100 space-y-2 text-left">
                      <div className="text-emerald-600 font-extrabold text-sm flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4" /> Karak Travel Tips
                      </div>
                      <p className="text-xs text-slate-500 font-bold leading-relaxed">
                        Karak Bus Stand aur Takht-e-Nusrati ke darmiyan behtreen safar ke liye subah 8 se 10 baje ke darmiyan safar post karen taake zyada matches mil sakein.
                      </p>
                    </div>

                    <div className="bg-white p-5 rounded-2xl shadow-md border border-slate-100 space-y-2 text-left">
                      <div className="text-blue-600 font-extrabold text-sm flex items-center gap-1.5">
                        <Navigation className="w-4 h-4" /> Active Routes
                      </div>
                      <p className="text-xs text-slate-500 font-bold leading-relaxed">
                        Hamare system mein abhi Karak City, Latamber, aur Takht-e-Nusrati ke darmiyan behtareen matches available hain.
                      </p>
                    </div>

                    <div className="bg-white p-5 rounded-2xl shadow-md border border-slate-100 space-y-2 text-left">
                      <div className="text-indigo-600 font-extrabold text-sm flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" /> Matched Posts
                      </div>
                      <p className="text-xs text-slate-500 font-bold leading-relaxed">
                        Aapke liye abhi kul <span className="font-bold text-indigo-700">{filteredItems.length} matching posts</span> daryaft hui hain. "Safar Dhoondain" par click karke dekhein!
                      </p>
                    </div>
                  </div>
                </motion.div>
              ) : activeTab === 'search' ? (
                /* Search Tab view */
                <motion.div
                  key="search-tab"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  {/* Search filters header block */}
                  <Card className="border-none shadow-xl rounded-[2rem] bg-white overflow-hidden p-6">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 mb-2 text-emerald-800">
                        <Navigation className="w-5 h-5 animate-bounce" />
                        <h3 className="font-extrabold text-lg text-slate-800">
                          {districtRole === 'passenger' 
                            ? "Mujhe yahan se wahan safar karna hai (Search Rides)" 
                            : "Mujhe safar k liye passenger dhoondna hai"}
                        </h3>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* From Filter */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-black text-slate-500">KAHAN SE (FROM LOCALITY)</Label>
                          <div className="relative">
                            <MapPin className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                            <select
                              value={searchFrom}
                              onChange={(e) => setSearchFrom(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 text-sm h-11 rounded-xl px-10 font-bold focus:ring-2 focus:ring-emerald-500 text-slate-700 outline-none"
                            >
                              <option value="">Sab Locations (All)</option>
                              {LOCAL_LOCATIONS.map(loc => (
                                <option key={loc} value={loc}>{loc}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* To Filter */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-black text-slate-500">KAHAN TAK (TO LOCALITY)</Label>
                          <div className="relative">
                            <MapPin className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                            <select
                              value={searchTo}
                              onChange={(e) => setSearchTo(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 text-sm h-11 rounded-xl px-10 font-bold focus:ring-2 focus:ring-emerald-500 text-slate-700 outline-none"
                            >
                              <option value="">Sab Locations (All)</option>
                              {LOCAL_LOCATIONS.map(loc => (
                                <option key={loc} value={loc}>{loc}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Ride Type Filter */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-black text-slate-500">SAVARI KI QSME (VEHICLE)</Label>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant={searchVehicle === 'All' ? 'default' : 'outline'}
                              className="flex-1 h-11 rounded-xl font-bold text-xs"
                              onClick={() => setSearchVehicle('All')}
                            >
                              All
                            </Button>
                            <Button
                              type="button"
                              variant={searchVehicle === 'Car' ? 'default' : 'outline'}
                              className="flex-1 h-11 rounded-xl font-bold text-xs gap-1"
                              onClick={() => setSearchVehicle('Car')}
                            >
                              <Car className="w-3.5 h-3.5" /> Car
                            </Button>
                            <Button
                              type="button"
                              variant={searchVehicle === 'Motorcycle' ? 'default' : 'outline'}
                              className="flex-1 h-11 rounded-xl font-bold text-xs gap-1"
                              onClick={() => setSearchVehicle('Motorcycle')}
                            >
                              <Bike className="w-3.5 h-3.5" /> Active
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>

                  {/* Search Results */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between px-2">
                      <h4 className="text-slate-800 text-sm font-black uppercase tracking-wider">
                        Matched Travel Posts ({filteredItems.length})
                      </h4>
                      <p className="text-slate-400 text-xs font-bold">Local Simulated Database</p>
                    </div>

                    {filteredItems.length === 0 ? (
                      <Card className="border-none shadow-md rounded-2xl bg-white p-12 text-center space-y-3">
                        <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-slate-300">
                          <Search className="w-8 h-8" />
                        </div>
                        <h4 className="font-extrabold text-slate-800 text-lg">Koi Ride / Offer milti julti nahi hai</h4>
                        <p className="text-slate-500 text-sm max-w-sm mx-auto">
                          Meharbani karke selection checks tabdeel karen ya apne travel routes ko post karke matches ke aane ka intezar karen!
                        </p>
                      </Card>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredItems.map((item) => (
                          <motion.div
                            key={item.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            whileHover={{ y: -3 }}
                            className="bg-white rounded-3xl p-6 border border-slate-100 shadow-md relative overflow-hidden"
                          >
                            {/* New label */}
                            {item.id.startsWith('local-1') || item.id.startsWith('local-5') || item.id.startsWith('local-17') ? (
                              <div className="absolute right-0 top-0 bg-blue-600 text-white text-[8px] tracking-widest uppercase font-black px-3.5 py-1 rounded-bl-xl shadow-sm">
                                active
                              </div>
                            ) : null}

                            {item.id.startsWith('local-local-') ? (
                              <div className="absolute right-0 top-0 bg-emerald-600 text-white text-[8px] tracking-widest uppercase font-black px-3.5 py-1 rounded-bl-xl shadow-sm animate-pulse">
                                Naya (New)
                              </div>
                            ) : null}

                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-2">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                  item.vehicle === 'Car' 
                                    ? 'bg-blue-50 text-blue-600' 
                                    : 'bg-amber-50 text-amber-600'
                                }`}>
                                  {item.vehicle === 'Car' ? <Car className="w-5 h-5" /> : <Bike className="w-5 h-5" />}
                                </div>
                                <div>
                                  <h4 className="font-bold text-slate-800 text-base">{item.name}</h4>
                                  <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide">
                                    {item.vehicle} • {item.type === 'owner' ? "Car/Bike Owner" : "Passenger Request"}
                                  </p>
                                </div>
                              </div>
                              <span className="text-emerald-700 font-black text-sm bg-emerald-50 px-3 py-1 rounded-xl">
                                {item.rent}
                              </span>
                            </div>

                            {/* From/To details with graphical path line */}
                            <div className="my-5 relative pl-6 border-l-2 border-dashed border-slate-200 space-y-4">
                              <div className="relative">
                                <span className="absolute -left-9 top-0.5 w-4 h-4 rounded-full bg-blue-500 border-4 border-white shadow-sm" />
                                <p className="text-xs text-slate-400 font-bold uppercase tracking-wide">SHURU (FROM)</p>
                                <p className="text-sm font-black text-slate-800">{item.from}</p>
                              </div>
                              <div className="relative">
                                <span className="absolute -left-9 top-0.5 w-4 h-4 rounded-full bg-emerald-500 border-4 border-white shadow-sm" />
                                <p className="text-xs text-slate-400 font-bold uppercase tracking-wide font-outfit">AAKHRI MANZIL (TO)</p>
                                <p className="text-sm font-black text-slate-800">{item.to}</p>
                              </div>
                            </div>

                            {/* Time details */}
                            <div className="flex items-center justify-between border-t border-slate-50 pt-4 mt-2">
                              <div className="flex items-center gap-1.5 text-slate-500 font-bold text-xs">
                                <Clock className="w-4 h-4 text-blue-500" />
                                <span>{item.time}</span>
                              </div>
                              {item.type === 'owner' && (
                                <span className="text-xs text-slate-500 font-semibold bg-slate-100 py-1 px-2.5 rounded-lg">
                                  Seats: <strong className="text-slate-800 font-black">{item.seats}</strong>
                                </span>
                              )}
                              
                              <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs h-9 rounded-xl shadow-md px-4"
                                onClick={() => handleAction(item)}
                              >
                                <MessageCircle className="w-3.5 h-3.5 mr-1" /> Raabta Karen
                              </Button>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              ) : (
                /* Post Tab view */
                <motion.div
                  key="post-tab"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <Card className="border-none shadow-xl rounded-[2.5rem] bg-white overflow-hidden max-w-2xl mx-auto">
                    <CardHeader className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-6 relative">
                      <div className="relative z-10 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                          <Plus className="w-5 h-5 text-white animate-pulse" />
                        </div>
                        <div>
                          <CardTitle className="text-xl font-bold">Naya Local Safar Post Karen</CardTitle>
                          <CardDescription className="text-slate-300 text-xs">
                            {districtRole === 'owner' 
                              ? "Apni car ya motorcycle pe safar dhoondne ke liye seats ko list karen"
                              : "Travel details ko add karen taake gari aur bike owners ap se raabta saken"}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-6 md:p-8">
                      <form onSubmit={handleCreatePost} className="space-y-5">
                        <div className="bg-slate-50 border border-slate-200.30 p-4 rounded-2xl flex items-center gap-3 mb-4">
                          <Navigation className="w-5 h-5 text-blue-600" />
                          <div className="text-xs font-semibold text-slate-600">
                            "I need to travel from here to there" (Mujhe makhsoos local gaaon se shehar tak safar share karna hai).
                          </div>
                        </div>

                        {/* Travel From/To list grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-[11px] font-black text-slate-500">MERA MATEEN / KAHAN SE (FROM LOCATION)</Label>
                            <select
                              value={postFrom}
                              onChange={(e) => setPostFrom(e.target.value)}
                              required
                              className="w-full bg-slate-50 border border-slate-200 text-sm h-12 rounded-xl px-3 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
                            >
                              <option value="">Locality Select Karen...</option>
                              {LOCAL_LOCATIONS.map(loc => (
                                <option key={loc} value={loc}>{loc}</option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-[11px] font-black text-slate-500 font-outfit">AAKHRI MANZIL / KAHAN TAK (TO LOCATION)</Label>
                            <select
                              value={postTo}
                              onChange={(e) => setPostTo(e.target.value)}
                              required
                              className="w-full bg-slate-50 border border-slate-200 text-sm h-12 rounded-xl px-3 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
                            >
                              <option value="">Locality Select Karen...</option>
                              {LOCAL_LOCATIONS.map(loc => (
                                <option key={loc} value={loc}>{loc}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Vehicle select and Rent section */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-[11px] font-black text-slate-500">SAVARI (VEHICLE TYPE)</Label>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant={postVehicle === 'Car' ? 'default' : 'outline'}
                                className="flex-1 h-12 rounded-xl font-bold text-xs gap-1.5"
                                onClick={() => setPostVehicle('Car')}
                              >
                                <Car className="w-4 h-4" /> Car (Gari)
                              </Button>
                              <Button
                                type="button"
                                variant={postVehicle === 'Motorcycle' ? 'default' : 'outline'}
                                className="flex-1 h-12 rounded-xl font-bold text-xs gap-1.5"
                                onClick={() => setPostVehicle('Motorcycle')}
                              >
                                <Bike className="w-4 h-4" /> Motorcycle
                              </Button>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-[11px] font-black text-slate-500">RIDE / KRAL (RENT IN RS) — OPTIONAL</Label>
                            <Input
                              type="number"
                              placeholder="E.g. 150 (Chorain agr free hai)"
                              value={postRent}
                              onChange={(e) => setPostRent(e.target.value)}
                              className="h-12 rounded-xl font-bold bg-slate-50 border-slate-200"
                            />
                          </div>
                        </div>

                        {/* Timing and seats */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-[11px] font-black text-slate-500">KHALI SEATS (PASSENGER CAPACITY)</Label>
                            <div className="flex items-center gap-2">
                              {[1, 2, 3, 4].map((sNum) => (
                                <Button
                                  key={sNum}
                                  type="button"
                                  variant={postSeats === sNum ? 'default' : 'outline'}
                                  className="flex-1 h-11 rounded-lg font-bold"
                                  onClick={() => setPostSeats(sNum)}
                                >
                                  {sNum}
                                </Button>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-[11px] font-black text-slate-500">SAFAR KA WAQT (TIMING)</Label>
                            <div className="relative">
                              <Clock className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" />
                              <Input
                                type="text"
                                placeholder="E.g. 08:30 AMya Fauri"
                                value={postTime}
                                onChange={(e) => setPostTime(e.target.value)}
                                className="h-12 pl-10 rounded-xl font-bold bg-slate-50 border-slate-200"
                                required
                              />
                            </div>
                          </div>
                        </div>

                        <hr className="border-slate-100 my-4" />

                        {/* Identity parameters */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-[11px] font-black text-slate-500 font-outfit">APKA SHAKHS (DISPLAY NAME / APKA NAAM)</Label>
                            <Input
                              type="text"
                              placeholder="Apka poora naam"
                              value={postName}
                              onChange={(e) => setPostName(e.target.value)}
                              required
                              className="h-12 rounded-xl font-bold bg-slate-50 border-slate-200"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-[11px] font-black text-slate-500">MOBILE NUMBER (VERIFIED PHONE CALL)</Label>
                            <Input
                              type="text"
                              placeholder="E.g. 03120000000"
                              value={postPhone}
                              onChange={(e) => setPostPhone(e.target.value)}
                              required
                              className="h-12 rounded-xl font-bold bg-slate-50 border-slate-200"
                            />
                          </div>
                        </div>

                        {/* Button control */}
                        <Button
                          type="submit"
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black h-13 mt-6 text-base rounded-2xl gap-2 shadow-lg shadow-emerald-50 active:scale-95 transition-all"
                        >
                          <Check className="w-5 h-5" /> Travel Post Upload Karen
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation & Raabta Call Sheet / Dialog Modal */}
      {selectedContactItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-[2rem] shadow-2xl overflow-hidden max-w-md w-full"
          >
            <div className="bg-emerald-600 p-6 text-white text-center relative">
              <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
                <MessageCircle className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-black">Local Raabta Confirmation</h3>
              <p className="text-xs text-emerald-100">WhatsApp and Direct Contact Coordinates</p>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1.5 text-center">
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Makhsoos Route Selected</p>
                <p className="text-base font-black text-slate-800">
                  {selectedContactItem.from} <span className="text-emerald-500 font-bold">👉</span> {selectedContactItem.to}
                </p>
                <div className="text-xs text-slate-500 font-semibold pt-1">
                  Owner: <span className="font-extrabold text-slate-800">{selectedContactItem.name}</span> • Vehicle: <span className="font-extrabold text-slate-800">{selectedContactItem.vehicle}</span>
                </div>
              </div>

              <p className="text-xs text-slate-500 font-bold leading-relaxed text-center">
                User se WhatsApp k zarye direct baat karne k liye click karen. Ye makhsoos local district travel demo mode hai.
              </p>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1 h-12 rounded-xl font-bold border-slate-200"
                  onClick={() => setSelectedContactItem(null)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm gap-2 shadow-lg shadow-emerald-100 active:scale-95 transition-all"
                  onClick={() => confirmActionTrigger(selectedContactItem)}
                >
                  <MessageCircle className="w-4 h-4" /> Message Shuru Karen
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Booking Prompt Simulation Success Dialog */}
      {bookingSuccessModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[2.5rem] shadow-2xl p-8 max-w-sm w-full text-center space-y-4"
          >
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            
            <h3 className="text-2xl font-black text-slate-900">AlhamduLillah!</h3>
            
            <p className="text-sm font-semibold text-slate-600 leading-relaxed">
              WhatsApp redirect trigger ho chuki hai! Aap doosre bhae se baat karke seat confirm karsakty hain. Safar Mubarak!
            </p>

            <Button
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black h-12 rounded-xl"
              onClick={() => setBookingSuccessModal(false)}
            >
              Shukriya (Wapas)
            </Button>
          </motion.div>
        </div>
      )}
    </div>
  );
}
