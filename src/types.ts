export type PortalType = 'google-classroom' | 'canvas' | 'edunext' | 'other' | 'custom';

export interface Student {
  id: string;
  name: string;
  studentId: string;
  classId: string;
}

export interface ClassInfo {
  id: string;
  name: string;
  section: string;
  portalUrl: string;
  students: Student[];
  totalStudents: number;
}

export type SubjectCategory = 'technical' | 'paragraph';

export interface AnalysisReport {
  id: string;
  classId: string;
  title: string;
  description: string;
  category: SubjectCategory;
  createdAt: string;
  status: 'processing' | 'completed' | 'failed';
  totalFiles: number;
  processedFiles: number;
  results: BatchResult[];
  questionBank: string;
  answerKey: string;
  questionPaperUrl?: string;
  solutionPaperUrl?: string;
}

export type GradeStatus = 'perfect' | 'inaccurate' | 'wrong' | 'unattempted';

export interface Submission {
  id: string;
  homeworkId: string;
  studentId: string;
  studentName: string;
  content: string;
  status: GradeStatus;
  feedback: string;
  submittedAt: string;
  fileName?: string;
  score?: string;
  fileData?: string;
  questionBreakdown?: QuestionAnalysis[];
  keywords?: {
    student: string[];
    answerKey: string[];
  };
}

export interface QuestionAnalysis {
  questionNumber: number;
  status: 'Perfect' | 'Inaccurate' | 'Wrong';
  feedback: string;
}

export interface BatchResult {
  id: string;
  studentName: string;
  score: string;
  feedback: string;
  status: 'Perfect' | 'Inaccurate' | 'Wrong';
  fileName: string;
  fileData?: string;
  questionBreakdown?: QuestionAnalysis[];
  keywords?: {
    student: string[];
    answerKey: string[];
  };
}

export interface UploadedFile {
  file: File;
  preview: string;
  id: string;
}

export interface ModalState {
  type: 'prompt' | 'confirm' | 'info' | 'add-student-manual';
  title: string;
  message: string;
  value?: string;
  onConfirm: (val?: string, val2?: string) => void;
  onCancel: () => void;
}
