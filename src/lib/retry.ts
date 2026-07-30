export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  context = 'Operation',
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxAttempts) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  const message = lastError?.message || 'Unknown error';
  const error = new Error(
    `${context} failed after ${maxAttempts} attempts: ${message}`,
  ) as Error & { originalError?: Error };
  if (lastError) {
    error.originalError = lastError;
  }
  throw error;
}
