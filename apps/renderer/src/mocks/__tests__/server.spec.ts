import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { server } from '../server';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('mock server', () => {
  it('intercepts requests with a runtime handler', async () => {
    server.use(http.get('https://invoice-builder.test/msw-check', () => HttpResponse.json({ mocked: true })));

    const response = await fetch('https://invoice-builder.test/msw-check');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mocked: true });
  });
});
