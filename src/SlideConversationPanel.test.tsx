import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import type { SlideConversation } from './slideTranslationApi';
import { SlideConversationPanel } from './SlideConversationPanel';

function conversation(messages: SlideConversation['messages']): SlideConversation {
  return {
    itemId: 'item-1',
    itemTitle: 'Service item',
    slides: [],
    slidesHash: 'hash',
    languages: ['French'],
    messages,
    status: 'idle',
    updatedAt: 0,
  };
}

describe('SlideConversationPanel', () => {
  it('groups each tool call with its result and keeps details collapsed until requested', () => {
    render(
      <SlideConversationPanel
        conversation={conversation([
          { role: 'user', parts: [{ text: 'The initial prompt is hidden.' }] },
          {
            role: 'model',
            parts: [
              { text: 'I checked the passage.' },
              {
                functionCall: {
                  name: 'lookup_bible_passage',
                  args: { book: 'REV', chapter: 4, startVerse: 8, endVerse: 11 },
                },
              },
            ],
          },
          {
            role: 'user',
            parts: [
              {
                functionResponse: {
                  name: 'lookup_bible_passage',
                  response: {
                    reference: 'REV 4:8-11',
                    passages: { French: 'Saint, saint, saint', Spanish: 'Santo, santo, santo' },
                  },
                },
              },
            ],
          },
          { role: 'user', parts: [{ text: 'Please keep the wording formal.' }] },
          { role: 'model', parts: [{ text: 'I’ll keep the formal wording.' }] },
        ])}
        busy={false}
        editable
        onSend={vi.fn()}
      />,
    );

    expect(screen.queryByText('The initial prompt is hidden.')).not.toBeInTheDocument();
    expect(screen.getByText('I checked the passage.')).toBeInTheDocument();
    expect(screen.getByText('Please keep the wording formal.')).toBeInTheDocument();
    expect(screen.getByText('I’ll keep the formal wording.')).toBeInTheDocument();

    const toolCard = screen.getByText('Looked up REV 4:8-11').closest('li');
    expect(toolCard).not.toBeNull();
    expect(toolCard).toHaveTextContent('Available in French, Spanish');
    expect(screen.getAllByRole('listitem')).toHaveLength(4);

    const details = screen.getByText('Technical details');
    expect(details).not.toHaveAttribute('open');
    fireEvent.click(details);
    expect(toolCard).toHaveTextContent('"book": "REV"');
    expect(toolCard).toHaveTextContent('"French": "Saint, saint, saint"');
  });

  it('surfaces failed tool outcomes in the activity card', () => {
    render(
      <SlideConversationPanel
        conversation={conversation([
          { role: 'user', parts: [{ text: 'Prompt' }] },
          {
            role: 'model',
            parts: [
              {
                functionCall: {
                  name: 'lookup_bible_passage',
                  args: { book: 'REV', chapter: 4 },
                },
              },
            ],
          },
          {
            role: 'user',
            parts: [
              {
                functionResponse: {
                  name: 'lookup_bible_passage',
                  response: { error: 'No canonical text found for REV 4' },
                },
              },
            ],
          },
        ])}
        busy={false}
        editable={false}
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByText('Failed: No canonical text found for REV 4')).toBeInTheDocument();
  });
});
