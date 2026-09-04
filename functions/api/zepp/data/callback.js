import { callbackResponse } from '../../../../server/zepp/callback-response.js';

export function onRequest({ request }) {
  if (request.method === 'POST' || (
    (request.method === 'GET' || request.method === 'HEAD') && new URL(request.url).search
  )) {
    // Do not acknowledge delivery before authenticated durable ingestion exists.
    // Deliberately leave the body unread; no health data is parsed or persisted.
    return callbackResponse(request, {
      error: 'data_ingestion_not_enabled',
      message: 'ZeppBridge data ingestion is not enabled yet. No data was accepted.',
    }, 503, { 'Retry-After': '3600' });
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return callbackResponse(request, { error: 'method_not_allowed' }, 405, {
      Allow: 'GET, HEAD, POST',
    });
  }

  return callbackResponse(request, {
    service: 'ZeppBridge',
    endpoint: 'data_callback',
    status: 'registration_only',
    dataIngestionEnabled: false,
    message: 'Callback endpoint is deployed. Zepp data ingestion is not enabled yet.',
  });
}
