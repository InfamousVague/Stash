import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { Progress } from '@base/primitives/progress';
import '@base/primitives/progress/progress.css';
import type { ScanProgress, EnvFileGroup } from '../types';
import './ScanBanner.css';

interface ScanBannerProps {
  scanning: boolean;
  progress: ScanProgress | null;
  results: EnvFileGroup[];
  onDismiss: () => void;
}

function truncatePath(path: string, maxLen = 50): string {
  if (path.length <= maxLen) return path;
  const parts = path.split('/');
  if (parts.length <= 3) return '...' + path.slice(-maxLen);
  return parts[0] + '/.../' + parts.slice(-2).join('/');
}

export function ScanBanner({ scanning, progress, results, onDismiss }: ScanBannerProps) {
  if (!progress) return null;

  const isComplete = progress.complete || !scanning;
  const projectCount = results.length;

  return (
    <div className="scan-banner">
      <div className="scan-banner__content">
        {isComplete ? (
          <p className="scan-banner__text">
            Found <strong>{progress.files_found}</strong> environment files across{' '}
            <strong>{projectCount}</strong> projects
          </p>
        ) : (
          <>
            <p className="scan-banner__text">
              Scanning... <strong>{progress.files_found}</strong> files found in{' '}
              <strong>{progress.directories_scanned}</strong> directories
            </p>
            {progress.current_dir && (
              <p className="scan-banner__path">{truncatePath(progress.current_dir)}</p>
            )}
          </>
        )}
      </div>
      <div className="scan-banner__actions">
        {isComplete ? (
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Cancel
          </Button>
        )}
      </div>
      {!isComplete && (
        <div className="scan-banner__progress">
          <Progress indeterminate size="sm" color="accent" />
        </div>
      )}
    </div>
  );
}
