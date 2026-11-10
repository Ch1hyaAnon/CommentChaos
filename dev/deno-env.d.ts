// Minimal declarations for the repository's Node-based Function type-check fallback.
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): unknown;
  serve(options: { hostname: string; port: number }, handler: (request: Request) => Response | Promise<Response>): unknown;
};
