import React from 'react';
import { ShieldAlert, Lock, X, LogIn, ExternalLink, User } from 'lucide-react';
import { SUPER_ADMIN_EMAIL, isSuperAdminEmail } from '../../utils/authPermissions';
import { soundEngine } from '../../utils/audioSynth';
import { signInWithPopup, auth, googleProvider, signOut } from '../../lib/firebase';
import { Language } from '../../types/mafia';

interface AdminAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  featureName?: string;
  language: Language;
  onSuccess?: () => void;
}

export const AdminAccessModal: React.FC<AdminAccessModalProps> = ({
  isOpen,
  onClose,
  featureName,
  language,
  onSuccess
}) => {
  if (!isOpen) return null;

  const isEn = language === 'en';
  const currentUser = auth.currentUser;

  const handleSignIn = async () => {
    try {
      soundEngine.playTick();
      const res = await signInWithPopup(auth, googleProvider);
      if (res.user && isSuperAdminEmail(res.user.email)) {
        onClose();
        if (onSuccess) onSuccess();
      } else {
        onClose();
      }
    } catch (err) {
      console.error('Google sign-in failed:', err);
    }
  };

  const handleSwitchAccount = async () => {
    try {
      soundEngine.playTick();
      await signOut(auth);
      const res = await signInWithPopup(auth, googleProvider);
      if (res.user && isSuperAdminEmail(res.user.email)) {
        onClose();
        if (onSuccess) onSuccess();
      } else {
        onClose();
      }
    } catch (err) {
      console.error('Account switch failed:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-150">
      <div 
        className="relative w-full max-w-md bg-[#0a0b10] border-2 border-rose-600/40 rounded-3xl p-6 sm:p-7 shadow-2xl shadow-rose-950/60 overflow-hidden text-right font-sans"
        dir={isEn ? 'ltr' : 'rtl'}
      >
        {/* Subtle Classified Red Laser Line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-rose-500 to-transparent" />
        
        {/* Top Header Badge */}
        <div className="flex items-center justify-between mb-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-[10px] font-mono tracking-wider font-black text-rose-400 uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
            <span>TOP SECRET // CLASSIFIED DOSSIER</span>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Secret Agent Icon & Title */}
        <div className="flex items-start gap-4 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0 shadow-lg shadow-rose-500/10">
            <ShieldAlert className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-black text-white leading-snug">
              {isEn ? 'Restricted Access: Super Admin Only' : 'سطح دسترسی محرمانه: ویژه مدیر ارشد'}
            </h3>
            {featureName && (
              <p className="text-xs text-rose-400/90 font-bold mt-0.5">
                {isEn ? `Module: ${featureName}` : `بخش: ${featureName}`}
              </p>
            )}
          </div>
        </div>

        {/* Explanation Message */}
        <div className="p-4 rounded-2xl bg-[#11121c] border border-white/5 space-y-2.5 mb-5 text-xs text-slate-300 leading-relaxed">
          <p>
            {isEn 
              ? 'Results of test suites, test benchmarks, and game content management are strictly restricted to the official developer account:'
              : 'مشاهده نتایج تست‌ها، بنچمارک‌های اعتبارسنجی و مدیریت محتوای سناریوها منحصراً برای اکانت مدیر ارشد تعریف شده است:'}
          </p>
          <div className="p-2.5 rounded-xl bg-black/60 border border-amber-500/30 font-mono font-bold text-amber-300 flex items-center justify-between text-xs" dir="ltr">
            <span>{SUPER_ADMIN_EMAIL}</span>
            <Lock className="w-3.5 h-3.5 text-amber-400" />
          </div>

          {currentUser ? (
            <div className="pt-1 text-[11px] text-slate-400 flex items-center gap-1.5">
              <span>{isEn ? 'Current signed in as:' : 'حساب فعال شما:'}</span>
              <span className="font-mono text-slate-200 font-bold" dir="ltr">{currentUser.email || 'ناشناس'}</span>
            </div>
          ) : (
            <div className="pt-1 text-[11px] text-slate-400">
              {isEn ? 'You are currently not signed in.' : 'در حال حاضر هیچ حسابی به سیستم متصل نیست.'}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="space-y-2">
          {!currentUser ? (
            <button
              onClick={handleSignIn}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 via-rose-500 to-amber-500 hover:from-amber-400 hover:to-rose-400 text-black font-black text-xs flex items-center justify-center gap-2 shadow-xl shadow-rose-950/40 transition-all cursor-pointer active:scale-95"
            >
              <LogIn className="w-4 h-4" />
              <span>{isEn ? 'Sign in with Google' : 'ورود با حساب گوگل'}</span>
            </button>
          ) : (
            <button
              onClick={handleSwitchAccount}
              className="w-full py-3.5 px-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-xl shadow-rose-950/40 transition-all cursor-pointer active:scale-95"
            >
              <User className="w-4 h-4" />
              <span>{isEn ? 'Switch to Authorized Account' : 'تغییر به حساب مدیر ارشد'}</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white font-bold text-xs transition-colors cursor-pointer"
          >
            {isEn ? 'Cancel' : 'انصراف'}
          </button>
        </div>
      </div>
    </div>
  );
};
