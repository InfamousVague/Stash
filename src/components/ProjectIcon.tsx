import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './ProjectIcon.css';

interface ProjectIconProps {
  projectPath: string;
  projectName: string;
  size?: number;
}

// Generate a consistent color from a string
function hashColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
    '#ec4899', '#f43f5e', '#ef4444', '#f97316',
    '#eab308', '#84cc16', '#22c55e', '#14b8a6',
    '#06b6d4', '#3b82f6', '#2563eb',
  ];
  return colors[Math.abs(hash) % colors.length];
}

// Cache successful results only (don't cache misses so they can retry)
const iconCache = new Map<string, string>();

export function ProjectIcon({ projectPath, projectName, size = 32 }: ProjectIconProps) {
  const [iconSrc, setIconSrc] = useState<string | null>(iconCache.get(projectPath) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (iconCache.has(projectPath)) {
      setIconSrc(iconCache.get(projectPath)!);
      return;
    }
    setFailed(false);
    invoke<string | null>('find_project_icon', { projectPath })
      .then((dataUrl) => {
        if (dataUrl) {
          iconCache.set(projectPath, dataUrl);
          setIconSrc(dataUrl);
        }
      })
      .catch(() => {});
  }, [projectPath]);

  const letter = projectName.charAt(0).toUpperCase();
  const color = hashColor(projectName);

  if (iconSrc && !failed) {
    return (
      <img
        className="project-icon project-icon--img"
        src={iconSrc}
        alt=""
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      className="project-icon project-icon--letter"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.45,
        backgroundColor: `${color}20`,
        color: color,
      }}
    >
      {letter}
    </span>
  );
}
