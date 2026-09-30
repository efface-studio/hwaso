import { FlatList, type FlatListProps } from 'react-native';

/**
 * 세로 목록. 비어 있을 때(빈 상태·불러오는 중)는 스크롤하지 않는다 —
 * 빈 상태를 가운데 두려고 내용을 화면 높이로 채우면 헤더·탭 바 높이만큼 넘쳐 스크롤되기 때문.
 * 내용이 화면보다 짧을 때 튕기지 않는다(alwaysBounceVertical false).
 */
export function List<T>(props: FlatListProps<T>) {
  const empty = props.data == null || props.data.length === 0;
  return (
    <FlatList
      alwaysBounceVertical={false}
      {...props}
      scrollEnabled={empty ? false : (props.scrollEnabled ?? true)}
    />
  );
}
