import { jsonResponse } from '../_lib/utils.js';
import { apiMessages } from '../_lib/messages.js';

export function onRequest() {
    return jsonResponse({ error: apiMessages.notFound }, 404);
}
