import { useState } from 'react';
import { motion } from 'motion/react';
import { X, Smartphone, Share2, PlusSquare, MoreVertical, Info, Chrome, Compass, ArrowRight } from 'lucide-react';

interface InstallGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function InstallGuideModal({ isOpen, onClose }: InstallGuideModalProps) {
  const [activeTab, setActiveTab] = useState<'android' | 'ios'>('android');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
      />

      {/* Modal Card */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ type: "spring", duration: 0.5 }}
        className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl border border-slate-100 dark:border-slate-800 z-10"
      >
        {/* Header */}
        <div className="bg-linear-to-r from-blue-600 to-indigo-600 p-6 text-white relative">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-all"
          >
            <X className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2.5 rounded-2xl">
              <Smartphone className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight">EasyTravel Install Karein</h3>
              <p className="text-white/80 text-xs mt-0.5">App ko apne phone ki home screen par lagayen</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Why message */}
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-3 mb-6">
            <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-800 leading-relaxed">
              <span className="font-extrabold block mb-1">Malaal ki koi baat nahi!</span>
              Agar aapne haal hi mein app ko uninstall kiya hai, to Chrome automatic install notification ko thodi dair ke liye rok deta hai. Lekin aap niche diye gaye aasan tariqay se 10 second mein app install kar sakte hain!
            </div>
          </div>

          {/* Device Tabs */}
          <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-1.5 mb-6">
            <button
              onClick={() => setActiveTab('android')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-black transition-all ${
                activeTab === 'android' 
                  ? 'bg-white text-slate-900 shadow-xs' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Chrome className="w-4 h-4 text-amber-500" />
              <span>Android / Chrome</span>
            </button>
            <button
              onClick={() => setActiveTab('ios')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-black transition-all ${
                activeTab === 'ios'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Compass className="w-4 h-4 text-blue-500" />
              <span>iPhone / Safari</span>
            </button>
          </div>

          {/* Instructions */}
          {activeTab === 'android' ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="bg-amber-100 text-amber-800 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                  1
                </div>
                <div className="text-xs text-slate-700 leading-relaxed">
                  Apne Google Chrome browser ke top-right corner mein <span className="font-bold inline-flex items-center gap-0.5 bg-slate-100 px-1.5 py-0.5 rounded text-slate-950"><MoreVertical className="w-3 h-3 inline" /> 3 dots</span> menu button ko dabayen.
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="bg-amber-100 text-amber-800 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                  2
                </div>
                <div className="text-xs text-slate-700 leading-relaxed">
                  Khulne wale menu mein se <span className="font-bold text-slate-950 bg-slate-100 px-1.5 py-0.5 rounded">"Install app"</span> ya <span className="font-bold text-slate-950 bg-slate-100 px-1.5 py-0.5 rounded">"Add to Home screen"</span> select karein.
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="bg-amber-100 text-amber-800 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                  3
                </div>
                <div className="text-xs text-slate-700 leading-relaxed">
                  Screen par Confirmation popup aane par dobara <span className="font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">"Install"</span> par click karein. Aap ki khubsoorat EasyTravel app install ho jayegi!
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="bg-blue-100 text-blue-800 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                  1
                </div>
                <div className="text-xs text-slate-700 leading-relaxed">
                  Apne Safari browser ke bottom tools menu mein se <span className="font-bold inline-flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded text-slate-950"><Share2 className="w-3.5 h-3.5 inline text-blue-500" /> Share</span> button ko tap karein.
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="bg-blue-100 text-blue-800 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                  2
                </div>
                <div className="text-xs text-slate-700 leading-relaxed">
                  Options ki list mein thoda niche scroll karein aur <span className="font-bold inline-flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded text-slate-950"><PlusSquare className="w-3.5 h-3.5 inline text-slate-700" /> "Add to Home Screen"</span> option ko dabayen.
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="bg-blue-100 text-blue-800 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                  3
                </div>
                <div className="text-xs text-slate-700 leading-relaxed">
                  Top-right corner mein <span className="font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">"Add"</span> par tap karein. App aapki screen par install ho jayegi!
                </div>
              </div>
            </div>
          )}

          {/* Close button */}
          <div className="mt-8">
            <button
              onClick={onClose}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-black py-3 rounded-2xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Theek Hai, Samajh Gaya!</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
