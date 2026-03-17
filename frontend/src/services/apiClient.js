import { API_CONFIG } from '@/config/api.config';

class ApiClient {
  constructor() {
    // ✅ Store the full config, access services by key in request()
    this.config  = API_CONFIG;
    this.timeout = 10000;
  }

  async request(service, endpoint, options = {}) {
    const baseURL = this.config.services[service];
    if (!baseURL) throw new Error(`Unknown service: "${service}"`);

    const url = `${baseURL}${endpoint}`;
    const config = {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      signal: AbortSignal.timeout(this.timeout),
      ...options,
    };

    const response = await fetch(url, config);

    // ✅ Parse body regardless of status so we can read the error message
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(`Server returned non-JSON response (${response.status})`);
    }

    if (!response.ok) {
      // ✅ Expose the server's actual error message, not just the status code
      const message = data?.error ?? data?.message ?? `Request failed (${response.status})`;
      const err = new Error(message);
      err.status = response.status;
      throw err;
    }

    return data;
  }

  // ✅ Unified auth method — method defaults to POST, can be overridden
  async auth(endpoint, data = {}, method = 'POST', token = null) {
    const options = {
      method,
      ...(method !== 'GET' && { body: JSON.stringify(data) }),
      ...(token && { headers: { 'Authorization': `Bearer ${token}` } }),
    };
    return this.request('userService', `/api/auth${endpoint}`, options);
  }

  async user(endpoint, data = {}, method = 'GET', token = null) {
    const options = {
      method,
      ...(method !== 'GET' && { body: JSON.stringify(data) }),
      ...(token && { headers: { 'Authorization': `Bearer ${token}` } }),
    };
    return this.request('userService', `/api/users${endpoint}`, options);
  }
}

export const apiClient = new ApiClient();
export default apiClient;