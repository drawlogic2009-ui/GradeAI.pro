import React from 'react';
import { Trash2, Edit2, Plus, Users, School } from 'lucide-react';
import { ClassInfo, Student } from '../types';
import { cn } from '../lib/utils';

interface ClassesProps {
  classes: ClassInfo[];
  students: Student[];
  selectedClass: ClassInfo | null;
  setSelectedClass: (c: ClassInfo | null) => void;
  setStep: (step: any) => void;
  setModal: (modal: any) => void;
  setEditingClass: (c: ClassInfo | null) => void;
  setEditingStudent: (s: Student | null) => void;
}

export const ClassesView: React.FC<ClassesProps> = ({
  classes, students, selectedClass, setSelectedClass, setStep, setModal, setEditingClass, setEditingStudent
}) => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">My Classes</h2>
        <button 
          onClick={() => setStep('create-class')}
          className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold px-4 py-2 rounded-xl transition-all flex items-center gap-2"
        >
          <Plus size={16} /> Add Class
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {classes.map(c => (
          <div key={c.id} className="bg-white dark:bg-white/5 p-6 rounded-3xl border border-slate-200 dark:border-white/10 flex flex-col gap-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold text-lg text-slate-900 dark:text-white">{c.name}</h3>
                <p className="text-sm text-slate-500 dark:text-white/60">Section: {c.section}</p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => { setEditingClass(c); setStep('edit-class'); }}
                  className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-all"
                >
                  <Edit2 size={16} />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-white/60">
              <Users size={16} />
              <span>{students.filter(s => s.classId === c.id).length} / {c.totalStudents} Students</span>
            </div>
            <button 
              onClick={() => { setSelectedClass(c); setStep('class-details'); }}
              className="w-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-900 dark:text-white font-bold py-2 rounded-xl transition-all"
            >
              View Details
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
