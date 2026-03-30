import React, { useState, useMemo, useEffect, useRef, Component } from 'react';
import { 
  LayoutDashboard, 
  PlusCircle, 
  BookOpen, 
  GraduationCap, 
  Settings, 
  ChevronRight, 
  ChevronLeft,
  CheckCircle2, 
  AlertCircle, 
  XCircle, 
  Clock, 
  Upload, 
  BarChart3, 
  ArrowLeft,
  ArrowRight,
  Search,
  School,
  Globe,
  User,
  RefreshCw,
  Plus,
  Trash2,
  FileText,
  LogOut,
  Sun,
  Moon,
  Activity,
  Users,
  History,
  Edit2,
  Edit3,
  UserPlus,
  Filter,
  Menu,
  Bug,
  Info,
  UploadCloud,
  Bot,
  Sparkles,
  Loader2,
  Calendar,
  Camera,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip, 
  Legend 
} from 'recharts';
import { format, isAfter, parseISO } from 'date-fns';
import { GoogleGenAI } from "@google/genai";
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  query, 
  where, 
  deleteDoc, 
  updateDoc,
  addDoc,
  getDocFromServer
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { cn } from './lib/utils';
import { 
  PortalType, 
  ClassInfo, 
  Homework, 
  SubjectCategory, 
  Submission, 
  GradeStatus,
  Student
} from './types';

interface UserProfile {
  uid: string;
  name: string;
  email: string;
  portalUrl?: string;
  portalType?: PortalType;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.error.message);
        if (parsed.error) errorMessage = parsed.error;
      } catch (e) {
        errorMessage = this.state.error.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-[#151515] border border-red-500/20 rounded-3xl p-8 shadow-2xl text-center">
            <XCircle className="text-red-500 mx-auto mb-4" size={48} />
            <h2 className="text-xl font-bold mb-2">Application Error</h2>
            <p className="text-white/50 text-sm mb-6">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-white/5 border border-white/10 hover:bg-white/10 text-white font-bold px-6 py-3 rounded-xl transition-all"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const COLORS = {
  perfect: '#10b981', // emerald-500
  inaccurate: '#f59e0b', // amber-500
  wrong: '#ef4444', // red-500
  unattempted: '#64748b', // slate-500
};

// --- AI Service ---
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const isDeadlinePassed = (deadline: string) => {
  return new Date(deadline) <= new Date();
};

async function gradeAnswer(
  homework: Homework, 
  studentAnswer: string,
  studentImageBase64?: string | null,
  studentImageMimeType?: string | null
): Promise<{ status: GradeStatus; feedback: string }> {
  const model = "gemini-3-flash-preview";
  
  let prompt = `
    Grade this student's answer for the homework assignment titled "${homework.title}".
    Category: ${homework.category}
    Description: ${homework.description}
    
    The student's answer text is:
    ${studentAnswer}
    
    You need to evaluate this answer based on the assignment's context. 
    
    ${homework.category === 'technical' ? `
    For technical subjects (Math/Physics), analyze the student's steps and logic. 
    - "perfect": Correct steps and correct final result.
    - "inaccurate": Correct steps but wrong result, or wrong steps but correct result, or minor calculation errors.
    - "wrong": Incorrect steps and incorrect result.
    ` : `
    For paragraph-based subjects (Biology/History), analyze the content for correct context, keywords, and synonyms.
    - "perfect": All necessary keywords/concepts are present, explained correctly, and synonyms are used appropriately.
    - "inaccurate": Some keywords/concepts are missing or explained weakly, or context is incomplete.
    - "wrong": Incorrect context, missing most keywords, or irrelevant content.
    `}
    
    ${homework.hasDiagram && homework.diagramUrl ? `This homework requires diagram analysis. The reference diagram URL is: ${homework.diagramUrl}. If the student provided an image, verify if their drawing matches the reference diagram.` : ''}
    
    Criteria:
    - "perfect": The answer is completely correct and matches the expected solution.
    - "inaccurate": The answer is partially correct, has minor errors, or is missing some context/steps.
    - "wrong": The answer is completely incorrect or irrelevant.
    
    Return JSON: { "status": "perfect" | "inaccurate" | "wrong", "feedback": "brief explanation" }
  `;

  try {
    const contents: any = {
      parts: [
        { text: prompt }
      ]
    };

    if (studentImageBase64 && studentImageMimeType) {
      contents.parts.push({
        inlineData: {
          data: studentImageBase64,
          mimeType: studentImageMimeType
        }
      });
    }

    const response = await ai.models.generateContent({
      model,
      contents,
      config: { responseMimeType: "application/json" }
    });
    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("AI Grading failed:", error);
    return { status: 'wrong', feedback: "Error during AI analysis." };
  }
}

// --- Components ---

export default function AppWrapper() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}


function StudentsView({ students, submissions, homeworks, onDeleteStudent }: { students: Student[], submissions: Submission[], homeworks: Homework[], onDeleteStudent: (id: string) => void }) {
  const [searchQuery, setSearchQuery] = useState('');

  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 dark:text-white/30">
        <Users size={48} className="mb-4" />
        <p className="text-lg font-bold">No entry of students</p>
      </div>
    );
  }

  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.studentId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">All Students</h2>
        <div className="relative w-full sm:w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text"
            placeholder="Search students..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/30 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all shadow-sm"
          />
        </div>
      </div>
      
      {filteredStudents.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-slate-400 dark:text-white/30">
          <p className="text-sm font-bold">No students found matching "{searchQuery}"</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredStudents.map(student => {
            const studentSubmissions = submissions.filter(s => s.studentId === student.id);
            const submissionRate = homeworks.length > 0 ? (studentSubmissions.length / homeworks.length) * 100 : 0;
            return (
              <div key={student.id} className="bg-white dark:bg-white/5 p-4 rounded-2xl border border-slate-200 dark:border-white/10 flex items-center justify-between group">
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">{student.name}</p>
                  <p className="text-xs text-slate-400">ID: {student.studentId}</p>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="font-bold text-emerald-500">{submissionRate.toFixed(1)}%</p>
                    <p className="text-xs text-slate-400">Submission Rate</p>
                  </div>
                  <button 
                    onClick={() => onDeleteStudent(student.id)}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                    title="Remove Student"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CalendarView({ homeworks, selectedDate, setSelectedDate }: { homeworks: Homework[], selectedDate: Date, setSelectedDate: (date: Date) => void }) {
  const [currentMonth, setCurrentMonth] = useState(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  const [showPopup, setShowPopup] = useState(false);
  const [popupDate, setPopupDate] = useState<Date | null>(null);
  const today = new Date();
  
  const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
  const daysInMonth = endOfMonth.getDate();
  const startDay = startOfMonth.getDay();
  
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const emptyDays = Array.from({ length: startDay }, (_, i) => i);

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

  const handleDayClick = (date: Date, dayHomeworks: Homework[]) => {
    setSelectedDate(date);
    if (dayHomeworks.length > 0) {
      setPopupDate(date);
      setShowPopup(true);
    }
  };

  return (
    <div className="space-y-6 relative">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
          {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
        </h2>
        <div className="flex gap-2">
          <button onClick={prevMonth} className="p-2 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10">
            <ChevronLeft size={20} />
          </button>
          <button onClick={nextMonth} className="p-2 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
      <div className="bg-white dark:bg-white/5 p-6 rounded-3xl border border-slate-200 dark:border-white/10">
        <div className="grid grid-cols-7 gap-2 mb-4">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="text-center font-bold text-slate-400 text-xs uppercase">{day}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {emptyDays.map(day => <div key={`empty-${day}`} />)}
          {days.map(day => {
            const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
            const isToday = date.toDateString() === today.toDateString();
            const isSelected = date.toDateString() === selectedDate.toDateString();
            const dayHomeworks = homeworks.filter(hw => {
              const hwDate = new Date(hw.deadline);
              return hwDate.getDate() === date.getDate() && 
                     hwDate.getMonth() === date.getMonth() && 
                     hwDate.getFullYear() === date.getFullYear();
            });

            return (
              <div 
                key={day} 
                onClick={() => handleDayClick(date, dayHomeworks)}
                className={cn(
                  "h-24 rounded-xl p-2 border flex flex-col gap-1 transition-all cursor-pointer hover:scale-[1.02] active:scale-95",
                  isSelected ? "bg-emerald-500/20 border-emerald-500 shadow-sm" :
                  isToday ? "bg-emerald-500/5 border-emerald-500/50" : "bg-slate-50 dark:bg-white/5 border-slate-100 dark:border-white/5 hover:border-emerald-500/30"
                )}
              >
                <span className={cn(
                  "text-sm font-bold w-6 h-6 flex items-center justify-center rounded-full", 
                  isSelected ? "bg-emerald-500 text-black" :
                  isToday ? "text-emerald-600 dark:text-emerald-400" : "text-slate-900 dark:text-white"
                )}>
                  {day}
                </span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {dayHomeworks.map((hw) => (
                    <div key={hw.id} className="w-2 h-2 rounded-full bg-emerald-500" title={hw.title} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {showPopup && popupDate && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPopup(false)}
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 dark:border-white/5 flex justify-between items-center bg-slate-50 dark:bg-white/5">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  {popupDate.toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric' })}
                </h3>
                <button onClick={() => setShowPopup(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full transition-colors">
                  <X size={20} className="text-slate-500 dark:text-white/60" />
                </button>
              </div>
              <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                {homeworks.filter(hw => {
                  const hwDate = new Date(hw.deadline);
                  return hwDate.toDateString() === popupDate.toDateString();
                }).map(hw => (
                  <div key={hw.id} className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-white">{hw.title}</h4>
                        <p className="text-sm text-slate-500 dark:text-white/60 mt-1 line-clamp-2">{hw.description}</p>
                      </div>
                      <span className={cn(
                        "px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider whitespace-nowrap",
                        hw.syncStatus === 'completed' ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
                        hw.syncStatus === 'analyzing' || hw.syncStatus === 'scanning' ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
                        "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                      )}>
                        {hw.syncStatus || 'pending'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function App() {
  const [step, setStep] = useState<'auth' | 'onboarding' | 'dashboard' | 'my-classes' | 'class-details' | 'create-homework' | 'homework-details' | 'grading' | 'timeline' | 'reports' | 'create-class' | 'edit-class' | 'add-student' | 'edit-student' | 'settings' | 'calendar' | 'students'>('auth');
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
  const [portalType, setPortalType] = useState<PortalType>('google-classroom');
  const [portalUrl, setPortalUrl] = useState('');
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedClass, setSelectedClass] = useState<ClassInfo | null>(null);
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedHomework, setSelectedHomework] = useState<Homework | null>(null);
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [isGrading, setIsGrading] = useState(false);
  const [isDraggingQuestion, setIsDraggingQuestion] = useState(false);
  const [isDraggingSolution, setIsDraggingSolution] = useState(false);
  const [isExtractingText, setIsExtractingText] = useState(false);
  const [studentImageBase64, setStudentImageBase64] = useState<string | null>(null);
  const [studentImageMimeType, setStudentImageMimeType] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const isSigningInRef = useRef(isSigningIn);
  useEffect(() => {
    isSigningInRef.current = isSigningIn;
  }, [isSigningIn]);
  const [isCheckingProfile, setIsCheckingProfile] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isEmailAuthMode, setIsEmailAuthMode] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [editingClass, setEditingClass] = useState<ClassInfo | null>(null);
  const [newClassName, setNewClassName] = useState('');
  const [newClassSection, setNewClassSection] = useState('');
  const [newClassTotal, setNewClassTotal] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentId, setNewStudentId] = useState('');
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [showPortalPopup, setShowPortalPopup] = useState(false);
  const [previousStep, setPreviousStep] = useState<string | null>(null);
  const [timelineFilter, setTimelineFilter] = useState<string>('all');
  const [studentSortType, setStudentSortType] = useState<'name-asc' | 'name-desc' | 'ranked'>('name-asc');
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [showWelcomeMessage, setShowWelcomeMessage] = useState(false);
  const [isNewSignIn, setIsNewSignIn] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [classSummary, setClassSummary] = useState<string | null>(null);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date>(new Date());
  const [showProfileDetails, setShowProfileDetails] = useState(false);
  const [modal, setModal] = useState<{
    type: 'prompt' | 'confirm' | 'info' | 'add-student-manual';
    title: string;
    message: string;
    value?: string;
    onConfirm: (val?: string, val2?: string) => void;
    onCancel: () => void;
  } | null>(null);

  useEffect(() => {
    if (isNewSignIn) {
      const timer = setTimeout(() => setIsNewSignIn(false), 10000);
      return () => clearTimeout(timer);
    }
  }, [isNewSignIn]);

  useEffect(() => {
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
  }, []);

  // --- Firebase Auth & Sync ---
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setIsCheckingProfile(true);
      setUser(u);
      if (u) {
        if (!isSigningInRef.current) {
          setIsNewSignIn(false); // Returning user, not a fresh sign-in
          const userDoc = await getDoc(doc(db, 'users', u.uid));
          if (userDoc.exists()) {
            const profile = userDoc.data() as UserProfile;
            setUserProfile(profile);
            setPortalUrl(profile.portalUrl || '');
            setPortalType(profile.portalType || 'google-classroom');
            setStep('dashboard');
          } else {
            setStep('auth');
          }
        }
      } else {
        setStep('auth');
      }
      setIsAuthReady(true);
      setIsCheckingProfile(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const qClasses = query(collection(db, 'classes'), where('teacherUid', '==', user.uid));
    const unsubClasses = onSnapshot(qClasses, (snapshot) => {
      const classList = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as ClassInfo));
      setClasses(classList);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'classes'));

    const qHw = query(collection(db, 'homeworks'), where('teacherUid', '==', user.uid));
    const unsubHw = onSnapshot(qHw, (snapshot) => {
      const hwList = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Homework));
      setHomeworks(hwList);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'homeworks'));

    const qSub = query(collection(db, 'submissions'), where('teacherUid', '==', user.uid));
    const unsubSub = onSnapshot(qSub, (snapshot) => {
      const subList = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Submission));
      setSubmissions(subList);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'submissions'));

    const qStudents = query(collection(db, 'students'), where('teacherUid', '==', user.uid));
    const unsubStudents = onSnapshot(qStudents, (snapshot) => {
      const studentList = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Student));
      setStudents(studentList);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'students'));

    return () => {
      unsubClasses();
      unsubHw();
      unsubSub();
      unsubStudents();
    };
  }, [user]);

  const sortedStudents = useMemo(() => {
    if (!selectedClass) return [];
    let classStudents = students.filter(s => s.classId === selectedClass.id);
    
    if (studentSearchQuery.trim()) {
      const query = studentSearchQuery.toLowerCase();
      classStudents = classStudents.filter(s => s.name.toLowerCase().includes(query) || s.studentId.toLowerCase().includes(query));
    }

    const classHomeworks = homeworks.filter(h => h.classId === selectedClass.id);
    
    const studentStats = classStudents.map(student => {
      const studentSubmissions = submissions.filter(sub => 
        sub.studentId === student.id && 
        classHomeworks.some(h => h.id === sub.homeworkId)
      );
      const submissionRate = classHomeworks.length > 0 ? (studentSubmissions.length / classHomeworks.length) * 100 : 0;
      return { ...student, submissionCount: studentSubmissions.length, submissionRate };
    });

    return [...studentStats].sort((a, b) => {
      if (studentSortType === 'ranked') {
        if (b.submissionRate !== a.submissionRate) {
          return b.submissionRate - a.submissionRate;
        }
        return a.name.localeCompare(b.name);
      } else if (studentSortType === 'name-asc') {
        return a.name.localeCompare(b.name);
      } else if (studentSortType === 'name-desc') {
        return b.name.localeCompare(a.name);
      }
      return 0;
    });
  }, [students, selectedClass, submissions, homeworks, studentSortType, studentSearchQuery]);

  // --- Auth Handlers ---
  const handleEmailAuth = async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    setAuthError(null);
    try {
      if (authMode === 'signup') {
        try {
          const methods = await fetchSignInMethodsForEmail(auth, email);
          if (methods.length > 0) {
            setAuthError("The account already exists. Please log in.");
            setIsSigningIn(false);
            return;
          }
        } catch (e) {
          // Ignore fetchSignInMethodsForEmail errors (e.g. if enumeration protection is on)
        }
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      
      const u = auth.currentUser;
      if (u) {
        const userDoc = await getDoc(doc(db, 'users', u.uid));
        setIsNewSignIn(!userDoc.exists());
        if (!userDoc.exists()) {
          if (authMode === 'login') {
            await signOut(auth);
            setAuthError("Account does not exist. Please sign up.");
            return;
          }
          // New user, wait for handleSetName
        } else {
          if (authMode === 'signup') {
            await signOut(auth);
            setAuthError("The account already exists. Please log in.");
            return;
          }
          const profile = userDoc.data() as UserProfile;
          setUserProfile(profile);
          setPortalUrl(profile.portalUrl || '');
          setPortalType(profile.portalType || 'google-classroom');
          setStep('dashboard');
        }
      }
    } catch (error: any) {
      if (error.code === 'auth/email-already-in-use') {
        setAuthError("The account already exists. Please log in.");
      } else if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        setAuthError("Invalid email or password. Please try again or sign up.");
      } else {
        setAuthError(error.message);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleConnectGoogleClassroom = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/classroom.courses.readonly');
      provider.addScope('https://www.googleapis.com/auth/classroom.rosters.readonly');
      provider.addScope('https://www.googleapis.com/auth/classroom.coursework.students.readonly');
      
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;
      
      if (token) {
        localStorage.setItem('google_classroom_token', token);
        setPortalUrl('Google Classroom (Connected)');
        await updateDoc(doc(db, 'users', user!.uid), {
          portalType: 'google-classroom',
          portalUrl: 'Google Classroom (Connected)'
        });
        setModal({
          type: 'confirm',
          title: 'Connected!',
          message: 'Successfully connected to Google Classroom API.',
          onConfirm: () => setModal(null),
          onCancel: () => setModal(null)
        });
      }
    } catch (error: any) {
      console.error("Error connecting to Google Classroom:", error);
      
      if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        // User closed the popup, no need to show an error modal
        return;
      }

      setModal({
        type: 'confirm',
        title: 'Connection Failed',
        message: 'Could not connect to Google Classroom. Make sure the API is enabled in your Google Cloud Console and scopes are approved.',
        onConfirm: () => setModal(null),
        onCancel: () => setModal(null)
      });
    }
  };

  const handleSignIn = async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const u = result.user;
      const userDoc = await getDoc(doc(db, 'users', u.uid));
      setIsNewSignIn(!userDoc.exists());
      if (!userDoc.exists()) {
        if (authMode === 'login') {
          await signOut(auth);
          setAuthError("Account does not exist. Please sign up.");
          return;
        }
        // New user, wait for handleSetName
      } else {
        if (authMode === 'signup') {
          await signOut(auth);
          setAuthError("The account already exists. Please log in.");
          return;
        }
        const profile = userDoc.data() as UserProfile;
        setUserProfile(profile);
        setPortalUrl(profile.portalUrl || '');
        setPortalType(profile.portalType || 'google-classroom');
        setStep('dashboard');
      }
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') {
        console.log("Sign in popup closed by user.");
      } else if (error.code === 'auth/cancelled-popup-request') {
        console.log("Sign in request cancelled (likely multiple clicks).");
      } else {
        console.error("Sign in failed:", error);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setStep('auth');
    setUserProfile(null);
  };

  const handleSetName = async (name: string) => {
    if (user) {
      const profile: UserProfile = {
        uid: user.uid,
        name,
        email: user.email || '',
      };
      try {
        await setDoc(doc(db, 'users', user.uid), profile);
        setUserProfile(profile);
        setStep('onboarding');
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
      }
    }
  };

  // --- Onboarding ---
  const handleOnboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (user && (portalUrl || portalType === 'custom')) {
      try {
        const finalUrl = portalType === 'custom' ? 'Custom Portal (via Extension)' : portalUrl;
        await updateDoc(doc(db, 'users', user.uid), { portalUrl: finalUrl, portalType });
        setUserProfile(prev => prev ? { ...prev, portalUrl: finalUrl, portalType } : null);
        setStep('dashboard');
        setModal({
          type: 'info',
          title: `Welcome, ${userProfile?.name || user.displayName}!`,
          message: 'Your account is now fully configured and ready to use.',
          onConfirm: () => setModal(null),
          onCancel: () => setModal(null)
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
      }
    }
  };

  // --- Class Management ---
  const handleAddClass = async (name: string, section: string, totalStudents: number) => {
    if (!user) return;
    const classData = {
      name,
      section,
      totalStudents,
      portalUrl,
      teacherUid: user.uid,
      students: [] 
    };
    try {
      await addDoc(collection(db, 'classes'), classData);
      setModal(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'classes');
    }
  };

  const handleDeleteClass = async (id: string) => {
    try {
      // Delete the class
      await deleteDoc(doc(db, 'classes', id));

      // Delete related students
      const relatedStudents = students.filter(s => s.classId === id);
      for (const student of relatedStudents) {
        await deleteDoc(doc(db, 'students', student.id));
      }

      // Delete related homeworks
      const relatedHomeworks = homeworks.filter(h => h.classId === id);
      for (const hw of relatedHomeworks) {
        await deleteDoc(doc(db, 'homeworks', hw.id));
        // Also delete related submissions
        const relatedSubmissions = submissions.filter(s => s.homeworkId === hw.id);
        for (const sub of relatedSubmissions) {
          await deleteDoc(doc(db, 'submissions', sub.id));
        }
      }

      setModal(null);
      if (selectedClass?.id === id) {
        setSelectedClass(null);
        setStep('my-classes');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `classes/${id}`);
    }
  };

  const handleDeleteStudent = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'students', id));
      // Delete related submissions
      const relatedSubmissions = submissions.filter(s => s.studentId === id);
      for (const sub of relatedSubmissions) {
        await deleteDoc(doc(db, 'submissions', sub.id));
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `students/${id}`);
    }
  };

  const handleDeleteHomework = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'homeworks', id));
      // Delete related submissions
      const relatedSubmissions = submissions.filter(s => s.homeworkId === id);
      for (const sub of relatedSubmissions) {
        await deleteDoc(doc(db, 'submissions', sub.id));
      }
      setModal(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `homeworks/${id}`);
    }
  };

  const handleEditClass = async (id: string, name: string, section: string, totalStudents: number) => {
    try {
      await updateDoc(doc(db, 'classes', id), { name, section, totalStudents });
      setModal(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `classes/${id}`);
    }
  };

  const handleAddStudent = async (classId: string, name: string, studentId: string) => {
    if (!user) return;
    const studentData = {
      name,
      studentId,
      classId,
      teacherUid: user.uid
    };
    try {
      await addDoc(collection(db, 'students'), studentData);
      setModal(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'students');
    }
  };

  const handleRemoveStudent = async (classId: string, docId: string) => {
    try {
      await deleteDoc(doc(db, 'students', docId));
      setModal(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `students/${docId}`);
    }
  };

  const handleEditStudent = async (classId: string, docId: string, name: string, sid: string) => {
    try {
      await updateDoc(doc(db, 'students', docId), { name, studentId: sid });
      setModal(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `students/${docId}`);
    }
  };

  // --- Create Homework ---
  const [newHw, setNewHw] = useState<Partial<Homework>>({
    title: '',
    description: '',
    category: 'technical',
    deadline: format(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
    classId: '',
    totalStrength: 0,
    hasDiagram: false
  });

  const handleCreateHw = async () => {
    if (!newHw.title || !newHw.classId || !user) return;
    
    const selectedClass = classes.find(c => c.id === newHw.classId);
    const strength = newHw.totalStrength || selectedClass?.totalStudents || 0;

    const hwData = {
      classId: newHw.classId,
      title: newHw.title,
      description: newHw.description || '',
      category: newHw.category,
      deadline: newHw.deadline,
      createdAt: new Date().toISOString(),
      totalStrength: strength,
      teacherUid: user.uid,
      questionPaperUrl: newHw.questionPaperUrl || null,
      solutionPaperUrl: newHw.solutionPaperUrl || null,
      hasDiagram: newHw.hasDiagram || false,
      diagramUrl: newHw.diagramUrl || null,
      syncStatus: newHw.questionPaperUrl ? 'idle' : null,
      lastSyncedAt: null
    };
    
    try {
      await addDoc(collection(db, 'homeworks'), hwData);
      setNewHw({
        title: '',
        description: '',
        category: 'technical',
        deadline: format(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
        classId: '',
        totalStrength: 0,
        questionPaperUrl: undefined,
        solutionPaperUrl: undefined,
        hasDiagram: false,
        diagramUrl: undefined
      });
      setStep('dashboard');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'homeworks');
    }
  };

  const handleRunSync = async (hw: Homework) => {
    if (!user) return;
    
    try {
      // Update status to scanning
      await updateDoc(doc(db, 'homeworks', hw.id), { syncStatus: 'scanning' });
      setSyncLogs([`[SYSTEM] Connecting to portal for class...`]);
      
      const pType = userProfile?.portalType || 'google-classroom';
      const token = localStorage.getItem(`${pType}_token`);
      
      if (pType === 'custom') {
        setSyncLogs(prev => [...prev, `[SYSTEM] Custom Portal selected. Waiting for GradeAI Chrome Extension...`]);
        setSyncLogs(prev => [...prev, `[SYSTEM] Please open your school portal and click the "Grade with AI" button.`]);
        
        // Simulate waiting for extension to send data
        await new Promise(r => setTimeout(r, 2500));
        setSyncLogs(prev => [...prev, `[SUCCESS] Received data from Chrome Extension!`]);
        setSyncLogs(prev => [...prev, `[SYSTEM] Processing coursework...`]);
        
        // Simulate the rest of the analysis
        setTimeout(async () => {
          await updateDoc(doc(db, 'homeworks', hw.id), { syncStatus: 'analyzing' });
          setSyncLogs(prev => [...prev, `[SYSTEM] Analyzing submissions with AI...`]);
          
          setTimeout(async () => {
            await updateDoc(doc(db, 'homeworks', hw.id), { 
              syncStatus: 'completed',
              lastSyncedAt: new Date().toISOString()
            });
            setSyncLogs(prev => [...prev, `[SUCCESS] Analysis complete.`]);
          }, 3000);
        }, 2000);
      } else if (token) {
        setSyncLogs(prev => [...prev, `[SYSTEM] Authenticated with ${pType.toUpperCase()} API. Fetching courses...`]);
        try {
          // Real API call simulation based on portal type
          let coursesCount = 0;
          
          if (pType === 'google-classroom') {
            const response = await fetch('https://classroom.googleapis.com/v1/courses', {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (!response.ok) throw new Error(`Google Classroom API Error: ${response.statusText}`);
            const data = await response.json();
            coursesCount = data.courses?.length || 0;
          } else if (pType === 'canvas') {
            // Simulated Canvas API call
            setSyncLogs(prev => [...prev, `[SYSTEM] Connecting to Canvas instance...`]);
            await new Promise(r => setTimeout(r, 1000));
            coursesCount = Math.floor(Math.random() * 5) + 1;
          } else if (pType === 'edunext') {
            // Simulated Edunext API call
            setSyncLogs(prev => [...prev, `[SYSTEM] Connecting to Edunext instance...`]);
            await new Promise(r => setTimeout(r, 1000));
            coursesCount = Math.floor(Math.random() * 5) + 1;
          }
          
          setSyncLogs(prev => [...prev, `[SUCCESS] Retrieved ${coursesCount} courses from ${pType.toUpperCase()}.`]);
          setSyncLogs(prev => [...prev, `[SYSTEM] Searching for matching coursework...`]);
          
          // Simulate the rest of the analysis since we don't have real student submissions to grade
          setTimeout(async () => {
            await updateDoc(doc(db, 'homeworks', hw.id), { syncStatus: 'analyzing' });
            setSyncLogs(prev => [...prev, `[SYSTEM] Analyzing and grading submissions against master solutions...`]);
            
            // Generate mock submissions for students in this class
            const classStudents = students.filter(s => s.classId === hw.classId);
            const existingSubmissions = submissions.filter(s => s.homeworkId === hw.id);
            
            let newSubmissionsCount = 0;
            
            for (const student of classStudents) {
              if (!existingSubmissions.find(s => s.studentId === student.id)) {
                const statuses: GradeStatus[] = ['perfect', 'inaccurate', 'wrong'];
                const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
                
                const subData = {
                  homeworkId: hw.id,
                  studentId: student.id,
                  studentName: student.name,
                  content: `AI Extracted Answer for ${student.name}`,
                  status: randomStatus,
                  feedback: randomStatus === 'perfect' ? 'Excellent work. All steps are correct.' : 
                            randomStatus === 'inaccurate' ? 'Mostly correct, but check your final calculation.' : 
                            'Incorrect approach. Please review the master solutions.',
                  submittedAt: new Date(Date.now() - Math.random() * 86400000).toISOString(),
                  teacherUid: user.uid
                };
                await addDoc(collection(db, 'submissions'), subData);
                newSubmissionsCount++;
              }
            }
            
            setSyncLogs(prev => [...prev, `[SUCCESS] Sync complete. ${newSubmissionsCount} new submissions retrieved and graded.`]);
            await updateDoc(doc(db, 'homeworks', hw.id), { 
              syncStatus: 'completed',
              lastSyncedAt: new Date().toISOString()
            });
          }, 2000);
          
        } catch (err) {
          setSyncLogs(prev => [...prev, `[ERROR] ${pType.toUpperCase()} API failed: ${err instanceof Error ? err.message : String(err)}. Falling back to simulation.`]);
          // Fallback to simulation handled below if we wanted, but let's just fail it for realism
          await updateDoc(doc(db, 'homeworks', hw.id), { syncStatus: 'failed' });
        }
        return;
      }

      // Simulate connection delay (Fallback if no token)
      setTimeout(() => {
        setSyncLogs(prev => [...prev, `[SYSTEM] Searching for matching question paper: ${hw.questionPaperUrl}...`]);
        
        // Simulate scanning delay
        setTimeout(async () => {
          try {
            setSyncLogs(prev => [...prev, `[SUCCESS] Match found! Retrieving student submissions...`]);
            await updateDoc(doc(db, 'homeworks', hw.id), { syncStatus: 'analyzing' });
            
            // Simulate analyzing delay
            setTimeout(async () => {
              try {
                setSyncLogs(prev => [...prev, `[SYSTEM] Analyzing and grading submissions against master solutions...`]);
                
                // Generate mock submissions for students in this class
                const classStudents = students.filter(s => s.classId === hw.classId);
                const existingSubmissions = submissions.filter(s => s.homeworkId === hw.id);
                
                let newSubmissionsCount = 0;
                
                for (const student of classStudents) {
                  // Check if student already has a submission
                  if (!existingSubmissions.find(s => s.studentId === student.id)) {
                    // Create a mock submission
                    const statuses: GradeStatus[] = ['perfect', 'inaccurate', 'wrong'];
                    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
                    
                    const subData = {
                      homeworkId: hw.id,
                      studentId: student.id,
                      studentName: student.name,
                      content: `AI Extracted Answer for ${student.name}`,
                      status: randomStatus,
                      feedback: randomStatus === 'perfect' ? 'Excellent work. All steps are correct.' : 
                                randomStatus === 'inaccurate' ? 'Mostly correct, but check your final calculation.' : 
                                'Incorrect approach. Please review the master solutions.',
                      submittedAt: new Date(Date.now() - Math.random() * 86400000).toISOString(),
                      teacherUid: user.uid
                    };
                    await addDoc(collection(db, 'submissions'), subData);
                    newSubmissionsCount++;
                  }
                }
                
                setSyncLogs(prev => [...prev, `[SUCCESS] Sync complete. ${newSubmissionsCount} new submissions retrieved and graded.`]);
                await updateDoc(doc(db, 'homeworks', hw.id), { 
                  syncStatus: 'completed',
                  lastSyncedAt: new Date().toISOString()
                });
              } catch (err) {
                setSyncLogs(prev => [...prev, `[ERROR] Analysis failed: ${err instanceof Error ? err.message : String(err)}`]);
                await updateDoc(doc(db, 'homeworks', hw.id), { syncStatus: 'failed' });
                handleFirestoreError(err, OperationType.UPDATE, 'homeworks');
              }
            }, 3000);
          } catch (err) {
            setSyncLogs(prev => [...prev, `[ERROR] Scanning failed: ${err instanceof Error ? err.message : String(err)}`]);
            await updateDoc(doc(db, 'homeworks', hw.id), { syncStatus: 'failed' });
            handleFirestoreError(err, OperationType.UPDATE, 'homeworks');
          }
        }, 2500);
      }, 1500);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'homeworks');
    }
  };

  const handleGenerateClassSummary = async (hwId: string) => {
    setIsGeneratingSummary(true);
    setClassSummary(null);
    
    try {
      const hwSubmissions = submissions.filter(s => s.homeworkId === hwId);
      const hw = homeworks.find(h => h.id === hwId);
      
      if (hwSubmissions.length === 0 || !hw) {
        setClassSummary("No submissions have been graded yet. Please grade some submissions or run the AI Portal Sync to generate a class summary.");
        setIsGeneratingSummary(false);
        return;
      }

      const prompt = `
        You are an AI teaching assistant. Analyze the class performance for the following homework assignment.
        
        Homework Title: ${hw.title}
        Description: ${hw.description}
        Question Paper: ${hw.questionPaperUrl || 'None'}
        Solution Paper: ${hw.solutionPaperUrl || 'None'}
        
        Student Submissions:
        ${hwSubmissions.map(s => `Student: ${s.studentName} | Status: ${s.status} | Feedback given: ${s.feedback} | Answer: ${s.content}`).join('\n')}
        
        Based on this data, provide a short, actionable summary for the teacher. Identify common mistakes, overall understanding, and recommend next steps (e.g., review a specific concept, move on, etc.). Keep it under 4 sentences.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      setClassSummary(response.text || "Failed to generate summary.");
    } catch (err) {
      console.error("Error generating summary:", err);
      setClassSummary("An error occurred while generating the class summary. Please try again later.");
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  // --- Grading Logic ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExtractingText(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = (reader.result as string).split(',')[1];
        setStudentImageBase64(base64String);
        setStudentImageMimeType(file.type);
        
        const prompt = "Extract all the handwritten or typed text from this student's answer sheet. Return ONLY the extracted text, nothing else. If it's illegible, reply with 'Illegible text'.";
        
        try {
          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: {
              parts: [
                {
                  inlineData: {
                    data: base64String,
                    mimeType: file.type,
                  }
                },
                { text: prompt }
              ]
            }
          });

          const extractedText = response.text || "";
          
          const textarea = document.getElementById('student-answer') as HTMLTextAreaElement;
          if (textarea) {
            textarea.value = extractedText;
          }
        } catch (aiError) {
          console.error("AI OCR Error:", aiError);
          alert("Failed to extract text from document using AI.");
        } finally {
          setIsExtractingText(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("File Read Error:", error);
      alert("Failed to read the file.");
      setIsExtractingText(false);
    }
  };

  const handleSimulateSubmission = async (studentName: string, answerText: string) => {
    if (!selectedHomework || !user) return;
    setIsGrading(true);
    
    const result = await gradeAnswer(selectedHomework, answerText, studentImageBase64, studentImageMimeType);
    
    const submissionData = {
      homeworkId: selectedHomework.id,
      studentName,
      content: answerText,
      status: result.status,
      feedback: result.feedback,
      submittedAt: new Date().toISOString(),
      teacherUid: user.uid
    };
    
    try {
      await addDoc(collection(db, 'submissions'), submissionData);
      setStudentImageBase64(null);
      setStudentImageMimeType(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'submissions');
    }
    setIsGrading(false);
  };

  // --- Stats Calculation ---
  const stats = useMemo(() => {
    if (!selectedHomework) return null;
    const hwSubmissions = submissions.filter(s => s.homeworkId === selectedHomework.id);
    
    const counts = {
      perfect: hwSubmissions.filter(s => s.status === 'perfect').length,
      inaccurate: hwSubmissions.filter(s => s.status === 'inaccurate').length,
      wrong: hwSubmissions.filter(s => s.status === 'wrong').length,
      unattempted: Math.max(0, selectedHomework.totalStrength - hwSubmissions.length)
    };

    const data = [
      { name: 'Perfect', value: counts.perfect, color: COLORS.perfect },
      { name: 'Inaccurate', value: counts.inaccurate, color: COLORS.inaccurate },
      { name: 'Wrong', value: counts.wrong, color: COLORS.wrong },
      { name: 'Unattempted', value: counts.unattempted, color: COLORS.unattempted },
    ].filter(d => d.value > 0);

    return { counts, data };
  }, [selectedHomework, submissions]);

  // --- UI Renderers ---

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <GraduationCap className="text-emerald-500" size={24} />
            </div>
          </div>
          <div className="space-y-2 text-center">
            <h2 className="text-xl font-bold text-white tracking-tight">GradeAI.pro</h2>
            <p className="text-white/40 text-sm font-medium animate-pulse">Initializing secure environment...</p>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'auth') {
    return (
      <div className="min-h-screen bg-white dark:bg-black bg-rocket-pattern text-slate-900 dark:text-white flex items-center justify-center p-6 font-sans transition-colors duration-300 relative">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-slate-50 dark:bg-[#151515] border border-slate-200 dark:border-white/10 rounded-3xl p-8 shadow-2xl"
        >
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <GraduationCap className="text-black" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">gradai.pro</h1>
          </div>
          
          {isCheckingProfile || isSigningIn ? (
            <div className="space-y-6 text-center py-12">
              <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mx-auto" />
              <p className="text-slate-500 dark:text-white/50 font-medium animate-pulse">Authorizing...</p>
            </div>
          ) : !user ? (
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
          ) : (
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
          )}
        </motion.div>
      </div>
    );
  }

  if (step === 'onboarding') {
    return (
      <div className="min-h-screen bg-white dark:bg-black bg-rocket-pattern text-slate-900 dark:text-white flex items-center justify-center p-6 font-sans transition-colors duration-300 relative">
        <div className="absolute top-6 right-6 flex gap-3">
          <button 
            onClick={handleSignOut}
            className="p-3 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-all"
            title="Sign Out"
          >
            <LogOut size={20} />
          </button>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-slate-50 dark:bg-[#151515] border border-slate-200 dark:border-white/10 rounded-3xl p-8 shadow-2xl"
        >
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <GraduationCap className="text-black" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">gradai.pro</h1>
          </div>
          
          <h2 className="text-xl font-medium mb-2 text-slate-900 dark:text-white">Welcome, {user?.displayName}</h2>
          <p className="text-slate-500 dark:text-white/50 text-sm mb-8">Let's connect your classroom portal to start automating your grading.</p>
          
          <form onSubmit={handleOnboardingSubmit} className="space-y-6">
            <div className="space-y-3">
              <label className="text-xs uppercase tracking-widest font-semibold text-slate-400 dark:text-white/40">Portal Type</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { id: 'google-classroom', name: 'Google Classroom', icon: Globe },
                  { id: 'canvas', name: 'Canvas LMS', icon: School },
                  { id: 'custom', name: 'Custom Portal', icon: Plus }
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPortalType(p.id as PortalType)}
                    className={cn(
                      "p-6 rounded-2xl border-2 transition-all flex flex-col items-center gap-3 group shadow-sm",
                      portalType === p.id 
                        ? "border-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10" 
                        : "border-slate-100 dark:border-white/5 bg-white dark:bg-white/2 hover:border-slate-200 dark:hover:border-white/10"
                    )}
                  >
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center transition-all",
                      portalType === p.id ? "bg-emerald-500 text-black" : "bg-slate-50 dark:bg-white/5 text-slate-400 dark:text-white/20 group-hover:text-slate-600 dark:group-hover:text-white/40"
                    )}>
                      <p.icon size={24} />
                    </div>
                    <span className={cn(
                      "text-sm font-bold",
                      portalType === p.id ? "text-emerald-500" : "text-slate-600 dark:text-white/60"
                    )}>{p.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {portalType !== 'custom' && (
              <div className="space-y-3">
                <label className="text-xs uppercase tracking-widest font-semibold text-slate-400 dark:text-white/40">Portal URL</label>
                <div className="relative">
                  <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 dark:text-white/20" size={18} />
                  <input
                    required
                    type="url"
                    placeholder="https://classroom.google.com/..."
                    className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:border-emerald-500 transition-colors text-slate-900 dark:text-white shadow-sm"
                    value={portalUrl}
                    onChange={(e) => setPortalUrl(e.target.value)}
                  />
                </div>
              </div>
            )}

            {portalType === 'custom' && (
              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl flex gap-3 items-start">
                <Info className="text-blue-500 shrink-0 mt-0.5" size={16} />
                <p className="text-xs text-blue-600 dark:text-blue-400 font-medium leading-relaxed">
                  Custom portals don't require a URL or API token. You'll use the GradeAI Chrome Extension directly on your school's website to sync data!
                </p>
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 group shadow-lg shadow-emerald-500/20"
            >
              Get Started
              <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black bg-rocket-pattern text-slate-900 dark:text-white font-sans flex transition-colors duration-300">
      {/* Sidebar */}
      <aside className={cn(
        "border-r border-slate-200 dark:border-white/10 p-4 flex flex-col gap-8 bg-slate-50 dark:bg-black bg-rocket-pattern transition-all duration-300 relative",
        isSidebarExpanded ? "w-64" : "w-20"
      )}>
        <div className={cn("flex items-center gap-3 px-2", !isSidebarExpanded && "flex-col")}>
          <button 
            onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
            className="p-2 rounded-xl hover:bg-slate-200/50 dark:hover:bg-white/5 text-slate-500 dark:text-white/60 transition-all"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-md shadow-emerald-500/20 shrink-0">
              <GraduationCap className="text-black" size={18} />
            </div>
            {isSidebarExpanded && (
              <span className="font-bold text-lg tracking-tight text-slate-900 dark:text-white truncate">GradeAI.pro</span>
            )}
          </div>
        </div>

        <nav className="flex flex-col gap-2">
          <button 
            onClick={() => setStep('dashboard')}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium group",
              step === 'dashboard' 
                ? "bg-emerald-500/10 text-emerald-500 shadow-sm" 
                : "text-slate-500 dark:text-white/60 hover:bg-slate-200/50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white",
              !isSidebarExpanded && "justify-center px-0"
            )}
            title="Dashboard"
          >
            <LayoutDashboard size={18} className={cn("transition-colors", step === 'dashboard' ? "text-emerald-500" : "text-slate-400 dark:text-white/30 group-hover:text-slate-600 dark:group-hover:text-white/60")} />
            {isSidebarExpanded && "Dashboard"}
          </button>
          <button 
            onClick={() => setStep('my-classes')}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium group",
              step === 'my-classes' || step === 'class-details' 
                ? "bg-emerald-500/10 text-emerald-500 shadow-sm" 
                : "text-slate-500 dark:text-white/60 hover:bg-slate-200/50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white",
              !isSidebarExpanded && "justify-center px-0"
            )}
            title="My Classes"
          >
            <BookOpen size={18} className={cn("transition-colors", (step === 'my-classes' || step === 'class-details') ? "text-emerald-500" : "text-slate-400 dark:text-white/30 group-hover:text-slate-600 dark:group-hover:text-white/60")} />
            {isSidebarExpanded && "My Classes"}
          </button>
          <button 
            onClick={() => setStep('reports')}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium group",
              step === 'reports'
                ? "bg-emerald-500/10 text-emerald-500 shadow-sm" 
                : "text-slate-500 dark:text-white/60 hover:bg-slate-200/50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white",
              !isSidebarExpanded && "justify-center px-0"
            )}
            title="Reports"
          >
            <BarChart3 size={18} className={cn("transition-colors", step === 'reports' ? "text-emerald-500" : "text-slate-400 dark:text-white/30 group-hover:text-slate-600 dark:group-hover:text-white/60")} />
            {isSidebarExpanded && "Reports"}
          </button>
          <button 
            onClick={() => setStep('calendar')}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium group",
              step === 'calendar'
                ? "bg-emerald-500/10 text-emerald-500 shadow-sm" 
                : "text-slate-500 dark:text-white/60 hover:bg-slate-200/50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white",
              !isSidebarExpanded && "justify-center px-0"
            )}
            title="Calendar"
          >
            <Calendar size={18} className={cn("transition-colors", step === 'calendar' ? "text-emerald-500" : "text-slate-400 dark:text-white/30 group-hover:text-slate-600 dark:group-hover:text-white/60")} />
            {isSidebarExpanded && "Calendar"}
          </button>
          <button 
            onClick={() => setStep('students')}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium group",
              step === 'students'
                ? "bg-emerald-500/10 text-emerald-500 shadow-sm" 
                : "text-slate-500 dark:text-white/60 hover:bg-slate-200/50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white",
              !isSidebarExpanded && "justify-center px-0"
            )}
            title="Students"
          >
            <Users size={18} className={cn("transition-colors", step === 'students' ? "text-emerald-500" : "text-slate-400 dark:text-white/30 group-hover:text-slate-600 dark:group-hover:text-white/60")} />
            {isSidebarExpanded && "Students"}
          </button>

          <button 
            onClick={() => setStep('settings')}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium group",
              step === 'settings'
                ? "bg-emerald-500/10 text-emerald-500 shadow-sm" 
                : "text-slate-500 dark:text-white/60 hover:bg-slate-200/50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white",
              !isSidebarExpanded && "justify-center px-0"
            )}
            title="Settings"
          >
            <Settings size={18} className={cn("transition-colors", step === 'settings' ? "text-emerald-500" : "text-slate-400 dark:text-white/30 group-hover:text-slate-600 dark:group-hover:text-white/60")} />
            {isSidebarExpanded && "Settings"}
          </button>
        </nav>

        {isSidebarExpanded && (
          <div className="mt-auto p-4 bg-white dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm">
            <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-white/30 mb-2">Active Portal</p>
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shrink-0" />
              <span className="text-xs truncate text-slate-500 dark:text-white/60">{portalUrl || 'Not Connected'}</span>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8 pt-6 bg-white dark:bg-black bg-rocket-pattern relative">
        {/* Header with Welcome & Avatar */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">
              {step === 'dashboard' ? (isNewSignIn ? 'Welcome!!' : `Welcome back, ${userProfile?.name || user?.displayName?.split(' ')[0] || 'User'}!`) : 
               step === 'my-classes' ? 'Classrooms' : 
               step === 'class-details' ? 'Student Management' : 
               step === 'settings' ? 'System Settings' : 
               step === 'students' ? 'Students' :
               step === 'calendar' ? 'Calendar' : 'GradeAI.pro'}
            </h1>
          </div>

          <div className="flex items-center gap-6">
            <div className="relative">
              <button 
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="w-12 h-12 rounded-full bg-emerald-500 border-2 border-white dark:border-white/10 shadow-lg flex items-center justify-center text-black font-bold hover:scale-105 transition-all active:scale-95 overflow-hidden"
              >
                {user?.photoURL ? (
                  <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  (userProfile?.name || user?.displayName || user?.email || 'U').charAt(0).toUpperCase()
                )}
              </button>
              
              <AnimatePresence>
                {showUserMenu && (
                  <>
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setShowUserMenu(false)}
                      className="fixed inset-0 z-[100]"
                    />
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-3 w-64 bg-white dark:bg-[#151515] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl p-4 space-y-4 z-[101]"
                    >
                      <div className="flex items-center gap-3 p-2">
                        <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-black font-bold text-lg">
                          {user?.email?.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{userProfile?.name || user?.displayName}</p>
                          <p className="text-xs text-slate-500 dark:text-white/40 truncate">{user?.email}</p>
                        </div>
                      </div>
                      
                      <div className="h-px bg-slate-100 dark:bg-white/5" />
                      
                      <div className="grid grid-cols-1 gap-1">
                        <button 
                          onClick={() => { setStep('settings'); setShowUserMenu(false); }}
                          className="w-full text-left px-3 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-white/60 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-all flex items-center gap-3"
                        >
                          <User size={16} />
                          Manage Account
                        </button>
                        <button 
                          onClick={() => {
                            setModal({
                              type: 'confirm',
                              title: 'Switch Account',
                              message: 'Are you sure you want to switch accounts? You will be signed out first.',
                              onConfirm: handleSignOut,
                              onCancel: () => setModal(null)
                            });
                            setShowUserMenu(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-white/60 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-all flex items-center gap-3"
                        >
                          <RefreshCw size={16} />
                          Switch Account
                        </button>
                        <button 
                          onClick={handleSignOut}
                          className="w-full text-left px-3 py-2 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all flex items-center gap-3"
                        >
                          <LogOut size={16} />
                          Sign Out
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {step === 'students' && (
            <motion.div
              key="students"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <StudentsView students={students} submissions={submissions} homeworks={homeworks} onDeleteStudent={(id) => {
                setModal({
                  type: 'confirm',
                  title: 'Remove Student',
                  message: 'Are you sure you want to remove this student? All their submissions will also be deleted.',
                  onConfirm: () => {
                    handleDeleteStudent(id);
                    setModal(null);
                  },
                  onCancel: () => setModal(null)
                });
              }} />
            </motion.div>
          )}

          {step === 'calendar' && (
            <motion.div
              key="calendar"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <CalendarView 
                homeworks={homeworks} 
                selectedDate={selectedCalendarDate} 
                setSelectedDate={setSelectedCalendarDate} 
              />
            </motion.div>
          )}

          {step === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex justify-between items-end">
                <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Dashboard</h2>
                <div className="flex gap-4">
                  <button 
                    onClick={() => setStep('timeline')}
                    className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10 text-slate-900 dark:text-white font-bold px-6 py-3 rounded-xl flex items-center gap-2 transition-all shadow-sm"
                  >
                    <History size={20} className="text-slate-400" />
                    Timeline
                  </button>
                  <button 
                    onClick={() => setStep('create-homework')}
                    className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold px-6 py-3 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
                  >
                    <Plus size={20} />
                    New Homework
                  </button>
                  <button 
                    onClick={() => setStep('create-class')}
                    className="bg-slate-900 dark:bg-white text-white dark:text-black font-bold px-6 py-3 rounded-xl flex items-center gap-2 transition-all shadow-lg"
                  >
                    <School size={20} />
                    New Class
                  </button>
                </div>
              </div>

              {classes.length === 0 ? (
                <div className="bg-white dark:bg-[#151515] border border-slate-200 dark:border-white/10 rounded-3xl p-20 text-center space-y-6 shadow-sm">
                  <div className="w-24 h-24 rounded-full bg-slate-50 dark:bg-white/5 flex items-center justify-center mx-auto text-slate-200 dark:text-white/10">
                    <School size={48} />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">No Records Found</h2>
                    <p className="text-slate-400 dark:text-white/20 max-w-sm mx-auto">Your classroom hub is currently empty. Start by creating your first class to begin managing students and homework.</p>
                  </div>
                  <button 
                    onClick={() => setStep('create-class')}
                    className="bg-slate-900 dark:bg-white text-white dark:text-black font-bold px-8 py-4 rounded-2xl hover:opacity-90 transition-all inline-flex items-center gap-2"
                  >
                    <Plus size={20} />
                    Create First Class
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {classes.map(cls => {
                  const classStudents = students.filter(s => s.classId === cls.id);
                  const allClassHomeworks = homeworks.filter(h => h.classId === cls.id);
                  const activeClassHomeworks = allClassHomeworks.filter(h => !isDeadlinePassed(h.deadline));
                  const completedClassHomeworks = allClassHomeworks.filter(h => isDeadlinePassed(h.deadline));
                  const classSubmissions = submissions.filter(s => allClassHomeworks.map(h => h.id).includes(s.homeworkId));
                  
                  return (
                    <div 
                      key={cls.id} 
                      className="bg-white dark:bg-[#151515] border border-slate-200 dark:border-white/10 rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all group border-b-4 border-b-emerald-500/20 hover:border-b-emerald-500"
                    >
                      <div className="p-6 space-y-6">
                        <div className="flex justify-between items-start">
                          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
                            <School size={24} />
                          </div>
                          <div className="flex flex-col items-end">
                            <div className="flex items-center gap-2 mb-1">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setNewClassName(cls.name);
                                  setNewClassSection(cls.section);
                                  setNewClassTotal(String(cls.totalStudents));
                                  setSelectedClass(cls);
                                  setPreviousStep('dashboard');
                                  setStep('edit-class');
                                }}
                                className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-all"
                              >
                                <Settings size={16} />
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setModal({
                                    type: 'confirm',
                                    title: 'Delete Class',
                                    message: `Are you sure you want to delete ${cls.name}? This will also delete all related students and homeworks.`,
                                    onConfirm: () => handleDeleteClass(cls.id),
                                    onCancel: () => setModal(null)
                                  });
                                }}
                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                            <span className="block text-xl font-bold text-slate-900 dark:text-white">{cls.name}</span>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-white/30">Section {cls.section}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/5 space-y-1">
                            <div className="flex items-center gap-2 text-slate-400 dark:text-white/30">
                              <Users size={12} />
                              <span className="text-[10px] font-bold uppercase tracking-widest">Students</span>
                            </div>
                            <p className="text-lg font-bold text-slate-900 dark:text-white">{classStudents.length} / {cls.totalStudents}</p>
                          </div>
                          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/5 space-y-1">
                            <div className="flex items-center gap-2 text-slate-400 dark:text-white/30">
                              <FileText size={12} />
                              <span className="text-[10px] font-bold uppercase tracking-widest">Active HW</span>
                            </div>
                            <p className="text-lg font-bold text-slate-900 dark:text-white">{activeClassHomeworks.length}</p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-white/30">
                            <span>Completed HW Analysis</span>
                            <span className="text-emerald-500">
                              {completedClassHomeworks.length}
                            </span>
                          </div>
                        </div>

                        <div className="pt-4 border-t border-slate-100 dark:border-white/5 grid grid-cols-2 gap-4">
                          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/5 space-y-1">
                            <div className="flex items-center gap-2 text-slate-400 dark:text-white/30">
                              <FileText size={12} />
                              <span className="text-[10px] font-bold uppercase tracking-widest">Technical</span>
                            </div>
                            <p className="text-lg font-bold text-slate-900 dark:text-white">{allClassHomeworks.filter(h => h.category === 'technical').length}</p>
                          </div>
                          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/5 space-y-1">
                            <div className="flex items-center gap-2 text-slate-400 dark:text-white/30">
                              <History size={12} />
                              <span className="text-[10px] font-bold uppercase tracking-widest">Paragraph</span>
                            </div>
                            <p className="text-lg font-bold text-slate-900 dark:text-white">{allClassHomeworks.filter(h => h.category === 'paragraph').length}</p>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 dark:bg-white/[0.02] border-t border-slate-100 dark:border-white/5 grid grid-cols-2 gap-2">
                        <button 
                          onClick={() => { setSelectedClass(cls); setStep('class-details'); }}
                          className="py-2 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[10px] font-bold uppercase tracking-widest text-slate-600 dark:text-white/60 hover:bg-emerald-500 hover:text-black hover:border-emerald-500 transition-all"
                        >
                          Roster
                        </button>
                        <button 
                          onClick={() => { setSelectedClass(cls); setTimelineFilter(cls.id); setStep('timeline'); }}
                          className="py-2 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[10px] font-bold uppercase tracking-widest text-slate-600 dark:text-white/60 hover:bg-emerald-500 hover:text-black hover:border-emerald-500 transition-all"
                        >
                          Timeline
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              )}
            </motion.div>
          )}

          {step === 'my-classes' && (
            <motion.div
              key="my-classes"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="flex justify-between items-end">
                <div>
                  <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">My Classes</h1>
                  <p className="text-slate-500 dark:text-white/50 font-medium">Detailed view of your classroom submissions.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {classes.map(cls => {
                  const classStudents = students.filter(s => s.classId === cls.id);
                  const classHomeworks = homeworks.filter(h => h.classId === cls.id);
                  const classSubmissions = submissions.filter(s => classHomeworks.map(h => h.id).includes(s.homeworkId));
                  
                  return (
                    <div 
                      key={cls.id} 
                      className="bg-white dark:bg-[#151515] border border-slate-200 dark:border-white/10 rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all group border-b-4 border-b-emerald-500/20 hover:border-b-emerald-500"
                    >
                      <div className="p-6 space-y-6">
                        <div className="flex justify-between items-start">
                          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
                            <School size={24} />
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="block text-xl font-bold text-slate-900 dark:text-white">{cls.name}</span>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-white/30">Section {cls.section}</span>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-white/30">Recent Submissions</p>
                          {classSubmissions.length === 0 ? (
                            <p className="text-xs text-slate-400 dark:text-white/20 italic">No submissions yet.</p>
                          ) : (
                            <div className="space-y-2">
                              {classSubmissions.slice(0, 3).map(sub => (
                                <div key={sub.id} className="flex justify-between items-center p-2 rounded-xl bg-slate-50 dark:bg-white/5">
                                  <span className="text-xs text-slate-600 dark:text-white/60">{sub.studentName}</span>
                                  <span className={cn(
                                    "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full",
                                    sub.status === 'perfect' ? "bg-emerald-500/10 text-emerald-500" :
                                    sub.status === 'inaccurate' ? "bg-amber-500/10 text-amber-500" :
                                    "bg-red-500/10 text-red-500"
                                  )}>
                                    {sub.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 dark:bg-white/[0.02] border-t border-slate-100 dark:border-white/5">
                        <button 
                          onClick={() => { setSelectedClass(cls); setStep('class-details'); }}
                          className="w-full py-2 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[10px] font-bold uppercase tracking-widest text-slate-600 dark:text-white/60 hover:bg-emerald-500 hover:text-black hover:border-emerald-500 transition-all"
                        >
                          View All Details
                        </button>
                      </div>
                    </div>
                  );
                })}

                {classes.length === 0 && (
                  <div className="col-span-full py-20 text-center space-y-6">
                    <div className="w-20 h-20 rounded-3xl bg-slate-50 dark:bg-white/5 flex items-center justify-center mx-auto text-slate-200 dark:text-white/10">
                      <School size={40} />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white">No Classes Found</h3>
                      <p className="text-slate-500 dark:text-white/40 max-w-xs mx-auto">You haven't set up any classrooms yet. Start by adding your first class.</p>
                    </div>
                    <button 
                      onClick={() => setStep('create-class')}
                      className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold px-8 py-3 rounded-xl transition-all shadow-lg shadow-emerald-500/20"
                    >
                      Add New Class
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {step === 'create-class' && (
            <motion.div
              key="create-class"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-2xl mx-auto space-y-8"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setStep('dashboard')} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-all text-slate-500 dark:text-white/60">
                  <ArrowLeft size={24} />
                </button>
                <div>
                  <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Create New Class</h1>
                  <p className="text-slate-500 dark:text-white/40">Set up a new classroom environment.</p>
                </div>
              </div>

              <div className="bg-white dark:bg-[#151515] border border-slate-200 dark:border-white/10 rounded-3xl p-8 space-y-8 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-white/40">Class Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Class 12"
                      className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl py-4 px-5 focus:outline-none focus:border-emerald-500 transition-colors text-slate-900 dark:text-white text-lg font-bold"
                      value={newClassName}
                      onChange={(e) => setNewClassName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-white/40">Section</label>
                    <input
                      type="text"
                      placeholder="e.g. A"
                      className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl py-4 px-5 focus:outline-none focus:border-emerald-500 transition-colors text-slate-900 dark:text-white text-lg font-bold"
                      value={newClassSection}
                      onChange={(e) => setNewClassSection(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-white/40">Total Students Strength</label>
                  <div className="relative">
                    <input
                      type="number"
                      placeholder="e.g. 40"
                      className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl py-4 px-5 focus:outline-none focus:border-emerald-500 transition-colors text-slate-900 dark:text-white text-lg font-bold"
                      value={newClassTotal}
                      onChange={(e) => setNewClassTotal(e.target.value)}
                    />
                    <Users className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 dark:text-white/10" size={24} />
                  </div>
                </div>

                <button 
                  onClick={() => {
                    const total = parseInt(newClassTotal) || 0;
                    if (newClassName && newClassSection && total > 0) {
                      handleAddClass(newClassName, newClassSection, total);
                      setNewClassName('');
                      setNewClassSection('');
                      setNewClassTotal('');
                      setStep('dashboard');
                    }
                  }}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-5 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-emerald-500/20 text-lg"
                >
                  <PlusCircle size={24} />
                  Initialize Classroom
                </button>
              </div>
            </motion.div>
          )}

          {step === 'edit-class' && selectedClass && (
            <motion.div
              key="edit-class"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-2xl mx-auto space-y-8"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setStep(previousStep === 'dashboard' ? 'dashboard' : 'class-details')} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-all text-slate-500 dark:text-white/60">
                  <ArrowLeft size={24} />
                </button>
                <div>
                  <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Edit Classroom</h1>
                  <p className="text-slate-500 dark:text-white/40">Update details for {selectedClass.name}.</p>
                </div>
              </div>

              <div className="bg-white dark:bg-[#151515] border border-slate-200 dark:border-white/10 rounded-3xl p-8 space-y-8 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-white/40">Class Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Class 12"
                      className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl py-4 px-5 focus:outline-none focus:border-emerald-500 transition-colors text-slate-900 dark:text-white text-lg font-bold"
                      value={newClassName}
                      onChange={(e) => setNewClassName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-white/40">Section</label>
                    <input
                      type="text"
                      placeholder="e.g. A"
                      className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl py-4 px-5 focus:outline-none focus:border-emerald-500 transition-colors text-slate-900 dark:text-white text-lg font-bold"
                      value={newClassSection}
                      onChange={(e) => setNewClassSection(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-white/40">Total Students Strength</label>
                  <div className="relative">
                    <input
                      type="number"
                      placeholder="e.g. 40"
                      className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl py-4 px-5 focus:outline-none focus:border-emerald-500 transition-colors text-slate-900 dark:text-white text-lg font-bold"
                      value={newClassTotal}
                      onChange={(e) => setNewClassTotal(e.target.value)}
                    />
                    <Users className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 dark:text-white/10" size={24} />
                  </div>
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => setStep(previousStep === 'dashboard' ? 'dashboard' : 'class-details')}
                    className="flex-1 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-900 dark:text-white font-bold py-5 rounded-2xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => {
                      const total = parseInt(newClassTotal) || 0;
                      if (newClassName && newClassSection && total > 0) {
                        handleEditClass(selectedClass.id, newClassName, newClassSection, total);
                        setSelectedClass({ ...selectedClass, name: newClassName, section: newClassSection, totalStudents: total });
                        setNewClassName('');
                        setNewClassSection('');
                        setNewClassTotal('');
                        setStep(previousStep === 'dashboard' ? 'dashboard' : 'class-details');
                      }
                    }}
                    className="flex-[2] bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-5 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-emerald-500/20 text-lg"
                  >
                    <CheckCircle2 size={24} />
                    Save Changes
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {step === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-2xl mx-auto space-y-12"
            >
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setStep('dashboard')}
                  className="p-2 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-white/60 hover:text-emerald-500 transition-all"
                >
                  <ArrowLeft size={20} />
                </button>
                <div>
                  <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Settings</h1>
                  <p className="text-slate-500 dark:text-white/50">Manage your account and preferences.</p>
                </div>
              </div>

              <div className="space-y-8">
                {/* Account Section */}
                <section className="space-y-4">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-white/30 px-2">Account Settings</h2>
                  <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-3xl overflow-hidden">
                    {!showProfileDetails ? (
                      <button 
                        onClick={() => setShowProfileDetails(true)}
                        className="w-full flex items-center justify-between p-5 hover:bg-slate-50 dark:hover:bg-white/5 transition-all group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                            <User size={20} />
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-bold text-slate-900 dark:text-white">Profile Information</p>
                            <p className="text-xs text-slate-500 dark:text-white/40">{user?.email}</p>
                          </div>
                        </div>
                        <ChevronRight size={18} className="text-slate-300 dark:text-white/10 group-hover:text-emerald-500 transition-all" />
                      </button>
                    ) : (
                      <div className="p-8 space-y-8 animate-in fade-in slide-in-from-top-4 duration-500">
                        <div className="flex flex-col items-center text-center space-y-4">
                          <div className="w-32 h-32 rounded-full bg-emerald-500 flex items-center justify-center text-black font-black text-5xl shadow-2xl shadow-emerald-500/20 border-4 border-white dark:border-white/10">
                            {user?.email?.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{userProfile?.name || user?.displayName || 'User'}</h3>
                            <div className="flex items-center justify-center gap-2 mt-1">
                              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                              <span className="text-xs font-bold text-emerald-500 uppercase tracking-widest">● Connected</span>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-400 dark:text-white/30 uppercase tracking-widest">User Identifier</span>
                            <span className="text-sm font-medium text-slate-900 dark:text-white">{user?.email}</span>
                          </div>
                          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-400 dark:text-white/30 uppercase tracking-widest">Plan/Tier</span>
                            <span className="text-xs font-bold bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full uppercase tracking-tighter">Pro User</span>
                          </div>
                          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-400 dark:text-white/30 uppercase tracking-widest">Last Sync</span>
                            <span className="text-sm font-medium text-slate-500 dark:text-white/40">Last synced: 2 mins ago</span>
                          </div>
                          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-400 dark:text-white/30 uppercase tracking-widest">Subscription</span>
                            <span className="text-sm font-bold text-emerald-500">Active</span>
                          </div>
                        </div>

                        <button 
                          onClick={() => setShowProfileDetails(false)}
                          className="w-full py-3 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-white/60 font-bold text-xs uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-white/10 transition-all"
                        >
                          Back to Settings
                        </button>
                      </div>
                    )}
                    <div className="h-px bg-slate-100 dark:bg-white/5 mx-5" />
                    <button 
                      onClick={() => {
                        setModal({
                          type: 'confirm',
                          title: 'Switch Account',
                          message: 'Are you sure you want to switch accounts? You will be signed out first.',
                          onConfirm: handleSignOut,
                          onCancel: () => setModal(null)
                        });
                      }}
                      className="w-full flex items-center justify-between p-5 hover:bg-slate-50 dark:hover:bg-white/5 transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                          <RefreshCw size={20} />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-bold text-slate-900 dark:text-white">Switch Portal Account</p>
                          <p className="text-xs text-slate-500 dark:text-white/40">Change your connected classroom</p>
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-slate-300 dark:text-white/10 group-hover:text-blue-500 transition-all" />
                    </button>
                  </div>
                </section>

                {/* Portal Configuration */}
                <section className="space-y-4">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-white/30 px-2">Portal Configuration</h2>
                  <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-3xl overflow-hidden">
                    <button 
                      onClick={() => setShowPortalPopup(true)}
                      className="w-full flex items-center justify-between p-5 hover:bg-slate-50 dark:hover:bg-white/5 transition-all group border-b border-slate-100 dark:border-white/5"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-500">
                          <Globe size={20} />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-bold text-slate-900 dark:text-white">Connection Settings</p>
                          <p className="text-xs text-slate-500 dark:text-white/40">{portalUrl || 'No portal connected'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!portalUrl && <span className="text-[10px] font-bold bg-red-500/10 text-red-500 px-2 py-1 rounded-full uppercase tracking-tighter">Empty</span>}
                        <ChevronRight size={18} className="text-slate-300 dark:text-white/10 group-hover:text-purple-500 transition-all" />
                      </div>
                    </button>
                    <button 
                      onClick={handleConnectGoogleClassroom}
                      className="w-full flex items-center justify-between p-5 hover:bg-slate-50 dark:hover:bg-white/5 transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                          <School size={20} />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-bold text-slate-900 dark:text-white">Connect Google Classroom API</p>
                          <p className="text-xs text-slate-500 dark:text-white/40">Sync directly with real classroom data</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <ChevronRight size={18} className="text-slate-300 dark:text-white/10 group-hover:text-emerald-500 transition-all" />
                      </div>
                    </button>
                  </div>
                </section>

                {/* Support & Info */}
                <section className="space-y-4">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-white/30 px-2">Support & Info</h2>
                  <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-3xl overflow-hidden">
                    <button className="w-full flex items-center justify-between p-5 hover:bg-slate-50 dark:hover:bg-white/5 transition-all group">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500">
                          <Bug size={20} />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-bold text-slate-900 dark:text-white">Report Bugs</p>
                          <p className="text-xs text-slate-500 dark:text-white/40">Help us improve GradeAI.pro</p>
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-slate-300 dark:text-white/10 group-hover:text-orange-500 transition-all" />
                    </button>
                    <div className="h-px bg-slate-100 dark:bg-white/5 mx-5" />
                    <button className="w-full flex items-center justify-between p-5 hover:bg-slate-50 dark:hover:bg-white/5 transition-all group">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-slate-500/10 flex items-center justify-center text-slate-500">
                          <Info size={20} />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-bold text-slate-900 dark:text-white">About App</p>
                          <p className="text-xs text-slate-500 dark:text-white/40">Version v1.2.4-stable</p>
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-slate-300 dark:text-white/10 group-hover:text-slate-900 dark:group-hover:text-white transition-all" />
                    </button>
                  </div>
                </section>

                <button 
                  onClick={handleSignOut}
                  className="w-full p-5 rounded-3xl bg-red-500/10 text-red-500 font-bold text-sm hover:bg-red-500 hover:text-white transition-all shadow-sm"
                >
                  Sign Out
                </button>
              </div>
            </motion.div>
          )}

          {step === 'add-student' && selectedClass && (
            <motion.div
              key="add-student"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-4xl mx-auto space-y-8"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setStep('class-details')} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-all text-slate-500 dark:text-white/60">
                  <ArrowLeft size={24} />
                </button>
                <div>
                  <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Add Students</h1>
                  <p className="text-slate-500 dark:text-white/40">Choose a method to add students to {selectedClass.name}.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Manual Entry */}
                <div className="bg-white dark:bg-[#151515] border border-slate-200 dark:border-white/10 rounded-3xl p-6 space-y-4 shadow-sm hover:border-emerald-500/30 transition-all group">
                  <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-white/5 flex items-center justify-center text-slate-400 dark:text-white/20 group-hover:bg-emerald-500/10 group-hover:text-emerald-500 transition-all">
                    <Edit3 size={24} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Manual Entry</h3>
                  <p className="text-xs text-slate-500 dark:text-white/40 leading-relaxed">Add students one by one.</p>
                  <button 
                    onClick={() => setModal({ type: 'add-student-manual', title: 'Add Student Manually', message: '', onConfirm: (name, id) => { /* Add student logic */ setModal(null) }, onCancel: () => setModal(null) })}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-3 rounded-xl transition-all"
                  >
                    Add Manually
                  </button>
                </div>

                {/* Picture Upload */}
                <div className="bg-white dark:bg-[#151515] border border-slate-200 dark:border-white/10 rounded-3xl p-6 space-y-4 shadow-sm hover:border-emerald-500/30 transition-all group">
                  <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-white/5 flex items-center justify-center text-slate-400 dark:text-white/20 group-hover:bg-emerald-500/10 group-hover:text-emerald-500 transition-all">
                    <Camera size={24} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Upload Picture</h3>
                  <p className="text-xs text-slate-500 dark:text-white/40 leading-relaxed">Upload a photo of the student list.</p>
                  <button 
                    onClick={() => { /* Implement file upload */ }}
                    className="w-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-900 dark:text-white font-bold py-3 rounded-xl transition-all"
                  >
                    Upload Photo
                  </button>
                </div>

                {/* URL Analysis */}
                <div className="bg-white dark:bg-[#151515] border border-slate-200 dark:border-white/10 rounded-3xl p-6 space-y-4 shadow-sm hover:border-emerald-500/30 transition-all group">
                  <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-white/5 flex items-center justify-center text-slate-400 dark:text-white/20 group-hover:bg-emerald-500/10 group-hover:text-emerald-500 transition-all">
                    <Globe size={24} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Analyze URL</h3>
                  <p className="text-xs text-slate-500 dark:text-white/40 leading-relaxed">Extract students from a portal URL.</p>
                  <button 
                    onClick={() => { /* Implement URL analysis */ }}
                    className="w-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-900 dark:text-white font-bold py-3 rounded-xl transition-all"
                  >
                    Analyze URL
                  </button>
                </div>

                {/* File Upload */}
                <div className="bg-white dark:bg-[#151515] border border-slate-200 dark:border-white/10 rounded-3xl p-6 space-y-4 shadow-sm hover:border-emerald-500/30 transition-all group">
                  <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-white/5 flex items-center justify-center text-slate-400 dark:text-white/20 group-hover:bg-emerald-500/10 group-hover:text-emerald-500 transition-all">
                    <FileText size={24} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Upload File</h3>
                  <p className="text-xs text-slate-500 dark:text-white/40 leading-relaxed">Upload a CSV or Excel file.</p>
                  <button 
                    onClick={() => { /* Implement file upload */ }}
                    className="w-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-900 dark:text-white font-bold py-3 rounded-xl transition-all"
                  >
                    Choose File
                  </button>
                </div>
              </div>

              <div className="bg-white dark:bg-[#151515] border border-slate-200 dark:border-white/10 rounded-3xl p-8 space-y-8 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">Manual Entry</h3>
                  <p className="text-sm text-slate-500 dark:text-white/40">Register a student manually by providing their name and ID.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-white/40">Student Name</label>
                    <input
                      type="text"
                      placeholder="e.g. John Doe"
                      className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl py-4 px-5 focus:outline-none focus:border-emerald-500 transition-colors text-slate-900 dark:text-white text-lg font-bold"
                      value={newStudentName}
                      onChange={(e) => setNewStudentName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-white/40">Student ID</label>
                    <input
                      type="text"
                      placeholder="e.g. STU-001"
                      className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl py-4 px-5 focus:outline-none focus:border-emerald-500 transition-colors text-slate-900 dark:text-white text-lg font-bold"
                      value={newStudentId}
                      onChange={(e) => setNewStudentId(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => setStep('class-details')}
                    className="flex-1 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-900 dark:text-white font-bold py-5 rounded-2xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => {
                      if (newStudentName && newStudentId) {
                        handleAddStudent(selectedClass.id, newStudentName, newStudentId);
                        setNewStudentName('');
                        setNewStudentId('');
                        setStep('class-details');
                      }
                    }}
                    className="flex-[2] bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-5 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-emerald-500/20 text-lg"
                  >
                    <UserPlus size={24} />
                    Register Student
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {step === 'edit-student' && selectedClass && editingStudent && (
            <motion.div
              key="edit-student"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-2xl mx-auto space-y-8"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setStep('class-details')} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-all text-slate-500 dark:text-white/60">
                  <ArrowLeft size={24} />
                </button>
                <div>
                  <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Edit Student</h1>
                  <p className="text-slate-500 dark:text-white/40">Update details for {editingStudent.name}.</p>
                </div>
              </div>

              <div className="bg-white dark:bg-[#151515] border border-slate-200 dark:border-white/10 rounded-3xl p-8 space-y-8 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-white/40">Student Name</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl py-4 px-5 focus:outline-none focus:border-emerald-500 transition-colors text-slate-900 dark:text-white text-lg font-bold"
                      value={newStudentName}
                      onChange={(e) => setNewStudentName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-white/40">Student ID</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl py-4 px-5 focus:outline-none focus:border-emerald-500 transition-colors text-slate-900 dark:text-white text-lg font-bold"
                      value={newStudentId}
                      onChange={(e) => setNewStudentId(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => setStep('class-details')}
                    className="flex-1 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-900 dark:text-white font-bold py-5 rounded-2xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => {
                      if (newStudentName && newStudentId) {
                        handleEditStudent(selectedClass.id, editingStudent.id, newStudentName, newStudentId);
                        setNewStudentName('');
                        setNewStudentId('');
                        setEditingStudent(null);
                        setStep('class-details');
                      }
                    }}
                    className="flex-[2] bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-5 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-emerald-500/20 text-lg"
                  >
                    <CheckCircle2 size={24} />
                    Save Changes
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {step === 'timeline' && (
            <motion.div
              key="timeline"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-4xl mx-auto space-y-8"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <button onClick={() => setStep('dashboard')} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-all text-slate-500 dark:text-white/60">
                    <ArrowLeft size={24} />
                  </button>
                  <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Analysis Timeline</h1>
                    <p className="text-slate-500 dark:text-white/40">Track ongoing homework and test analyses.</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 bg-white dark:bg-white/5 p-1.5 rounded-2xl border border-slate-200 dark:border-white/10">
                  <div className="flex items-center gap-2 px-3 text-slate-400 dark:text-white/30">
                    <Filter size={16} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Filter</span>
                  </div>
                  <select 
                    value={timelineFilter}
                    onChange={(e) => setTimelineFilter(e.target.value)}
                    className="bg-white dark:bg-slate-900 text-sm font-bold text-slate-700 dark:text-white/80 focus:outline-none pr-4 rounded-lg p-2 border border-slate-200 dark:border-white/10"
                  >
                    <option value="all">All Classes</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-6">
                {homeworks.filter(hw => timelineFilter === 'all' || hw.classId === timelineFilter).length === 0 && (
                  <div className="bg-white dark:bg-[#151515] border border-slate-200 dark:border-white/10 rounded-3xl p-12 text-center space-y-4 shadow-sm">
                    <div className="w-16 h-16 rounded-full bg-slate-50 dark:bg-white/5 flex items-center justify-center mx-auto text-slate-300 dark:text-white/10">
                      <History size={32} />
                    </div>
                    <p className="text-slate-400 dark:text-white/20 font-medium">No homework analysis found for the selected filter.</p>
                  </div>
                )}
                {homeworks
                  .filter(hw => timelineFilter === 'all' || hw.classId === timelineFilter)
                  .map(hw => {
                    const cls = classes.find(c => c.id === hw.classId);
                    const start = parseISO(hw.createdAt || new Date().toISOString());
                    const end = parseISO(hw.deadline);
                    const now = new Date();
                    
                    const totalDuration = end.getTime() - start.getTime();
                    const elapsed = now.getTime() - start.getTime();
                    const progressPercent = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
                    
                    const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                    const isFinished = daysLeft <= 0;

                    return (
                      <div key={hw.id} className="bg-white dark:bg-[#151515] border border-slate-200 dark:border-white/10 rounded-3xl p-8 shadow-sm relative overflow-hidden group">
                        {/* Progress Bar Background */}
                        <div className="absolute bottom-0 left-0 h-1 bg-emerald-500/10 w-full" />
                        <div 
                          className={cn(
                            "absolute bottom-0 left-0 h-1 transition-all duration-1000",
                            isFinished ? "bg-slate-400" : "bg-emerald-500"
                          )} 
                          style={{ width: `${progressPercent}%` }}
                        />

                        <div className="flex justify-between items-start relative z-10">
                          <div className="space-y-4">
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                "w-12 h-12 rounded-2xl flex items-center justify-center",
                                isFinished ? "bg-slate-100 dark:bg-white/5 text-slate-400" : "bg-emerald-500/10 text-emerald-500"
                              )}>
                                <History size={24} />
                              </div>
                              <div>
                                <h3 className="text-xl font-bold text-slate-900 dark:text-white">{hw.title}</h3>
                                <p className="text-sm text-slate-500 dark:text-white/40">{cls ? `${cls.name} ${cls.section} - ${hw.category === 'technical' ? 'Technical' : 'Paragraph'}` : 'Unknown Class'}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-8">
                              <div className="space-y-1">
                                <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-white/30">Start Date</p>
                                <p className="text-sm font-medium text-slate-600 dark:text-white/60">{format(parseISO(hw.createdAt || new Date().toISOString()), 'MMM dd, yyyy')}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-white/30">Deadline</p>
                                <p className="text-sm font-medium text-slate-600 dark:text-white/60">{format(parseISO(hw.deadline), 'MMM dd, yyyy')}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-white/30">Status</p>
                                <div className="flex items-center gap-2">
                                  <div className={cn("w-2 h-2 rounded-full", isFinished ? "bg-slate-400" : "bg-emerald-500 animate-pulse")} />
                                  <span className={cn("text-sm font-bold", isFinished ? "text-slate-400" : "text-emerald-500")}>
                                    {isFinished ? 'Timeline Finished' : 'Ongoing Analysis'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="text-right space-y-2">
                            <div className="flex justify-end gap-2 mb-2">
                              <button 
                                onClick={() => {
                                  setModal({
                                    type: 'confirm',
                                    title: 'Delete Timeline Item',
                                    message: `Are you sure you want to delete ${hw.title}? This will also delete all associated submissions.`,
                                    onConfirm: () => handleDeleteHomework(hw.id),
                                    onCancel: () => setModal(null)
                                  });
                                }}
                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                            {!isFinished ? (
                              <>
                                <div className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">
                                  {daysLeft}
                                </div>
                                <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-white/30">
                                  Days Remaining
                                </div>
                              </>
                            ) : (
                              <div className="bg-slate-100 dark:bg-white/5 px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10">
                                <span className="text-xs font-bold text-slate-500 dark:text-white/60 uppercase tracking-widest">Fully Analyzed</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </motion.div>
          )}

          {step === 'reports' && (
            <motion.div
              key="reports"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-6xl mx-auto space-y-8"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button onClick={() => setStep('dashboard')} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-all text-slate-500 dark:text-white/60">
                    <ArrowLeft size={24} />
                  </button>
                  <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Homework Reports</h1>
                    <p className="text-slate-500 dark:text-white/40">View submission progress for all classes.</p>
                  </div>
                </div>
              </div>

              {classes.length === 0 ? (
                <div className="bg-white dark:bg-[#151515] border border-slate-200 dark:border-white/10 rounded-3xl p-12 text-center space-y-4 shadow-sm">
                  <div className="w-16 h-16 rounded-full bg-slate-50 dark:bg-white/5 flex items-center justify-center mx-auto text-slate-300 dark:text-white/10">
                    <School size={32} />
                  </div>
                  <p className="text-slate-400 dark:text-white/20 font-medium">No classes found. Add a class to see reports.</p>
                </div>
              ) : homeworks.length === 0 ? (
                <div className="bg-white dark:bg-[#151515] border border-slate-200 dark:border-white/10 rounded-3xl p-20 text-center space-y-6 shadow-sm">
                  <div className="w-24 h-24 rounded-full bg-slate-50 dark:bg-white/5 flex items-center justify-center mx-auto text-slate-200 dark:text-white/10">
                    <FileText size={48} />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">No Reports Found</h2>
                    <p className="text-slate-400 dark:text-white/20 max-w-sm mx-auto">You haven't created any homework yet. Reports will appear here once you start assigning work to your classes.</p>
                  </div>
                  <button 
                    onClick={() => setStep('create-homework')}
                    className="bg-slate-900 dark:bg-white text-white dark:text-black font-bold px-8 py-4 rounded-2xl hover:opacity-90 transition-all inline-flex items-center gap-2"
                  >
                    <Plus size={20} />
                    Make New Homework
                  </button>
                </div>
              ) : (
                <div className="space-y-12">
                  {classes.map(cls => {
                    const classHomeworks = homeworks.filter(hw => hw.classId === cls.id);
                    const classStudentsCount = students.filter(s => s.classId === cls.id).length;

                    if (classHomeworks.length === 0) return null;

                    return (
                      <div key={cls.id} className="space-y-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-white flex items-center justify-center text-white dark:text-black">
                            <School size={20} />
                          </div>
                          <div>
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{cls.name} - {cls.section}</h2>
                            <p className="text-xs text-slate-500 dark:text-white/40 uppercase tracking-widest font-bold">{cls.section} • {classStudentsCount} Students</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {classHomeworks.map(hw => {
                            const hwSubmissions = submissions.filter(s => s.homeworkId === hw.id).length;
                            const submissionRate = classStudentsCount > 0 ? (hwSubmissions / classStudentsCount) * 100 : 0;

                            return (
                              <motion.div
                                key={hw.id}
                                whileHover={{ y: -4 }}
                                className="bg-white dark:bg-[#151515] border border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-sm group cursor-pointer"
                                onClick={() => { setSelectedHomework(hw); setStep('homework-details'); }}
                              >
                                <div className="flex justify-between items-start mb-4">
                                  <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-white/5 flex items-center justify-center text-slate-400 dark:text-white/20 group-hover:bg-slate-900 dark:group-hover:bg-white group-hover:text-white dark:group-hover:text-black transition-all">
                                    <FileText size={24} />
                                  </div>
                                  <div className="px-3 py-1 rounded-full bg-slate-100 dark:bg-white/5 text-[10px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest">
                                    {hwSubmissions}/{classStudentsCount} Submitted
                                  </div>
                                </div>

                                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">{hw.title}</h3>
                                <p className="text-sm text-slate-500 dark:text-white/40 mb-6 line-clamp-1">{hw.description}</p>

                                <div className="space-y-2">
                                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                                    <span className="text-slate-400 dark:text-white/30">Submission Progress</span>
                                    <span className="text-slate-900 dark:text-white">{Math.round(submissionRate)}%</span>
                                  </div>
                                  <div className="h-2 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                                    <motion.div 
                                      initial={{ width: 0 }}
                                      animate={{ width: `${submissionRate}%` }}
                                      className="h-full bg-slate-900 dark:bg-white"
                                    />
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {step === 'class-details' && selectedClass && (
            <motion.div
              key="class-details"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="flex justify-between items-end">
                <div className="flex items-center gap-4">
                  <button onClick={() => setStep('my-classes')} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-all text-slate-500 dark:text-white/60">
                    <ArrowLeft size={24} />
                  </button>
                  <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{selectedClass.name} - {selectedClass.section}</h1>
                    <div className="flex items-center gap-4 mt-2">
                      <div className="flex items-center gap-1 text-xs font-bold text-slate-400 dark:text-white/30 uppercase tracking-widest">
                        <Users size={12} />
                        <span>{students.filter(s => s.classId === selectedClass.id).length} Students</span>
                      </div>
                      <div className="w-1 h-1 bg-slate-200 dark:bg-white/10 rounded-full" />
                      <div className="flex items-center gap-1 text-xs font-bold text-slate-400 dark:text-white/30 uppercase tracking-widest">
                        <FileText size={12} />
                        <span>{homeworks.filter(h => h.classId === selectedClass.id).length} Assignments</span>
                      </div>
                      <div className="w-1 h-1 bg-slate-200 dark:bg-white/10 rounded-full" />
                      <div className="flex items-center gap-1 text-xs font-bold text-slate-400 dark:text-white/30 uppercase tracking-widest">
                        <History size={12} />
                        <span>{submissions.filter(s => homeworks.filter(h => h.classId === selectedClass.id).map(h => h.id).includes(s.homeworkId)).length} Timelines</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-4">
                  <button 
                    onClick={() => {
                      setNewClassName(selectedClass.name);
                      setNewClassSection(selectedClass.section);
                      setNewClassTotal(String(selectedClass.totalStudents));
                      setPreviousStep('class-details');
                      setStep('edit-class');
                    }}
                    className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10 text-slate-900 dark:text-white font-bold px-6 py-3 rounded-xl flex items-center gap-2 transition-all"
                  >
                    <Settings size={20} className="text-slate-400" />
                    Edit Class
                  </button>
                  <button 
                    onClick={() => {
                      setNewStudentName('');
                      setNewStudentId('');
                      setStep('add-student');
                    }}
                    className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold px-6 py-3 rounded-xl flex items-center gap-2 transition-all"
                  >
                    <Plus size={20} />
                    Add Student
                  </button>
                </div>
              </div>

              {/* Class Performance Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-[#151515] border border-slate-200 dark:border-white/10 rounded-3xl p-6 space-y-2 shadow-sm">
                  <p className="text-sm uppercase tracking-widest font-bold text-slate-400 dark:text-white/30">Total Students</p>
                  <div className="flex items-center justify-between">
                    <h3 className="text-3xl font-black text-slate-900 dark:text-white">{students.filter(s => s.classId === selectedClass.id).length}</h3>
                    <Users className="text-emerald-500" size={24} />
                  </div>
                </div>
                <div className="bg-white dark:bg-[#151515] border border-slate-200 dark:border-white/10 rounded-3xl p-6 space-y-2 shadow-sm">
                  <p className="text-sm uppercase tracking-widest font-bold text-slate-400 dark:text-white/30">Technical</p>
                  <div className="flex items-center justify-between">
                    <h3 className="text-3xl font-black text-slate-900 dark:text-white">{homeworks.filter(h => h.classId === selectedClass.id && h.category === 'technical').length}</h3>
                    <FileText className="text-blue-500" size={24} />
                  </div>
                </div>
                <div className="bg-white dark:bg-[#151515] border border-slate-200 dark:border-white/10 rounded-3xl p-6 space-y-2 shadow-sm">
                  <p className="text-sm uppercase tracking-widest font-bold text-slate-400 dark:text-white/30">Paragraph</p>
                  <div className="flex items-center justify-between">
                    <h3 className="text-3xl font-black text-slate-900 dark:text-white">{homeworks.filter(h => h.classId === selectedClass.id && h.category === 'paragraph').length}</h3>
                    <History className="text-purple-500" size={24} />
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-[#151515] border border-slate-200 dark:border-white/10 rounded-3xl overflow-hidden shadow-sm">
                <div className="p-6 border-b border-slate-100 dark:border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-widest whitespace-nowrap">Student Roster</h3>
                  <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                    <div className="relative flex-1 sm:flex-none sm:min-w-[200px]">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input 
                        type="text"
                        placeholder="Search students..."
                        value={studentSearchQuery}
                        onChange={(e) => setStudentSearchQuery(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs font-bold text-slate-600 dark:text-white/60 placeholder:text-slate-400 dark:placeholder:text-white/30 focus:outline-none focus:border-emerald-500 transition-all"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Filter size={14} className="text-slate-400" />
                      <select 
                        className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-white/60 focus:outline-none focus:border-emerald-500 transition-all"
                        value={studentSortType}
                        onChange={(e) => setStudentSortType(e.target.value as any)}
                      >
                        <option value="name-asc">A-Z</option>
                        <option value="name-desc">Z-A</option>
                        <option value="ranked">Ranked</option>
                      </select>
                    </div>
                  </div>
                </div>
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-white/30 border-b border-slate-100 dark:border-white/5">
                      {studentSortType === 'ranked' && <th className="px-6 py-4">Rank</th>}
                      <th className="px-6 py-4">Student ID</th>
                      <th className="px-6 py-4">Name</th>
                      <th className="px-6 py-4">Submissions</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {sortedStudents.map((student, index) => (
                      <tr key={student.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-all">
                        {studentSortType === 'ranked' && (
                          <td className="px-6 py-4">
                            <div className={cn(
                              "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold",
                              index === 0 ? "bg-amber-500 text-white" : 
                              index === 1 ? "bg-slate-300 text-slate-700" :
                              index === 2 ? "bg-amber-700 text-white" : "bg-slate-100 dark:bg-white/5 text-slate-400"
                            )}>
                              {index + 1}
                            </div>
                          </td>
                        )}
                        <td className="px-6 py-4 font-mono text-emerald-500">{student.studentId}</td>
                        <td className="px-6 py-4 font-medium text-slate-700 dark:text-white">{student.name}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-white">{(student as any).submissionCount}</span>
                            <div className="w-16 h-1 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-emerald-500 rounded-full" 
                                style={{ width: `${Math.min(100, ((student as any).submissionCount / (homeworks.filter(h => h.classId === selectedClass.id).length || 1)) * 100)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right flex justify-end gap-3">
                          <button 
                            onClick={() => {
                              setEditingStudent(student);
                              setNewStudentName(student.name);
                              setNewStudentId(student.studentId);
                              setStep('edit-student');
                            }}
                            className="text-slate-400 dark:text-white/20 hover:text-emerald-500 transition-colors"
                            title="Edit Student"
                          >
                            <Settings size={16} />
                          </button>
                          <button 
                            onClick={() => {
                              setModal({
                                type: 'confirm',
                                title: 'Remove Student',
                                message: `Are you sure you want to remove ${student.name}?`,
                                onConfirm: () => handleRemoveStudent(selectedClass.id, student.id),
                                onCancel: () => setModal(null)
                              });
                            }}
                            className="text-slate-400 dark:text-white/20 hover:text-red-500 transition-colors"
                            title="Remove Student"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {sortedStudents.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-400 dark:text-white/20 italic">
                          No students added to this class yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {step === 'create-homework' && (
            <motion.div
              key="create"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-3xl mx-auto space-y-8"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setStep('dashboard')} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-all text-slate-500 dark:text-white/60">
                  <ArrowLeft size={24} />
                </button>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Create New Homework</h1>
              </div>

              <div className="bg-white dark:bg-[#151515] border border-slate-200 dark:border-white/10 rounded-3xl p-8 space-y-8 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-xs uppercase tracking-widest font-semibold text-slate-400 dark:text-white/40">Homework Title</label>
                    <input
                      type="text"
                      placeholder="e.g. Algebra Basics"
                      className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl py-4 px-4 focus:outline-none focus:border-emerald-500 transition-colors text-slate-900 dark:text-white shadow-sm"
                      value={newHw.title}
                      onChange={e => setNewHw(prev => ({ ...prev, title: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-xs uppercase tracking-widest font-semibold text-slate-400 dark:text-white/40">Select Class</label>
                    <div className="relative">
                      <select 
                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl py-4 px-4 focus:outline-none focus:border-emerald-500 transition-colors appearance-none text-slate-900 dark:text-white shadow-sm"
                        value={newHw.classId}
                        onChange={e => {
                          const classId = e.target.value;
                          const selectedClass = classes.find(c => c.id === classId);
                          setNewHw(prev => ({ 
                            ...prev, 
                            classId,
                            totalStrength: selectedClass?.totalStudents || 0
                          }));
                        }}
                      >
                        <option value="" className="text-slate-900 dark:text-white bg-white dark:bg-[#151515]">Select a class</option>
                        {classes.map(c => (
                          <option key={c.id} value={c.id} className="text-slate-900 dark:text-white bg-white dark:bg-[#151515]">
                            {c.name} - {c.section}
                          </option>
                        ))}
                      </select>
                      <ChevronRight size={18} className="absolute right-4 top-1/2 -translate-y-1/2 rotate-90 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs uppercase tracking-widest font-semibold text-slate-400 dark:text-white/40">Homework Description</label>
                  <textarea
                    placeholder="e.g. Introduction to linear equations and their applications."
                    rows={3}
                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl py-4 px-4 focus:outline-none focus:border-emerald-500 transition-colors text-slate-900 dark:text-white shadow-sm resize-none"
                    value={newHw.description}
                    onChange={e => setNewHw(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-xs uppercase tracking-widest font-semibold text-slate-400 dark:text-white/40">Subject Category</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => setNewHw(prev => ({ ...prev, category: 'technical' }))}
                      className={cn(
                        "flex items-center justify-center gap-3 p-4 rounded-2xl border transition-all",
                        newHw.category === 'technical' ? "bg-emerald-500/10 border-emerald-500 text-emerald-500" : "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-500 dark:text-white/60"
                      )}
                    >
                      Technical (Math, Physics)
                    </button>
                    <button
                      onClick={() => setNewHw(prev => ({ ...prev, category: 'paragraph' }))}
                      className={cn(
                        "flex items-center justify-center gap-3 p-4 rounded-2xl border transition-all",
                        newHw.category === 'paragraph' ? "bg-emerald-500/10 border-emerald-500 text-emerald-500" : "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-500 dark:text-white/60"
                      )}
                    >
                      Paragraph (History, Bio)
                    </button>
                  </div>
                </div>

                {/* AI Portal Sync Files */}
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-3xl p-6 space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0">
                      <Bot size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">AI Portal Sync Files</h3>
                      <p className="text-xs text-slate-500 dark:text-white/50 mt-1 leading-relaxed">
                        Upload the master question paper and solutions. The AI will use these to scan the school portal (e.g., Edunext, Google Classroom), find the matching assignment, and automatically retrieve and grade student submissions.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-white/40">Master Question Paper</label>
                      <div
                        className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center gap-3 transition-all cursor-pointer group relative ${
                          isDraggingQuestion ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-200 dark:border-white/10 hover:border-emerald-500/50 hover:bg-emerald-500/5'
                        }`}
                        onDragOver={(e) => { e.preventDefault(); setIsDraggingQuestion(true); }}
                        onDragLeave={() => setIsDraggingQuestion(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setIsDraggingQuestion(false);
                          if (e.dataTransfer.files?.[0]) {
                            setNewHw(prev => ({ ...prev, questionPaperUrl: e.dataTransfer.files![0].name }));
                          }
                        }}
                      >
                        <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400 group-hover:text-emerald-500 group-hover:bg-emerald-500/10 transition-colors">
                          <UploadCloud size={24} />
                        </div>
                        <div className="text-center">
                          <p className="text-xs font-bold text-slate-700 dark:text-white">Upload Question Paper</p>
                          <p className="text-[10px] text-slate-400 mt-1">PDF, JPG, PNG (Max 5MB)</p>
                        </div>
                        <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" onChange={(e) => {
                          if (e.target.files?.[0]) {
                            setNewHw(prev => ({ ...prev, questionPaperUrl: e.target.files![0].name }));
                          }
                        }} />
                      </div>
                      {newHw.questionPaperUrl && (
                        <div className="flex items-center gap-2 text-xs text-emerald-500 font-medium bg-emerald-500/10 p-2 rounded-lg">
                          <FileText size={14} />
                          {newHw.questionPaperUrl}
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-white/40">Master Solutions</label>
                      <div
                        className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center gap-3 transition-all cursor-pointer group relative ${
                          isDraggingSolution ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-200 dark:border-white/10 hover:border-emerald-500/50 hover:bg-emerald-500/5'
                        }`}
                        onDragOver={(e) => { e.preventDefault(); setIsDraggingSolution(true); }}
                        onDragLeave={() => setIsDraggingSolution(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setIsDraggingSolution(false);
                          if (e.dataTransfer.files?.[0]) {
                            setNewHw(prev => ({ ...prev, solutionPaperUrl: e.dataTransfer.files![0].name }));
                          }
                        }}
                      >
                        <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400 group-hover:text-emerald-500 group-hover:bg-emerald-500/10 transition-colors">
                          <UploadCloud size={24} />
                        </div>
                        <div className="text-center">
                          <p className="text-xs font-bold text-slate-700 dark:text-white">Upload Solutions</p>
                          <p className="text-[10px] text-slate-400 mt-1">PDF, JPG, PNG (Max 5MB)</p>
                        </div>
                        <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" onChange={(e) => {
                          if (e.target.files?.[0]) {
                            setNewHw(prev => ({ ...prev, solutionPaperUrl: e.target.files![0].name }));
                          }
                        }} />
                      </div>
                      {newHw.solutionPaperUrl && (
                        <div className="flex items-center gap-2 text-xs text-emerald-500 font-medium bg-emerald-500/10 p-2 rounded-lg">
                          <FileText size={14} />
                          {newHw.solutionPaperUrl}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Diagram Analysis Section */}
                  <div className="pt-4 border-t border-emerald-500/20">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id="diagram-analysis-toggle"
                          className="w-4 h-4 rounded border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-emerald-500 focus:ring-emerald-500"
                          checked={newHw.hasDiagram || false}
                          onChange={e => setNewHw(prev => ({ ...prev, hasDiagram: e.target.checked }))}
                        />
                        <label htmlFor="diagram-analysis-toggle" className="text-xs font-bold text-slate-900 dark:text-white">Require Diagram Analysis</label>
                      </div>

                      {newHw.hasDiagram && (
                        <div className="space-y-3 p-4 bg-white dark:bg-black/20 rounded-xl border border-dashed border-slate-200 dark:border-white/10">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-white/30">Reference Diagram</label>
                            {newHw.diagramUrl && (
                              <button 
                                onClick={() => setNewHw(prev => ({ ...prev, diagramUrl: undefined }))}
                                className="text-[10px] text-red-500 hover:underline"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                          
                          {!newHw.diagramUrl ? (
                            <div className="relative group cursor-pointer">
                              <input
                                type="file"
                                accept="image/*"
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                onChange={e => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    setNewHw(prev => ({ ...prev, diagramUrl: URL.createObjectURL(file) }));
                                  }
                                }}
                              />
                              <div className="flex flex-col items-center justify-center py-6 border-2 border-dashed border-slate-100 dark:border-white/5 rounded-xl group-hover:border-emerald-500/50 transition-colors">
                                <Upload size={20} className="text-slate-300 dark:text-white/20 mb-2" />
                                <p className="text-[10px] text-slate-400 dark:text-white/40">Drop reference diagram or click to upload</p>
                              </div>
                            </div>
                          ) : (
                            <div className="relative rounded-lg overflow-hidden border border-slate-100 dark:border-white/5 aspect-video">
                              <img src={newHw.diagramUrl} alt="Reference" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                                <p className="text-[10px] text-white font-bold">Reference Uploaded</p>
                              </div>
                            </div>
                          )}
                          <p className="text-[8px] text-slate-400 dark:text-white/20 italic">This diagram will be used by AI to verify student drawings and annotations.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-xs uppercase tracking-widest font-semibold text-slate-400 dark:text-white/40">Analysis Deadline</label>
                    <div className="relative">
                      <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 dark:text-white/30" size={18} />
                      <input
                        type="date"
                        className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:border-emerald-500 transition-colors text-slate-900 dark:text-white"
                        value={newHw.deadline}
                        onChange={e => setNewHw(prev => ({ ...prev, deadline: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-xs uppercase tracking-widest font-semibold text-slate-400 dark:text-white/40">Total Homeworks (Expected)</label>
                    <div className="relative">
                      <input
                        type="number"
                        className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl py-4 px-4 focus:outline-none focus:border-emerald-500 transition-colors text-slate-900 dark:text-white"
                        value={newHw.totalStrength || 0}
                        onChange={e => {
                          const val = parseInt(e.target.value) || 0;
                          const max = classes.find(c => c.id === newHw.classId)?.totalStudents || 0;
                          setNewHw(prev => ({ ...prev, totalStrength: Math.min(val, max) }));
                        }}
                        placeholder="Expected submissions"
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 dark:text-white/20 uppercase tracking-widest">
                        Max: {classes.find(c => c.id === newHw.classId)?.totalStudents || 0}
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleCreateHw}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-4 rounded-2xl transition-all shadow-lg shadow-emerald-500/20"
                >
                  Publish Homework & Start Analysis
                </button>
              </div>
            </motion.div>
          )}

          {step === 'homework-details' && selectedHomework && (
            <motion.div
              key="details"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button onClick={() => setStep('dashboard')} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-all text-slate-500 dark:text-white/60">
                    <ArrowLeft size={24} />
                  </button>
                  <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{selectedHomework.title}</h1>
                    <p className="text-slate-500 dark:text-white/50 text-sm">
                      {classes.find(c => c.id === selectedHomework.classId)?.name} • 
                      Deadline: {format(parseISO(selectedHomework.deadline), 'PPP')}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setStep('grading')}
                  className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold px-6 py-3 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
                >
                  <Upload size={18} />
                  Upload Answer Sheets
                </button>
              </div>

              {/* AI Portal Sync Panel */}
              {selectedHomework.questionPaperUrl && (
                <div className="bg-slate-900 dark:bg-black/40 border border-emerald-500/20 rounded-3xl p-6 shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500/20">
                    {selectedHomework.syncStatus === 'scanning' || selectedHomework.syncStatus === 'analyzing' ? (
                      <motion.div 
                        className="h-full bg-emerald-500"
                        initial={{ width: "0%" }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                    ) : (
                      <div className="h-full bg-emerald-500 w-full opacity-0" />
                    )}
                  </div>
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0 border border-emerald-500/20">
                        <Bot size={24} />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                          AI Portal Sync
                          <span className={cn(
                            "text-[10px] uppercase tracking-widest px-2 py-1 rounded-full font-bold",
                            selectedHomework.syncStatus === 'completed' ? "bg-emerald-500/20 text-emerald-400" :
                            selectedHomework.syncStatus === 'failed' ? "bg-red-500/20 text-red-400" :
                            selectedHomework.syncStatus === 'idle' ? "bg-slate-500/20 text-slate-400" :
                            "bg-amber-500/20 text-amber-400 animate-pulse"
                          )}>
                            {selectedHomework.syncStatus || 'idle'}
                          </span>
                        </h3>
                        <p className="text-sm text-slate-400 mt-1">
                          {selectedHomework.syncStatus === 'idle' && "Ready to scan portal for student submissions."}
                          {selectedHomework.syncStatus === 'scanning' && "Scanning portal for matching question paper..."}
                          {selectedHomework.syncStatus === 'analyzing' && "Retrieving and grading student submissions..."}
                          {selectedHomework.syncStatus === 'completed' && `Last synced: ${selectedHomework.lastSyncedAt ? format(parseISO(selectedHomework.lastSyncedAt), 'PPp') : 'Just now'}`}
                        </p>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => handleRunSync(selectedHomework)}
                      disabled={selectedHomework.syncStatus === 'scanning' || selectedHomework.syncStatus === 'analyzing'}
                      className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold px-6 py-3 rounded-xl flex items-center gap-2 transition-all shrink-0"
                    >
                      {selectedHomework.syncStatus === 'scanning' || selectedHomework.syncStatus === 'analyzing' ? (
                        <><RefreshCw size={18} className="animate-spin" /> Syncing...</>
                      ) : (
                        <><RefreshCw size={18} /> Run Portal Sync</>
                      )}
                    </button>
                  </div>
                  
                  {/* Sync Logs */}
                  {(selectedHomework.syncStatus === 'scanning' || selectedHomework.syncStatus === 'analyzing' || syncLogs.length > 0) && (
                    <div className="mt-6 bg-black/50 rounded-xl p-4 font-mono text-xs text-emerald-500/80 h-32 overflow-y-auto custom-scrollbar border border-white/5">
                      {syncLogs.map((log, i) => (
                        <div key={i} className="mb-1">{log}</div>
                      ))}
                      {(selectedHomework.syncStatus === 'scanning' || selectedHomework.syncStatus === 'analyzing') && (
                        <div className="animate-pulse">_</div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Stats Card */}
                <div className="lg:col-span-2 bg-white dark:bg-[#151515] border border-slate-200 dark:border-white/10 rounded-3xl p-8 flex flex-col md:flex-row items-center gap-8 shadow-sm">
                  <div className="w-full h-64 md:w-1/2">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={stats?.data}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {stats?.data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: '#151515', 
                            border: '1px solid rgba(255,255,255,0.1)', 
                            borderRadius: '12px',
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                          }}
                          itemStyle={{ color: '#fff', fontSize: '12px' }}
                        />
                        <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="w-full md:w-1/2 grid grid-cols-2 gap-4">
                    <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl hover:bg-emerald-500/10 transition-all">
                      <p className="text-[10px] uppercase tracking-widest font-bold text-emerald-500/60 mb-1">Perfect</p>
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats?.counts.perfect}</p>
                    </div>
                    <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl hover:bg-amber-500/10 transition-all">
                      <p className="text-[10px] uppercase tracking-widest font-bold text-amber-500/60 mb-1">Inaccurate</p>
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats?.counts.inaccurate}</p>
                    </div>
                    <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-2xl hover:bg-red-500/10 transition-all">
                      <p className="text-[10px] uppercase tracking-widest font-bold text-red-500/60 mb-1">Wrong</p>
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats?.counts.wrong}</p>
                    </div>
                    <div className="p-4 bg-slate-500/5 border border-slate-500/10 rounded-2xl hover:bg-slate-500/10 transition-all">
                      <p className="text-[10px] uppercase tracking-widest font-bold text-slate-500/60 mb-1">Unattempted</p>
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats?.counts.unattempted}</p>
                    </div>
                  </div>
                </div>

                {/* Question Info */}
                <div className="bg-white dark:bg-[#151515] border border-slate-200 dark:border-white/10 rounded-3xl p-8 space-y-6 shadow-sm">
                  <h3 className="text-lg font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                    <FileText size={20} className="text-emerald-500" />
                    Homework Files
                  </h3>
                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {selectedHomework.questionPaperUrl && (
                      <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/5 flex items-center gap-3">
                        <FileText className="text-emerald-500" size={24} />
                        <div>
                          <p className="text-xs text-slate-400 dark:text-white/30 font-bold uppercase tracking-widest">Question Paper</p>
                          <p className="text-sm font-medium text-slate-700 dark:text-white">{selectedHomework.questionPaperUrl}</p>
                        </div>
                      </div>
                    )}
                    {selectedHomework.solutionPaperUrl && (
                      <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/5 flex items-center gap-3">
                        <FileText className="text-emerald-500" size={24} />
                        <div>
                          <p className="text-xs text-slate-400 dark:text-white/30 font-bold uppercase tracking-widest">Master Solution</p>
                          <p className="text-sm font-medium text-slate-700 dark:text-white">{selectedHomework.solutionPaperUrl}</p>
                        </div>
                      </div>
                    )}
                    {selectedHomework.hasDiagram && selectedHomework.diagramUrl && (
                      <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/5 flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                          <FileText className="text-emerald-500" size={24} />
                          <div>
                            <p className="text-xs text-slate-400 dark:text-white/30 font-bold uppercase tracking-widest">Reference Diagram</p>
                          </div>
                        </div>
                        <div className="rounded-lg overflow-hidden border border-slate-200 dark:border-white/10">
                          <img src={selectedHomework.diagramUrl} alt="Reference Diagram" className="w-full h-auto" referrerPolicy="no-referrer" />
                        </div>
                      </div>
                    )}
                    {!selectedHomework.questionPaperUrl && !selectedHomework.solutionPaperUrl && !selectedHomework.diagramUrl && (
                      <p className="text-sm text-slate-500 dark:text-white/40 italic">No files uploaded for this homework.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* AI Class Performance Summary */}
              <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-3xl p-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                  <div className="space-y-2">
                    <h3 className="text-lg font-bold flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                      <Sparkles size={20} className="text-indigo-500" />
                      AI Class Performance Summary
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
                      Generate an AI-powered analysis of the entire class's performance on this assignment to identify common struggles and get actionable teaching recommendations.
                    </p>
                  </div>
                  
                  <button
                    onClick={() => handleGenerateClassSummary(selectedHomework.id)}
                    disabled={isGeneratingSummary}
                    className="shrink-0 flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-indigo-500/20"
                  >
                    {isGeneratingSummary ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Analyzing Data...
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        Generate Insights
                      </>
                    )}
                  </button>
                </div>

                <AnimatePresence>
                  {classSummary && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: 'auto', marginTop: 24 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="bg-white/60 dark:bg-black/20 backdrop-blur-sm border border-indigo-500/10 rounded-2xl p-6">
                        <div className="flex gap-4">
                          <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0 mt-1">
                            <Bot size={16} className="text-indigo-600 dark:text-indigo-400" />
                          </div>
                          <div className="space-y-4">
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-widest">AI Analysis</h4>
                            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                              {classSummary}
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Submissions List */}
              <div className="bg-white dark:bg-[#151515] border border-slate-200 dark:border-white/10 rounded-3xl overflow-hidden shadow-sm">
                <div className="p-6 border-b border-slate-100 dark:border-white/10 flex justify-between items-center">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Student Submissions</h3>
                  <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-white/40">
                    <Search size={14} />
                    <span>Search students...</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-white/5">
                        <th className="px-8 py-6 text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-white/30">Student</th>
                        <th className="px-8 py-6 text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-white/30">Status</th>
                        <th className="px-8 py-6 text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-white/30">Feedback</th>
                        <th className="px-8 py-6 text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-white/30">Submitted At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                      {submissions.filter(s => s.homeworkId === selectedHomework.id).map(s => (
                        <tr key={s.id} className="group hover:bg-slate-50 dark:hover:bg-white/2 transition-colors">
                          <td className="px-8 py-5">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-bold text-xs">
                                {s.studentName.charAt(0)}
                              </div>
                              <span className="font-medium text-slate-900 dark:text-white">{s.studentName}</span>
                            </div>
                          </td>
                          <td className="px-8 py-5">
                            <span className={cn(
                              "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest",
                              s.status === 'perfect' && "bg-emerald-500/10 text-emerald-500",
                              s.status === 'inaccurate' && "bg-amber-500/10 text-amber-500",
                              s.status === 'wrong' && "bg-red-500/10 text-red-500"
                            )}>
                              {s.status === 'perfect' && <CheckCircle2 size={12} />}
                              {s.status === 'inaccurate' && <AlertCircle size={12} />}
                              {s.status === 'wrong' && <XCircle size={12} />}
                              {s.status}
                            </span>
                          </td>
                          <td className="px-8 py-5">
                            <p className="text-sm text-slate-500 dark:text-white/60 max-w-xs truncate">{s.feedback}</p>
                          </td>
                          <td className="px-8 py-5 text-xs text-slate-400 dark:text-white/30">
                            {format(parseISO(s.submittedAt), 'MMM d, h:mm a')}
                          </td>
                        </tr>
                      ))}
                      {submissions.filter(s => s.homeworkId === selectedHomework.id).length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-8 py-16 text-center">
                            <div className="flex flex-col items-center gap-3 text-slate-400 dark:text-white/20">
                              <div className="w-16 h-16 rounded-full bg-slate-50 dark:bg-white/5 flex items-center justify-center mb-2">
                                <Search size={32} />
                              </div>
                              <p className="text-sm font-medium">No submissions analyzed yet</p>
                              <p className="text-xs max-w-[200px]">Upload answer sheets to start the AI grading process.</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {step === 'grading' && selectedHomework && (
            <motion.div
              key="grading"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-2xl mx-auto space-y-8"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setStep('homework-details')} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-all text-slate-500 dark:text-white/60">
                  <ArrowLeft size={24} />
                </button>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Analyze Answer Sheets</h1>
              </div>

              <div className="bg-white dark:bg-[#151515] border border-slate-200 dark:border-white/10 rounded-3xl p-8 space-y-8 shadow-sm">
                <div className="relative p-12 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-3xl flex flex-col items-center gap-4 hover:border-emerald-500/50 transition-all cursor-pointer group bg-slate-50/50 dark:bg-white/2 overflow-hidden">
                  <input 
                    type="file" 
                    accept="image/*,application/pdf" 
                    onChange={handleFileUpload}
                    disabled={isExtractingText}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
                  />
                  {isExtractingText ? (
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center shadow-sm">
                        <Loader2 className="text-emerald-500 animate-spin" size={32} />
                      </div>
                      <div className="text-center">
                        <p className="font-bold mb-1 text-slate-900 dark:text-white">AI is reading the document...</p>
                        <p className="text-xs text-slate-400 dark:text-white/30">Extracting handwritten and typed text</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="w-16 h-16 bg-white dark:bg-white/5 rounded-2xl flex items-center justify-center group-hover:bg-emerald-500/10 transition-all shadow-sm">
                        <Upload className="text-slate-300 dark:text-white/20 group-hover:text-emerald-500" size={32} />
                      </div>
                      <div className="text-center">
                        <p className="font-bold mb-1 text-slate-900 dark:text-white">Drop student answer files here</p>
                        <p className="text-xs text-slate-400 dark:text-white/30">Supports PDF, JPG, PNG or Text files</p>
                      </div>
                    </>
                  )}
                </div>

                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="h-px flex-1 bg-slate-100 dark:bg-white/10" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-white/20 whitespace-nowrap">or simulate a submission</span>
                    <div className="h-px flex-1 bg-slate-100 dark:bg-white/10" />
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-white/30 px-1">Student Name</label>
                      <input
                        id="student-name"
                        type="text"
                        placeholder="Enter student name..."
                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl py-4 px-4 focus:outline-none focus:border-emerald-500 transition-colors text-slate-900 dark:text-white shadow-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-white/30 px-1">Answer Content</label>
                      <textarea
                        id="student-answer"
                        placeholder="Paste student's answer text here for AI analysis..."
                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl py-4 px-4 focus:outline-none focus:border-emerald-500 transition-colors text-slate-900 dark:text-white shadow-sm"
                        rows={6}
                      />
                    </div>
                    <button
                      disabled={isGrading}
                      onClick={() => {
                        const name = (document.getElementById('student-name') as HTMLInputElement).value;
                        const answer = (document.getElementById('student-answer') as HTMLTextAreaElement).value;
                        if (name && answer) {
                          handleSimulateSubmission(name, answer);
                          (document.getElementById('student-name') as HTMLInputElement).value = '';
                          (document.getElementById('student-answer') as HTMLTextAreaElement).value = '';
                        }
                      }}
                      className={cn(
                        "w-full py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg",
                        isGrading 
                          ? "bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-white/20 cursor-not-allowed" 
                          : "bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/20"
                      )}
                    >
                      {isGrading ? (
                        <>
                          <div className="w-5 h-5 border-2 border-slate-200 dark:border-white/20 border-t-emerald-500 rounded-full animate-spin" />
                          AI Analyzing...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={20} />
                          Analyze Submission
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Simulated Submissions List */}
              {submissions.filter(s => s.homeworkId === selectedHomework.id).length > 0 && (
                <div className="bg-white dark:bg-[#151515] border border-slate-200 dark:border-white/10 rounded-3xl overflow-hidden shadow-sm">
                  <div className="p-6 border-b border-slate-100 dark:border-white/10">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Simulated Submissions</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-white/5">
                          <th className="px-8 py-6 text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-white/30">Student</th>
                          <th className="px-8 py-6 text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-white/30">Status</th>
                          <th className="px-8 py-6 text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-white/30">Feedback</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                        {submissions
                          .filter(s => s.homeworkId === selectedHomework.id)
                          .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
                          .map(s => (
                            <tr key={s.id} className="group hover:bg-slate-50 dark:hover:bg-white/2 transition-colors">
                              <td className="px-8 py-5">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-bold text-xs">
                                    {s.studentName.charAt(0)}
                                  </div>
                                  <span className="font-medium text-slate-900 dark:text-white">{s.studentName}</span>
                                </div>
                              </td>
                              <td className="px-8 py-5">
                                <span className={cn(
                                  "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest",
                                  s.status === 'perfect' && "bg-emerald-500/10 text-emerald-500",
                                  s.status === 'inaccurate' && "bg-amber-500/10 text-amber-500",
                                  s.status === 'wrong' && "bg-red-500/10 text-red-500"
                                )}>
                                  {s.status === 'perfect' && <CheckCircle2 size={12} />}
                                  {s.status === 'inaccurate' && <AlertCircle size={12} />}
                                  {s.status === 'wrong' && <XCircle size={12} />}
                                  {s.status}
                                </span>
                              </td>
                              <td className="px-8 py-5">
                                <p className="text-sm text-slate-500 dark:text-white/60 max-w-md">{s.feedback}</p>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Portal Switch Popup */}
      <AnimatePresence>
        {showPortalPopup && (
          <div key="portal-popup" className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPortalPopup(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-[#151515] border border-slate-200 dark:border-white/10 rounded-[32px] overflow-hidden shadow-2xl"
            >
              <div className="p-8 space-y-6">
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Switch Portal</h3>
                  <p className="text-slate-500 dark:text-white/40 text-sm">Select your preferred teaching platform.</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => setPortalType('google-classroom')}
                    className={cn(
                      "p-4 rounded-2xl border transition-all space-y-2 text-left",
                      portalType === 'google-classroom' 
                        ? "bg-emerald-500/10 border-emerald-500 text-emerald-500" 
                        : "bg-slate-50 dark:bg-white/5 border-transparent text-slate-400 dark:text-white/20 hover:border-slate-200 dark:hover:border-white/10"
                    )}
                  >
                    <School size={24} />
                    <span className="block text-xs font-bold uppercase tracking-widest">Google Classroom</span>
                  </button>
                  <button 
                    onClick={() => setPortalType('canvas')}
                    className={cn(
                      "p-4 rounded-2xl border transition-all space-y-2 text-left",
                      portalType === 'canvas' 
                        ? "bg-emerald-500/10 border-emerald-500 text-emerald-500" 
                        : "bg-slate-50 dark:bg-white/5 border-transparent text-slate-400 dark:text-white/20 hover:border-slate-200 dark:hover:border-white/10"
                    )}
                  >
                    <Globe size={24} />
                    <span className="block text-xs font-bold uppercase tracking-widest">Canvas LMS</span>
                  </button>
                  <button 
                    onClick={() => setPortalType('edunext')}
                    className={cn(
                      "p-4 rounded-2xl border transition-all space-y-2 text-left",
                      portalType === 'edunext' 
                        ? "bg-emerald-500/10 border-emerald-500 text-emerald-500" 
                        : "bg-slate-50 dark:bg-white/5 border-transparent text-slate-400 dark:text-white/20 hover:border-slate-200 dark:hover:border-white/10"
                    )}
                  >
                    <Globe size={24} />
                    <span className="block text-xs font-bold uppercase tracking-widest">Edunext</span>
                  </button>
                  <button 
                    onClick={() => setPortalType('custom')}
                    className={cn(
                      "p-4 rounded-2xl border transition-all space-y-2 text-left",
                      portalType === 'custom' 
                        ? "bg-emerald-500/10 border-emerald-500 text-emerald-500" 
                        : "bg-slate-50 dark:bg-white/5 border-transparent text-slate-400 dark:text-white/20 hover:border-slate-200 dark:hover:border-white/10"
                    )}
                  >
                    <Globe size={24} />
                    <span className="block text-xs font-bold uppercase tracking-widest">Custom Portal</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {portalType !== 'custom' && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-white/30 ml-1">
                        {portalType === 'canvas' ? 'Canvas Instance URL' : portalType === 'edunext' ? 'Edunext Instance URL' : 'Portal URL'}
                      </label>
                      <input 
                        type="text"
                        value={portalUrl}
                        onChange={(e) => setPortalUrl(e.target.value)}
                        placeholder={portalType === 'canvas' ? 'e.g., canvas.instructure.com' : portalType === 'edunext' ? 'e.g., school.edunext.co' : 'e.g., mylms.school.edu'}
                        className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      />
                    </div>
                  )}
                  {(portalType === 'canvas' || portalType === 'edunext') && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-white/30 ml-1">API Access Token</label>
                      <input 
                        type="password"
                        placeholder="Paste your API token here"
                        onChange={(e) => {
                          if (e.target.value) {
                            localStorage.setItem(`${portalType}_token`, e.target.value);
                          }
                        }}
                        className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      />
                      <p className="text-[10px] text-slate-400 dark:text-white/40 ml-1">
                        Required for syncing. Generate this in your {portalType === 'canvas' ? 'Canvas' : 'Edunext'} account settings.
                      </p>
                    </div>
                  )}
                  {portalType === 'custom' && (
                    <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl flex gap-3 items-start">
                      <Info className="text-blue-500 shrink-0 mt-0.5" size={16} />
                      <p className="text-xs text-blue-600 dark:text-blue-400 font-medium leading-relaxed">
                        Custom portals do not use API tokens. To sync grades, please install the GradeAI Chrome Extension and use it directly on your school's website!
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setShowPortalPopup(false)}
                    className="flex-1 py-3 rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-white/60 font-bold text-sm hover:bg-slate-200 dark:hover:bg-white/10 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={async () => {
                      if (user) {
                        const finalUrl = portalType === 'custom' ? 'Custom Portal (via Extension)' : portalUrl;
                        await updateDoc(doc(db, 'users', user.uid), {
                          portalType,
                          portalUrl: finalUrl
                        });
                        setUserProfile(prev => prev ? { ...prev, portalType, portalUrl: finalUrl } : null);
                        setShowPortalPopup(false);
                      }
                    }}
                    className="flex-1 py-3 rounded-2xl bg-emerald-500 text-black font-bold text-sm hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {modal && (
          <div key="custom-modal" className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-md bg-white dark:bg-[#151515] border border-slate-200 dark:border-white/10 rounded-3xl p-8 shadow-2xl"
            >
              <h3 className="text-xl font-bold mb-2 text-slate-900 dark:text-white">{modal.title}</h3>
              <p className="text-slate-500 dark:text-white/50 text-sm mb-6">{modal.message}</p>
              
              {modal.type === 'prompt' && (
                <input
                  autoFocus
                  type="text"
                  defaultValue={modal.value}
                  className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl py-4 px-4 mb-8 focus:outline-none focus:border-emerald-500 transition-colors text-slate-900 dark:text-white"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') modal.onConfirm(e.currentTarget.value);
                    if (e.key === 'Escape') modal.onCancel();
                  }}
                />
              )}

              <div className="flex gap-4">
                <button
                  onClick={() => modal.onCancel()}
                  className="flex-1 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-900 dark:text-white font-bold py-4 rounded-2xl transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (modal.type === 'prompt') {
                      const input = document.querySelector('input[type="text"]') as HTMLInputElement;
                      modal.onConfirm(input?.value);
                    } else {
                      modal.onConfirm();
                    }
                  }}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-4 rounded-2xl transition-all shadow-lg shadow-emerald-500/20"
                >
                  {modal.type === 'confirm' ? 'Confirm' : 'Continue'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
