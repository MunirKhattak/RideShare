export interface UserProfile {
  uid: string;
  customId: string;
  displayName: string;
  email: string;
  photoURL?: string;
  phoneNumber?: string;
  whatsappNumber?: string;
  role: 'driver' | 'passenger' | 'both' | 'admin';
  vehicleType?: 'Car' | 'Bike';
  bio?: string;
  easyCoins?: number;
  createdAt: any;
}

export interface RewardHistory {
  id: string;
  userId: string;
  amount: number;
  type: 'earn' | 'redeem';
  reason: string;
  rideId?: string;
  timestamp: any;
}

export interface Ride {
  id: string;
  driverId: string;
  driverName: string;
  driverPhoto?: string;
  phoneNumber?: string;
  whatsappNumber?: string;
  origin: string;
  destination: string;
  date: string;
  time: string;
  pickupPoint: string;
  dropoffPoint: string;
  availableSeats: number;
  price: number;
  status: 'available' | 'full' | 'completed' | 'cancelled';
  participants?: string[];
  interactions?: {
    call: number;
    whatsapp: number;
    chat: number;
  };
  finalStatus?: 'done' | 'cancelled' | 'late' | 'pending';
  statusReportedAt?: any;
  rewardStatus?: {
    [passengerId: string]: {
      name: string;
      driverConfirmed: boolean;
      passengerConfirmed: boolean;
      rewardIssued: boolean;
      startTimeConfirmed: boolean;
    }
  };
  createdAt: any;
  isDeleted?: boolean;
}

export interface RideRequest {
  id: string;
  passengerId: string;
  passengerName: string;
  passengerPhoto?: string;
  phoneNumber?: string;
  whatsappNumber?: string;
  origin: string;
  destination: string;
  date: string;
  time: string;
  status: 'pending' | 'matched' | 'cancelled';
  participants?: string[];
  interactions?: {
    call: number;
    whatsapp: number;
    chat: number;
  };
  finalStatus?: 'done' | 'cancelled' | 'late' | 'pending';
  statusReportedAt?: any;
  rewardStatus?: {
    [passengerId: string]: {
      name: string;
      driverConfirmed: boolean;
      passengerConfirmed: boolean;
      rewardIssued: boolean;
      startTimeConfirmed: boolean;
    }
  };
  createdAt: any;
  isDeleted?: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  participants: string[];
  text: string;
  rideId?: string;
  timestamp: any;
  status?: 'sent' | 'delivered' | 'read';
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

export interface Booking {
  id: string;
  rideId: string;
  driverId: string;
  passengerId: string;
  passengerName: string;
  driverName: string;
  seats: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  type: 'ride_booking' | 'request_booking';
  participants: string[];
  origin: string;
  destination: string;
  date: string;
  time: string;
  passengerWhatsapp?: string;
  driverWhatsapp?: string;
  createdAt: any;
}

export interface WalletRechargeRequest {
  id: string;
  userId: string;
  userCustomId?: string;
  userDisplayName: string;
  userEmail: string;
  amount: number;
  method: string;
  txnId: string;
  status: 'pending' | 'approved' | 'declined';
  timestamp: any;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  read: boolean;
  timestamp: any;
}
