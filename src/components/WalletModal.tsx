import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Wallet, 
  TrendingUp, 
  DollarSign, 
  PlusCircle, 
  ArrowUpRight, 
  ArrowLeft,
  X, 
  CheckCircle2, 
  CreditCard, 
  ArrowRight, 
  Sparkles, 
  Info, 
  ShieldCheck, 
  Zap, 
  Play, 
  ChevronRight,
  Clock,
  Briefcase,
  AlertTriangle,
  Building2,
  Copy,
  Check
} from 'lucide-react';
import confetti from 'canvas-confetti';

import { UserProfile } from '../types';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc, onSnapshot, query, where, orderBy } from 'firebase/firestore';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  driverName?: string;
  profile?: UserProfile;
}

export default function WalletModal({ isOpen, onClose, driverName = "Karak Jan", profile }: WalletModalProps) {
  // Current values state for active user
  const [walletBalance, setWalletBalance] = useState<number>(0); 

  useEffect(() => {
    if (profile && (profile as any).walletBalance !== undefined) {
      setWalletBalance((profile as any).walletBalance);
    }
  }, [profile]);

  const [totalProfit, setTotalProfit] = useState<number>(0); 
  const [monthlyProfit, setMonthlyProfit] = useState<number>(0); 
  const [selectedProfitView, setSelectedProfitView] = useState<'total' | 'monthly'>('total');
  const [flatFeeDues, setFlatFeeDues] = useState<number>(500); // monthly app & db flat fee
  const [paidFeeAmount, setPaidFeeAmount] = useState<number>(0);
  const [feeNotice, setFeeNotice] = useState<string>('');
  
  // Real stats can be implemented later
  const [completedRidesCount, setCompletedRidesCount] = useState<number>(0);
  const [transactions, setTransactions] = useState<Array<{
    id: string;
    type: 'recharge' | 'deduction' | 'bonus';
    amount: number;
    title: string;
    date: string;
    status: 'success' | 'pending';
  }>>([]);

  // Sub-views in page
  const [activeTab, setActiveTab] = useState<'wallet' | 'guide'>('wallet');
  const [showRechargeDialog, setShowRechargeDialog] = useState<boolean>(false);
  const [rechargeAmount, setRechargeAmount] = useState<string>('');
  const [selectedMethod, setSelectedMethod] = useState<'easypaisa' | 'jazzcash' | 'nayapay'>('easypaisa');
  const [rechargeMobileNum, setRechargeMobileNum] = useState<string>('03331234567');
  const [selectedBank, setSelectedBank] = useState<string>('meezan');
  const [bankReceiptUploaded, setBankReceiptUploaded] = useState<boolean>(false);
  const [txnReferenceId, setTxnReferenceId] = useState<string>('');
  const [rechargeSuccess, setRechargeSuccess] = useState<boolean>(false);
  const [isWaitingForPin, setIsWaitingForPin] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(60);
  const [copiedText, setCopiedText] = useState<string>('');

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isWaitingForPin && countdown > 0) {
      timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [isWaitingForPin, countdown]);

  const triggerConfetti = () => {
    confetti({
      particleCount: 120,
      spread: 70,
      origin: { y: 0.6 }
    });
  };

  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(''), 2000);
  };

  const handlePayCompanyFlatFee = (amount: number) => {
    if (walletBalance < amount) {
      setFeeNotice("⚠️ Wallet balance nakafi hai! Pehle Fauri Recharge se wallet me amount add karein.");
      setTimeout(() => setFeeNotice(''), 4500);
      return;
    }
    setWalletBalance(prev => prev - amount);
    setPaidFeeAmount(prev => prev + amount);
    setFlatFeeDues(prev => Math.max(0, prev - amount));
    setFeeNotice(`✅ Rs. ${amount} successfully transferred from your EasyTravel Wallet to Company Account!`);
    setTimeout(() => setFeeNotice(''), 4500);
    triggerConfetti();
  };

  // Quick recharge logic
  const handleRechargeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(rechargeAmount);
    if (isNaN(amountNum) || amountNum <= 0) return;
    if (!profile) return; // User must be logged in

    setRechargeSuccess(true);
    
    try {
      const gatewayLabel = selectedMethod === 'easypaisa' ? 'Easypaisa' : 
        selectedMethod === 'jazzcash' ? 'JazzCash' : 'NayaPay';

      // Submit payment request
      await addDoc(collection(db, 'paymentRequests'), {
        userId: profile.uid,
        userDisplayName: profile.displayName || 'Unknown User',
        userEmail: profile.email || '',
        amount: amountNum,
        method: gatewayLabel,
        txnId: txnReferenceId,
        status: 'pending',
        timestamp: serverTimestamp()
      });

      // Admin Notification
      await addDoc(collection(db, 'notifications'), {
        userId: 'admin', // target role
        title: 'New Recharge Request',
        body: `${profile.displayName} ne Rs. ${amountNum} ka recharge request bheja hai via ${gatewayLabel}.`,
        read: false,
        timestamp: serverTimestamp(),
        type: 'payment'
      });

      setShowRechargeDialog(false);
      setRechargeSuccess(false);
      setTxnReferenceId('');
      setBankReceiptUploaded(false);
      
      // Instead of direct balance add, we show success modal or alert
      alert('Aapki recharge request Admin ko bhej di gayi hai. Approve hone par balance add ho jayega.');

    } catch (error) {
      console.error("Error submitting recharge:", error);
      alert('Koi error aagaya, please dubara try karein.');
      setRechargeSuccess(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-50 w-full h-full overflow-y-auto">
      <div className="w-full max-w-2xl mx-auto flex flex-col min-h-screen bg-slate-50 shadow-xl border-x border-slate-200">
        
        {/* Header Section */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 md:p-8 text-white relative space-y-4">
          <div className="flex items-center justify-between">
            <button 
              onClick={onClose}
              className="w-9 h-9 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors cursor-pointer shadow-sm active:scale-95"
              title="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md">
              <Wallet className="w-7 h-7 text-emerald-300" />
            </div>
            <div>
              <h3 className="text-2xl font-black tracking-tight">{driverName}'s EasyWallet</h3>
              <p className="text-xs text-blue-100 font-medium">Payment & Balance Ecosystem</p>
            </div>
          </div>
        </div>

        {/* Wallet Content Area */}
        <div className="p-6 md:p-8 space-y-6 flex-1 text-slate-800">
          <div className="space-y-6">
            
            {/* CURRENT BALANCE VIEW CARD */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6 relative overflow-hidden">
              <div className="absolute right-0 top-0 w-32 h-32 bg-emerald-100/10 rounded-full -mr-10 -mt-10 pointer-events-none" />
              
              <div className="flex justify-between items-center text-slate-500 text-xs font-bold uppercase tracking-wider">
                <div className="flex flex-col">
                  <span className="text-sm">Paid This Month</span>
                  <span className="text-[10px] normal-case font-semibold tracking-normal mt-0.5">(Es Mahinay adaa ki gae Raqam)</span>
                </div>
              </div>

              <div className="flex items-baseline gap-1">
                <span className="text-5xl font-black text-slate-900 tracking-tight">Rs. {walletBalance}</span>
                <span className="text-slate-500 font-bold text-sm">PKR</span>
              </div>

              {/* Quick actions inside card */}
              <div className="pt-2 flex gap-3">
                <Button 
                  onClick={() => setShowRechargeDialog(true)}
                  className="flex-1 py-4.5 rounded-2xl text-xs sm:text-sm font-black text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-md border-none flex items-center justify-center gap-2 transition-all hover:shadow-lg hover:scale-[1.01]"
                >
                  <PlusCircle className="w-5 h-5" />
                  Fauri Recharge
                </Button>
              </div>
            </div>

            {/* ESCROW WALLET & FLAT FEE ENGINE */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-5">
              {feeNotice && (
                <div className="p-3.5 rounded-2xl bg-blue-50 text-blue-800 text-xs font-bold border border-blue-200">
                  {feeNotice}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col justify-between">
                  <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Mahaana Raqam</span>
                  <span className="text-lg font-black text-slate-800 mt-1">Rs. 500 PKR</span>
                </div>
                <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-100 flex flex-col justify-between">
                  <span className="text-[11px] font-black text-emerald-600 uppercase tracking-wider">Adaa ki gae Raqam</span>
                  <span className="text-lg font-black text-emerald-900 mt-1">Rs. {paidFeeAmount} PKR</span>
                </div>
                <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-100 flex flex-col justify-between">
                  <span className="text-[11px] font-black text-amber-700 uppercase tracking-wider">Baqaaya Raqam</span>
                  <span className="text-lg font-black text-amber-900 mt-1">Rs. {flatFeeDues} PKR</span>
                </div>
              </div>

              {flatFeeDues > 0 ? (
                <div className="pt-2 flex flex-col gap-3">
                  <Button 
                    onClick={() => setShowRechargeDialog(true)}
                    className="flex-1 py-4.5 rounded-2xl text-xs sm:text-sm font-black text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-md border-none flex items-center justify-center gap-2 transition-all hover:shadow-lg hover:scale-[1.01]"
                  >
                    <PlusCircle className="w-5 h-5" />
                    Fauri Recharge
                  </Button>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-emerald-500 text-white text-xs sm:text-sm font-black flex items-center gap-2.5 shadow-sm">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <span>Is mahine ki Flat Fee mukammal ada ho chuki hai. Aapke Wallet ka saara extra balance aapke istemal ke liye safe hai!</span>
                </div>
              )}
            </div>

            {/* Company Policy Status Greeting */}
            <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-3xl flex items-start gap-4 shadow-xs">
              <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <h4 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">Aap ka Apna Platform</h4>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium">
                  Taarikh me pehli dafa hm aysi Policy introduce kr rahe hain js me Car Owner apni marzi se gaarhi chalaaye aur jetni marzi ho profit kamaaye aur company ko jab dil chahe <strong className="text-emerald-900 font-extrabold">App Maintenance</strong> aur <strong className="text-emerald-900 font-extrabold">Database Charges</strong> k lye amount jama kre, agar paisay nhi hai pas to koi baat nhi, poora mahina profit kamaayen jb dil hua <strong className="text-emerald-900 font-extrabold">Qisto (Installment Rs. 100, 200 etc)</strong> me jama karen aur sukoon k sath EasyTravel k platform se kamaayen, <strong className="text-emerald-900 font-extrabold">QK ye Aap ka Apna Platform hai</strong>.
                </p>
              </div>
            </div>

          </div>
        </div>

        {/* Dynamic Inner Wallet Recharge Modal */}
        <AnimatePresence>
          {showRechargeDialog && (
            <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden p-6 md:p-8 text-slate-800 space-y-6 max-h-[90vh] overflow-y-auto my-auto"
              >
                <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-emerald-600" />
                    <h4 className="text-base font-black">Dynamic Multi-Gateway Recharge</h4>
                  </div>
                  <button 
                    onClick={() => setShowRechargeDialog(false)}
                    className="p-1.5 hover:bg-slate-100 rounded-lg cursor-pointer text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="bg-emerald-50 text-emerald-800 text-xs font-bold p-3.5 rounded-xl border border-emerald-200">
                  Database Charges aur System Maintenance k lye amount jama kren taakeh Poora System smoothly chalta rahay.
                </div>

                <form onSubmit={handleRechargeSubmit} className="space-y-5">
                  
                  {/* Select Channel */}
                  <div className="space-y-2.5">
                    <label className="text-[11px] font-black uppercase text-slate-400 block">Select Gateway Payment Channel</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedMethod('easypaisa')}
                        className={`py-3 px-1.5 rounded-xl text-[11px] font-black border transition-all ${selectedMethod === 'easypaisa' ? 'bg-emerald-50 border-emerald-400 text-emerald-700 font-extrabold shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                      >
                        Easypaisa
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedMethod('jazzcash')}
                        className={`py-3 px-1.5 rounded-xl text-[11px] font-black border transition-all ${selectedMethod === 'jazzcash' ? 'bg-amber-50 border-amber-400 text-amber-800 font-bold shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                      >
                        JazzCash
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedMethod('nayapay')}
                        className={`py-3 px-1.5 rounded-xl text-[11px] font-black border transition-all ${selectedMethod === 'nayapay' ? 'bg-blue-50 border-blue-400 text-blue-700 font-bold shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                      >
                        NayaPay
                      </button>
                    </div>
                  </div>

                  {/* Escrow Account Info Box */}
                  <div className="bg-slate-50 p-4.5 rounded-2xl border border-slate-200 space-y-4 mt-4">
                    <div className="text-xs font-bold text-slate-500 leading-snug">
                      Apne EasyTravel Digital Wallet me balance jama karne ke liye niche diye gae EasyTravel Founder k Account me transfer karein:
                    </div>
                    
                    <div className="space-y-3 bg-white p-3.5 rounded-xl border border-slate-100 text-xs text-slate-700 font-mono">
                      <div className="flex justify-between items-center">
                        <span>Account Type: <strong className="uppercase">{selectedMethod}</strong></span>
                      </div>
                      <div className="flex justify-between items-center border-t border-slate-50 pt-2">
                        <span>Account: <strong>03129214312</strong></span>
                        <button 
                          type="button" 
                          onClick={() => handleCopyText('03129214312', 'acc')}
                          className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800"
                        >
                          {copiedText === 'acc' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <div className="flex justify-between items-center border-t border-slate-50 pt-2">
                        <span>Title: <strong>Munir Ahmad (EasyTravel Founder's Account)</strong></span>
                      </div>
                    </div>

                    {/* Amount Input Box */}
                    <div className="space-y-3">
                      <div className="text-emerald-700 font-bold text-xs bg-emerald-50 p-3 rounded-xl border border-emerald-100 text-center shadow-sm leading-relaxed">
                        Amount Transfer krne k baad apni amount neche box me enter kren aur proceed kren
                      </div>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                          <span className="text-slate-400 text-xs font-bold font-mono">Rs.</span>
                        </div>
                        <input
                          type="number"
                          value={rechargeAmount}
                          onChange={(e) => setRechargeAmount(e.target.value)}
                          placeholder="Enter Your Amount"
                          className="w-full text-xs font-normal pl-10 pr-3.5 py-3 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-500 font-sans shadow-inner shrink-0 text-slate-500"
                          min="1"
                          required
                        />
                      </div>
                    </div>

                    {/* Manual verification upload */}
                    <div className="space-y-2 mt-4">
                      <label className="text-[11px] font-black uppercase text-slate-400 block">Transaction Verification</label>
                      <input 
                        type="text" 
                        placeholder="Transaction ID (TID) yaha paste kren"
                        value={txnReferenceId}
                        onChange={(e) => setTxnReferenceId(e.target.value)}
                        className="w-full text-[10px] sm:text-xs font-black p-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 font-mono"
                        required
                      />

                      <div className="flex items-center gap-2 mt-1">
                        <input 
                          type="checkbox" 
                          id="receipt_check" 
                          checked={bankReceiptUploaded}
                          onChange={(e) => setBankReceiptUploaded(e.target.checked)}
                          className="rounded text-blue-600 cursor-pointer h-4 w-4"
                          required
                        />
                        <label htmlFor="receipt_check" className="text-[11px] text-slate-500 font-bold cursor-pointer select-none">
                          Maine safe mobile app se paise transfer kar diye hain.
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Submission and loading indicator */}
                  <div className="pt-2">
                    <Button
                      type="submit"
                      disabled={rechargeSuccess || !txnReferenceId || !bankReceiptUploaded || !rechargeAmount || parseFloat(rechargeAmount) <= 0}
                      className={`w-full py-5 rounded-2xl font-bold text-xs sm:text-sm text-white flex items-center justify-center gap-2 h-10 shadow-md transition-all ${(!txnReferenceId || !bankReceiptUploaded || !rechargeAmount || parseFloat(rechargeAmount) <= 0) ? 'bg-slate-300 opacity-60 cursor-not-allowed' : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 cursor-pointer'}`}
                    >
                      {rechargeSuccess ? (
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Processing Transaction...
                        </span>
                      ) : (
                        `Confirm Recharge${rechargeAmount ? ` of Rs. ${rechargeAmount}` : ''}`
                      )}
                    </Button>
                  </div>

                  <p className="text-[9.5px] text-slate-400 text-center font-medium leading-normal">
                    🔒 SSL Secured Transaction. Aapki payment tafseelat mehfooz hain.
                  </p>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>


      </div>
    </div>
  );
}

// Simple internal Button fallback logic styled beautifully with Tailwind to match system
function Button({ children, onClick, className = "", type = "button", disabled = false }: {
  children: React.ReactNode;
  onClick?: (e: any) => void;
  className?: string;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2.5 font-black transition-all cursor-pointer active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  );
}

