import React, { useState, useEffect } from 'react';
import { AD_CONFIG } from '../config/ads';
import { ExternalLink, Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AdInterstitialModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}

export function AdInterstitialModal({ isOpen, onClose, title = "Sponsored Recommendation" }: AdInterstitialModalProps) {
  const [countdown, setCountdown] = useState(3);
  const [canSkip, setCanSkip] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setCountdown(3);
      setCanSkip(false);
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setCanSkip(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen]);

  if (!isOpen || !AD_CONFIG.enabled) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm sm:max-w-md bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl text-white">
        {/* Header Bar */}
        <div className="p-3.5 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
              Ad
            </span>
            <span className="text-xs font-semibold text-slate-300">
              Google AdMob Test Interstitial
            </span>
          </div>

          <button 
            disabled={!canSkip}
            onClick={onClose}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1 ${
              canSkip 
                ? 'bg-slate-800 hover:bg-slate-700 text-white cursor-pointer' 
                : 'bg-slate-800/50 text-slate-500 cursor-not-allowed'
            }`}
          >
            {canSkip ? (
              <>Skip <X className="w-3.5 h-3.5" /></>
            ) : (
              `Skip in ${countdown}s`
            )}
          </button>
        </div>

        {/* Ad Body */}
        <div className="p-6 text-center space-y-4">
          <div className="inline-flex p-3 bg-gradient-to-tr from-amber-500/20 to-orange-500/20 rounded-2xl border border-amber-500/30 text-amber-400">
            <Info className="w-8 h-8" />
          </div>

          <div>
            <h3 className="text-lg font-bold text-white">{title}</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
              This is a full-screen Google AdMob Interstitial Test Ad simulation. Real ads will display here once your app is live on Play Store.
            </p>
          </div>

          <div className="p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800 text-left space-y-1">
            <p className="text-[11px] text-slate-400 font-mono">Test Unit ID:</p>
            <p className="text-xs text-amber-400 font-mono font-bold truncate">
              {AD_CONFIG.interstitialAdUnitId}
            </p>
          </div>

          <div className="pt-2">
            <Button
              onClick={() => {
                alert(`[Test Interstitial Ad Action]\nUnit ID: ${AD_CONFIG.interstitialAdUnitId}`);
                onClose();
              }}
              className="w-full bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-xl py-5 text-sm gap-2"
            >
              Learn More <ExternalLink className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
