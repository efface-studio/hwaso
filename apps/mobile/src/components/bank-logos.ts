import type { ImageSourcePropType } from 'react-native';
import l031 from '../../assets/banks/031.png';
import l035 from '../../assets/banks/035.png';
import l045 from '../../assets/banks/045.png';
import l050 from '../../assets/banks/050.png';
import l064 from '../../assets/banks/064.png';
import l004 from '../../assets/banks/004.png';
import l088 from '../../assets/banks/088.png';
import l020 from '../../assets/banks/020.png';
import l081 from '../../assets/banks/081.png';
import l011 from '../../assets/banks/011.png';
import l012 from '../../assets/banks/012.png';
import l003 from '../../assets/banks/003.png';
import l090 from '../../assets/banks/090.png';
import l092 from '../../assets/banks/092.png';
import l089 from '../../assets/banks/089.png';
import l023 from '../../assets/banks/023.png';
import l027 from '../../assets/banks/027.png';
import l002 from '../../assets/banks/002.png';
import l007 from '../../assets/banks/007.png';
import l030 from '../../assets/banks/030.png';
import l032 from '../../assets/banks/032.png';
import l039 from '../../assets/banks/039.png';
import l034 from '../../assets/banks/034.png';
import l037 from '../../assets/banks/037.png';
import l071 from '../../assets/banks/071.png';
import l048 from '../../assets/banks/048.png';
import l054 from '../../assets/banks/054.png';
import l055 from '../../assets/banks/055.png';
import l057 from '../../assets/banks/057.png';
import l060 from '../../assets/banks/060.png';
import l061 from '../../assets/banks/061.png';
import l059 from '../../assets/banks/059.png';
import l058 from '../../assets/banks/058.png';
import l062 from '../../assets/banks/062.png';
import l063 from '../../assets/banks/063.png';
import l067 from '../../assets/banks/067.png';

/**
 * 은행 로고 (금융결제원 은행 코드 → 이미지). 각 로고는 해당 은행의 상표이며, 은행 선택 화면에서 식별용으로만 쓴다.
 * 이미지 출처: 국내 은행·상호금융은 Figma 파일 「대한민국 은행·카드사 로고 모음」의 컴포넌트(original, 없으면 mono)에서
 * 흰 둥근 타일·테두리를 빼고 심볼만 내보냈다. 해외 은행·저축은행·산림조합은 Wikimedia Commons · English Wikipedia ·
 * 각 기관 공식 홈페이지의 로고 이미지 (출처는 아래 주석).
 * 모두 256×256 투명 PNG 에 심볼을 228px 안으로 가운데 맞췄다 (심볼이 따로 없는 곳 — 씨티·BNK·케이뱅크·미즈호 — 은 워드마크,
 * 카카오뱅크는 노란 둥근 사각형까지가 심볼). 같은 그룹은 심볼을 함께 쓴다 (신한·제주, 부산·경남, 광주·전북, 수협, 농협).
 * 목록에 없는 은행이 생기면 BankLogo 가 대표 색 배지로 대신한다.
 */
export const BANK_LOGOS: Record<string, ImageSourcePropType> = {
  '004': l004, // Figma: 대한민국 은행·카드사 로고 모음 (KB국민은행/original)
  '088': l088, // Figma: 대한민국 은행·카드사 로고 모음 (신한, 제주은행/original)
  '020': l020, // Figma: 대한민국 은행·카드사 로고 모음 (우리은행/original)
  '081': l081, // Figma: 대한민국 은행·카드사 로고 모음 (KEB하나은행/original)
  '011': l011, // Figma: 대한민국 은행·카드사 로고 모음 (NH농협은행)
  '012': l012, // Figma: 대한민국 은행·카드사 로고 모음 (NH농협은행)
  '003': l003, // Figma: 대한민국 은행·카드사 로고 모음 (IBK기업은행/original)
  '090': l090, // Figma: 대한민국 은행·카드사 로고 모음 (카카오뱅크/original)
  '092': l092, // Figma: 대한민국 은행·카드사 로고 모음 (토스뱅크/original)
  '089': l089, // Figma: 대한민국 은행·카드사 로고 모음 (케이뱅크/original)
  '023': l023, // Figma: 대한민국 은행·카드사 로고 모음 (SC제일은행/original)
  '027': l027, // Figma: 대한민국 은행·카드사 로고 모음 (시티은행/original)
  '002': l002, // Figma: 대한민국 은행·카드사 로고 모음 (KDB산업은행/original)
  '007': l007, // Figma: 대한민국 은행·카드사 로고 모음 (수협은행)
  '030': l030, // Figma: 대한민국 은행·카드사 로고 모음 (수협은행)
  '032': l032, // Figma: 대한민국 은행·카드사 로고 모음 (경남, 부산은행/original)
  '039': l039, // Figma: 대한민국 은행·카드사 로고 모음 (경남, 부산은행/original)
  '034': l034, // Figma: 대한민국 은행·카드사 로고 모음 (광주, 전북은행/original)
  '037': l037, // Figma: 대한민국 은행·카드사 로고 모음 (광주, 전북은행/original)
  '071': l071, // Figma: 대한민국 은행·카드사 로고 모음 (우체국/mono)
  '048': l048, // Figma: 대한민국 은행·카드사 로고 모음 (신협/mono)
  '054': l054, // commons: HSBC logo (2018).svg
  '055': l055, // commons: Deutsche Bank logo without wordmark.svg
  '057': l057, // commons: Chase logo 2007.svg
  '060': l060, // commons: Bank of America logo.svg
  '061': l061, // commons: BNP Paribas logo.svg
  '059': l059, // commons: Mitsubishi UFJ logo.svg
  '058': l058, // commons: Mizuho bank logo.svg
  '062': l062, // en.wikipedia: Industrial and Commercial Bank of China logo.svg
  '063': l063, // commons: Bank of China symbol.svg
  '067': l067, // en.wikipedia: China Construction Bank.svg
  '031': l031, // Figma: 대한민국 은행·카드사 로고 모음 (iM뱅크/original)
  '035': l035, // Figma: 대한민국 은행·카드사 로고 모음 (신한, 제주은행/original)
  '045': l045, // Figma: 대한민국 은행·카드사 로고 모음 (MG새마을금고/mono)
  '050': l050, // 공식 사이트: www.fsb.or.kr 저축은행중앙회 로고
  '064': l064, // 공식 사이트: www.nfcf.or.kr 산림조합중앙회 로고
};

/** 짙은 남색 글자 로고 — 다크 모드에서는 흰 바탕을 깔아야 보인다 */
export const DARK_INK_LOGOS = new Set(['027', '089']);
