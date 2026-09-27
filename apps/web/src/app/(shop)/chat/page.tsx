import { MessageCircle } from 'lucide-react';

export default function ChatIndexPage() {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-2 text-muted">
      <MessageCircle className="size-8 text-faint" aria-hidden />
      <p className="text-body">대화를 선택해주세요</p>
    </div>
  );
}
