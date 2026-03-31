import React from 'react';
import { GraduationCap, Globe, LogOut } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { User as FirebaseUser } from 'firebase/auth';

interface AuthProps {
  authMode: 'login' | 'signup';
  setAuthMode: (mode: 'login' | 'signup') => void;
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  authError: string | null;
  isSigningIn: boolean;
  handleSignIn: () => void;
  handleEmailAuth: () => void;
  user: FirebaseUser | null;
  handleSetName: (name: string) => void;
  handleSignOut: () => void;
  userProfile: any; // Using any for now to avoid complex type imports
  isCheckingProfile: boolean;
}

export const AuthView: React.FC<AuthProps> = ({
  authMode, setAuthMode, email, setEmail, password, setPassword, authError, isSigningIn, handleSignIn, handleEmailAuth, user, handleSetName, handleSignOut, userProfile, isCheckingProfile
}) => {
  if (isCheckingProfile || isSigningIn) {
    return (
      <div className="space-y-6 text-center py-12">
        <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mx-auto" />
        <p className="text-slate-500 dark:text-white/50 font-medium animate-pulse">Authorizing...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-8">
        <div className="flex p-1 bg-slate-200 dark:bg-white/5 rounded-2xl">
          <button 
            onClick={() => setAuthMode('login')}
            className={cn(
              "flex-1 py-2.5 text-sm font-bold rounded-xl transition-all",
              authMode === 'login' ? "bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/60"
            )}
          >
            Log In
          </button>
          <button 
            onClick={() => setAuthMode('signup')}
            className={cn(
              "flex-1 py-2.5 text-sm font-bold rounded-xl transition-all",
              authMode === 'signup' ? "bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/60"
            )}
          >
            Sign Up
          </button>
        </div>

        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {authMode === 'login' ? "Welcome Back" : "Create Account"}
          </h2>
          <p className="text-slate-500 dark:text-white/50 text-sm leading-relaxed">
            {authMode === 'login' 
              ? "Access your teacher dashboard and continue your grading journey." 
              : "Join thousands of teachers automating their grading with GradeAI.pro."}
          </p>
        </div>
        
        <div className="space-y-4">
          <button
            disabled={isSigningIn}
            onClick={handleSignIn}
            className={cn(
              "w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10 text-slate-900 dark:text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-sm hover:shadow-md",
              isSigningIn && "opacity-50 cursor-not-allowed"
            )}
          >
            {isSigningIn ? (
              <div className="w-5 h-5 border-2 border-slate-300 dark:border-white/20 border-t-emerald-500 rounded-full animate-spin" />
            ) : (
              <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-sm">
                <Globe size={16} className="text-blue-500" />
              </div>
            )}
            {isSigningIn ? "Processing..." : `Continue with Google`}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-white/10"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-slate-50 dark:bg-[#151515] px-2 text-slate-400 dark:text-white/30">Or continue with</span>
            </div>
          </div>

          <div className="space-y-4">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl py-4 px-4 focus:outline-none focus:border-emerald-500 transition-colors text-slate-900 dark:text-white shadow-sm"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl py-4 px-4 focus:outline-none focus:border-emerald-500 transition-colors text-slate-900 dark:text-white shadow-sm"
            />
            {authError && <p className="text-red-500 text-sm">{authError}</p>}
            <button
              disabled={isSigningIn}
              onClick={handleEmailAuth}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-4 rounded-2xl transition-all shadow-lg shadow-emerald-500/20"
            >
              {isSigningIn ? "Authorizing..." : `Continue with Email`}
            </button>
          </div>
        </div>

        <p className="text-center text-[10px] text-slate-400 dark:text-white/20 uppercase tracking-widest font-bold">
          Secure Authentication
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-medium mb-2 text-slate-900 dark:text-white">One last thing...</h2>
      <p className="text-slate-500 dark:text-white/50 text-sm mb-8">What should we call you? This will be displayed on your dashboard.</p>
      <div className="relative">
        <input
          autoFocus
          type="text"
          placeholder="e.g. Mr. Raj"
          className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl py-4 px-4 focus:outline-none focus:border-emerald-500 transition-colors text-slate-900 dark:text-white shadow-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSetName(e.currentTarget.value);
          }}
        />
      </div>
      <button
        onClick={() => {
          const input = document.querySelector('input') as HTMLInputElement;
          handleSetName(input.value);
        }}
        className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-4 rounded-2xl transition-all shadow-lg shadow-emerald-500/20"
      >
        Continue to Dashboard
      </button>
      <button 
        onClick={handleSignOut}
        className="w-full text-slate-400 dark:text-white/30 text-xs hover:text-slate-600 dark:hover:text-white/60 transition-colors"
      >
        Sign out and use another account
      </button>
    </div>
  );
};
