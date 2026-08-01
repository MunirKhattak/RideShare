import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  MapPin, 
  User, 
  Car, 
  Phone, 
  MessageSquare, 
  Navigation, 
  CheckCircle2, 
  XCircle, 
  Zap, 
  Calendar, 
  Sparkles, 
  X,
  Clock,
  ShieldCheck,
  Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Booking } from '../types';
import { doc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'sonner';

interface ActiveRideBookingModalProps {
  booking: Booking;
  currentUserId: string;
  currentUserName: string;
  onClose: () => void;
  onOpenLiveMap: () => void;
  onBookingUpdated?: () => void;
}

export const ActiveRideBookingModal: React.FC<ActiveRideBookingModalProps> = ({
  booking,
  currentUserId,
  currentUserName,
  onClose,
  onOpenLiveMap,
  onBookingUpdated
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSender = booking.senderId ? booking.senderId === currentUserId : booking.passengerId === currentUserId;
  const isDriver = booking.driverId === currentUserId;
  const isPassenger = booking.passengerId === currentUserId;

  const otherName = isDriver ? booking.passengerName : booking.driverName;
  const otherRole = isDriver ? 'Passenger' : 'Car Owner / Driver';
  const otherWhatsapp = isDriver ? booking.passengerWhatsapp : booking.driverWhatsapp;
  const otherPhone = isDriver ? booking.passengerPhone : booking.driverPhone;

  const isLiveActive = booking.source === 'live_active_mode' || booking.mode === 'active';

  // Check 8-hour expiry
  const createdMs = booking.createdAt?.toMillis 
    ? booking.createdAt.toMillis() 
    : (typeof booking.createdAt === 'number' ? booking.createdAt : Date.parse(booking.createdAt) || Date.now());
  const hoursOld = (Date.now() - createdMs) / (1000 * 60 * 60);

  if (hoursOld >= 8 && booking.status !== 'completed') {
    // Auto-expire or close if older than 8 hours
    return null;
  }

  // Confirm Ride Request
  const handleConfirm = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'bookings', booking.id), { 
        status: 'confirmed',
        confirmedAt: serverTimestamp()
      });

      // Target user to receive confirmation notification (the sender)
      const targetUserId = booking.senderId || (isDriver ? booking.passengerId : booking.driverId);
      if (targetUserId) {
        await addDoc(collection(db, 'notifications'), {
          userId: targetUserId,
          type: 'booking_confirmed',
          title: 'Ride Confirm Ho Gayi! 🎉',
          body: `${currentUserName || 'User'} ne aap ki ride request confirm kar di hai! Route: ${booking.origin} ➔ ${booking.destination}`,
          read: false,
          createdAt: serverTimestamp(),
          senderId: currentUserId,
          senderName: currentUserName,
          bookingId: booking.id,
          source: booking.source || 'active_mode'
        });
      }

      toast.success("Ride Confirm Ho Gayi! 🎉");
      if (onBookingUpdated) onBookingUpdated();
    } catch (err) {
      console.error("Error confirming booking:", err);
      toast.error("Ride confirm karne me masla aaya.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reject / Cancel Ride Request
  const handleCancel = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'bookings', booking.id), { status: 'cancelled' });
      toast.info("Booking request radd kar di gayi.");
      if (onBookingUpdated) onBookingUpdated();
      onClose();
    } catch (err) {
      console.error("Error cancelling booking:", err);
      toast.error("Masla aaya.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Complete Safar
  const handleCompleteSafar = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'bookings', booking.id), { 
        status: 'completed',
        completedAt: serverTimestamp()
      });
      toast.success("Mubarak! Safar kamyabi se mukamal hua! 🎉");
      if (onBookingUpdated) onBookingUpdated();
      onClose();
    } catch (err) {
      console.error("Error completing ride:", err);
      toast.error("Ride complete karne me masla aaya.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/70 backdrop-blur-md p-4 overflow-y-auto animate-in fade-in duration-200">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 my-auto"
      >
        {/* Header Bar */}
        <div className={`p-5 relative ${
          booking.status === 'confirmed' 
            ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white'
            : isLiveActive 
              ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white'
              : 'bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 text-white'
        }`}>
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/10 hover:bg-black/20 text-white transition-all"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black shadow-sm ${
              isLiveActive ? 'bg-emerald-400/30 text-white border border-emerald-300/40' : 'bg-amber-400/30 text-white border border-amber-300/40'
            }`}>
              {isLiveActive ? <Zap className="w-3.5 h-3.5 fill-current" /> : <Calendar className="w-3.5 h-3.5" />}
              {isLiveActive ? 'Active Mode' : 'Schedule Mode'}
            </span>

            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
              booking.status === 'confirmed'
                ? 'bg-white/20 text-white'
                : 'bg-amber-500/30 text-white border border-amber-300/40'
            }`}>
              {booking.status === 'confirmed' ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" /> Confirmed Ride
                </>
              ) : (
                <>
                  <Clock className="w-3.5 h-3.5" /> Request Pending
                </>
              )}
            </span>
          </div>

          <h3 className="text-xl font-extrabold flex items-center gap-2 tracking-tight">
            {booking.status === 'confirmed' 
              ? 'Aap Ka Safar Jari Hai! 🚗' 
              : 'Nayi Ride Booking Request'}
          </h3>
          <p className="text-xs text-white/90 font-medium mt-1">
            {booking.status === 'confirmed'
              ? 'Live tracking aur safar ki maloomat neche dekhein.'
              : 'Baraye meharbani ride request ki details check karein.'}
          </p>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-5 max-h-[80vh] overflow-y-auto">

          {/* Route Box */}
          <Card className="p-4 bg-gradient-to-br from-slate-50 to-indigo-50/30 border border-indigo-100/80 rounded-2xl shadow-sm space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
              <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-indigo-600" /> Route Details</span>
              <span className="text-indigo-600 font-extrabold">{booking.date || 'Aaj'}</span>
            </div>

            <div className="flex items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-100 shadow-xs">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-slate-400 font-bold uppercase">Origin</p>
                <p className="text-base font-extrabold text-slate-900 truncate">{booking.origin}</p>
              </div>

              <div className="flex flex-col items-center shrink-0 px-2">
                <div className="p-1.5 rounded-full bg-indigo-100 text-indigo-600">
                  <Navigation className="w-4 h-4 rotate-90" />
                </div>
                <div className="w-12 h-0.5 bg-gradient-to-r from-indigo-300 to-emerald-300 my-1 rounded-full" />
              </div>

              <div className="flex-1 min-w-0 text-right">
                <p className="text-[11px] text-slate-400 font-bold uppercase">Destination</p>
                <p className="text-base font-extrabold text-slate-900 truncate">{booking.destination}</p>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-600 pt-1 px-1">
              <span className="flex items-center gap-1 font-semibold">
                <Clock className="w-3.5 h-3.5 text-slate-400" /> Time: <strong className="text-slate-800">{booking.time || 'Abhi isi waqt'}</strong>
              </span>
              <span className="flex items-center gap-1 font-semibold">
                <Car className="w-3.5 h-3.5 text-slate-400" /> Seats: <strong className="text-slate-800">{booking.seats || 1} Seat(s)</strong>
              </span>
            </div>
          </Card>

          {/* User Partner Details */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 text-white font-black text-lg flex items-center justify-center shadow-md shrink-0">
                  {otherName ? otherName.charAt(0).toUpperCase() : <User className="w-6 h-6" />}
                </div>
                <div>
                  <h4 className="font-extrabold text-slate-900 text-base flex items-center gap-1.5">
                    {otherName || 'User Partner'}
                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                  </h4>
                  <p className="text-xs text-slate-500 font-semibold">{otherRole}</p>
                </div>
              </div>

              {booking.status === 'confirmed' && (
                <div className="flex items-center gap-2">
                  {otherWhatsapp && (
                    <a
                      href={`https://wa.me/${otherWhatsapp.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2.5 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 transition-all shadow-sm"
                      title="WhatsApp Chat"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </a>
                  )}
                  {otherPhone && (
                    <a
                      href={`tel:${otherPhone}`}
                      className="p-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-sm"
                      title="Call Partner"
                    >
                      <Phone className="w-4 h-4" />
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ACTION SECTION */}

          {/* 1. Pending State: Recipient can Confirm or Reject */}
          {booking.status === 'pending' && !isSender && (
            <div className="space-y-3 pt-2">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 font-medium text-center">
                Aap ko is ride ke liye booking request moosul hui hai. Aap confirm ya cancel kar sakte hain.
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={handleCancel}
                  disabled={isSubmitting}
                  variant="outline"
                  className="h-12 border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 font-bold rounded-xl"
                >
                  <XCircle className="w-4 h-4 mr-1.5" /> Inkaar Karein
                </Button>

                <Button
                  onClick={handleConfirm}
                  disabled={isSubmitting}
                  className="h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-lg shadow-emerald-600/20"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1.5" /> Ride Confirm Karein
                </Button>
              </div>
            </div>
          )}

          {/* 2. Pending State: Sender is waiting */}
          {booking.status === 'pending' && isSender && (
            <div className="space-y-3 pt-2">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 font-medium text-center flex items-center justify-center gap-2">
                <Clock className="w-4 h-4 text-blue-600 animate-spin" />
                Aap ki booking request bhej di gayi hai. Doosre user ke confirm karne ka intazaar hai...
              </div>

              <Button
                onClick={handleCancel}
                disabled={isSubmitting}
                variant="outline"
                className="w-full h-11 border-slate-200 text-slate-600 font-bold rounded-xl"
              >
                Request Cancel Karein
              </Button>
            </div>
          )}

          {/* 3. Confirmed State: Location Share & Complete Safar */}
          {booking.status === 'confirmed' && (
            <div className="space-y-3 pt-2">
              {/* Share Live Location */}
              <Button
                onClick={() => {
                  onClose();
                  onOpenLiveMap();
                }}
                className="w-full h-13 text-sm font-extrabold gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl shadow-lg transition-all"
              >
                <Navigation className="w-5 h-5 text-emerald-300 animate-pulse" />
                Live Ride Location Share Karein
              </Button>

              {/* Complete Safar */}
              <Button
                onClick={handleCompleteSafar}
                disabled={isSubmitting}
                className="w-full h-13 text-sm font-black gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl shadow-lg transition-all"
              >
                <Check className="w-5 h-5" />
                Safar Mukamal Hua
              </Button>
            </div>
          )}

          {/* General Close / Dismiss Button */}
          <div className="pt-2 border-t border-slate-100">
            <Button
              onClick={onClose}
              variant="ghost"
              className="w-full h-11 text-slate-500 font-bold hover:text-slate-800 hover:bg-slate-100 rounded-xl flex items-center justify-center gap-1.5"
            >
              <X className="w-4 h-4" /> Window Band Karein
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
