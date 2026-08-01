import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Share2, MessageCircle, Copy, MapPin, X, ExternalLink, Check, Navigation, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Booking } from '../types';

interface ShareLiveLocationModalProps {
  booking: Booking | null;
  currentUserId?: string;
  isOpen: boolean;
  onClose: () => void;
  onOpenMap?: () => void;
}

export const ShareLiveLocationModal: React.FC<ShareLiveLocationModalProps> = ({
  booking,
  currentUserId,
  isOpen,
  onClose,
  onOpenMap
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !booking) return null;

  const isDriver = currentUserId === booking.driverId;
  const otherUserName = isDriver ? booking.passengerName : booking.driverName;
  const otherUserWhatsapp = isDriver ? booking.passengerWhatsapp : booking.driverWhatsapp;

  const origin = booking.origin || 'Location';
  const destination = booking.destination || 'Destination';
  const shareUrl = `${window.location.origin}/?ride=${booking.rideId || booking.id}`;

  const shareText = `🚗 EasyTravel Live Ride Location Tracking:\n\n📍 Safar: ${origin} ➔ ${destination}\n👤 Companion: ${otherUserName || 'User'}\n📅 Date & Time: ${booking.date || 'Aaj'} • ${booking.time || 'Abhi'}\n\n👉 Live Track Karein: ${shareUrl}`;

  const handleWhatsAppShare = () => {
    const encodedText = encodeURIComponent(shareText);
    const targetPhone = otherUserWhatsapp ? otherUserWhatsapp.replace(/[^0-9]/g, '') : '';
    
    // If target phone available, share directly to target or open general WA share
    const url = targetPhone 
      ? `https://wa.me/${targetPhone}?text=${encodedText}` 
      : `https://wa.me/?text=${encodedText}`;
    
    window.open(url, '_blank');
    toast.success("WhatsApp khol diya gaya hai! Location message share karein.");
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `EasyTravel Live Ride: ${origin} to ${destination}`,
          text: shareText,
          url: shareUrl
        });
        toast.success("Live location kamyabi se share ho gayi!");
      } catch (err) {
        // User cancelled or share failed
      }
    } else {
      handleCopyLink();
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareText);
    setCopied(true);
    toast.success("Live location tracking details copy ho gayi hain!");
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 p-5 text-white relative">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-white/20 text-white border-none px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                ⚡ Live Active Tracking
              </Badge>
            </div>
            
            <h2 className="text-xl font-black flex items-center gap-2">
              <Share2 className="w-5 h-5 text-emerald-200" />
              Live Location Share Karein
            </h2>
            <p className="text-xs text-emerald-100 mt-1">
              Apne ghar walon ya doston ke sath apni live ride tracking location share karein.
            </p>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4">
            {/* Route Summary Box */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500 border-b border-slate-200 pb-2">
                <span className="flex items-center gap-1">
                  <Navigation className="w-3.5 h-3.5 text-emerald-600" />
                  Route Details
                </span>
                <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full text-[10px]">
                  Verified Ride
                </span>
              </div>
              
              <div className="flex items-center justify-between pt-1">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">From</p>
                  <p className="text-sm font-black text-slate-900">{origin}</p>
                </div>
                <div className="text-center px-2">
                  <span className="text-emerald-600 text-xs font-black">➔</span>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">To</p>
                  <p className="text-sm font-black text-slate-900">{destination}</p>
                </div>
              </div>

              <div className="text-xs text-slate-600 pt-1 flex items-center justify-between border-t border-dashed border-slate-200">
                <span>Companion: <strong className="text-slate-800">{otherUserName || 'User'}</strong></span>
                <span className="text-slate-400 text-[10px]">{booking.date || 'Aaj'} • {booking.time || 'Abhi'}</span>
              </div>
            </div>

            {/* Sharing Options */}
            <div className="space-y-2.5 pt-1">
              {/* Option 1: WhatsApp */}
              <Button
                onClick={handleWhatsAppShare}
                className="w-full h-13 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black shadow-lg shadow-emerald-200 gap-3 text-sm transition-all active:scale-98"
              >
                <MessageCircle className="w-5 h-5 fill-current" />
                WhatsApp par Location Bhejein
              </Button>

              {/* Option 2: Native Share (Apps / SMS / Messages) */}
              <Button
                onClick={handleNativeShare}
                variant="outline"
                className="w-full h-12 rounded-2xl border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-bold gap-3 text-sm transition-all active:scale-98"
              >
                <Share2 className="w-4 h-4 text-slate-600" />
                Baqi Apps Par Share Karein
              </Button>

              {/* Option 3: Copy Link */}
              <Button
                onClick={handleCopyLink}
                variant="ghost"
                className="w-full h-11 rounded-2xl text-slate-600 hover:bg-slate-100 font-semibold gap-2 text-xs"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" />
                    Link Copy Ho Gaya!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-slate-500" />
                    Tracking Link Copy Karein
                  </>
                )}
              </Button>

              {/* Option 4: Open Live Map */}
              {onOpenMap && (
                <div className="pt-2 border-t border-slate-100">
                  <Button
                    onClick={() => {
                      onClose();
                      onOpenMap();
                    }}
                    className="w-full h-11 rounded-2xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold gap-2 text-xs border border-blue-100"
                  >
                    <MapPin className="w-4 h-4 text-blue-600" />
                    App Map Me Live Tracker Kholein
                  </Button>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
