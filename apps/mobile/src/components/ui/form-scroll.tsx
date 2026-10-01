import { forwardRef } from 'react';
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';

export type FormScrollRef = KeyboardAwareScrollViewRef;

/**
 * 입력칸이 있는 화면의 스크롤. 키보드가 올라오면 포커스된 입력칸이 키보드 위로 보이게 스크롤한다.
 * ScrollView 와 같은 props 를 받는다 (레이아웃은 바뀌지 않고 키보드만큼 아래 여백이 생긴다).
 */
export const FormScroll = forwardRef<FormScrollRef, KeyboardAwareScrollViewProps>(function FormScroll(
  { bottomOffset = 24, keyboardShouldPersistTaps = 'handled', ...props },
  ref,
) {
  return (
    <KeyboardAwareScrollView
      ref={ref}
      bottomOffset={bottomOffset}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      {...props}
    />
  );
});
