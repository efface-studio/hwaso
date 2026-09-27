import { ChatRoom } from '@/components/chat/chat-room';

export default async function ChatRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChatRoom key={id} roomId={id} />;
}
