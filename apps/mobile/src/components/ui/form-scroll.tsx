import { createContext, forwardRef, useContext, useState } from 'react';
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';

export type FormScrollRef = KeyboardAwareScrollViewRef;

/** 포커스된 입력칸이 커서 아래로 더 보여야 할 높이를 FormScroll 에 알린다 (여러 줄 입력칸용) */
const ExtraOffsetContext = createContext<((px: number) => void) | null>(null);
export const useFormScrollExtraOffset = () => useContext(ExtraOffsetContext);

/**
 * 입력칸이 있는 화면의 스크롤. 키보드가 올라오면 포커스된 입력칸이 키보드 위로 보이게 스크롤한다.
 * ScrollView 와 같은 props 를 받는다 (레이아웃은 바뀌지 않고 키보드만큼 아래 여백이 생긴다).
 * 여러 줄 입력칸은 라이브러리가 커서(첫 줄)만 맞추므로, Field 가 알려준 만큼 여백을 더해 칸 전체가 보이게 한다.
 */
export const FormScroll = forwardRef<FormScrollRef, KeyboardAwareScrollViewProps>(function FormScroll(
  { bottomOffset = 24, keyboardShouldPersistTaps = 'handled', ...props },
  ref,
) {
  const [extra, setExtra] = useState(0);
  return (
    <ExtraOffsetContext.Provider value={setExtra}>
      <KeyboardAwareScrollView
        ref={ref}
        bottomOffset={bottomOffset + extra}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        {...props}
      />
    </ExtraOffsetContext.Provider>
  );
});
