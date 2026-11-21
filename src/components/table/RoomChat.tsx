import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Modal } from '@/components/Modal';
import type { RoomChatMessage } from '@/services/types';
import './room-chat.css';

const QUICK_MESSAGES = ['Nhanh lên!', 'Hay lắm!', 'Chặt luôn!'];
const QUICK_EMOJIS = ['👍', '😂', '🔥', '❤️'];

export function RoomChat({
  messages,
  selfId,
  onSend,
}: {
  messages: RoomChatMessage[];
  selfId: string;
  onSend: (text: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [unread, setUnread] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const seen = useRef(new Set(messages.map((message) => message.id)));

  useEffect(() => {
    const arriving = messages.filter((message) => !seen.current.has(message.id));
    for (const message of arriving) seen.current.add(message.id);
    if (open) setUnread(0);
    else if (arriving.length) setUnread((count) => count + arriving.length);
  }, [messages, open]);

  useEffect(() => {
    if (open) list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages, open]);

  const send = async (value: string, clearInput = false): Promise<void> => {
    const message = value.trim();
    if (!message || busy) return;
    setBusy(true);
    setError('');
    try {
      await onSend(message);
      if (clearInput) setText('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không gửi được tin nhắn.');
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void send(text, true);
  };

  return (
    <div className="room-chat">
      <button className="btn room-chat-toggle" type="button" aria-expanded={open} onClick={() => {
        setOpen((value) => !value);
        setUnread(0);
      }}>
        Trò chuyện {unread > 0 ? <span className="room-chat-badge">{unread > 99 ? '99+' : unread}</span> : null}
      </button>
      {open ? <Modal title="Trò chuyện" onClose={() => setOpen(false)} width={500}>
        <section className="room-chat-panel" aria-label="Trò chuyện trong bàn">
        <div className="room-chat-messages" ref={list} aria-live="polite">
          {messages.map((message) => <div key={message.id} className={`room-chat-message ${message.userId === selfId ? 'mine' : ''}`}>
            <small>{message.userId === selfId ? 'Bạn' : message.displayName} · {new Date(message.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</small>
            <span>{message.text}</span>
          </div>)}
          {messages.length === 0 ? <p className="room-chat-empty">Chưa có tin nhắn.</p> : null}
        </div>
        <div className="room-chat-quick">
          {QUICK_MESSAGES.map((message) => <button key={message} type="button" disabled={busy} onClick={() => void send(message)}>{message}</button>)}
        </div>
        <div className="room-chat-emojis">
          {QUICK_EMOJIS.map((emoji) => <button key={emoji} type="button" aria-label={`Gửi ${emoji}`} disabled={busy} onClick={() => void send(emoji)}>{emoji}</button>)}
        </div>
        <form onSubmit={submit}>
          <input value={text} onChange={(event) => setText(event.target.value)} maxLength={200} placeholder="Nhập tin nhắn…" aria-label="Nhập tin nhắn" />
          <button type="submit" disabled={busy || !text.trim()}>Gửi</button>
        </form>
        {error ? <p className="room-chat-error" role="alert">{error}</p> : null}
        </section>
      </Modal> : null}
    </div>
  );
}
