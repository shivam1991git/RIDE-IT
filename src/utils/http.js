class HttpError extends Error {
    constructor(status, message, code, details) {
        super(message);
        this.status = status;
        this.code = code || defaultCode(status);
        this.details = details;
    }
}

function defaultCode(status) {
    return {
        400: 'bad_request',
        401: 'unauthorized',
        402: 'payment_required',
        403: 'forbidden',
        404: 'not_found',
        409: 'conflict',
        422: 'unprocessable',
        429: 'rate_limited',
        503: 'unavailable',
    }[status] || 'error';
}

const badRequest = (message, details) => new HttpError(400, message, 'bad_request', details);
const unauthorized = (message = 'Please sign in to continue') => new HttpError(401, message);
const forbidden = (message = 'You do not have permission for this action') => new HttpError(403, message);
const notFound = (message = 'Not found') => new HttpError(404, message);
const conflict = (message, code = 'conflict') => new HttpError(409, message, code);

// Express 4 does not forward rejected promises to the error handler.
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function paginate(query) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 20));
    return { page, limit, skip: (page - 1) * limit };
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
    HttpError,
    badRequest,
    unauthorized,
    forbidden,
    notFound,
    conflict,
    asyncHandler,
    paginate,
    escapeRegex,
};
