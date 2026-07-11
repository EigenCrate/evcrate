import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 1,
  duration: '10s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

export default function () {
  const baseUrl = __ENV.BASE_URL || 'http://127.0.0.1:4173';
  const response = http.get(baseUrl);

  check(response, {
    'status is 200': (res) => res.status === 200,
    'serves demo app': (res) => res.body.includes('Simple web testing demo'),
  });
}