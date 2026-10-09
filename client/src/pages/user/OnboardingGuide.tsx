import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, X, Sparkles } from 'lucide-react';
import { Button } from '@client/src/components/ui/button';
import { cn } from '@/lib/utils';

export interface OnboardingStepData {
  title: string;
  description: string;
  target?: string; // CSS selector for highlighted element
  position?: 'top' | 'bottom' | 'left' | 'right';
}

interface OnboardingGuideProps {
  open: boolean;
  steps: OnboardingStepData[];
  onClose: () => void;
  storageKey?: string;
}

const STORAGE_KEY_DEFAULT = 'matrix-onboarding-completed';

const OnboardingGuide = ({
  open: externalOpen,
  steps,
  onClose,
  storageKey = STORAGE_KEY_DEFAULT,
}: OnboardingGuideProps) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // 判断是否首次访问（自动触发）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const completed = localStorage.getItem(storageKey);
    if (!completed && !externalOpen) {
      // 延迟一点，等页面渲染完成
      const timer = setTimeout(() => {
        setInternalOpen(true);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [storageKey, externalOpen]);

  const isOpen = externalOpen || internalOpen;

  const handleClose = () => {
    setInternalOpen(false);
    onClose();
  };

  const handleSkip = () => {
    localStorage.setItem(storageKey, 'true');
    handleClose();
  };

  const handleComplete = () => {
    localStorage.setItem(storageKey, 'true');
    handleClose();
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  // 计算高亮元素位置
  useEffect(() => {
    if (!isOpen) return;
    const step = steps[currentStep];
    if (!step?.target) {
      setTargetRect(null);
      return;
    }
    const updateRect = () => {
      const el = document.querySelector(step.target!);
      if (el) {
        setTargetRect(el.getBoundingClientRect());
      } else {
        setTargetRect(null);
      }
    };
    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [isOpen, currentStep, steps]);

  if (!isOpen) return null;

  const step = steps[currentStep];
  const hasTarget = step.target && targetRect;

  // 计算 tooltip 位置
  const getTooltipStyle = (): React.CSSProperties => {
    if (!hasTarget || !targetRect) {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '380px',
      };
    }
    const padding = 8;
    const tooltipWidth = 320;
    const position = step.position || 'bottom';

    switch (position) {
      case 'top':
        return {
          top: Math.max(16, targetRect.top - 16),
          left: Math.min(
            window.innerWidth - tooltipWidth - 16,
            Math.max(16, targetRect.left + targetRect.width / 2 - tooltipWidth / 2)
          ),
          transform: 'translateY(-100%)',
          width: `${tooltipWidth}px`,
        };
      case 'bottom':
        return {
          top: targetRect.bottom + padding,
          left: Math.min(
            window.innerWidth - tooltipWidth - 16,
            Math.max(16, targetRect.left + targetRect.width / 2 - tooltipWidth / 2)
          ),
          width: `${tooltipWidth}px`,
        };
      case 'left':
        return {
          top: Math.min(
            window.innerHeight - 100,
            Math.max(16, targetRect.top + targetRect.height / 2 - 50)
          ),
          left: targetRect.left - padding,
          transform: 'translateX(-100%)',
          width: `${tooltipWidth}px`,
        };
      case 'right':
        return {
          top: Math.min(
            window.innerHeight - 100,
            Math.max(16, targetRect.top + targetRect.height / 2 - 50)
          ),
          left: targetRect.right + padding,
          width: `${tooltipWidth}px`,
        };
      default:
        return { width: `${tooltipWidth}px` };
    }
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] pointer-events-none"
      style={{ pointerEvents: 'none' }}
    >
      {/* Highlight cutout using box-shadow trick */}
      {hasTarget && targetRect && (
        <div
          className="absolute pointer-events-none"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            borderRadius: 8,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
            border: '2px solid hsl(26 90% 49%)',
            zIndex: 1,
          }}
        />
      )}

      {/* Full overlay when no target */}
      {!hasTarget && (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
        />
      )}

      {/* Tooltip card */}
      <div
        className={cn(
          'absolute z-[101] bg-card rounded-lg shadow-xl border border-border pointer-events-auto',
          'animate-in fade-in zoom-in-95 duration-200'
        )}
        style={getTooltipStyle()}
      >
        <div className="p-5">
          {/* Close button */}
          <button
            onClick={handleSkip}
            className="absolute top-3 right-3 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Icon + title */}
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-[hsl(26_90%_49%)]/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-[hsl(26_90%_49%)]" />
            </div>
            <h3 className="text-sm font-semibold text-foreground pr-6">
              步骤 {currentStep + 1}/{steps.length}
            </h3>
          </div>

          <h4 className="text-base font-semibold text-foreground mb-2">
            {step.title}
          </h4>
          <p className="text-sm text-muted-foreground leading-6 mb-4">
            {step.description}
          </p>

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-1.5 mb-4">
            {steps.map((_, idx: number) => (
              <button
                key={idx}
                className={cn(
                  'w-2 h-2 rounded-full transition-all',
                  idx === currentStep
                    ? 'bg-[hsl(26_90%_49%)] w-4'
                    : idx < currentStep
                    ? 'bg-[hsl(26_90%_49%)]/50'
                    : 'bg-muted-foreground/30'
                )}
                onClick={() => setCurrentStep(idx)}
                aria-label={`跳转到第 ${idx + 1} 步`}
              />
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-foreground h-7 px-2"
              onClick={handleSkip}
            >
              跳过引导
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                onClick={handlePrev}
                disabled={currentStep === 0}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                上一步
              </Button>
              {currentStep < steps.length - 1 ? (
                <Button
                  size="sm"
                  className="h-7 bg-[hsl(26_90%_49%)] hover:bg-[hsl(26_90%_45%)] text-white border-0"
                  onClick={handleNext}
                >
                  下一步
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="h-7 bg-[hsl(26_90%_49%)] hover:bg-[hsl(26_90%_45%)] text-white border-0"
                  onClick={handleComplete}
                >
                  完成
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingGuide;
