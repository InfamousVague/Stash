import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { Icon } from '@base/primitives/icon';
import '@base/primitives/icon/icon.css';
import './Tour.css';

export interface TourStep {
  target: string;
  title: string;
  body: string;
  icon?: string;
  iconColor?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  page?: string;
}

interface TourProps {
  steps: TourStep[];
  active: boolean;
  onNavigate?: (page: string) => void;
  onStepChange?: (stepIndex: number) => void;
  onComplete: () => void;
}

const PADDING = 8;
const TOOLTIP_W = 340;
const TOOLTIP_GAP = 14;
const VIEWPORT_MARGIN = 16;

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

export function Tour({ steps, active, onNavigate, onStepChange, onComplete }: TourProps) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [ready, setReady] = useState(false);

  const step = steps[currentStep];

  // When step changes: navigate, wait for DOM, then measure
  useEffect(() => {
    if (!active || !step) return;
    setReady(false);
    setTargetRect(null);

    onStepChange?.(currentStep);
    if (step.page) {
      onNavigate?.(step.page);
    }

    // Wait for page render then measure
    const timer = setTimeout(() => {
      const el = document.querySelector(step.target);
      if (el) setTargetRect(el.getBoundingClientRect());
      setReady(true);
    }, step.page ? 450 : 50);

    return () => clearTimeout(timer);
  }, [active, currentStep]); // intentionally minimal deps — step/onNavigate are derived

  // Keep rect updated on resize/scroll
  useEffect(() => {
    if (!active || !ready) return;
    const update = () => {
      const el = document.querySelector(step?.target ?? '');
      if (el) setTargetRect(el.getBoundingClientRect());
    };
    window.addEventListener('resize', update);
    const interval = setInterval(update, 600);
    return () => {
      window.removeEventListener('resize', update);
      clearInterval(interval);
    };
  }, [active, ready, step?.target]);

  const next = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
      setCurrentStep(0);
    }
  }, [currentStep, steps.length, onComplete]);

  const prev = useCallback(() => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  }, [currentStep]);

  const dismiss = useCallback(() => {
    onComplete();
    setCurrentStep(0);
  }, [onComplete]);

  if (!active || !step) return null;

  // Compute tooltip position
  const placement = step.placement || 'bottom';
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tooltipStyle: React.CSSProperties = {};

  if (targetRect && ready) {
    let top = 0;
    let left = 0;
    switch (placement) {
      case 'bottom':
        top = targetRect.bottom + TOOLTIP_GAP;
        left = targetRect.left + targetRect.width / 2 - TOOLTIP_W / 2;
        break;
      case 'top':
        top = targetRect.top - TOOLTIP_GAP - 280;
        left = targetRect.left + targetRect.width / 2 - TOOLTIP_W / 2;
        break;
      case 'right':
        top = targetRect.top + targetRect.height / 2 - 100;
        left = targetRect.right + TOOLTIP_GAP;
        break;
      case 'left':
        top = targetRect.top + targetRect.height / 2 - 100;
        left = targetRect.left - TOOLTIP_W - TOOLTIP_GAP;
        break;
    }
    tooltipStyle.top = clamp(top, VIEWPORT_MARGIN, vh - 300);
    tooltipStyle.left = clamp(left, VIEWPORT_MARGIN, vw - TOOLTIP_W - VIEWPORT_MARGIN);
  } else {
    tooltipStyle.top = '50%';
    tooltipStyle.left = '50%';
    tooltipStyle.transform = 'translate(-50%, -50%)';
  }

  const spotlightRect = targetRect && ready ? (() => {
    const rawTop = targetRect.top - PADDING;
    const rawLeft = targetRect.left - PADDING;
    const rawRight = targetRect.right + PADDING;
    const rawBottom = targetRect.bottom + PADDING;
    // Clamp all edges to viewport with margin
    const edge = 6;
    const top = Math.max(edge, rawTop);
    const left = Math.max(edge, rawLeft);
    const right = Math.min(vw - edge, rawRight);
    const bottom = Math.min(vh - edge, rawBottom);
    return { top, left, width: right - left, height: bottom - top };
  })() : null;

  const progressPct = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="tour">
      {/* Constant dimmed backdrop */}
      <div className="tour__backdrop" onClick={dismiss}>
        {spotlightRect ? (
          <div
            className="tour__backdrop-mask"
            style={{
              maskImage: 'linear-gradient(#000 0 0), linear-gradient(#000 0 0)',
              WebkitMaskImage: 'linear-gradient(#000 0 0), linear-gradient(#000 0 0)',
              maskComposite: 'exclude',
              WebkitMaskComposite: 'xor',
              maskPosition: `0 0, ${spotlightRect.left}px ${spotlightRect.top}px`,
              WebkitMaskPosition: `0 0, ${spotlightRect.left}px ${spotlightRect.top}px`,
              maskSize: `100% 100%, ${spotlightRect.width}px ${spotlightRect.height}px`,
              WebkitMaskSize: `100% 100%, ${spotlightRect.width}px ${spotlightRect.height}px`,
              maskRepeat: 'no-repeat',
              WebkitMaskRepeat: 'no-repeat',
            }}
          />
        ) : (
          <div className="tour__backdrop-full" />
        )}
      </div>

      {/* Spotlight border */}
      {spotlightRect && (
        <div
          className="tour__spotlight"
          style={{
            top: spotlightRect.top,
            left: spotlightRect.left,
            width: spotlightRect.width,
            height: spotlightRect.height,
          }}
        />
      )}

      {/* Tooltip — key forces remount = fresh entrance animation each step */}
      {ready && (
        <div
          key={currentStep}
          className="tour__tooltip"
          style={tooltipStyle}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="tour__progress-bar">
            <div className="tour__progress-fill" style={{ width: `${progressPct}%` }} />
          </div>

          <div className="tour__header">
            {step.icon && (
              <div className="tour__icon" style={{ background: `${step.iconColor ?? '#3b82f6'}18` }}>
                <span style={{ color: step.iconColor ?? '#3b82f6' }}>
                  <Icon icon={step.icon} size="base" color="currentColor" />
                </span>
              </div>
            )}
            <div className="tour__header-text">
              <div className="tour__step-label">{t('tour.stepOf', { current: currentStep + 1, total: steps.length })}</div>
              <div className="tour__title">{step.title}</div>
            </div>
          </div>

          <div className="tour__body">{step.body}</div>

          <div className="tour__dots">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`tour__dot ${i === currentStep ? 'tour__dot--active' : ''} ${i < currentStep ? 'tour__dot--done' : ''}`}
              />
            ))}
          </div>

          <div className="tour__footer">
            <Button variant="ghost" size="sm" onClick={dismiss}>{t('tour.skipTour')}</Button>
            <div className="tour__actions">
              {currentStep > 0 && (
                <Button variant="ghost" size="sm" onClick={prev}>{t('tour.back')}</Button>
              )}
              <Button variant="primary" size="sm" onClick={next}>
                {currentStep === steps.length - 1 ? t('tour.finish') : t('tour.next')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
