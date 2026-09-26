import { useRef, useState } from 'react';
import { Camera, FileText, Ruler, Trash2, Video } from 'lucide-react';
import toast from 'react-hot-toast';
import CameraCaptureModal from '../inspector/CameraCaptureModal';
import { errorMessage, mediaUrl } from '../../api/client';
import { fmtDateTime } from '../../lib/inspection';

/**
 * Evidence for one check: photo (camera or gallery), short video, note or
 * measurement. Each item is uploaded immediately and tied server-side to this
 * check, this inspection and the signed-in technician.
 */
export default function EvidenceCapture({ parameter, evidence, actions, disabled }) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [mode, setMode] = useState(null); // 'note' | 'measurement'
  const [text, setText] = useState('');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('');
  const videoInput = useRef(null);
  const busy = actions.addEvidence.isPending;

  const add = async (payload) => {
    try {
      await actions.addEvidence.mutateAsync({ parameterId: parameter.id, ...payload });
      toast.success('Evidence saved');
      setMode(null);
      setText('');
      setValue('');
      setUnit('');
    } catch (err) {
      toast.error(errorMessage(err, 'Evidence not saved'));
    }
  };

  const remove = async (evidenceId) => {
    try {
      await actions.removeEvidence.mutateAsync(evidenceId);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const tool = 'btn-secondary h-12 flex-1 inline-flex flex-col items-center justify-center gap-0.5 text-xs';

  return (
    <div>
      {evidence.length > 0 && (
        <ul className="space-y-2 mb-3">
          {evidence.map((e) => (
            <li key={e.evidenceId} className="flex items-center gap-3 border border-line rounded p-2">
              {e.type === 'photo' && <img src={mediaUrl(e.url)} alt={e.text || 'Evidence photo'} className="w-14 h-14 rounded object-cover bg-surface-sunk" />}
              {e.type === 'video' && <video src={mediaUrl(e.url)} className="w-14 h-14 rounded object-cover bg-surface-sunk" muted />}
              {e.type === 'note' && <FileText size={20} className="text-ink-soft mx-2" />}
              {e.type === 'measurement' && <Ruler size={20} className="text-ink-soft mx-2" />}
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate">
                  {e.type === 'measurement' ? `${e.value}${e.unit ? ` ${e.unit}` : ''}` : e.text || (e.type === 'photo' ? 'Photo' : e.type === 'video' ? 'Video' : '')}
                </p>
                <p className="text-xs text-ink-mute">
                  <span className="font-mono">{e.evidenceId}</span> · {fmtDateTime(e.capturedAt)}
                </p>
              </div>
              {!disabled && (
                <button onClick={() => remove(e.evidenceId)} className="btn-ghost p-2" aria-label="Remove evidence">
                  <Trash2 size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        <>
          <div className="flex gap-2">
            <button type="button" className={tool} onClick={() => setCameraOpen(true)} disabled={busy}>
              <Camera size={18} /> Photo
            </button>
            <button type="button" className={tool} onClick={() => videoInput.current?.click()} disabled={busy}>
              <Video size={18} /> Video
            </button>
            <button type="button" className={tool} onClick={() => setMode(mode === 'note' ? null : 'note')} disabled={busy}>
              <FileText size={18} /> Note
            </button>
            <button type="button" className={tool} onClick={() => setMode(mode === 'measurement' ? null : 'measurement')} disabled={busy}>
              <Ruler size={18} /> Measure
            </button>
          </div>
          <input
            ref={videoInput}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) add({ type: 'video', file });
            }}
          />

          {mode === 'note' && (
            <div className="mt-3 flex gap-2">
              <input className="field flex-1 h-12" placeholder="What did you see?" value={text} onChange={(e) => setText(e.target.value)} />
              <button className="btn-primary h-12 px-4" disabled={!text.trim() || busy} onClick={() => add({ type: 'note', text })}>
                Save
              </button>
            </div>
          )}
          {mode === 'measurement' && (
            <div className="mt-3 flex gap-2">
              <input className="field flex-1 h-12" inputMode="decimal" placeholder="Value" value={value} onChange={(e) => setValue(e.target.value)} />
              <input className="field w-24 h-12" placeholder="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
              <button className="btn-primary h-12 px-4" disabled={!value.trim() || busy} onClick={() => add({ type: 'measurement', value, unit })}>
                Save
              </button>
            </div>
          )}
          {busy && <p className="text-xs text-ink-mute mt-2">Uploading…</p>}
        </>
      )}

      <CameraCaptureModal
        isOpen={cameraOpen}
        onClose={() => setCameraOpen(false)}
        parameterName={parameter.name}
        onCapture={(file) => {
          setCameraOpen(false);
          add({ type: 'photo', file });
        }}
      />
    </div>
  );
}
