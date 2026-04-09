import { getFrameworkColor } from '../data/framework-colors';
import './FrameworkChip.css';

interface FrameworkChipProps {
  framework: string;
}

export function FrameworkChip({ framework }: FrameworkChipProps) {
  const color = getFrameworkColor(framework) || 'var(--color-text-tertiary)';

  return (
    <span
      className="framework-chip"
      style={{
        color,
        backgroundColor: `${color}15`,
      }}
    >
      <span className="framework-chip__dot" style={{ backgroundColor: color }} />
      {framework}
    </span>
  );
}
