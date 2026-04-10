export default defineEventHandler((event) => {
  const url = getRequestURL(event);

  // Only protect /api/ routes
  if (!url.pathname.startsWith('/api/')) {
    return;
  }

  const config = useRuntimeConfig();
  const apiKey = config.apiKey;

  if (!apiKey) {
    throw createError({ statusCode: 500, message: 'API_KEY is not configured' });
  }

  const requestApiKey = getHeader(event, 'x-api-key');

  if (requestApiKey !== apiKey) {
    throw createError({ statusCode: 401, message: 'Unauthorized: Invalid or missing API key' });
  }
});
