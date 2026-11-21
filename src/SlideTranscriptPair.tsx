import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { useMap } from '@y-sweet/react';
import { isBlankSlide } from './slideTranslation';

const BLANK_SLIDE_DELAY_MS = 2_000;

export function SlideTranscriptPair({
  slidePane,
  transcriptPane,
}: {
  slidePane: ReactNode;
  transcriptPane: ReactNode;
}) {
  const statusMap = useMap('proclaimStatus');
  const presentationsMap = useMap('proclaimPresentations');
  const slideContainerRef = useRef<HTMLDivElement>(null);

  const itemId = statusMap.get('itemId') as string | undefined;
  const presentation = itemId
    ? (presentationsMap.get(itemId) as { slides?: unknown } | undefined)
    : undefined;
  const slides = Array.isArray(presentation?.slides)
    ? presentation.slides.filter((slide): slide is string => typeof slide === 'string')
    : [];
  const slideIndex = (statusMap.get('slideIndex') as number | undefined) ?? 0;
  const clampedIndex = Math.min(Math.max(slideIndex, 0), slides.length - 1);
  const currentSlideIsBlank =
    slides.length > 0 && isBlankSlide(slides[clampedIndex]);

  useLayoutEffect(() => {
    const slideContainer = slideContainerRef.current;
    if (!slideContainer) return;

    if (!currentSlideIsBlank) {
      slideContainer.style.flexBasis = '50%';
      return;
    }

    const timeout = window.setTimeout(() => {
      slideContainer.style.flexBasis = '0%';
    }, BLANK_SLIDE_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [currentSlideIsBlank]);

  return (
    <div className="flex flex-col min-h-0" style={{ flex: '2 1 100%' }}>
      <div
        ref={slideContainerRef}
        className="min-h-0 overflow-hidden transition-[flex-basis] duration-500 ease-in-out motion-reduce:transition-none"
        style={{ flex: '0 0 50%' }}
      >
        {slidePane}
      </div>
      <div className="min-h-0 overflow-hidden" style={{ flex: '1 1 0%' }}>
        {transcriptPane}
      </div>
    </div>
  );
}
