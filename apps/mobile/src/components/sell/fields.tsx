import {
  CONDITION_LABEL,
  ITEM_CONDITIONS,
  PROVENANCE_KINDS,
  PROVENANCE_KIND_LABEL,
  formatPrice,
  suggestIncrement,
  toLocalInput,
  type AuctionDraft,
  type CategoryNode,
  type ProductDraft,
} from '@shop/shared';
import { StyleSheet, Switch, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { DateTimeField, PriceField, SelectField } from '@/components/ui/inputs';
import { RadioList } from '@/components/ui/radio';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

type Set = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => void;
type Errors = Record<string, string>;
const toDate = (v: string) => (v ? new Date(v) : null);

function SwitchRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const t = useTheme();
  return (
    <View style={styles.switch}>
      <View style={{ flex: 1 }}>
        <Text>{label}</Text>
        {description && (
          <Text variant="caption" color="muted">
            {description}
          </Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: t.colors.primary }}
        accessibilityLabel={label}
      />
    </View>
  );
}

export function BasicFields({
  d,
  set,
  categories,
  errors,
}: {
  d: ProductDraft;
  set: Set;
  categories: CategoryNode[];
  errors: Errors;
}) {
  const options = categories.flatMap((g) =>
    g.children.map((c) => ({ value: c.id, label: `${g.name} › ${c.name}` })),
  );
  return (
    <>
      <Field
        label="작품명"
        maxLength={100}
        value={d.title}
        onChangeText={(v) => set('title', v)}
        placeholder="예) 무제 (Untitled), 백자 달항아리"
        error={errors.title}
      />
      <SelectField
        label="카테고리"
        value={d.categoryId}
        onChange={(v) => set('categoryId', v)}
        options={options}
        placeholder="카테고리 선택"
        error={errors.categoryId}
      />
      <Field
        label="작가 · 제작자"
        maxLength={100}
        value={d.artistName}
        onChangeText={(v) => set('artistName', v)}
        placeholder="예) 김환기"
        hint="모르면 비워두세요. 작가 페이지에 자동으로 연결돼요."
      />
    </>
  );
}

export function PriceFields({
  d,
  set,
  errors,
  lockSaleType,
}: {
  d: ProductDraft;
  set: Set;
  errors: Errors;
  lockSaleType?: boolean;
}) {
  return (
    <>
      {!lockSaleType && (
        <RadioList
          label="판매 방식"
          value={d.saleType}
          onChange={(v) => set('saleType', v)}
          options={[
            { value: 'FIXED', label: '즉시 구매', description: '정한 가격에 바로 판매해요' },
            { value: 'AUCTION', label: '경매', description: '시작가와 일정을 정하면 실시간 입찰로 판매해요' },
            { value: 'RESERVATION', label: '예약 판매', description: '정한 날짜부터 구매할 수 있어요' },
          ]}
        />
      )}
      {d.saleType !== 'AUCTION' && (
        <PriceField
          label="판매 가격 (원)"
          value={d.price}
          onChange={(v) => set('price', v)}
          error={errors.price}
        />
      )}
      {d.saleType === 'RESERVATION' && (
        <DateTimeField
          label="판매 시작일"
          value={toDate(d.availableAt)}
          minimumDate={new Date()}
          onChange={(v) => set('availableAt', toLocalInput(v))}
          error={errors.availableAt}
        />
      )}
      {d.saleType === 'AUCTION' && (
        <Text variant="small" color="muted">
          시작가·일정은 다음 단계에서 정해요.
        </Text>
      )}
      <PriceField
        label="배송비 (원)"
        value={d.shippingFee}
        onChange={(v) => set('shippingFee', v)}
        hint="0원이면 무료배송"
      />
      <Field
        label="배송 방법"
        maxLength={100}
        value={d.shippingMethod}
        onChangeText={(v) => set('shippingMethod', v)}
      />
    </>
  );
}

/** 경매 조건. 시간·금액 규칙은 서버(관리자 정책)가 최종 검증한다 */
export function AuctionFields({
  a,
  set,
  errors,
}: {
  a: AuctionDraft;
  set: (patch: Partial<AuctionDraft>) => void;
  errors: Errors;
}) {
  const suggested = a.startPrice ? suggestIncrement(a.startPrice) : null;
  return (
    <>
      <PriceField
        label="시작가 (원)"
        value={a.startPrice}
        onChange={(v) => set({ startPrice: v })}
        error={errors.startPrice}
      />
      <PriceField
        label="호가 단위 (원)"
        value={a.bidIncrement}
        onChange={(v) => set({ bidIncrement: v })}
        placeholder={suggested?.toLocaleString('ko-KR')}
        hint={suggested ? `추천 ${formatPrice(suggested)}` : '한 번에 올릴 최소 금액'}
        error={errors.bidIncrement}
      />
      <PriceField
        label="즉시 구매가 (선택, 원)"
        value={a.buyNowPrice}
        onChange={(v) => set({ buyNowPrice: v })}
        hint="이 금액이면 경매를 기다리지 않고 바로 낙찰돼요."
        error={errors.buyNowPrice}
      />
      <DateTimeField
        label="시작"
        value={toDate(a.startsAt)}
        minimumDate={new Date()}
        onChange={(v) => set({ startsAt: toLocalInput(v) })}
        error={errors.startsAt}
      />
      <DateTimeField
        label="종료"
        value={toDate(a.endsAt)}
        minimumDate={toDate(a.startsAt) ?? new Date()}
        onChange={(v) => set({ endsAt: toLocalInput(v) })}
        error={errors.endsAt}
      />
      <SwitchRow
        label="마감 직전 자동 연장"
        description="종료 30초 안에 입찰이 있으면 30초 연장돼요 (최대 30분)"
        value={a.autoExtend}
        onChange={(v) => set({ autoExtend: v })}
      />
      <Field
        label="경매 안내 (선택)"
        multiline
        maxLength={2000}
        value={a.description}
        onChangeText={(v) => set({ description: v })}
        placeholder="예) 낙찰 후 전문 운송으로 발송합니다."
        style={styles.area}
      />
    </>
  );
}

export function DetailFields({ d, set, errors }: { d: ProductDraft; set: Set; errors: Errors }) {
  return (
    <>
      <Field
        label="작품 설명"
        multiline
        maxLength={5000}
        value={d.description}
        onChangeText={(v) => set('description', v)}
        placeholder="작품의 이야기, 소장 경위, 특징을 적어주세요."
        style={styles.area}
        error={errors.description}
      />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Field
            label="시대"
            maxLength={50}
            value={d.era}
            onChangeText={(v) => set('era', v)}
            placeholder="예) 조선 후기"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label="제작 연도"
            keyboardType="number-pad"
            maxLength={5}
            value={d.productionYear}
            onChangeText={(v) => set('productionYear', v.replace(/[^\d-]/g, ''))}
            error={errors.productionYear}
          />
        </View>
      </View>
      <Field
        label="소재 · 기법"
        maxLength={100}
        value={d.material}
        onChangeText={(v) => set('material', v)}
        placeholder="예) 캔버스에 유채"
      />
      <View style={styles.row}>
        {(['widthCm', 'heightCm', 'depthCm'] as const).map((k, i) => (
          <View key={k} style={{ flex: 1 }}>
            <Field
              label={['가로 (cm)', '세로 (cm)', '깊이 (cm)'][i]!}
              keyboardType="decimal-pad"
              maxLength={8}
              value={d[k]}
              onChangeText={(v) => set(k, v.replace(/[^\d.]/g, ''))}
              error={errors[k]}
            />
          </View>
        ))}
      </View>
      <SelectField
        label="상태"
        value={d.condition}
        onChange={(v) => set('condition', v)}
        options={ITEM_CONDITIONS.map((c) => ({ value: c, label: CONDITION_LABEL[c] }))}
      />
      <Field
        label="상태 설명"
        multiline
        maxLength={1000}
        value={d.conditionNote}
        onChangeText={(v) => set('conditionNote', v)}
        hint="손상·복원 이력이 있다면 꼭 적어주세요."
        style={styles.area}
      />
      <Field
        label="거래 지역"
        maxLength={50}
        value={d.region}
        onChangeText={(v) => set('region', v)}
        placeholder="예) 서울 종로구"
      />
    </>
  );
}

export function AuthenticityFields({ d, set, errors }: { d: ProductDraft; set: Set; errors: Errors }) {
  return (
    <>
      <RadioList
        label="인증서"
        value={d.hasCertificate ? 'yes' : 'no'}
        onChange={(v) => set('hasCertificate', v === 'yes')}
        options={[
          { value: 'no', label: '인증서 없음' },
          {
            value: 'yes',
            label: '감정서·인증서 있음',
            description: '운영팀 검수 후 “플랫폼 검수 완료”가 표시돼요',
          },
        ]}
      />
      {d.hasCertificate && (
        <>
          <Field
            label="발급 기관"
            value={d.certIssuer}
            onChangeText={(v) => set('certIssuer', v)}
            error={errors['certificate.issuer']}
          />
          <Field
            label="인증서 번호"
            value={d.certNumber}
            onChangeText={(v) => set('certNumber', v)}
            error={errors['certificate.number']}
          />
          <DateTimeField
            label="발급일"
            mode="date"
            value={toDate(d.certIssuedAt)}
            onChange={(v) => set('certIssuedAt', toLocalInput(v).slice(0, 10))}
          />
          <Field label="비고" value={d.certNote} onChangeText={(v) => set('certNote', v)} />
        </>
      )}
      <Text variant="label">출처 · 전시 · 출판 이력</Text>
      {d.provenance.map((v, i) => {
        const patch = (p: Partial<(typeof d.provenance)[number]>) =>
          set(
            'provenance',
            d.provenance.map((x, j) => (j === i ? { ...x, ...p } : x)),
          );
        return (
          <View key={i} style={styles.prov}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <SelectField
                  label="종류"
                  value={v.kind}
                  onChange={(kind) => patch({ kind })}
                  options={PROVENANCE_KINDS.map((k) => ({ value: k, label: PROVENANCE_KIND_LABEL[k] }))}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="시기"
                  maxLength={50}
                  value={v.period}
                  onChangeText={(period) => patch({ period })}
                  placeholder="예) 1998"
                />
              </View>
            </View>
            <Field
              label="내용"
              maxLength={200}
              value={v.title}
              onChangeText={(title) => patch({ title })}
              placeholder="예) 국립현대미술관 소장"
            />
            <Button
              title="이 이력 삭제"
              size="sm"
              variant="ghost"
              onPress={() =>
                set(
                  'provenance',
                  d.provenance.filter((_, j) => j !== i),
                )
              }
            />
          </View>
        );
      })}
      {d.provenance.length < 20 && (
        <Button
          title="+ 이력 추가"
          variant="outline"
          onPress={() => set('provenance', [...d.provenance, { kind: 'OWNERSHIP', period: '', title: '' }])}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  area: { minHeight: 110, textAlignVertical: 'top', paddingTop: 10 },
  switch: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  prov: { gap: 8, paddingBottom: 8 },
});
