import type { Metadata } from 'next';
import { ChatRoom } from '@/components/chat/chat-room';

export const metadata: Metadata = { title: '채팅', robots: { index: false } };

export default async function ChatRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChatRoom key={id} roomId={id} />;
}
