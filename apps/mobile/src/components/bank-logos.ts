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
 * 이미지 출처: Wikimedia Commons · English Wikipedia 의 로고 파일을 가로 330px PNG 로 받은 것, 위키에 없는 곳은
 * 각 기관 공식 홈페이지의 로고 이미지 (출처는 아래 주석).
 * 목록에 없는 은행이 생기면 BankLogo 가 대표 색 배지로 대신한다.
 */
export const BANK_LOGOS: Record<string, ImageSourcePropType> = {
  '004': l004, // commons: KB logo.svg
  '088': l088, // commons: Shinhan Bank Logo (ENG).svg
  '020': l020, // commons: Logo of Woori Bank.svg
  '081': l081, // commons: Hana Bank Logo (eng).svg
  '011': l011, // commons: NACF (NongHyup) Logo.svg
  '012': l012, // commons: NACF (NongHyup) Logo.svg
  '003': l003, // commons: Industrial Bank of Korea Logo.svg
  '090': l090, // commons: KakaoBank logo.svg
  '092': l092, // commons: TossBank Logo Primary.png
  '089': l089, // commons: Kbank logo.svg
  '023': l023, // commons: Standard Chartered Logo (2021, Logo only).svg
  '027': l027, // commons: Citi.svg
  '002': l002, // commons: KDB logo.png
  '007': l007, // commons: NFFC (SuHyup) Logo.svg
  '030': l030, // commons: NFFC (SuHyup) Logo.svg
  '032': l032, // commons: BNK Financial Group logo 01.png
  '039': l039, // commons: BNK Financial Group logo 01.png
  '034': l034, // commons: Jbfglogo.png
  '037': l037, // commons: Jbfglogo.png
  '071': l071, // commons: Emblem of Korea Post.svg
  '048': l048, // commons: 신협 로고.svg
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
  '031': l031, // 공식 사이트: www.imbank.co.kr 헤더 로고 (ebz_top_dgb_logo_up.gif)
  '035': l035, // 공식 사이트: www.jejubank.co.kr 헤더 로고 (head/logo.png 윗부분)
  '045': l045, // 공식 사이트: www.kfcc.co.kr BI (bi_logo2.png)
  '050': l050, // 공식 사이트: www.fsb.or.kr 저축은행중앙회 로고
  '064': l064, // 공식 사이트: www.nfcf.or.kr 산림조합중앙회 로고
};
