import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { UploadCloud, FileText, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Home() {
  const { t, i18n } = useTranslation();
  const { token } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const navigate = useNavigate();

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);
    const formData = new FormData();
    formData.append('contract', file);
    formData.append('locale', i18n.language.substring(0, 2));

    try {
      const response = await fetch('http://localhost:3001/api/contracts/analyze', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Analysis failed');
      navigate('/results', { state: { contractData: data } });
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Is the backend running?');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] text-center space-y-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl space-y-6"
      >
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">
          {t('home.title', 'Fair Contracts, Clear Conditions')}
        </h1>
        <p className="text-xl text-slate-600 dark:text-slate-400">
          {t('home.subtitle', 'Detect abusive clauses instantly with AI and generate formal objection letters in seconds.')}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files?.[0]) uploadFile(e.dataTransfer.files[0]);
        }}
        className={`w-full max-w-2xl glass rounded-3xl p-12 border-2 border-dashed transition-all cursor-pointer relative overflow-hidden
          ${isDragging ? 'border-blue-500 scale-105' : 'border-blue-300 dark:border-blue-700/50 hover:border-blue-500'}
          ${isUploading ? 'opacity-70 pointer-events-none' : ''}
        `}
      >
        <input
          type="file"
          className="hidden"
          ref={fileInputRef}
          onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0])}
          accept=".pdf,image/*"
        />
        <div className="relative z-10 flex flex-col items-center space-y-4">
          <div className="p-4 bg-blue-100 dark:bg-blue-900/40 rounded-full text-blue-600 dark:text-blue-400">
            {isUploading ? <Loader2 className="h-10 w-10 animate-spin" /> : <UploadCloud className="h-10 w-10" />}
          </div>
          <h3 className="text-2xl font-semibold">
            {isUploading ? t('contract.analyzing', 'Analyzing contract...') : t('contract.upload_cta', 'Upload contract')}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t('contract.upload_hint', 'PDF or Images (max 10MB)')}
          </p>
        </div>
      </motion.div>

      {uploadError && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-red-500 text-sm"
        >
          {uploadError}
        </motion.p>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-5xl"
      >
        {[
          { icon: FileText, title: t('features.scan.title', 'Instant Scan'), desc: t('features.scan.desc', 'Extracts text from PDFs and images automatically.') },
          { icon: AlertTriangle, title: t('features.analyze.title', 'AI Analysis'), desc: t('features.analyze.desc', 'Highlights risky clauses with plain-language explanations.') },
          { icon: CheckCircle, title: t('features.protect.title', 'Take Action'), desc: t('features.protect.desc', 'Generates a formal objection letter ready to send.') },
        ].map((feature, i) => (
          <div key={i} className="glass p-6 rounded-2xl flex flex-col items-center space-y-3 text-center">
            <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-blue-600 dark:text-blue-400">
              <feature.icon className="h-6 w-6" />
            </div>
            <h4 className="font-semibold text-lg">{feature.title}</h4>
            <p className="text-sm text-slate-600 dark:text-slate-400">{feature.desc}</p>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
