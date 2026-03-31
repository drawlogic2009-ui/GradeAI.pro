export type PortalType = 'google-classroom' | 'canvas' | 'edunext' | 'other' | 'custom';

export interface Student {
  id: string;
  name: string;
  studentId: string; // Unique ID within the class
  classId: string;
}

export interface ClassInfo {
  id: string;
  name: string; // e.g., "Class 6"
  section: string; // e.g., "A"
  portalUrl: string;
  students: Student[];
  totalStudents: number;
}

export type SubjectCategory = 'technical' | 'paragraph';

export interface Homework {
  id: string;
  classId: string;
  title: string;
  description: string;
  category: SubjectCategory;
  deadline: string; // ISO date
  createdAt: string; // ISO date
  totalStrength: number;
  questionPaperUrl?: string; // Global question paper for the assignment
  solutionPaperUrl?: string; // Global solution paper for the assignment
  hasDiagram?: boolean;
  diagramUrl?: string;
  syncStatus?: 'idle' | 'scanning' | 'analyzing' | 'completed' | 'failed';
  lastSyncedAt?: string;
}

export type GradeStatus = 'perfect' | 'inaccurate' | 'wrong' | 'unattempted';

export interface Submission {
  id: string;
  homeworkId: string;
  studentId: string;
  studentName: string;
  content: string; // The student's answer text or file content
  status: GradeStatus;
  feedback: string;
  submittedAt: string;
}

export interface ModalState {
  type: 'prompt' | 'confirm' | 'info' | 'add-student-manual';
  title: string;
  message: string;
  value?: string;
  onConfirm: (val?: string, val2?: string) => void;
  onCancel: () => void;
}
