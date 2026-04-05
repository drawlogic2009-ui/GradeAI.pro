import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  Calendar as CalendarIcon,
  Camera,
  X,
  Download,
  MoreVertical,
  Bell,
  ListChecks,
  HelpCircle,
  CheckSquare,
  Eye,
  Star,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { format, isAfter, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, getDay } from 'date-fns';
import { GoogleGenAI } from "@google/genai";
import { auth, db } from './firebase';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { collection, doc, setDoc, getDoc, onSnapshot, query, where, deleteDoc, writeBatch } from 'firebase/firestore';
import { cn } from './lib/utils';
import { 
  PortalType, 
  ClassInfo, 
  AnalysisReport, 
  SubjectCategory, 
  Submission, 
  GradeStatus,
  Student,
  ModalState,
  BatchResult,
  UploadedFile,
  QuestionAnalysis
} from './types';

const COLORS = {
  perfect: '#10b981', // emerald-500
  inaccurate: '#f59e0b', // amber-500
  wrong: '#ef4444', // red-500
  unattempted: '#64748b', // slate-500
};

const MOCK_CHART_DATA = [
  { name: 'Mon', submissions: 45 },
  { name: 'Tue', submissions: 52 },
  { name: 'Wed', submissions: 38 },
  { name: 'Thu', submissions: 65 },
  { name: 'Fri', submissions: 48 },
  { name: 'Sat', submissions: 24 },
  { name: 'Sun', submissions: 18 },
];

// --- AI Service (Restoring your original logic) ---
// -------------------------------------------------------------------------
// AI ENGINE: Gemini 3.1 Flash (Google GenAI)
// This application is powered by real-time multimodal AI.
// It is NOT a simulation. The "AI Magic" button triggers real-time 
// analysis of student scripts using Gemini's vision and reasoning.
// -------------------------------------------------------------------------
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// --- Helper Functions ---
const cleanJson = (text: string) => {
  if (!text) return '{}';
  return text.replace(/```json/g, '').replace(/```/g, '').trim();
};

async function gradeAnswer(
  report: AnalysisReport, 
  studentAnswer: string,
  studentImageBase64?: string | null,
  studentImageMimeType?: string | null
): Promise<{ 
  status: GradeStatus; 
  feedback: string; 
  score?: string; 
  questionBreakdown?: QuestionAnalysis[];
  keywords?: { student: string[], answerKey: string[] };
}> {
  const model = "gemini-3-flash-preview";
  
  let prompt = `
    Grade this student's answer for the analysis report titled "${report.title}".
    Category: ${report.category}
    Description: ${report.description}
    
    The student's answer text is:
    ${studentAnswer}
    
    You need to evaluate this answer based on the assignment's context. 
    
    ${report.category === 'technical' ? `
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
    
    ${report.questionBank ? `Question Bank: ${report.questionBank}` : ''}
    ${report.answerKey ? `Answer Key: ${report.answerKey}` : ''}
    
    Criteria:
    - "perfect": The answer is completely correct and matches the expected solution.
    - "inaccurate": The answer is partially correct, has minor errors, or is missing some context/steps.
    - "wrong": The answer is completely incorrect or irrelevant.
    
    Return JSON: { 
      "status": "perfect" | "inaccurate" | "wrong", 
      "feedback": "brief explanation", 
      "score": "e.g. 18/20",
      "questionBreakdown": [
        {
          "questionNumber": 1,
          "status": "Perfect" | "Inaccurate" | "Wrong",
          "feedback": "Brief feedback for this question"
        }
      ],
      "keywords": {
        "student": ["list", "of", "keywords", "found", "in", "student", "answer"],
        "answerKey": ["list", "of", "keywords", "found", "in", "answer", "key"]
      }
    }
    
    IMPORTANT: For paragraph-based subjects, the "keywords" object is MANDATORY. Identify the most important technical terms, concepts, or names.
  `;

  try {
    const contents: any = { parts: [{ text: prompt }] };
    if (studentImageBase64 && studentImageMimeType) {
      contents.parts.push({ inlineData: { data: studentImageBase64, mimeType: studentImageMimeType } });
    }
    
    // If the report has question/solution paper URLs, we can't easily send them as images unless we fetch them,
    // but we can mention them. However, for Individual Grading, the user might have just uploaded them.
    // For now, we rely on the text context and the student answer image.
    
    const response = await ai.models.generateContent({ model, contents, config: { responseMimeType: "application/json" } });
    return JSON.parse(cleanJson(response.text || "{}"));
  } catch (error) {
    console.error("AI Grading failed:", error);
    return { status: 'wrong', feedback: "Error during AI analysis." };
  }
}

// --- Components ---

function HighlightedText({ text, keywords, color = 'indigo' }: { text: string, keywords?: string[], color?: 'indigo' | 'emerald' | 'amber' | 'red' }) {
  if (!keywords || keywords.length === 0) return <p className="text-sm leading-relaxed">{text}</p>;

  const colorClasses = {
    indigo: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300',
    emerald: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
    amber: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
    red: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
  };

  // Sort keywords by length descending to avoid partial matches within longer keywords
  const sortedKeywords = [...keywords].sort((a, b) => b.length - a.length);
  const regex = new RegExp(`(${sortedKeywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  
  const parts = text.split(regex);

  return (
    <p className="text-sm leading-relaxed">
      {parts.map((part, i) => {
        const isKeyword = sortedKeywords.some(k => k.toLowerCase() === part.toLowerCase());
        if (isKeyword) {
          return (
            <span key={i} className={cn("px-1 rounded font-semibold", colorClasses[color])}>
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

function SidebarLink({ icon, label, active, onClick, expanded = true }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void, expanded?: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
        expanded ? "w-full" : "w-12 justify-center px-0",
        active 
          ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200 dark:shadow-none" 
          : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/5"
      )}
      title={!expanded ? label : undefined}
    >
      <div className={cn(!active && "text-slate-400")}>
        {icon}
      </div>
      {expanded && <span>{label}</span>}
    </button>
  );
}

function StatCard({ icon, label, value, trend }: { icon: React.ReactNode, label: string, value: string, trend: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
          {icon}
        </div>
        <span className="text-xs font-medium text-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded-full">
          {trend}
        </span>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{label}</p>
      <h4 className="text-2xl font-bold mt-1">{value}</h4>
    </div>
  );
}

function Modal({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800"
      >
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-xl font-bold">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </motion.div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'classes' | 'students' | 'reports' | 'batch' | 'activity' | 'calendar' | 'individual-grading' | 'settings'>('dashboard');
  const [selectedReport, setSelectedReport] = useState<AnalysisReport | null>(null);
  const [isGrading, setIsGrading] = useState(false);
  const [isExtractingText, setIsExtractingText] = useState(false);
  const [studentImageBase64, setStudentImageBase64] = useState<string | null>(null);
  const [studentImageMimeType, setStudentImageMimeType] = useState<string | null>(null);
  const [studentAnswerText, setStudentAnswerText] = useState('');
  const [currentStudentName, setCurrentStudentName] = useState('');
  const [individualGrade, setIndividualGrade] = useState<GradeStatus | null>(null);
  const [individualFeedback, setIndividualFeedback] = useState('');
  const [individualScore, setIndividualScore] = useState('');
  const [individualQuestionBreakdown, setIndividualQuestionBreakdown] = useState<QuestionAnalysis[]>([]);
  const [individualKeywords, setIndividualKeywords] = useState<{ student: string[], answerKey: string[] } | null>(null);

  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [viewingResult, setViewingResult] = useState<BatchResult | null>(null);

  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
  const [currentTier, setCurrentTier] = useState<'free' | 'pro' | 'pro+'>('pro');
  
  // Calendar State
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [calendarEvents, setCalendarEvents] = useState<{id: string, date: string, title: string, type: 'holiday'|'important'}[]>([
    { id: '1', date: '2026-04-10', title: 'Good Friday', type: 'holiday' },
    { id: '2', date: '2026-04-12', title: 'Easter Sunday', type: 'holiday' },
  ]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventType, setNewEventType] = useState<'important' | 'holiday'>('important');
  
  // Notifications State
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState(false);

  const handleViewAnalysis = (result: BatchResult) => {
    setViewingResult(result);
    setIsAnalysisModalOpen(true);
  };

  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) {
      alert("This browser does not support desktop notification");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      setNotificationsEnabled(true);
      new Notification("Notifications Enabled", {
        body: "You will now receive alerts for grading completion and important events."
      });
    }
  };

  const handleNotificationClick = () => {
    setShowNotificationsDropdown(!showNotificationsDropdown);
  };

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    setIsEventModalOpen(true);
  };

  const handleAddEvent = async () => {
    if (selectedDate && newEventTitle && user) {
      const newEventId = Math.random().toString(36).substr(2, 9);
      const newEvent = {
        date: format(selectedDate, 'yyyy-MM-dd'),
        title: newEventTitle,
        type: newEventType,
        teacherId: user.uid,
        createdAt: new Date().toISOString()
      };
      
      try {
        await setDoc(doc(db, 'calendarEvents', newEventId), newEvent);
        setIsEventModalOpen(false);
        setNewEventTitle('');
      } catch (error) {
        console.error("Error adding event:", error);
      }
    }
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart);
  const paddingDays = Array.from({ length: startDayOfWeek }).map((_, i) => null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        // Fetch user profile to get tier
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          setCurrentTier(userDoc.data().currentTier || 'free');
        } else {
          // Create new user profile
          await setDoc(userDocRef, {
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName,
            photoURL: currentUser.photoURL,
            currentTier: 'free',
            createdAt: new Date().toISOString()
          });
          setCurrentTier('free');
        }
      }
      
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Login failed:", error);
      if (error.code === 'auth/popup-blocked') {
        setAuthError("Popup was blocked by your browser. Please allow popups for this site or open the app in a new tab.");
      } else if (error.code === 'auth/cancelled-popup-request') {
        // Ignore, user just clicked multiple times or closed it
      } else if (error.code === 'auth/popup-closed-by-user') {
        // Ignore, user closed the popup
      } else {
        setAuthError(error.message || "An error occurred during login. Please try again.");
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  useEffect(() => {
    if (!user) return;

    const qClasses = query(collection(db, 'classes'), where('teacherId', '==', user.uid));
    const unsubClasses = onSnapshot(qClasses, (snapshot) => {
      setClasses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ClassInfo)));
    });

    const qStudents = query(collection(db, 'students'), where('teacherId', '==', user.uid));
    const unsubStudents = onSnapshot(qStudents, (snapshot) => {
      setStudents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)));
    });

    const qReports = query(collection(db, 'reports'), where('teacherId', '==', user.uid));
    const unsubReports = onSnapshot(qReports, (snapshot) => {
      setReports(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AnalysisReport)));
    });

    const qSubmissions = query(collection(db, 'submissions'), where('teacherId', '==', user.uid));
    const unsubSubmissions = onSnapshot(qSubmissions, (snapshot) => {
      setSubmissions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Submission)));
    });

    const qEvents = query(collection(db, 'calendarEvents'), where('teacherId', '==', user.uid));
    const unsubEvents = onSnapshot(qEvents, (snapshot) => {
      setCalendarEvents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
    });

    return () => {
      unsubClasses();
      unsubStudents();
      unsubReports();
      unsubSubmissions();
      unsubEvents();
    };
  }, [user]);

  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [reports, setReports] = useState<AnalysisReport[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);

  // Batch State
  const [batchTitle, setBatchTitle] = useState('');
  const [batchClassId, setBatchClassId] = useState('');
  const [batchCategory, setBatchCategory] = useState<SubjectCategory>('technical');
  const [studentFiles, setStudentFiles] = useState<UploadedFile[]>([]);
  const [questionBank, setQuestionBank] = useState('');
  const [answerKey, setAnswerKey] = useState('');
  const [questionPaperFile, setQuestionPaperFile] = useState<UploadedFile | null>(null);
  const [solutionPaperFile, setSolutionPaperFile] = useState<UploadedFile | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [estimatedTime, setEstimatedTime] = useState<number | null>(null);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [selectedBatchResult, setSelectedBatchResult] = useState<BatchResult | null>(null);
  const [dashboardClassFilter, setDashboardClassFilter] = useState<string>('all');

  // Modals
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [isBulkStudentModalOpen, setIsBulkStudentModalOpen] = useState(false);
  const [bulkStudentFile, setBulkStudentFile] = useState<UploadedFile | null>(null);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [bulkImportClassId, setBulkImportClassId] = useState('');
  const [isDeleteConfirmModalOpen, setIsDeleteConfirmModalOpen] = useState(false);
  const [classToDelete, setClassToDelete] = useState<ClassInfo | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // New Class State
  const [newClassName, setNewClassName] = useState('');
  const [newClassSection, setNewClassSection] = useState('');
  const [newClassTotal, setNewClassTotal] = useState('');

  // New Student State
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentId, setNewStudentId] = useState('');
  const [newStudentClassId, setNewStudentClassId] = useState('');
  const [studentClassFilter, setStudentClassFilter] = useState<string>('all');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('gradeai_theme') as 'dark' | 'light') || 'dark';
  });



  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('gradeai_theme', theme);
  }, [theme]);

  // --- Stats Calculation ---
  const stats = useMemo(() => {
    const totalClasses = classes.length;
    const totalStudents = dashboardClassFilter === 'all' 
      ? students.length 
      : students.filter(s => s.classId === dashboardClassFilter).length;
    
    // Map report IDs to class IDs for filtering submissions
    const reportToClassMap = new Map(reports.map(r => [r.id, r.classId]));
    
    // Filter submissions based on class filter
    const filteredSubmissions = dashboardClassFilter === 'all'
      ? submissions
      : submissions.filter(s => reportToClassMap.get(s.homeworkId) === dashboardClassFilter);

    const totalSubmissions = filteredSubmissions.length;
    const totalReports = dashboardClassFilter === 'all'
      ? reports.length
      : reports.filter(r => r.classId === dashboardClassFilter).length;
    
    // Calculate Class Proficiency based on 'perfect' vs others in filtered submissions
    const perfectCount = filteredSubmissions.filter(s => s.status === 'perfect').length;
    const proficiency = totalSubmissions > 0 ? ((perfectCount / totalSubmissions) * 100).toFixed(1) : '0.0';

    // Calculate Average Score
    let avgScore = 0;
    let scoredSubmissions = 0;
    filteredSubmissions.forEach(s => {
      if (s.score && s.score.includes('/')) {
        const [obtained, total] = s.score.split('/').map(n => parseFloat(n));
        if (!isNaN(obtained) && !isNaN(total) && total > 0) {
          avgScore += (obtained / total) * 100;
          scoredSubmissions++;
        }
      }
    });
    const averageScore = scoredSubmissions > 0 ? (avgScore / scoredSubmissions).toFixed(1) : '0.0';

    // Dynamic Chart Data - Aggregate by Report
    const filteredReports = dashboardClassFilter === 'all'
      ? reports
      : reports.filter(r => r.classId === dashboardClassFilter);

    const lastReports = filteredReports.slice(-5);
    const reportProgress = lastReports.map(r => {
      const reportSubmissions = filteredSubmissions.filter(s => s.homeworkId === r.id);
      return {
        name: r.title.length > 10 ? r.title.substring(0, 10) + '...' : r.title,
        fullTitle: r.title,
        perfect: reportSubmissions.filter(s => s.status === 'perfect').length,
        inaccurate: reportSubmissions.filter(s => s.status === 'inaccurate').length,
        wrong: reportSubmissions.filter(s => s.status === 'wrong').length,
        total: reportSubmissions.length
      };
    });

    // If no reports yet, fallback to the 7-day view
    const fallbackData = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const dateStr = d.toISOString().split('T')[0];
      const daySubmissions = filteredSubmissions.filter(s => s.submittedAt.startsWith(dateStr));
      return {
        name: format(d, 'EEE'),
        perfect: daySubmissions.filter(s => s.status === 'perfect').length,
        inaccurate: daySubmissions.filter(s => s.status === 'inaccurate').length,
        wrong: daySubmissions.filter(s => s.status === 'wrong').length,
        total: daySubmissions.length
      };
    });

    const chartData = reportProgress.length > 0 ? reportProgress : fallbackData;

    return { totalClasses, totalStudents, totalSubmissions, totalReports, proficiency, averageScore, chartData, filteredSubmissions };
  }, [classes, students, submissions, reports, dashboardClassFilter]);

  const batchAnalysisData = useMemo(() => {
    if (!selectedReport || selectedReport.results.length === 0) return null;
    
    const overall: Record<string, number> = {
      Perfect: 0,
      Inaccurate: 0,
      Wrong: 0
    };
    
    const questionWise: Record<number, { Perfect: number, Inaccurate: number, Wrong: number }> = {};
    
    selectedReport.results.forEach(result => {
      // Normalize status to match overall keys
      const status = result.status.charAt(0).toUpperCase() + result.status.slice(1).toLowerCase();
      if (overall[status] !== undefined) {
        overall[status]++;
      }
      
      result.questionBreakdown?.forEach(q => {
        if (!questionWise[q.questionNumber]) {
          questionWise[q.questionNumber] = { Perfect: 0, Inaccurate: 0, Wrong: 0 };
        }
        const qStatus = q.status.charAt(0).toUpperCase() + q.status.slice(1).toLowerCase();
        if (questionWise[q.questionNumber][qStatus as keyof typeof overall] !== undefined) {
          questionWise[q.questionNumber][qStatus as keyof typeof overall]++;
        }
      });
    });
    
    const overallChartData = Object.entries(overall).map(([name, value]) => ({ name, value }));
    const questionChartData = Object.entries(questionWise).map(([qNum, counts]) => ({
      questionNumber: parseInt(qNum),
      data: Object.entries(counts).map(([name, value]) => ({ name, value }))
    })).sort((a, b) => a.questionNumber - b.questionNumber);
    
    return { overallChartData, questionChartData };
  }, [selectedReport]);

  const handleAddClass = async () => {
    if (!newClassName || !user) return;
    const newClassId = Math.random().toString(36).substr(2, 9);
    const newClass = {
      name: newClassName,
      section: newClassSection,
      teacherId: user.uid,
      createdAt: new Date().toISOString()
    };
    
    try {
      await setDoc(doc(db, 'classes', newClassId), newClass);
      setIsClassModalOpen(false);
      setNewClassName('');
      setNewClassSection('');
      setNewClassTotal('');
    } catch (error) {
      console.error("Error adding class:", error);
    }
  };

  const handleAddStudent = async () => {
    if (!newStudentName || !newStudentClassId || !user) return;
    const newStudentId = Math.random().toString(36).substr(2, 9);
    const newStudent = {
      name: newStudentName,
      classId: newStudentClassId,
      teacherId: user.uid,
      createdAt: new Date().toISOString()
    };
    
    try {
      await setDoc(doc(db, 'students', newStudentId), newStudent);
      setIsStudentModalOpen(false);
      setNewStudentName('');
      setNewStudentId('');
      setNewStudentClassId('');
    } catch (error) {
      console.error("Error adding student:", error);
    }
  };

  const handleBulkStudentImport = async () => {
    if (!bulkStudentFile || !bulkImportClassId) return;
    setIsBulkProcessing(true);
    
    try {
      const model = "gemini-3-flash-preview";
      const fileData = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const base64 = (e.target?.result as string).split(',')[1];
          resolve(base64);
        };
        reader.readAsDataURL(bulkStudentFile.file);
      });

      const prompt = `
        Extract a list of students from this file. 
        Return a JSON array of objects, where each object has "name" and "studentId".
        If studentId is not found, generate a unique one.
        Format: [{"name": "Student Name", "studentId": "ID123"}]
      `;

      const result = await ai.models.generateContent({
        model,
        contents: {
          parts: [
            { text: prompt }, 
            { inlineData: { data: fileData, mimeType: bulkStudentFile.file.type } }
          ]
        },
        config: { responseMimeType: 'application/json' }
      });

      const extractedStudents = JSON.parse(cleanJson(result.text || '[]'));
      const newStudents: Student[] = extractedStudents.map((s: any) => ({
        id: Math.random().toString(36).substr(2, 9),
        name: s.name,
        studentId: s.studentId || Math.random().toString(36).substr(2, 6).toUpperCase(),
        classId: bulkImportClassId
      }));

      setStudents([...students, ...newStudents]);
      setIsBulkStudentModalOpen(false);
      setBulkStudentFile(null);
      setBulkImportClassId('');
    } catch (error) {
      console.error("Bulk import failed:", error);
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleConfirmDeleteClass = async () => {
    if (!classToDelete) return;
    
    const classId = classToDelete.id;
    
    try {
      const batch = writeBatch(db);
      
      // 1. Delete the class
      batch.delete(doc(db, 'classes', classId));
      
      // 2. Delete all students in that class
      const studentsToDelete = students.filter(s => s.classId === classId);
      studentsToDelete.forEach(s => batch.delete(doc(db, 'students', s.id)));
      
      // 3. Find all reports for that class
      const reportsToDelete = reports.filter(r => r.classId === classId);
      const reportIdsToDelete = reportsToDelete.map(r => r.id);
      
      // 4. Delete the reports
      reportsToDelete.forEach(r => batch.delete(doc(db, 'reports', r.id)));
      
      // 5. Delete all submissions related to those reports
      const submissionsToDelete = submissions.filter(s => reportIdsToDelete.includes(s.reportId || s.homeworkId));
      submissionsToDelete.forEach(s => batch.delete(doc(db, 'submissions', s.id)));
      
      await batch.commit();
      
      // Reset state
      setIsDeleteConfirmModalOpen(false);
      setClassToDelete(null);
      if (dashboardClassFilter === classId) setDashboardClassFilter('all');
      if (studentClassFilter === classId) setStudentClassFilter('all');
    } catch (error) {
      console.error("Error deleting class:", error);
    }
  };

  const [isClearDataModalOpen, setIsClearDataModalOpen] = useState(false);

  const handleClearAllData = async () => {
    if (!user) return;
    try {
      const batch = writeBatch(db);
      classes.forEach(c => batch.delete(doc(db, 'classes', c.id)));
      students.forEach(s => batch.delete(doc(db, 'students', s.id)));
      reports.forEach(r => batch.delete(doc(db, 'reports', r.id)));
      submissions.forEach(s => batch.delete(doc(db, 'submissions', s.id)));
      calendarEvents.forEach(e => batch.delete(doc(db, 'calendarEvents', e.id)));
      await batch.commit();
      setIsClearDataModalOpen(false);
    } catch (error) {
      console.error("Error clearing data:", error);
    }
  };

  const handleRecheck = (result: BatchResult) => {
    setSelectedBatchResult(result);
    setCurrentStudentName(result.studentName);
    setStudentAnswerText(result.feedback); // Use feedback as a placeholder if text isn't extracted
    setIndividualGrade(result.status.toLowerCase() as GradeStatus);
    setIndividualScore(result.score);
    setIndividualFeedback(result.feedback);
    setIndividualQuestionBreakdown(result.questionBreakdown || []);
    setIndividualKeywords(result.keywords || null);
    
    // Set the image if we have it
    if (result.fileData) {
      const [mimePart, base64Part] = result.fileData.split(';base64,');
      setStudentImageMimeType(mimePart.split(':')[1]);
      setStudentImageBase64(base64Part);
    }
    
    setActiveTab('individual-grading');
  };

  const handleIndividualFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExtractingText(true);
    setStudentImageMimeType(file.type);

    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
      });
      setStudentImageBase64(base64);

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            { text: "Extract all the handwritten or typed text from this student's answer sheet. Return ONLY the extracted text, nothing else. If it's illegible, reply with 'Illegible text'." },
            { inlineData: { data: base64, mimeType: file.type } }
          ]
        }
      });

      setStudentAnswerText(response.text || '');
    } catch (error) {
      console.error("OCR failed:", error);
      alert("Failed to extract text from image.");
    } finally {
      setIsExtractingText(false);
    }
  };

  const handleIndividualGrade = async () => {
    if (!selectedReport || !studentAnswerText) return;
    setIsGrading(true);
    setIndividualGrade(null);

    try {
      const result = await gradeAnswer(selectedReport, studentAnswerText, studentImageBase64, studentImageMimeType);
      
      setIndividualGrade(result.status);
      setIndividualFeedback(result.feedback);
      setIndividualScore(result.score || '');
      setIndividualQuestionBreakdown(result.questionBreakdown || []);
      setIndividualKeywords(result.keywords || null);

      const newSubmission: Submission = {
        id: Math.random().toString(36).substr(2, 9),
        homeworkId: selectedReport.id,
        studentId: 'individual-student',
        studentName: currentStudentName || 'Anonymous Student',
        content: studentAnswerText,
        status: result.status,
        feedback: result.feedback,
        submittedAt: new Date().toISOString(),
        score: result.score,
        keywords: result.keywords
      };

      setSubmissions(prev => [newSubmission, ...prev]);
    } catch (error) {
      console.error("Analysis failed:", error);
      alert("AI Analysis failed. Please try again.");
    } finally {
      setIsGrading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map(file => ({
        file,
        preview: URL.createObjectURL(file),
        id: Math.random().toString(36).substr(2, 9)
      }));
      setStudentFiles(prev => [...prev, ...newFiles]);
    }
  };

  const processBatch = async () => {
    if (studentFiles.length === 0) {
      alert("Please upload at least one student answer sheet.");
      return;
    }

    if (!batchTitle || !batchClassId) {
      alert("Please provide a Title and select a Class.");
      return;
    }

    // Firewall: Ensure Question Paper and Answer Key are provided (either text or file)
    const hasQuestion = questionBank.trim().length > 0 || questionPaperFile !== null;
    const hasAnswerKey = answerKey.trim().length > 0 || solutionPaperFile !== null;

    if (!hasQuestion || !hasAnswerKey) {
      alert("FIREWALL: You must provide both a Question Paper and an Answer Key (either as text or uploaded files) before running AI analysis.");
      return;
    }

    setIsProcessing(true);
    setProcessingStage('Analyzing Reference Materials...');
    setBatchResults([]);
    
    // Estimate: 15s for reference + 10s per student
    const totalEstimate = 15 + (studentFiles.length * 10);
    setEstimatedTime(totalEstimate);

    const newReportId = Math.random().toString(36).substr(2, 9);
    const newReport: AnalysisReport = {
      id: newReportId,
      classId: batchClassId,
      teacherId: user?.uid || 'guest',
      title: batchTitle,
      description: `Analysis for ${batchTitle}`,
      category: batchCategory,
      createdAt: new Date().toISOString(),
      status: 'processing',
      totalFiles: studentFiles.length,
      processedFiles: 0,
      results: [],
      questionBank,
      answerKey,
      questionPaperUrl: questionPaperFile?.preview,
      solutionPaperUrl: solutionPaperFile?.preview
    };

    try {
      await setDoc(doc(db, 'reports', newReportId), newReport);
    } catch (error) {
      console.error("Error creating report:", error);
    }

    try {
      const results: BatchResult[] = [];

      // STAGE 1: AI Analysis of Question Paper & Answer Key
      setProcessingStage('AI analyzing Question Paper & Answer Key...');
      
      const questionPaperBase64 = questionPaperFile ? await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(questionPaperFile.file);
      }) : null;

      const solutionPaperBase64 = solutionPaperFile ? await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(solutionPaperFile.file);
      }) : null;

      const referencePrompt = `
        You are an expert curriculum analyst powered by Gemini. Analyze the provided Question Paper and Master Answer Key.
        
        CONTEXT:
        ${questionBank ? `Question Bank Text: ${questionBank}` : ''}
        ${answerKey ? `Answer Key Text: ${answerKey}` : ''}
        
        TASKS:
        1. Extract all questions and their marks.
        2. Understand the "Master Solution" logic. 
           - For Math/Technical: Note that there can be multiple valid ways to solve (at least 3).
           - For Paragraphs: Identify critical keywords and synonyms that MUST be present.
        3. Create a "Master Grading Schema" that the grading AI will use.
        
        Return a structured summary of the exam context.
      `;

      const referenceContents: any = [{ text: referencePrompt }];
      if (questionPaperBase64 && questionPaperFile) {
        referenceContents.push({ inlineData: { data: questionPaperBase64, mimeType: questionPaperFile.file.type } });
      }
      if (solutionPaperBase64 && solutionPaperFile) {
        referenceContents.push({ inlineData: { data: solutionPaperBase64, mimeType: solutionPaperFile.file.type } });
      }

      const referenceResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: { parts: referenceContents }
      });

      const masterContext = referenceResponse.text || "Standard grading context applied.";

      // STAGE 2: Batch Processing Student Scripts
      for (let i = 0; i < studentFiles.length; i++) {
        const remainingStudents = studentFiles.length - i;
        setEstimatedTime(remainingStudents * 10);
        setProcessingStage(`AI grading student paper ${i + 1} of ${studentFiles.length}...`);
        const fileData = studentFiles[i];
        const base64Data = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(fileData.file);
        });

        const gradingPrompt = `
          You are an AI Examiner powered by Gemini. Grade this student's answer sheet.
          
          MASTER EXAM CONTEXT (Analyzed from Question Paper & Answer Key):
          ${masterContext}
          
          GRADING INSTRUCTIONS:
          1. Identify student name.
          2. For Math: Be creative. If the student uses a different but logically sound method (even if not the primary one), give full marks.
          3. For Paragraphs: Check for the highlighted keywords and context.
          4. Evaluate accuracy, logic, and completeness.
          
          Return ONLY a JSON object:
          {
            "studentName": "Name",
            "score": "Score",
            "feedback": "Brief feedback",
            "status": "Perfect" | "Inaccurate" | "Wrong",
            "questionBreakdown": [
              {
                "questionNumber": 1,
                "status": "Perfect" | "Inaccurate" | "Wrong",
                "feedback": "Brief feedback"
              }
            ],
            "keywords": {
              "student": ["list", "of", "keywords", "found", "in", "student", "answer"],
              "answerKey": ["list", "of", "keywords", "found", "in", "answer", "key"]
            }
          }
        `;

        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: {
            parts: [
              { text: gradingPrompt },
              { inlineData: { data: base64Data, mimeType: fileData.file.type } }
            ]
          },
          config: { responseMimeType: "application/json" }
        });

        const data = JSON.parse(cleanJson(response.text || '{}'));
        const fullFileData = `data:${fileData.file.type};base64,${base64Data}`;
        
        const result: BatchResult = {
          id: fileData.id,
          fileName: fileData.file.name,
          fileData: fullFileData,
          studentName: data.studentName || 'Unknown',
          score: data.score || 'N/A',
          feedback: data.feedback || 'No feedback provided',
          status: data.status || 'Inaccurate',
          questionBreakdown: data.questionBreakdown || [],
          keywords: data.keywords
        };
        results.push(result);
        setBatchResults([...results]);

        // Update the report progress
        setReports(prev => prev.map(r => r.id === newReport.id ? {
          ...r,
          processedFiles: i + 1,
          results: [...results]
        } : r));

        // Global submissions for activity log
        const submissionId = Math.random().toString(36).substr(2, 9);
        const newSubmission: Submission = {
          id: submissionId,
          reportId: newReportId,
          homeworkId: newReportId,
          teacherId: user?.uid || 'guest',
          studentId: 'batch-student',
          studentName: result.studentName,
          content: 'Batch processed file',
          fileData: fullFileData,
          questionBreakdown: result.questionBreakdown,
          status: result.status.toLowerCase() as GradeStatus,
          feedback: result.feedback,
          submittedAt: new Date().toISOString(),
          fileName: result.fileName,
          score: result.score,
          keywords: result.keywords
        };
        
        try {
          await setDoc(doc(db, 'submissions', submissionId), newSubmission);
          
          // Update report in Firestore
          await setDoc(doc(db, 'reports', newReportId), {
            ...newReport,
            processedFiles: i + 1,
            results: [...results],
            status: i + 1 === studentFiles.length ? 'completed' : 'processing'
          }, { merge: true });
        } catch (error) {
          console.error("Error saving submission/report:", error);
        }
      }

      // Finalize report status
      setReports(prev => prev.map(r => r.id === newReport.id ? {
        ...r,
        status: 'completed'
      } : r));

      alert("Batch Analysis Completed! Check the Reports section.");
      setActiveTab('reports');
    } catch (error) {
      console.error("Batch processing failed:", error);
      setReports(prev => prev.map(r => r.id === newReport.id ? {
        ...r,
        status: 'failed'
      } : r));
      alert("An error occurred during processing.");
    } finally {
      setIsProcessing(false);
      setBatchTitle('');
      setBatchClassId('');
      setStudentFiles([]);
      setQuestionBank('');
      setAnswerKey('');
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 p-8 text-center space-y-8">
          <div className="mx-auto w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center mb-6">
            <GraduationCap className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">LoomisAI</h1>
          <p className="text-slate-500 dark:text-slate-400">Sign in to manage your classes, students, and AI-powered grading.</p>
          
          {authError && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400 text-left flex gap-3 items-start">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p>{authError}</p>
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="w-full flex items-center justify-center gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-6 py-4 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoggingIn ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            )}
            {isLoggingIn ? 'Signing in...' : 'Continue with Google'}
          </button>
          
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <a 
              href={window.location.href} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline flex items-center justify-center gap-1"
            >
              <ExternalLink className="w-4 h-4" />
              Open in new tab (if login fails)
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans">
      {/* Analysis Detail Modal */}
      <Modal 
        isOpen={isAnalysisModalOpen} 
        onClose={() => setIsAnalysisModalOpen(false)} 
        title={`AI Analysis: ${viewingResult?.studentName}`}
      >
        {viewingResult && (
          <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Overall Score</p>
                <p className="text-2xl font-black text-indigo-600">{viewingResult.score}</p>
              </div>
              <div className={cn(
                "px-3 py-1 rounded-full text-xs font-bold uppercase",
                viewingResult.status === 'Perfect' ? 'bg-emerald-100 text-emerald-700' :
                viewingResult.status === 'Inaccurate' ? 'bg-amber-100 text-amber-700' :
                'bg-red-100 text-red-700'
              )}>
                {viewingResult.status}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase">AI Feedback</p>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{viewingResult.feedback}</p>
            </div>

            {selectedReport?.category === 'paragraph' && viewingResult.keywords && (
              <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-indigo-500 uppercase">Keyword Analysis (Student)</p>
                  <div className="p-3 bg-indigo-50/30 dark:bg-indigo-900/10 rounded-lg border border-indigo-100 dark:border-indigo-800/50">
                    <HighlightedText text={viewingResult.feedback} keywords={viewingResult.keywords.student} color="indigo" />
                  </div>
                </div>
                {selectedReport.answerKey && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-emerald-500 uppercase">Keyword Analysis (Key)</p>
                    <div className="p-3 bg-emerald-50/30 dark:bg-emerald-900/10 rounded-lg border border-emerald-100 dark:border-emerald-800/50">
                      <HighlightedText text={selectedReport.answerKey} keywords={viewingResult.keywords.answerKey} color="emerald" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {viewingResult.questionBreakdown && viewingResult.questionBreakdown.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Question Breakdown</p>
                <div className="grid grid-cols-1 gap-3">
                  {viewingResult.questionBreakdown.map((q) => (
                    <div key={q.questionNumber} className={cn(
                      "p-3 rounded-lg border-l-4",
                      q.status === 'Perfect' ? 'bg-emerald-50/30 border-emerald-500' :
                      q.status === 'Inaccurate' ? 'bg-amber-50/30 border-amber-500' :
                      'bg-red-50/30 border-red-500'
                    )}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold">Question {q.questionNumber}</span>
                        <span className="text-[10px] font-bold uppercase">{q.status}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400">{q.feedback}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-6 flex gap-3">
              <button 
                onClick={() => { setIsAnalysisModalOpen(false); handleRecheck(viewingResult); }}
                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all"
              >
                Open in Re-check Mode
              </button>
              <button 
                onClick={() => setIsAnalysisModalOpen(false)}
                className="px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Bulk Student Import Modal */}
      <Modal 
        isOpen={isBulkStudentModalOpen} 
        onClose={() => setIsBulkStudentModalOpen(false)} 
        title="Bulk Student Import"
      >
        <div className="space-y-6">
          <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800/50">
            <p className="text-sm text-indigo-700 dark:text-indigo-300 leading-relaxed">
              Upload an image (JPG/PNG) or a document (PDF/DOCX) containing your class list. 
              Our AI will automatically extract student names and IDs.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Target Class</label>
              <select 
                value={bulkImportClassId} 
                onChange={(e) => setBulkImportClassId(e.target.value)} 
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select Class</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.section})</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500 uppercase">Class List File</label>
              <div 
                className={cn(
                  "border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer",
                  bulkStudentFile ? "border-indigo-500 bg-indigo-50/30" : "border-slate-200 dark:border-slate-800 hover:border-indigo-300"
                )}
                onClick={() => document.getElementById('bulk-student-upload')?.click()}
              >
                <input 
                  id="bulk-student-upload" 
                  type="file" 
                  className="hidden" 
                  accept=".jpg,.jpeg,.png,.pdf,.docx"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setBulkStudentFile({
                        file,
                        preview: URL.createObjectURL(file),
                        id: Math.random().toString(36).substr(2, 9)
                      });
                    }
                  }}
                />
                {bulkStudentFile ? (
                  <div className="flex items-center justify-center gap-3">
                    <FileText className="w-8 h-8 text-indigo-600" />
                    <div className="text-left">
                      <p className="text-sm font-bold truncate max-w-[200px]">{bulkStudentFile.file.name}</p>
                      <p className="text-[10px] text-slate-500">{(bulkStudentFile.file.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <UploadCloud className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                    <p className="text-sm font-medium">Click to upload class list</p>
                    <p className="text-[10px] text-slate-400 mt-1">Supports JPG, PNG, PDF, DOCX</p>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button 
              onClick={() => setIsBulkStudentModalOpen(false)}
              className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={handleBulkStudentImport}
              disabled={!bulkStudentFile || !bulkImportClassId || isBulkProcessing}
              className={cn(
                "flex-1 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2",
                !bulkStudentFile || !bulkImportClassId || isBulkProcessing
                  ? "bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                  : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200 dark:shadow-none"
              )}
            >
              {isBulkProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Start Import
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Class Confirmation Modal */}
      <Modal 
        isOpen={isDeleteConfirmModalOpen} 
        onClose={() => setIsDeleteConfirmModalOpen(false)} 
        title="Delete Class?"
      >
        <div className="space-y-6">
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-800/50 flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <div className="space-y-2">
              <p className="text-sm font-bold text-red-700 dark:text-red-300">This action is permanent!</p>
              <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed">
                Deleting <span className="font-bold">"{classToDelete?.name}"</span> will also permanently delete:
              </p>
              <ul className="text-xs text-red-600 dark:text-red-400 list-disc list-inside space-y-1">
                <li>All students registered in this class</li>
                <li>All analysis reports (homework, exams)</li>
                <li>All student submissions and AI analysis data</li>
              </ul>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button 
              onClick={() => setIsDeleteConfirmModalOpen(false)}
              className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={handleConfirmDeleteClass}
              className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 shadow-lg shadow-red-200 dark:shadow-none transition-all"
            >
              Delete Everything
            </button>
          </div>
        </div>
      </Modal>

      {/* Sidebar */}
      <aside className={cn(
        "fixed left-0 top-0 bottom-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-50 hidden lg:flex flex-col transition-all duration-300 no-print",
        isSidebarExpanded ? "w-64" : "w-20"
      )}>
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-200 dark:shadow-none shrink-0">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            {isSidebarExpanded && (
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 to-teal-600 whitespace-nowrap">
                LoomisAI{currentTier === 'pro' ? '.Pro' : currentTier === 'pro+' ? '.Pro+' : ''}
              </span>
            )}
          </div>
          <button 
            onClick={() => setIsSidebarExpanded(!isSidebarExpanded)} 
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 flex justify-center shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
          <SidebarLink icon={<LayoutDashboard className="w-5 h-5" />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} expanded={isSidebarExpanded} />
          <SidebarLink icon={<BookOpen className="w-5 h-5" />} label="My Classes" active={activeTab === 'classes'} onClick={() => setActiveTab('classes')} expanded={isSidebarExpanded} />
          <SidebarLink icon={<Users className="w-5 h-5" />} label="Students" active={activeTab === 'students'} onClick={() => setActiveTab('students')} expanded={isSidebarExpanded} />
          <SidebarLink icon={<BarChart3 className="w-5 h-5" />} label="Analysis Reports" active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} expanded={isSidebarExpanded} />
          <SidebarLink icon={<Edit3 className="w-5 h-5" />} label="Individual Grading" active={activeTab === 'individual-grading'} onClick={() => setActiveTab('individual-grading')} expanded={isSidebarExpanded} />
          <SidebarLink icon={<Sparkles className="w-5 h-5" />} label="Batch Grade" active={activeTab === 'batch'} onClick={() => setActiveTab('batch')} expanded={isSidebarExpanded} />
          <SidebarLink icon={<History className="w-5 h-5" />} label="Activity Log" active={activeTab === 'activity'} onClick={() => setActiveTab('activity')} expanded={isSidebarExpanded} />
          <SidebarLink icon={<CalendarIcon className="w-5 h-5" />} label="Calendar" active={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} expanded={isSidebarExpanded} />
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-2">
          {isSidebarExpanded && (
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 mb-2">
              <div className="flex items-center gap-3 mb-3">
                {user?.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || 'User'} className="w-10 h-10 rounded-full" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold">
                    {user?.displayName?.charAt(0) || 'T'}
                  </div>
                )}
                <div className="overflow-hidden">
                  <p className="text-sm font-semibold truncate">{user?.displayName || 'Teacher'}</p>
                  <p className="text-xs text-slate-500 truncate capitalize">{currentTier} Plan</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <button 
                  onClick={() => setActiveTab('settings')}
                  className={cn(
                    "flex items-center gap-2 text-sm transition-colors",
                    activeTab === 'settings' 
                      ? "text-emerald-600 dark:text-emerald-400 font-semibold" 
                      : "text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400"
                  )}
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </button>
                <button 
                  onClick={handleLogout}
                  className="text-slate-400 hover:text-red-500 transition-colors"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
          {!isSidebarExpanded && (
            <button 
              onClick={() => setActiveTab('settings')}
              className={cn(
                "w-12 h-12 flex items-center justify-center rounded-xl transition-colors mx-auto mb-2",
                activeTab === 'settings' 
                  ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400" 
                  : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
              )}
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className={cn(
        "min-h-screen flex flex-col transition-all duration-300",
        isSidebarExpanded ? "lg:ml-64" : "lg:ml-20"
      )}>
        <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-40 px-6 flex items-center justify-between no-print">
          <h2 className="text-lg font-semibold capitalize">{activeTab.replace('-', ' ')}</h2>
          <div className="flex items-center gap-4">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="text" placeholder="Search anything..." className="pl-10 pr-4 py-2 rounded-full bg-slate-100 dark:bg-slate-800 border-none text-sm focus:ring-2 focus:ring-emerald-500 outline-none w-64 transition-all" />
            </div>
            <div className="relative">
              <button 
                onClick={handleNotificationClick}
                className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors relative"
              >
                <Bell className="w-5 h-5" />
                <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-slate-900"></span>
              </button>
              {showNotificationsDropdown && (
                <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                    <h3 className="font-bold">Notifications</h3>
                    {!notificationsEnabled && (
                      <button onClick={requestNotificationPermission} className="text-xs text-emerald-600 hover:underline">
                        Enable Desktop Alerts
                      </button>
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto p-2">
                    <div className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer">
                      <p className="text-sm font-medium">Welcome to LoomisAI!</p>
                      <p className="text-xs text-slate-500 mt-1">Start by adding a class and uploading some student papers.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="p-6 max-w-7xl mx-auto">
          {activeTab === 'dashboard' && (
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold">Dashboard Overview</h3>
                  <p className="text-slate-500">Welcome back, Professor!</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <select 
                      value={dashboardClassFilter} 
                      onChange={(e) => setDashboardClassFilter(e.target.value)}
                      className="bg-transparent text-sm font-bold outline-none border-none focus:ring-0"
                    >
                      <option value="all">All Classes</option>
                      {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard icon={<BookOpen className="text-blue-600" />} label="Total Classes" value={stats.totalClasses.toString()} trend="Live" />
                <StatCard icon={<Users className="text-indigo-600" />} label="Total Students" value={stats.totalStudents.toString()} trend="Live" />
                <StatCard icon={<Sparkles className="text-amber-600" />} label="Class Proficiency" value={`${stats.proficiency}%`} trend="Live" />
                <StatCard icon={<Activity className="text-emerald-600" />} label="Average Score" value={`${stats.averageScore}%`} trend="Live" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="font-bold text-lg">Class Progress Rate</h3>
                        <p className="text-xs text-slate-500">Accumulation of student performance across recent reports</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Perfect</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Inaccurate</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Wrong</span>
                        </div>
                      </div>
                    </div>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <AreaChart data={stats.chartData}>
                          <defs>
                            <linearGradient id="colorPerfect" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorInaccurate" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.1}/>
                              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorWrong" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                              <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis 
                            dataKey="name" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{fontSize: 10, fill: '#94a3b8'}} 
                            dy={10} 
                          />
                          <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{fontSize: 12, fill: '#94a3b8'}} 
                            label={{ value: 'Student Count', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' } }}
                            domain={[0, 'auto']}
                            allowDecimals={false}
                          />
                          <Tooltip 
                            contentStyle={{backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff', padding: '12px'}} 
                            itemStyle={{fontSize: '12px', fontWeight: 'bold'}}
                            cursor={{stroke: '#6366f1', strokeWidth: 2}}
                            formatter={(value: any, name: string) => [value, name.charAt(0).toUpperCase() + name.slice(1)]}
                            labelFormatter={(label) => `Report: ${label}`}
                          />
                          <Area type="monotone" dataKey="perfect" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorPerfect)" />
                          <Area type="monotone" dataKey="inaccurate" stroke="#f59e0b" strokeWidth={3} fillOpacity={1} fill="url(#colorInaccurate)" />
                          <Area type="monotone" dataKey="wrong" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorWrong)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <h3 className="font-bold text-lg mb-6">Recent Activity</h3>
                  <div className="space-y-6">
                    {stats.filteredSubmissions.slice(0, 5).map((sub) => (
                      <div key={sub.id} className="flex gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center",
                          sub.status === 'perfect' ? 'bg-emerald-100 text-emerald-600' :
                          sub.status === 'wrong' ? 'bg-red-100 text-red-600' :
                          'bg-amber-100 text-amber-600'
                        )}>
                          {sub.status === 'perfect' ? <CheckCircle2 className="w-5 h-5" /> : 
                           sub.status === 'wrong' ? <XCircle className="w-5 h-5" /> : 
                           <AlertCircle className="w-5 h-5" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{sub.studentName} submission</p>
                          <p className="text-xs text-slate-500 truncate">{sub.fileName || 'Manual entry'}</p>
                          <p className="text-[10px] text-slate-400 mt-1">{format(new Date(sub.submittedAt), 'MMM d, h:mm a')}</p>
                        </div>
                      </div>
                    ))}
                    {stats.filteredSubmissions.length === 0 && (
                      <div className="text-center py-8 text-slate-500">
                        <History className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p className="text-sm">No submissions found</p>
                      </div>
                    )}
                  </div>
                  <button onClick={() => setActiveTab('activity')} className="w-full mt-6 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors">
                    View All Activity
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'classes' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold">Your Classes</h3>
                <button onClick={() => setIsClassModalOpen(true)} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition-all">
                  <Plus className="w-4 h-4" /> Add Class
                </button>
              </div>
              {classes.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
                  <BookOpen className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                  <h4 className="text-lg font-bold">No classes found</h4>
                  <p className="text-slate-500 mb-6">Create your first class to start managing students and homework.</p>
                  <button onClick={() => setIsClassModalOpen(true)} className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold">Create Class</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {classes.map(c => (
                    <div key={c.id} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-4">
                        <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                          <BookOpen className="w-6 h-6" />
                        </div>
                        <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full text-xs font-medium text-slate-600 dark:text-slate-400">
                          Section {c.section}
                        </span>
                      </div>
                      <h4 className="text-xl font-bold mb-1">{c.name}</h4>
                      <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">{c.totalStudents} Students Enrolled</p>
                      <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                        <button 
                          onClick={() => {
                            setStudentClassFilter(c.id);
                            setActiveTab('students');
                          }} 
                          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
                        >
                          View Students
                        </button>
                        <div className="relative">
                          <button 
                            onClick={() => setActiveMenuId(activeMenuId === c.id ? null : c.id)}
                            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          
                          {activeMenuId === c.id && (
                            <>
                              <div 
                                className="fixed inset-0 z-10" 
                                onClick={() => setActiveMenuId(null)}
                              />
                              <div className="absolute right-0 bottom-full mb-2 w-48 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl z-20 overflow-hidden py-1">
                                <button 
                                  onClick={() => {
                                    setClassToDelete(c);
                                    setIsDeleteConfirmModalOpen(true);
                                    setActiveMenuId(null);
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                                >
                                  <Trash2 className="w-4 h-4" /> Delete Class
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'students' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold">Students Directory</h3>
                  <p className="text-sm text-slate-500">Manage all students across your classes</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <select 
                      value={studentClassFilter} 
                      onChange={(e) => setStudentClassFilter(e.target.value)}
                      className="bg-transparent text-sm font-bold outline-none border-none focus:ring-0"
                    >
                      <option value="all">All Classes</option>
                      {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <button 
                    onClick={() => setIsBulkStudentModalOpen(true)} 
                    className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                  >
                    <Upload className="w-4 h-4" /> Bulk Import
                  </button>
                  <button 
                    onClick={() => setIsStudentModalOpen(true)} 
                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition-all"
                  >
                    <UserPlus className="w-4 h-4" /> Add Student
                  </button>
                </div>
              </div>
              {students.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
                  <Users className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                  <h4 className="text-lg font-bold">No students found</h4>
                  <p className="text-slate-500">Students will appear here once you add them to your classes.</p>
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                        <th className="p-4 font-semibold text-sm">Name</th>
                        <th className="p-4 font-semibold text-sm">Student ID</th>
                        <th className="p-4 font-semibold text-sm">Class</th>
                        <th className="p-4 font-semibold text-sm">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {students
                        .filter(s => studentClassFilter === 'all' || s.classId === studentClassFilter)
                        .map(s => (
                        <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="p-4 font-medium">{s.name}</td>
                          <td className="p-4 text-sm text-slate-500">{s.studentId}</td>
                          <td className="p-4 text-sm">{classes.find(c => c.id === s.classId)?.name || 'N/A'}</td>
                          <td className="p-4">
                            <button onClick={() => setStudents(prev => prev.filter(st => st.id !== s.id))} className="text-red-500 hover:text-red-600 p-1"><Trash2 className="w-4 h-4" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {students.filter(s => studentClassFilter === 'all' || s.classId === studentClassFilter).length === 0 && (
                    <div className="p-12 text-center text-slate-500">
                      <p>No students found for the selected class.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="space-y-6">
              {!selectedReport ? (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="text-2xl font-bold">Analysis Reports</h3>
                    <button onClick={() => setActiveTab('batch')} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition-all">
                      <PlusCircle className="w-4 h-4" /> New Analysis
                    </button>
                  </div>
                  {reports.length === 0 ? (
                    <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
                      <BarChart3 className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                      <h4 className="text-lg font-bold">No reports found</h4>
                      <p className="text-slate-500 mb-6">Start a batch grading process to generate your first analysis report.</p>
                      <button onClick={() => setActiveTab('batch')} className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold">Go to Batch Grade</button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {reports.map(r => (
                        <div 
                          key={r.id} 
                          onClick={() => setSelectedReport(r)}
                          className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm cursor-pointer hover:border-indigo-500 transition-all group"
                        >
                          <div className="flex justify-between items-start mb-4">
                            <h4 className="text-lg font-bold group-hover:text-indigo-600 transition-colors">{r.title}</h4>
                            <span className={cn(
                              "px-2 py-1 text-[10px] font-bold uppercase rounded",
                              r.status === 'completed' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600' :
                              r.status === 'processing' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600' :
                              'bg-red-50 dark:bg-red-900/30 text-red-600'
                            )}>
                              {r.status}
                            </span>
                          </div>
                          <p className="text-sm text-slate-500 mb-4 line-clamp-2">{r.description}</p>
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <div className="flex items-center gap-1"><Clock className="w-3 h-3" /> {format(new Date(r.createdAt), 'MMM d, h:mm a')}</div>
                            <div className="flex items-center gap-1"><Users className="w-3 h-3" /> {r.processedFiles}/{r.totalFiles} Files</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-8">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <button onClick={() => setSelectedReport(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                      </button>
                      <div>
                        <h3 className="text-2xl font-bold">{selectedReport.title}</h3>
                        <p className="text-slate-500">Detailed Analysis Report</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => setActiveTab('individual-grading')}
                        className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-lg font-semibold hover:bg-slate-50 transition-all"
                      >
                        <Edit3 className="w-4 h-4" /> Manual Grade
                      </button>
                      <button className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition-all">
                        <Download className="w-4 h-4" /> Export PDF
                      </button>
                    </div>
                  </div>

                  {batchAnalysisData && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <h3 className="font-bold text-lg mb-4">Overall Performance</h3>
                        <div className="h-[250px]">
                          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                            <PieChart>
                              <Pie
                                data={batchAnalysisData.overallChartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                              >
                                {batchAnalysisData.overallChartData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={COLORS[entry.name.toLowerCase() as keyof typeof COLORS]} />
                                ))}
                              </Pie>
                              <Tooltip />
                              <Legend />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        {(selectedReport.questionPaperUrl || selectedReport.solutionPaperUrl) && (
                          <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 space-y-3">
                            <p className="text-xs font-bold text-slate-400 uppercase">Reference Materials</p>
                            <div className="flex flex-wrap gap-2">
                              {selectedReport.questionPaperUrl && (
                                <a href={selectedReport.questionPaperUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs font-medium hover:bg-slate-100 transition-all">
                                  <FileText className="w-3 h-3 text-indigo-600" /> Question Paper
                                </a>
                              )}
                              {selectedReport.solutionPaperUrl && (
                                <a href={selectedReport.solutionPaperUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs font-medium hover:bg-slate-100 transition-all">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Answer Key
                                </a>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                        <h3 className="font-bold text-lg mb-4">Question-wise Analysis</h3>
                        <div className="flex gap-6 overflow-x-auto pb-4 custom-scrollbar">
                          {batchAnalysisData.questionChartData.map((qData) => (
                            <div key={qData.questionNumber} className="flex-shrink-0 w-[200px] text-center p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                              <p className="text-sm font-bold mb-2">Question {qData.questionNumber}</p>
                              <div className="h-[120px]">
                                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                                  <PieChart>
                                    <Pie
                                      data={qData.data}
                                      cx="50%"
                                      cy="50%"
                                      outerRadius={45}
                                      dataKey="value"
                                    >
                                      {qData.data.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[entry.name.toLowerCase() as keyof typeof COLORS]} />
                                      ))}
                                    </Pie>
                                    <Tooltip />
                                  </PieChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          ))}
                          {batchAnalysisData.questionChartData.length === 0 && (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-sm py-12">
                              <HelpCircle className="w-8 h-8 mb-2 opacity-20" />
                              <p>No question-wise data available.</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
                      <h3 className="font-bold text-lg">Student Results</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-500">{selectedReport.results.length} Students Processed</span>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                            <th className="p-4 font-semibold text-sm">Student Name</th>
                            <th className="p-4 font-semibold text-sm">Score</th>
                            <th className="p-4 font-semibold text-sm">Status</th>
                            <th className="p-4 font-semibold text-sm">AI Feedback</th>
                            <th className="p-4 font-semibold text-sm text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {selectedReport.results.map((result) => (
                            <tr key={result.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                              <td className="p-4 font-medium">{result.studentName}</td>
                              <td className="p-4 font-bold text-indigo-600">{result.score}</td>
                              <td className="p-4">
                                <span className={cn(
                                  "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                                  result.status === 'Perfect' ? 'bg-emerald-100 text-emerald-700' :
                                  result.status === 'Inaccurate' ? 'bg-amber-100 text-amber-700' :
                                  'bg-red-100 text-red-700'
                                )}>
                                  {result.status}
                                </span>
                              </td>
                              <td className="p-4 text-sm text-slate-500 dark:text-slate-400 max-w-xs truncate" title={result.feedback}>
                                {result.feedback}
                              </td>
                              <td className="p-4 text-right">
                                <div className="flex items-center justify-end gap-3">
                                  <button 
                                    onClick={() => handleViewAnalysis(result)}
                                    className="text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 font-bold text-xs flex items-center gap-1"
                                  >
                                    <Eye className="w-3 h-3" /> View
                                  </button>
                                  <button 
                                    onClick={() => handleRecheck(result)}
                                    className="text-indigo-600 hover:text-indigo-700 font-bold text-xs flex items-center gap-1"
                                  >
                                    <RefreshCw className="w-3 h-3" /> Re-check
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'individual-grading' && (
            <div className="space-y-6">
              {!selectedReport ? (
                <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
                  <Edit3 className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                  <h4 className="text-lg font-bold">No report selected</h4>
                  <p className="text-slate-500 mb-6">Select an analysis report first to use its criteria for manual grading.</p>
                  <button onClick={() => setActiveTab('reports')} className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold">Go to Reports</button>
                </div>
              ) : (
                <>
                  <div className="hidden print-only mb-8 border-b-2 border-emerald-600 pb-4">
                    <div className="flex justify-between items-end">
                      <div>
                        <h1 className="text-3xl font-black text-emerald-600">LoomisAI.pro Analysis Report</h1>
                        <p className="text-slate-500 font-bold uppercase tracking-widest text-xs mt-1">Official AI-Graded Student Assessment</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">{format(new Date(), 'MMMM d, yyyy')}</p>
                        <p className="text-xs text-slate-400">ID: {selectedBatchResult?.id || 'INDIVIDUAL'}</p>
                      </div>
                    </div>
                    <div className="mt-6 grid grid-cols-2 gap-8">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Student Name</p>
                        <p className="text-lg font-bold">{currentStudentName}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Assessment Title</p>
                        <p className="text-lg font-bold">{selectedReport.title}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-6 no-print">
                    <div className="flex items-center gap-4">
                      <button onClick={() => { setActiveTab('reports'); setSelectedBatchResult(null); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                      </button>
                      <div>
                        <h3 className="text-2xl font-bold">{selectedReport.title}</h3>
                        <p className="text-slate-500">{selectedBatchResult ? `Re-checking: ${selectedBatchResult.studentName}` : 'Individual Grading & OCR Mode'}</p>
                      </div>
                    </div>
                    {selectedBatchResult && (
                      <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-lg border border-amber-100 dark:border-amber-800/50">
                        <History className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">Batch Storage Mode</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <h4 className="font-bold mb-4 flex items-center gap-2"><User className="w-4 h-4 text-indigo-600" /> Student Information</h4>
                        <input 
                          type="text" 
                          placeholder="Student Name" 
                          value={currentStudentName}
                          onChange={(e) => setCurrentStudentName(e.target.value)}
                          className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-none outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        />
                      </div>

                      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <h4 className="font-bold mb-4 flex items-center gap-2"><Camera className="w-4 h-4 text-indigo-600" /> {selectedBatchResult ? 'Student Script' : 'Upload Answer Sheet'}</h4>
                        {!selectedBatchResult && (
                          <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center hover:border-indigo-500 transition-all cursor-pointer relative group">
                            <input type="file" onChange={handleIndividualFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*,application/pdf,.doc,.docx" />
                            <UploadCloud className="w-10 h-10 mx-auto mb-3 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                            <p className="text-sm font-medium">Click to upload or drag and drop</p>
                            <p className="text-xs text-slate-400 mt-1">PNG, JPG, PDF, DOCX up to 10MB</p>
                          </div>
                        )}
                        {studentImageBase64 && (
                          <div className="mt-4 relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-inner bg-slate-100 dark:bg-slate-950">
                            <img src={`data:${studentImageMimeType};base64,${studentImageBase64}`} alt="Student Script" className="w-full h-auto max-h-[600px] object-contain" />
                            {!selectedBatchResult && (
                              <button onClick={() => setStudentImageBase64(null)} className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full"><X className="w-4 h-4" /></button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm h-full flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="font-bold flex items-center gap-2"><FileText className="w-4 h-4 text-indigo-600" /> {selectedBatchResult ? 'AI Analysis Notes' : 'Extracted Text'}</h4>
                          {isExtractingText && <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />}
                        </div>
                        <textarea 
                          value={studentAnswerText}
                          onChange={(e) => setStudentAnswerText(e.target.value)}
                          placeholder="AI will extract text here, or you can type manually..."
                          className="flex-1 w-full p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border-none outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none text-sm min-h-[300px]"
                        />
                        <div className="flex gap-3 mt-6">
                          <button 
                            onClick={handleIndividualGrade}
                            disabled={isGrading || !studentAnswerText}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-xl shadow-indigo-200 dark:shadow-none"
                          >
                            {isGrading ? <><Loader2 className="w-5 h-5 animate-spin" /> {selectedBatchResult ? 'Re-analyzing...' : 'Grading...'}</> : <><Bot className="w-5 h-5" /> {selectedBatchResult ? 'Re-run AI Analysis' : 'Analyze with AI'}</>}
                          </button>
                          {selectedBatchResult && (
                            <button 
                              onClick={() => window.print()}
                              className="px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all flex items-center gap-2"
                            >
                              <Download className="w-4 h-4" /> Print Report
                            </button>
                          )}
                          {selectedBatchResult && (
                            <button 
                              onClick={() => { setSelectedBatchResult(null); setStudentImageBase64(null); setStudentAnswerText(''); setIndividualGrade(null); }}
                              className="px-6 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-all"
                            >
                              Exit Storage
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {individualGrade && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
                      <div className="lg:col-span-1 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <h4 className="font-bold mb-4 flex items-center gap-2"><Sparkles className="w-4 h-4 text-indigo-600" /> Overall Result</h4>
                        <div className="space-y-4">
                          <div className={cn(
                            "p-4 rounded-xl flex items-center justify-between",
                            individualGrade === 'perfect' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' :
                            individualGrade === 'inaccurate' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400' :
                            'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                          )}>
                            <div className="flex items-center gap-3">
                              {individualGrade === 'perfect' ? <CheckCircle2 className="w-6 h-6" /> : individualGrade === 'inaccurate' ? <AlertCircle className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
                              <span className="font-bold text-lg capitalize">{individualGrade}</span>
                            </div>
                            <span className="text-2xl font-black">{individualScore}</span>
                          </div>
                          <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                            <p className="text-sm font-medium text-slate-500 mb-1 uppercase">AI Feedback</p>
                            <p className="text-slate-700 dark:text-slate-300">{individualFeedback}</p>
                          </div>
                        </div>
                      </div>

                      <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="font-bold flex items-center gap-2"><ListChecks className="w-4 h-4 text-indigo-600" /> AI Markings & Breakdown</h4>
                          <div className="flex gap-2">
                            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-[10px] font-bold text-slate-400 uppercase">Perfect</span></div>
                            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-500" /><span className="text-[10px] font-bold text-slate-400 uppercase">Inaccurate</span></div>
                            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500" /><span className="text-[10px] font-bold text-slate-400 uppercase">Wrong</span></div>
                          </div>
                        </div>

                        {selectedReport.category === 'paragraph' && individualKeywords && (
                          <div className="mb-8 space-y-6">
                            <div className="p-4 bg-indigo-50/30 dark:bg-indigo-900/10 rounded-xl border border-indigo-100 dark:border-indigo-800/50">
                              <h5 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase mb-3 flex items-center gap-2">
                                <Sparkles className="w-3 h-3" /> Keyword Analysis: Student Answer
                              </h5>
                              <HighlightedText text={studentAnswerText} keywords={individualKeywords.student} color="indigo" />
                            </div>
                            {selectedReport.answerKey && (
                              <div className="p-4 bg-emerald-50/30 dark:bg-emerald-900/10 rounded-xl border border-emerald-100 dark:border-emerald-800/50">
                                <h5 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase mb-3 flex items-center gap-2">
                                  <CheckCircle2 className="w-3 h-3" /> Keyword Analysis: Answer Key
                                </h5>
                                <HighlightedText text={selectedReport.answerKey} keywords={individualKeywords.answerKey} color="emerald" />
                              </div>
                            )}
                          </div>
                        )}

                        {individualQuestionBreakdown.length > 0 ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {individualQuestionBreakdown.map((q) => (
                              <div key={q.questionNumber} className={cn(
                                "p-4 rounded-xl border-l-4 transition-all hover:scale-[1.02]",
                                q.status === 'Perfect' ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-500' :
                                q.status === 'Inaccurate' ? 'bg-amber-50/50 dark:bg-amber-900/10 border-amber-500' :
                                'bg-red-50/50 dark:bg-red-900/10 border-red-500'
                              )}>
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-bold text-sm">Question {q.questionNumber}</span>
                                  <span className={cn(
                                    "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                                    q.status === 'Perfect' ? 'bg-emerald-100 text-emerald-700' :
                                    q.status === 'Inaccurate' ? 'bg-amber-100 text-amber-700' :
                                    'bg-red-100 text-red-700'
                                  )}>{q.status}</span>
                                </div>
                                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{q.feedback}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                            <HelpCircle className="w-12 h-12 mb-2 opacity-20" />
                            <p>No question breakdown available.</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'batch' && (
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">{selectedReport ? `Report: ${selectedReport.title}` : 'Batch Analysis'}</h2>
                  <p className="text-slate-500 dark:text-slate-400">
                    {selectedReport ? `Viewing results for ${selectedReport.title}` : "Automate Raj's bundle of student work in seconds"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {selectedReport && (
                    <>
                      <button 
                        onClick={() => setActiveTab('individual-grading')}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg text-sm font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all"
                      >
                        <Edit3 className="w-4 h-4" /> Manual Grade
                      </button>
                      <button 
                        onClick={() => {
                          setSelectedReport(null);
                          setBatchResults([]);
                          setBatchTitle('');
                          setBatchClassId('');
                        }} 
                        className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                      >
                        <PlusCircle className="w-4 h-4" /> New Analysis
                      </button>
                    </>
                  )}
                  {batchResults.length > 0 && (
                    <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">
                      <Download className="w-4 h-4" /> Export Grid
                    </button>
                  )}
                </div>
              </div>

              {!selectedReport && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Info className="w-5 h-5 text-indigo-600" /> Analysis Info
                      </h2>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1 uppercase">Analysis Title</label>
                          <input 
                            type="text" 
                            value={batchTitle} 
                            onChange={(e) => setBatchTitle(e.target.value)} 
                            placeholder="e.g. Physics Midterm" 
                            className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1 uppercase">Target Class</label>
                          <select 
                            value={batchClassId} 
                            onChange={(e) => setBatchClassId(e.target.value)} 
                            className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">Select Class</option>
                            {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.section})</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1 uppercase">Subject Category</label>
                          <div className="grid grid-cols-2 gap-2">
                            <button 
                              onClick={() => setBatchCategory('technical')}
                              className={cn(
                                "py-2 rounded-lg text-xs font-bold transition-all border",
                                batchCategory === 'technical' 
                                  ? "bg-indigo-600 text-white border-indigo-600" 
                                  : "bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:border-indigo-300"
                              )}
                            >
                              Technical (Math/Physics)
                            </button>
                            <button 
                              onClick={() => setBatchCategory('paragraph')}
                              className={cn(
                                "py-2 rounded-lg text-xs font-bold transition-all border",
                                batchCategory === 'paragraph' 
                                  ? "bg-indigo-600 text-white border-indigo-600" 
                                  : "bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:border-indigo-300"
                              )}
                            >
                              Paragraph (History/Bio)
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                      <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-indigo-600" /> Question Paper
                      </h2>
                      <p className="text-[10px] text-slate-500 mb-4 uppercase tracking-wider">AI will analyze marks distribution and question context</p>
                      <div className="space-y-4">
                        <textarea value={questionBank} onChange={(e) => setQuestionBank(e.target.value)} placeholder="Paste questions here (optional if uploading file)..." className="w-full h-24 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none text-sm" />
                        <div className="relative border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-lg p-4 text-center hover:border-indigo-400 transition-all cursor-pointer">
                          <input 
                            type="file" 
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) setQuestionPaperFile({ id: 'q-paper', file, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '' });
                            }} 
                            className="absolute inset-0 opacity-0 cursor-pointer" 
                            accept="image/*,application/pdf,.doc,.docx" 
                          />
                          {questionPaperFile ? (
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 overflow-hidden">
                                <FileText className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                                <span className="text-xs font-medium truncate">{questionPaperFile.file.name}</span>
                              </div>
                              <button onClick={(e) => { e.preventDefault(); setQuestionPaperFile(null); }} className="text-red-500 hover:text-red-600"><X className="w-4 h-4" /></button>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-1">
                              <UploadCloud className="w-5 h-5 text-slate-400" />
                              <span className="text-[10px] text-slate-500">Upload Question Paper (Image/PDF/Doc)</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                      <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Master Answer Key
                      </h2>
                      <p className="text-[10px] text-slate-500 mb-4 uppercase tracking-wider">Include multiple solving methods for Math & highlight keywords</p>
                      <div className="space-y-4">
                        <textarea value={answerKey} onChange={(e) => setAnswerKey(e.target.value)} placeholder="Paste correct answers here. For Math, provide at least 3 ways to solve. For Paragraphs, highlight keywords." className="w-full h-24 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-none text-sm" />
                        <div className="relative border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-lg p-4 text-center hover:border-emerald-400 transition-all cursor-pointer">
                          <input 
                            type="file" 
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) setSolutionPaperFile({ id: 's-paper', file, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '' });
                            }} 
                            className="absolute inset-0 opacity-0 cursor-pointer" 
                            accept="image/*,application/pdf,.doc,.docx" 
                          />
                          {solutionPaperFile ? (
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 overflow-hidden">
                                <CheckSquare className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                                <span className="text-xs font-medium truncate">{solutionPaperFile.file.name}</span>
                              </div>
                              <button onClick={(e) => { e.preventDefault(); setSolutionPaperFile(null); }} className="text-red-500 hover:text-red-600"><X className="w-4 h-4" /></button>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-1">
                              <UploadCloud className="w-5 h-5 text-slate-400" />
                              <span className="text-[10px] text-slate-500">Upload Answer Key (Image/PDF/Doc)</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white dark:bg-slate-900 p-8 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-center group hover:border-indigo-400 dark:hover:border-indigo-600 transition-all">
                      <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Upload className="w-8 h-8 text-indigo-600" />
                      </div>
                      <h3 className="text-xl font-bold mb-2">Upload Student Bundle</h3>
                      <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-sm">Select multiple student answer sheets to process them all at once.</p>
                      <label className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-semibold cursor-pointer transition-all shadow-lg shadow-indigo-200 dark:shadow-none">
                        Select Files
                        <input type="file" multiple onChange={handleFileUpload} className="hidden" accept="image/*,application/pdf,.doc,.docx" />
                      </label>
                    </div>

                    {studentFiles.length > 0 && (
                      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between">
                          <span className="font-medium">{studentFiles.length} files selected</span>
                          <button onClick={() => setStudentFiles([])} className="text-sm text-red-600 hover:text-red-700 font-medium">Clear All</button>
                        </div>
                        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-[300px] overflow-y-auto">
                          {studentFiles.map((file) => (
                            <div key={file.id} className="relative group aspect-square rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                              {file.file.type.startsWith('image/') ? (
                                <img src={file.preview} alt="Preview" className="w-full h-full object-cover" />
                              ) : (
                                <div className="flex flex-col items-center gap-1 text-slate-400">
                                  <FileText className="w-8 h-8" />
                                  <span className="text-[8px] font-bold uppercase">{file.file.name.split('.').pop()}</span>
                                </div>
                              )}
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <button onClick={() => setStudentFiles(prev => prev.filter(f => f.id !== file.id))} className="bg-red-600 text-white p-2 rounded-full hover:bg-red-700 transition-colors"><Trash2 className="w-4 h-4" /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800">
                          <button onClick={processBatch} disabled={isProcessing} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white py-4 rounded-xl font-bold text-lg flex flex-col items-center justify-center gap-1 transition-all shadow-xl shadow-indigo-200 dark:shadow-none">
                            {isProcessing ? (
                              <>
                                <div className="flex items-center gap-3">
                                  <Loader2 className="w-6 h-6 animate-spin" /> 
                                  <span>Processing Bundle...</span>
                                </div>
                                <div className="flex flex-col items-center mt-1">
                                  <span className="text-xs font-normal opacity-80">{processingStage}</span>
                                  {estimatedTime !== null && (
                                    <span className="text-[10px] font-medium text-indigo-200 mt-1 flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      Est. time remaining: {Math.floor(estimatedTime / 60)}m {estimatedTime % 60}s
                                    </span>
                                  )}
                                </div>
                              </>
                            ) : (
                              <div className="flex flex-col items-center">
                                <div className="flex items-center gap-3">
                                  <Sparkles className="w-6 h-6" /> 
                                  <span>Run AI Magic</span>
                                </div>
                                <span className="text-[10px] font-normal opacity-60 mt-1 italic">
                                  Est. time for {studentFiles.length} files: {Math.ceil((15 + studentFiles.length * 10) / 60)} min
                                </span>
                              </div>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {batchResults.length > 0 && batchAnalysisData && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                  <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <h3 className="font-bold text-lg mb-4">Overall Batch Analysis</h3>
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <PieChart>
                          <Pie
                            data={batchAnalysisData.overallChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {batchAnalysisData.overallChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[entry.name.toLowerCase() as keyof typeof COLORS]} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <h3 className="font-bold text-lg mb-4">Question-wise Analysis</h3>
                    <div className="flex gap-6 overflow-x-auto pb-4">
                      {batchAnalysisData.questionChartData.map((qData) => (
                        <div key={qData.questionNumber} className="flex-shrink-0 w-[200px] text-center">
                          <p className="text-sm font-semibold mb-2">Question {qData.questionNumber}</p>
                          <div className="h-[150px]">
                            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                              <PieChart>
                                <Pie
                                  data={qData.data}
                                  cx="50%"
                                  cy="50%"
                                  outerRadius={50}
                                  dataKey="value"
                                >
                                  {qData.data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[entry.name.toLowerCase() as keyof typeof COLORS]} />
                                  ))}
                                </Pie>
                                <Tooltip />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      ))}
                      {batchAnalysisData.questionChartData.length === 0 && (
                        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm py-12">
                          No question-wise data available for this report.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {batchResults.length > 0 && (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                          <th className="p-4 font-semibold text-sm">Student Name</th>
                          <th className="p-4 font-semibold text-sm">Score</th>
                          <th className="p-4 font-semibold text-sm">Status</th>
                          <th className="p-4 font-semibold text-sm">AI Feedback</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {batchResults.map((result) => (
                          <motion.tr initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={result.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="p-4 font-medium">{result.studentName}</td>
                            <td className="p-4"><span className="px-2 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded text-sm font-bold">{result.score}</span></td>
                            <td className="p-4">
                              <span className={cn(
                                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                                result.status === 'Perfect' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                result.status === 'Inaccurate' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                                'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                              )}>
                                {result.status === 'Perfect' ? <CheckCircle2 className="w-3 h-3" /> : result.status === 'Inaccurate' ? <AlertCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                {result.status}
                              </span>
                            </td>
                            <td className="p-4 text-sm text-slate-600 dark:text-slate-400">{result.feedback}</td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'calendar' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold">Academic Calendar</h3>
                <div className="flex items-center gap-4 bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="font-bold w-32 text-center">{format(currentMonth, 'MMMM yyyy')}</span>
                  <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="grid grid-cols-7 gap-4 mb-8 text-center font-bold text-slate-400 text-sm uppercase tracking-wider">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div key={day}>{day}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-4">
                  {paddingDays.map((_, i) => (
                    <div key={`pad-${i}`} className="h-32 rounded-2xl p-4 border border-transparent" />
                  ))}
                  {days.map((day, i) => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const dayEvents = calendarEvents.filter(e => e.date === dateStr);
                    const isToday = isSameDay(day, new Date());
                    
                    return (
                      <div 
                        key={i} 
                        onClick={() => handleDateClick(day)}
                        className={cn(
                          "h-32 rounded-2xl p-4 border transition-all cursor-pointer hover:border-emerald-500 group relative overflow-hidden flex flex-col",
                          isToday ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200 dark:shadow-none border-emerald-500" : "bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800"
                        )}
                      >
                        <span className={cn("text-lg font-bold", isToday ? "text-white" : "")}>{format(day, 'd')}</span>
                        <div className="mt-2 space-y-1.5 flex-1 overflow-y-auto no-scrollbar">
                          {dayEvents.map(e => (
                            <div key={e.id} className={cn(
                              "text-[10px] font-bold px-2 py-1 rounded truncate",
                              isToday 
                                ? "bg-white/20 text-white" 
                                : e.type === 'holiday' 
                                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" 
                                  : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            )} title={e.title}>
                              {e.title}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="space-y-6">
              <h3 className="text-2xl font-bold">Activity Log</h3>
              {submissions.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
                  <History className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                  <h4 className="text-lg font-bold">No activity found</h4>
                  <p className="text-slate-500">Graded submissions will appear here.</p>
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {submissions.map(sub => (
                      <div key={sub.id} className="p-6 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-12 h-12 rounded-xl flex items-center justify-center",
                            sub.status === 'perfect' ? 'bg-emerald-100 text-emerald-600' :
                            sub.status === 'wrong' ? 'bg-red-100 text-red-600' :
                            'bg-amber-100 text-amber-600'
                          )}>
                            {sub.status === 'perfect' ? <CheckCircle2 className="w-6 h-6" /> : 
                             sub.status === 'wrong' ? <XCircle className="w-6 h-6" /> : 
                             <AlertCircle className="w-6 h-6" />}
                          </div>
                          <div>
                            <h5 className="font-bold">{sub.studentName}</h5>
                            <p className="text-sm text-slate-500">{sub.fileName || 'Manual entry'}</p>
                            <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider">{format(new Date(sub.submittedAt), 'MMM d, yyyy • h:mm a')}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-black text-indigo-600">{sub.score || 'N/A'}</p>
                          <p className={cn(
                            "text-xs font-bold",
                            sub.status === 'perfect' ? 'text-emerald-600' :
                            sub.status === 'wrong' ? 'text-red-600' :
                            'text-amber-600'
                          )}>{sub.status.toUpperCase()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {activeTab === 'settings' && (
            <div className="max-w-4xl mx-auto space-y-8">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-200 dark:border-slate-800">
                  <h2 className="text-xl font-bold">Subscription Tier</h2>
                  <p className="text-slate-500 text-sm mt-1">Manage your current plan and billing</p>
                </div>
                <div className="p-6">
                  <div className="flex items-center justify-between p-6 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800/30">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 capitalize">{currentTier} Plan</h3>
                        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 text-xs font-bold rounded-full uppercase tracking-wider">Current</span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400">
                        {currentTier === 'free' && "Limited analysis (15-20/day)."}
                        {currentTier === 'pro' && "Up to 300 files/day with AI highlights and faster analysis."}
                        {currentTier === 'pro+' && "Unlimited fast analysis with Gemini Pro."}
                      </p>
                    </div>
                    <button className="px-6 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm">
                      Manage Plan
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-200 dark:border-slate-800">
                  <h2 className="text-xl font-bold">Support & Feedback</h2>
                  <p className="text-slate-500 text-sm mt-1">Help us improve the application</p>
                </div>
                <div className="p-6 space-y-4">
                  <button className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-all group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
                        <Star className="w-5 h-5" />
                      </div>
                      <div className="text-left">
                        <h3 className="font-medium">Rate Us</h3>
                        <p className="text-sm text-slate-500">Love the app? Leave a review!</p>
                      </div>
                    </div>
                    <ExternalLink className="w-5 h-5 text-slate-400 group-hover:text-emerald-500 transition-colors" />
                  </button>

                  <button className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-all group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                        <Bug className="w-5 h-5" />
                      </div>
                      <div className="text-left">
                        <h3 className="font-medium">Report Bugs</h3>
                        <p className="text-sm text-slate-500">Found an issue? Let us know.</p>
                      </div>
                    </div>
                    <ExternalLink className="w-5 h-5 text-slate-400 group-hover:text-emerald-500 transition-colors" />
                  </button>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-red-200 dark:border-red-900/50 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-red-100 dark:border-red-900/30 bg-red-50/50 dark:bg-red-900/10">
                  <h2 className="text-xl font-bold text-red-600 dark:text-red-400">Danger Zone</h2>
                  <p className="text-red-500/80 dark:text-red-400/80 text-sm mt-1">Irreversible actions</p>
                </div>
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-slate-900 dark:text-white">Clear All Data</h3>
                      <p className="text-sm text-slate-500 mt-1">Permanently delete all classes, students, and grading reports.</p>
                    </div>
                    <button 
                      onClick={() => setIsClearDataModalOpen(true)}
                      className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 rounded-lg font-medium transition-colors"
                    >
                      Clear Data
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="mt-auto border-t border-slate-200 dark:border-slate-800 py-8 px-6 text-center text-slate-500 dark:text-slate-400 no-print">
          <div className="max-w-7xl mx-auto flex flex-col items-center justify-center space-y-2">
            <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">AutonixAI</h4>
            <p className="text-sm">Built out of curiosity to help people.</p>
            <p className="text-xs pt-2">© 2026 AutonixAI. All rights reserved.</p>
          </div>
        </footer>
      </main>

      <Modal isOpen={isClearDataModalOpen} onClose={() => setIsClearDataModalOpen(false)} title="Clear All Data?">
        <div className="space-y-6">
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-800/50 flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <div className="space-y-2">
              <p className="text-sm font-bold text-red-700 dark:text-red-300">This action is irreversible!</p>
              <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed">
                You are about to permanently delete all your classes, students, analysis reports, and submissions.
              </p>
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <button 
              onClick={() => setIsClearDataModalOpen(false)}
              className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={handleClearAllData}
              className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 shadow-lg shadow-red-200 dark:shadow-none transition-all"
            >
              Yes, Clear Everything
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isEventModalOpen} onClose={() => setIsEventModalOpen(false)} title="Add Event">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Event Title</label>
            <input 
              type="text" 
              value={newEventTitle}
              onChange={(e) => setNewEventTitle(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder="e.g., Parent-Teacher Meeting"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Event Type</label>
            <div className="flex gap-2">
              <button
                onClick={() => setNewEventType('important')}
                className={cn(
                  "flex-1 py-2 rounded-xl border text-sm font-bold transition-all",
                  newEventType === 'important' ? "bg-emerald-100 border-emerald-200 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-400" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400"
                )}
              >
                Important Day
              </button>
              <button
                onClick={() => setNewEventType('holiday')}
                className={cn(
                  "flex-1 py-2 rounded-xl border text-sm font-bold transition-all",
                  newEventType === 'holiday' ? "bg-amber-100 border-amber-200 text-amber-700 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-400" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400"
                )}
              >
                Holiday
              </button>
            </div>
          </div>
          <button 
            onClick={handleAddEvent}
            disabled={!newEventTitle.trim()}
            className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-4"
          >
            Add Event
          </button>
        </div>
      </Modal>

      <Modal isOpen={isClassModalOpen} onClose={() => setIsClassModalOpen(false)} title="Create New Class">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Class Name</label>
            <input type="text" value={newClassName} onChange={(e) => setNewClassName(e.target.value)} placeholder="e.g. Physics 101" className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Section</label>
            <input type="text" value={newClassSection} onChange={(e) => setNewClassSection(e.target.value)} placeholder="e.g. A" className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Total Students</label>
            <input type="number" value={newClassTotal} onChange={(e) => setNewClassTotal(e.target.value)} placeholder="e.g. 30" className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800" />
          </div>
          <button onClick={handleAddClass} className="w-full bg-indigo-600 text-white py-2 rounded-lg font-bold hover:bg-indigo-700 transition-all">Create Class</button>
        </div>
      </Modal>

      <Modal isOpen={isStudentModalOpen} onClose={() => setIsStudentModalOpen(false)} title="Add New Student">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Student Name</label>
            <input type="text" value={newStudentName} onChange={(e) => setNewStudentName(e.target.value)} placeholder="e.g. John Doe" className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Student ID (Optional)</label>
            <input type="text" value={newStudentId} onChange={(e) => setNewStudentId(e.target.value)} placeholder="e.g. STU-001" className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Assign to Class</label>
            <select value={newStudentClassId} onChange={(e) => setNewStudentClassId(e.target.value)} className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800">
              <option value="">Select a class</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.section})</option>)}
            </select>
          </div>
          <button onClick={handleAddStudent} className="w-full bg-indigo-600 text-white py-2 rounded-lg font-bold hover:bg-indigo-700 transition-all">Add Student</button>
        </div>
      </Modal>
    </div>
  );
}
