import React, { useEffect } from 'react';
import { Trash2, AlertTriangle, X } from 'lucide-react';

interface DeletePresetModalProps {
  isOpen: boolean;
  presetName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeletePresetModal: React.FC<DeletePresetModalProps> = ({
  isOpen,
  presetName,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onCancel();
      } else if (e.key === 'Enter') {
        onConfirm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onConfirm, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#0a0f18] border border-rose-900/60 rounded-2xl shadow-[0_0_50px_rgba(225,29,72,0.2)] flex flex-col overflow-hidden font-mono text-zinc-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1b2536] bg-[#0c121e]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-rose-500/15 border border-rose-500/40 flex items-center justify-center text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.3)]">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <h3 className="text-xs sm:text-sm font-extrabold uppercase tracking-widest text-white">
              CONFIRM DELETION
            </h3>
          </div>

          <button
            onClick={onCancel}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-3 bg-[#0a0f18]">
          <p className="text-xs text-zinc-300 leading-relaxed">
            Are you sure you want to delete the user preset{' '}
            <span className="font-extrabold text-white bg-rose-950/60 border border-rose-800/60 px-2 py-0.5 rounded text-rose-300 inline-block my-1">
              "{presetName || 'Untitled Preset'}"
            </span>
            ?
          </p>

          <p className="text-[11px] text-zinc-500">
            This action will permanently remove it from your saved presets list.
          </p>
        </div>

        {/* Actions */}
        <div className="px-4 py-3 bg-[#080c14] border-t border-[#182232] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white text-xs font-bold uppercase tracking-wider transition-all"
          >
            CANCEL
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-extrabold uppercase tracking-wider transition-all shadow-[0_0_12px_rgba(225,29,72,0.4)] text-xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>DELETE</span>
          </button>
        </div>

      </div>
    </div>
  );
};
