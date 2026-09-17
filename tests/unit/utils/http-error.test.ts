import { HttpError } from '../../../src/utils/http-error';

describe('HttpError', () => {
  it('keeps the HTTP status and optional details', () => {
    const error = new HttpError(400, 'Invalid request', { field: 'name' });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('HttpError');
    expect(error.status).toBe(400);
    expect(error.message).toBe('Invalid request');
    expect(error.details).toEqual({ field: 'name' });
  });

  it('does not add details when they are omitted', () => {
    expect(Object.hasOwn(new HttpError(404, 'Not found'), 'details')).toBe(false);
  });
});