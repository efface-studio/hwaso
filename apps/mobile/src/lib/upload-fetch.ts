import { Platform } from 'react-native';

/** 응답 헤더 문자열("a: b\r\nc: d") → Headers */
function parseHeaders(raw: string): Headers {
  const headers = new Headers();
  for (const line of raw.trim().split(/[\r\n]+/)) {
    const i = line.indexOf(':');
    if (i > 0) headers.append(line.slice(0, i).trim(), line.slice(i + 1).trim());
  }
  return headers;
}

/** XMLHttpRequest 로 보내고 fetch 와 같은 Response 를 돌려준다 */
function xhrFetch(url: string, init: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(init.method ?? 'GET', url);
    new Headers(init.headers).forEach((value, key) => xhr.setRequestHeader(key, value));
    xhr.onload = () => {
      // 204 등 본문이 없어야 하는 응답에 빈 문자열을 넣으면 Response 생성자가 예외를 던진다
      const body = [204, 205, 304].includes(xhr.status) ? null : xhr.responseText;
      resolve(new Response(body, { status: xhr.status, headers: parseHeaders(xhr.getAllResponseHeaders()) }));
    };
    xhr.onerror = () => reject(new TypeError('Network request failed'));
    xhr.ontimeout = () => reject(new TypeError('Network request timed out'));
    const signal = init.signal;
    if (signal) {
      if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
      signal.addEventListener('abort', () => {
        xhr.abort();
        reject(new DOMException('Aborted', 'AbortError'));
      });
    }
    xhr.send(init.body as XMLHttpRequestBodyInit);
  });
}

/**
 * Expo SDK 57 의 전역 fetch(expo/fetch)는 React Native 식 FormData 파일({ uri, name, type })을 보내지 못해
 * 요청을 만들다 실패한다 (사진 업로드가 '네트워크 오류'). 파일을 담은 FormData 만 XMLHttpRequest 로 보낸다 —
 * RN 의 XHR 은 파일 uri 를 읽어 multipart 로 보낸다. 나머지 요청은 그대로 전역 fetch.
 */
export const uploadAwareFetch: typeof fetch = (input, init) => {
  if (Platform.OS !== 'web' && init?.body instanceof FormData) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return xhrFetch(url, init);
  }
  return globalThis.fetch(input, init);
};
