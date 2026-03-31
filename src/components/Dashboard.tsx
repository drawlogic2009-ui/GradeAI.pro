import React from 'react';
import { motion } from 'motion/react';
import { School, History, Plus, Users, FileText, Settings, Trash2 } from 'lucide-react';
import { ClassInfo, Student, Homework, Submission, ModalState } from '../types';
import { cn, isDeadlinePassed } from '../lib/utils';

interface DashboardProps {
  classes: ClassInfo[];
  students: Student[];
  homeworks: Homework[];
  submissions: Submission[];
  setStep: (step: any) => void;
  setSelectedClass: (c: ClassInfo | null) => void;
  setNewClassName: (name: string) => void;
  setNewClassSection: (section: string) => void;
  setNewClassTotal: (total: string) => void;
  setPreviousStep: (step: any) => void;
  setModal: (modal: ModalState | null) => void;
  handleDeleteClass: (id: string) => Promise<void>;
  setTimelineFilter: (filter: string | null) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  classes, students, homeworks, submissions, setStep, setSelectedClass, setNewClassName, setNewClassSection, setNewClassTotal, setPreviousStep, setModal, handleDeleteClass, setTimelineFilter
}) => {
  return (
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
  );
};
