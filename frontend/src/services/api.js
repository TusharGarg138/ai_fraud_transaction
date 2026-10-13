const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
async function request(path, options) {
  const res = await fetch(`${API}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export const api = {
  overview: () => request('/analytics/overview'),
  trends: () => request('/analytics/trends'),
  cases: () => request('/cases'),
  caseDetail: id => request(`/cases/${id}`),
  transactions: () => request('/transactions'),
  predict: data => request('/predict', { method: 'POST', body: JSON.stringify(data) }),
  action: (id, data) => request(`/cases/${id}/action`, { method: 'POST', body: JSON.stringify(data) }),
};
