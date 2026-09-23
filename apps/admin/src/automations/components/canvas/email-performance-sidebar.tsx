import React, { useEffect, useRef } from 'react';
import type { AutomationSendEmailAction } from '@tryghost/admin-x-framework/api/automations';
import { Button } from '@tryghost/shade/components';
import { Box, Inline, Text } from '@tryghost/shade/primitives';
import { LucideIcon, cn } from '@tryghost/shade/utils';
import { EmailPerformanceSection } from './email-performance-section';

export const EmailPerformanceSidebar: React.FC<{
  automationId: string;
  email?: AutomationSendEmailAction;
  suspended: boolean;
  onClose: () => void;
}> = ({ automationId, email, suspended, onClose }) => {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!email || suspended) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        onClose();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      // Analytics toggles and the insertion picker own their interaction. Picking
      // a step closes the panel through the canvas, after insertion completes.
      if (
        target instanceof Element &&
        target.closest('[data-email-analytics-toggle], [data-automation-step-picker]')
      ) {
        return;
      }
      if (target instanceof Node && !panel.current?.contains(target)) {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [email, suspended, onClose]);

  return (
    <aside
      ref={panel}
      aria-hidden={!email || suspended}
      aria-label="Email performance"
      className={cn(
        'absolute inset-y-0 right-0 z-10 w-[calc(100%-6rem)] translate-x-full overflow-y-auto border-l border-border-default bg-surface-elevated shadow-sm transition-transform duration-200 ease-out sm:w-[400px]',
        email ? 'translate-x-0' : 'pointer-events-none',
        suspended && 'hidden',
      )}
      data-state={email ? 'open' : 'closed'}
    >
      {email && (
        <>
          <Inline className="sticky top-0 z-10 bg-surface-elevated p-6" gap="md">
            <Box className="shrink-0 rounded-md bg-muted p-2.5">
              <LucideIcon.MailOpen className="size-4" />
            </Box>
            <Text as="h2" className="min-w-0 flex-1" size="md" weight="medium" truncate>
              {email.data.email_subject || 'Untitled'}
            </Text>
            <Button
              aria-label="Close email performance"
              size="icon"
              variant="ghost"
              onClick={onClose}
            >
              <LucideIcon.X />
            </Button>
          </Inline>
          <Box className="px-6 pb-6">
            {email.stats ? (
              <EmailPerformanceSection
                key={email.id}
                actionId={email.id}
                automationId={automationId}
                stats={email.stats}
                redesigned
              />
            ) : (
              <Text size="sm" tone="secondary">
                Email performance is unavailable.
              </Text>
            )}
          </Box>
        </>
      )}
    </aside>
  );
};
