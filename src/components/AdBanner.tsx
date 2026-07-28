import React, { useState, useEffect } from 'react';
import { AD_CONFIG } from '../config/ads';
import { ExternalLink, Info, X } from 'lucide-react';

interface AdBannerProps {
  type?: 'banner' | 'card' | 'inline' | 'partner';
  className?: string;
  onDismiss?: () => void;
}

export function AdBanner({ type = 'banner', className = '', onDismiss }: AdBannerProps) {
  const [currentAdIndex, setCurrentAdIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Cycle sample test ads every 6 seconds
    const interval = setInterval(() => {
      setCurrentAdIndex((prev) => (prev + 1) % AD_CONFIG.sampleAds.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  if (!AD_CONFIG.enabled || dismissed) return null;

  const ad = AD_CONFIG.sampleAds[currentAdIndex];

  if (type === 'partner') {
    return (
      <div className={`w-full max-w-md mx-auto overflow-hidden rounded-2xl bg-gradient-to-r ${ad.bgGradient} p-4 text-white shadow-md border border-white/10 transition-all duration-500 ${className}`}>
        {/* Top Header Row */}
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-1.5">
            <span className="bg-amber-400 text-slate-900 text-[10px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
              AD
            </span>
            <span className="text-[11px] font-medium text-white/85 flex items-center gap-1">
              {ad.sponsor} • <Info className="w-3 h-3 text-white/70" />
            </span>
          </div>
          <span className="text-[10px] font-mono text-white/60">
            Google Ad Space
          </span>
        </div>

        {/* Ad Content */}
        <div className="pr-2 my-2 text-left">
          <h4 className="font-bold text-sm sm:text-base leading-snug">{ad.title}</h4>
          <p className="text-xs text-white/85 mt-1 leading-relaxed">{ad.description}</p>
        </div>

        {/* CTA & Pagination Dots */}
        <div className="mt-3 flex items-center justify-between pt-2 border-t border-white/15">
          <div className="flex items-center gap-1.5">
            {AD_CONFIG.sampleAds.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentAdIndex(idx)}
                aria-label={`Slide ${idx + 1}`}
                className={`transition-all duration-300 rounded-full ${
                  idx === currentAdIndex 
                    ? 'w-5 h-1.5 bg-white' 
                    : 'w-1.5 h-1.5 bg-white/40 hover:bg-white/70'
                }`}
              />
            ))}
          </div>
          <button 
            onClick={() => alert(`[Google Test Ad Clicked]\nAd Unit ID: ${AD_CONFIG.bannerAdUnitId}`)}
            className="bg-white text-slate-900 hover:bg-slate-100 text-xs font-bold px-3.5 py-1.5 rounded-xl shadow-xs flex items-center gap-1 transition-transform active:scale-95"
          >
            {ad.cta}
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

  if (type === 'card') {
    return (
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${ad.bgGradient} p-4 text-white shadow-md border border-white/10 ${className}`}>
        {/* Ad Tag Badge */}
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-1.5">
            <span className="bg-amber-400 text-slate-900 text-[10px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
              Ad
            </span>
            <span className="text-[11px] font-medium text-white/80 flex items-center gap-1">
              {ad.sponsor} • <Info className="w-3 h-3 text-white/60" />
            </span>
          </div>
          <button 
            onClick={() => { setDismissed(true); onDismiss?.(); }}
            className="text-white/60 hover:text-white p-1 rounded-full transition-colors"
            title="Hide Ad"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Ad Content */}
        <div className="pr-2">
          <h4 className="font-bold text-sm sm:text-base leading-snug">{ad.title}</h4>
          <p className="text-xs text-white/85 mt-1 leading-relaxed">{ad.description}</p>
        </div>

        {/* CTA & Unit Info */}
        <div className="mt-3 flex items-center justify-between pt-2 border-t border-white/15">
          <div className="flex items-center gap-1">
            {AD_CONFIG.sampleAds.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentAdIndex(idx)}
                className={`transition-all rounded-full ${
                  idx === currentAdIndex 
                    ? 'w-4 h-1.5 bg-white' 
                    : 'w-1.5 h-1.5 bg-white/40 hover:bg-white/70'
                }`}
              />
            ))}
          </div>
          <button 
            onClick={() => alert(`[Test Ad Clicked]\nUnit ID: ${AD_CONFIG.bannerAdUnitId}\nThis is a Google AdMob Test Ad simulation.`)}
            className="bg-white text-slate-900 hover:bg-slate-100 text-xs font-bold px-3 py-1.5 rounded-xl shadow-xs flex items-center gap-1 transition-transform active:scale-95"
          >
            {ad.cta}
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

  // Standard Inline/Bottom Mobile Banner Ad
  return (
    <div className={`w-full bg-slate-900 border-y sm:border sm:rounded-xl border-slate-800 p-2.5 shadow-sm text-slate-100 ${className}`}>
      <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="flex flex-col items-center justify-center shrink-0">
            <span className="bg-amber-400 text-slate-950 font-black text-[9px] px-1 py-0.2 rounded uppercase">
              Ad
            </span>
            <span className="text-[8px] text-slate-400 mt-0.5 font-mono">
              Test
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="font-bold text-xs truncate text-white">{ad.title}</p>
              <span className="text-[10px] text-slate-400 hidden sm:inline">• {ad.sponsor}</span>
            </div>
            <p className="text-[11px] text-slate-300 truncate">{ad.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button 
            onClick={() => alert(`[Google Test Ad Clicked]\nAd Unit ID: ${AD_CONFIG.bannerAdUnitId}`)}
            className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs px-3 py-1.5 rounded-lg transition-transform active:scale-95"
          >
            {ad.cta}
          </button>
          <button 
            onClick={() => { setDismissed(true); onDismiss?.(); }}
            className="text-slate-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
