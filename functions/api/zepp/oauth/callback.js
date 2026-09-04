import { callbackResponse } from '../../../../server/zepp/callback-response.js';

export function onRequest({ request }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return callbackResponse(request, { error: 'method_not_allowed' }, 405, {
      Allow: 'GET, HEAD',
    });
  }

  // A bare URL is a reachability check, not an authorization attempt.
  // Until the full state/session + token-exchange flow exists, reject ALL
  // callback parameters. Do not read env, exchange codes, redirect, or log them.
  if (new URL(request.url).search) {
    return callbackResponse(request, {
      error: 'oauth_not_enabled',
      message: 'ZeppBridge authorization is not enabled yet. No authorization was completed. Please close this page.',
    }, 503, { 'Retry-After': '3600' });
  }

  return callbackResponse(request, {
    service: 'ZeppBridge',
    endpoint: 'authorization_callback',
    status: 'registration_only',
    oauthEnabled: false,
    message: 'Callback endpoint is deployed. Zepp authorization is not enabled yet.',
  });
}
