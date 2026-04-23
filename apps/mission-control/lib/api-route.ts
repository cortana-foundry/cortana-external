import { NextResponse } from "next/server";

const NO_STORE_HEADERS = {
  "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
};

type ApiStatus = number;

export class ApiError extends Error {
  readonly status: ApiStatus;
  readonly details?: unknown;

  constructor(message: string, status: ApiStatus, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

type ApiRouteContext<TParams = unknown> = {
  request: Request;
  params: TParams;
  url: URL;
};

type JsonRouteOptions<TParams, TResult> = {
  noStore?: boolean;
  errorMessage?: string;
  errorResponse?: (error: unknown) => Response | null;
  handler: (context: ApiRouteContext<TParams>) => Promise<TResult> | TResult;
};

type JsonBodyRouteOptions<TParams, TBody, TResult> = Omit<
  JsonRouteOptions<TParams, TResult>,
  "handler"
> & {
  handler: (context: ApiRouteContext<TParams> & { body: TBody }) => Promise<TResult> | TResult;
};

const toResponseInit = (status?: ApiStatus, noStore?: boolean): ResponseInit => ({
  ...(status ? { status } : {}),
  ...(noStore ? { headers: NO_STORE_HEADERS } : {}),
});

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export const apiJson = <T>(payload: T, options?: { status?: ApiStatus; noStore?: boolean }) =>
  NextResponse.json(payload, toResponseInit(options?.status, options?.noStore));

export const apiError = (
  error: unknown,
  options?: { fallback?: string; status?: ApiStatus; noStore?: boolean },
) => {
  if (error instanceof ApiError) {
    const payload =
      error.details === undefined
        ? { error: error.message }
        : { error: error.message, details: error.details };
    return apiJson(payload, { status: error.status, noStore: options?.noStore });
  }

  return apiJson(
    { error: errorMessage(error, options?.fallback ?? "Internal server error") },
    { status: options?.status ?? 500, noStore: options?.noStore },
  );
};

export const apiStatusError = (message: string, status: ApiStatus, details?: unknown) => {
  throw new ApiError(message, status, details);
};

export function jsonRoute<TParams = unknown, TResult = unknown>(
  options: JsonRouteOptions<TParams, TResult>,
) {
  return async (request: Request, context?: { params?: TParams | Promise<TParams> }) => {
    try {
      const params = (await context?.params) as TParams;
      const payload = await options.handler({
        request,
        params,
        url: new URL(request.url),
      });
      if (payload instanceof Response) return payload;
      return apiJson(payload, { noStore: options.noStore });
    } catch (error) {
      const response = options.errorResponse?.(error);
      if (response) return response;
      return apiError(error, { fallback: options.errorMessage, noStore: options.noStore });
    }
  };
}

export function jsonBodyRoute<TParams = unknown, TBody = unknown, TResult = unknown>(
  options: JsonBodyRouteOptions<TParams, TBody, TResult>,
) {
  return jsonRoute<TParams, TResult>({
    ...options,
    handler: async (context) => {
      let body: TBody;
      try {
        body = (await context.request.json()) as TBody;
      } catch {
        throw new ApiError("Invalid JSON body", 400);
      }
      return options.handler({ ...context, body });
    },
  });
}
