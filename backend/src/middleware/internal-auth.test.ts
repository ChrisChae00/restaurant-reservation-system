import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../env.js', () => ({ env: { BACKEND_INTERNAL_SECRET: 'a-very-secret-value-123456' } }));

const { internalAuth } = await import('./internal-auth.js');

function mockReqRes(headerValue: string | undefined) {
  const req = { header: (name: string) => (name === 'x-internal-secret' ? headerValue : undefined) } as never;
  const json = vi.fn();
  const res = { status: vi.fn(() => ({ json })) } as never;
  const next = vi.fn();
  return { req, res, next, json, status: (res as { status: ReturnType<typeof vi.fn> }).status };
}

describe('internalAuth', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a missing secret header', () => {
    const { req, res, next, status } = mockReqRes(undefined);
    internalAuth(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a wrong secret', () => {
    const { req, res, next, status } = mockReqRes('wrong-secret-value');
    internalAuth(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a secret of different length (no early-return timing leak path)', () => {
    const { req, res, next, status } = mockReqRes('short');
    internalAuth(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts the correct secret', () => {
    const { req, res, next, status } = mockReqRes('a-very-secret-value-123456');
    internalAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
  });
});
