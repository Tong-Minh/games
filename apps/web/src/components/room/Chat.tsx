'use client';

import { LobbyMessage } from '@games/game-sdk';
import { useEffect, useRef, useState } from 'react';
import { usePlay } from '@/components/providers/PlayProvider';
import { Button, Card, Input } from '@/components/ui';

export function Chat({ me }: { me: string }) {
  const { room, chat } = usePlay();
  const [text, setText] = useState('');
  const list = useRef<HTMLOListElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when a message arrives.
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [chat.length]);

  return (
    <Card className="flex h-80 flex-col gap-3 lg:h-[28rem]">
      <h2 className="font-semibold">Chat</h2>
      <ol ref={list} className="flex-1 space-y-1.5 overflow-y-auto text-sm" aria-live="polite">
        {chat.length === 0 && <li className="text-zinc-500">Say hi 👋</li>}
        {chat.map((message) => (
          <li key={`${message.at}-${message.from}`} className="break-words">
            <span
              className={`font-semibold ${message.from === me ? 'text-indigo-600 dark:text-indigo-400' : ''}`}
            >
              {message.name}:
            </span>{' '}
            {message.text}
          </li>
        ))}
      </ol>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!text.trim()) return;
          room?.send(LobbyMessage.Chat, { text });
          setText('');
        }}
      >
        <Input
          aria-label="Message"
          placeholder="Message"
          value={text}
          maxLength={200}
          onChange={(event) => setText(event.target.value)}
        />
        <Button type="submit" variant="secondary">
          Send
        </Button>
      </form>
    </Card>
  );
}
