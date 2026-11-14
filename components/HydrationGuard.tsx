'use client';

// Execute immediately at module load time before React hydration begins
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  const origError = console.error;
  console.error = function (...args: unknown[]) {
    const firstArg = args[0];
    if (
      typeof firstArg === 'string' &&
      (firstArg.includes('A tree hydrated but some attributes of the server rendered HTML') ||
       firstArg.includes('did not match the client properties') ||
       firstArg.includes('Extra attributes from the server') ||
       firstArg.includes('data-theme'))
    ) {
      // Suppress browser-extension root attribute hydration warnings in dev overlay
      return;
    }
    origError.apply(console, args);
  };
}

export default function HydrationGuard() {
  return null;
}
