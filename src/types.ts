export interface UserProfile {
  uid: string;
  customId: string;
  displayName: string;
  email: string;
  photoURL?: string;
  phoneNumber?: string;
  whatsappNumber?: string;
  role: 'driver' | 'passenger' | 'both' | 'admin';
  bio?: string;
  createdAt: any;
}

export interface Ride {
  id: string;
  driverId: string;
  driverName: string;
  driverPhoto?: string;
  origin: string;
  destination: string;
  date: string;
  time: string;
  pickupPoint: string;
  dropoffPoint: string;
  availableSeats: number;
  price: number;
  status: 'available' | 'full' | 'completed' | 'cancelled';
  interactions?: {
    call: number;
    whatsapp: number;
    chat: number;
  };
  finalStatus?: 'done' | 'cancelled' | 'late' | 'pending';
  statusReportedAt?: any;
  createdAt: any;
}

export interface RideRequest {
  id: string;
  passengerId: string;
  passengerName: string;
  passengerPhoto?: string;
  origin: string;
  destination: string;
  date: string;
  time: string;
  status: 'pending' | 'matched' | 'cancelled';
  interactions?: {
    call: number;
    whatsapp: number;
    chat: number;
  };
  finalStatus?: 'done' | 'cancelled' | 'late' | 'pending';
  statusReportedAt?: any;
  createdAt: any;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  participants: string[];
  text: string;
  rideId?: string;
  timestamp: any;
}

export interface Complaint {
  id: string;
  userId: string;
  userName: string;
  userCustomId?: string;
  complaintNumber: string;
  subject: string;
  description: string;
  status: 'pending' | 'resolved';
  adminReply?: string;
  userAcknowledged: boolean;
  createdAt: any;
}

export interface Analytics {
  id: string; // date string like '2026-04-10'
  visits: number;
}

export interface Warning {
  id: string;
  userId: string;
  adminMessage: string;
  userReply?: string;
  status: 'pending' | 'replied';
  createdAt: any;
}
