import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SlideTranscriptPair } from './SlideTranscriptPair';

const maps = new Map<string, Map<string, unknown>>();

vi.mock('@y-sweet/react', () => ({
  useMap: (name: string) => maps.get(name) ?? new Map<string, unknown>(),
}));

function setCurrentSlide(text: string) {
  maps.set(
    'proclaimStatus',
    new Map<string, unknown>([['itemId', 'item-1'], ['slideIndex', 0]]),
  );
  maps.set(
    'proclaimPresentations',
    new Map([['item-1', { slides: [text] }]]),
  );
}

describe('SlideTranscriptPair', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    maps.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('delays collapsing a blank slide and keeps the transcript mounted', async () => {
    setCurrentSlide('  ');
    render(
      <SlideTranscriptPair
        slidePane={<div data-testid="slide">slide</div>}
        transcriptPane={<div data-testid="transcript">transcript</div>}
      />,
    );

    const slide = screen.getByTestId('slide');
    const slideContainer = slide.parentElement!;
    const transcript = screen.getByTestId('transcript');

    expect(slideContainer.style.flex).toBe('0 0 50%');
    await act(() => vi.advanceTimersByTime(1_999));
    expect(slideContainer.style.flex).toBe('0 0 50%');

    await act(() => vi.advanceTimersByTime(1));
    expect(slideContainer.style.flexBasis).toBe('0%');
    expect(screen.getByTestId('transcript')).toBe(transcript);
  });

  it('cancels the collapse when a nonblank slide arrives', async () => {
    setCurrentSlide('  ');
    const { rerender } = render(
      <SlideTranscriptPair
        slidePane={<div data-testid="slide">slide</div>}
        transcriptPane={<div data-testid="transcript">transcript</div>}
      />,
    );

    await act(() => vi.advanceTimersByTime(1_000));
    setCurrentSlide('Sermon title');
    rerender(
      <SlideTranscriptPair
        slidePane={<div data-testid="slide">slide</div>}
        transcriptPane={<div data-testid="transcript">transcript</div>}
      />,
    );
    await act(() => vi.advanceTimersByTime(2_000));

    expect(screen.getByTestId('slide').parentElement!.style.flexBasis).toBe('50%');
  });

  it('keeps the slide pane expanded when slide data is unavailable', async () => {
    render(
      <SlideTranscriptPair
        slidePane={<div data-testid="slide">slide</div>}
        transcriptPane={<div data-testid="transcript">transcript</div>}
      />,
    );

    await act(() => vi.advanceTimersByTime(3_000));

    expect(screen.getByTestId('slide').parentElement!.style.flexBasis).toBe('50%');
  });
});
