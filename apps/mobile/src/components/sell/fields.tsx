import {
  ITEM_CONDITIONS,
  PROVENANCE_KINDS,
  suggestIncrement,
  toLocalInput,
  type AuctionDraft,
  type CategoryNode,
  type ProductDraft,
} from '@shop/shared';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { DateTimeField, PriceField, SelectField } from '@/components/ui/inputs';
import { RadioList } from '@/components/ui/radio';
import { Text } from '@/components/ui/text';
import { formatNumber, formatPrice } from '@/i18n/format';
import { label } from '@/i18n/labels';
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
  const { t: tr } = useTranslation(['sell', 'common']);
  const options = categories.flatMap((g) =>
    g.children.map((c) => ({ value: c.id, label: `${g.name} › ${c.name}` })),
  );
  return (
    <>
      <Field
        label={tr('basic.title')}
        maxLength={100}
        value={d.title}
        onChangeText={(v) => set('title', v)}
        placeholder={tr('basic.titlePlaceholder')}
        error={errors.title}
      />
      <SelectField
        label={tr('basic.category')}
        value={d.categoryId}
        onChange={(v) => set('categoryId', v)}
        options={options}
        placeholder={tr('basic.categoryPlaceholder')}
        error={errors.categoryId}
      />
      <Field
        label={tr('basic.artist')}
        maxLength={100}
        value={d.artistName}
        onChangeText={(v) => set('artistName', v)}
        placeholder={tr('basic.artistPlaceholder')}
        hint={tr('basic.artistHint')}
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
  const { t: tr } = useTranslation(['sell', 'common']);
  return (
    <>
      {!lockSaleType && (
        <RadioList
          label={tr('pricing.saleType')}
          value={d.saleType}
          onChange={(v) => set('saleType', v)}
          options={[
            {
              value: 'FIXED',
              label: label('saleType', 'FIXED'),
              description: tr('pricing.saleTypeHint.FIXED'),
            },
            {
              value: 'AUCTION',
              label: label('saleType', 'AUCTION'),
              description: tr('pricing.saleTypeHint.AUCTION'),
            },
            {
              value: 'RESERVATION',
              label: label('saleType', 'RESERVATION'),
              description: tr('pricing.saleTypeHint.RESERVATION'),
            },
          ]}
        />
      )}
      {d.saleType !== 'AUCTION' && (
        <PriceField
          label={tr('pricing.price')}
          value={d.price}
          onChange={(v) => set('price', v)}
          error={errors.price}
        />
      )}
      {d.saleType === 'RESERVATION' && (
        <DateTimeField
          label={tr('pricing.availableAt')}
          value={toDate(d.availableAt)}
          minimumDate={new Date()}
          onChange={(v) => set('availableAt', toLocalInput(v))}
          error={errors.availableAt}
        />
      )}
      {d.saleType === 'AUCTION' && (
        <Text variant="small" color="muted">
          {tr('pricing.auctionNext')}
        </Text>
      )}
      <PriceField
        label={tr('pricing.shippingFee')}
        value={d.shippingFee}
        onChange={(v) => set('shippingFee', v)}
        hint={tr('pricing.shippingFeeHint')}
      />
      <Field
        label={tr('pricing.shippingMethod')}
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
  const { t: tr } = useTranslation(['sell', 'common']);
  const suggested = a.startPrice ? suggestIncrement(a.startPrice) : null;
  return (
    <>
      <PriceField
        label={tr('auctionFields.startPrice')}
        value={a.startPrice}
        onChange={(v) => set({ startPrice: v })}
        error={errors.startPrice}
      />
      <PriceField
        label={tr('auctionFields.bidIncrement')}
        value={a.bidIncrement}
        onChange={(v) => set({ bidIncrement: v })}
        placeholder={suggested ? formatNumber(suggested) : undefined}
        hint={
          suggested
            ? tr('auctionFields.suggested', { price: formatPrice(suggested) })
            : tr('auctionFields.bidIncrementHint')
        }
        error={errors.bidIncrement}
      />
      <PriceField
        label={tr('auctionFields.buyNowPrice')}
        value={a.buyNowPrice}
        onChange={(v) => set({ buyNowPrice: v })}
        hint={tr('auctionFields.buyNowHint')}
        error={errors.buyNowPrice}
      />
      <DateTimeField
        label={tr('auctionFields.startsAt')}
        value={toDate(a.startsAt)}
        minimumDate={new Date()}
        onChange={(v) => set({ startsAt: toLocalInput(v) })}
        error={errors.startsAt}
      />
      <DateTimeField
        label={tr('auctionFields.endsAt')}
        value={toDate(a.endsAt)}
        minimumDate={toDate(a.startsAt) ?? new Date()}
        onChange={(v) => set({ endsAt: toLocalInput(v) })}
        error={errors.endsAt}
      />
      <SwitchRow
        label={tr('auctionFields.autoExtend')}
        description={tr('auctionFields.autoExtendHint')}
        value={a.autoExtend}
        onChange={(v) => set({ autoExtend: v })}
      />
      <Field
        label={tr('auctionFields.note')}
        multiline
        maxLength={2000}
        value={a.description}
        onChangeText={(v) => set({ description: v })}
        placeholder={tr('auctionFields.notePlaceholder')}
        style={styles.area}
      />
    </>
  );
}

export function DetailFields({ d, set, errors }: { d: ProductDraft; set: Set; errors: Errors }) {
  const { t: tr } = useTranslation(['sell', 'common']);
  return (
    <>
      <Field
        label={tr('detail.description')}
        multiline
        maxLength={5000}
        value={d.description}
        onChangeText={(v) => set('description', v)}
        placeholder={tr('detail.descriptionPlaceholder')}
        style={styles.area}
        error={errors.description}
      />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Field
            label={tr('detail.era')}
            maxLength={50}
            value={d.era}
            onChangeText={(v) => set('era', v)}
            placeholder={tr('detail.eraPlaceholder')}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label={tr('detail.year')}
            keyboardType="number-pad"
            maxLength={5}
            value={d.productionYear}
            onChangeText={(v) => set('productionYear', v.replace(/[^\d-]/g, ''))}
            error={errors.productionYear}
          />
        </View>
      </View>
      <Field
        label={tr('detail.material')}
        maxLength={100}
        value={d.material}
        onChangeText={(v) => set('material', v)}
        placeholder={tr('detail.materialPlaceholder')}
      />
      <View style={styles.row}>
        {(['widthCm', 'heightCm', 'depthCm'] as const).map((k, i) => (
          <View key={k} style={{ flex: 1 }}>
            <Field
              label={[tr('detail.width'), tr('detail.height'), tr('detail.depth')][i]!}
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
        label={tr('detail.condition')}
        value={d.condition}
        onChange={(v) => set('condition', v)}
        options={ITEM_CONDITIONS.map((c) => ({ value: c, label: label('condition', c) }))}
      />
      <Field
        label={tr('detail.conditionNote')}
        multiline
        maxLength={1000}
        value={d.conditionNote}
        onChangeText={(v) => set('conditionNote', v)}
        hint={tr('detail.conditionNoteHint')}
        style={styles.area}
      />
      <Field
        label={tr('detail.region')}
        maxLength={50}
        value={d.region}
        onChangeText={(v) => set('region', v)}
        placeholder={tr('detail.regionPlaceholder')}
      />
    </>
  );
}

export function AuthenticityFields({ d, set, errors }: { d: ProductDraft; set: Set; errors: Errors }) {
  const { t: tr } = useTranslation(['sell', 'common']);
  return (
    <>
      <RadioList
        label={tr('authenticity.certificate')}
        value={d.hasCertificate ? 'yes' : 'no'}
        onChange={(v) => set('hasCertificate', v === 'yes')}
        options={[
          { value: 'no', label: tr('authenticity.none') },
          {
            value: 'yes',
            label: tr('authenticity.has'),
            description: tr('authenticity.hasHint', { verified: label('verification', 'VERIFIED') }),
          },
        ]}
      />
      {d.hasCertificate && (
        <>
          <Field
            label={tr('authenticity.issuer')}
            value={d.certIssuer}
            onChangeText={(v) => set('certIssuer', v)}
            error={errors['certificate.issuer']}
          />
          <Field
            label={tr('authenticity.number')}
            value={d.certNumber}
            onChangeText={(v) => set('certNumber', v)}
            error={errors['certificate.number']}
          />
          <DateTimeField
            label={tr('authenticity.issuedAt')}
            mode="date"
            value={toDate(d.certIssuedAt)}
            onChange={(v) => set('certIssuedAt', toLocalInput(v).slice(0, 10))}
          />
          <Field
            label={tr('authenticity.note')}
            value={d.certNote}
            onChangeText={(v) => set('certNote', v)}
          />
        </>
      )}
      <Text variant="label">{tr('authenticity.provenance')}</Text>
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
                  label={tr('authenticity.kind')}
                  value={v.kind}
                  onChange={(kind) => patch({ kind })}
                  options={PROVENANCE_KINDS.map((k) => ({ value: k, label: label('provenanceKind', k) }))}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label={tr('authenticity.period')}
                  maxLength={50}
                  value={v.period}
                  onChangeText={(period) => patch({ period })}
                  placeholder={tr('authenticity.periodPlaceholder')}
                />
              </View>
            </View>
            <Field
              label={tr('authenticity.entry')}
              maxLength={200}
              value={v.title}
              onChangeText={(title) => patch({ title })}
              placeholder={tr('authenticity.entryPlaceholder')}
            />
            <Button
              title={tr('authenticity.remove')}
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
          title={tr('authenticity.add')}
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
