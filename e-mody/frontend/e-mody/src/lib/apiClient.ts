
import axios from 'axios';
import ApiConfig from '@/lib/ApiConfig';

export function createApiClient() {
  const base = ApiConfig.getBaseUrl();
  return axios.create({
    baseURL: base,
    withCredentials: true,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });
}
