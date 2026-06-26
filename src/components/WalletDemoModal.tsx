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

interface WalletDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  driverName?: string;
}

export default function WalletDemoModal({ isOpen, onClose, driverName = "Karak Jan" }: WalletDemoModalProps) {
  // Current values state for active simulation
  const [walletBalance, setWalletBalance] = useState<number>(500); // Free Rs. 500 starting bonus
  const [totalProfit, setTotalProfit] = useState<number>(12800); // total earned so far
  const [monthlyProfit, setMonthlyProfit] = useState<number>(5400); // monthly earned
  const [selectedProfitView, setSelectedProfitView] = useState<'total' | 'monthly'>('total');
  const [flatFeeDues, setFlatFeeDues] = useState<number>(500); // monthly app & db flat fee
  const [paidFeeAmount, setPaidFeeAmount] = useState<number>(0);
  const [feeNotice, setFeeNotice] = useState<string>('');
  
  // Simulated stats
  const [completedRidesCount, setCompletedRidesCount] = useState<number>(42);
  const [transactions, setTransactions] = useState<Array<{
    id: string;
    type: 'recharge' | 'deduction' | 'bonus';
    amount: number;
    title: string;
    date: string;
    status: 'success' | 'pending';
  }>>([
    { id: '1', type: 'bonus', amount: 500, title: 'Welcome Loyalty Gift Pass 🎁', date: 'Aaj, 09:00 AM', status: 'success' },
    { id: '2', type: 'deduction', amount: 25, title: 'Karak to Latamber Ride Cut (5%)', date: 'Kal, 06:15 PM', status: 'success' },
    { id: '3', type: 'recharge', amount: 300, title: 'Recharge via Easypaisa', date: 'Kal, 11:32 AM', status: 'success' },
    { id: '4', type: 'deduction', amount: 30, title: 'Karak to Latamber Ride Cut (5%)', date: '2 Din Pehle', status: 'success' },
  ]);

  // Sub-views in page
  const [activeTab, setActiveTab] = useState<'wallet' | 'guide'>('wallet');
  const [showRechargeDialog, setShowRechargeDialog] = useState<boolean>(false);
  const [rechargeAmount, setRechargeAmount] = useState<string>('200');
  const [selectedMethod, setSelectedMethod] = useState<'easypaisa' | 'jazzcash' | 'nayapay' | 'bank'>('easypaisa');
  const [rechargeMobileNum, setRechargeMobileNum] = useState<string>('03331234567');
  const [selectedBank, setSelectedBank] = useState<string>('meezan');
  const [bankReceiptUploaded, setBankReceiptUploaded] = useState<boolean>(false);
  const [txnReferenceId, setTxnReferenceId] = useState<string>('');
  const [rechargeSuccess, setRechargeSuccess] = useState<boolean>(false);
  const [copiedText, setCopiedText] = useState<string>('');

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
  const handleRechargeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(rechargeAmount);
    if (isNaN(amountNum) || amountNum <= 0) return;

    setRechargeSuccess(true);
    setTimeout(() => {
      setWalletBalance(prev => prev + amountNum);
      const gatewayLabel = 
        selectedMethod === 'easypaisa' ? 'Easypaisa' : 
        selectedMethod === 'jazzcash' ? 'JazzCash' : 
        selectedMethod === 'nayapay' ? 'NayaPay' : 'Bank Transfer';
      
      const newTx = {
        id: Date.now().toString(),
        type: 'recharge' as const,
        amount: amountNum,
        title: `Recharge via ${gatewayLabel}`,
        date: 'Abhi abhi',
        status: 'success' as const
      };
      setTransactions(prev => [newTx, ...prev]);
      setShowRechargeDialog(false);
      setRechargeSuccess(false);
      setTxnReferenceId('');
      setBankReceiptUploaded(false);
      triggerConfetti();
    }, 1800);
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
                <span>Current Pass Credit Balance</span>
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
                  <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Monthly Flat Fee</span>
                  <span className="text-lg font-black text-slate-800 mt-1">Rs. 500 PKR</span>
                </div>
                <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-100 flex flex-col justify-between">
                  <span className="text-[11px] font-black text-emerald-600 uppercase tracking-wider">Paid This Month</span>
                  <span className="text-lg font-black text-emerald-900 mt-1">Rs. {paidFeeAmount} PKR</span>
                </div>
                <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-100 flex flex-col justify-between">
                  <span className="text-[11px] font-black text-amber-700 uppercase tracking-wider">Remaining Dues</span>
                  <span className="text-lg font-black text-amber-900 mt-1">Rs. {flatFeeDues} PKR</span>
                </div>
              </div>

              {flatFeeDues > 0 ? (
                <div className="pt-2 flex flex-col sm:flex-row gap-3">
                  <Button 
                    onClick={() => handlePayCompanyFlatFee(100)}
                    className="flex-1 py-4 rounded-2xl text-xs sm:text-sm font-black text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 flex items-center justify-center gap-2"
                  >
                    Pay Rs. 100 Qist (Installment)
                  </Button>
                  <Button 
                    onClick={() => handlePayCompanyFlatFee(flatFeeDues)}
                    className="flex-1 py-4 rounded-2xl text-xs sm:text-sm font-black text-white bg-slate-900 hover:bg-slate-800 shadow-md border-none flex items-center justify-center gap-2"
                  >
                    Transfer Full Rs. {flatFeeDues} to Company
                    <ArrowRight className="w-4 h-4" />
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

                <form onSubmit={handleRechargeSubmit} className="space-y-5">
                  
                  {/* Select Channel */}
                  <div className="space-y-2.5">
                    <label className="text-[11px] font-black uppercase text-slate-400 block">Select Gateway Payment Channel</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                      <button
                        type="button"
                        onClick={() => setSelectedMethod('bank')}
                        className={`py-3 px-1.5 rounded-xl text-[11px] font-black border transition-all flex items-center justify-center gap-1.5 ${selectedMethod === 'bank' ? 'bg-violet-50 border-violet-400 text-violet-700 font-bold shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                      >
                        <Building2 className="w-3.5 h-3.5" />
                        Bank Account
                      </button>
                    </div>
                  </div>

                  {/* Predefined Amounts & Custom Choice Box */}
                  <div className="space-y-3">
                    <label className="text-[11px] font-black uppercase text-slate-400 block">Choose or Enter Recharge Amount</label>
                    <div className="grid grid-cols-3 gap-2">
                      {['100', '200', '500'].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setRechargeAmount(amt)}
                          className={`py-2 rounded-xl text-xs font-black border transition-all ${rechargeAmount === amt ? 'bg-blue-600 border-blue-600 text-white font-extrabold' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                        >
                          Rs. {amt}
                        </button>
                      ))}
                    </div>

                    <div className="relative mt-2">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <span className="text-slate-400 text-xs font-bold font-mono">Rs.</span>
                      </div>
                      <input
                        type="number"
                        value={rechargeAmount}
                        onChange={(e) => setRechargeAmount(e.target.value)}
                        placeholder="Apni marzi ka amount likhein (e.g. 150, 1000)"
                        className="w-full text-xs font-black pl-10 pr-3.5 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-500 font-sans shadow-inner shrink-0"
                        min="1"
                        required
                      />
                    </div>
                  </div>

                  {/* conditional options for bank transfer vs mobile wallets */}
                  {selectedMethod === 'bank' ? (
                    <div className="bg-slate-50 p-4.5 rounded-2xl border border-slate-200 space-y-4">
                      <div className="text-xs font-bold text-slate-500 leading-snug">
                        Apne EasyTravel Digital Wallet me balance jama karne ke liye niche diye gae Escrow Account me transfer karein:
                      </div>
                      
                      <div className="space-y-3 bg-white p-3.5 rounded-xl border border-slate-100 text-xs text-slate-700 font-mono">
                        <div className="flex justify-between items-center">
                          <span>Bank: <strong>Meezan Bank Ltd</strong></span>
                        </div>
                        <div className="flex justify-between items-center border-t border-slate-50 pt-2">
                          <span>Account: <strong>1234-5678-9101-23</strong></span>
                          <button 
                            type="button" 
                            onClick={() => handleCopyText('1234-5678-9101-23', 'acc')}
                            className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800"
                          >
                            {copiedText === 'acc' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <div className="flex justify-between items-center border-t border-slate-50 pt-2">
                          <span>Title: <strong>EasyTravel Private Ltd</strong></span>
                        </div>
                        <div className="flex justify-between items-center border-t border-slate-50 pt-2 font-sans font-bold text-slate-500 text-[10px]">
                          <span>IBAN: PK64MEZN000123456789101</span>
                          <button 
                            type="button" 
                            onClick={() => handleCopyText('PK64MEZN000123456789101', 'iban')}
                            className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800"
                          >
                            {copiedText === 'iban' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {/* Manual verification upload simulate */}
                      <div className="space-y-2">
                        <label className="text-[11px] font-black uppercase text-slate-400 block">Transfer verification info</label>
                        <input 
                          type="text" 
                          placeholder="Transaction Receipt ID (TID / Reference) likhein"
                          value={txnReferenceId}
                          onChange={(e) => setTxnReferenceId(e.target.value)}
                          className="w-full text-xs font-black p-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 font-mono"
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

                      <div className="text-[10px] bg-amber-50 text-amber-800 p-3 rounded-xl border border-amber-200 font-sans leading-relaxed font-semibold">
                        🔒 <strong>Polices Advice:</strong> Manual Bank Transfer ke zariye <strong>kisi kisam ki direct debit approval, banking policy restrictions ya security signature issues</strong> pesh nahi aate! Driver asani se transfer karta hai aur hamara system check kar ke background active approve karta hai.
                      </div>
                    </div>
                  ) : (
                    /* Custom Number Input for Mobile Wallets */
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-black uppercase text-slate-400 block">Mobile Wallet Account Phone Number</label>
                      <input 
                        type="tel" 
                        value={rechargeMobileNum}
                        onChange={(e) => setRechargeMobileNum(e.target.value)}
                        placeholder="03xxxxxxxxxx"
                        className="w-full text-xs font-black p-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-500 font-mono tracking-wider" 
                        required
                      />
                    </div>
                  )}

                  {/* Submission and loading indicator */}
                  <div className="pt-2">
                    <Button
                      type="submit"
                      disabled={rechargeSuccess}
                      className="w-full py-5 rounded-2xl font-bold text-xs sm:text-sm text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 border-none flex items-center justify-center gap-2 h-10 cursor-pointer shadow-md disabled:opacity-50"
                    >
                      {rechargeSuccess ? (
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Processing Transaction Pin...
                        </span>
                      ) : (
                        `Confirm Recharge of Rs. ${rechargeAmount}`
                      )}
                    </Button>
                  </div>

                  <p className="text-[9.5px] text-slate-400 text-center font-medium leading-normal">
                    🔒 SSL Secure Demo Sandbox. Real money will not be collected or altered during this preview session.
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

