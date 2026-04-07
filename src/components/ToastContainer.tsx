import { Toast } from '@base/primitives/toast';
import '@base/primitives/toast/toast.css';
import type { ToastMessage } from '../hooks/useToast';
import './ToastContainer.css';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <Toast
          key={t.id}
          variant={t.variant}
          message={t.message}
          onDismiss={() => onDismiss(t.id)}
        />
      ))}
    </div>
  );
}
